import React, { useEffect, useRef, useState } from 'react';
import { Bell, RefreshCw, X } from 'lucide-react';
import { useStudentNotifications } from '../lib/useStudentNotifications';

export default function StudentNotificationCenter({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const feed = useStudentNotifications(userId);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const unread = feed.items.filter(item => !item.readAt);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); trigger.current?.focus(); };
  }, [open]);
  return <>
    <button ref={trigger} onClick={() => { setOpen(true); void feed.refresh(); }} aria-label={`Notificações${unread.length ? `, ${unread.length} não lidas` : ''}`}
      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white hover:text-red-300">
      <Bell className="w-6 h-6" />{unread.length > 0 && <span className="absolute top-0 right-0 text-[10px] rounded-full bg-red-600 px-1 min-w-4">{unread.length > 99 ? '99+' : unread.length}</span>}
    </button>
    {open && <div className="fixed inset-0 z-[140] bg-slate-950/80 flex items-center justify-center p-4 text-slate-800" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="student-inbox-title" className="w-full max-w-lg max-h-[85vh] bg-white rounded-2xl shadow-xl flex flex-col" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-200">
          <h2 id="student-inbox-title" className="font-bold text-lg">Suas notificações</h2>
          <button ref={closeButton} onClick={() => setOpen(false)} aria-label="Fechar notificações" className="p-2"><X size={20} /></button>
        </div>
        <div className="px-5 py-3 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-600">{unread.length} não lidas</span>
          <button onClick={() => void feed.refresh()} disabled={feed.loading} aria-label="Atualizar notificações" className="p-2"><RefreshCw size={18} /></button>
          {unread.length > 0 && <button onClick={() => void feed.markRead(unread.map(item => item.id))} disabled={feed.busy} className="text-sm text-red-600 font-semibold disabled:opacity-50">Marcar todas como lidas</button>}
        </div>
        {feed.error && <p role="alert" className="px-5 pb-3 text-red-700 text-sm">{feed.error}</p>}
        <div className="p-5 pt-0 overflow-y-auto space-y-3">
          {feed.loading ? <p role="status">Carregando avisos…</p> : !feed.items.length ? <p className="py-6 text-slate-500 text-center">{feed.error ? 'Seus avisos estão indisponíveis no momento.' : 'Você ainda não recebeu avisos. Novas fichas, avaliações e solicitações aparecerão aqui.'}</p> : feed.items.map(item =>
            <article key={item.id} className={`rounded-xl border p-4 ${item.readAt ? 'border-slate-200' : 'border-red-300 bg-red-50'}`}>
              <h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm whitespace-pre-wrap">{item.body}</p>
              <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
              {!item.readAt && <button onClick={() => void feed.markRead([item.id])} disabled={feed.busy} className="mt-3 text-sm font-semibold text-red-700 disabled:opacity-50">Marcar como lida</button>}
            </article>)}
        </div>
      </section>
    </div>}
  </>;
}
