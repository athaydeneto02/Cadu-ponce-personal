import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import './index.css';
import { installErrorReporting } from './lib/errorReporting';

installErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PwaUpdateBanner />
      <Suspense fallback={<div role="status" className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Carregando…</div>}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
