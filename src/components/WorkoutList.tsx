/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Calendar,
  Eye,
  TrendingUp,
  ClipboardCheck,
  Clock,
  Dumbbell,
  X,
  Star,
  Send,
  CheckCircle2
} from 'lucide-react';
import { Workout, AdminRoutine } from '../types';
import { storage } from '../lib/storage';
import AdminWorkoutSession from './AdminWorkoutSession';

interface WorkoutListProps {
  workouts: Workout[];
  onSelectWorkout: (workout: Workout) => void;
  trainerPhone?: string;
  onBack?: () => void;
}

function getDayLabel(raw: string): string {
  const map: Record<string, string> = {
    'segunda': 'Segunda', 'segunda-feira': 'Segunda',
    'terca': 'Terça', 'terça': 'Terça', 'terca-feira': 'Terça', 'terça-feira': 'Terça',
    'quarta': 'Quarta', 'quarta-feira': 'Quarta',
    'quinta': 'Quinta', 'quinta-feira': 'Quinta',
    'sexta': 'Sexta', 'sexta-feira': 'Sexta',
    'sabado': 'Sábado', 'sábado': 'Sábado',
    'domingo': 'Domingo',
  };
  return map[raw.toLowerCase().trim()] ?? raw;
}

function sortByDayOfWeek(routines: AdminRoutine[]): AdminRoutine[] {
  const order = ['segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado', 'domingo'];
  return [...routines].sort((a, b) => {
    const ai = order.findIndex(d => (a.dayOfWeek ?? '').toLowerCase().includes(d));
    const bi = order.findIndex(d => (b.dayOfWeek ?? '').toLowerCase().includes(d));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

interface RoutineGroup {
  groupName: string;
  goal: string;
  difficulty: string;
  startDate?: string;
  endDate?: string;
  days: AdminRoutine[];
}

function groupRoutines(routines: AdminRoutine[]): RoutineGroup[] {
  const map: Record<string, RoutineGroup> = {};
  for (const r of routines) {
    const key = r.routineGroupName || 'Treino Musculação I';
    if (!map[key]) {
      map[key] = {
        groupName: key,
        goal: r.goal || 'Hipertrofia',
        difficulty: r.difficulty || 'Intermediário',
        startDate: r.startDate,
        endDate: r.endDate,
        days: [],
      };
    }
    map[key].days.push(r);
    if (r.startDate && (!map[key].startDate || r.startDate < map[key].startDate!)) map[key].startDate = r.startDate;
    if (r.endDate && (!map[key].endDate || r.endDate > map[key].endDate!)) map[key].endDate = r.endDate;
  }
  return Object.values(map);
}

function normalizeStr(str?: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function routineMatchesUser(r: AdminRoutine, user: any, allUsers: any[]): boolean {
  if (!user) return false;
  const uid = user.uid || user.id;
  const userEmail = normalizeStr(user.email);
  const userName = normalizeStr(user.name);

  // 1. Direct ID match
  if (uid && r.studentIds && r.studentIds.includes(uid)) return true;

  // 2. Direct Name match (normalized without accents, including partial prefixes)
  if (userName && r.studentNames && r.studentNames.some(n => {
    const normN = normalizeStr(n);
    if (!normN) return false;
    return normN === userName || normN.includes(userName) || userName.includes(normN) || (normN.length >= 4 && userName.length >= 4 && normN.slice(0, 4) === userName.slice(0, 4));
  })) {
    return true;
  }

  // 3. Match via users list
  if (allUsers && allUsers.length > 0) {
    const matchingStudents = allUsers.filter(u => {
      const uUid = u.uid || u.id;
      if (uid && uUid === uid) return true;
      if (userEmail && normalizeStr(u.email) === userEmail) return true;
      const uName = normalizeStr(u.name);
      if (userName && uName && (uName === userName || uName.includes(userName) || userName.includes(uName) || (uName.length >= 4 && userName.length >= 4 && uName.slice(0, 4) === userName.slice(0, 4)))) return true;
      return false;
    });

    for (const student of matchingStudents) {
      const sId = student.uid || student.id;
      const sName = normalizeStr(student.name);
      if (sId && r.studentIds && r.studentIds.includes(sId)) return true;
      if (sName && r.studentNames && r.studentNames.some(n => {
        const normN = normalizeStr(n);
        return normN && (normN === sName || normN.includes(sName) || sName.includes(normN) || (normN.length >= 4 && sName.length >= 4 && normN.slice(0, 4) === sName.slice(0, 4)));
      })) {
        return true;
      }
    }
  }

  return false;
}

export default function WorkoutList({ workouts, onSelectWorkout, trainerPhone, onBack }: WorkoutListProps) {
  const [adminRoutines, setAdminRoutines] = useState<AdminRoutine[]>([]);
  const [activeSession, setActiveSession] = useState<AdminRoutine | null>(null);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number>(0);
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({});
  const [evolutionRoutine, setEvolutionRoutine] = useState<AdminRoutine | null>(null);
  const [feedbackRoutine, setFeedbackRoutine] = useState<AdminRoutine | null>(null);

  useEffect(() => {
    const user = (() => { try { return JSON.parse(localStorage.getItem('cadu_ponce_user') || '{}'); } catch { return {}; } })();
    const allUsers = storage.getUsersList();

    const loadAndFilter = (routinesList: AdminRoutine[]) => {
      let deletedSet = new Set<string>();
      try {
        const deletedList: string[] = JSON.parse(localStorage.getItem('cadu_ponce_deleted_routines') || '[]');
        const validIds = deletedList.filter(item => 
          item.startsWith('routine_') || 
          item.startsWith('w_') || 
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)
        );
        deletedSet = new Set(validIds.map(s => s.toLowerCase().trim()));
        localStorage.setItem('cadu_ponce_deleted_routines', JSON.stringify(validIds));
      } catch {}

      // Active routines must never be suppressed
      for (const r of routinesList) {
        if (r.id) deletedSet.delete(r.id.toLowerCase().trim());
      }

      return routinesList.filter(r => {
        if (r.id && deletedSet.has(r.id.toLowerCase().trim())) return false;
        return routineMatchesUser(r, user, allUsers);
      });
    };

    // 1. Initial cached filter
    setAdminRoutines(loadAndFilter(storage.getAdminRoutines()));

    // 2. Fetch fresh from cloud and apply updated deletion filters
    storage.fetchAdminRoutines().then(freshAll => {
      setAdminRoutines(loadAndFilter(freshAll));
    }).catch(() => {});
  }, []);

  if (activeSession) {
    return <AdminWorkoutSession routine={activeSession} onClose={() => setActiveSession(null)} trainerPhone={trainerPhone} />;
  }

  const groups = groupRoutines(adminRoutines);
  const activeGroup = groups[selectedGroupIdx] || groups[0];
  const sortedDays = activeGroup ? sortByDayOfWeek(activeGroup.days) : [];

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col pb-24">
      {/* ── Dark Navy Header ─────────────────────────────────────────────── */}
      <div className="bg-[#1c2b3e] px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-white/80 hover:text-white p-1 -ml-1 transition cursor-pointer"
                title="Voltar"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <h1 className="text-white text-xl font-bold tracking-tight">Treinos</h1>
          </div>

          {/* Clock badge icon */}
          <div className="relative p-1">
            <Clock className="w-6 h-6 text-white" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-[#1c2b3e]">
              2
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Content Area ────────────────────────────────────────────── */}
      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {groups.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center space-y-4 my-8">
            <div className="w-16 h-16 rounded-full bg-blue-50 text-[#0070f3] flex items-center justify-center mx-auto">
              <Dumbbell className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Nenhum treino prescrito</h3>
              <p className="text-xs text-slate-500 mt-1">
                Seu treinador Cadu Ponce está preparando suas fichas personalizadas. Em breve elas aparecerão aqui!
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* If student has multiple routine sheets, allow toggling tabs */}
            {groups.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {groups.map((g, idx) => (
                  <button
                    key={g.groupName}
                    onClick={() => setSelectedGroupIdx(idx)}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all shadow-sm cursor-pointer ${
                      selectedGroupIdx === idx
                        ? 'bg-[#0070f3] text-white shadow-blue-500/20'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {g.groupName}
                  </button>
                ))}
              </div>
            )}

            {/* ── Floating Top Card (Treino Musculação I) ────────────────── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3.5">
              {/* Torso outline avatar */}
              <div className="w-14 h-14 rounded-full bg-[#e8f3ff] flex items-center justify-center shrink-0 border border-blue-100">
                <svg
                  className="w-8 h-8 text-[#0070f3]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 3h10l1 3.5-2.5 2.5v11H8.5V9L6 6.5 7 3Z" />
                  <path d="M9 3v4.5a3 3 0 0 0 6 0V3" />
                  <path d="M12 7.5V17" />
                  <path d="M9 12h6" />
                  <path d="M9.5 15h5" />
                </svg>
              </div>

              {/* Sheet details */}
              <div className="flex-1 min-w-0">
                <h2 className="text-slate-900 font-bold text-[15px] truncate">
                  {activeGroup.groupName}
                </h2>

                {/* Date range with Calendar icon */}
                <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    {activeGroup.startDate && activeGroup.endDate
                      ? `${formatDate(activeGroup.startDate)} – ${formatDate(activeGroup.endDate)}`
                      : `${new Date().toLocaleDateString('pt-BR')} – ${new Date(Date.now() + 30 * 86400000).toLocaleDateString('pt-BR')}`}
                  </span>
                </div>

                {/* Goal | Difficulty */}
                <p className="text-slate-500 text-xs mt-0.5">
                  {[activeGroup.goal || 'Hipertrofia', activeGroup.difficulty || 'Intermediário']
                    .filter(Boolean)
                    .join(' | ')}
                </p>
              </div>
            </div>

            {/* ── Day-by-Day Cards (Segunda, Terça, Quarta...) ──────────── */}
            <div className="space-y-4">
              {sortedDays.map((routine) => {
                const dayLabel = routine.dayOfWeek ? getDayLabel(routine.dayOfWeek) : routine.name;
                const muscleSubtitle = routine.muscleGroup || (routine.name !== dayLabel ? routine.name : 'Musculação');
                const isOpen = !!notesOpen[routine.id];

                return (
                  <div
                    key={routine.id}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3"
                  >
                    {/* Day Title & Muscle Group */}
                    <div>
                      <h3 className="text-slate-900 font-bold text-base leading-tight">
                        {dayLabel}
                      </h3>
                      {muscleSubtitle && (
                        <p className="text-slate-500 text-xs mt-0.5">
                          {muscleSubtitle}
                        </p>
                      )}
                    </div>

                    {/* Orientações gerais Accordion */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setNotesOpen(prev => ({ ...prev, [routine.id]: !prev[routine.id] }))}
                        className="w-full bg-[#EEEEEE] hover:bg-[#E2E4E8] transition rounded-lg px-3.5 py-2.5 flex items-center justify-between cursor-pointer"
                      >
                        <span className="text-slate-800 text-xs font-semibold">Orientações gerais</span>
                        <Eye className="w-4 h-4 text-slate-600" />
                      </button>

                      {isOpen && (
                        <div className="bg-slate-50 rounded-lg p-3 mt-1.5 border border-slate-100 text-xs text-slate-700 leading-relaxed animate-in fade-in duration-200">
                          {routine.generalNotes || routine.notes || 'Sem orientações adicionais informadas pelo treinador.'}
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <p className="text-[#2b88ff] text-xs font-normal">
                      Você ainda não realizou esse treino
                    </p>

                    {/* Evolução + Feedbacks Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEvolutionRoutine(routine)}
                        className="border border-[#2b88ff] text-[#2b88ff] hover:bg-blue-50 transition rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold active:scale-[0.98] cursor-pointer"
                      >
                        <TrendingUp className="w-4 h-4 text-[#2b88ff]" />
                        <span>Evolução</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFeedbackRoutine(routine)}
                        className="border border-[#2b88ff] text-[#2b88ff] hover:bg-blue-50 transition rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold active:scale-[0.98] cursor-pointer"
                      >
                        <ClipboardCheck className="w-4 h-4 text-[#2b88ff]" />
                        <span>Feedbacks</span>
                      </button>
                    </div>

                    {/* Big bright blue button: Ver treino */}
                    <button
                      type="button"
                      onClick={() => setActiveSession(routine)}
                      className="w-full bg-[#0070f3] hover:bg-[#005cd6] text-white font-bold py-3.5 rounded-xl text-sm transition shadow-sm active:scale-[0.99] flex items-center justify-center cursor-pointer"
                    >
                      Ver treino
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Evolution Modal ──────────────────────────────────────────────── */}
      {evolutionRoutine && (
        <EvolutionModal
          routine={evolutionRoutine}
          onClose={() => setEvolutionRoutine(null)}
        />
      )}

      {/* ── Feedback Modal ───────────────────────────────────────────────── */}
      {feedbackRoutine && (
        <FeedbackModal
          routine={feedbackRoutine}
          trainerPhone={trainerPhone}
          onClose={() => setFeedbackRoutine(null)}
        />
      )}
    </div>
  );
}

// ── Evolution Modal Component ────────────────────────────────────────────────

function EvolutionModal({ routine, onClose }: { routine: AdminRoutine; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-blue-50 text-[#0070f3] flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Evolução do Treino</h3>
              <p className="text-xs text-slate-500">{routine.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {(!routine.exercises || routine.exercises.length === 0) ? (
            <p className="text-xs text-slate-500 text-center py-6">Nenhum exercício registrado nesta ficha.</p>
          ) : (
            routine.exercises.map((ex, idx) => (
              <div key={ex.id || idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">{ex.name}</h4>
                  <p className="text-[11px] text-slate-500">{ex.sets} séries × {ex.reps} reps • Descanso: {ex.rest || '60s'}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-[#0070f3] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                    {ex.prescribedLoads && ex.prescribedLoads.length > 0
                      ? `${Math.max(...ex.prescribedLoads)} kg`
                      : 'Em progresso'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-[#0070f3] text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

// ── Feedback Modal Component ─────────────────────────────────────────────────

function FeedbackModal({
  routine,
  trainerPhone,
  onClose,
}: {
  routine: AdminRoutine;
  trainerPhone?: string;
  onClose: () => void;
}) {
  const [rating, setRating] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleSubmit = () => {
    const text = `*Feedback de Treino - Cadu Ponce Personal*\nTreino: ${routine.name}\nAvaliação: ${'⭐'.repeat(rating)}\nMensagem: ${feedbackText || 'Sem observações adicionais.'}`;
    const phone = (trainerPhone || '5511999999999').replace(/\D/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setSubmitted(true);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-blue-50 text-[#0070f3] flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Feedback do Treino</h3>
              <p className="text-xs text-slate-500">{routine.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800">Feedback enviado com sucesso!</h4>
            <p className="text-xs text-slate-500">Obrigado por compartilhar seu feedback com o Cadu.</p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Como você avalia a intensidade e o treino de hoje?
              </label>
              <div className="flex items-center gap-2 justify-center py-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    className="p-1 transition active:scale-125 cursor-pointer"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        s <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observações para o treinador:
              </label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Sentiu dor em alguma articulação? Conseguiu aumentar carga? Deixe seu recado..."
                rows={3}
                className="w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-[#0070f3] resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex-1 py-3 bg-[#0070f3] hover:bg-[#005cd6] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Feedback</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
