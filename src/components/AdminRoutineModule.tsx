import React, { useRef, useState } from 'react';
import type { AdminRoutine, UserProfile } from '../types';
import { storage } from '../lib/storage';

const inputClass = 'block w-full rounded border border-slate-300 bg-white p-2 text-slate-900';
export default function AdminRoutineModule({ student, routines, kind, onChanged, createInitially = false }: {
  student: UserProfile; routines: AdminRoutine[]; kind: 'strength' | 'aerobic' | 'extra';
  onChanged: (routines: AdminRoutine[]) => void; createInitially?: boolean;
}) {
  const createDraft = (): AdminRoutine => ({ id: crypto.randomUUID(), kind, name: '', goal: '', difficulty: 'Adaptado ao aluno',
    studentIds: [student.uid], studentNames: [student.name], exercises: [], allowPdf: true, showTimer: true,
    createdAt: new Date().toISOString() });
  const [draft, setDraft] = useState<AdminRoutine | null>(() => createInitially ? createDraft() : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addReminder, setAddReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('08:00');
  const reminderId = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const label = kind === 'aerobic' ? 'Planilha aeróbica' : kind === 'extra' ? 'Treino extra' : 'Rotina de treino';
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!draft || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!draft.name.trim() || !draft.exercises.length || draft.exercises.some(exercise => !exercise.name.trim() || !exercise.reps.trim())) throw new Error('Informe o nome do treino e ao menos uma atividade com duração ou repetições.');
      if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) throw new Error('A data final deve ser igual ou posterior à inicial.');
      if (draft.hideBeforeStart && !draft.startDate) throw new Error('Informe a data inicial para restringir a exibição.');
      if (draft.hideAfterEnd && !draft.endDate) throw new Error('Informe a data final para ocultar o treino após o vencimento.');
      if (addReminder && (!reminderDate || !reminderTime)) throw new Error('Informe a data e a hora do lembrete na agenda.');
      await storage.saveAdminRoutine(draft);
      onChanged([draft, ...routines.filter(item => item.id !== draft.id)]);
      if (addReminder) {
        const [hour, minute] = reminderTime.split(':').map(Number);
        const endMinutes = Math.min(23 * 60 + 59, hour * 60 + minute + 15);
        const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
        await storage.saveAgendaEvent({ id: reminderId.current, studentId: student.uid, studentName: student.name,
          title: `${label}: ${draft.name}`, date: reminderDate, startTime: reminderTime, endTime,
          type: 'other', notes: 'Lembrete do treinador na agenda. Não envia notificação automática.', createdAt: new Date().toISOString() });
      }
      setDraft(null); setAddReminder(false); reminderId.current = crypto.randomUUID();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível concluir. O formulário foi mantido para tentar novamente.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const unassign = async (routine: AdminRoutine) => {
    if (lock.current || !window.confirm(`Retirar "${routine.name}" apenas de ${student.name}? Os demais alunos continuarão com a rotina.`)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await storage.unassignRoutineFromStudent(routine.id, student.uid);
      const remainingIndexes = routine.studentIds.map((id, index) => id === student.uid ? -1 : index).filter(index => index >= 0);
      onChanged(routines.map(item => item.id === routine.id ? { ...item,
        studentIds: remainingIndexes.map(index => routine.studentIds[index]),
        studentNames: remainingIndexes.map(index => routine.studentNames[index] || ''),
      } : item));
      try { onChanged(await storage.fetchAdminRoutines()); }
      catch { setError('O treino foi retirado deste aluno. Atualize a lista para carregar as versões mais recentes.'); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível retirar o treino.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const own = routines.filter(item => item.studentIds.includes(student.uid) && (item.kind || 'strength') === kind);
  const refresh = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { onChanged(await storage.fetchAdminRoutines()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível atualizar os treinos.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="space-y-4 text-slate-900">
    <h3 className="font-bold">{label}</h3>
    <button type="button" disabled={busy || !!draft} onClick={() => void refresh()} className="text-sm text-blue-700 underline disabled:opacity-50">Atualizar treinos</button>
    {error && <p role="alert" className="text-red-700 bg-red-50 rounded p-3 text-sm">{error}</p>}
    {!draft && <button onClick={() => { setDraft(createDraft()); setError(''); }} disabled={busy} className="bg-blue-600 text-white rounded px-4 py-2">Criar {label.toLowerCase()}</button>}
    {draft && <form onSubmit={save} className="bg-white rounded-xl p-4 space-y-3"><fieldset disabled={busy} className="space-y-3">
      {draft.studentIds.length > 1 && <p className="text-sm bg-amber-50 p-3">Esta rotina é compartilhada. Alterações no conteúdo serão vistas por {draft.studentIds.length} alunos.</p>}
      <label className="block text-sm">Nome<input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={inputClass} /></label>
      <label className="block text-sm">Objetivo<input maxLength={500} value={draft.goal} onChange={event => setDraft({ ...draft, goal: event.target.value })} className={inputClass} /></label>
      <label className="block text-sm">Orientações<textarea value={draft.generalNotes || ''} maxLength={10000} onChange={event => setDraft({ ...draft, generalNotes: event.target.value })} className={inputClass} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-sm">Começa em<input type="date" className={inputClass} value={draft.startDate || ''} onChange={event => setDraft({ ...draft, startDate: event.target.value || undefined })} /></label><label className="text-sm">Termina em<input type="date" className={inputClass} value={draft.endDate || ''} onChange={event => setDraft({ ...draft, endDate: event.target.value || undefined })} /></label></div>
      {([{ key: 'hideBeforeStart', text: 'Exibir somente após a data inicial' }, { key: 'hideAfterEnd', text: 'Ocultar após a data final' }, { key: 'allowPdf', text: 'Permitir PDF para o aluno' }, { key: 'showTimer', text: 'Mostrar cronômetro ao aluno' }] as const).map(option => <label key={option.key} className="flex gap-2 text-sm"><input type="checkbox" checked={!!draft[option.key]} onChange={event => setDraft({ ...draft, [option.key]: event.target.checked })} />{option.text}</label>)}
      {draft.exercises.map((exercise, index) => <div key={exercise.id} className="border rounded-lg p-3 space-y-2"><label className="block text-sm">Atividade {index + 1}<input required maxLength={200} className={inputClass} value={exercise.name} onChange={event => setDraft({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, name: event.target.value } : item) })} /></label>
        <label className="block text-sm">Séries / blocos<input type="number" min="1" max="100" required className={inputClass} value={exercise.sets} onChange={event => setDraft({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, sets: Number(event.target.value) } : item) })} /></label>
        <label className="block text-sm">Duração ou repetições<input required className={inputClass} placeholder="20 minutos, 3 km ou 12 repetições" value={exercise.reps} onChange={event => setDraft({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, reps: event.target.value } : item) })} /></label>
        <label className="block text-sm">Descanso<input className={inputClass} value={exercise.rest} onChange={event => setDraft({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, rest: event.target.value } : item) })} /></label>
        <label className="block text-sm">Orientações da atividade<textarea className={inputClass} value={exercise.notes || ''} onChange={event => setDraft({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, notes: event.target.value } : item) })} /></label>
        <label className="block text-sm">Vídeo (https://)<input type="url" pattern="https://.*" className={inputClass} value={exercise.videoUrl || ''} onChange={event => setDraft({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, videoUrl: event.target.value || undefined } : item) })} /></label>
        <button type="button" onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter(item => item.id !== exercise.id) })} className="text-red-700 text-sm">Remover atividade</button>
      </div>)}
      <button type="button" className="text-blue-700 underline text-sm" onClick={() => setDraft({ ...draft, exercises: [...draft.exercises, { id: crypto.randomUUID(), name: '', sets: 1, reps: '', rest: '0s' }] })}>Adicionar atividade</button>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={addReminder} onChange={event => setAddReminder(event.target.checked)} />Adicionar lembrete à agenda do treinador</label>
      {addReminder && <div className="space-y-2"><p className="text-xs text-slate-500">O lembrete fica registrado na agenda. Não envia push ou WhatsApp automaticamente.</p><label className="text-sm">Data<input required type="date" value={reminderDate} className={inputClass} onChange={event => setReminderDate(event.target.value)} /></label><label className="text-sm">Horário<input required type="time" max="23:44" value={reminderTime} className={inputClass} onChange={event => setReminderTime(event.target.value)} /></label></div>}
      <div className="flex gap-3"><button disabled={busy} className="bg-blue-600 text-white rounded px-4 py-2">{busy ? 'Salvando…' : 'Salvar treino'}</button><button type="button" onClick={() => setDraft(null)}>Cancelar</button></div>
    </fieldset></form>}
    {!own.length && !draft && <p className="text-sm text-slate-500">Nenhum treino cadastrado nesta categoria.</p>}
    {own.map(routine => <article key={routine.id} className="bg-white border rounded-xl p-4 space-y-2"><h4 className="font-semibold">{routine.name}</h4><p className="text-sm whitespace-pre-wrap">{routine.generalNotes || routine.notes}</p><p className="text-xs text-slate-500">{routine.exercises.length} atividades · {routine.startDate || 'Sem início definido'} até {routine.endDate || 'sem término definido'}</p><div className="flex gap-4 text-sm"><button disabled={busy || !!draft} className="text-blue-700" onClick={() => { setDraft(structuredClone(routine)); setAddReminder(false); }}>Editar</button><button disabled={busy} className="text-red-700" onClick={() => void unassign(routine)}>Retirar deste aluno</button></div></article>)}
  </section>;
}
