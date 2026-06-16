/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Bell, 
  CheckCheck, 
  Trash2, 
  Send, 
  Info, 
  Flame, 
  Trophy, 
  Award, 
  Dumbbell, 
  MessageCircle,
  Clock,
  Sparkles,
  Zap,
  RotateCcw
} from 'lucide-react';
import { UserProfile } from '../types';

interface NotificationItem {
  id: string;
  studentName: string;
  workoutTitle: string;
  duration?: string;
  intensity?: 'high' | 'medium' | 'low';
  timestamp: string;
  isRead: boolean;
  type: 'completion' | 'record' | 'evolution';
  detailMessage?: string;
}

interface NotificationsModalProps {
  onClose: () => void;
  isDark: boolean;
  userRole?: 'admin' | 'student';
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif_felippe',
    studentName: 'Felippe Leitao',
    workoutTitle: 'Treino D - Superiores Completo',
    duration: '55 min',
    intensity: 'high',
    timestamp: 'Há 5 min',
    isRead: false,
    type: 'completion',
    detailMessage: 'Treino concluído com foco em dorsal e bíceps. Solicitou ajuste de exercício para o ombro esquerdo.'
  },
  {
    id: 'notif_mariana',
    studentName: 'Mariana Costa',
    workoutTitle: 'Treino A - Diário (Foco em Glúteos)',
    duration: '48 min',
    intensity: 'high',
    timestamp: 'Há 45 min',
    isRead: false,
    type: 'completion',
    detailMessage: 'Concluiu todas as séries de Elevação Pélvica com excelente contração muscular!'
  },
  {
    id: 'notif_1',
    studentName: 'Aline Rocha',
    workoutTitle: 'Treino A - Diário (Inferiores com Foco em Quadríceps)',
    duration: '52 min',
    intensity: 'high',
    timestamp: 'Há 2 horas',
    isRead: false,
    type: 'completion',
    detailMessage: 'Completou todas as 5 séries de Agachamento Búlgaro com aumento de +2kg de sobrecarga!'
  },
  {
    id: 'notif_3',
    studentName: 'Carla Pereira',
    workoutTitle: 'Treino C - Core & Cardio Avançado',
    duration: '38 min',
    intensity: 'medium',
    timestamp: 'Há 4 horas',
    isRead: false,
    type: 'completion',
    detailMessage: 'Manteve a frequência cardíaca média ideal em 142 BPM durante as séries.'
  },
  {
    id: 'notif_2',
    studentName: 'José Soares',
    workoutTitle: 'Treino B - Hipertrofia (Peito e Tríceps)',
    duration: '45 min',
    intensity: 'high',
    timestamp: 'Há 6 horas',
    isRead: false,
    type: 'record',
    detailMessage: 'Novo Recorde Pessoal no Supino Reto! Levantou 64kg para 8 repetições perfeitas.'
  }
];

const STUDENT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif_stud_1',
    studentName: 'Cadu Ponce',
    workoutTitle: 'Nova Ficha Gerada',
    timestamp: 'Há 1 hora',
    isRead: false,
    type: 'evolution',
    detailMessage: 'Cadu atualizou sua ficha de exercícios para o Bloco de Hipertrofia II!'
  },
  {
    id: 'notif_stud_2',
    studentName: 'Cadu Ponce',
    workoutTitle: 'Feedback Respondido',
    timestamp: 'Ontem',
    isRead: true,
    type: 'completion',
    detailMessage: 'Cadu Ponce analisou sua execução do búlgaro: "Excelente técnica, pode subir 2kg!"'
  },
  {
    id: 'notif_stud_3',
    studentName: 'Cadu Ponce',
    workoutTitle: 'Lembrete de Evolução',
    timestamp: 'Há 2 dias',
    isRead: true,
    type: 'record',
    detailMessage: 'Está na hora de registrar as dobras e nova foto na aba de Evolução!'
  }
];

export default function NotificationsModal({ onClose, isDark, userRole = 'student' }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const saved = localStorage.getItem(`cadu_notifs_${userRole}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return userRole === 'admin' ? INITIAL_NOTIFICATIONS : STUDENT_NOTIFICATIONS;
  });

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    localStorage.setItem(`cadu_notifs_${userRole}`, JSON.stringify(notifications));
  }, [notifications, userRole]);

  // Mark single as read
  const toggleRead = (id: string) => {
    setNotifications(prev => prev.map(notif => 
      notif.id === id ? { ...notif, isRead: true } : notif
    ));
  };

  // Mark all as read
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, isRead: true })));
  };

  // Clear all notifications
  const clearAll = () => {
    setNotifications([]);
  };

  // Reset to original list
  const resetNotifications = () => {
    setNotifications(userRole === 'admin' ? INITIAL_NOTIFICATIONS : STUDENT_NOTIFICATIONS);
  };

  // Simulate a student workout completion dynamically!
  const triggerSimulateWorkoutCompletion = () => {
    const students = ['Felippe Leitao', 'Mariana Costa', 'Aline Rocha', 'Carla Pereira', 'José Soares'];
    const selectedStudent = students[Math.floor(Math.random() * students.length)];
    const workoutsList = ['Treino A - Diário (Inferiores)', 'Treino B - Hipertrofia (Peito e Tríceps)', 'Treino C - Core & Cardio Avançado', 'Treino D - Superiores Completo'];
    const selectedWorkout = workoutsList[Math.floor(Math.random() * workoutsList.length)];
    const minutes = Math.floor(Math.random() * 25) + 35; // 35 to 60 min

    const newNotification: NotificationItem = {
      id: 'notif_' + Date.now(),
      studentName: selectedStudent,
      workoutTitle: selectedWorkout,
      duration: `${minutes} min`,
      intensity: Math.random() > 0.3 ? 'high' : 'medium',
      timestamp: 'Agora mesmo',
      isRead: false,
      type: Math.random() > 0.6 ? 'record' : 'completion',
      detailMessage: Math.random() > 0.5 
        ? 'Todos os blocos concluídos com taxa de acerto de carga de 100%!'
        : 'Série extra de isometria executada com sucesso ao final!'
    };

    setNotifications(prev => [newNotification, ...prev]);
  };

  const filtered = notifications.filter(notif => filter === 'all' || !notif.isRead);
  const unreadCount = notifications.filter(notif => !notif.isRead).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={`w-full max-w-lg rounded-3xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden ${
          isDark 
            ? 'bg-slate-900 border-slate-800 text-white' 
            : 'bg-white border-slate-100 text-slate-800'
        }`}
        id="notifications-modal"
      >
        {/* Header Modal */}
        <div className={`p-5 pb-4 border-b flex items-center justify-between ${
          isDark ? 'border-slate-850 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${
              isDark ? 'bg-red-950/30 text-red-500' : 'bg-red-50 text-red-600'
            }`}>
              <Bell className="w-5 h-5 animate-swing" />
            </div>
            <div>
              <h3 className="font-black italic uppercase tracking-tighter text-lg">Notificações</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {userRole === 'admin' ? 'Acompanhamento do Cadu Ponce' : 'Atualizações da Consultoria'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-all active:scale-95 ${
              isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-550 hover:text-slate-950'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Simulator controls for Admin, or dynamic updates */}
        {userRole === 'admin' && (
          <div className={`px-5 py-3 border-b flex items-center justify-between gap-4 ${
            isDark ? 'bg-slate-900/10 border-slate-850' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className="text-[9.5px] font-extrabold uppercase tracking-widest text-[#1da1f2]/90 flex items-center gap-1.5 animate-pulse">
              <Zap className="w-4.5 h-4.5" /> SIMULADOR ACTIVE ACTION
            </span>
            <button
              onClick={triggerSimulateWorkoutCompletion}
              className="py-1 px-3 bg-[#1da1f2] hover:bg-[#158cd4] text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 shadow-sm"
              id="btn-simulate-completion"
            >
              <Dumbbell className="w-3 h-3" /> Concluir Novo Treino
            </button>
          </div>
        )}

        {/* Secondary filters toolbar */}
        <div className={`px-5 py-3.5 flex items-center justify-between text-xs ${
          isDark ? 'bg-slate-900' : 'bg-white'
        }`}>
          <div className="flex space-x-1.5 p-0.5 bg-slate-100 dark:bg-slate-950 rounded-lg">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all ${
                filter === 'all' 
                  ? 'bg-red-600 text-white shadow-md shadow-red-900/10' 
                  : 'text-slate-400 hover:text-slate-650 dark:hover:text-white'
              }`}
            >
              Todas ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all relative ${
                filter === 'unread' 
                  ? 'bg-red-600 text-white shadow-md shadow-red-900/10' 
                  : 'text-slate-400 hover:text-slate-650 dark:hover:text-white'
              }`}
            >
              Não lidas
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-[#1da1f2] text-white text-[8.5px] font-extrabold rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {notifications.length > 0 && (
              <>
                <button
                  onClick={markAllAsRead}
                  className="text-slate-400 hover:text-red-500 font-bold flex items-center gap-1 transition-colors"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Marcar Lidas</span>
                </button>
                <button
                  onClick={clearAll}
                  className="text-slate-400 hover:text-slate-600 font-bold flex items-center gap-1 transition-colors"
                  title="Apagar todas"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Limpar</span>
                </button>
              </>
            )}
            {notifications.length === 0 && (
              <button
                onClick={resetNotifications}
                className="text-slate-400 hover:text-red-600 font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider transition-all"
                title="Restaurar notificações originais"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list viewport containing notifications */}
        <div className={`flex-1 overflow-y-auto p-5 space-y-3.5 divide-y divide-transparent scrollbar-none ${
          isDark ? 'bg-slate-950' : 'bg-slate-50'
        }`}>
          <AnimatePresence initial={false}>
            {filtered.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-14 text-center space-y-3"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                  isDark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-100'
                }`}>
                  <Bell className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm uppercase text-slate-450">Tudo em dia por aqui!</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                    {filter === 'unread' ? 'Nenhuma notificação não lida encontrada.' : 'Sua caixa de atualizações está vazia.'}
                  </p>
                </div>
              </motion.div>
            ) : (
              filtered.map((notif) => {
                const isUnread = !notif.isRead;
                
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => toggleRead(notif.id)}
                    className={`p-4 rounded-2xl border text-left transition-all relative flex gap-3.5 overflow-hidden group cursor-pointer ${
                      isUnread 
                        ? isDark ? 'bg-slate-900 border-[#1da1f2]/20 hover:border-[#1da1f2]/30 shadow-md shadow-[#1da1f2]/2' : 'bg-white border-[#1da1f2]/20 hover:border-[#1da1f2]/30 shadow-sm'
                        : isDark ? 'bg-slate-900/40 border-slate-900 hover:border-slate-850' : 'bg-white border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    {/* Unread marker bar on LHS */}
                    {isUnread && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1da1f2]" />
                    )}

                    {/* Left Icon status badge */}
                    <div className="shrink-0 pt-0.5">
                      {notif.type === 'record' ? (
                        <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
                          <Trophy className="w-4 h-4" />
                        </div>
                      ) : notif.type === 'evolution' ? (
                        <div className="p-2.5 bg-red-650/10 text-red-500 rounded-xl">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
                          <CheckCheck className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Middle metadata informational segment */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-xs truncate uppercase tracking-tight text-white dark:text-white group-hover:text-red-500 transition-colors">
                          {notif.studentName}
                        </span>
                        
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="text-[9px] text-slate-450 font-bold">{notif.timestamp}</span>
                          {isUnread && (
                            <span className="w-2 h-2 bg-[#1da1f2] rounded-full shrink-0" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-black text-slate-300 dark:text-slate-350 pr-2">
                          {notif.workoutTitle}
                        </span>
                        
                        {notif.duration && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-slate-950 dark:bg-slate-900 text-slate-400 font-mono text-[9px] font-bold">
                            <Clock className="w-2.5 h-2.5" />
                            {notif.duration}
                          </span>
                        )}

                        {notif.intensity && (
                          <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider ${
                            notif.intensity === 'high' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {notif.intensity === 'high' ? 'Intensidade Alta' : 'Intensidade Média'}
                          </span>
                        )}
                      </div>

                      {notif.detailMessage && (
                        <p className="text-[10.5px] font-medium leading-relaxed italic text-slate-400 pt-1.5 line-clamp-2">
                          "{notif.detailMessage}"
                        </p>
                      )}
                    </div>

                    {/* Quick Interactive WhatsApp congratulation button (For Cadu) */}
                    {userRole === 'admin' && (
                      <div className="shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <a
                          href={`https://wa.me/5511999999999?text=Parabéns%20${encodeURIComponent(notif.studentName)}!%20Vi%20aqui%20no%20app%20que%20você%20concluiu%20o%20${encodeURIComponent(notif.workoutTitle)}.%20Excelente%20evolução!%20🔥`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-full bg-emerald-500/15 hover:bg-emerald-600 text-emerald-400 hover:text-white transition duration-200 active:scale-95 shadow-sm"
                          title="Parabenizar no WhatsApp"
                          onClick={(e) => {
                            e.stopPropagation(); // Avoid triggering read toggle on clicking button alone
                            toggleRead(notif.id);
                          }}
                        >
                          <MessageCircle className="w-4.5 h-4.5 fill-current" />
                        </a>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* Modal Footer helper */}
        <div className={`p-4 text-center text-[9px] font-bold uppercase tracking-widest ${
          isDark ? 'bg-slate-900 border-t border-slate-850' : 'bg-slate-50 border-t border-slate-100'
        }`}>
          Treinador Cadu Ponce — Foco Técnico Máximo 🦾
        </div>
      </motion.div>
    </div>
  );
}
