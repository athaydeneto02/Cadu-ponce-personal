import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight, ArrowRight, Users, UserPlus, CheckCheck, Activity,
  Dumbbell, PlayCircle, CalendarDays, ChartNoAxesCombined, MessageSquare,
  Bell, RefreshCw, Link as LinkIcon, Check,
} from 'lucide-react';
import './admin-dashboard.css';

export interface AdminDashboardHomeProps {
  activeStudents: number;
  inactiveStudents: number;
  unreadNotifications: number | null;
  completedWorkoutsThisMonth: number | null;
  studentsToday: number | null;
  engagementRate: number | null;
  contactCopied?: boolean;
  onAddStudent: () => void;
  onStudents: () => void;
  onRetention: () => void;
  onRoutines: () => void;
  onExercises: () => void;
  onAgenda: () => void;
  onFrequencyReport: () => void;
  onNotifications: () => void;
  onFeedbacks: () => void;
  onUpdates: () => void;
  onPersonalContact: () => void;
}

function Metric({ icon: Icon, label, value, detail, onClick }: {
  icon: LucideIcon; label: string; value: number | null; detail: string; onClick: () => void;
}) {
  return (
    <button type="button" className="admin-dashboard__metric" onClick={onClick}>
      <span className="admin-dashboard__metric-heading"><Icon aria-hidden="true" /><span>{label}</span></span>
      <strong>{value === null ? '—' : value.toLocaleString('pt-BR')}</strong>
      <span className="admin-dashboard__metric-detail">{detail}</span>
    </button>
  );
}

export default function AdminDashboardHome(props: AdminDashboardHomeProps) {
  const engagement = props.engagementRate === null ? null : Math.min(100, Math.max(0, props.engagementRate));
  const tools = [
    { icon: Dumbbell, title: 'Treinos', detail: 'Monte e organize suas rotinas', onClick: props.onRoutines },
    { icon: PlayCircle, title: 'Exercícios', detail: 'Sua biblioteca de movimentos', onClick: props.onExercises },
    { icon: CalendarDays, title: 'Agenda', detail: 'Planeje os próximos encontros', onClick: props.onAgenda },
    { icon: ChartNoAxesCombined, title: 'Frequência', detail: 'Acompanhe a constância dos alunos', onClick: props.onFrequencyReport },
  ];

  return (
    <section className="admin-dashboard" aria-labelledby="admin-overview-title">
      <header className="admin-dashboard__intro">
        <div>
          <p className="admin-dashboard__eyebrow"><span />Seu espaço de gestão</p>
          <h1 id="admin-overview-title">Visão geral<span>.</span></h1>
          <p className="admin-dashboard__subtitle">Mais clareza para acompanhar cada evolução.</p>
        </div>
        <button type="button" className="admin-dashboard__primary" onClick={props.onAddStudent}>
          <UserPlus aria-hidden="true" /><span>Adicionar aluno</span><ArrowUpRight aria-hidden="true" />
        </button>
      </header>

      <div className="admin-dashboard__metrics" aria-label="Resumo do acompanhamento">
        <Metric icon={Users} label="Alunos ativos" value={props.activeStudents} detail={`${props.inactiveStudents} ${props.inactiveStudents === 1 ? 'inativo' : 'inativos'}`} onClick={props.onStudents} />
        <Metric icon={CheckCheck} label="Treinaram hoje" value={props.studentsToday} detail="Alunos com treino concluído" onClick={props.onFrequencyReport} />
        <Metric icon={Activity} label="Treinos no mês" value={props.completedWorkoutsThisMonth} detail="Conclusões registradas" onClick={props.onFrequencyReport} />
      </div>

      <div className="admin-dashboard__overview">
        <button type="button" className="admin-dashboard__students" onClick={props.onStudents}>
          <div className="admin-dashboard__students-top"><span className="admin-dashboard__icon"><Users aria-hidden="true" /></span><ArrowUpRight aria-hidden="true" /></div>
          <div><span className="admin-dashboard__card-kicker">Acompanhamento próximo</span><h2>Seus alunos</h2><p>Perfis, evolução e planos de treino.<br />Tudo pronto para o próximo passo.</p></div>
          <span className="admin-dashboard__card-link">Gerenciar alunos <ArrowRight aria-hidden="true" /></span>
        </button>

        <button type="button" className="admin-dashboard__engagement" onClick={props.onRetention}>
          <div className="admin-dashboard__card-heading"><span>Engajamento do mês</span><ArrowUpRight aria-hidden="true" /></div>
          <div className="admin-dashboard__engagement-value"><strong>{engagement === null ? '—' : engagement}</strong>{engagement !== null && <span>%</span>}<Activity aria-hidden="true" /></div>
          <div className="admin-dashboard__engagement-track" aria-hidden="true"><span style={{ width: `${engagement ?? 0}%` }} /></div>
          <p>{engagement === null ? 'Aguardando dados de frequência.' : 'Alunos ativos com pelo menos um treino concluído neste mês.'}</p>
          <span className="admin-dashboard__card-link">Ver acompanhamento <ArrowRight aria-hidden="true" /></span>
        </button>
      </div>

      <section className="admin-dashboard__section" aria-labelledby="admin-training-title">
        <div className="admin-dashboard__section-heading"><h2 id="admin-training-title">Seu planejamento</h2><span>Treinar. Acompanhar. Evoluir.</span></div>
        <div className="admin-dashboard__tools">
          {tools.map(({ icon: Icon, title, detail, onClick }) => (
            <button type="button" key={title} className="admin-dashboard__tool" onClick={onClick}>
              <div className="admin-dashboard__tool-top"><span className="admin-dashboard__icon"><Icon aria-hidden="true" /></span><ArrowUpRight aria-hidden="true" /></div>
              <h3>{title}</h3><p>{detail}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-dashboard__section" aria-labelledby="admin-communication-title">
        <div className="admin-dashboard__section-heading"><h2 id="admin-communication-title">Fique por perto</h2><span>Comunicação e novidades</span></div>
        <div className="admin-dashboard__communication">
          <button type="button" className="admin-dashboard__notice" onClick={props.onNotifications}>
            <span className="admin-dashboard__icon"><Bell aria-hidden="true" /></span>
            <span className="admin-dashboard__notice-text"><strong>Notificações</strong><span>{props.unreadNotifications === null ? 'Carregando avisos' : props.unreadNotifications > 0 ? `${props.unreadNotifications} ${props.unreadNotifications === 1 ? 'aviso para conferir' : 'avisos para conferir'}` : 'Nenhum aviso não lido'}</span></span>
            {(props.unreadNotifications ?? 0) > 0 ? <span className="admin-dashboard__badge">{props.unreadNotifications! > 99 ? '99+' : props.unreadNotifications}</span> : <ArrowUpRight aria-hidden="true" />}
          </button>
          <div className="admin-dashboard__shortcuts">
            <button type="button" onClick={props.onFeedbacks}><MessageSquare aria-hidden="true" /><span>Feedbacks</span><ArrowUpRight aria-hidden="true" /></button>
            <button type="button" onClick={props.onUpdates}><RefreshCw aria-hidden="true" /><span>Atualizações</span><ArrowUpRight aria-hidden="true" /></button>
          </div>
        </div>
      </section>

      <div className="admin-dashboard__contact">
        <div><span className="admin-dashboard__contact-icon"><LinkIcon aria-hidden="true" /></span><p>Contato do personal<span>Compartilhe seu canal de atendimento.</span></p></div>
        <button type="button" onClick={props.onPersonalContact}>{props.contactCopied ? <Check aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}<span>{props.contactCopied ? 'Contato copiado' : 'Copiar contato'}</span></button>
      </div>
    </section>
  );
}
