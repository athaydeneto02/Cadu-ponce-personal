/**
 * AdminWorkoutSession.tsx
 * Sessão de treino para fichas prescritas pelo treinador (AdminRoutine).
 * Funcionalidades: exercício a exercício, checklist de sets, cargas por set,
 * timer de descanso animado, vídeo de referência, tela de conclusão com confetti.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, Check, Timer, Trophy,
  Star, Flame, PlayCircle, Info, Dumbbell, Clock,
  RotateCcw, Pause, Play, Volume2, Target, Zap, Award
} from 'lucide-react';
import { AdminRoutine, AdminExercise, WorkoutLog } from '../types';
import { storage } from '../lib/storage';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

interface AdminWorkoutSessionProps {
  routine: AdminRoutine;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseRestSeconds = (restStr: string): number => {
  if (!restStr) return 60;
  const sec = restStr.match(/(\d+)\s*s/i);
  if (sec) return parseInt(sec[1]);
  const min = restStr.match(/(\d+)\s*min/i);
  if (min) return parseInt(min[1]) * 60;
  const num = parseInt(restStr);
  return isNaN(num) ? 60 : num;
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const difficultyColor = (d: string) => {
  if (!d) return 'bg-slate-100 text-slate-600';
  const dl = d.toLowerCase();
  if (dl.includes('inici')) return 'bg-emerald-100 text-emerald-700';
  if (dl.includes('inter')) return 'bg-amber-100 text-amber-700';
  if (dl.includes('avan')) return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-600';
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminWorkoutSession({ routine, onClose }: AdminWorkoutSessionProps) {
  const exercises = routine.exercises;
  const total = exercises.length;

  // Screen: 'intro' | 'session' | 'finish'
  const [screen, setScreen] = useState<'intro' | 'session' | 'finish'>('intro');
  const [currentIdx, setCurrentIdx] = useState(0);
  const currentEx = exercises[currentIdx] ?? exercises[0];

  // Session timer
  const [sessionTime, setSessionTime] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);

  // Per-exercise set tracking: { exId: boolean[] }
  const [checkedSets, setCheckedSets] = useState<Record<string, boolean[]>>({});

  // Per-exercise per-set loads: { exId: number[] }
  const [loads, setLoads] = useState<Record<string, number[]>>(() => {
    const init: Record<string, number[]> = {};
    exercises.forEach(e => {
      const n = Number(e.sets) || 1;
      const arr = Array(n).fill(0);
      if (e.prescribedLoads) {
        e.prescribedLoads.forEach((v, i) => { if (i < n && v) arr[i] = v; });
      }
      init[e.id] = arr;
    });
    return init;
  });

  // Completed exercise ids
  const [completedExs, setCompletedExs] = useState<Set<string>>(new Set());

  // Rest timer
  const [isResting, setIsResting] = useState(false);
  const [restLeft, setRestLeft] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [restPaused, setRestPaused] = useState(false);
  const [restAlert, setRestAlert] = useState(false);
  const [restMinimized, setRestMinimized] = useState(false);

  // Video modal
  const [showVideo, setShowVideo] = useState(false);

  // RPE
  const [rpe, setRpe] = useState(0);
  const [hoverRpe, setHoverRpe] = useState(0);

  // Swipe
  const touchStartX = useRef<number | null>(null);

  // ── Session timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionActive || screen === 'finish') return;
    const id = setInterval(() => setSessionTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [sessionActive, screen]);

  // ── Rest countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isResting || restPaused || restLeft <= 0) return;
    const id = setInterval(() => {
      setRestLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          setRestAlert(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isResting, restPaused, restLeft]);

  // ── Confetti on finish ─────────────────────────────────────────────────────
  useEffect(() => {
    if (screen === 'finish') {
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
      setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } }), 300);
      setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } }), 500);
    }
  }, [screen]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getSets = (ex: AdminExercise) => {
    const n = Number(ex.sets) || 1;
    return checkedSets[ex.id] ?? Array(n).fill(false);
  };

  const allSetsChecked = (ex: AdminExercise) => getSets(ex).every(Boolean);

  const toggleSet = (ex: AdminExercise, idx: number) => {
    const n = Number(ex.sets) || 1;
    const current = [...getSets(ex)];
    const newVal = !current[idx];
    current[idx] = newVal;
    setCheckedSets(prev => ({ ...prev, [ex.id]: current }));

    // Auto-start rest timer when checking a set
    if (newVal) {
      const secs = parseRestSeconds(ex.rest);
      setRestTotal(secs);
      setRestLeft(secs);
      setIsResting(true);
      setRestPaused(false);
      setRestAlert(false);
      setRestMinimized(false);
    }

    // Mark exercise complete when all sets done
    if (current.every(Boolean)) {
      setCompletedExs(prev => new Set(prev).add(ex.id));
    } else {
      setCompletedExs(prev => {
        const s = new Set(prev);
        s.delete(ex.id);
        return s;
      });
    }
  };

  const updateLoad = (exId: string, setIdx: number, val: number) => {
    setLoads(prev => {
      const arr = [...(prev[exId] ?? [])];
      arr[setIdx] = isNaN(val) ? 0 : val;
      return { ...prev, [exId]: arr };
    });
  };

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= total) return;
    setCurrentIdx(idx);
    setIsResting(false);
    setRestAlert(false);
  };

  const handleNext = () => {
    if (currentIdx < total - 1) {
      goTo(currentIdx + 1);
    } else {
      saveLog();
      setScreen('finish');
    }
  };

  const saveLog = () => {
    try {
      const user = (() => { try { return JSON.parse(localStorage.getItem('cadu_ponce_user') ?? '{}'); } catch { return {}; } })();
      const log: WorkoutLog = {
        id: `log_${Date.now()}`,
        studentId: user.uid ?? 'unknown',
        studentName: user.name ?? undefined,
        routineId: routine.id,
        routineName: routine.name,
        completedAt: new Date().toISOString(),
        durationSeconds: sessionTime,
        rpe,
        exercisesSummary: exercises.map(ex => ({
          name: ex.name,
          setsCompleted: (checkedSets[ex.id] ?? []).filter(Boolean).length,
          totalSets: Number(ex.sets) || 1,
          loads: loads[ex.id] ?? [],
        })),
      };

      // Save via storage layer (localStorage + Supabase)
      storage.saveWorkoutLog(log);

      // Notify trainer via localStorage event
      const notif = {
        id: `notif_${Date.now()}`,
        type: 'treinos',
        title: 'Treino Concluído',
        body: `${log.studentName ?? 'Aluno'} concluiu "${routine.name}" em ${fmt(sessionTime)}`,
        date: new Date().toISOString(),
        read: false,
      };
      const existingNotifs = JSON.parse(localStorage.getItem('cadu_notifs_admin') ?? '[]');
      localStorage.setItem('cadu_notifs_admin', JSON.stringify([notif, ...existingNotifs]));
      window.dispatchEvent(new CustomEvent('cadu_new_notification', { detail: notif }));
    } catch { /* silent */ }
  };

  // ── Swipe handling ─────────────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0) handleNext();
      else if (currentIdx > 0) goTo(currentIdx - 1);
    }
    touchStartX.current = null;
  };

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalSetsCompleted = exercises.reduce((acc, ex) => {
    return acc + (checkedSets[ex.id] ?? []).filter(Boolean).length;
  }, 0);
  const totalSets = exercises.reduce((acc, ex) => acc + (Number(ex.sets) || 1), 0);
  const totalVolume = exercises.reduce((acc, ex) => {
    const setsArr = checkedSets[ex.id] ?? [];
    const loadsArr = loads[ex.id] ?? [];
    const repsNum = parseInt(ex.reps) || 10;
    return acc + setsArr.reduce((s, done, i) => done ? s + (loadsArr[i] || 0) * repsNum : s, 0);
  }, 0);

  // ── Rest timer circular progress ──────────────────────────────────────────
  const restProgress = restTotal > 0 ? restLeft / restTotal : 0;
  const circleR = 30;
  const circleC = 2 * Math.PI * circleR;

  // ── Video URL ─────────────────────────────────────────────────────────────
  const videoUrl = currentEx?.videoFileUrl || currentEx?.videoUrl;
  const isYoutube = videoUrl?.includes('youtube') || videoUrl?.includes('youtu.be');
  const getYoutubeEmbed = (url: string) => {
    const m = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : url;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INTRO SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'intro') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-safe-top pt-6 pb-4">
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ficha Prescrita</span>
          <div className="w-9" />
        </div>

        {/* Content */}
        <div className="flex-1 px-5 pb-8">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="w-20 h-20 bg-[#dc2626] rounded-[28px] flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-red-900/50">
              <Dumbbell className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white mb-2 leading-none">
              {routine.name}
            </h1>
            <div className="flex items-center justify-center gap-2 flex-wrap mt-3">
              {routine.goal && (
                <span className="bg-red-950/50 border border-red-900/40 text-red-400 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full">
                  {routine.goal}
                </span>
              )}
              {routine.difficulty && (
                <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${difficultyColor(routine.difficulty)}`}>
                  {routine.difficulty}
                </span>
              )}
              <span className="bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full">
                {total} exercícios
              </span>
            </div>
          </motion.div>

          {/* Trainer notes */}
          {routine.notes && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-blue-950/30 border border-blue-900/30 rounded-2xl p-4 mb-6 flex gap-3"
            >
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-blue-200 text-sm leading-relaxed">{routine.notes}</p>
            </motion.div>
          )}

          {/* Exercise list preview */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="space-y-2 mb-8"
          >
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-3">Exercícios</p>
            {exercises.map((ex, i) => (
              <div key={ex.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="w-7 h-7 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 text-[10px] font-black shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-bold truncate">{ex.name}</p>
                  <p className="text-slate-500 text-[10px] font-medium">{ex.sets}×{ex.reps} · {ex.rest}</p>
                </div>
                {(ex.videoUrl || ex.videoFileUrl) && (
                  <PlayCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
              </div>
            ))}
          </motion.div>

          {/* Start button */}
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            onClick={() => { setScreen('session'); setSessionActive(true); }}
            className="w-full bg-[#dc2626] hover:bg-red-500 active:scale-95 text-white font-black italic uppercase text-sm tracking-widest py-5 rounded-2xl shadow-2xl shadow-red-900/50 transition-all flex items-center justify-center gap-3"
          >
            <Flame className="w-5 h-5" />
            Iniciar Treino
          </motion.button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINISH SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'finish') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-28 h-28 bg-gradient-to-br from-amber-400 to-red-600 rounded-[36px] flex items-center justify-center mb-6 shadow-2xl shadow-red-900/60"
          >
            <Trophy className="w-14 h-14 text-white" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-8"
          >
            <p className="text-amber-400 text-[10px] font-black uppercase tracking-widest mb-2">Treino Concluído!</p>
            <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-none mb-1">
              Incrível! 🔥
            </h2>
            <p className="text-slate-400 text-sm">{routine.name}</p>
          </motion.div>

          {/* Stats grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full grid grid-cols-3 gap-3 mb-8"
          >
            {[
              { icon: <Clock className="w-5 h-5" />, value: fmt(sessionTime), label: 'Duração' },
              { icon: <Target className="w-5 h-5" />, value: `${totalSetsCompleted}/${totalSets}`, label: 'Séries' },
              { icon: <Zap className="w-5 h-5" />, value: `${totalVolume > 0 ? `${totalVolume}kg` : `${completedExs.size}/${total}`}`, label: totalVolume > 0 ? 'Volume' : 'Exercícios' },
            ].map((stat, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
                <div className="text-red-500 flex justify-center mb-2">{stat.icon}</div>
                <p className="text-white font-black text-lg">{stat.value}</p>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </motion.div>

          {/* RPE */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6"
          >
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 text-center">
              Como foi o treino?
            </p>
            <div className="flex justify-center gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onMouseEnter={() => setHoverRpe(n)}
                  onMouseLeave={() => setHoverRpe(0)}
                  onClick={() => setRpe(n)}
                  className={`w-7 h-7 rounded-full text-[11px] font-black transition-all ${
                    n <= (hoverRpe || rpe)
                      ? 'bg-[#dc2626] text-white scale-110'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {rpe > 0 && (
              <p className="text-center text-slate-400 text-xs mt-3">
                {rpe <= 3 ? '😌 Tranquilo' : rpe <= 6 ? '💪 Bom desafio' : rpe <= 8 ? '🔥 Intenso' : '💀 No limite!'}
              </p>
            )}
          </motion.div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="w-full space-y-3"
          >
            <button
              onClick={onClose}
              className="w-full bg-[#dc2626] hover:bg-red-500 active:scale-95 text-white font-black italic uppercase text-sm tracking-widest py-5 rounded-2xl shadow-2xl shadow-red-900/50 transition-all"
            >
              Concluir
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION SCREEN
  // ═══════════════════════════════════════════════════════════════════════════

  const setsArr = getSets(currentEx);
  const loadsArr = loads[currentEx.id] ?? [];
  const numSets = Number(currentEx.sets) || 1;
  const exCompleted = allSetsChecked(currentEx);
  const hasVideo = !!(currentEx.videoUrl || currentEx.videoFileUrl);

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-50 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Top Header ─────────────────────────────────────────────────────── */}
      <div className="bg-slate-950 px-5 pt-safe-top pt-4 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {exercises.map((ex, i) => (
              <button
                key={ex.id}
                onClick={() => goTo(i)}
                className={`rounded-full transition-all ${
                  i === currentIdx
                    ? 'w-6 h-2 bg-[#dc2626]'
                    : completedExs.has(ex.id)
                    ? 'w-2 h-2 bg-emerald-500'
                    : 'w-2 h-2 bg-slate-700 hover:bg-slate-600'
                }`}
              />
            ))}
          </div>

          {/* Session timer */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <Timer className="w-3 h-3 text-slate-500" />
            <span className="text-white text-[11px] font-black">{fmt(sessionTime)}</span>
          </div>
        </div>

        {/* Exercise counter */}
        <div className="flex items-center justify-between">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
            Exercício {currentIdx + 1} de {total}
          </p>
          {exCompleted && (
            <span className="flex items-center gap-1 bg-emerald-900/40 border border-emerald-800/40 text-emerald-400 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full">
              <Check className="w-2.5 h-2.5" /> Concluído
            </span>
          )}
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="p-5 space-y-4"
          >
            {/* Exercise name card */}
            <div className={`rounded-2xl p-5 transition-all ${exCompleted ? 'bg-emerald-50 border border-emerald-200' : 'bg-white border border-slate-200 shadow-sm'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                    {currentEx.notes ? '' : routine.name}
                  </p>
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 leading-tight">
                    {currentEx.name}
                  </h2>
                </div>
                {hasVideo && (
                  <button
                    onClick={() => setShowVideo(true)}
                    className="w-11 h-11 bg-[#dc2626] rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-red-200 active:scale-95 transition"
                    title="Ver execução"
                  >
                    <PlayCircle className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>

              {/* Sets × Reps pill row */}
              <div className="flex items-center gap-3 mt-4">
                <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Séries</p>
                  <p className="text-2xl font-black text-slate-900">{currentEx.sets}</p>
                </div>
                <div className="text-slate-300 font-black text-xl">×</div>
                <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reps</p>
                  <p className="text-2xl font-black text-slate-900">{currentEx.reps}</p>
                </div>
                <div className="text-slate-300 font-black text-xl">·</div>
                <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descanso</p>
                  <p className="text-lg font-black text-slate-900">{currentEx.rest || '60s'}</p>
                </div>
              </div>
            </div>

            {/* Trainer notes */}
            {currentEx.notes && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-blue-700 text-sm leading-relaxed">{currentEx.notes}</p>
              </div>
            )}

            {/* Sets checklist */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-slate-900 text-xs font-black uppercase tracking-wider">Séries & Cargas</p>
                <p className="text-slate-400 text-[10px] font-medium">
                  {setsArr.filter(Boolean).length}/{numSets} concluídas
                </p>
              </div>

              <div className="divide-y divide-slate-50">
                {Array.from({ length: numSets }, (_, i) => {
                  const done = setsArr[i] ?? false;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${done ? 'bg-emerald-50/60' : 'hover:bg-slate-50/50'}`}
                    >
                      {/* Set label */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-all ${done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                      </div>

                      {/* Reps */}
                      <span className="text-slate-500 text-xs font-bold w-14 shrink-0">
                        {currentEx.reps} reps
                      </span>

                      {/* Load input */}
                      <div className="flex-1 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={loadsArr[i] || ''}
                          onChange={e => updateLoad(currentEx.id, i, parseFloat(e.target.value))}
                          placeholder="0"
                          className="w-full text-sm font-black text-slate-900 bg-transparent outline-none"
                        />
                        <span className="text-slate-400 text-[10px] font-bold shrink-0">kg</span>
                      </div>

                      {/* Check button */}
                      <button
                        onClick={() => toggleSet(currentEx, i)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 ${
                          done
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                            : 'bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-500'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress of all exercises */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-3">Progresso do Treino</p>
              <div className="grid grid-cols-5 gap-1.5">
                {exercises.map((ex, i) => {
                  const isDone = completedExs.has(ex.id);
                  const isCurrent = i === currentIdx;
                  return (
                    <button
                      key={ex.id}
                      onClick={() => goTo(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        isDone ? 'bg-emerald-400' : isCurrent ? 'bg-[#dc2626]' : 'bg-slate-200'
                      }`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-slate-400 text-[10px]">{completedExs.size} concluídos</p>
                <p className="text-slate-400 text-[10px]">{total - completedExs.size} restantes</p>
              </div>
            </div>

            {/* Spacer for bottom bar */}
            <div className="h-4" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Rest Timer ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isResting && !restMinimized && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`absolute bottom-0 left-0 right-0 rounded-t-3xl border-t shadow-2xl px-5 pt-5 pb-8 ${
              restAlert ? 'bg-emerald-950 border-emerald-900/50' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <p className={`text-xs font-black uppercase tracking-widest ${restAlert ? 'text-emerald-400' : 'text-slate-400'}`}>
                {restAlert ? '✅ Pronto para continuar!' : '⏱ Descanso'}
              </p>
              <button
                onClick={() => setRestMinimized(true)}
                className="text-slate-500 text-[10px] font-bold hover:text-slate-300 transition"
              >
                Minimizar
              </button>
            </div>

            <div className="flex items-center gap-6">
              {/* Circular progress */}
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r={circleR} fill="none" stroke="#1e293b" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r={circleR} fill="none"
                    stroke={restAlert ? '#10b981' : '#dc2626'}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={circleC}
                    strokeDashoffset={circleC * (1 - restProgress)}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-lg font-black ${restAlert ? 'text-emerald-400' : 'text-white'}`}>
                  {restAlert ? '✓' : fmt(restLeft)}
                </span>
              </div>

              {/* Controls */}
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setRestLeft(l => Math.max(0, l - 10))}
                    className="flex-1 bg-slate-800 text-slate-400 text-[11px] font-bold py-2 rounded-lg hover:bg-slate-700 transition"
                  >
                    -10s
                  </button>
                  <button
                    onClick={() => setRestPaused(p => !p)}
                    className="flex-1 bg-slate-800 text-slate-300 py-2 rounded-lg flex items-center justify-center hover:bg-slate-700 transition"
                  >
                    {restPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setRestLeft(l => l + 10)}
                    className="flex-1 bg-slate-800 text-slate-400 text-[11px] font-bold py-2 rounded-lg hover:bg-slate-700 transition"
                  >
                    +10s
                  </button>
                </div>
                <button
                  onClick={() => { setIsResting(false); setRestAlert(false); }}
                  className={`w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition ${
                    restAlert
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {restAlert ? 'Continuar Treino' : 'Pular Descanso'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized rest pill */}
      <AnimatePresence>
        {isResting && restMinimized && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => setRestMinimized(false)}
            className={`absolute bottom-24 right-4 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-[11px] font-black ${
              restAlert ? 'bg-emerald-500 text-white' : 'bg-slate-900 border border-slate-700 text-white'
            }`}
          >
            <Timer className="w-3.5 h-3.5" />
            {restAlert ? 'Pronto!' : fmt(restLeft)}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Bottom Navigation Bar ───────────────────────────────────────────── */}
      <div className="bg-white border-t border-slate-200 px-5 py-4 pb-safe-bottom shrink-0">
        <div className="flex gap-3">
          <button
            onClick={() => goTo(currentIdx - 1)}
            disabled={currentIdx === 0}
            className="w-12 h-12 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 disabled:opacity-30 hover:bg-slate-200 transition active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            onClick={handleNext}
            className={`flex-1 py-3.5 rounded-xl font-black italic uppercase text-sm tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 ${
              currentIdx === total - 1
                ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-200'
                : exCompleted
                ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-200'
                : 'bg-[#dc2626] hover:bg-red-500 text-white shadow-lg shadow-red-200'
            }`}
          >
            {currentIdx === total - 1 ? (
              <><Trophy className="w-4 h-4" /> Finalizar Treino</>
            ) : exCompleted ? (
              <><ChevronRight className="w-4 h-4" /> Próximo Exercício</>
            ) : (
              <><ChevronRight className="w-4 h-4" /> Avançar</>
            )}
          </button>
        </div>
      </div>

      {/* ── Video Modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showVideo && hasVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-black/90 flex flex-col"
          >
            <div className="flex items-center justify-between px-5 pt-6 pb-4">
              <p className="text-white font-bold">{currentEx.name}</p>
              <button onClick={() => setShowVideo(false)} className="p-2 text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-4">
              {isYoutube ? (
                <iframe
                  src={getYoutubeEmbed(videoUrl!)}
                  className="w-full rounded-2xl"
                  style={{ aspectRatio: '16/9' }}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              ) : (
                <video
                  src={videoUrl!}
                  controls
                  autoPlay
                  className="w-full rounded-2xl"
                  style={{ maxHeight: '60vh' }}
                />
              )}
            </div>

            <div className="px-5 pb-10">
              {currentEx.notes && (
                <p className="text-slate-400 text-sm text-center">{currentEx.notes}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
