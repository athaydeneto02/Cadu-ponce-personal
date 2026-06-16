/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Calendar as CalendarIcon } from 'lucide-react';

interface WeeklyCalendarProps {
  trainingDays: number[]; // Array of day indices (0-6) where 0 is Sunday
}

export default function WeeklyCalendar({ trainingDays }: WeeklyCalendarProps) {
  const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const today = new Date().getDay();

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm transition-colors mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <CalendarIcon className="w-4 h-4 text-red-600" />
          <h3 className="text-sm font-black italic uppercase tracking-widest text-slate-900 dark:text-white">Frequência Semanal</h3>
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {trainingDays.length} / 7 Dias
        </span>
      </div>

      <div className="flex justify-between items-center px-1">
        {days.map((day, index) => {
          const isTrainingDay = trainingDays.includes(index);
          const isToday = index === today;

          return (
            <div key={`${day}-${index}`} className="flex flex-col items-center space-y-3">
              <span className={`text-[10px] font-black uppercase tracking-widest ${isToday ? 'text-red-600' : 'text-slate-400'}`}>
                {day}
              </span>
              <div className="relative">
                <motion.div 
                  initial={isTrainingDay ? { scale: 0 } : false}
                  animate={isTrainingDay ? { scale: 1 } : { scale: 1 }}
                  className={`w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-300 ${
                    isTrainingDay 
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' 
                      : 'bg-gray-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                  } ${isToday && !isTrainingDay ? 'ring-2 ring-red-600/20' : ''}`}
                >
                  {isTrainingDay ? (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-1.5 h-1.5 bg-white rounded-full"
                    />
                  ) : (
                    <div className="w-1 h-1 bg-current rounded-full opacity-20" />
                  )}
                </motion.div>
                
                {isToday && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-600 rounded-full" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
