import React from 'react';
import { Dumbbell, Home, MessageCircle, Moon, Sun, UserRound } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { getTrainerWhatsAppUrl } from '../lib/trainerConfig';

export type StudentTheme = 'light' | 'dark';
type StudentTab = 'dashboard' | 'workouts' | 'evolution' | 'profile';

interface StudentChromeProps {
  theme: StudentTheme;
  activeTab: StudentTab;
  onNavigate: (tab: StudentTab) => void;
  onToggleTheme: () => void;
  notifications: React.ReactNode;
  children: React.ReactNode;
  hideNavigation?: boolean;
}

export default function StudentChrome({ theme, activeTab, onNavigate, onToggleTheme, notifications, children, hideNavigation = false }: StudentChromeProps) {
  return <>
    {!hideNavigation && <header className="student-header">
      <div className="student-header__inner">
        <button className="student-header__brand" onClick={() => onNavigate('dashboard')} aria-label="Cadu Ponce — início">
          <BrandLogo size="sm" tone={theme === 'dark' ? 'dark' : 'light'} />
        </button>
        <div className="student-header__actions">
          <span className="student-header__label">ÁREA DO ALUNO</span>
          <button className="student-icon-button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo noturno'} title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo noturno'}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <div className="student-header__notifications">{notifications}</div>
        </div>
      </div>
    </header>}
    <main className={`student-main${hideNavigation ? ' student-main--session' : ''}`} id="student-main">{children}</main>
    {!hideNavigation && <nav className="student-navigation" aria-label="Navegação do aluno">
      <button className={activeTab === 'dashboard' ? 'is-active' : ''} aria-current={activeTab === 'dashboard' ? 'page' : undefined} onClick={() => onNavigate('dashboard')}><Home size={21} /><span>Início</span></button>
      <button className={activeTab === 'workouts' ? 'is-active' : ''} aria-current={activeTab === 'workouts' ? 'page' : undefined} onClick={() => onNavigate('workouts')}><Dumbbell size={21} /><span>Treinos</span></button>
      <a href={getTrainerWhatsAppUrl()} target="_blank" rel="noopener noreferrer" aria-label="Contato com o personal pelo WhatsApp (abre em outra aba)"><MessageCircle size={21} /><span>Contato</span></a>
      <button className={activeTab === 'profile' ? 'is-active' : ''} aria-current={activeTab === 'profile' ? 'page' : undefined} onClick={() => onNavigate('profile')}><UserRound size={21} /><span>Perfil</span></button>
    </nav>}
  </>;
}
