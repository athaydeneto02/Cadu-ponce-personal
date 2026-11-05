import monogram from '../assets/images/cadu-ponce-monogram.webp';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  layout?: 'horizontal' | 'stacked';
  tone?: 'light' | 'dark';
}

/** One identity for the login, launch screen and in-app headers. */
export default function BrandLogo({ className = '', size = 'md', layout = 'horizontal', tone = 'dark' }: BrandLogoProps) {
  return (
    <div className={`brand-logo brand-logo--${size} brand-logo--${layout} brand-logo--${tone} ${className}`} role="img" aria-label="Cadu Ponce — Consultoria Esportiva">
      <img className="brand-logo__mark" src={monogram} width="512" height="512" alt="" aria-hidden="true" draggable="false" />
      <div className="brand-logo__type" aria-hidden="true">
        <div className="brand-logo__name">CADU <span>PONCE</span></div>
        {size !== 'sm' && <div className="brand-logo__descriptor">Consultoria Esportiva</div>}
      </div>
    </div>
  );
}
