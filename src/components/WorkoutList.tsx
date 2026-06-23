/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Dumbbell, ChevronRight, Plus, Calendar, Clock, Download,
  PlayCircle, Flame, Trophy, Zap, Target, Timer, CheckCircle2,
  Star, Award, TrendingUp, MessageCircle
} from 'lucide-react';
import { Workout, AdminRoutine } from '../types';
import { generateWorkoutPDF } from '../lib/pdfGenerator';
import { storage } from '../lib/storage';
import AdminWorkoutSession from './AdminWorkoutSession';
import { motion, AnimatePresence } from 'motion/react';

interface WorkoutListProps {
  workouts: Workout[];
  onSelectWorkout: (workout: Workout) => void;
  trainerPhone?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const getDayOfWeek = () => {
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return days[new Date().getDay()];
};

const getLastWorkoutLog = (routineId: string) => {
  try {
    const logs = JSON.parse(localStorage.getItem('cadu_workout_logs') ?? '[]');
    return logs.find((l: any) => l.routineId === routineId) ?? null;
  } catch { return null; }
};

const getDaysSince = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Ontem';
  return `${d}d atrás`;
};

const getStreak = () => {
  try {
    const logs: any[] = JSON.parse(localStorage.getItem('cadu_workout_logs') ?? '[]');
    if (!logs.length) return 0;
    const dates = [...new Set(logs.map((l: any) => l.completedAt?.slice(0, 10)))].sort().reverse();
    let streak = 0;
    let expected = new Date();
    for (const d of dates) {
      const diff = Math.floor((expected.getTime() - new Date(d).getTime()) / 86400000);
      if (diff <= 1) { streak++; expected = new Date(d); }
      else break;
    }
    return streak;
  } catch { return 0; }
};

const difficultyConfig = (d: string) => {
  if (!d) return { color: 'text-slate-400', bg: 'bg-slate-100', dot: 'bg-slate-400' };
  const dl = d.toLowerCase();
  if (dl.includes('inici')) return { color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-500' };
  if (dl.includes('inter')) return { color: 'text-amber-700', bg: 'bg-amber-100', dot: 'bg-amber-500' };
  if (dl.includes('avan')) return { color: 'text-red-700', bg: 'bg-red-100', dot: 'bg-red-500' };
  return { color: 'text-slate-500', bg: 'bg-slate-100', dot: 'bg-slate-400' };
};

const isToday = (routine: AdminRoutine) => {
  const day = getDayOfWeek();
  return routine.name.toLowerCase().includes(day.toLowerCase());
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorkoutList({ workouts, onSelectWorkout, trainerPhone }: WorkoutListProps) {
  const cleanPhone = (trainerPhone || '5511999999999').replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=Olá%20Cadu%2C%20tenho%20uma%20dúvida%20sobre%20meu%20treino!`;

  const [adminRoutines, setAdminRoutines] = useState<AdminRoutine[]>([]);
  const [activeSession, setActiveSession] = useState<AdminRoutine | null>(null);
  const [streak] = useState(() => getStreak());


  useEffect(() => {
    // Load from cache first
    const uid = (() => { try { return JSON.parse(localStorage.getItem('cadu_ponce_user') || '{}').uid; } catch { return null; } })();
    const cached = storage.getAdminRoutines().filter((r: AdminRoutine) => r.studentIds?.includes(uid));
    setAdminRoutines(cached);

    // Then fetch fresh from Supabase
    storage.fetchAdminRoutines().then(all => {
      setAdminRoutines(all.filter((r: AdminRoutine) => r.studentIds?.includes(uid)));
    }).catch(() => { /* already set from cache */ });
  }, []);

  if (activeSession) {
    return (
      <AdminWorkoutSession
        routine={activeSession}
        onClose={() => setActiveSession(null)}
      />
    );
  }

  const todayRoutines = adminRoutines.filter(isToday);
  const otherRoutines = adminRoutines.filter(r => !isToday(r));
  const today = getDayOfWeek();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 pb-28 transition-colors">
      {/* ── Hero Header ───────────────────────────────────────────────────── */}
      <div className="bg-slate-950 px-6 pt-6 pb-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">{today}-feira</p>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
              Meus Treinos
            </h1>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-3 py-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-amber-400 text-base font-black leading-none">{streak}</p>
                <p className="text-amber-500/70 text-[9px] font-bold uppercase">dias</p>
              </div>
            </div>
          )}
        </div>

      </div>

      <div className="px-5 pt-5 space-y-5">
        {/* ── TREINOS ─────────────────────────────────────── */}
        <>
          {/* Today's workout highlight */}
            {todayRoutines.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4 text-[#dc2626]" />
                  <p className="text-slate-900 dark:text-white text-sm font-black uppercase tracking-wider">Treino de Hoje</p>
                </div>
                {todayRoutines.map(routine => (
                  <TodayCard key={routine.id} routine={routine as AdminRoutine} onStart={() => setActiveSession(routine as AdminRoutine)} />
                ))}
              </div>
            )}

            {/* Other routines */}
            {otherRoutines.length > 0 && (
              <div>
                {todayRoutines.length > 0 && (
                  <p className="text-slate-400 text-xs font-black uppercase tracking-wider mb-3">Outras Fichas</p>
                )}
                <div className="space-y-3">
                  {otherRoutines.map((routine, i) => (
                    <RoutineCard key={routine.id} routine={routine as AdminRoutine} index={i} onStart={() => setActiveSession(routine as AdminRoutine)} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {adminRoutines.length === 0 && (
              <EmptyState
                icon={<Dumbbell className="w-8 h-8 text-slate-400" />}
                title="Nenhuma ficha prescrita"
                subtitle="Seu treinador ainda não atribuiu fichas para você."
              />
            )}
          </>

        {/* ── WhatsApp support ──────────────────────────────────────────── */}
        <div className="mt-4 bg-slate-950 dark:bg-slate-900 rounded-[28px] p-5 border border-slate-900 dark:border-slate-800 shadow-xl relative overflow-hidden">
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600/20 rounded-2xl flex items-center justify-center shrink-0">
              <MessageCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-white font-black italic uppercase tracking-tighter text-sm">Fale com seu Treinador</h4>
              <p className="text-slate-500 text-[11px]">Tire dúvidas sobre execução ou ajuste de ficha.</p>
            </div>
          </div>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 rounded-2xl shadow-lg shadow-emerald-900/20 active:scale-95 transition-all uppercase tracking-tighter italic block text-center text-sm"
          >
            Chamar no WhatsApp
          </a>
          <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-emerald-600/10 rounded-full blur-2xl" />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TodayCard({ routine, onStart }: { key?: React.Key; routine: AdminRoutine; onStart: () => void }) {
  const log = getLastWorkoutLog(routine.id);
  const dc = difficultyConfig(routine.difficulty);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-[#dc2626] to-red-800 rounded-3xl p-5 shadow-2xl shadow-red-900/40 relative overflow-hidden"
    >
      {/* Decorative circle */}
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/5 rounded-full" />
      <div className="absolute -right-4 -bottom-12 w-32 h-32 bg-white/5 rounded-full" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-2">
              <Flame className="w-2.5 h-2.5" /> Treino de Hoje
            </span>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white leading-tight">
              {routine.name}
            </h3>
          </div>
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0">
            <Dumbbell className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <span className="text-white/70 text-[11px] font-bold">
            {routine.exercises.length} exercícios
          </span>
          {routine.goal && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-white/70 text-[11px] font-bold">{routine.goal}</span>
            </>
          )}
          {log && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-white/70 text-[11px] font-bold">Último: {getDaysSince(log.completedAt)}</span>
            </>
          )}
        </div>

        <button
          onClick={onStart}
          className="w-full bg-white text-[#dc2626] font-black italic uppercase text-sm tracking-widest py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          <Flame className="w-4 h-4" />
          Iniciar Treino Agora
        </button>
      </div>
    </motion.div>
  );
}

function RoutineCard({ routine, index, onStart }: { key?: React.Key; routine: AdminRoutine; index: number; onStart: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const log = getLastWorkoutLog(routine.id);
  const dc = difficultyConfig(routine.difficulty);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm"
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
          <Dumbbell className="w-6 h-6 text-slate-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="text-slate-900 dark:text-white font-black italic text-sm truncate">{routine.name}</h3>
            {log && (
              <span className="text-emerald-600 text-[9px] font-black flex items-center gap-0.5 shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5" /> {getDaysSince(log.completedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[10px] font-medium">{routine.exercises.length} exercícios</span>
            {routine.difficulty && (
              <>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className={`text-[9px] font-black uppercase tracking-wider ${dc.color}`}>
                  {routine.difficulty}
                </span>
              </>
            )}
          </div>
        </div>

        <ChevronRight className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded preview */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              {routine.notes && (
                <p className="text-slate-500 text-xs italic mb-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">{routine.notes}</p>
              )}
              {routine.exercises.slice(0, 4).map((ex, i) => (
                <div key={ex.id} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-4 h-4 bg-slate-100 dark:bg-slate-700 rounded text-[9px] font-black text-slate-500 flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-slate-800 dark:text-white text-xs font-bold truncate">{ex.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-400 text-[10px]">{ex.sets}×{ex.reps}</span>
                    {(ex.videoUrl || ex.videoFileUrl) && (
                      <PlayCircle className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>
                </div>
              ))}
              {routine.exercises.length > 4 && (
                <p className="text-slate-400 text-[10px] text-center font-medium pt-1">
                  +{routine.exercises.length - 4} exercícios
                </p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onStart(); }}
                className="w-full mt-3 bg-[#dc2626] hover:bg-red-500 text-white font-black italic uppercase text-xs tracking-widest py-3.5 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-md shadow-red-200 dark:shadow-none"
              >
                <Flame className="w-3.5 h-3.5" />
                Iniciar Treino
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PersonalWorkoutCard({ workout, onSelect }: { key?: React.Key; workout: Workout; onSelect: (w: Workout) => void }) {
  const studentName = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('cadu_user') ?? '{}');
      return u?.name || 'Aluno';
    } catch { return 'Aluno'; }
  })();

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 p-4 group">
      <div className="w-12 h-12 bg-red-50 dark:bg-red-950/20 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#dc2626] group-hover:text-white transition-colors">
        <Dumbbell className="w-6 h-6 text-red-500 group-hover:text-white transition-colors" />
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(workout)}>
        <h3 className="text-slate-900 dark:text-white font-black italic text-sm truncate">{workout.name}</h3>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-slate-400 text-[10px] font-medium flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {workout.exercises.length} exercícios
          </span>
          <span className="text-slate-400 text-[10px] font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" /> ~45-60 min
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={e => { e.stopPropagation(); generateWorkoutPDF(workout, studentName); }}
          className="w-9 h-9 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition active:scale-95"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={() => onSelect(workout)}
          className="w-9 h-9 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-xl flex items-center justify-center hover:bg-[#dc2626] dark:hover:bg-[#dc2626] dark:hover:text-white transition active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <p className="text-slate-700 dark:text-white font-bold text-sm">{title}</p>
      <p className="text-slate-400 text-xs mt-1">{subtitle}</p>
    </div>
  );
}
