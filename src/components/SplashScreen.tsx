import BrandLogo from './BrandLogo';

interface SplashScreenProps {
  compact?: boolean;
}

/** Indeterminate by design: only the real auth/page lifecycle decides readiness. */
export default function SplashScreen({ compact = false }: SplashScreenProps) {
  return (
    <div className={`app-splash${compact ? ' app-splash--compact' : ''}`}>
      <div className="app-splash__ambient" aria-hidden="true" />
      <div className="app-splash__frame" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="app-splash__eyebrow" aria-hidden="true"><span />Treinamento personalizado</div>
      <div className="app-splash__content">
        <div className="app-splash__identity">
          <div className="app-splash__orbit" aria-hidden="true" />
          <BrandLogo size="xl" layout="stacked" />
        </div>
        <p className="app-splash__promise">Sua evolução começa aqui.</p>
        <div className="app-splash__loading" role="status" aria-live="polite">
          <div className="app-splash__track" aria-hidden="true"><span /></div>
          <p><span className="app-splash__status-dot" aria-hidden="true" />{compact ? 'Carregando seu espaço' : 'Preparando seu acesso'}</p>
        </div>
      </div>
      <div className="app-splash__footer" aria-hidden="true"><span>Foco</span><i /><span>Constância</span><i /><span>Evolução</span></div>
    </div>
  );
}
