import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Bell, CheckCheck, MessageCircle, Clock, RefreshCw } from 'lucide-react';
import { TrainerNotification } from '../lib/trainerNotifications';

interface NotificationsModalProps {
  onClose: () => void;
  isDark: boolean;
  userRole?: 'admin' | 'student';
  notifications?: TrainerNotification[];
  loading?: boolean;
  error?: string;
  busy?: boolean;
  onMarkRead?: (ids: string[]) => Promise<void>;
  onRefresh?: () => Promise<void>;
  pushControl?: React.ReactNode;
}

export default function NotificationsModal({ onClose, isDark, userRole = 'admin', notifications = [], loading = false, error = '', busy = false, onMarkRead = async () => {}, onRefresh = async () => {}, pushControl }: NotificationsModalProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [actionError, setActionError] = useState('');
  const unread = notifications.filter(item => !item.isRead);
  const filtered = filter === 'unread' ? unread : notifications;
  const markRead = async (ids: string[]) => {
    setActionError('');
    try { await onMarkRead(ids); }
    catch { setActionError('Não foi possível confirmar a leitura. Tente novamente.'); }
  };
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        role="dialog" aria-modal="true" aria-labelledby="notifications-title" id="notifications-modal"
        className={`w-full max-w-lg rounded-3xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
        <div className="p-5 border-b border-slate-700/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Bell className="w-6 h-6 text-red-500" /><div>
            <h3 id="notifications-title" className="font-black italic uppercase tracking-tighter text-lg">Notificações</h3>
            <p className="text-xs text-slate-400">{userRole === 'admin' ? 'Treinos concluídos pelos alunos' : 'Atualizações da consultoria'}</p>
          </div></div>
          <button onClick={onClose} aria-label="Fechar notificações" className="p-2 rounded-full hover:bg-slate-500/10"><X className="w-5 h-5" /></button>
        </div>
        {pushControl && <div className="px-5 py-3 border-b border-slate-700/30">{pushControl}</div>}
        <div className="px-5 py-3 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-1">
            <button onClick={() => setFilter('all')} aria-pressed={filter === 'all'} className={`px-3 py-2 rounded-lg text-xs font-bold ${filter === 'all' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>Todas ({notifications.length})</button>
            <button onClick={() => setFilter('unread')} aria-pressed={filter === 'unread'} className={`px-3 py-2 rounded-lg text-xs font-bold ${filter === 'unread' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>Não lidas ({unread.length})</button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => void onRefresh()} disabled={loading} aria-label="Atualizar notificações" className="p-2 text-slate-400 disabled:opacity-50"><RefreshCw className="w-4 h-4" /></button>
            {unread.length > 0 && <button onClick={() => void markRead(unread.map(item => item.id))} disabled={busy} className="text-xs font-bold text-red-500 disabled:opacity-50">{busy ? 'Salvando…' : 'Marcar todas como lidas'}</button>}
          </div>
        </div>
        {(error || actionError) && <p role="alert" className="px-5 pb-3 text-xs text-red-400">{actionError || error}</p>}
        <div className={`flex-1 overflow-y-auto p-5 space-y-3 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
          {loading ? <p role="status" className="py-10 text-center text-sm text-slate-400">Carregando notificações…</p>
            : filtered.length === 0 ? <div className="py-10 text-center text-slate-400"><Bell className="w-8 h-8 mx-auto mb-3" /><p className="text-sm font-bold">{error ? 'Notificações indisponíveis' : 'Nenhuma notificação'}</p><p className="mt-2 text-xs">{filter === 'unread' ? 'As notificações não lidas aparecerão aqui.' : userRole === 'admin' ? 'Quando um aluno concluir um treino, você verá o registro aqui.' : 'Seus avisos aparecerão aqui.'}</p></div>
              : filtered.map(item => (
                <article key={item.id} className={`p-4 rounded-2xl border ${!item.isRead ? 'border-red-500/40' : 'border-slate-500/20'} ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
                  <div className="flex items-start gap-3">
                    <CheckCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase font-black text-emerald-500">Treino concluído</p>
                      <h4 className="font-bold text-sm mt-1">{item.studentName}</h4>
                      <p className="text-sm text-slate-400">{item.workoutTitle}</p>
                      <p className="text-xs text-slate-400 mt-1">{item.fullDate ? new Date(item.fullDate).toLocaleString('pt-BR') : item.timestamp}</p>
                      {item.duration && <span className="inline-flex gap-1 items-center text-xs text-slate-400 mt-2"><Clock className="w-3 h-3" />{item.duration}</span>}
                      {item.detailMessage && <p className="text-xs text-slate-400 mt-2">{item.detailMessage}</p>}
                    </div>
                    {!item.isRead && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-2" aria-label="Não lida" />}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3 mt-3">
                    {!item.isRead && <button disabled={busy} onClick={() => void markRead([item.id])} className="text-xs font-bold text-red-500 disabled:opacity-50">Marcar como lida</button>}
                    {item.studentPhone?.replace(/\D/g, '') && <a href={`https://wa.me/${item.studentPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Parabéns ${item.studentName}! Vi que você concluiu o treino "${item.workoutTitle}". Continue assim!`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500"><MessageCircle className="w-4 h-4" />WhatsApp</a>}
                  </div>
                </article>
              ))}
        </div>
      </motion.div>
    </div>
  );
}
