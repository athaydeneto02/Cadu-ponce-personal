/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Dumbbell, Eye, TrendingUp, ClipboardList } from 'lucide-react';
import { Workout, AdminRoutine } from '../types';
import { storage } from '../lib/storage';
import AdminWorkoutSession from './AdminWorkoutSession';

interface WorkoutListProps {
  workouts: Workout[];
  onSelectWorkout: (workout: Workout) => void;
  trainerPhone?: string;
  onBack?: () => void;
}

type ActiveTab = 'routines' | 'aerobic';

const DAYS_ORDER = ['Segunda', 'Terca', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Sábado', 'Domingo'];

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
  } catch { return iso; }
}

// ── Routine list card ───────────────────────────────────────────────────────

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
    const key = r.routineGroupName || r.name;
    if (!map[key]) {
      map[key] = {
        groupName: key,
        goal: r.goal,
        difficulty: r.difficulty,
        startDate: r.startDate,
        endDate: r.endDate,
        days: [],
      };
    }
    map[key].days.push(r);
    // Use earliest startDate/latest endDate across the group
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

  // 3. Match via users list (email / name / id linkage)
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('routines');
  const [adminRoutines, setAdminRoutines] = useState<AdminRoutine[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<RoutineGroup | null>(null);
  const [activeSession, setActiveSession] = useState<AdminRoutine | null>(null);

  useEffect(() => {
    const user = (() => { try { return JSON.parse(localStorage.getItem('cadu_ponce_user') || '{}'); } catch { return {}; } })();
    const allUsers = storage.getUsersList();
    const deletedList: string[] = JSON.parse(localStorage.getItem('cadu_ponce_deleted_routines') ?? '[]');
    const deletedSet = new Set(deletedList.map(s => s.toLowerCase().trim()));

    const isMatch = (r: AdminRoutine) => {
      if (r.id && deletedSet.has(r.id.toLowerCase().trim())) return false;
      if (r.name && deletedSet.has(r.name.toLowerCase().trim())) return false;
      return routineMatchesUser(r, user, allUsers);
    };

    const cached = storage.getAdminRoutines().filter(isMatch);
    setAdminRoutines(cached);
    storage.fetchAdminRoutines().then(all => {
      setAdminRoutines(all.filter(isMatch));
    }).catch(() => {});
  }, []);

  if (activeSession) {
    return <AdminWorkoutSession routine={activeSession} onClose={() => setActiveSession(null)} />;
  }

  // Combine adminRoutines with workouts prop so any assigned workout is guaranteed to appear
  const deletedList: string[] = JSON.parse(localStorage.getItem('cadu_ponce_deleted_routines') ?? '[]');
  const deletedSet = new Set(deletedList.map(s => s.toLowerCase().trim()));
  const isDeleted = (id?: string, name?: string) => {
    if (id && deletedSet.has(id.toLowerCase().trim())) return true;
    if (name && deletedSet.has(name.toLowerCase().trim())) return true;
    return false;
  };

  const combinedRoutines: AdminRoutine[] = adminRoutines.filter(r => !isDeleted(r.id, r.name));
  if (workouts && workouts.length > 0) {
    for (const w of workouts) {
      if (isDeleted(w.id, w.name)) continue;
      const alreadyExists = combinedRoutines.some(r => normalizeStr(r.name) === normalizeStr(w.name));
      if (!alreadyExists) {
        combinedRoutines.push({
          id: w.id,
          name: w.name,
          goal: w.description || 'Treino Personalizado',
          difficulty: 'Iniciante',
          exercises: (w.exercises || []).map(e => ({
            id: e.id,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            rest: e.rest || '60s',
            notes: e.notes || undefined,
          })),
          studentIds: [w.studentId],
          studentNames: [],
          createdAt: w.createdAt,
        });
      }
    }
  }

  const groups = groupRoutines(combinedRoutines);

  if (selectedGroup) {
    return (
      <RoutineDetail
        group={selectedGroup}
        onBack={() => setSelectedGroup(null)}
        onStartSession={(r) => setActiveSession(r)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FA]">
      {/* Dark header area */}
      <div className="bg-[#1c2b3e] px-4 pt-4 pb-0">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition mb-2">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
        )}
        <h2 className="text-white text-xl font-semibold mb-3">Treinos</h2>

        <div className="flex space-x-0 mt-2">
          <button
            onClick={() => setActiveTab('routines')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'routines'
                ? 'bg-[#0070f3] text-white'
                : 'bg-white text-slate-700'
            }`}
          >
            Rotinas de Treinos
          </button>
          <button
            onClick={() => setActiveTab('aerobic')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'aerobic'
                ? 'bg-[#0070f3] text-white'
                : 'bg-white text-slate-700'
            }`}
          >
            Aeróbico
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {activeTab === 'routines' && (
          <>
            {groups.length === 0 && (
              <div className="text-center py-16">
                <Dumbbell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">Nenhuma ficha prescrita</p>
                <p className="text-slate-400 text-sm mt-1">Seu treinador ainda não atribuiu fichas para você.</p>
              </div>
            )}
            {groups.map((group) => (
              <RoutineCard
                key={group.groupName}
                group={group}
                onSelect={() => setSelectedGroup(group)}
              />
            ))}
          </>
        )}

        {activeTab === 'aerobic' && (
          <div className="text-center py-16">
            <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">Nenhum treino aeróbico</p>
            <p className="text-slate-400 text-sm mt-1">Seu treinador ainda não adicionou treinos aeróbicos.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Routine Card (list view) ────────────────────────────────────────────────

function RoutineCard({ group, onSelect }: { group: RoutineGroup; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full bg-white rounded-xl shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
    >
      {/* Icon */}
      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
        <Dumbbell className="w-6 h-6 text-blue-500" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-slate-900 font-semibold text-sm">{group.groupName}</h3>
        {(group.startDate || group.endDate) && (
          <div className="flex items-center gap-1 mt-0.5">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span className="text-slate-500 text-xs">
              {formatDate(group.startDate)} – {formatDate(group.endDate)}
            </span>
          </div>
        )}
        {(group.goal || group.difficulty) && (
          <p className="text-slate-500 text-xs mt-0.5">
            {[group.goal, group.difficulty].filter(Boolean).join(' | ')}
          </p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
    </button>
  );
}

// ── Routine Detail view ─────────────────────────────────────────────────────

function RoutineDetail({
  group,
  onBack,
  onStartSession,
}: {
  group: RoutineGroup;
  onBack: () => void;
  onStartSession: (r: AdminRoutine) => void;
}) {
  const sortedDays = sortByDayOfWeek(group.days);
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="min-h-screen bg-[#F4F6FA]">
      {/* Header card */}
      <div className="bg-white shadow-sm mb-2">
        <div className="px-4 pt-3 pb-2 border-b border-slate-100">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-slate-500 text-xs font-semibold hover:text-slate-800 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar para rotinas
          </button>
        </div>
        <div className="flex items-center gap-3 p-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Dumbbell className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-slate-900 font-semibold text-sm">{group.groupName}</h2>
            {(group.startDate || group.endDate) && (
              <div className="flex items-center gap-1 mt-0.5">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span className="text-slate-500 text-xs">
                  {formatDate(group.startDate)} – {formatDate(group.endDate)}
                </span>
              </div>
            )}
            {(group.goal || group.difficulty) && (
              <p className="text-slate-500 text-xs">
                {[group.goal, group.difficulty].filter(Boolean).join(' | ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Day cards */}
      <div className="p-4 space-y-6">
        {sortedDays.map((routine) => (
          <DaySection
            key={routine.id}
            routine={routine}
            notesOpen={!!notesOpen[routine.id]}
            onToggleNotes={() => setNotesOpen(prev => ({ ...prev, [routine.id]: !prev[routine.id] }))}
            onStart={() => onStartSession(routine)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Day section (Segunda, Terça...) ─────────────────────────────────────────

function DaySection({
  routine,
  notesOpen,
  onToggleNotes,
  onStart,
}: {
  routine: AdminRoutine;
  notesOpen: boolean;
  onToggleNotes: () => void;
  onStart: () => void;
}) {
  const dayLabel = routine.dayOfWeek ? getDayLabel(routine.dayOfWeek) : routine.name;

  return (
    <div>
      <h3 className="text-slate-900 font-bold text-base">{dayLabel}</h3>
      {routine.muscleGroup && (
        <p className="text-slate-500 text-sm mb-2">{routine.muscleGroup}</p>
      )}

      {/* Orientações gerais */}
      <button
        onClick={onToggleNotes}
        className="w-full bg-[#f0f0f0] rounded-lg px-4 py-3 flex items-center justify-between mb-1"
      >
        <span className="text-slate-700 text-sm font-medium">Orientações gerais</span>
        <Eye className="w-5 h-5 text-slate-500" />
      </button>

      {notesOpen && routine.generalNotes && (
        <div className="bg-white rounded-lg px-4 py-3 mb-1 border border-slate-100">
          <p className="text-slate-600 text-sm">{routine.generalNotes}</p>
        </div>
      )}

      {notesOpen && !routine.generalNotes && (
        <div className="bg-white rounded-lg px-4 py-3 mb-1 border border-slate-100">
          <p className="text-slate-400 text-sm italic">Sem orientações adicionais.</p>
        </div>
      )}

      {/* Status */}
      <p className="text-[#3b82f6] text-sm mb-3 mt-2">Você ainda não realizou esse treino</p>

      {/* Evolução + Feedbacks */}
      <div className="flex gap-3 mb-3">
        <button className="flex-1 border border-[#3b82f6] text-[#3b82f6] rounded-lg py-2.5 flex items-center justify-center gap-1.5 text-sm font-medium active:scale-[0.97] transition-transform">
          <TrendingUp className="w-4 h-4" />
          Evolução
        </button>
        <button className="flex-1 border border-[#3b82f6] text-[#3b82f6] rounded-lg py-2.5 flex items-center justify-center gap-1.5 text-sm font-medium active:scale-[0.97] transition-transform">
          <ClipboardList className="w-4 h-4" />
          Feedbacks
        </button>
      </div>

      {/* Ver treino */}
      <button
        onClick={onStart}
        className="w-full bg-[#3b82f6] text-white font-medium py-3 rounded-lg active:scale-[0.98] transition-transform"
      >
        Ver treino
      </button>
    </div>
  );
}
