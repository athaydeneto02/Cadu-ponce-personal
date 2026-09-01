/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Dumbbell, 
  Camera, 
  User, 
  Home,
  Bell,
  ChevronRight,
  Plus,
  X,
  WifiOff,
  Share2,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BrandLogo from './components/BrandLogo';
import { storage } from './lib/storage';
import { supabase } from './lib/supabase';
import { UserProfile, Workout } from './types';
import Dashboard from './components/Dashboard';
import WorkoutList from './components/WorkoutList';
import WorkoutSession from './components/WorkoutSession';
import EvolutionGallery from './components/EvolutionGallery';
import PersonalDataForm from './components/PersonalDataForm';
import AccountManagement from './components/AccountManagement';
import NotificationsModal from './components/NotificationsModal';

import SplashScreen from './components/SplashScreen';
import Login from './components/Login';
import AcquireConsulting from './components/AcquireConsulting';

type Tab = 'dashboard' | 'workouts' | 'evolution' | 'profile';

export default function App() {
  // Initialize instantly from localStorage cache — no loading flash
  const cachedUser = storage.getUser();
  const [isLoading, setIsLoading] = useState(!cachedUser); // skip splash if we have cache
  const [isAuthenticated, setIsAuthenticated] = useState(!!cachedUser);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('cadu_ponce_theme') as 'light' | 'dark') || 'light';
  });
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<UserProfile | null>(cachedUser);
  const [workouts, setWorkouts] = useState<Workout[]>(() => storage.getWorkouts());
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isManagingAccounts, setIsManagingAccounts] = useState(false);
  const [notification, setNotification] = useState<{title: string, body: string} | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showAcquire, setShowAcquire] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleMockLogin = () => {
      const mockUser = JSON.parse(localStorage.getItem('cadu_ponce_user') || 'null');
      if (mockUser) {
        setUser(mockUser);
        setIsAuthenticated(true);
        // Load workouts for mock user
        storage.fetchWorkouts(mockUser.uid).then(w => setWorkouts(w));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('mock_login_success', handleMockLogin);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('mock_login_success', handleMockLogin);
    };
  }, []);

  useEffect(() => {
    // Listen to Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Fetch profile AND workouts in parallel — much faster than sequential
          const [profile, fetchedWorkouts] = await Promise.all([
            storage.fetchCurrentProfile(),
            storage.fetchWorkouts(session.user.id),
          ]);

          if (profile) {
            setUser(profile);
            storage.saveUser(profile); // keep cache fresh
            setIsAuthenticated(true);
            setWorkouts(fetchedWorkouts);


          }
        } else {
          // Signed out — clear everything
          setUser(null);
          setIsAuthenticated(false);
          setWorkouts([]);
          setIsManagingAccounts(false);
        }
        setIsLoading(false);
      }
    );

    // Simulate push notification after 8s
    const timer = setTimeout(() => {
      setNotification({
        title: "Hora do Treino! 🔥",
        body: "Bora pra cima! Seu treino A te espera hoje."
      });
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('cadu_ponce_theme', theme);
  }, [theme]);

  const handleLogin = async (email: string, password?: string) => {
    if (!email || !password) return;

    // --- TEMPORARY BYPASS FOR TESTING STUDENT ACCOUNT ---
    if (email === 'aluno.teste@caduponce.com' && password === 'Teste@123') {
      const mockUser = {
        uid: '88888888-8888-8888-8888-888888888888',
        name: 'Aluno Teste',
        email: 'aluno.teste@caduponce.com',
        role: 'student' as const,
        createdAt: new Date().toISOString()
      };
      // Força localStorage e dispara evento pra App.tsx atualizar sem Supabase
      localStorage.setItem('cadu_ponce_user', JSON.stringify(mockUser));
      
      // Emit custom event para o App pegar caso não consiga via auth state
      window.dispatchEvent(new Event('mock_login_success'));
      return;
    }
    // --------------------------------------------------

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const errorMessage = error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos. Verifique seus dados e tente novamente.'
        : error.message;
      throw new Error(errorMessage);
    }

    if (data.user) {
      // onAuthStateChange will handle setting user state
    }
  };

  if (isLoading) {
    // Minimal spinner — only shown on first-ever visit (no cache)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-3 border-red-600 border-t-transparent rounded-full animate-spin" style={{borderWidth: 3}} />
          <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Conectando...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (showAcquire) {
      return (
        <AcquireConsulting 
          onCancel={() => setShowAcquire(false)}
          onSuccess={(registeredUser) => {
            // Account was already created in Supabase by AcquireConsulting component.
            // Just save to cache and set auth state.
            setUser(registeredUser);
            storage.saveUser(registeredUser);
            setIsAuthenticated(true);
            setShowAcquire(false);
            setNotification({
              title: "Parabéns! 🏆",
              body: "Sua consultoria foi contratada com sucesso! Bem-vindo(a) ao time!"
            });
          }}
        />
      );
    }
    return <Login onLogin={handleLogin} onAcquireClick={() => setShowAcquire(true)} />;
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
            try {
              await storage.updateProfile(updatedUser);
              
              // If admin updates their profile, sync their contact info to all students
              if (updatedUser.role === 'admin') {
                const students = await storage.fetchUsersList();
                for (const student of students) {
                  await supabase
                    .from('profiles')
                    .update({
                      trainer_phone: updatedUser.trainerPhone,
                      metadata: {
                        ...student.metadata,
                        instagram: updatedUser.metadata?.instagram
                      }
                    })
                    .eq('id', student.uid);
                }
              }

              setUser(updatedUser);
              setIsEditingProfile(false);
              setNotification({
                title: "Perfil Atualizado",
                body: "Seus dados pessoais foram salvos com sucesso."
              });
            } catch (err) {
              setNotification({
                title: "Erro ao salvar ❌",
                body: "Não foi possível atualizar seu perfil. Tente novamente."
              });
            }
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
            onStartWorkout={(w) => setActiveWorkout(w)} 
            workouts={workouts} 
            onUpdateUser={async (updatedUser) => {
              await storage.updateProfile(updatedUser);
              setUser(updatedUser);
            }}
          />
        );
      case 'workouts':
        return <WorkoutList workouts={workouts} onSelectWorkout={setActiveWorkout} trainerPhone={user?.trainerPhone} />;
      case 'evolution':
        return <EvolutionGallery />;
      case 'profile':
        if (user?.role !== 'admin') {
          return (
            <div className="flex flex-col min-h-full bg-[#1c2b3e]">
              <div className="px-4 pt-4 pb-2">
                <button onClick={() => setActiveTab('dashboard')} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
                  <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
                </button>
              </div>
              <h2 className="text-white text-xl font-semibold px-4 pb-12">Editar Perfil</h2>

              <div className="bg-white flex-1 rounded-t-xl px-4 pt-16 pb-8 relative">
                {/* Profile Picture overlapping */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="w-24 h-24 rounded-full bg-slate-500 border-4 border-[#1c2b3e] flex items-center justify-center relative overflow-hidden">
                    <User className="w-12 h-12 text-slate-300" />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center cursor-pointer">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <span className="text-slate-600 text-sm mt-2 font-medium">Editar foto</span>
                </div>

                <div className="space-y-4">
                  {/* Seus Dados */}
                  <button onClick={() => setIsEditingProfile(true)} className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm active:scale-[0.98] transition">
                    <div className="text-left">
                      <h3 className="text-slate-800 font-bold text-base">Seus dados</h3>
                      <p className="text-slate-500 text-sm mt-0.5">Nome, Email, Instagram, Telefone</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-800" />
                  </button>

                  {/* Atualizar Senha */}
                  <button className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm active:scale-[0.98] transition">
                    <div className="text-left">
                      <h3 className="text-slate-800 font-bold text-base">Atualizar senha</h3>
                      <p className="text-slate-800 text-lg tracking-widest mt-0.5 leading-none">................</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-800" />
                  </button>

                  {/* Idioma */}
                  <button className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm active:scale-[0.98] transition">
                    <div className="text-left">
                      <h3 className="text-slate-800 font-bold text-base">Idioma</h3>
                      <p className="text-slate-500 text-sm mt-0.5">Português</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-800" />
                  </button>

                  {/* Logout Button (Extra, necessary for the app) */}
                  <button 
                    onClick={async () => {
                      await supabase.auth.signOut();
                      localStorage.clear();
                      setIsAuthenticated(false);
                      setIsManagingAccounts(false);
                      setUser(null);
                    }}
                    className="w-full bg-white border border-red-200 rounded-xl p-4 flex items-center justify-between shadow-sm active:scale-[0.98] transition mt-6"
                  >
                    <div className="text-left">
                      <h3 className="text-red-600 font-bold text-base">Sair da Conta</h3>
                      <p className="text-red-400 text-xs mt-0.5">Fazer logout do aplicativo</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Meu Perfil</h1>
            <div className={`rounded-2xl p-6 shadow-sm border flex items-center space-x-4 transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}>
              <div className="w-16 h-16 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center overflow-hidden border-2 border-red-100 dark:border-red-900/30">
                <img 
                  src="/src/assets/images/cadu_ponce_logo_new.png" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{user?.name}</h2>
                <p className="text-gray-500 text-sm">{user?.email}</p>
                <span className="inline-block mt-2 px-2 py-1 bg-red-50 dark:bg-red-600/10 text-red-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                  {user?.role === 'admin' ? 'Treinador Admin' : 'Aluno Premium'}
                </span>
              </div>
            </div>
            
            <div className="mt-8 space-y-4">

              {/* Theme Selector */}
              <div className={`flex items-center justify-between p-5 rounded-2xl border shadow-sm transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-slate-800 text-amber-400' : 'bg-gray-50 text-blue-500'}`}>
                    {theme === 'dark' ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.5 }}><Plus className="w-5 h-5 rotate-45" /></motion.div> : <Home className="w-5 h-5" />}
                  </div>
                  <span className="font-bold">Tema Escuro</span>
                </div>
                <button 
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className={`w-14 h-8 rounded-full relative transition-colors duration-300 ${theme === 'dark' ? 'bg-red-600' : 'bg-gray-200'}`}
                >
                  <motion.div 
                    animate={{ x: theme === 'dark' ? 26 : 4 }}
                    className="absolute top-1 left-0 w-6 h-6 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>

              {/* Gerenciador de Contas (Visible ONLY to Admins) */}
              {user?.role === 'admin' && (
                <button 
                  onClick={() => setIsManagingAccounts(true)}
                  className={`w-full flex items-center justify-between p-5 rounded-2xl border shadow-sm transition-all active:scale-[0.98] text-left ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-100 text-slate-700'}`}
                  id="btn-nav-to-accounts"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`p-2.5 rounded-xl transition-colors ${theme === 'dark' ? 'bg-slate-800 text-red-500' : 'bg-gray-50 text-red-600'}`}>
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold block text-sm">Gerenciamento de Contas</span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Controle Total de Alunos e Admins</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-red-500" />
                </button>
              )}

              <ProfileItem 
                icon={<User className="w-5 h-5" />} 
                label="Dados Pessoais" 
                isDark={theme === 'dark'} 
                onClick={() => setIsEditingProfile(true)}
              />
              <ProfileItem 
                icon={<Bell className="w-5 h-5" />} 
                label="Notificações" 
                isDark={theme === 'dark'} 
                onClick={() => setIsNotificationsOpen(true)}
              />
              
              {/* Export Summary Button */}
              <button 
                onClick={() => {
                  setNotification({
                    title: "Relatório Disponível",
                    body: "Seu resumo de progresso em PDF foi gerado com sucesso!"
                  });
                }}
                className={`w-full flex items-center justify-between p-5 rounded-2xl border shadow-sm transition-all active:scale-[0.98] ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-100 text-slate-700'}`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-slate-800 text-red-500' : 'bg-gray-50 text-red-600'}`}>
                    <Share2 className="w-5 h-5" />
                  </div>
                  <span className="font-bold">Exportar Resumo</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </button>

              <button 
                onClick={async () => {
                  await supabase.auth.signOut();
                  localStorage.clear();
                  setIsAuthenticated(false);
                  setIsManagingAccounts(false);
                  setUser(null);
                }}
                className={`w-full flex items-center justify-between p-5 rounded-2xl border shadow-sm text-red-600 font-bold active:scale-95 transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}
              >
                <span>Sair da Conta</span>
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const isStudent = user?.role !== 'admin';

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${isStudent ? 'bg-[#e8ecf0] flex items-center justify-center' : (theme === 'dark' ? 'bg-slate-950 text-white dark pb-20' : 'bg-[#F4F6FA] text-slate-900 pb-20')}`}>
      
      {/* STUDENT: Mobile frame container */}
      {isStudent && !activeWorkout ? (
        <div className="relative w-full max-w-[430px] min-h-screen bg-[#F4F6FA] flex flex-col shadow-2xl overflow-hidden">
          {/* MFIT Header */}
          <header className="bg-[#1c2b3e] h-14 flex items-center justify-center px-4 shrink-0 z-40 relative">
            <div className="flex items-center gap-2">
              <img src="/src/assets/images/cadu_ponce_logo_new.png" alt="logo" className="w-7 h-7 object-contain" />
              <span className="text-white font-black text-lg tracking-wide">MFIT<span className="font-light">PERSONAL</span></span>
            </div>
            <button
              onClick={() => setIsNotificationsOpen(true)}
              className="absolute right-4 top-1/2 -translate-y-1/2 relative p-1 text-white/80 hover:text-white transition"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">2</span>
            </button>
          </header>

          {/* Content area */}
          <main className="flex-1 overflow-y-auto pb-16">
            <AnimatePresence>
              {notification && (
                <motion.div
                  initial={{ opacity: 0, y: -50 }}
                  animate={{ opacity: 1, y: 16 }}
                  exit={{ opacity: 0, y: -50 }}
                  className="fixed top-14 left-4 right-4 bg-slate-950 text-white p-4 rounded-2xl shadow-2xl z-[100] flex items-start space-x-4 border border-slate-800"
                >
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm tracking-tight">{notification.title}</h4>
                    <p className="text-slate-400 text-xs mt-0.5 leading-tight">{notification.body}</p>
                  </div>
                  <button onClick={() => setNotification(null)} className="p-1 hover:bg-slate-800 rounded-lg shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isNotificationsOpen && (
                <NotificationsModal
                  onClose={() => setIsNotificationsOpen(false)}
                  isDark={false}
                  userRole={user?.role}
                />
              )}
            </AnimatePresence>

            {renderContent()}
          </main>

          {/* MFIT Student Bottom Nav */}
          <nav className="absolute bottom-0 left-0 right-0 h-16 bg-[#1c2b3e] border-t border-white/10 flex items-stretch z-40">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition ${activeTab === 'dashboard' ? 'text-white' : 'text-white/60 hover:text-white'}`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[10px] font-medium">Início</span>
            </button>
            <button
              onClick={() => {
                let ig = user?.metadata?.instagram || 'https://instagram.com/caduponce';
                if (!ig.startsWith('http')) ig = 'https://' + ig;
                window.open(ig, '_blank');
              }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-white/60 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
              </svg>
              <span className="text-[10px] font-medium">Instagram</span>
            </button>
            <button
              onClick={() => {
                let wa = user?.trainerPhone || '5511999999999';
                wa = wa.replace(/\D/g, ''); // keep only numbers
                window.open(`https://wa.me/${wa}`, '_blank');
              }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-white/60 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-[10px] font-medium">WhatsApp</span>
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition ${activeTab === 'profile' ? 'text-white' : 'text-white/60 hover:text-white'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round"/>
                <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round"/>
                <line x1="3" y1="18" x2="21" y2="18" strokeLinecap="round"/>
              </svg>
              <span className="text-[10px] font-medium">Menu</span>
            </button>
          </nav>
        </div>
      ) : isStudent && activeWorkout ? (
        <div className="relative w-full max-w-[430px] min-h-screen bg-[#F4F6FA] flex flex-col shadow-2xl overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            {renderContent()}
          </main>
        </div>
      ) : (
        <div className={`w-full min-h-screen font-sans pb-20 transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 text-white dark' : 'bg-[#F4F6FA] text-slate-900'}`}>
          {/* Admin Header — MFIT Style navy */}
          {!activeWorkout && (
            <header className="fixed top-0 left-0 right-0 h-14 bg-[#1B2A4A] flex items-center justify-between px-4 z-40 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-500 flex items-center justify-center overflow-hidden border-2 border-white/20">
                  <img src="/src/assets/images/cadu_ponce_logo_new.png" alt="avatar" className="w-full h-full object-cover" />
                </div>
                <span className="text-white font-bold text-sm">
                  {user ? `Olá, ${user.name.split(' ')[0]}` : 'Bem-vindo'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setIsNotificationsOpen(true)} className="relative p-1.5 text-white/70 hover:text-white transition-colors">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[#1B2A4A]"></span>
                </button>
                <button onClick={() => setActiveTab('profile')} className="p-1.5 text-white/70 hover:text-white transition-colors">
                  <User className="w-5 h-5" />
                </button>
              </div>
            </header>
          )}

          {/* Main Content */}
          <main className={!activeWorkout ? "pt-14" : ""}>
            <AnimatePresence>
              {!isOnline && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-amber-500 text-amber-950 px-6 py-2 flex items-center justify-center space-x-2 text-[10px] font-black uppercase tracking-widest"
                >
                  <WifiOff className="w-3 h-3" />
                  <span>Modo Offline: Dados sendo salvos localmente</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {notification && (
                <motion.div
                  initial={{ opacity: 0, y: -50 }}
                  animate={{ opacity: 1, y: 16 }}
                  exit={{ opacity: 0, y: -50 }}
                  className="fixed top-0 left-4 right-4 bg-slate-950 text-white p-4 rounded-2xl shadow-2xl z-[100] flex items-start space-x-4 border border-slate-800"
                >
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm tracking-tight">{notification.title}</h4>
                    <p className="text-slate-400 text-xs mt-0.5 leading-tight">{notification.body}</p>
                  </div>
                  <button onClick={() => setNotification(null)} className="p-1 hover:bg-slate-800 rounded-lg shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isNotificationsOpen && (
                <NotificationsModal
                  onClose={() => setIsNotificationsOpen(false)}
                  isDark={theme === 'dark'}
                  userRole={user?.role}
                />
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeWorkout ? 'session' : activeTab}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ type: "spring", stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Admin Bottom Navigation */}
          {!activeWorkout && (
            <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#1B2A4A] flex items-stretch z-40 shadow-[0_-2px_12px_rgba(0,0,0,0.3)]">
              <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Home className="w-5 h-5" />} label="Início" />
              <button
                onClick={() => {
                  let ig = user?.metadata?.instagram || 'https://instagram.com/caduponce';
                  if (!ig.startsWith('http')) ig = 'https://' + ig;
                  window.open(ig, '_blank');
                }}
                className="flex-1 relative flex flex-col items-center justify-center gap-1 outline-none transition-colors"
              >
                <div className="text-white/40 hover:text-white transition-colors duration-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
                  </svg>
                </div>
                <span className="text-[10px] font-bold text-white/40 hover:text-white transition-colors duration-200">Instagram</span>
              </button>
              <button
                onClick={() => {
                  let wa = user?.trainerPhone || '5511999999999';
                  wa = wa.replace(/\D/g, ''); // keep only numbers
                  window.open(`https://wa.me/${wa}`, '_blank');
                }}
                className="flex-1 relative flex flex-col items-center justify-center gap-1 outline-none transition-colors"
              >
                <div className="text-white/40 hover:text-white transition-colors duration-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-[10px] font-bold text-white/40 hover:text-white transition-colors duration-200">WhatsApp</span>
              </button>
              <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<User className="w-5 h-5" />} label="Perfil" />
            </nav>
          )}
        </div>
      )}
    </div>
  );
}


function NavButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex-1 relative flex flex-col items-center justify-center gap-1 outline-none transition-colors"
    >
      <div className={`transition-colors duration-200 ${active ? 'text-white' : 'text-white/40'}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-bold transition-colors duration-200 ${active ? 'text-white' : 'text-white/40'}`}>
        {label}
      </span>
      {active && (
        <motion.div
          layoutId="nav-underline"
          className="absolute bottom-0 w-8 h-0.5 bg-red-500 rounded-full"
        />
      )}
    </button>
  );
}

function ProfileItem({ icon, label, isDark, onClick }: { icon: React.ReactNode, label: string, isDark?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between p-5 border rounded-2xl shadow-sm transition-all active:scale-[0.98] ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-100 text-slate-700'}`}
    >
      <div className="flex items-center space-x-4">
        <div className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-50 text-slate-500'}`}>
          {icon}
        </div>
        <span className="font-bold">{label}</span>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300" />
    </button>
  );
}

