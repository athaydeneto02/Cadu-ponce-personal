import React from 'react';
import { storage } from '../lib/storage';
import StudentResourcePage, { useStudentResource } from './StudentResourcePage';

export default function StudentAgenda({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const data = useStudentResource(studentId, storage.fetchStudentAgenda);
  return <StudentResourcePage title="Minha agenda" onBack={onBack} loading={data.loading} error={data.error} onRefresh={data.reload}>
    {!data.loading && !data.error && !data.items.length && <p className="bg-white rounded-xl p-6 text-slate-600">Nenhum atendimento agendado.</p>}
    {data.items.map(item => <article key={item.id} className="bg-white rounded-xl p-5 space-y-2">
      <h3 className="font-bold text-slate-800">{item.title}</h3>
      <p className="text-blue-700 font-semibold text-sm">{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')} · {item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)}</p>
      <p className="text-slate-500 text-sm">{item.type === 'online' ? 'Online' : item.type === 'presential' ? 'Presencial' : 'Atendimento'}</p>
      {item.notes && <p className="text-sm text-slate-600 whitespace-pre-wrap">{item.notes}</p>}
    </article>)}
  </StudentResourcePage>;
}
