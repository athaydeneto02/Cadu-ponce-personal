import React from 'react';
import { storage } from '../lib/storage';
import StudentResourcePage, { useStudentResource } from './StudentResourcePage';

export default function StudentAssessments({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const data = useStudentResource(studentId, storage.fetchAssessments);
  return <StudentResourcePage title="Minhas avaliações" onBack={onBack} loading={data.loading} error={data.error} onRefresh={data.reload}>
    {!data.loading && !data.error && !data.items.length && <p className="bg-white rounded-xl p-6 text-slate-600">O personal ainda não publicou uma avaliação.</p>}
    {data.items.map(item => <article key={item.id} className="bg-white rounded-xl p-5 space-y-3">
      <h3 className="font-bold text-slate-800">Avaliação de {new Date(`${item.date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}</h3>
      <dl className="grid grid-cols-2 gap-3 text-sm text-slate-700">
        {item.weight != null && <div><dt>Peso</dt><dd className="font-bold">{item.weight} kg</dd></div>}
        {item.height != null && <div><dt>Altura</dt><dd className="font-bold">{item.height} cm</dd></div>}
        {item.bodyFat != null && <div><dt>Gordura corporal</dt><dd className="font-bold">{item.bodyFat}%</dd></div>}
        {Object.entries(item.measurements || {}).map(([name, value]) => <div key={name}><dt>{name}</dt><dd className="font-bold">{value} cm</dd></div>)}
      </dl>
      {item.notes && <p className="text-sm text-slate-600 whitespace-pre-wrap border-t pt-3">{item.notes}</p>}
    </article>)}
  </StudentResourcePage>;
}
