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
        <div className="bg-white rounded-xl shadow-sm p-4 relative z-10">
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
        </div>

        {/* Pontos MFIT */}
        <div className="rounded-xl shadow-sm p-4 flex items-center justify-between" style={{ background: 'linear-gradient(to right, #0070f3, #004d99)' }}>
          <div className="text-white">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-bold italic text-sm">///</span>
              <span className="text-sm">Pontos MFIT</span>
            </div>
            <p className="text-[13px] font-medium">Treine e ganhe descontos</p>
          </div>
          <button className="text-white flex items-center gap-1 text-sm font-medium">
            Ativar <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Grid de Botões */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Dumbbell className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Treinos</span>
          </button>
          
          <button className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Treinos<br/>Extras</span>
          </button>
          
          <button className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Avaliações</span>
          </button>
          
          <button className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Meu<br/>Progresso</span>
          </button>
          
          <button className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Faturas</span>
          </button>
          
          <button className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left">
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
