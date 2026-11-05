import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import SplashScreen from './SplashScreen';

/** Brief brand entrance; the application initializes underneath without delay. */
export default function AppStartup({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    if (reducedMotion) { setShowIntro(false); return; }
    const timer = window.setTimeout(() => setShowIntro(false), 1200);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <>
      <div inert={showIntro} aria-hidden={showIntro || undefined}>{children}</div>
      <AnimatePresence>
        {showIntro && (
          <motion.div className="app-startup" key="brand-intro" initial={false} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.25 }}>
            <SplashScreen />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
