import type { CSSProperties } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, CircleCheck,
  ClipboardList, CreditCard, Dumbbell, FolderOpen, MessageCircle, Plus, TrendingUp,
} from 'lucide-react';
import caduAvatar from '../assets/images/cadu_ponce_avatar.jpg';
import { localWorkoutDateKey } from '../lib/workoutFrequency';
import { getTrainerWhatsAppUrl, TRAINER_CONFIG } from '../lib/trainerConfig';
import './student-home.css';

export interface StudentHomeProps {
  name?: string;
  weekDates: Date[];
  completedDates: ReadonlySet<string>;
  frequencyLoading: boolean;
  frequencyError: string;
  pushStatus: 'unsupported' | 'needs-permission' | 'denied' | 'syncing' | 'ready' | 'error';
  onEnableNotifications: () => void;
  onFrequency: () => void;
  onWorkouts: () => void;
  onExtraWorkouts: () => void;
  onAssessments: () => void;
  onProgress: () => void;
  onPayment: () => void;
  onFiles: () => void;
  onAnamneses: () => void;
  onAgenda: () => void;
}

export default function StudentHome(props: StudentHomeProps) {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = props.name?.trim().split(/\s+/)[0] || 'Aluno';
  const today = localWorkoutDateKey(now);
  const completedToday = Boolean(today && props.completedDates.has(today));
  const completedThisWeek = props.weekDates.filter(date => props.completedDates.has(localWorkoutDateKey(date)!)).length;
  const actions = [
    { icon: CalendarDays, title: 'Minha agenda', detail: 'Seus próximos compromissos', onClick: props.onAgenda },
    { icon: TrendingUp, title: 'Meu progresso', detail: 'Registre e acompanhe sua evolução', onClick: props.onProgress },
    { icon: Activity, title: 'Avaliações', detail: 'Medidas e acompanhamento', onClick: props.onAssessments },
    { icon: ClipboardList, title: 'Questionários de saúde', detail: 'Informações para o seu cuidado', onClick: props.onAnamneses },
    { icon: Plus, title: 'Treinos extras', detail: 'Explore outras atividades', onClick: props.onExtraWorkouts },
    { icon: FolderOpen, title: 'Meus arquivos', detail: 'Documentos sempre à mão', onClick: props.onFiles },
  ];
  const notificationMessage = {
    unsupported: '',
    ready: 'Notificações ativadas neste dispositivo.',
    syncing: 'Atualizando suas notificações…',
    denied: 'Ative as notificações nas permissões do navegador para receber avisos.',
    error: 'Não foi possível ativar as notificações.',
    'needs-permission': 'Receba os avisos do personal neste dispositivo.',
  }[props.pushStatus];

  return (
    <section className="student-home" aria-labelledby="student-home-title">
      <header className="student-home__intro">
        <div>
          <p className="student-home__eyebrow"><span />Seu espaço de evolução</p>
          <h1 id="student-home-title">{greeting}, {firstName}<span>.</span></h1>
          <p className="student-home__subtitle">Um passo de cada vez. Sempre em frente.</p>
        </div>
        <span className="student-home__date"><CalendarDays aria-hidden="true" /><time dateTime={today || undefined}>{now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</time></span>
      </header>

      <div className="student-home__overview">
        <section className="student-home__training" aria-labelledby="student-training-title">
          <div className="student-home__training-art" aria-hidden="true"><span className="student-home__hero-orbit student-home__hero-orbit--outer" /><span className="student-home__hero-orbit student-home__hero-orbit--inner" /><span className="student-home__hero-ribbon" /><span className="student-home__hero-ribbon student-home__hero-ribbon--thin" /><span className="student-home__hero-monogram">CP</span><span className="student-home__hero-cross">+</span></div>
          <div className="student-home__training-top"><span className="student-home__training-icon"><Dumbbell aria-hidden="true" /></span><span>Foco no seu ritmo</span><span className="student-home__training-marker" aria-hidden="true"><i /><i /><i /><i /><i /></span></div>
          <div className="student-home__training-copy">
            <p className="student-home__card-kicker">{completedToday ? 'Mais um passo dado' : 'Seu próximo passo'}</p>
            <h2 id="student-training-title">{completedToday ? <><span>Treino</span><strong>concluído.</strong></> : <><span>Seu momento</span><strong>de evoluir.</strong></>}</h2>
            <p>{completedToday ? 'O treino de hoje já está registrado. Confira sua rotina e siga no seu ritmo.' : 'Acesse sua rotina, confira os exercícios e prepare-se para a próxima sessão.'}</p>
          </div>
          <div className="student-home__training-footer"><button type="button" className="student-home__primary" onClick={props.onWorkouts}><span>Ver meus treinos</span><span className="student-home__primary-arrow"><ArrowRight aria-hidden="true" /></span></button><span className="student-home__training-signature" aria-hidden="true">CADU PONCE<br /><b>PERSONAL TRAINER</b></span></div>
        </section>

        <section className="student-home__frequency" aria-labelledby="student-frequency-title">
          <div className="student-home__card-heading"><h2 id="student-frequency-title"><Activity aria-hidden="true" />Sua constância</h2><button type="button" onClick={props.onFrequency} aria-label="Ver calendário de frequência"><ArrowUpRight aria-hidden="true" /></button></div>
          <div className="student-home__frequency-summary">
            <div className="student-home__week-ring">
              <svg className="student-home__ring" viewBox="0 0 140 140" aria-hidden="true">
                <circle className="student-home__ring-guide" cx="70" cy="70" r="47" />
                {props.weekDates.map((date, index) => <circle key={localWorkoutDateKey(date)} className={`student-home__ring-segment${props.completedDates.has(localWorkoutDateKey(date)!) ? ' student-home__ring-segment--done' : ''}`} cx="70" cy="70" r="59" pathLength="100" strokeDasharray="11.4 88.6" transform={`rotate(${index * (360 / 7) - 86} 70 70)`} />)}
              </svg>
              <div className="student-home__ring-value"><strong>{props.frequencyLoading && !completedThisWeek ? '—' : completedThisWeek}</strong><span>de 7 dias</span></div>
            </div>
            <div className="student-home__frequency-copy"><span className="student-home__frequency-kicker">Semana em movimento</span><strong>{completedThisWeek === 1 ? 'Dia de treino' : 'Dias de treino'}<br />nesta semana.</strong><p>Cada treino concluído<br />faz parte da sua evolução.</p></div>
          </div>
          <button type="button" className="student-home__week" onClick={props.onFrequency} aria-label="Abrir calendário completo de treinos">
            {props.weekDates.map((date, index) => {
              const key = localWorkoutDateKey(date)!;
              const done = props.completedDates.has(key);
              const isToday = key === today;
              return <span key={key} className={`student-home__day${done ? ' student-home__day--done' : ''}${isToday ? ' student-home__day--today' : ''}`} aria-label={`${date.toLocaleDateString('pt-BR')}: ${done ? 'treino concluído' : 'sem treino registrado'}${isToday ? ', hoje' : ''}`} aria-current={isToday ? 'date' : undefined}><span className="student-home__day-label">{['S', 'T', 'Q', 'Q', 'S', 'S', 'D'][index]}</span><span className="student-home__day-number">{done ? <Check aria-hidden="true" /> : date.getDate()}</span><span className="student-home__day-dot" /></span>;
            })}
          </button>
          <div className={`student-home__today${completedToday ? ' student-home__today--done' : ''}`} role="status">
            {completedToday ? <CircleCheck aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
            <span>{completedToday ? 'Hoje está positivo. Treino registrado!' : props.frequencyLoading ? 'Atualizando sua frequência…' : 'Sua frequência acompanha os treinos concluídos.'}</span>
          </div>
          {props.frequencyError && <p className="student-home__error" role="status">{props.frequencyError}</p>}
        </section>
      </div>

      <section className="student-home__section" aria-labelledby="student-tools-title">
        <div className="student-home__section-heading"><h2 id="student-tools-title">Seu acompanhamento</h2><span>Tudo para a sua jornada</span></div>
        <div className="student-home__tools">
          {actions.map(({ icon: Icon, title, detail, onClick }, index) => <button key={title} type="button" className={`student-home__tool student-home__tool--${index + 1}`} style={{ '--tool-order': index } as CSSProperties} onClick={onClick}><span className="student-home__tool-art" aria-hidden="true"><Icon /><i /><i /></span><span className="student-home__tool-top"><span className="student-home__icon"><Icon aria-hidden="true" /></span><span className="student-home__tool-arrow"><ArrowUpRight aria-hidden="true" /></span></span><strong>{title}</strong><span className="student-home__tool-detail">{detail}</span><span className="student-home__tool-edge" aria-hidden="true" /></button>)}
        </div>
      </section>

      <section className="student-home__trainer" aria-label="Contato do seu personal">
        <span className="student-home__trainer-art" aria-hidden="true">CP</span>
        <div className="student-home__trainer-info"><span className="student-home__trainer-avatar"><img src={caduAvatar} alt="" /></span><div><span>Conte com seu personal</span><h2>{TRAINER_CONFIG.name}</h2><p>CREF: 044859-G/PR</p></div></div>
        <div className="student-home__trainer-actions"><a href={getTrainerWhatsAppUrl()} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" /><span>Falar com o Cadu</span><ArrowUpRight aria-hidden="true" /></a><button type="button" onClick={props.onPayment}><CreditCard aria-hidden="true" /><span>Planos e pagamento</span><ArrowUpRight aria-hidden="true" /></button></div>
      </section>

      {props.pushStatus !== 'unsupported' && <div className={`student-home__notification${props.pushStatus === 'ready' ? ' student-home__notification--ready' : ''}`}><Bell aria-hidden="true" /><p role="status">{notificationMessage}</p>{(props.pushStatus === 'needs-permission' || props.pushStatus === 'error') && <button type="button" onClick={props.onEnableNotifications}>{props.pushStatus === 'error' ? 'Tentar novamente' : 'Ativar avisos'}</button>}</div>}
    </section>
  );
}
