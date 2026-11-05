import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import AppStartup from './components/AppStartup';
import SplashScreen from './components/SplashScreen';
import './index.css';
import { installErrorReporting } from './lib/errorReporting';

installErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PwaUpdateBanner />
      <AppStartup>
        <Suspense fallback={<SplashScreen compact />}>
          <App />
        </Suspense>
      </AppStartup>
    </ErrorBoundary>
  </StrictMode>,
);
