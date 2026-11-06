/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy } from 'react';
import { Bell, X, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import StudentChrome from './components/StudentChrome';
import StudentProfile from './components/StudentProfile';
import './styles/student-shell.css';
import './styles/student-surfaces.css';
import { storage } from './lib/storage';
import { supabase } from './lib/supabase';
import { UserProfile, Workout } from './types';
const Dashboard = lazy(() => import('./components/Dashboard'));
const WorkoutList = lazy(() => import('./components/WorkoutList'));
const WorkoutSession = lazy(() => import('./components/WorkoutSession'));
const EvolutionGallery = lazy(() => import('./components/EvolutionGallery'));
const PersonalDataForm = lazy(() => import('./components/PersonalDataForm'));
import UpdatePasswordForm from './components/UpdatePasswordForm';
const AccountManagement = lazy(() => import('./components/AccountManagement'));
import NotificationsModal from './components/NotificationsModal';
import StudentNotificationCenter from './components/StudentNotificationCenter';

import SplashScreen from './components/SplashScreen';
import Login from './components/Login';
import AcquireConsulting from './components/AcquireConsulting';

type Tab = 'dashboard' | 'workouts' | 'evolution' | 'profile';

export default function App() {
  // A cached profile is display data, never proof of a valid session or role.
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('cadu_ponce_theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [dashboardReset, setDashboardReset] = useState(0);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isManagingAccounts, setIsManagingAccounts] = useState(false);
  const [notification, setNotification] = useState<{title: string, body: string} | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showAcquire, setShowAcquire] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    let verifiedUserId: string | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const clearAuthenticatedView = () => {
      verifiedUserId = null;
      setUser(null);
      setIsAuthenticated(false);
      setWorkouts([]);
      setActiveWorkout(null);
      setIsManagingAccounts(false);
      setIsEditingProfile(false);
      setIsUpdatingPassword(false);
      setNotification(null);
      setIsNotificationsOpen(false);
      setActiveTab('dashboard');
      storage.setSessionUser(null);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const request = ++revision;
        const recoveryRequested = event === 'PASSWORD_RECOVERY' || window.location.pathname === '/reset-password';
        if (!session?.user) {
          clearAuthenticatedView();
          setIsRecoveringPassword(false);
          if (recoveryRequested) setAuthError('Este link de recuperação é inválido ou expirou. Solicite um novo link em “Esqueci a senha”.');
          setIsLoading(false);
          return;
        }

        if (verifiedUserId !== session.user.id) {
          // A direct account switch can arrive without a SIGNED_OUT event.
          // Unmount the previous account's screens before validating the next.
          clearAuthenticatedView();
          setIsLoading(true);
        }
        // Auth callbacks must finish before calling other Supabase operations.
        const timer = setTimeout(async () => {
          timers.delete(timer);
          const current = () => mounted && request === revision;
          try {
            const { data: authData, error: authFailure } = await supabase.auth.getUser(session.access_token);
            if (!current()) return;
            if (authFailure || !authData.user || authData.user.id !== session.user.id) {
              throw new Error('Sua sessão expirou. Entre novamente.');
            }
            if (recoveryRequested) {
              clearAuthenticatedView();
              setAuthError(null);
              setIsRecoveringPassword(true);
              return;
            }
            storage.setSessionUser(authData.user.id);
            const profile = await storage.fetchProfile(authData.user.id);
            if (!current()) return;
            if (!profile || profile.status !== 'active') {
              throw new Error('Seu acesso ainda não está liberado. Entre em contato com o personal.');
            }
            verifiedUserId = profile.uid;
            storage.saveUser(profile);
            setUser(profile);
            setAuthError(null);
            setIsAuthenticated(true);
            setIsRecoveringPassword(false);
            storage.fetchWorkouts(profile.uid).then(items => {
              if (current()) setWorkouts(items);
            }).catch(() => {
              if (current()) setNotification({ title: 'Treinos indisponíveis', body: 'Não foi possível atualizar seus treinos. Verifique a conexão e tente novamente.' });
            });
          } catch (error) {
            if (!current()) return;
            clearAuthenticatedView();
            setAuthError(error instanceof Error ? error.message : 'Não foi possível validar seu acesso. Tente novamente.');
          } finally {
            if (current()) setIsLoading(false);
          }
        }, 0);
        timers.add(timer);
      }
    );

    return () => {
      mounted = false;
      revision++;
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.uid || !isOnline) return;
    let active = true;
    let running = false;
    const sync = async () => {
      if (!active || running) return;
      running = true;
      try { await storage.syncPendingData(user.uid); }
      catch {
        if (active) setNotification({ title: 'Sincronização pendente', body: 'Seus registros continuam salvos neste dispositivo. Tentaremos sincronizar quando a conexão estiver disponível.' });
      } finally { running = false; }
    };
    void sync();
    const retry = setInterval(() => void sync(), 60_000);
    window.addEventListener('focus', sync);
    return () => { active = false; clearInterval(retry); window.removeEventListener('focus', sync); };
  }, [isAuthenticated, user?.uid, isOnline]);

  useEffect(() => {
    // A display preference must not crash the app when browser storage is full.
    try { localStorage.setItem('cadu_ponce_theme', theme); } catch { /* Keep the current theme in memory. */ }
  }, [theme]);

  const handleLogin = async (email: string, password?: string) => {
    if (!email || !password) return;
    setAuthError(null);
    setLoginNotice(null);
    // A stale recovery path must not turn a normal login into recovery mode.
    if (window.location.pathname === '/reset-password') window.history.replaceState({}, '', '/');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const errorMessage = error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos. Verifique seus dados e tente novamente.'
        : error.message;
      throw new Error(errorMessage);
    }

  };

  const handleLogout = async (): Promise<boolean> => {
    let pushWarning = false;
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager?.getSubscription();
        if (subscription) {
          // Invalidate the browser endpoint even if removing its database row fails.
          await subscription.unsubscribe();
          if (user?.uid) {
            await supabase.from('push_subscriptions').delete()
              .eq('user_id', user.uid).eq('subscription->>endpoint', subscription.endpoint);
          }
        }
      } catch {
        pushWarning = true;
      }
    }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      window.alert('Não foi possível encerrar a sessão. Verifique a conexão e tente novamente.');
      return false;
    }
    storage.setSessionUser(null);
    setIsAuthenticated(false);
    setIsManagingAccounts(false);
    setUser(null);
    if (pushWarning) setLoginNotice('Você saiu da conta. Não foi possível desativar as notificações; revise a permissão deste site no navegador.');
    return true;
  };

  const finishRecovery = async (saved: boolean) => {
    window.history.replaceState({}, '', '/');
    if (!await handleLogout()) return;
    setIsRecoveringPassword(false);
    setAuthError(null);
    setLoginNotice(saved ? 'Sua senha foi atualizada. Entre com a nova senha.' : null);
  };

  const navigate = (tab: Tab) => {
    setIsEditingProfile(false);
    setIsUpdatingPassword(false);
    setIsManagingAccounts(false);
    setIsNotificationsOpen(false);
    setActiveTab(tab);
    if (tab === 'dashboard') setDashboardReset(value => value + 1);
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  if (isRecoveringPassword) {
    return <UpdatePasswordForm recovery onClose={() => { void finishRecovery(false); }} onSuccess={() => finishRecovery(true)} />;
  }

  if (!isAuthenticated) {
    if (showAcquire) {
      return (
        <AcquireConsulting 
          onCancel={() => setShowAcquire(false)}
        />
      );
    }
    return <Login onLogin={handleLogin} onAcquireClick={() => setShowAcquire(true)} errorMessage={authError} notice={loginNotice} />;
  }

  // PERSONAL TRAINER / ADMIN: Entra DIRETO no Painel do Administrador (não possui treinos de aluno)
  if (user?.role === 'admin') {
    return (
      <AccountManagement 
        isDark={theme === 'dark'}
        onClose={() => { void handleLogout(); }}
      />
    );
  }

  const renderContent = () => {
    if (activeWorkout) {
      return (
        <WorkoutSession 
          workout={activeWorkout} 
          onClose={() => setActiveWorkout(null)} 
        />
      );
    }

    if (isEditingProfile) {
      return (
        <PersonalDataForm 
          user={user} 
          isDark={theme === 'dark'}
          onClose={() => setIsEditingProfile(false)}
          onSave={async (updatedUser) => {
            await storage.updateProfile(updatedUser);
            if (storage.getUser()?.uid !== updatedUser.uid) throw new Error('Sua sessão mudou. Entre novamente para conferir os dados salvos.');
            setUser(updatedUser);
            setIsEditingProfile(false);
            setNotification({ title: "Perfil Atualizado", body: "Seus dados pessoais foram salvos com sucesso." });
          }}
        />
      );
    }

    if (isUpdatingPassword) {
      return (
        <UpdatePasswordForm 
          onClose={() => setIsUpdatingPassword(false)}
          onSuccess={() => {
            setIsUpdatingPassword(false);
            setNotification({
              title: "Senha Atualizada",
              body: "Sua senha foi alterada com sucesso."
            });
          }}
        />
      );
    }

    if (isManagingAccounts) {
      return (
        <AccountManagement 
          isDark={theme === 'dark'}
          onClose={() => setIsManagingAccounts(false)}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            user={user} 
            resetKey={dashboardReset}
            onStartWorkout={(w) => setActiveWorkout(w)} 
            workouts={workouts} 
            onUpdateUser={async (updatedUser) => {
              await storage.updateProfile(updatedUser);
              if (storage.getUser()?.uid !== updatedUser.uid) throw new Error('Sua sessão mudou. Entre novamente para conferir os dados salvos.');
              setUser(updatedUser);
            }}
          />
        );
      case 'workouts':
        return <WorkoutList workouts={workouts} onSelectWorkout={setActiveWorkout} trainerPhone={user?.trainerPhone} />;
      case 'evolution':
        return <EvolutionGallery />;
      case 'profile':
        return <StudentProfile user={user} theme={theme} onThemeChange={setTheme}
          onEditProfile={() => setIsEditingProfile(true)}
          onUpdatePassword={() => setIsUpdatingPassword(true)}
          onLogout={() => { void handleLogout(); }} />;
      default:
        return null;
    }
  };

  // Keep the theme above every student view, including fixed workout dialogs.
  return (
    <div className={`student-app${theme === 'dark' ? ' dark' : ''}`} data-theme={theme}>
      <StudentChrome theme={theme} activeTab={activeTab} onNavigate={navigate}
        onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
        notifications={user && <StudentNotificationCenter key={user.uid} userId={user.uid} />}
        hideNavigation={Boolean(activeWorkout)}>
        {!isOnline && <div className="student-offline" role="status"><WifiOff size={17} /><span>Você está offline. Alterações pendentes serão sincronizadas quando a conexão voltar.</span></div>}
        <AnimatePresence>
          {notification && <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="student-toast" role="status">
            <Bell size={22} /><div><h4>{notification.title}</h4><p>{notification.body}</p></div>
            <button onClick={() => setNotification(null)} aria-label="Fechar aviso"><X size={18} /></button>
          </motion.div>}
          {isNotificationsOpen && <NotificationsModal onClose={() => setIsNotificationsOpen(false)} isDark={theme === 'dark'} userRole={user?.role} />}
        </AnimatePresence>
        {renderContent()}
      </StudentChrome>
    </div>
  );
}
