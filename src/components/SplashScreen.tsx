/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import BrandLogo from './BrandLogo';
import { Dumbbell, Trophy, Flame, Zap } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Conectando ao Cadu Ponce...');
  const [activeKeyword, setActiveKeyword] = useState('FOCO');

  // Hardcore sports motivational phrases matched with loader stages
  const motivationalQuotes = [
    { text: 'CONEXÃO ESTABELECIDA', quote: 'SÓ VENCE QUEM PERMANECE.' },
    { text: 'PREPARANDO FICHAS DE TREINO', quote: 'MAIS FORTE QUE SUA MELHOR DESCULPA.' },
    { text: 'PLANEJANDO ALTA PERFORMANCE', quote: 'A CONSTÂNCIA CONSTRÓI O SEU RESULTADO.' },
    { text: 'ERGUENDO CARGAS EXCEPCIONAIS', quote: 'O SEU ÚNICO LIMITE É VOCÊ MESMO.' },
    { text: 'BORA PRO TREINO!', quote: 'NENHUM OBSTÁCULO É PARÉM PARA QUEM QUER EVOLUIR.' }
  ];

  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);

  useEffect(() => {
    if (progress >= 0 && progress < 20) {
      setStatusText('Estabelecendo conexão segura...');
      setActiveKeyword('FOCO');
      setCurrentQuoteIndex(0);
    } else if (progress >= 20 && progress < 45) {
      setStatusText('Sincronizando suas planilhas de evolução...');
      setActiveKeyword('FORÇA');
      setCurrentQuoteIndex(1);
    } else if (progress >= 45 && progress < 70) {
      setStatusText('Calculando cargas de treino personalizadas...');
      setActiveKeyword('DIETA & FOCO');
      setCurrentQuoteIndex(2);
    } else if (progress >= 70 && progress < 90) {
      setStatusText('Consolidando banco de execuções...');
      setActiveKeyword('SUPERAÇÃO');
      setCurrentQuoteIndex(3);
    } else if (progress >= 90) {
      setStatusText('Modo offline pronto! É hora do show! 💪');
      setActiveKeyword('EVOLUÇÃO');
      setCurrentQuoteIndex(4);
    }
  }, [progress]);

  useEffect(() => {
    let currentProgress = 0;
    const duration = 2400; // Fast-paced premium loading screen
    const intervalTime = 25; // Smoother animations
    const step = 100 / (duration / intervalTime);

    const timer = setInterval(() => {
      // Fast start, slow finish feeling
      const modifier = currentProgress < 60 ? step * 1.3 : step * 0.8;
      currentProgress += modifier + Math.random() * 0.3;
      
      if (currentProgress >= 100) {
        currentProgress = 100;
        setProgress(100);
        clearInterval(timer);
        const finishTimeout = setTimeout(() => {
          onComplete();
        }, 500);
        return () => clearTimeout(finishTimeout);
      } else {
        setProgress(Math.floor(currentProgress));
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [onComplete]);

  // Premium progress icons
  const getProgressIcon = () => {
    if (progress < 25) return <Zap className="w-5 h-5 text-red-550 animate-bounce" />;
    if (progress < 55) return <Dumbbell className="w-5 h-5 text-red-500 animate-spin-slow" />;
    if (progress < 85) return <Trophy className="w-5 h-5 text-amber-500 animate-pulse" />;
    return <Flame className="w-5 h-5 text-red-550 animate-bounce" />;
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[100] overflow-hidden select-none">
      {/* Immersive background glowing mesh zones */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-red-650/10 rounded-full blur-[150px] pointer-events-none animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] bg-indigo-950/20 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Background Animated Floating Spark Stars */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-red-500/20"
            style={{
              width: Math.random() * 4 + 2 + 'px',
              height: Math.random() * 4 + 2 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
            }}
            animate={{
              y: [0, -100],
              opacity: [0, 0.7, 0],
              scale: [0.8, 1.2, 0.8]
            }}
            transition={{
              duration: Math.random() * 6 + 4,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 3
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center"
      >
        {/* Animated outer interactive speedometer ring */}
        <div className="relative mb-14 flex items-center justify-center">
          {/* Circular dial background track */}
          <div className="absolute -inset-8 rounded-full border border-slate-800/40" />

          {/* Dynamic rotating outer dashed ring */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-8 border border-dashed border-red-500/20 rounded-full"
          />

          {/* Sliced high-tech ring mimicking active load indicators */}
          <svg className="absolute -inset-10 w-44 h-44 rotate-[-90deg] pointer-events-none opacity-40" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="46"
              stroke="#dc2626"
              strokeWidth="1.5"
              fill="transparent"
              strokeDasharray="289"
              strokeDashoffset={289 - (289 * progress) / 100}
              className="transition-all duration-100 ease-out"
            />
          </svg>

          {/* Decorative speed tick pointers */}
          <div className="absolute top-[-36px] w-[2px] h-[6px] bg-red-500/60" />
          <div className="absolute bottom-[-36px] w-[2px] h-[6px] bg-red-500/60" />
          <div className="absolute left-[-36px] w-[6px] h-[2px] bg-red-500/60" />
          <div className="absolute right-[-36px] w-[6px] h-[2px] bg-red-500/60" />

          <div className="scale-125 md:scale-135 relative">
            <BrandLogo size="lg" className="flex-col !space-x-0 !space-y-4" />
          </div>
        </div>

        {/* Shifting Motivation Title */}
        <div className="h-6 flex items-center justify-center mt-3 mb-1.5">
          <AnimatePresence mode="wait">
            <motion.span
              key={activeKeyword}
              initial={{ opacity: 0, y: 8, filter: 'blur(2px)' }}
              animate={{ opacity: 0.3, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
              transition={{ duration: 0.35 }}
              className="text-white text-base font-black tracking-[0.45em] uppercase"
            >
              • {activeKeyword} •
            </motion.span>
          </AnimatePresence>
        </div>

        {/* High performance Brazilian Gym Quote */}
        <div className="h-10 flex items-center justify-center mb-8 px-4">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentQuoteIndex}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.4 }}
              className="text-[11px] font-medium text-slate-450 italic leading-relaxed"
            >
              {motivationalQuotes[currentQuoteIndex]?.quote}
            </motion.p>
          </AnimatePresence>
        </div>
        
        {/* Modern Glassmorphic Progress dashboard */}
        <div className="w-72 bg-slate-900/40 border border-slate-800/80 p-5 rounded-[2.5rem] shadow-2xl backdrop-blur-xl relative overflow-hidden flex flex-col items-center">
          {/* Inner metallic gleam line top */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          
          <div className="flex items-center justify-between w-full mb-3 px-1">
            <div className="flex items-center space-x-2 text-[11px] font-semibold">
              <span className="flex items-center justify-center w-7.5 h-7.5 rounded-2xl bg-slate-950 border border-slate-800/50 shadow-inner">
                {getProgressIcon()}
              </span>
              <span className="text-slate-400 uppercase tracking-widest text-[9.5px] font-extrabold pl-1">
                {progress === 100 ? 'INICIAR' : 'CARREGANDO'}
              </span>
            </div>
            
            <span className="font-mono text-[11px] font-black text-red-500 bg-red-950/20 px-3 py-1 rounded-xl border border-red-900/35 shadow-inner leading-none">
              {progress}%
            </span>
          </div>

          {/* Premium double glow track loader bar */}
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden mb-3.5 border border-slate-800/40 relative shadow-inner">
            <div 
              style={{ width: `${progress}%` }}
              className="h-full bg-gradient-to-r from-red-650 via-red-500 to-amber-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] rounded-full transition-all duration-100 ease-out relative"
            >
              {/* Animated scanning glint inside progress stream */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-12 animate-shimmer" style={{ animationDuration: '1.2s' }} />
            </div>
          </div>

          <p className="text-slate-400 text-[11px] font-semibold tracking-wide h-4 leading-none filter brightness-95 line-clamp-1">
            {statusText}
          </p>
        </div>
        
        {/* Elite status performance indicator footer */}
        <p className="text-slate-500 text-[9px] font-extrabold uppercase tracking-[0.35em] mt-10">
          Cadu Ponce • Sistema Executivo
        </p>
      </motion.div>

      {/* Futuristic technical scan lines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.015] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:20px_20px]" />
    </div>
  );
}
