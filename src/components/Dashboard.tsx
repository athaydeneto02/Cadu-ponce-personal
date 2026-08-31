/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, TrendingUp, Calendar, Clock, ChevronRight, Activity, BarChart2, Scale, Plus } from 'lucide-react';
import { Workout, UserProfile, Goal } from '../types';
import { supabase } from '../lib/supabase';
import LoadHistory from './LoadHistory';
import PersonalGoals from './PersonalGoals';
import WeeklyCalendar from './WeeklyCalendar';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BF4mz4GPAGZdcZi7EbNc1hHyI0bx_4npqhd0RV3aoHqSOpn9rjqpXUtA2SkNCPth1zgawRHMgFcVRmng0aVJQjQ';

function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
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

const mockGoals: Goal[] = [];

const progressData: {name: string, load: number}[] = [];

const weeklyData: {day: string, load: number}[] = [];

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
    // Fallback to empty array if no saved data
    return user?.weight ? [{ week: 'Semana 1', peso: user.weight }] : [];
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

  // Request Push Notification permission and subscribe
  React.useEffect(() => {
    async function subscribeToPush() {
      if (!user?.uid || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        return; // Push not supported or no user
      }

      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY)
          });
        }

        // Save subscription to Supabase
        const { error } = await supabase.from('push_subscriptions').insert({
          user_id: user.uid,
          subscription: subscription.toJSON()
        });
        
        // Error will trigger if user tries to save exact same subscription again? 
        // We could use an upsert, but let's just ignore duplicate errors for simplicity
        if (error && error.code !== '23505') { 
           console.error('Error saving subscription:', error);
        }
      } catch (err) {
        console.error('Push subscription failed:', err);
      }
    }

    subscribeToPush();
  }, [user?.uid]);

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

  const [dashTab, setDashTab] = useState<'inicio' | 'financas'>('inicio');

  return (
    <div className="flex flex-col min-h-full">
      {/* MFIT-style Tab Bar */}
      <div className="flex bg-[#1B2A4A] shrink-0">
        <button
          onClick={() => setDashTab('inicio')}
          className={`flex-1 py-3 text-sm font-bold border-b-4 transition-all ${
            dashTab === 'inicio'
              ? 'bg-white text-slate-900 border-white rounded-t-xl shadow-sm'
              : 'bg-red-600 text-white border-red-600'
          }`}
        >
          Início
        </button>
        <button
          onClick={() => setDashTab('financas')}
          className={`flex-1 py-3 text-sm font-bold border-b-4 transition-all ${
            dashTab === 'financas'
              ? 'bg-white text-slate-900 border-white rounded-t-xl shadow-sm'
              : 'bg-red-600 text-white border-red-600'
          }`}
        >
          Finanças
        </button>
      </div>

      {dashTab === 'inicio' ? (
        <div className="flex-1 bg-[#F4F6FA] overflow-y-auto pb-4">
          {/* Quick Actions Row */}
          <div className="bg-white px-4 py-4 border-b border-gray-100">
            <div className="grid grid-cols-3 gap-2">
              <button className="flex flex-col items-center gap-1.5 group active:scale-95 transition">
                <div className="w-12 h-12 bg-white rounded-full shadow border border-slate-100 flex items-center justify-center text-red-600 group-hover:bg-red-50 transition">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <span className="text-[10px] text-slate-600 font-bold">Feedbacks</span>
              </button>
              <button className="flex flex-col items-center gap-1.5 group active:scale-95 transition">
                <div className="w-12 h-12 bg-white rounded-full shadow border border-slate-100 flex items-center justify-center text-red-600 group-hover:bg-red-50 transition">
                  <Calendar className="w-5 h-5" />
                </div>
                <span className="text-[10px] text-slate-600 font-bold">Atualizações</span>
              </button>
              <button className="flex flex-col items-center gap-1.5 group active:scale-95 transition">
                <div className="w-12 h-12 bg-white rounded-full shadow border border-slate-100 flex items-center justify-center text-red-600 group-hover:bg-red-50 transition">
                  <Bell className="w-5 h-5" />
                </div>
                <span className="text-[10px] text-slate-600 font-bold">Notificações</span>
              </button>
            </div>
          </div>

          <div className="px-4 pt-4 space-y-4">
            {/* Welcome / Next Workout Card */}
            {currentWorkout ? (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shrink-0 shadow-md">
                    <Dumbbell className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 leading-tight">Próximo Treino</h3>
                    <p className="text-slate-500 text-sm font-semibold">{currentWorkout.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => onStartWorkout(currentWorkout)}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl shadow-md transition active:scale-[0.98] text-sm uppercase tracking-wider"
                >
                  Iniciar Treino
                </button>
                <button
                  onClick={() => {}}
                  className="w-full mt-2 border-2 border-red-200 text-red-600 font-bold py-3 rounded-xl transition hover:bg-red-50 text-sm"
                >
                  Ver todos os treinos
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
                <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                  <Dumbbell className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-1">Bem-vindo!</h3>
                <p className="text-slate-500 text-sm font-medium mb-5">Aguardando seu treino ser liberado</p>
                <button className="w-full bg-red-600 text-white font-bold py-3 rounded-xl text-sm">
                  Falar com Treinador
                </button>
              </div>
            )}

            {/* Weight & Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="w-4 h-4 text-red-600" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Peso Atual</span>
                </div>
                <p className="text-2xl font-black text-slate-900">{(user?.weight || 0).toFixed(1)}<span className="text-sm text-slate-400 font-bold ml-1">kg</span></p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-red-600" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Frequência</span>
                </div>
                <p className="text-2xl font-black text-slate-900">4<span className="text-sm text-slate-400 font-bold ml-1">/semana</span></p>
              </div>
            </div>

            {/* Weekly Calendar */}
            <WeeklyCalendar trainingDays={[1, 2, 4, 5]} />

            {/* Treinos Grid — MFIT Style */}
            <div>
              <h4 className="text-xs font-black uppercase text-slate-700 tracking-tight mb-3">Treinos</h4>
              <div className="grid grid-cols-2 gap-3">
                <MfitCard
                  icon={<Dumbbell className="w-5 h-5" />}
                  label="Meus Treinos"
                  onClick={() => onStartWorkout && workouts[0] && onStartWorkout(workouts[0])}
                />
                <MfitCard
                  icon={<Calendar className="w-5 h-5" />}
                  label="Agenda"
                  onClick={() => {}}
                />
                <MfitCard
                  icon={<BarChart2 className="w-5 h-5" />}
                  label="Relatório de Frequência"
                  onClick={() => {}}
                />
                <MfitCard
                  icon={<Play className="w-5 h-5" />}
                  label="Biblioteca de Exercícios"
                  onClick={() => {}}
                />
              </div>
            </div>

            {/* Load History */}
            <div className="pt-2">
              <LoadHistory workouts={workouts} />
            </div>
          </div>
        </div>
      ) : (
        /* Finanças Tab */
        <div className="flex-1 bg-[#F4F6FA] flex items-center justify-center">
          <div className="text-center text-slate-400 px-8">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-bold text-sm">Finanças em breve</p>
            <p className="text-xs mt-1">Acompanhe seus pagamentos aqui</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MfitCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl p-4 border-2 border-red-100 flex flex-col justify-between h-24 text-left hover:bg-red-50/40 active:scale-[0.97] transition shadow-sm"
    >
      <div className="w-9 h-9 bg-red-50 rounded-full flex items-center justify-center text-red-600">
        {icon}
      </div>
      <span className="text-[11px] font-black uppercase text-red-600 leading-tight">{label}</span>
    </button>
  );
}

