import React, { useEffect, useState } from 'react';

export default function PwaUpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true;
    const onControllerChange = () => { if (active && updateRequested) window.location.reload(); };
    let updateRequested = false;
    const onRequest = () => { updateRequested = true; };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    window.addEventListener('cadu_apply_update', onRequest);
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (!active) return;
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (active && worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(registration.waiting);
          });
        });
      } catch { /* The online app remains usable; push setup reports its own status. */ }
    };
    const onLoad = () => { void register(); };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => {
      active = false;
      window.removeEventListener('load', onLoad);
      window.removeEventListener('cadu_apply_update', onRequest);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
  if (!waiting) return null;
  return <aside role="status" className="fixed bottom-20 left-4 right-4 mx-auto max-w-lg z-[180] rounded-xl bg-slate-900 text-white border border-slate-600 shadow-xl p-4 flex items-center justify-between gap-4">
    <p className="text-sm">Uma atualização está pronta. Salve suas alterações antes de atualizar.</p>
    <button disabled={updating} className="px-3 py-2 bg-red-600 rounded-lg text-sm font-bold disabled:opacity-50" onClick={() => {
      setUpdating(true);
      window.dispatchEvent(new Event('cadu_apply_update'));
      waiting.postMessage({ type: 'SKIP_WAITING' });
    }}>{updating ? 'Atualizando…' : 'Atualizar'}</button>
  </aside>;
}
