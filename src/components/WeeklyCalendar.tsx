import React from 'react';
import { Check } from 'lucide-react';
import { localWorkoutDateKey } from '../lib/workoutFrequency';

interface WeeklyCalendarProps {
  dates: Date[];
  completedDates: ReadonlySet<string>;
}

export default function WeeklyCalendar({ dates, completedDates }: WeeklyCalendarProps) {
  const today = localWorkoutDateKey(new Date());
  const count = dates.filter(date => completedDates.has(localWorkoutDateKey(date)!)).length;
  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-slate-800 font-bold text-[15px]">Frequência de Treinos</h3>
        <span className="text-xs text-emerald-700 font-semibold">{count} / 7 dias</span>
      </div>
      <div className="flex justify-between items-center px-1">
        {dates.map((date, index) => {
          const key = localWorkoutDateKey(date)!;
          const done = completedDates.has(key);
          const isToday = key === today;
          return (
            <div key={key} className="flex flex-col items-center gap-2">
              <div
                aria-label={key + ': ' + (done ? 'treino concluído' : 'sem treino registrado')}
                className={'w-8 h-8 rounded-full flex items-center justify-center ' + (done ? 'bg-emerald-600 text-white shadow-sm' : 'border-2 border-slate-300 text-slate-400') + (isToday ? ' ring-2 ring-offset-2 ring-blue-300' : '')}
              >
                {done && <Check aria-hidden="true" className="w-4 h-4 stroke-[3]" />}
              </div>
              <span className={'text-[10px] font-bold ' + (isToday ? 'text-[#0070f3]' : 'text-slate-400')}>{['S', 'T', 'Q', 'Q', 'S', 'S', 'D'][index]}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
