/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, TrendingUp, Calendar, Clock, ChevronRight, Activity, BarChart2, Scale, Plus, MessageSquare, Bell, Dumbbell, CheckCircle, DollarSign, Box } from 'lucide-react';
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

  const [showFreqCalendar, setShowFreqCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date());

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    // Convert to Mon-first: Sun=6, Mon=0...
    const startOffset = (firstDay === 0 ? 6 : firstDay - 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { startOffset, daysInMonth };
  };

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const [showTreinosExtra, setShowTreinosExtra] = useState(false);
  const [showTreinos, setShowTreinos] = useState(false);
  const [treinosTab, setTreinosTab] = useState<'rotinas' | 'aerobico'>('rotinas');
  const [showMeuProgresso, setShowMeuProgresso] = useState(false);
  const [showAvaliacoes, setShowAvaliacoes] = useState(false);
  const [showFaturas, setShowFaturas] = useState(false);
  const [showArquivos, setShowArquivos] = useState(false);

  if (showFreqCalendar) {
    const { startOffset, daysInMonth } = getDaysInMonth(calMonth);
    const cells: (number | null)[] = Array(startOffset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        {/* Voltar */}
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowFreqCalendar(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Frequência de Treinos</h2>

        {/* Calendar Card */}
        <div className="mx-4 bg-white rounded-xl shadow-xl p-5 mb-6">
          {/* Month nav */}
          <div className="flex items-start justify-between mb-6">
            <button
              onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="text-[#0070f3] flex items-center gap-1 text-sm font-semibold"
            >
              <ChevronRight className="w-4 h-4 rotate-180" /> Anterior
            </button>
            <div className="text-center">
              <p className="text-slate-800 font-bold text-lg leading-tight">{calMonth.getFullYear()}</p>
              <p className="text-slate-500 text-sm">{monthNames[calMonth.getMonth()]}</p>
            </div>
            <div className="w-20" /> {/* spacer */}
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Seg.','Ter.','Qua.','Qui.','Sex.','Sáb.','Dom.'].map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-slate-500">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => (
              <div key={i} className="flex items-center justify-center py-1">
                {day !== null ? (
                  <div className="w-9 h-9 rounded-full bg-[#f0f4f8] flex items-center justify-center text-slate-700 text-[13px] font-medium">
                    {day}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Ver ano completo */}
          <div className="text-right mt-4">
            <button className="text-[#0070f3] text-sm font-semibold">Ver ano completo</button>
          </div>
        </div>
      </div>
    );
  }

  if (showTreinosExtra) {
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        {/* Voltar */}
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowTreinosExtra(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Treinos Extra</h2>

        {/* Empty state card */}
        <div className="mx-4 bg-white rounded-xl shadow-xl flex flex-col items-center justify-center py-16 px-6">
          <div className="w-20 h-20 rounded-full bg-[#dbeafe] flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6M5 8.5A2.5 2.5 0 017.5 6h9A2.5 2.5 0 0119 8.5v9a2.5 2.5 0 01-2.5 2.5h-9A2.5 2.5 0 015 17.5v-9z" />
            </svg>
          </div>
          <p className="text-slate-800 font-bold text-[16px] text-center leading-snug">
            Seu professor ainda não adicionou<br />nenhum treino extra!
          </p>
        </div>
      </div>
    );
  }

  if (showTreinos) {
    return (
      <div className="flex flex-col min-h-full bg-[#f4f6fa]">
        {/* Navy top section */}
        <div className="bg-[#1c2b3e] px-4 pt-4 pb-0">
          <button onClick={() => setShowTreinos(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition mb-2">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
          <h2 className="text-white text-xl font-semibold mb-4">Treinos</h2>

          {/* Tabs */}
          <div className="flex rounded-t-lg overflow-hidden">
            <button
              onClick={() => setTreinosTab('rotinas')}
              className={`flex-1 py-3 text-sm font-bold transition ${treinosTab === 'rotinas' ? 'bg-[#0070f3] text-white' : 'bg-white text-slate-700'}`}
            >
              Rotinas de Treinos
            </button>
            <button
              onClick={() => setTreinosTab('aerobico')}
              className={`flex-1 py-3 text-sm font-bold transition ${treinosTab === 'aerobico' ? 'bg-[#0070f3] text-white' : 'bg-white text-slate-700'}`}
            >
              Aeróbico
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white flex-1 flex flex-col items-center justify-center py-20 px-6 mx-0">
          {treinosTab === 'rotinas' ? (
            <>
              <div className="w-20 h-20 rounded-full bg-[#dbeafe] flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6.5h11M6.5 9.5h11M6.5 12.5h7M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 15l2 2 4-4" />
                </svg>
              </div>
              <p className="text-slate-800 font-bold text-[16px] text-center leading-snug">
                Seu professor ainda não disponibilizou nenhum treino!
              </p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-[#dbeafe] flex items-center justify-center mb-6">
                {/* Running person icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#0070f3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="13" cy="4" r="1.5" fill="currentColor" stroke="none"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 8.5l1.5 3L9 15l-2.5 3M14.5 8.5l1.5 2-3 2.5M10 8.5l2.5-1.5 2 1.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 18l2-3.5 2.5 1.5 1-4 3 1.5" />
                </svg>
              </div>
              <p className="text-slate-800 font-bold text-[16px] text-center leading-snug mb-3">
                Você ainda não tem um treino aeróbico
              </p>
              <p className="text-slate-500 text-sm text-center leading-relaxed">
                Quando seu professor adicionar um treino aeróbico, ele aparecerá aqui.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (showMeuProgresso) {
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        {/* Voltar */}
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowMeuProgresso(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Meu Progresso</h2>

        {/* Card */}
        <div className="mx-4 bg-white rounded-xl shadow-xl flex flex-col items-center py-14 px-6">
          {/* Photo icon */}
          <div className="w-20 h-20 rounded-full bg-[#dbeafe] flex items-center justify-center mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="5" width="18" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L7 19" />
            </svg>
          </div>

          {/* Text with colored words */}
          <p className="text-slate-800 font-bold text-[16px] text-center leading-snug mb-8">
            Envie uma{' '}
            <span className="text-[#0070f3]">foto</span>
            {' '}para o seu professor acompanhar seu{' '}
            <span className="text-[#0070f3]">progresso</span>!
          </p>

          {/* Enviar foto button */}
          <label className="w-full bg-[#0070f3] hover:bg-[#005ccc] text-white font-semibold py-3.5 rounded-md flex items-center justify-center cursor-pointer transition text-sm">
            Enviar foto
            <input type="file" accept="image/*" className="hidden" />
          </label>
        </div>
      </div>
    );
  }

  if (showAvaliacoes) {
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowAvaliacoes(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Suas Avaliações</h2>
        <div className="mx-4 bg-white rounded-xl shadow-xl flex flex-col items-center justify-center py-16 px-6">
          <div className="w-20 h-20 rounded-full bg-[#dbeafe] flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4" />
            </svg>
          </div>
          <p className="text-slate-800 font-bold text-[16px] text-center leading-snug">
            Seu professor ainda não disponibilizou nenhuma avaliação
          </p>
        </div>
      </div>
    );
  }

  if (showFaturas) {
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowFaturas(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Planos e Faturas</h2>
        <div className="mx-4 bg-white rounded-xl shadow-xl flex flex-col items-center justify-center py-16 px-6">
          <div className="w-20 h-20 rounded-full bg-[#dbeafe] flex items-center justify-center mb-6">
            <DollarSign className="w-10 h-10 text-[#0070f3]" />
          </div>
          <p className="text-slate-800 font-bold text-[16px] text-center leading-snug">
            Seu professor ainda não lançou nenhum plano ou fatura
          </p>
        </div>
      </div>
    );
  }

  if (showArquivos) {
    const categories = [
      { label: 'Planos alimentares', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h.01M12 3v1M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zM9 12a3 3 0 006 0" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 19l2-5h10l2 5" />
        </svg>
      )},
      { label: 'Exames médicos', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0 3.314-3.134 6-7 6s-7-2.686-7-6 3.134-6 7-6c1.94 0 3.694.757 4.97 1.984" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l1.5-1.5M18 6l-1.5 1.5M12 9v3l2 1" />
        </svg>
      )},
      { label: 'Planners', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M9 21V9" />
        </svg>
      )},
      { label: 'Arquivos diversos', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )},
    ];
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowArquivos(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Arquivos</h2>

        <div className="mx-4 bg-white rounded-xl shadow-xl overflow-hidden">
          {/* Icon + headline */}
          <div className="flex flex-col items-center pt-8 pb-4 px-6">
            <div className="w-16 h-16 rounded-full bg-[#dbeafe] flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <p className="text-slate-800 font-bold text-[16px] text-center leading-snug">
              Envie <span className="text-[#0070f3]">arquivos</span> para o seu professor!
            </p>
          </div>

          {/* Category list */}
          <div className="divide-y divide-slate-100 px-4 pb-2">
            {categories.map((cat, i) => (
              <div key={i} className="flex items-center gap-4 py-4">
                <div className="w-10 h-10 rounded-full bg-[#eff6ff] flex items-center justify-center shrink-0">
                  {cat.icon}
                </div>
                <span className="text-slate-700 font-medium text-sm">{cat.label}</span>
              </div>
            ))}
          </div>

          {/* Button */}
          <div className="px-4 pb-6 pt-2">
            <label className="w-full bg-[#0070f3] hover:bg-[#005ccc] text-white font-semibold py-3.5 rounded-md flex items-center justify-center cursor-pointer transition text-sm">
              Adicionar arquivos
              <input type="file" className="hidden" multiple />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-[#F4F6FA] overflow-y-auto">
      {/* Header Extension (Dark Blue) */}
      <div className="bg-[#1c2b3e] px-4 pt-4 pb-8 flex flex-col items-center">
        {/* Avatar and Info */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#0070f3] mb-2 bg-slate-400">
            {/* The user avatar from the screenshot. The top header already has the logo, but the screenshot has an avatar here too? Wait, the screenshot shows the logo at the very top, and then the trainer's avatar. */}
            <div className="w-full h-full bg-slate-500 flex items-center justify-center text-white text-xl">
              C
            </div>
          </div>
          <h2 className="text-white text-sm font-medium">Cadu Ponce</h2>
          <p className="text-slate-400 text-xs">CREF: 044859-G\PR</p>
        </div>

        {/* Greeting */}
        <div className="w-full mt-6 text-left">
          <h1 className="text-white text-xl font-medium">Boa noite, {user?.name?.split(' ')[0] || 'Aluno'}!</h1>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4 pb-6">
        {/* Frequência de Treinos */}
        <button
          onClick={() => setShowFreqCalendar(true)}
          className="w-full bg-white rounded-xl shadow-sm p-4 relative z-10 text-left"
        >
          <h3 className="text-slate-800 font-bold text-[15px] mb-4">Frequência de Treinos</h3>
          <div className="flex justify-between items-center px-1">
            {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${i === 0 ? 'border-red-500 text-red-500' : 'border-[#0070f3] text-[#0070f3]'}`}>
                  {i === 0 && <span className="font-bold">!</span>}
                </div>
                <span className="text-[10px] font-bold text-slate-600">{day}</span>
              </div>
            ))}
          </div>
        </button>


        {/* Grid de Botões */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={() => { setShowTreinos(true); setTreinosTab('rotinas'); }}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Dumbbell className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Treinos</span>
          </button>
          
          <button
            onClick={() => setShowTreinosExtra(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Treinos<br/>Extras</span>
          </button>
          
          <button
            onClick={() => setShowAvaliacoes(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Avaliações</span>
          </button>
          
          <button
            onClick={() => setShowMeuProgresso(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Meu<br/>Progresso</span>
          </button>
          
          <button
            onClick={() => setShowFaturas(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Faturas</span>
          </button>
          
          <button
            onClick={() => setShowArquivos(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Box className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Arquivos</span>
          </button>
        </div>
      </div>
    </div>
  );
}
