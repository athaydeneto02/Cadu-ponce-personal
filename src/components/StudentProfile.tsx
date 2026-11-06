import React from 'react';
import { ArrowUpRight, Camera, ChevronRight, Instagram, LockKeyhole, LogOut, Moon, Sun, UserRound } from 'lucide-react';
import AccountAvatar from './AccountAvatar';
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

export default function StudentProfile({ user, theme, onThemeChange, onEditProfile, onUpdatePassword, onLogout }: StudentProfileProps) {
  return <section className="student-profile">
    <div className="student-page-heading"><span>DO SEU JEITO</span><h1>Meu perfil</h1><p>Seus dados, sua conta e a aparência do app.</p></div>
    <div className="student-profile__grid">
      <div className="student-profile__identity">
        <button className="student-profile__avatar" onClick={onEditProfile} aria-label="Editar foto"><AccountAvatar reference={user?.photoURL} name={user?.name || 'Aluno'} /><span><Camera size={15} /></span></button>
        <h2>{user?.name || 'Aluno'}</h2><p>{user?.email}</p><span className="student-profile__badge">Aluno · Cadu Ponce</span>
      </div>
      <div className="student-profile__settings">
        <section className="student-theme-picker" aria-labelledby="student-appearance-title">
          <h2 id="student-appearance-title">Aparência</h2><p>Escolha o visual que combina com seu momento.</p>
          <div role="group" aria-label="Tema do aplicativo">
            <button onClick={() => onThemeChange('light')} aria-pressed={theme === 'light'}><Sun size={20} /><span>Claro</span><i aria-hidden="true" /></button>
            <button onClick={() => onThemeChange('dark')} aria-pressed={theme === 'dark'}><Moon size={20} /><span>Noturno</span><i aria-hidden="true" /></button>
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
