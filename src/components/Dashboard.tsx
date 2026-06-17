/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, TrendingUp, Calendar, Clock, ChevronRight, Activity, BarChart2, Scale, Plus } from 'lucide-react';
import { Workout, UserProfile, Goal } from '../types';
import LoadHistory from './LoadHistory';
import PersonalGoals from './PersonalGoals';
import WeeklyCalendar from './WeeklyCalendar';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line
} from 'recharts';

interface DashboardProps {
  user: UserProfile | null;
  workouts: Workout[];
  onStartWorkout: (workout: Workout) => void;
  onUpdateUser?: (updated: UserProfile) => void;
}

const mockGoals: Goal[] = [
  { id: '1', title: 'Supino Reto', currentValue: 80, targetValue: 100, unit: 'kg', category: 'strength' },
  { id: '2', title: 'Treinos por Semana', currentValue: 4, targetValue: 5, unit: 'x', category: 'frequency' },
];

const progressData = [
  { name: 'Jan', load: 45 },
  { name: 'Fev', load: 48 },
  { name: 'Mar', load: 52 },
  { name: 'Abr', load: 58 },
  { name: 'Mai', load: 63 },
  { name: 'Jun', load: 68 },
];

const weeklyData = [
  { day: 'S', load: 120 },
  { day: 'T', load: 150 },
  { day: 'Q', load: 0 },
  { day: 'Q', load: 180 },
  { day: 'S', load: 140 },
  { day: 'S', load: 90 },
  { day: 'D', load: 0 },
];

export default function Dashboard({ user, workouts, onStartWorkout, onUpdateUser }: DashboardProps) {
  const currentWorkout = workouts[0]; // Suggest the first one

  const currentWeight = user?.weight || 82;
  const [weightHistory, setWeightHistory] = useState<{ week: string; peso: number }[]>(() => {
    const saved = localStorage.getItem(`cadu_ponce_weight_history_${user?.uid || 'guest'}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback below
      }
    }
    // Generate gorgeous mock weight evolution data for the last 4 weeks based on current weight
    return [
      { week: 'Semana 1', peso: Math.round((currentWeight + 1.8) * 10) / 10 },
      { week: 'Semana 2', peso: Math.round((currentWeight + 1.1) * 10) / 10 },
      { week: 'Semana 3', peso: Math.round((currentWeight + 0.4) * 10) / 10 },
      { week: 'Semana 4', peso: currentWeight }
    ];
  });

  const [newWeight, setNewWeight] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync the current weight from user profile to the final week if it changed
  React.useEffect(() => {
    if (user?.weight) {
      setWeightHistory(prev => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1] = { 
            ...updated[updated.length - 1], 
            peso: user.weight 
          };
        }
        localStorage.setItem(`cadu_ponce_weight_history_${user.uid || 'guest'}`, JSON.stringify(updated));
        return updated;
      });
    }
  }, [user?.weight, user?.uid]);

  const handleAddWeight = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(newWeight);
    if (!isNaN(parsed) && parsed > 0) {
      // 1. Update the user profile weight
      if (user && onUpdateUser) {
        onUpdateUser({
          ...user,
          weight: parsed
        });
      }

      // 2. Append/Update weight history list
      setWeightHistory(prev => {
        const updated = [
          { week: 'Semana 1', peso: prev[1]?.peso || parsed },
          { week: 'Semana 2', peso: prev[2]?.peso || parsed },
          { week: 'Semana 3', peso: prev[3]?.peso || parsed },
          { week: 'Semana 4', peso: parsed }
        ];
        localStorage.setItem(`cadu_ponce_weight_history_${user?.uid || 'guest'}`, JSON.stringify(updated));
        return updated;
      });

      setNewWeight('');
      setIsUpdating(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight transition-colors">
            Olá, <span className="text-red-600">{user?.name.split(' ')[0]}</span>! 👋
          </h1>
          <p className="text-gray-500 dark:text-slate-400 font-medium mt-1 transition-colors">Sexta-feira, 12 de Junho</p>
        </div>
        <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white dark:border-slate-800 shadow-md">
          <img 
            src="/src/assets/images/cadu_ponce_logo_new.png" 
            alt="Cadu Ponce"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Quick Start Card */}
      {currentWorkout && (
        <div className="bg-slate-950 rounded-3xl p-6 text-white shadow-xl shadow-slate-200 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-red-500 opacity-80 mb-2">Próximo Treino</h2>
            <h3 className="text-2xl font-bold mb-4 italic tracking-tight">{currentWorkout.name}</h3>
            
            <div className="flex items-center space-x-4 mb-6">
              <div className="flex items-center text-slate-300 text-sm">
                <Clock className="w-4 h-4 mr-1.5 text-red-500" />
                ~50 min
              </div>
              <div className="flex items-center text-slate-300 text-sm">
                <Calendar className="w-4 h-4 mr-1.5 text-red-500" />
                4 séries
              </div>
            </div>

            <button 
              onClick={() => onStartWorkout(currentWorkout)}
              className="w-full bg-red-600 hover:bg-red-500 transition-colors py-4 rounded-2xl font-black flex items-center justify-center space-x-2 active:scale-[0.98] uppercase italic"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>INICIAR TREINO</span>
            </button>
          </div>
          
          {/* Abstract blobs for background */}
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-red-600/20 rounded-full blur-3xl"></div>
          <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-red-500/10 rounded-full blur-3xl"></div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard 
          icon={<TrendingUp className="text-emerald-500" />} 
          label="Cargas" 
          value="+12%" 
          trend="up" 
        />
        <StatCard 
          icon={<Calendar className="text-blue-500" />} 
          label="Frequência" 
          value="4/5" 
          trend="neutral" 
        />
      </div>

      {/* Weekly Calendar Section */}
      <WeeklyCalendar trainingDays={[1, 2, 4, 5]} />

      {/* Personal Goals Section */}
      <PersonalGoals goals={mockGoals} />

      {/* Weight Evolution Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <Scale className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-lg dark:text-white">Evolução do Peso</h3>
            </div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-1">Métricas das últimas 4 semanas</p>
          </div>

          <div className="flex items-center space-x-2">
            {!isUpdating ? (
              <button
                onClick={() => {
                  setNewWeight(currentWeight.toString());
                  setIsUpdating(true);
                }}
                className="bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-500 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar</span>
              </button>
            ) : (
              <button
                onClick={() => setIsUpdating(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-xs font-semibold animate-fade-in"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        {isUpdating && (
          <form 
            onSubmit={handleAddWeight} 
            className="mb-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-gray-150 dark:border-slate-800 flex items-center space-x-3"
          >
            <div className="relative flex-1">
              <input
                type="number"
                step="0.1"
                min="30"
                max="300"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                placeholder="Ex: 81.5"
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:border-red-650 transition"
              />
              <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400">kg</span>
            </div>
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase px-4 py-3 rounded-xl transition"
            >
              Confirmar
            </button>
          </form>
        )}

        {/* Dynamic Weight Highlight badge */}
        <div className="flex items-baseline space-x-2 mb-6">
          <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{currentWeight.toFixed(1)}</span>
          <span className="text-sm font-bold text-slate-400">kg atual</span>
          {weightHistory.length >= 4 && (
            <span className={`text-xs font-bold flex items-center ml-2 px-2 py-0.5 rounded-full ${
              weightHistory[3].peso < weightHistory[0].peso
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-500'
                : weightHistory[3].peso > weightHistory[0].peso
                ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-500'
                : 'bg-slate-50 dark:bg-slate-850 text-slate-500'
            }`}>
              {weightHistory[3].peso < weightHistory[0].peso ? (
                `-${(weightHistory[0].peso - weightHistory[3].peso).toFixed(1)}kg (Redução)`
              ) : weightHistory[3].peso > weightHistory[0].peso ? (
                `+${(weightHistory[3].peso - weightHistory[0].peso).toFixed(1)}kg (Aumento)`
              ) : (
                'Estável'
              )}
            </span>
          )}
        </div>

        {/* Recharts LineChart */}
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weightHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b811" vertical={false} />
              <XAxis 
                dataKey="week" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
                dy={10}
              />
              <YAxis 
                type="number"
                domain={['dataMin - 1', 'dataMax + 1']}
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 border border-slate-750 text-white rounded-xl p-2.5 shadow-xl text-xs font-bold">
                        <p className="text-slate-400 text-[10px] font-black uppercase mb-1">{payload[0].payload.week}</p>
                        <p className="text-red-500">{payload[0].value} <span className="text-[10px] text-white">kg</span></p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line 
                type="monotone" 
                dataKey="peso" 
                stroke="#dc2626" 
                strokeWidth={3} 
                activeDot={{ r: 6, fill: '#dc2626', stroke: '#ffffff', strokeWidth: 2 }}
                dot={{ r: 4, fill: '#1e293b', stroke: '#dc2626', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly Summary Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg dark:text-white">Resumo Semanal</h3>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-1">Total: 580kg levantados</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-500 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest italic">
            4 Treinos
          </div>
        </div>
        
        <div className="h-32 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                dy={5}
              />
              <Tooltip cursor={{fill: 'transparent'}} content={() => null} />
              <Bar dataKey="load" radius={[4, 4, 4, 4]}>
                {weeklyData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.load > 0 ? '#dc2626' : '#94a3b833'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Load History Section (New) */}
      <div className="pt-2">
        <div className="flex items-center space-x-2 mb-6 ml-2">
          <BarChart2 className="w-5 h-5 text-red-600" />
          <h2 className="text-xl font-black italic uppercase tracking-tighter dark:text-white">Histórico de Cargas</h2>
        </div>
        <LoadHistory workouts={workouts} />
      </div>

      {/* Evolution Highlight */}
      <div className="bg-red-50 dark:bg-red-950/20 rounded-3xl p-6 border border-red-100/50 dark:border-red-900/30 flex items-center justify-between transition-colors">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center">
            <Calendar className="text-red-600 dark:text-red-500 w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white">Check-in de Fotos</h4>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Atualize hoje sua evolução</p>
          </div>
        </div>
        <button className="bg-white dark:bg-slate-800 p-2.5 rounded-xl text-red-600 dark:text-red-500 shadow-sm hover:shadow-md transition-all active:scale-95">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend }: { icon: React.ReactNode, label: string, value: string, trend: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2.5 bg-gray-50 dark:bg-slate-800 rounded-xl transition-colors">
          {icon}
        </div>
        {trend === 'up' && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-1 rounded-full uppercase">Melhora</span>
        )}
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider transition-colors">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 transition-colors">{value}</p>
    </div>
  );
}
