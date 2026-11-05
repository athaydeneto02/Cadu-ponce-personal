import React, { useEffect, useRef, useState } from 'react';
import type { Assessment, Anamnesis, StudentFile, UserProfile, WorkoutFeedback } from '../types';
import { storage } from '../lib/storage';
import { resolveMediaUrl } from '../lib/mediaDb';
import { studentWhatsAppUrl } from '../lib/studentContact';

export type StudentModule = 'assessments' | 'anamneses' | 'files' | 'feedbacks';
const titles = { assessments: 'Avaliações físicas', anamneses: 'Anamneses', files: 'Arquivos do aluno', feedbacks: 'Feedbacks dos treinos' };
const field = 'block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
const button = 'rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50';
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
export const standardQuestions = ['Qual é seu objetivo com os treinos?', 'Pratica atividades físicas? Quais e com que frequência?', 'Possui lesões, dores ou restrições para exercícios?', 'Tem condição de saúde ou usa medicamentos que o treinador precisa conhecer?', 'Qual é sua disponibilidade semanal para treinar?'];
export function newAnamnesis(studentId: string): Anamnesis {
  return { id: crypto.randomUUID(), studentId, title: 'Anamnese inicial', status: 'pending',
    questions: standardQuestions.map(label => ({ id: crypto.randomUUID(), label })), createdAt: new Date().toISOString() };
}

export default function AdminStudentModules({ module, student, users = [] }: {
  module: StudentModule; student?: UserProfile; users?: UserProfile[];
}) {
  const [chosen, setChosen] = useState(student?.uid || '');
  const target = student || users.find(user => user.uid === chosen);
  return <section className="space-y-4 text-slate-900">
    <h3 className="font-bold text-lg">{titles[module]}</h3>
    {!student && module !== 'feedbacks' && <label className="block text-sm">Aluno
      <select className={field} value={chosen} onChange={event => setChosen(event.target.value)}><option value="">Selecione um aluno</option>{users.filter(user => user.role === 'student').map(user => <option key={user.uid} value={user.uid}>{user.name}</option>)}</select>
    </label>}
    {module === 'feedbacks' ? <FeedbackList key={target?.uid || 'all'} student={target} users={users} /> : target ? <StudentRecords key={`${module}:${target.uid}`} module={module} student={target} /> : <p className="text-sm text-slate-500">Selecione um aluno para consultar e atualizar seus registros.</p>}
  </section>;
}

export function StudentRecords({ module, student }: { module: Exclude<StudentModule, 'feedbacks'>; student: UserProfile }) {
  const [items, setItems] = useState<(Assessment | Anamnesis | StudentFile)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Assessment | Anamnesis | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState('');
  const lock = useRef(false);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const rows = module === 'assessments' ? await storage.fetchAssessments(student.uid)
        : module === 'anamneses' ? await storage.fetchAnamneses(student.uid) : await storage.fetchStudentFiles(student.uid);
      if (request === generation.current) setItems(rows);
    } catch (failure) { if (request === generation.current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar os registros.'); }
    finally { if (request === generation.current) setLoading(false); }
  };
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, []);
  const mutate = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar. Seus dados foram mantidos.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    return mutate(async () => {
      if (!draft) return;
      let saved: Assessment | Anamnesis = draft;
      if ('questions' in draft) {
        if (!draft.title.trim() || !draft.questions.length || draft.questions.some(question => !question.label.trim())) throw new Error('Informe o título e pelo menos uma pergunta preenchida.');
        saved = await storage.saveAnamnesis({ ...draft, status: draft.questions.every(question => question.answer?.trim()) ? 'answered' : 'pending' });
      } else {
        if (!draft.date) throw new Error('Informe a data da avaliação.');
        await storage.saveAssessment(draft);
      }
      generation.current++;
      setItems(previous => [saved, ...previous.filter(item => item.id !== saved.id)]); setDraft(null);
    });
  };
  const remove = (record: Assessment | Anamnesis | StudentFile) => {
    if (!window.confirm('Excluir este registro? Essa ação não exclui a conta do aluno.')) return;
    void mutate(async () => {
      if (module === 'assessments') await storage.deleteAssessment(record.id);
      else if (module === 'anamneses') await storage.deleteAnamnesis(record.id);
      else await storage.deleteStudentFile(record.id);
      generation.current++;
      setItems(previous => previous.filter(item => item.id !== record.id));
    });
  };
  const upload = (event: React.FormEvent) => {
    event.preventDefault();
    return mutate(async () => {
      if (!selectedFile) throw new Error('Selecione um arquivo.');
      const uploaded = await storage.uploadStudentFile(student.uid, selectedFile, category.trim() || undefined);
      generation.current++;
      setItems(previous => [uploaded, ...previous.filter(item => item.id !== uploaded.id)]); setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
    });
  };
  const openFile = async (file: StudentFile) => {
    // Open synchronously so browser popup protection does not swallow the resolved private URL.
    const actor = storage.getUser()?.uid;
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await resolveMediaUrl(file.storagePath);
      if (!actor || actor !== storage.getUser()?.uid) throw new Error('A sessão mudou. Entre novamente para abrir o arquivo.');
      if (!url || !/^https?:\/\//i.test(url)) throw new Error('O arquivo não está disponível. Atualize a lista e tente novamente.');
      if (tab) tab.location.href = url;
      else throw new Error('Permita abrir uma nova aba para visualizar o arquivo.');
    } catch (failure) { tab?.close(); setError(failure instanceof Error ? failure.message : 'Não foi possível abrir o arquivo.'); }
  };
  return <div className="space-y-4">
    <button type="button" disabled={loading || busy} onClick={() => void refresh()} className="text-blue-700 text-sm underline">Atualizar lista</button>
    {loading && <p role="status">Carregando registros…</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {module === 'files' ? <form onSubmit={upload} className="rounded-xl bg-white p-4 space-y-3">
      <p className="text-sm">Compartilhe um documento com o aluno. Máximo de 20 MB.</p>
      <label className="block text-sm">Arquivo<input ref={fileInput} type="file" required disabled={busy} onChange={event => setSelectedFile(event.target.files?.[0] || null)} className={field} /></label>
      <label className="block text-sm">Categoria<input value={category} maxLength={80} disabled={busy} onChange={event => setCategory(event.target.value)} className={field} placeholder="Exames, orientações…" /></label>
      <button className={button} disabled={!selectedFile || busy || loading}>{busy ? 'Enviando…' : 'Enviar arquivo'}</button>
    </form> : <button type="button" disabled={busy || loading || !!draft} className={button} onClick={() => setDraft(module === 'anamneses' ? newAnamnesis(student.uid) : { id: crypto.randomUUID(), studentId: student.uid, date: today(), createdAt: new Date().toISOString() })}>{module === 'assessments' ? 'Nova avaliação' : 'Nova anamnese'}</button>}
    {draft && <form onSubmit={save} className="bg-white rounded-xl p-4 space-y-3">
      <fieldset disabled={busy} className="space-y-3">
        {'questions' in draft ? <>
          <label className="text-sm">Título<input required maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} className={field} /></label>
          <p className="text-xs text-slate-500">O aluno responderá estas perguntas no aplicativo. Perguntas já respondidas mantêm as respostas ao editar.</p>
          {draft.questions.map((question, index) => <div key={question.id} className="border rounded p-3 space-y-2"><label className="text-sm">Pergunta {index + 1}<input required value={question.label} maxLength={500} className={field} onChange={event => setDraft({ ...draft, questions: draft.questions.map(item => item.id === question.id ? { ...item, label: event.target.value } : item) })} /></label>{question.answer && <p className="text-sm whitespace-pre-wrap">Resposta: {question.answer}</p>}<button type="button" className="text-red-700 text-xs" onClick={() => setDraft({ ...draft, questions: draft.questions.filter(item => item.id !== question.id) })}>Remover pergunta</button></div>)}
          <button type="button" className="text-blue-700" onClick={() => setDraft({ ...draft, questions: [...draft.questions, { id: crypto.randomUUID(), label: '' }] })}>Adicionar pergunta</button>
        </> : <>
          <label className="text-sm">Data<input type="date" required className={field} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
          {([{ key: 'weight', label: 'Peso (kg)', max: 1000 }, { key: 'height', label: 'Altura (cm)', max: 300 }, { key: 'bodyFat', label: 'Gordura corporal (%)', max: 100 }] as const).map(item => <label key={item.key} className="block text-sm">{item.label}<input type="number" min="0" max={item.max} step="0.1" className={field} value={draft[item.key] ?? ''} onChange={event => setDraft({ ...draft, [item.key]: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>)}
          {['Cintura', 'Quadril', 'Tórax', 'Braço', 'Coxa'].map(label => <label key={label} className="block text-sm">{label} (cm)<input type="number" min="0" max="500" step="0.1" className={field} value={draft.measurements?.[label] ?? ''} onChange={event => { const measurements = { ...draft.measurements }; if (event.target.value === '') delete measurements[label]; else measurements[label] = Number(event.target.value); setDraft({ ...draft, measurements }); }} /></label>)}
          <label className="text-sm">Observações<textarea maxLength={10000} className={field} value={draft.notes || ''} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
        </>}
        <div className="flex gap-3"><button className={button}>{busy ? 'Salvando…' : 'Salvar registro'}</button><button type="button" onClick={() => setDraft(null)}>Cancelar</button></div>
      </fieldset>
    </form>}
    {!loading && !error && !items.length && <p className="text-sm text-slate-500">Nenhum registro cadastrado.</p>}
    {items.map(item => <article key={item.id} className="rounded-xl border bg-white p-4 space-y-2">
      {'storagePath' in item ? <><h4 className="font-semibold break-all">{item.name}</h4><p className="text-xs text-slate-500">{item.category || 'Arquivo'} · {(item.size / 1024 / 1024).toFixed(2)} MB</p><button type="button" className="text-blue-700 underline" onClick={() => void openFile(item)}>Abrir arquivo</button></>
      : 'questions' in item ? <><h4 className="font-semibold">{item.title}</h4><p className="text-xs">{item.status === 'answered' ? 'Respondida' : 'Aguardando resposta do aluno'}</p>{item.questions.map(question => <div key={question.id} className="text-sm"><strong>{question.label}</strong><p className="whitespace-pre-wrap">{question.answer || 'Sem resposta'}</p></div>)}</>
      : <><h4 className="font-semibold">Avaliação de {item.date.split('-').reverse().join('/')}</h4><p className="text-sm">{item.weight !== undefined && `${item.weight} kg · `}{item.height !== undefined && `${item.height} cm · `}{item.bodyFat !== undefined && `${item.bodyFat}% de gordura`}</p>{Object.entries(item.measurements || {}).map(([name, value]) => <p className="text-sm" key={name}>{name}: {value} cm</p>)}<p className="text-sm whitespace-pre-wrap">{item.notes}</p></>}
      <div className="flex gap-4 text-sm">{!('storagePath' in item) && <button disabled={busy || !!draft} onClick={() => setDraft(structuredClone(item))} className="text-blue-700">Editar</button>}<button disabled={busy} onClick={() => remove(item)} className="text-red-700">Excluir</button></div>
    </article>)}
  </div>;
}

function FeedbackList({ student, users }: { student?: UserProfile; users: UserProfile[] }) {
  const [items, setItems] = useState<WorkoutFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = async () => {
    const request = ++generation.current; setLoading(true); setError('');
    try { const data = await storage.fetchWorkoutFeedbacks(student?.uid); if (request === generation.current) setItems(data); }
    catch (failure) { if (request === generation.current) setError(failure instanceof Error ? failure.message : 'Falha ao carregar feedbacks.'); }
    finally { if (request === generation.current) setLoading(false); }
  };
  useEffect(() => { void refresh(); const onFocus = () => void refresh(); window.addEventListener('focus', onFocus); return () => { generation.current++; window.removeEventListener('focus', onFocus); }; }, []);
  return <div className="space-y-3">
    <button onClick={() => void refresh()} disabled={loading} className="text-blue-700 underline text-sm">Atualizar feedbacks</button>
    {loading && <p role="status">Carregando feedbacks…</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
    {!loading && !error && !items.length && <p className="text-sm text-slate-500">Nenhum feedback recebido.</p>}
    {items.map(item => { const author = student || users.find(user => user.uid === item.studentId); const url = author && studentWhatsAppUrl(author, `Olá ${author.name}, recebi seu feedback sobre ${item.routineName}.`); return <article key={item.id} className="bg-white rounded-xl border p-4 space-y-2"><h4 className="font-semibold">{author?.name || 'Aluno'} · {item.routineName}</h4><p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('pt-BR')}{item.source === 'completion' ? ' · Registro de conclusão' : ` · Avaliação ${item.rating}/5`}</p><p className="text-sm whitespace-pre-wrap">{item.comment || 'Sem comentário escrito.'}</p>{url ? <a className="text-green-700 underline text-sm" href={url} target="_blank" rel="noopener noreferrer">Responder pelo WhatsApp</a> : <p className="text-xs text-slate-500">Cadastre o WhatsApp do aluno para responder.</p>}</article>; })}
  </div>;
}
