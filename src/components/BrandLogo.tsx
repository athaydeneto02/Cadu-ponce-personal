import React from 'react';
import { motion } from 'motion/react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function BrandLogo({ className = '', size = 'md' }: BrandLogoProps) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl md:text-3xl',
    lg: 'text-4xl md:text-5xl',
    xl: 'text-6xl md:text-7xl'
  };

  const iconSizes = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
    xl: 'w-28 h-28'
  };

  return (
    <div className={`flex items-center space-x-4 ${className}`}>
      <motion.div 
        initial={{ rotate: -15, scale: 0.8 }}
        animate={{ rotate: 0, scale: 1 }}
        whileHover={{ scale: 1.08, rotate: 3, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 220, damping: 14 }}
        className={`${iconSizes[size]} bg-gradient-to-br from-stone-900 via-red-950 to-red-650 border-2 border-red-500/50 flex items-center justify-center rounded-2xl shadow-2xl shadow-red-950/60 relative overflow-hidden group shrink-0 select-none cursor-pointer`}
      >
        {/* Subtle glowing animated backdrop inside logo container */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.5),transparent)] animate-pulse" />
        
        {/* Premium crosshair grid markings */}
        <div className="absolute top-1.5 left-1.5 w-2 h-2 border-t border-l border-red-400/40" />
        <div className="absolute bottom-1.5 right-1.5 w-2 h-2 border-b border-r border-red-400/40" />
        <div className="absolute top-1.5 right-1.5 w-2 h-2 border-t border-r border-red-400/20" />
        <div className="absolute bottom-1.5 left-1.5 w-2 h-2 border-b border-l border-red-400/20" />

        {/* Dynamic glossy reflection effect lines */}
        <motion.div 
          animate={{ x: ['-150%', '250%'] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.8 }}
          className="absolute inset-y-0 w-2/5 bg-gradient-to-r from-transparent via-white/25 to-transparent transform -skew-x-25 z-10"
        />

        <div className="relative z-10 font-black italic tracking-tighter leading-none transform -skew-x-12 select-none flex items-baseline justify-center">
          <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" 
                style={{ fontSize: size === 'sm' ? '15px' : size === 'md' ? '20px' : size === 'lg' ? '30px' : '44px' }}>
            C
          </span>
          <span className="text-red-500 drop-shadow-[0_2px_4px_rgba(220,38,38,0.8)] filter brightness-110 ml-[-1px]"
                style={{ fontSize: size === 'sm' ? '15px' : size === 'md' ? '20px' : size === 'lg' ? '30px' : '44px' }}>
            P
          </span>
        </div>
        
        {/* Dynamic ring-light glow border on hover */}
        <div className="absolute inset-0 border border-white/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </motion.div>
      
      <div className="flex flex-col leading-none text-left">
        <span className={`${sizes[size]} font-black italic tracking-tight uppercase transition-colors flex items-center`}>
          <span className="text-slate-900 dark:text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] font-black">
            CADU
          </span>
          <span className="relative ml-2 font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-650 drop-shadow-[0_2px_6px_rgba(220,38,38,0.25)] select-none">
            PONCE
            {/* Dynamic Animated Under-line accent */}
            <motion.span 
              initial={{ width: 0 }}
              animate={{ width: "80%" }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="absolute -bottom-1.5 left-0 h-[3.5px] bg-gradient-to-r from-red-600 to-amber-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)]" 
            />
          </span>
        </span>
        {size !== 'sm' && (
          <span className="text-[10px] md:text-[11px] font-extrabold uppercase tracking-[0.45em] text-slate-400 dark:text-slate-500 mt-3.5 pl-0.5 filter brightness-95">
            Consultoria Esportiva
          </span>
        )}
      </div>
    </div>
  );
}
