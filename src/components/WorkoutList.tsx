import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Calendar, CheckCircle2, Dumbbell, RefreshCw, Star, X } from 'lucide-react';
import type { AdminRoutine, Workout, WorkoutFeedback, WorkoutLog } from '../types';
import { storage } from '../lib/storage';
import { actualWorkoutLoads, routineWorkoutLogs, studentWorkoutCatalog, type StudentRoutine, type StudentWorkoutKind } from '../lib/studentWorkouts';
import { getTrainerWhatsAppUrl } from '../lib/trainerConfig';
import AdminWorkoutSession from './AdminWorkoutSession';

interface WorkoutListProps {
  workouts: Workout[]; onSelectWorkout: (workout: Workout) => void; trainerPhone?: string;
  onBack?: () => void; initialKind?: StudentWorkoutKind;
}
const dateLabel = (date?: string) => date ? new Date(date.length === 10 ? date + 'T12:00:00' : date).toLocaleDateString('pt-BR') : '';
const kindLabels = { strength: 'Musculação', aerobic: 'Aeróbicos', extra: 'Extras' };

export default function WorkoutList({ workouts, onBack, trainerPhone, initialKind = 'strength' }: WorkoutListProps) {
  const studentId = storage.getUser()?.uid || '';
  const [routines, setRoutines] = useState<AdminRoutine[]>([]);
  const [legacyWorkouts, setLegacyWorkouts] = useState(workouts);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [feedbacks, setFeedbacks] = useState<WorkoutFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState<StudentWorkoutKind>(initialKind);
  const [session, setSession] = useState<StudentRoutine | null>(null);
  const [history, setHistory] = useState<StudentRoutine | null>(null);
  const [feedback, setFeedback] = useState<StudentRoutine | null>(null);
  useEffect(() => { setLegacyWorkouts(workouts); }, [workouts]);
  useEffect(() => {
    let active = true; let request = 0;
    const refresh = async () => {
      if (!studentId || storage.getUser()?.uid !== studentId) return;
      const version = ++request; setLoading(true); setError('');
      setLogs(storage.getWorkoutLogs().filter(log => log.studentId === studentId));
      const results = await Promise.allSettled([storage.fetchAdminRoutines(), storage.fetchWorkouts(studentId), storage.fetchWorkoutLogs(studentId, { allowCached: false }), storage.fetchWorkoutFeedbacks(studentId)]);
      if (!active || version !== request || storage.getUser()?.uid !== studentId) return;
      if (results[0].status === 'fulfilled') setRoutines(results[0].value);
      if (results[1].status === 'fulfilled') setLegacyWorkouts(results[1].value);
      if (results[2].status === 'fulfilled') setLogs(results[2].value);
      if (results[3].status === 'fulfilled') setFeedbacks(results[3].value);
      if (results.some(result => result.status === 'rejected')) setError('Não foi possível atualizar todos os dados. Confira a conexão e tente novamente.');
      setLoading(false);
    };
    setRoutines(storage.getAdminRoutines()); void refresh();
    const onChange = () => { void refresh(); };
    window.addEventListener('cadu_workout_completed', onChange); window.addEventListener('cadu_data_synced', onChange); window.addEventListener('focus', onChange);
    return () => { active = false; window.removeEventListener('cadu_workout_completed', onChange); window.removeEventListener('cadu_data_synced', onChange); window.removeEventListener('focus', onChange); };
  }, [studentId, revision]);
  const catalog = studentWorkoutCatalog(routines, legacyWorkouts, studentId);
  const visible = catalog.filter(routine => (routine.kind || 'strength') === kind);
  if (session) return <AdminWorkoutSession key={session.id} routine={session} trainerPhone={trainerPhone} onClose={() => { setSession(null); setRevision(value => value + 1); }} />;
  return <div className="min-h-full bg-slate-100 pb-8">
    <header className="bg-[#1c2b3e] p-4 text-white flex items-center justify-between">
      <div className="flex items-center gap-2">{onBack && <button onClick={onBack} aria-label="Voltar"><ChevronLeft className="w-5 h-5" /></button>}<h1 className="font-bold text-xl">Meus treinos</h1></div>
      <button onClick={() => setRevision(value => value + 1)} disabled={loading} aria-label="Atualizar treinos" className="disabled:opacity-50"><RefreshCw className="w-5 h-5" /></button>
    </header>
    <div className="p-4 space-y-4">
      <nav aria-label="Tipo de treino" className="flex gap-2">{(['strength', 'aerobic', 'extra'] as const).map(value => <button key={value} onClick={() => setKind(value)} aria-pressed={kind === value} className={'flex-1 py-3 rounded-xl font-semibold text-sm ' + (kind === value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600')}>{kindLabels[value]}</button>)}</nav>
      {loading && <p role="status" className="text-sm text-slate-500">Atualizando seus treinos...</p>}
      {error && <p role="alert" className="bg-amber-50 text-amber-900 rounded-xl p-3 text-sm">{error}</p>}
      {!loading && !visible.length && <div className="bg-white rounded-xl p-8 text-center text-slate-600"><Dumbbell className="w-8 h-8 mx-auto mb-3 text-blue-600" /><p>Nenhum treino de {kindLabels[kind].toLowerCase()} disponível neste período.</p></div>}
      {visible.map(routine => {
        const completed = routineWorkoutLogs(logs, routine, studentId); const latest = completed[0];
        return <article key={routine.id} className="bg-white rounded-2xl p-5 space-y-4 shadow-sm">
          <div><h2 className="font-bold text-lg text-slate-800">{routine.name}</h2>{routine.dayOfWeek && <p className="text-sm text-blue-700">{routine.dayOfWeek}</p>}{routine.routineGroupName && <p className="text-xs text-slate-500 mt-1">{routine.routineGroupName}</p>}</div>
          {(routine.startDate || routine.endDate) && <p className="text-xs text-slate-500 flex gap-2"><Calendar className="w-4 h-4" />{routine.startDate ? 'De ' + dateLabel(routine.startDate) : ''}{routine.endDate ? ' até ' + dateLabel(routine.endDate) : ''}</p>}
          {(routine.goal || routine.difficulty) && <p className="text-sm text-slate-600">{[routine.goal, routine.difficulty].filter(Boolean).join(' · ')}</p>}
          <details className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><summary className="font-semibold cursor-pointer">Orientações gerais</summary><p className="pt-2 whitespace-pre-wrap">{routine.generalNotes || routine.notes || 'Sem orientações adicionais.'}</p></details>
          <p className={'text-sm flex gap-2 items-center ' + (latest ? 'text-emerald-700' : 'text-slate-500')}>{latest && <CheckCircle2 className="w-4 h-4" />}{latest ? completed.length + ' conclusão(ões) · Última: ' + dateLabel(latest.completedAt) + (latest.syncStatus === 'pending' ? ' · sincronização pendente' : '') : 'Nenhuma conclusão registrada.'}</p>
          <div className="grid grid-cols-2 gap-3"><button onClick={() => setHistory(routine)} className="border border-blue-600 rounded-xl p-3 text-blue-700 font-semibold text-sm">Evolução</button><button onClick={() => setFeedback(routine)} className="border border-blue-600 rounded-xl p-3 text-blue-700 font-semibold text-sm">Feedbacks</button></div>
          <button onClick={() => setSession(routine)} disabled={!routine.exercises.length} className="w-full rounded-xl bg-blue-600 p-3 text-white font-bold disabled:opacity-50">{routine.exercises.length ? 'Ver treino' : 'Aguardando exercícios do personal'}</button>
        </article>;
      })}
    </div>
    {history && <EvolutionModal routine={history} logs={routineWorkoutLogs(logs, history, studentId)} onClose={() => setHistory(null)} />}
    {feedback && <FeedbackModal key={feedback.id} routine={feedback} studentId={studentId} feedbacks={feedbacks.filter(item => item.studentId === studentId && (item.routineId === feedback.id || item.routineId === feedback.legacyWorkoutId))} onSaved={saved => setFeedbacks(items => [saved, ...items.filter(item => item.id !== saved.id)])} onClose={() => setFeedback(null)} />}
  </div>;
}

export function EvolutionModal({ routine, logs, onClose }: { routine: StudentRoutine; logs: WorkoutLog[]; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] bg-black/60 p-4 flex items-center justify-center"><section role="dialog" aria-modal="true" aria-label="Evolução do treino" className="bg-white rounded-2xl p-5 max-w-md w-full max-h-[85vh] overflow-y-auto space-y-4">
    <header className="flex justify-between gap-3"><div><h2 className="font-bold text-slate-800">Evolução do treino</h2><p className="text-sm text-slate-500">{routine.name}</p></div><button onClick={onClose} aria-label="Fechar evolução"><X className="w-5 h-5" /></button></header>
    {!logs.length && <p className="text-sm text-slate-500">Conclua este treino para acompanhar as cargas executadas.</p>}
    {logs.map(log => <article key={log.id} className="border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-slate-700">{new Date(log.completedAt).toLocaleString('pt-BR')}</h3>
      <p className="text-xs text-slate-500">{Math.floor(log.durationSeconds / 60)} min · Esforço: {log.rpe ? log.rpe + '/10' : 'não informado'}{log.syncStatus === 'pending' ? ' · Envio pendente' : ''}</p>
      {actualWorkoutLoads(log).map((exercise, index) => <div key={index} className="text-sm text-slate-700"><p className="font-semibold">{exercise.name}</p><p>{exercise.completed}/{exercise.total} séries · {exercise.loads.length ? exercise.loads.map(load => load + ' kg').join(' / ') : 'Carga não informada'}</p></div>)}
      {log.comment && <p className="text-sm text-slate-600 whitespace-pre-wrap">{log.comment}</p>}
    </article>)}
  </section></div>;
}

export function FeedbackModal({ routine, studentId, feedbacks, onSaved, onClose }: { routine: StudentRoutine; studentId: string; feedbacks: WorkoutFeedback[]; onSaved: (feedback: WorkoutFeedback) => void; onClose: () => void }) {
  const [rating, setRating] = useState(5), [comment, setComment] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const id = useRef(crypto.randomUUID()); const createdAt = useRef(new Date().toISOString()); const lock = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (lock.current || saved) return; lock.current = true; setBusy(true); setError('');
    try { const result = await storage.saveWorkoutFeedback({ id: id.current, studentId, routineId: routine.id, routineName: routine.name, rating, comment: comment.trim(), createdAt: createdAt.current }); onSaved(result); setSaved(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar. Suas respostas foram mantidas.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="fixed inset-0 z-[90] bg-black/60 p-4 flex items-center justify-center"><section role="dialog" aria-modal="true" aria-label="Feedback do treino" className="bg-white rounded-2xl p-5 max-w-md w-full max-h-[85vh] overflow-y-auto space-y-4">
    <header className="flex justify-between"><h2 className="font-bold text-slate-800">Feedbacks · {routine.name}</h2><button onClick={onClose} disabled={busy} aria-label="Fechar feedbacks"><X className="w-5 h-5" /></button></header>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {saved ? <p role="status" className="text-emerald-700 font-semibold">Feedback salvo e disponível para o personal.</p> : <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy}><legend className="text-sm text-slate-600 mb-2">Como foi o treino?</legend><div className="flex gap-2">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-label={value + ' estrelas'} aria-pressed={rating === value} onClick={() => setRating(value)}><Star className={'w-7 h-7 ' + (value <= rating ? 'text-amber-500 fill-amber-500' : 'text-slate-300')} /></button>)}</div></fieldset>
      <label className="block text-sm text-slate-600">Comentário<textarea value={comment} onChange={event => setComment(event.target.value)} disabled={busy} maxLength={4000} rows={3} className="block w-full rounded-xl border p-3 mt-2" /></label>
      <button disabled={busy} className="w-full bg-blue-600 rounded-xl p-3 text-white font-semibold">{busy ? 'Salvando...' : 'Salvar feedback'}</button>
    </form>}
    <a href={getTrainerWhatsAppUrl('Olá Cadu! Gostaria de conversar sobre o treino "' + routine.name + '".')} target="_blank" rel="noopener noreferrer" className="block text-sm text-emerald-700 underline">Conversar no WhatsApp</a>
    {feedbacks.map(item => <article key={item.id} className="border-t pt-3 text-sm text-slate-600"><p className="font-semibold">{dateLabel(item.createdAt)} · {item.rating}/5{item.source === 'completion' ? ' · Comentário da conclusão' : ''}</p><p className="whitespace-pre-wrap mt-1">{item.comment || 'Sem comentário.'}</p></article>)}
  </section></div>;
}
