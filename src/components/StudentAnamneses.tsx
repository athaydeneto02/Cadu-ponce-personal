import React, { useRef, useState } from 'react';
import type { Anamnesis } from '../types';
import { storage } from '../lib/storage';
import StudentResourcePage, { useStudentResource } from './StudentResourcePage';

export default function StudentAnamneses({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const data = useStudentResource(studentId, storage.fetchAnamneses);
  const [editing, setEditing] = useState<Anamnesis | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editing || lock.current) return;
    if (editing.questions.some(question => !question.answer?.trim())) { setError('Responda todas as perguntas. Quando necessário, escreva “Não se aplica”.'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const saved = await storage.saveAnamnesis({ ...editing, status: 'answered', questions: editing.questions.map(question => ({ ...question, answer: question.answer?.trim() })) });
      data.setItems(items => items.map(item => item.id === saved.id ? saved : item)); setEditing(null); setNotice('Respostas salvas e disponíveis para o personal.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar suas respostas. Tente novamente.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <StudentResourcePage title="Questionários de saúde" onBack={onBack} loading={data.loading} error={error || data.error} onRefresh={data.reload}>
    {notice && <p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-sm">{notice}</p>}
    {!data.loading && !data.error && !data.items.length && <p className="bg-white rounded-xl p-6 text-slate-600">Nenhum questionário solicitado pelo personal.</p>}
    {editing ? <form onSubmit={submit} className="bg-white rounded-xl p-5 space-y-4">
      <h3 className="font-bold text-slate-800">{editing.title}</h3>
      <p className="text-sm text-slate-500">As respostas serão compartilhadas com o personal para orientar seu acompanhamento.</p>
      {editing.questions.map(question => <label key={question.id} className="block text-sm text-slate-700 font-semibold">{question.label}
        <textarea required maxLength={4000} disabled={busy} value={question.answer || ''} onChange={event => setEditing(value => value && ({ ...value, questions: value.questions.map(item => item.id === question.id ? { ...item, answer: event.target.value } : item) }))} className="block w-full border border-slate-300 rounded-lg p-3 mt-2 font-normal" rows={3} />
      </label>)}
      <div className="flex gap-3"><button type="button" onClick={() => setEditing(null)} disabled={busy} className="p-3 border rounded-xl text-slate-600">Cancelar</button><button disabled={busy} className="flex-1 p-3 rounded-xl bg-blue-600 font-bold text-white">{busy ? 'Salvando...' : 'Salvar respostas'}</button></div>
    </form> : data.items.map(item => <article key={item.id} className="bg-white rounded-xl p-5 space-y-3">
      <h3 className="font-bold text-slate-800">{item.title}</h3>
      <p className={`text-sm ${item.status === 'answered' ? 'text-emerald-700' : 'text-amber-700'}`}>{item.status === 'answered' ? 'Respondido' : 'Aguardando suas respostas'}</p>
      <button onClick={() => { setEditing({ ...item, questions: item.questions.map(question => ({ ...question })) }); setError(''); setNotice(''); }} className="font-semibold text-blue-700">{item.status === 'answered' ? 'Revisar respostas' : 'Responder questionário'}</button>
    </article>)}
  </StudentResourcePage>;
}
