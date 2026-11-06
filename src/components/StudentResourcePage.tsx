import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { storage } from '../lib/storage';

export function useStudentResource<T>(studentId: string, load: (studentId: string) => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const request = ++revision.current;
    const actor = storage.getUser()?.uid;
    setLoading(true); setError('');
    try {
      const result = await load(studentId);
      if (request === revision.current && actor === storage.getUser()?.uid) setItems(result);
    } catch (failure) {
      if (request === revision.current && actor === storage.getUser()?.uid) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar. Tente novamente.');
    } finally { if (request === revision.current) setLoading(false); }
  }, [studentId, load]);
  useEffect(() => {
    setItems([]); void reload();
    const refresh = () => { void reload(); };
    window.addEventListener('focus', refresh);
    return () => { revision.current++; window.removeEventListener('focus', refresh); };
  }, [reload]);
  const updateItems = useCallback<React.Dispatch<React.SetStateAction<T[]>>>(update => {
    // A response started before a confirmed mutation cannot replace that result.
    revision.current++; setLoading(false); setError(''); setItems(update);
  }, []);
  return { items, setItems: updateItems, loading, error, reload };
}

export default function StudentResourcePage({ title, onBack, loading, error, onRefresh, children }: {
  title: string; onBack: () => void; loading: boolean; error?: string;
  onRefresh: () => Promise<void>; children: React.ReactNode;
}) {
  return <section className="student-resource-page min-h-full bg-[#1c2b3e] p-4 space-y-4 pb-10">
    <div className="flex justify-between items-center text-white">
      <button onClick={onBack} className="flex items-center gap-1 text-sm"><ChevronLeft className="w-4 h-4" />Voltar</button>
      <button onClick={() => void onRefresh()} disabled={loading} aria-label={`Atualizar ${title}`} className="p-2 disabled:opacity-40"><RefreshCw className="w-5 h-5" /></button>
    </div>
    <h2 className="text-xl font-bold text-white">{title}</h2>
    {loading && <p role="status" className="text-slate-300 text-sm">Carregando...</p>}
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900 text-sm">{error}</p>}
    {children}
  </section>;
}
