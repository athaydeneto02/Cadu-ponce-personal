import { Bell, CalendarDays, ChartNoAxesCombined, ChevronRight, Dumbbell, Home, Library, LogOut, Settings, Users } from 'lucide-react';
import BrandLogo from './BrandLogo';

export type AdminSection = 'dashboard' | 'student_list' | 'workout_library' | 'exercise_library' | 'agenda' | 'frequency_report' | 'retention' | 'settings';

interface AdminChromeProps {
  section: AdminSection;
  unreadCount: number;
  onNavigate: (section: AdminSection) => void;
  onNotifications: () => void;
  onLogout: () => void;
}

const navigation = [
  { id: 'dashboard', label: 'Visão geral', mobile: 'Início', icon: Home },
  { id: 'student_list', label: 'Alunos', mobile: 'Alunos', icon: Users },
  { id: 'workout_library', label: 'Treinos', mobile: 'Treinos', icon: Dumbbell },
  { id: 'exercise_library', label: 'Exercícios', icon: Library },
  { id: 'agenda', label: 'Agenda', mobile: 'Agenda', icon: CalendarDays },
  { id: 'frequency_report', label: 'Frequência', icon: ChartNoAxesCombined },
  { id: 'settings', label: 'Configurações', mobile: 'Ajustes', icon: Settings },
] as const;

export default function AdminChrome({ section, unreadCount, onNavigate, onNotifications, onLogout }: AdminChromeProps) {
  return (
    <>
      <header className="admin-header">
        <div className="admin-header__brand">
          <BrandLogo size="sm" />
          <span className="admin-header__caption">Área do treinador</span>
        </div>
        <div className="admin-header__actions">
          <span className="admin-header__role">Administrador</span>
          <button type="button" className="admin-icon-button" onClick={onNotifications} aria-label="Abrir notificações de treinos concluídos" title="Notificações">
            <Bell size={19} aria-hidden="true" />
            {unreadCount > 0 && <span className="admin-notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          <span className="admin-header__divider" aria-hidden="true" />
          <button type="button" className="admin-logout" onClick={onLogout} aria-label="Sair da conta" title="Encerrar sessão">
            <LogOut size={17} aria-hidden="true" /><span>Sair</span>
          </button>
        </div>
      </header>
      <aside className="admin-sidebar">
        <div className="admin-sidebar__label">Seu espaço de gestão</div>
        <nav aria-label="Navegação do administrador" className="admin-sidebar__nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} onClick={() => onNavigate(id)} aria-current={section === id ? 'page' : undefined} className={`admin-nav-item${section === id ? ' is-active' : ''}`}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span>{section === id && <ChevronRight size={14} aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__signature"><span />Planeje. Acompanhe. Evolua.<small>Cadu Ponce · Consultoria Esportiva</small></div>
      </aside>
      <nav className="admin-mobile-nav" aria-label="Navegação do administrador no celular">
        {navigation.filter(item => 'mobile' in item).map(({ id, icon: Icon, ...item }) => (
          <button type="button" key={id} onClick={() => onNavigate(id)} aria-current={section === id ? 'page' : undefined} className={section === id ? 'is-active' : ''}>
            <Icon size={20} aria-hidden="true" /><span>{'mobile' in item ? item.mobile : ''}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
