import React from 'react';
import { CheckCircle2, ChevronLeft } from 'lucide-react';
import { UserProfile, WorkoutLog } from '../types';
import { localDateKey, workoutAttendance } from '../lib/workoutAttendance';

interface AttendanceProps {
  logs: WorkoutLog[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export function WorkoutAttendanceReport({ logs, loading, error, onRefresh, onBack, users }: AttendanceProps & { onBack: () => void; users: UserProfile[] }) {
  const attendance = workoutAttendance(logs);
  return <div className="flex flex-col h-full bg-[#f4f7fa]">
    <div className="bg-[#0c1622] p-4 flex flex-col items-start gap-4 shrink-0">
      <button onClick={onBack} className="text-white text-xs font-bold flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Voltar</button>
      <h4 className="text-white text-xl font-black italic uppercase">Relatório de frequência</h4>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <h3 className="font-black uppercase text-slate-900">Frequência dos alunos</h3>
        <p className="text-xs text-slate-500 mt-1">Treinos concluídos neste mês, considerando a data local deste dispositivo.</p>
        {error && <p role="alert" className="text-sm text-red-600 mt-3">{error} <button onClick={onRefresh} className="underline font-bold">Tentar novamente</button></p>}
        {loading ? <p role="status" className="text-sm text-slate-500 mt-4">Carregando frequência…</p> : <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-slate-50 p-4 rounded-xl"><span className="text-xs text-slate-500">Treinos no mês</span><p className="text-2xl font-black text-slate-900">{error ? '—' : attendance.monthLogs.length}</p></div>
          <div className="bg-slate-50 p-4 rounded-xl"><span className="text-xs text-slate-500">Alunos que treinaram hoje</span><p className="text-2xl font-black text-slate-900">{error ? '—' : attendance.studentsToday}</p></div>
        </div>}
      </div>
      <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
        <h5 className="text-sm font-black text-slate-900 mb-3">Últimos treinos concluídos</h5>
        {!loading && !error && !attendance.monthLogs.length && <p className="text-sm text-slate-500 py-4">Nenhum treino concluído registrado neste mês.</p>}
        {attendance.monthLogs.slice(0, 30).map(log => <div key={log.id} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0"><p className="text-sm font-bold text-slate-900">{users.find(user => user.uid === log.studentId)?.name || log.studentName || 'Aluno'}</p><p className="text-xs text-slate-500">{log.routineName} · {new Date(log.completedAt).toLocaleString('pt-BR')}</p></div>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded px-2 py-1">Concluído</span>
        </div>)}
      </div>
    </div>
  </div>;
}

export function StudentWorkoutAttendance({ logs, loading, error, onRefresh, studentId }: AttendanceProps & { studentId: string }) {
  const now = new Date();
  const attendance = workoutAttendance(logs, now, studentId);
  const firstDayOffset = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return <section className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
    <h4 className="text-sm font-bold text-slate-800 mb-2">Frequência de treinos</h4>
    <p className="text-xs text-slate-500 mb-4">O dia fica positivo quando há um treino concluído e sincronizado.</p>
    {loading ? <p role="status" className="text-xs text-slate-500">Carregando…</p> : error ? <p role="alert" className="text-xs text-red-600">{error} <button onClick={onRefresh} className="underline">Tentar novamente</button></p> : <>
      <div className="flex justify-between items-center">
        {attendance.week.map(({ date, completed }) => <div key={localDateKey(date)} className="flex flex-col items-center gap-1" title={`${date.toLocaleDateString('pt-BR')}: ${completed ? 'Treino concluído' : 'Sem treino concluído'}`}>
          <span className={`w-8 h-8 rounded-full border flex items-center justify-center ${completed ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>{completed ? <CheckCircle2 className="w-5 h-5" aria-label="Treino concluído" /> : '—'}</span>
          <span className="text-[10px] font-bold text-slate-600">{date.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
        </div>)}
      </div>
      <details className="mt-5"><summary className="cursor-pointer text-xs font-bold text-blue-600">Ver calendário de {now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</summary>
        <div className="grid grid-cols-7 text-center gap-2 mt-3 text-xs">
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => <span key={`day-${index}`} className="font-bold text-slate-600">{day}</span>)}
          {Array.from({ length: firstDayOffset }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const date = new Date(now.getFullYear(), now.getMonth(), index + 1);
            const completed = attendance.days.has(localDateKey(date));
            return <span key={index} aria-label={`${index + 1}: ${completed ? 'Treino concluído' : 'Sem treino concluído'}`} className={`rounded-full py-2 ${completed ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-50 text-slate-500'}`}>{index + 1}</span>;
          })}
        </div>
      </details>
      <p className="text-xs text-slate-600 mt-4">{attendance.completedDays} dia(s) com treino concluído neste mês.</p>
    </>}
  </section>;
}
