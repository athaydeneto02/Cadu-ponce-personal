/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Target, TrendingUp, Calendar, Zap, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { Goal } from '../types';

interface PersonalGoalsProps {
  goals: Goal[];
}

export default function PersonalGoals({ goals }: PersonalGoalsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center space-x-2">
          <Target className="w-5 h-5 text-red-600" />
          <h2 className="text-xl font-black italic uppercase tracking-tighter dark:text-white">Metas Pessoais</h2>
        </div>
        <button className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="grid gap-4">
        {goals.map((goal) => (
          <div key={goal.id}>
            <GoalCard goal={goal} />
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const progress = Math.min(100, (goal.currentValue / goal.targetValue) * 100);
  
  const getIcon = () => {
    switch (goal.category) {
      case 'strength': return <TrendingUp className="w-4 h-4" />;
      case 'frequency': return <Calendar className="w-4 h-4" />;
      case 'weight': return <Zap className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-red-600/10 rounded-2xl flex items-center justify-center text-red-600">
            {getIcon()}
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-white leading-tight">{goal.title}</h4>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
              {goal.category === 'strength' ? 'Força & Carga' : goal.category === 'frequency' ? 'Frequência Semanal' : 'Meta Corporal'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end space-x-1">
            <span className="text-xl font-black italic text-slate-900 dark:text-white">{goal.currentValue}</span>
            <span className="text-xs font-bold text-slate-400">/ {goal.targetValue} {goal.unit}</span>
          </div>
        </div>
      </div>

      <div className="relative h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.5, ease: "circOut" }}
          className="absolute top-0 left-0 h-full bg-red-600 rounded-full"
        />
        {progress > 85 && (
          <motion.div 
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute top-0 left-0 h-full w-full bg-white opacity-20"
          />
        )}
      </div>

      <div className="flex justify-between mt-3 px-1">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
          Progresso
        </span>
        <span className={`text-[10px] font-black uppercase tracking-widest ${progress === 100 ? 'text-emerald-500' : 'text-red-600'}`}>
          {progress.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
