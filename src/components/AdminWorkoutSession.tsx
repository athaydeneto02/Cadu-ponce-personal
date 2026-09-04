/**
 * AdminWorkoutSession.tsx
 * Sessão de treino para fichas prescritas pelo treinador (AdminRoutine).
 * Design: MFIT PERSONAL style.
 * Fluxo: intro (visualização) → session (checklist + timer) → modal de conclusão → finish (cards deslizáveis)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, ChevronLeft, Check, Trophy, Dumbbell, Clock,
  Play, Home, MessageCircle, Menu, Instagram, Calendar,
  Share2, Download, Loader2
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

export interface ChecklistItem {
  type: 'single' | 'combined';
  ex?: AdminExercise;
  index?: number;
  items?: { ex: AdminExercise; index: number }[];
}

export const buildChecklistItems = (exList: AdminExercise[]): ChecklistItem[] => {
  const result: ChecklistItem[] = [];
  for (let i = 0; i < exList.length; i++) {
    const current = exList[i];
    const isCombinedWithNext = !!(
      current.combinedWithNext ||
      (current.combinedGroup && exList[i + 1]?.combinedGroup === current.combinedGroup) ||
      current.notes?.toLowerCase().includes('bi-set') ||
      current.notes?.toLowerCase().includes('biset') ||
      current.notes?.toLowerCase().includes('combinad') ||
      current.name?.toLowerCase().includes('bi-set') ||
      current.name?.toLowerCase().includes('biset')
    );

    if (isCombinedWithNext && i + 1 < exList.length) {
      const group: { ex: AdminExercise; index: number }[] = [{ ex: current, index: i }];
      let nextIdx = i + 1;
      while (nextIdx < exList.length) {
        const nextEx = exList[nextIdx];
        group.push({ ex: nextEx, index: nextIdx });
        const alsoCombines = !!(
          nextEx.combinedWithNext ||
          (current.combinedGroup && exList[nextIdx + 1]?.combinedGroup === current.combinedGroup)
        );
        if (alsoCombines && nextIdx + 1 < exList.length) {
          nextIdx++;
        } else {
          break;
        }
      }
      result.push({ type: 'combined', items: group });
      i = nextIdx;
    } else {
      result.push({ type: 'single', ex: current, index: i });
    }
  }
  return result;
};

export const getExerciseVideo = (ex: AdminExercise): string => {
  const direct = (ex.videoFileUrl || ex.videoUrl || '').trim();
  if (direct && !direct.includes('mov_bbb.mp4')) return direct;

  // Lookup in custom library cache
  try {
    const rawLib = localStorage.getItem('cadu_ponce_exercises_v3');
    if (rawLib && ex.name) {
      const libList = JSON.parse(rawLib);
      const exNameClean = ex.name.toLowerCase().trim();
      const match = libList.find((lib: any) => {
        if (!lib) return false;
        if (lib.id && ex.id && typeof lib.id === 'string' && typeof ex.id === 'string' && lib.id.trim() && lib.id.trim() === ex.id.trim()) {
          return true;
        }
        if (lib.title && typeof lib.title === 'string' && lib.title.toLowerCase().trim() === exNameClean) {
          return true;
        }
        return false;
      });
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
  const checklistItems = useMemo(() => buildChecklistItems(exercises), [exercises]);

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

  // ── Finish screen ──────────────────────────────────────────────────────────
  const [finishCardIdx, setFinishCardIdx] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

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

  const generateStoryBlob = async (params: {
    routineName: string;
    duration: string;
    startTime: string;
    endTime: string;
    dateStr: string;
    totalExercises: number;
  }): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    // Background Gradient (Dark Navy Fitness Aesthetic)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
    bgGrad.addColorStop(0, '#0d1b2a');
    bgGrad.addColorStop(0.35, '#1b263b');
    bgGrad.addColorStop(0.75, '#1565C0');
    bgGrad.addColorStop(1, '#0b132b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Radial ambient light
    const glow = ctx.createRadialGradient(540, 960, 80, 540, 960, 560);
    glow.addColorStop(0, 'rgba(25, 118, 210, 0.45)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 400, 1080, 1120);

    // Top header branding
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '900 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('CADU PONCE PERSONAL', 540, 230);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(params.dateStr, 540, 290);

    // Center Main White Card
    const cardX = 90;
    const cardY = 380;
    const cardW = 900;
    const cardH = 1140;
    const cardR = 48;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;

    // Rounded rectangle
    ctx.beginPath();
    ctx.moveTo(cardX + cardR, cardY);
    ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, cardR);
    ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, cardR);
    ctx.arcTo(cardX, cardY + cardH, cardX, cardY, cardR);
    ctx.arcTo(cardX, cardY, cardX + cardW, cardY, cardR);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // Badge Circle
    ctx.fillStyle = '#E3F2FD';
    ctx.beginPath();
    ctx.arc(540, 530, 65, 0, Math.PI * 2);
    ctx.fill();

    // Dumbbell icon
    ctx.fillStyle = '#1976D2';
    ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏋️‍♂️', 540, 530);

    // "Treino Concluído!"
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 58px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Treino Concluído!', 540, 680);

    // Routine name
    ctx.fillStyle = '#1565C0';
    ctx.font = '800 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const nameToDraw = params.routineName.length > 28 ? params.routineName.slice(0, 26) + '...' : params.routineName;
    ctx.fillText(nameToDraw.toUpperCase(), 540, 755);

    // Big Duration Display Pill
    ctx.fillStyle = '#f8fafc';
    const pillX = 170;
    const pillY = 820;
    const pillW = 740;
    const pillH = 260;
    const pillR = 32;

    ctx.beginPath();
    ctx.moveTo(pillX + pillR, pillY);
    ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, pillR);
    ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, pillR);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY, pillR);
    ctx.arcTo(pillX, pillY, pillX + pillW, pillY, pillR);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('TEMPO DE TREINO', 540, 890);

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(params.duration, 540, 1010);

    // Time details row: Início & Fim
    ctx.fillStyle = '#64748b';
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Início: ' + params.startTime, 180, 1190);

    ctx.textAlign = 'right';
    ctx.fillText('Fim: ' + params.endTime, 900, 1190);

    // Divider
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(180, 1260);
    ctx.lineTo(900, 1260);
    ctx.stroke();

    // Exercises completed
    ctx.textAlign = 'center';
    ctx.fillStyle = '#16a34a';
    ctx.font = '800 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`✔ ${params.totalExercises} ${params.totalExercises === 1 ? 'exercício concluído' : 'exercícios concluídos'}`, 540, 1370);

    // Bottom text outside card: Motivational hashtag
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 52px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('TÁ PAGO! 💪🔥', 540, 1640);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('@cadu_ponce_personal', 540, 1715);

    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    });
  };

  const handleShare = () => {
    setShowShareModal(true);
  };

  const handleShareWhatsApp = () => {
    const end = endTimestamp ?? new Date();
    const start = startTimestamp ?? new Date(end.getTime() - sessionTime * 1000);
    const text =
      `*Treino Concluído! 💪*\n` +
      `🏋️‍♂️ *${routine.name}*\n` +
      `📅 Data: ${fmtDate(end)}\n` +
      `⏱ Tempo: *${fmtDuration(sessionTime)}*\n` +
      `🕒 Início: ${fmtTimeWithSec(start)} | Fim: ${fmtTimeWithSec(end)}\n` +
      `✅ ${exercises.length} ${exercises.length === 1 ? 'exercício concluído' : 'exercícios concluídos'}\n\n` +
      `_Via Cadu Ponce Personal_`;
    // Opening without a hardcoded phone number opens the WhatsApp contact/group picker
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleShareStories = async () => {
    setIsGeneratingImage(true);
    try {
      const end = endTimestamp ?? new Date();
      const start = startTimestamp ?? new Date(end.getTime() - sessionTime * 1000);
      const blob = await generateStoryBlob({
        routineName: routine.name,
        duration: fmtDuration(sessionTime),
        startTime: fmtTime(start),
        endTime: fmtTime(end),
        dateStr: fmtDate(end),
        totalExercises: exercises.length,
      });

      const file = new File([blob], 'treino_cadu_ponce_stories.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Treino Concluído!',
          text: `Treino pago! 💪 ${routine.name}`,
        });
      } else {
        // Fallback: Download high-res Story image and open Instagram
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'treino_cadu_ponce_stories.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setTimeout(() => {
          window.open('https://instagram.com', '_blank');
        }, 600);
      }
    } catch (err) {
      console.error('Stories share error:', err);
    } finally {
      setIsGeneratingImage(false);
      setShowShareModal(false);
    }
  };

  const handleShareNative = async () => {
    setIsGeneratingImage(true);
    try {
      const end = endTimestamp ?? new Date();
      const start = startTimestamp ?? new Date(end.getTime() - sessionTime * 1000);
      const text =
        `*Treino Concluído! 💪*\n` +
        `🏋️‍♂️ ${routine.name}\n` +
        `⏱ Tempo: ${fmtDuration(sessionTime)}\n` +
        `_Via Cadu Ponce Personal_`;

      const blob = await generateStoryBlob({
        routineName: routine.name,
        duration: fmtDuration(sessionTime),
        startTime: fmtTime(start),
        endTime: fmtTime(end),
        dateStr: fmtDate(end),
        totalExercises: exercises.length,
      });

      const file = new File([blob], 'treino_cadu_ponce.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Treino Concluído!',
          text,
        });
      } else if (navigator.share) {
        await navigator.share({
          title: 'Treino Concluído!',
          text,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'treino_cadu_ponce.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingImage(false);
      setShowShareModal(false);
    }
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
          {checklistItems.map((item, itemIdx) => {
            if (item.type === 'combined' && item.items) {
              return (
                <div key={`intro-comb-${itemIdx}`} className="py-4 border-b border-gray-100 bg-white">
                  <div className="px-4 mb-2.5">
                    <h3 className="font-bold text-slate-900 text-[15px] leading-tight">
                      Exercícios combinados
                    </h3>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Alterne esses exercícios
                    </p>
                  </div>
                  <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
                    {item.items.map((sub, subIdx) => {
                      const subEx = sub.ex;
                      const subVideoSrc = getExerciseVideo(subEx);
                      const letter = String.fromCharCode(65 + subIdx);
                      return (
                        <div
                          key={subEx.id}
                          className="snap-start shrink-0 w-[78vw] max-w-[300px] bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <h4 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">
                              {subEx.name}
                            </h4>
                            <span className="w-6 h-6 rounded-full bg-[#1976D2] text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
                              {letter}
                            </span>
                          </div>
                          <div className="flex items-end justify-between gap-2 pt-2">
                            <div>
                              <p className="text-slate-600 text-xs">
                                Carga: <span className="font-semibold text-slate-800">{fmtLoad(subEx)}</span>
                              </p>
                            </div>
                            {subVideoSrc && (
                              <VideoThumbnailButton
                                url={subVideoSrc}
                                name={subEx.name}
                                widthClass="w-[72px] h-[100px] rounded-xl"
                                onClick={() => { setVideoExIdx(sub.index); setShowVideo(true); }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            const ex = item.ex!;
            const i = item.index!;
            const videoSrc = getExerciseVideo(ex);
            return (
              <div key={ex.id} className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-[15px] leading-tight">{ex.name}</h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Carga: <span className="font-semibold text-slate-700">{fmtLoad(ex)}</span>
                  </p>
                </div>
                {videoSrc && (
                  <VideoThumbnailButton
                    url={videoSrc}
                    name={ex.name}
                    widthClass="w-[75px] h-[110px] rounded-xl"
                    onClick={() => { setVideoExIdx(i); setShowVideo(true); }}
                  />
                )}
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

    // Month and calendar calculations
    const MONTH_NAMES = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const currentMonthName = MONTH_NAMES[today.getMonth()];
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayJs = new Date(currentYear, currentMonth, 1).getDay();
    const startOffset = jsDayToIdx(firstDayJs); // 0=Segunda ... 6=Domingo

    // Get real trained days from workout logs + today
    let logs: any[] = [];
    try {
      const rawLogs = storage.getWorkoutLogs();
      if (Array.isArray(rawLogs)) logs = rawLogs;
    } catch {}

    const trainedDaysMonth = new Set<number>();
    trainedDaysMonth.add(today.getDate());

    const trainedWeekdays = new Set<number>();
    trainedWeekdays.add(todayIdx);

    // Compute start of current week (Monday)
    const mondayDate = new Date(today);
    mondayDate.setDate(today.getDate() - todayIdx);
    mondayDate.setHours(0, 0, 0, 0);

    logs.forEach(l => {
      if (!l || !l.completedAt) return;
      try {
        const d = new Date(l.completedAt);
        if (isNaN(d.getTime())) return;
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          trainedDaysMonth.add(d.getDate());
        }
        if (d >= mondayDate && d <= today) {
          trainedWeekdays.add(jsDayToIdx(d.getDay()));
        }
      } catch {}
    });

    const daysCountMonth = trainedDaysMonth.size;
    const daysCountWeek = trainedWeekdays.size;

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
        <div className="flex-1 overflow-y-auto flex flex-col items-center px-2 pt-6 space-y-4 pb-4">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-white text-3xl font-black italic">Parabéns!</h1>
            <p className="text-white/70 text-base mt-1">Você concluiu o seu treino!</p>
          </div>

          {/* Swipeable cards carousel */}
          <div 
            className="flex gap-4 overflow-x-auto w-full snap-x snap-mandatory px-4 pb-2" 
            style={{ scrollbarWidth: 'none' }}
            onScroll={(e) => {
              const target = e.currentTarget;
              const idx = Math.round(target.scrollLeft / (target.clientWidth * 0.8));
              setFinishCardIdx(Math.min(2, Math.max(0, idx)));
            }}
          >
            {/* Card 1: Tempo de Treino (Imagem 1) */}
            <div className="snap-center shrink-0 w-[84vw] max-w-[340px] bg-white rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-4 h-4 text-[#1565C0]" />
                  <span className="text-[#1565C0] font-black text-xs tracking-wide">CADU PONCE PERSONAL</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-xs font-semibold">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{fmtDate(today)}</span>
                </div>
              </div>

              <div className="my-auto flex flex-col items-center text-center py-4">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center border-4 border-[#1976D2]/20 mb-3">
                  <Dumbbell className="w-7 h-7 text-[#1976D2]" />
                </div>

                <h2 className="text-slate-900 font-black text-xl mb-4">Treino Concluído!</h2>

                <p className="text-slate-500 text-sm mb-1">Tempo de treino:</p>
                <p className="text-slate-900 font-black text-4xl mb-4">{fmtDuration(sessionTime)}</p>

                <div className="flex items-center justify-center gap-4 text-xs text-slate-600">
                  <span><strong className="text-slate-800">Início:</strong> {fmtTimeWithSec(start)}</span>
                  <span><strong className="text-slate-800">Fim:</strong> {fmtTimeWithSec(end)}</span>
                </div>
              </div>

              <div className="h-2" />
            </div>

            {/* Card 2: Semana Atual (S T Q Q S S D) (Imagem 2) */}
            <div className="snap-center shrink-0 w-[84vw] max-w-[340px] bg-white rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-4 h-4 text-[#1565C0]" />
                  <span className="text-[#1565C0] font-black text-xs tracking-wide">CADU PONCE PERSONAL</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-xs font-semibold">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{fmtDate(today)}</span>
                </div>
              </div>

              <div className="my-auto flex flex-col items-center text-center py-4">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center border-4 border-[#1976D2]/20 mb-3">
                  <Dumbbell className="w-7 h-7 text-[#1976D2]" />
                </div>

                <h2 className="text-slate-900 font-black text-xl mb-6">Treino Concluído!</h2>

                <div className="flex justify-center gap-2 mb-8">
                  {WEEKDAY_LETTERS.map((letter, idx) => {
                    const isTrained = trainedWeekdays.has(idx);
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1.5">
                        <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                          isTrained
                            ? 'bg-[#1976D2] border-[#1976D2] text-white shadow-sm'
                            : 'border-[#1976D2] bg-white'
                        }`}>
                          {isTrained && <Check className="w-4 h-4 stroke-[3]" />}
                        </div>
                        <span className="text-xs text-slate-700 font-medium">{letter}</span>
                      </div>
                    );
                  })}
                </div>

                <p className="text-slate-800 text-sm font-semibold">
                  Você treinou{' '}
                  <span className="text-[#1976D2] font-black">{daysCountWeek} {daysCountWeek === 1 ? 'dia' : 'dias'}</span>
                  {' '}essa semana
                </p>
              </div>

              <div className="h-2" />
            </div>

            {/* Card 3: Calendário do Mês (Imagem 3) */}
            <div className="snap-center shrink-0 w-[84vw] max-w-[340px] bg-white rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-4 h-4 text-[#1565C0]" />
                  <span className="text-[#1565C0] font-black text-xs tracking-wide">CADU PONCE PERSONAL</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-xs font-semibold">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{fmtDate(today)}</span>
                </div>
              </div>

              <div className="flex flex-col items-center py-2">
                <h2 className="text-slate-900 font-black text-base mb-3 capitalize">{currentMonthName}</h2>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-1 w-full text-center mb-2">
                  {['Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.', 'Dom.'].map((w, idx) => (
                    <span key={idx} className="text-[10px] text-slate-600 font-bold">{w}</span>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1.5 w-full">
                  {/* Empty cells before day 1 */}
                  {Array.from({ length: startOffset }).map((_, idx) => (
                    <div key={`empty-${idx}`} className="w-7 h-7" />
                  ))}

                  {/* Days 1..daysInMonth */}
                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const isTrained = trainedDaysMonth.has(dayNum);
                    return (
                      <div key={dayNum} className="flex items-center justify-center">
                        <div className={`w-7 h-7 rounded-full text-[11px] flex items-center justify-center transition-all ${
                          isTrained
                            ? 'bg-[#1976D2] text-white font-black shadow-sm'
                            : 'bg-slate-100 text-slate-600 font-medium'
                        }`}>
                          {dayNum}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-slate-800 text-sm font-semibold mt-4 text-center">
                  Você treinou{' '}
                  <span className="text-[#1976D2] font-black">{daysCountMonth} {daysCountMonth === 1 ? 'dia' : 'dias'}</span>
                  {' '}esse mês
                </p>
              </div>

              <div className="h-1" />
            </div>
          </div>

          {/* Carousel Dots */}
          <div className="flex justify-center items-center gap-1.5 pt-1">
            {[0, 1, 2].map(idx => (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all duration-300 ${
                  finishCardIdx === idx ? 'bg-white w-5' : 'bg-white/40 w-2'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-3 space-y-3 shrink-0">
          <button
            onClick={handleShare}
            className="w-full bg-[#1976D2] hover:bg-[#1565C0] text-white font-bold py-3.5 rounded-xl text-base transition cursor-pointer shadow-md flex items-center justify-center gap-2"
          >
            <Share2 className="w-5 h-5" />
            <span>Compartilhar</span>
          </button>
          <button
            onClick={onClose}
            className="w-full bg-transparent text-white font-bold py-3.5 rounded-xl text-base border border-white/40 hover:bg-white/10 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>

        {/* ── Share Modal (WhatsApp & Instagram Stories) ────────────────────── */}
        {showShareModal && (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-slate-900 font-black text-lg">Compartilhar Treino</h3>
                  <p className="text-slate-500 text-xs">Escolha como deseja compartilhar seu resultado</p>
                </div>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5 pt-1">
                {/* WhatsApp Option (Choose ANY person or group) */}
                <button
                  onClick={() => {
                    handleShareWhatsApp();
                    setShowShareModal(false);
                  }}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/60 hover:bg-emerald-100/60 transition text-left cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#25D366] flex items-center justify-center text-white shrink-0 shadow-sm">
                    <MessageCircle className="w-6 h-6 fill-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-slate-900 font-bold text-sm group-hover:text-emerald-700 transition">
                      WhatsApp (Escolher contato)
                    </h4>
                    <p className="text-slate-500 text-xs">
                      Envie o resumo para qualquer pessoa ou grupo
                    </p>
                  </div>
                </button>

                {/* Instagram Stories Option */}
                <button
                  onClick={handleShareStories}
                  disabled={isGeneratingImage}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl border border-pink-100 bg-gradient-to-r from-pink-50/60 via-purple-50/40 to-amber-50/40 hover:from-pink-100/60 transition text-left cursor-pointer group disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#fd5949] via-[#d6249f] to-[#285AEB] flex items-center justify-center text-white shrink-0 shadow-sm">
                    <Instagram className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-slate-900 font-bold text-sm group-hover:text-pink-700 transition flex items-center gap-1.5">
                      <span>Instagram Stories</span>
                      {isGeneratingImage && <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-600" />}
                    </h4>
                    <p className="text-slate-500 text-xs">
                      Gera imagem vertical no formato Stories para postar
                    </p>
                  </div>
                </button>

                {/* Other Apps / Native Share Option */}
                <button
                  onClick={handleShareNative}
                  disabled={isGeneratingImage}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-left cursor-pointer group disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#1976D2] flex items-center justify-center text-white shrink-0 shadow-sm">
                    <Share2 className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-slate-900 font-bold text-sm group-hover:text-[#1976D2] transition">
                      Outros aplicativos / Baixar imagem
                    </h4>
                    <p className="text-slate-500 text-xs">
                      Compartilhe ou salve a imagem em alta resolução
                    </p>
                  </div>
                </button>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setShowShareModal(false)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

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
        {checklistItems.map((item, itemIdx) => {
          if (item.type === 'combined' && item.items) {
            const allDone = item.items.every(it => completedExs.has(it.ex.id));

            return (
              <div key={`session-comb-${itemIdx}`} className="py-4 border-b border-gray-100 bg-white">
                {/* Header row with master checkbox */}
                <div className="flex items-center gap-3 px-4 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCompletedExs(prev => {
                        const next = new Set(prev);
                        item.items!.forEach(it => {
                          if (allDone) next.delete(it.ex.id);
                          else next.add(it.ex.id);
                        });
                        return next;
                      });
                    }}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                      allDone
                        ? 'bg-[#2DA44E] border-[#2DA44E] text-white shadow-md shadow-green-200'
                        : 'border-slate-300 bg-white hover:border-[#1976D2]'
                    }`}
                  >
                    {allDone && <Check className="w-4 h-4 stroke-[2.5]" />}
                  </button>

                  <div>
                    <h3 className="font-bold text-slate-900 text-[15px] leading-tight">
                      Exercícios combinados
                    </h3>
                    <p className="text-slate-500 text-xs mt-0.5 font-medium">
                      Alterne esses exercícios
                    </p>
                  </div>
                </div>

                {/* Horizontal swipeable cards (MFIT style) */}
                <div 
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pl-15 pr-4 pb-2" 
                  style={{ scrollbarWidth: 'none' }}
                >
                  {item.items.map((sub, subIdx) => {
                    const subEx = sub.ex;
                    const subVideoSrc = getExerciseVideo(subEx);
                    const subDone = completedExs.has(subEx.id);
                    const letter = String.fromCharCode(65 + subIdx);
                    const isEditingSub = editingExId === subEx.id;

                    return (
                      <div
                        key={subEx.id}
                        className="snap-start shrink-0 w-[78vw] max-w-[300px] bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                      >
                        {/* Top: Name + Badge */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <h4 className={`font-bold text-sm leading-snug line-clamp-2 ${subDone ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                            {subEx.name}
                          </h4>
                          <span className="w-6 h-6 rounded-full bg-[#1976D2] text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
                            {letter}
                          </span>
                        </div>

                        {/* Bottom: Carga + Thumbnail */}
                        <div className="flex items-end justify-between gap-2 pt-2">
                          <div className="min-w-0 flex-1">
                            {isEditingSub ? (
                              <div className="flex items-center gap-1.5 mb-1">
                                <input
                                  type="number"
                                  value={editLoadInput}
                                  onChange={e => setEditLoadInput(e.target.value)}
                                  className="w-16 border border-slate-300 rounded-lg px-2 py-0.5 text-xs text-slate-900 focus:outline-none focus:border-[#1976D2]"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') confirmEdit();
                                    if (e.key === 'Escape') setEditingExId(null);
                                  }}
                                />
                                <span className="text-slate-500 text-xs">kg</span>
                                <button onClick={confirmEdit} className="text-[#1976D2] text-xs font-bold hover:underline cursor-pointer">
                                  OK
                                </button>
                              </div>
                            ) : (
                              <p className="text-slate-500 text-xs mb-1">
                                Carga:{' '}
                                <span className="font-semibold text-slate-800">{fmtLoad(subEx)}</span>{' '}
                                <button
                                  onClick={() => startEditing(subEx)}
                                  className="text-[#1976D2] italic font-semibold hover:underline cursor-pointer ml-1"
                                >
                                  Editar
                                </button>
                              </p>
                            )}

                            {subVideoSrc && (
                              <button
                                type="button"
                                onClick={() => { setVideoExIdx(sub.index); setShowVideo(true); }}
                                className="flex items-center gap-1 text-[#1976D2] text-[11px] font-bold hover:underline cursor-pointer"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Ver vídeo</span>
                              </button>
                            )}
                          </div>

                          {subVideoSrc ? (
                            <VideoThumbnailButton
                              url={subVideoSrc}
                              name={subEx.name}
                              widthClass="w-[72px] h-[100px] rounded-xl"
                              onClick={() => { setVideoExIdx(sub.index); setShowVideo(true); }}
                            />
                          ) : (
                            <div className="w-[72px] h-[100px] rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/60">
                              <Dumbbell className="w-6 h-6 text-slate-300" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          // Single exercise
          const ex = item.ex!;
          const i = item.index!;
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
                        className="text-[#1976D2] font-semibold cursor-pointer hover:underline ml-1"
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
                  widthClass="w-[75px] h-[110px] rounded-xl"
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
