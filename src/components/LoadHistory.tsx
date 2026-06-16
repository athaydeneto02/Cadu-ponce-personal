/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { TrendingUp, Award, Clock, ChevronDown, Activity } from 'lucide-react';
import { Workout } from '../types';

interface LoadPoint {
  date: string;
  load: number;
}

interface ExerciseProgression {
  id: string;
  name: string;
  history: LoadPoint[];
}

// Mocked historical data for various exercises
const progressionData: Record<string, LoadPoint[]> = {
  '1': [ // Supino Reto
    { date: '01/05', load: 60 },
    { date: '08/05', load: 64 },
    { date: '15/05', load: 64 },
    { date: '22/05', load: 68 },
    { date: '29/05', load: 72 },
    { date: '05/06', load: 76 },
    { date: '12/06', load: 80 },
  ],
  '2': [ // Agachamento
    { date: '01/05', load: 80 },
    { date: '08/05', load: 85 },
    { date: '15/05', load: 90 },
    { date: '22/05', load: 90 },
    { date: '29/05', load: 95 },
    { date: '05/06', load: 100 },
    { date: '12/06', load: 110 },
  ],
  'default': [
    { date: '01/05', load: 20 },
    { date: '08/05', load: 22 },
    { date: '15/05', load: 24 },
    { date: '22/05', load: 24 },
    { date: '29/05', load: 26 },
    { date: '05/06', load: 28 },
    { date: '12/06', load: 30 },
  ]
};

interface LoadHistoryProps {
  workouts: Workout[];
}

export default function LoadHistory({ workouts }: LoadHistoryProps) {
  const allExercises = useMemo(() => {
    const list: { id: string, name: string }[] = [];
    workouts.forEach(w => {
      w.exercises.forEach(e => {
        if (!list.find(i => i.id === e.id)) {
          list.push({ id: e.id, name: e.name });
        }
      });
    });
    return list;
  }, [workouts]);

  const [selectedExercise, setSelectedExercise] = useState(allExercises[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const currentHistory = progressionData[selectedExercise?.id] || progressionData['default'];
  const maxLoad = Math.max(...currentHistory.map(h => h.load));
  const latestLoad = currentHistory[currentHistory.length - 1].load;
  const initialLoad = currentHistory[0].load;
  const progressionPercent = ((latestLoad - initialLoad) / initialLoad * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Exercise Selector */}
      <div className="relative">
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-2">
          Selecione o Exercício
        </label>
        <button 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center text-red-600">
              <Activity className="w-5 h-5" />
            </div>
            <span className="font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">
              {selectedExercise?.name}
            </span>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isDropdownOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl shadow-2xl z-[100] max-h-60 overflow-y-auto p-2"
            >
              {allExercises.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => {
                    setSelectedExercise(ex);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full p-4 rounded-2xl text-left font-bold transition-colors ${selectedExercise?.id === ex.id ? 'bg-red-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                >
                  {ex.name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-gray-100 dark:border-slate-800">
          <div className="flex items-center space-x-2 text-red-600 mb-2">
            <Award className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Personal Best</span>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-3xl font-black italic tracking-tighter text-slate-900 dark:text-white">{maxLoad}</span>
            <span className="text-xs font-bold text-slate-400">kg</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-gray-100 dark:border-slate-800">
          <div className="flex items-center space-x-2 text-emerald-500 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Evolução</span>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-3xl font-black italic tracking-tighter text-emerald-500">+{progressionPercent}%</span>
          </div>
        </div>
      </div>

      {/* Main Progression Chart */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-8 relative z-10">
          <div>
            <h3 className="font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">Curva de Força</h3>
            <p className="text-slate-400 text-xs font-medium">Últimas 8 semanas</p>
          </div>
          <div className="flex items-center space-x-2 text-slate-400 text-[10px] font-black uppercase">
            <Clock className="w-3 h-3" />
            <span>Atualizado hoje</span>
          </div>
        </div>

        <div className="h-64 w-full relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={currentHistory}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b811" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                dy={10}
              />
              <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '16px', 
                  backgroundColor: '#0f172a', 
                  border: 'none', 
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
                  padding: '12px'
                }} 
                itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                labelStyle={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}
                cursor={{ stroke: '#dc2626', strokeWidth: 2, strokeDasharray: '4 4' }}
              />
              <Line 
                type="monotone" 
                dataKey="load" 
                stroke="#dc2626" 
                strokeWidth={4} 
                dot={{ fill: '#dc2626', strokeWidth: 2, r: 4, stroke: '#fff' }} 
                activeDot={{ r: 8, strokeWidth: 0, fill: '#dc2626' }}
                animationDuration={1500}
              />
              <ReferenceLine y={maxLoad} stroke="#dc262611" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cinematic effect behind bridge */}
        <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-red-600/5 rounded-full blur-[100px] pointer-events-none" />
      </div>
    </div>
  );
}
