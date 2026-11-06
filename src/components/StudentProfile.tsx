import React from 'react';
import { ArrowUpRight, Camera, ChevronRight, Flame, Instagram, LockKeyhole, LogOut, Moon, Sun, Target, TrendingUp, UserRound } from 'lucide-react';
import AccountAvatar from './AccountAvatar';
import brandMonogram from '../assets/images/cadu-ponce-monogram.webp';
import { TRAINER_CONFIG } from '../lib/trainerConfig';
import type { UserProfile } from '../types';
import type { StudentTheme } from './StudentChrome';

interface StudentProfileProps {
  user: UserProfile | null;
  theme: StudentTheme;
  onThemeChange: (theme: StudentTheme) => void;
  onEditProfile: () => void;
  onUpdatePassword: () => void;
  onLogout: () => void;
}

function ThemePreview({ theme }: { theme: StudentTheme }) {
  return <span className={`student-theme-preview student-theme-preview--${theme}`} aria-hidden="true">
    <span className="student-theme-preview__chrome"><span /><span /><span /></span>
    <span className="student-theme-preview__hero"><span /><span /><span /></span>
    <span className="student-theme-preview__cards"><span /><span /><span /></span>
    <span className="student-theme-preview__nav"><span /><span /><span /></span>
  </span>;
}

export default function StudentProfile({ user, theme, onThemeChange, onEditProfile, onUpdatePassword, onLogout }: StudentProfileProps) {
  return <section className="student-profile">
    <div className="student-page-heading"><span>DO SEU JEITO</span><h1>Meu perfil</h1><p>Seus dados, sua conta e a aparência do app.</p></div>
    <div className="student-profile__grid">
      <div className="student-profile__identity">
        <div className="student-profile__cover" aria-hidden="true">
          <div className="student-profile__cover-brand"><img src={brandMonogram} alt="" /><span>CADU PONCE<small>CONSULTORIA ESPORTIVA</small></span></div>
          <span className="student-profile__cover-word">EVOLUA.</span>
          <span className="student-profile__cover-track" />
        </div>
        <button className="student-profile__avatar" onClick={onEditProfile} aria-label="Editar foto"><AccountAvatar reference={user?.photoURL} name={user?.name || 'Aluno'} /><span><Camera size={15} /></span></button>
        <h2>{user?.name || 'Aluno'}</h2><p>{user?.email}</p><span className="student-profile__badge">Aluno · Cadu Ponce</span>
        <p className="student-profile__motto">Cada treino, uma nova conquista.</p>
        <div className="student-profile__values" aria-hidden="true"><span><Target size={17} />Foco</span><span><Flame size={17} />Constância</span><span><TrendingUp size={17} />Evolução</span></div>
      </div>
      <div className="student-profile__settings">
        <section className="student-theme-picker" aria-labelledby="student-appearance-title">
          <h2 id="student-appearance-title">Aparência</h2><p>Escolha o visual que combina com seu momento.</p>
          <div role="group" aria-label="Tema do aplicativo">
            <button onClick={() => onThemeChange('light')} aria-pressed={theme === 'light'}><ThemePreview theme="light" /><span className="student-theme-picker__label"><Sun size={20} /><span>Claro</span><i aria-hidden="true" /></span></button>
            <button onClick={() => onThemeChange('dark')} aria-pressed={theme === 'dark'}><ThemePreview theme="dark" /><span className="student-theme-picker__label"><Moon size={20} /><span>Noturno</span><i aria-hidden="true" /></span></button>
          </div>
          <small>Sua preferência fica salva neste dispositivo.</small>
        </section>
        <div className="student-profile__links">
          <button onClick={onEditProfile}><span className="student-profile__link-icon"><UserRound size={20} /></span><span><strong>Seus dados</strong><small>Foto, nome e informações de contato</small></span><ChevronRight size={18} /></button>
          <button onClick={onUpdatePassword}><span className="student-profile__link-icon"><LockKeyhole size={20} /></span><span><strong>Atualizar senha</strong><small>Cuide da segurança da sua conta</small></span><ChevronRight size={18} /></button>
          <a href={TRAINER_CONFIG.instagramUrl} target="_blank" rel="noopener noreferrer"><span className="student-profile__link-icon"><Instagram size={20} /></span><span><strong>Instagram do personal</strong><small>@{TRAINER_CONFIG.instagramHandle}</small></span><ArrowUpRight size={18} /></a>
        </div>
        <button className="student-profile__logout" onClick={onLogout}><LogOut size={18} />Sair da Conta</button>
      </div>
    </div>
  </section>;
}
