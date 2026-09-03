/**
 * AdminWorkoutSession.tsx
 * Sessão de treino para fichas prescritas pelo treinador (AdminRoutine).
 * Design: MFIT PERSONAL style.
 * Fluxo: intro (visualização) → session (checklist + timer) → modal de conclusão → finish (cards deslizáveis)
 */

import React, { useState, useEffect } from 'react';
import {
  X, ChevronLeft, Check, Trophy, Dumbbell, Clock,
  Play, Home, MessageCircle, Menu, Instagram, Calendar
} from 'lucide-react';
import { AdminRoutine, AdminExercise, WorkoutLog } from '../types';
import { storage } from '../lib/storage';
import { useMediaUrl } from '../lib/mediaDb';
import confetti from 'canvas-confetti';

interface AdminWorkoutSessionProps {
  routine: AdminRoutine;
  onClose: () => void;
  trainerPhone?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDuration = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
};

const fmtTime = (date: Date): string =>
  date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const fmtTimeWithSec = (date: Date): string =>
  date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const fmtDate = (date: Date): string =>
  date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// S T Q Q S S D (Segunda→Domingo)
const WEEKDAY_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const jsDayToIdx = (jsDay: number): number => (jsDay === 0 ? 6 : jsDay - 1);

export const getExerciseVideo = (ex: AdminExercise): string => {
  const direct = (ex.videoFileUrl || ex.videoUrl || '').trim();
  if (direct && !direct.includes('mov_bbb.mp4')) return direct;

  // Lookup in custom library cache
  try {
    const rawLib = localStorage.getItem('cadu_ponce_exercises_v3');
    if (rawLib) {
      const libList = JSON.parse(rawLib);
      const match = libList.find((lib: any) =>
        (lib.title && ex.name && lib.title.toLowerCase().trim() === ex.name.toLowerCase().trim()) ||
        lib.id === ex.id
      );
      if (match && match.videoUrl && !match.videoUrl.includes('mov_bbb.mp4')) {
        return match.videoUrl;
      }
    }
  } catch {}
  return '';
};

function VideoModalInner({ name, url, onClose }: { name: string; url?: string; onClose: () => void }) {
  const resolved = useMediaUrl(url);
  const isYt = resolved?.includes('youtube') || resolved?.includes('youtu.be');
  const m = resolved ? resolved.match(/(?:v=|youtu\.be\/)([^&?/]+)/) : null;
  const ytId = m ? m[1] : null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-white/10 shrink-0">
        <div>
          <span className="text-white/50 text-[10px] uppercase font-bold tracking-widest block">Execução do Exercício</span>
          <p className="text-white font-black text-base">{name}</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition"
          aria-label="Fechar vídeo"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Video Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
        {isYt && ytId ? (
          <div className="w-full max-w-lg aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&playsinline=1`}
              className="w-full h-full"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          </div>
        ) : resolved ? (
          <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl bg-black flex items-center justify-center">
            <video
              src={resolved}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[65vh] object-contain"
            />
          </div>
        ) : (
          <div className="text-center py-12 px-6">
            <Dumbbell className="w-12 h-12 text-white/30 mx-auto mb-3" />
            <p className="text-white/80 font-bold text-base">Vídeo não disponível</p>
            <p className="text-white/50 text-xs mt-1">Nenhum vídeo demonstrativo encontrado para este exercício.</p>
          </div>
        )}
      </div>

      {/* Bottom return button */}
      <div className="p-4 shrink-0 max-w-md w-full mx-auto">
        <button
          onClick={onClose}
          className="w-full py-3.5 bg-[#1976D2] hover:bg-[#1565C0] text-white font-black text-sm uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg"
        >
          Voltar para o Treino
        </button>
      </div>
    </div>
  );
}

function VideoThumbnailButton({
  url,
  name,
  widthClass = "w-[130px] h-[78px]",
  onClick
}: {
  url?: string;
  name: string;
  widthClass?: string;
  onClick: () => void;
}) {
  const resolved = useMediaUrl(url);
  if (!resolved) {
    return (
      <div className={`${widthClass} rounded-lg bg-slate-100 flex items-center justify-center shrink-0`}>
        <Dumbbell className="w-7 h-7 text-slate-300" />
      </div>
    );
  }

  const isYt = resolved.includes('youtube') || resolved.includes('youtu.be');
  const ytId = isYt ? (resolved.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? null) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative ${widthClass} rounded-lg overflow-hidden bg-slate-900 shrink-0 cursor-pointer`}
    >
      {ytId ? (
        <img
          src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        <video
          src={resolved}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover pointer-events-none"
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/25">
        <div className="w-9 h-9 rounded-full bg-white/75 flex items-center justify-center shadow">
          <Play className="w-4 h-4 text-slate-900 ml-0.5" />
        </div>
      </div>
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminWorkoutSession({ routine, onClose, trainerPhone }: AdminWorkoutSessionProps) {
  const exercises = routine.exercises;
  const total = exercises.length;

  // ── Screen state ──────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<'intro' | 'session' | 'finish'>('intro');

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [sessionTime, setSessionTime] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [startTimestamp, setStartTimestamp] = useState<Date | null>(null);
  const [endTimestamp, setEndTimestamp] = useState<Date | null>(null);

  // ── Exercise state ────────────────────────────────────────────────────────
  const [completedExs, setCompletedExs] = useState<Set<string>>(new Set());

  const [loads, setLoads] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    exercises.forEach(e => {
      const pl = e.prescribedLoads;
      if (pl && pl.length > 0) {
        const max = Math.max(...pl.filter(l => l > 0));
        init[e.id] = max > 0 ? max : 0;
      } else {
        init[e.id] = 0;
      }
    });
    return init;
  });

  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [editLoadInput, setEditLoadInput] = useState('');

  // ── Completion modal ──────────────────────────────────────────────────────
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [activityRating, setActivityRating] = useState('');
  const [activityComment, setActivityComment] = useState('');

  // ── Video ─────────────────────────────────────────────────────────────────
  const [showVideo, setShowVideo] = useState(false);
  const [videoExIdx, setVideoExIdx] = useState(0);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionActive) return;
    const id = setInterval(() => setSessionTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [sessionActive]);

  // Auto-trigger completion modal when all exercises checked
  useEffect(() => {
    if (screen === 'session' && total > 0 && completedExs.size >= total) {
      const end = new Date();
      setEndTimestamp(end);
      setSessionActive(false);
      // Small delay so the last check animation is visible
      setTimeout(() => setShowCompletionModal(true), 400);
    }
  }, [completedExs, total, screen]);

  useEffect(() => {
    if (screen === 'finish') {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.5 } });
      setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 50, origin: { x: 0 } }), 400);
      setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 50, origin: { x: 1 } }), 700);
    }
  }, [screen]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const toggleExercise = (exId: string) => {
    setCompletedExs(prev => {
      const s = new Set(prev);
      if (s.has(exId)) s.delete(exId);
      else s.add(exId);
      return s;
    });
  };

  const startEditing = (ex: AdminExercise) => {
    setEditingExId(ex.id);
    setEditLoadInput(String(loads[ex.id] ?? 0));
  };

  const confirmEdit = () => {
    if (editingExId) {
      const val = parseFloat(editLoadInput);
      setLoads(prev => ({ ...prev, [editingExId]: isNaN(val) ? 0 : val }));
    }
    setEditingExId(null);
    setEditLoadInput('');
  };

  const saveLog = () => {
    try {
      const user = (() => {
        try { return JSON.parse(localStorage.getItem('cadu_ponce_user') ?? '{}'); }
        catch { return {}; }
      })();

      const rpeMap: Record<string, number> = {
        muito_facil: 2, facil: 4, adequado: 6, dificil: 8, muito_dificil: 10,
      };

      const log: WorkoutLog = {
        id: `log_${Date.now()}`,
        studentId: user.uid ?? 'unknown',
        studentName: user.name ?? undefined,
        routineId: routine.id,
        routineName: routine.name,
        completedAt: new Date().toISOString(),
        durationSeconds: sessionTime,
        rpe: rpeMap[activityRating] ?? 0,
        exercisesSummary: exercises.map(ex => ({
          name: ex.name,
          setsCompleted: completedExs.has(ex.id) ? (Number(ex.sets) || 1) : 0,
          totalSets: Number(ex.sets) || 1,
          loads: [loads[ex.id] ?? 0],
        })),
      };

      storage.saveWorkoutLog(log);

      const notif = {
        id: `notif_${Date.now()}`,
        type: 'treinos',
        title: 'Treino Concluído',
        body: `${log.studentName ?? 'Aluno'} concluiu "${routine.name}" em ${fmtDuration(sessionTime)}`,
        date: new Date().toISOString(),
        read: false,
      };
      const existing = JSON.parse(localStorage.getItem('cadu_notifs_admin') ?? '[]');
      localStorage.setItem('cadu_notifs_admin', JSON.stringify([notif, ...existing]));
      window.dispatchEvent(new CustomEvent('cadu_new_notification', { detail: notif }));
    } catch { /* silent */ }
  };

  const handleConcluir = () => {
    saveLog();
    setShowCompletionModal(false);
    setScreen('finish');
  };

  const handleShare = () => {
    const end = endTimestamp ?? new Date();
    const start = startTimestamp ?? new Date(end.getTime() - sessionTime * 1000);
    const text =
      `*Treino Concluído! 💪*\n` +
      `${routine.name}\n` +
      `📅 ${fmtDate(end)}\n` +
      `⏱ Tempo: ${fmtDuration(sessionTime)}\n` +
      `Início: ${fmtTimeWithSec(start)} | Fim: ${fmtTimeWithSec(end)}\n\n` +
      `_Via Cadu Ponce Personal_`;
    const phone = (trainerPhone || '').replace(/\D/g, '') || '5511999999999';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // ── YouTube helper ─────────────────────────────────────────────────────────
  const getYtId = (url: string): string | null => {
    const m = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    return m ? m[1] : null;
  };

  const fmtLoad = (ex: AdminExercise): string => `${loads[ex.id] ?? 0}kg`;

  const whatsappPhone = (trainerPhone || '').replace(/\D/g, '') || '5511999999999';

  // ── Bottom Nav ─────────────────────────────────────────────────────────────
  const BottomNav = ({ onHome }: { onHome: () => void }) => (
    <div className="bg-white border-t border-gray-200 shrink-0 grid grid-cols-4 text-center py-2">
      <button onClick={onHome} className="flex flex-col items-center gap-0.5 py-1.5 text-[#1976D2] cursor-pointer">
        <Home className="w-5 h-5" />
        <span className="text-[10px] font-medium">Início</span>
      </button>
      <a href="https://instagram.com/caduponce.personal" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-0.5 py-1.5 text-slate-500">
        <Instagram className="w-5 h-5" />
        <span className="text-[10px] font-medium">Instagram</span>
      </a>
      <a href={`https://wa.me/${whatsappPhone}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-0.5 py-1.5 text-slate-500">
        <MessageCircle className="w-5 h-5" />
        <span className="text-[10px] font-medium">WhatsApp</span>
      </a>
      <button className="flex flex-col items-center gap-0.5 py-1.5 text-slate-500 cursor-pointer">
        <Menu className="w-5 h-5" />
        <span className="text-[10px] font-medium">Menu</span>
      </button>
    </div>
  );

  // ── Video Modal ────────────────────────────────────────────────────────────
  const VideoModal = ({ exIdx, onClose: closeVideo }: { exIdx: number; onClose: () => void }) => {
    const ex = exercises[exIdx];
    if (!ex) return null;
    const vUrl = getExerciseVideo(ex);
    return <VideoModalInner name={ex.name} url={vUrl} onClose={closeVideo} />;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INTRO SCREEN (modo visualização)
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'intro') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {/* Header */}
        <div className="bg-[#1565C0] px-4 pt-4 pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-white p-1 hover:bg-white/10 rounded-lg transition cursor-pointer">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-1.5">
              <div className="bg-white/10 rounded-lg p-1">
                <Dumbbell className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-black text-[15px] tracking-wide">
                <span>CADU PONCE</span>
                <span className="font-normal opacity-80"> PERSONAL</span>
              </span>
            </div>
            <div className="relative p-1">
              <Clock className="w-6 h-6 text-white" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center border-2 border-[#1565C0]">2</span>
            </div>
          </div>
        </div>

        {/* INICIAR Banner */}
        <div className="bg-[#1976D2] px-4 py-3 shrink-0 space-y-2.5">
          <button
            onClick={() => {
              setStartTimestamp(new Date());
              setScreen('session');
              setSessionActive(true);
            }}
            className="w-full bg-[#43A047] hover:bg-[#388E3C] active:scale-[0.99] text-white font-black uppercase py-3.5 rounded-lg text-base tracking-[0.12em] transition shadow-md cursor-pointer"
          >
            INICIAR
          </button>
          <p className="text-white/90 text-center text-[13px] leading-snug">
            Você está no "modo visualização".<br />
            Aperte <strong>INICIAR</strong> para começar seu treino.
          </p>
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto bg-white">
          {exercises.map((ex, i) => {
            const videoSrc = getExerciseVideo(ex);
            return (
              <div key={ex.id} className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-[15px] leading-tight">{ex.name}</h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Carga: <span className="font-semibold text-slate-700">{fmtLoad(ex)}</span>
                  </p>
                </div>
                <VideoThumbnailButton
                  url={videoSrc}
                  name={ex.name}
                  widthClass="w-[130px] h-[78px]"
                  onClick={() => { setVideoExIdx(i); setShowVideo(true); }}
                />
              </div>
            );
          })}
          <div className="h-6" />
        </div>

        <BottomNav onHome={onClose} />
        {showVideo && <VideoModal exIdx={videoExIdx} onClose={() => setShowVideo(false)} />}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINISH SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'finish') {
    const today = new Date();
    const todayIdx = jsDayToIdx(today.getDay());
    const start = startTimestamp ?? new Date(today.getTime() - sessionTime * 1000);
    const end = endTimestamp ?? today;

    return (
      <div className="fixed inset-0 z-50 bg-[#1c2b3e] flex flex-col">
        {/* Header */}
        <div className="bg-[#1565C0] px-4 pt-4 pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="w-8" />
            <div className="flex items-center gap-1.5">
              <div className="bg-white/10 rounded-lg p-1"><Dumbbell className="w-4 h-4 text-white" /></div>
              <span className="text-white font-black text-[15px]">
                <span>CADU PONCE</span><span className="font-normal opacity-80"> PERSONAL</span>
              </span>
            </div>
            <div className="relative p-1">
              <Clock className="w-6 h-6 text-white" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center border-2 border-[#1565C0]">2</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center px-4 pt-8 space-y-6 pb-4">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-white text-3xl font-black italic">Parabéns!</h1>
            <p className="text-white/70 text-base mt-1">Você concluiu o seu treino!</p>
          </div>

          {/* Swipeable cards */}
          <div className="flex gap-4 overflow-x-auto w-full snap-x snap-mandatory pb-2" style={{ scrollbarWidth: 'none' }}>
            {/* Card 1: Summary with timer */}
            <div className="snap-center shrink-0 w-[calc(100%-24px)] bg-white rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-4 h-4 text-[#1565C0]" />
                  <span className="text-[#1565C0] font-black text-xs tracking-wide">CADU PONCE PERSONAL</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-xs">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{fmtDate(today)}</span>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center border-4 border-[#1976D2]/20">
                  <Dumbbell className="w-7 h-7 text-[#1976D2]" />
                </div>
              </div>

              <h2 className="text-center text-slate-900 font-black text-lg mb-1">Treino Concluído!</h2>

              <p className="text-center text-slate-500 text-sm mt-3 mb-1">Tempo de treino:</p>
              <p className="text-center text-slate-900 font-black text-4xl mb-4">{fmtDuration(sessionTime)}</p>

              <div className="flex items-center justify-center gap-6 text-sm text-slate-600 mb-6">
                <span><strong className="text-slate-800">Início:</strong> {fmtTimeWithSec(start)}</span>
                <span><strong className="text-slate-800">Fim:</strong> {fmtTimeWithSec(end)}</span>
              </div>

              {/* Day circles */}
              <div className="flex justify-center gap-2.5">
                {WEEKDAY_LETTERS.map((letter, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                      idx === todayIdx
                        ? 'bg-[#1976D2] border-[#1976D2] text-white'
                        : 'border-slate-300'
                    }`}>
                      {idx === todayIdx && <Check className="w-4 h-4" />}
                    </div>
                    <span className="text-xs text-slate-500 font-medium">{letter}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Weekly summary */}
            <div className="snap-center shrink-0 w-[calc(100%-24px)] bg-white rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-4 h-4 text-[#1565C0]" />
                  <span className="text-[#1565C0] font-black text-xs tracking-wide">CADU PONCE PERSONAL</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-xs">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{fmtDate(today)}</span>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center border-4 border-[#1976D2]/20">
                  <Dumbbell className="w-7 h-7 text-[#1976D2]" />
                </div>
              </div>

              <h2 className="text-center text-slate-900 font-black text-lg mb-6">Treino Concluído!</h2>

              <div className="flex justify-center gap-2.5 mb-5">
                {WEEKDAY_LETTERS.map((letter, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${
                      idx === todayIdx
                        ? 'bg-[#1976D2] border-[#1976D2] text-white'
                        : 'border-slate-300'
                    }`}>
                      {idx === todayIdx && <Check className="w-4 h-4" />}
                    </div>
                    <span className="text-xs text-slate-500 font-medium">{letter}</span>
                  </div>
                ))}
              </div>

              <p className="text-center text-slate-700 text-sm font-medium">
                Você treinou{' '}
                <span className="text-[#1976D2] font-bold">1 dia</span>
                {' '}essa semana
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-3 space-y-3 shrink-0">
          <button
            onClick={handleShare}
            className="w-full bg-[#1976D2] hover:bg-[#1565C0] text-white font-bold py-4 rounded-xl text-base transition cursor-pointer"
          >
            Compartilhar
          </button>
          <button
            onClick={onClose}
            className="w-full bg-white text-slate-700 font-bold py-4 rounded-xl text-base border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>

        <BottomNav onHome={onClose} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION SCREEN (checklist ativo)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-[#1c2b3e] px-4 pt-4 pb-4 shrink-0">
        {/* Logo row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <div className="bg-white/10 rounded-lg p-1"><Dumbbell className="w-4 h-4 text-white" /></div>
            <span className="text-white font-black text-[15px]">
              <span>CADU PONCE</span><span className="font-normal opacity-80"> PERSONAL</span>
            </span>
          </div>
          <div className="relative p-1">
            <Clock className="w-6 h-6 text-white" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center border-2 border-[#1c2b3e]">2</span>
          </div>
        </div>

        {/* Back + title */}
        <button
          onClick={() => { setSessionActive(false); setScreen('intro'); }}
          className="flex items-center gap-0.5 text-white/70 hover:text-white text-sm mb-2 cursor-pointer transition"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <h2 className="text-white font-bold text-xl leading-tight">
          {routine.muscleGroup || routine.name}
        </h2>

        {/* Timer pill */}
        <div className="mt-3 bg-[#111827] rounded-xl px-4 py-3 flex items-center justify-center gap-2">
          <Clock className="w-4 h-4 text-white/60" />
          <span className="text-white font-bold text-base">{fmtDuration(sessionTime)}</span>
        </div>
      </div>

      {/* ── Exercise checklist ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white">
        {exercises.map((ex, i) => {
          const done = completedExs.has(ex.id);
          const videoSrc = getExerciseVideo(ex);
          const isEditing = editingExId === ex.id;

          return (
            <div
              key={ex.id}
              className={`flex items-stretch gap-3 px-4 py-4 border-b border-gray-100 last:border-0 ${
                done ? 'bg-slate-50/60' : 'bg-white'
              }`}
            >
              {/* Checkbox circle */}
              <button
                type="button"
                onClick={() => toggleExercise(ex.id)}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-all cursor-pointer ${
                  done
                    ? 'bg-[#2DA44E] border-[#2DA44E] text-white shadow-md shadow-green-200'
                    : 'border-slate-300 bg-white hover:border-[#1976D2]'
                }`}
              >
                {done && <Check className="w-4 h-4 stroke-[2.5]" />}
              </button>

              {/* Exercise info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <h3 className={`font-bold text-[15px] leading-tight ${done ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                  {ex.name}
                </h3>

                {/* Show load + edit only when not done */}
                {!done && (
                  isEditing ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-slate-500 text-sm">Carga:</span>
                      <input
                        type="number"
                        value={editLoadInput}
                        onChange={e => setEditLoadInput(e.target.value)}
                        className="w-20 border border-slate-300 rounded-lg px-2 py-0.5 text-sm text-slate-900 focus:outline-none focus:border-[#1976D2]"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmEdit();
                          if (e.key === 'Escape') setEditingExId(null);
                        }}
                      />
                      <span className="text-slate-500 text-sm">kg</span>
                      <button
                        onClick={confirmEdit}
                        className="text-[#1976D2] text-sm font-bold cursor-pointer hover:underline"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm mt-0.5">
                      Carga:{' '}
                      <span className="font-medium text-slate-700">{fmtLoad(ex)}</span>{' '}
                      <button
                        onClick={() => startEditing(ex)}
                        className="text-[#1976D2] font-semibold cursor-pointer hover:underline"
                      >
                        Editar
                      </button>
                    </p>
                  )
                )}

                {/* Direct "Ver vídeo" button */}
                {videoSrc && (
                  <button
                    type="button"
                    onClick={() => { setVideoExIdx(i); setShowVideo(true); }}
                    className="flex items-center gap-1.5 text-[#1976D2] text-xs font-bold mt-2 hover:underline cursor-pointer w-fit"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ver vídeo do exercício</span>
                  </button>
                )}
              </div>

              {/* Video thumbnail on the right */}
              {videoSrc && (
                <VideoThumbnailButton
                  url={videoSrc}
                  name={ex.name}
                  widthClass="w-[105px] min-h-[90px]"
                  onClick={() => { setVideoExIdx(i); setShowVideo(true); }}
                />
              )}
            </div>
          );
        })}
        <div className="h-6" />
      </div>

      <BottomNav onHome={() => { setSessionActive(false); setScreen('intro'); }} />

      {/* ── Video Modal ────────────────────────────────────────────────────── */}
      {showVideo && <VideoModal exIdx={videoExIdx} onClose={() => setShowVideo(false)} />}

      {/* ── Completion Modal ───────────────────────────────────────────────── */}
      {showCompletionModal && (() => {
        const end = endTimestamp ?? new Date();
        const start = startTimestamp ?? new Date(end.getTime() - sessionTime * 1000);
        return (
          <div className="absolute inset-0 z-30 bg-black/50 flex items-end sm:items-center justify-center">
            <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-5">
              {/* Trophy */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="w-16 h-16 rounded-full bg-[#1976D2] flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-slate-900 font-black text-xl">Parabéns!</h3>
                <p className="text-slate-500 text-sm">Você concluiu seu treino!</p>
              </div>

              {/* Stats */}
              <div className="bg-slate-50 rounded-xl overflow-hidden text-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="font-bold text-slate-700">Início:</span>
                  <span className="text-slate-600">{fmtTime(start)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="font-bold text-slate-700">Fim:</span>
                  <span className="text-slate-600">{fmtTime(end)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="font-bold text-slate-700">Tempo de treino:</span>
                  <span className="text-slate-600">{fmtDuration(sessionTime)}</span>
                </div>
              </div>

              {/* Rating dropdown */}
              <div className="space-y-1.5">
                <label className="text-slate-700 text-sm font-semibold">O que você achou dessa atividade?</label>
                <select
                  value={activityRating}
                  onChange={e => setActivityRating(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-700 focus:outline-none focus:border-[#1976D2] bg-white cursor-pointer"
                >
                  <option value="">Selecione</option>
                  <option value="muito_facil">Muito fácil</option>
                  <option value="facil">Fácil</option>
                  <option value="adequado">Adequado</option>
                  <option value="dificil">Difícil</option>
                  <option value="muito_dificil">Muito difícil</option>
                </select>
              </div>

              {/* Comment textarea */}
              <div className="space-y-1.5">
                <label className="text-slate-700 text-sm font-semibold">Deixe seu comentário aqui</label>
                <textarea
                  value={activityComment}
                  onChange={e => setActivityComment(e.target.value)}
                  placeholder="Seu comentário aqui"
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-700 focus:outline-none focus:border-[#1976D2] resize-none"
                />
              </div>

              {/* Concluir */}
              <button
                onClick={handleConcluir}
                className="w-full bg-[#1976D2] hover:bg-[#1565C0] text-white font-bold py-4 rounded-xl text-base transition cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
