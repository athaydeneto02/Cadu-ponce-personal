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
  MessageCircle,
  Clock,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { storage } from '../lib/storage';

interface NotificationItem {
  id: string;
  studentName: string;
  studentId?: string;
  studentPhone?: string;
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

export default function NotificationsModal({ onClose, isDark, userRole = 'student' }: NotificationsModalProps) {
  // Sempre começa vazio — apenas dados reais do Supabase são exibidos
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(userRole === 'admin');

  // Carrega notificações reais do Supabase ao abrir
  useEffect(() => {
    if (userRole === 'admin') {
      setLoading(true);
      storage.fetchTrainerNotifications().then((cloudItems: any[]) => {
        setNotifications(cloudItems || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [userRole]);

  // Marca uma notificação como lida
  const toggleRead = (id: string) => {
    setNotifications(prev => prev.map(notif =>
      notif.id === id ? { ...notif, isRead: true } : notif
    ));
    if (userRole === 'admin') {
      storage.markTrainerNotificationRead(id);
    }
  };

  // Marca todas como lidas
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, isRead: true })));
    if (userRole === 'admin') {
      notifications.forEach(n => {
        if (!n.isRead) storage.markTrainerNotificationRead(n.id);
      });
    }
  };

  // Limpa todas as notificações da tela (não apaga do Supabase)
  const clearAll = () => {
    setNotifications([]);
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
        {/* Header */}
        <div className={`p-5 pb-4 border-b flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'
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
                {userRole === 'admin' ? 'Treinos concluídos pelos alunos' : 'Atualizações da Consultoria'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-all active:scale-95 ${
              isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-950'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros */}
        <div className={`px-5 py-3.5 flex items-center justify-between text-xs ${
          isDark ? 'bg-slate-900' : 'bg-white'
        }`}>
          <div className="flex space-x-1.5 p-0.5 bg-slate-100 dark:bg-slate-950 rounded-lg">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all ${
                filter === 'all'
                  ? 'bg-red-600 text-white shadow-md shadow-red-900/10'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'
              }`}
            >
              Todas ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all relative ${
                filter === 'unread'
                  ? 'bg-red-600 text-white shadow-md shadow-red-900/10'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'
              }`}
            >
              Não lidas
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-[#dc2626] text-white text-[8.5px] font-extrabold rounded-full flex items-center justify-center animate-pulse">
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
                  title="Apagar da tela"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Limpar</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className={`flex-1 overflow-y-auto p-5 space-y-3.5 scrollbar-none ${
          isDark ? 'bg-slate-950' : 'bg-slate-50'
        }`}>
          <AnimatePresence initial={false}>
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-14 text-center space-y-3"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                  isDark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-100'
                }`}>
                  <Bell className="w-6 h-6 text-slate-400 animate-pulse" />
                </div>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Carregando...</p>
              </motion.div>
            ) : filtered.length === 0 ? (
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
                  <h4 className="font-extrabold text-sm uppercase text-slate-500">Nenhuma notificação</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                    {filter === 'unread'
                      ? 'Nenhuma não lida no momento.'
                      : 'Quando um aluno concluir um treino, aparecerá aqui.'}
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
                        ? isDark ? 'bg-slate-900 border-[#dc2626]/20 hover:border-[#dc2626]/30 shadow-md shadow-[#dc2626]/2' : 'bg-white border-[#dc2626]/20 hover:border-[#dc2626]/30 shadow-sm'
                        : isDark ? 'bg-slate-900/40 border-slate-900 hover:border-slate-800' : 'bg-white border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    {/* Barra de não lida */}
                    {isUnread && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#dc2626]" />
                    )}

                    {/* Ícone */}
                    <div className="shrink-0 pt-0.5">
                      {notif.type === 'record' ? (
                        <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
                          <Trophy className="w-4 h-4" />
                        </div>
                      ) : notif.type === 'evolution' ? (
                        <div className="p-2.5 bg-red-500/10 text-red-500 rounded-xl">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
                          <CheckCheck className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-xs truncate uppercase tracking-tight group-hover:text-red-500 transition-colors">
                          {notif.studentName}
                        </span>
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="text-[9px] text-slate-450 font-bold">{notif.timestamp}</span>
                          {isUnread && (
                            <span className="w-2 h-2 bg-[#dc2626] rounded-full shrink-0" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-black text-slate-300 pr-2">
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

                    {/* Botão WhatsApp para o admin */}
                    {userRole === 'admin' && (
                      <div className="shrink-0 flex items-center justify-center">
                        <a
                          href={
                            (notif.studentPhone && notif.studentPhone.replace(/\D/g, ''))
                              ? `https://wa.me/${notif.studentPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Parabéns ${notif.studentName}! Vi aqui no app que você concluiu o treino "${notif.workoutTitle}". Excelente evolução! 🔥💪`)}`
                              : `https://api.whatsapp.com/send?text=${encodeURIComponent(`Parabéns ${notif.studentName}! Vi que você concluiu o treino "${notif.workoutTitle}". Excelente evolução! 🔥💪`)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm cursor-pointer"
                          title="Parabenizar no WhatsApp"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRead(notif.id);
                          }}
                        >
                          <MessageCircle className="w-3.5 h-3.5 fill-current" />
                          <span className="hidden sm:inline">Whats</span>
                        </a>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`p-4 text-center text-[9px] font-bold uppercase tracking-widest ${
          isDark ? 'bg-slate-900 border-t border-slate-800' : 'bg-slate-50 border-t border-slate-100'
        }`}>
          Treinador Cadu Ponce — Foco Técnico Máximo 🦾
        </div>
      </motion.div>
    </div>
  );
}
