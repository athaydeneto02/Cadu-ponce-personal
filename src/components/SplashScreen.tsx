/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
}

const STAGES = [
  { at: 0,  text: 'Iniciando...',               phrase: 'PREPARE-SE' },
  { at: 20, text: 'Carregando seus treinos...',  phrase: 'FOCO' },
  { at: 45, text: 'Sincronizando dados...',      phrase: 'FORÇA' },
  { at: 70, text: 'Quase pronto...',             phrase: 'SUPERAÇÃO' },
  { at: 90, text: 'É hora do show! 💪',         phrase: 'EVOLUÇÃO' },
];

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);

  const stage = [...STAGES].reverse().find(s => progress >= s.at) ?? STAGES[0];

  /* ── Progress ticker ────────────────────────────────────────── */
  useEffect(() => {
    let current = 0;
    const id = setInterval(() => {
      const step = current < 60 ? 1.5 : 0.8;
      current = Math.min(current + step + Math.random() * 0.4, 100);
      setProgress(Math.floor(current));
      if (current >= 100) {
        clearInterval(id);
        setTimeout(onComplete, 600);
      }
    }, 24);
    return () => clearInterval(id);
  }, [onComplete]);

  /* ── Particle data (stable — computed once) ─────────────────── */
  const particles = React.useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1.5,
      dur: Math.random() * 5 + 4,
      delay: Math.random() * 3,
    })), []);

  const circumference = 2 * Math.PI * 54;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: '#020408' }}
    >
      {/* ── Deep radial glow ─────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 55% at 50% 52%, rgba(220,38,38,0.13) 0%, transparent 70%)',
        }}
      />

      {/* ── Subtle grid ─────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── Floating particles ──────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map(p => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-red-500"
            style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%`, opacity: 0 }}
            animate={{ y: [-20, -80], opacity: [0, 0.5, 0] }}
            transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeOut' }}
          />
        ))}
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center px-8 w-full max-w-xs"
      >
        {/* ── Logo + ring ─────────────────────────────────────── */}
        <div className="relative mb-10 flex items-center justify-center">
          {/* Outer slow ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute w-36 h-36 rounded-full"
            style={{ border: '1px solid rgba(220,38,38,0.15)' }}
          />

          {/* SVG progress ring */}
          <svg
            className="absolute w-36 h-36 -rotate-90"
            viewBox="0 0 120 120"
          >
            {/* Track */}
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="2" />
            {/* Progress */}
            <motion.circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (circumference * progress) / 100}
              style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            />
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#dc2626" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
          </svg>

          {/* Logo box */}
          <div
            className="w-20 h-20 rounded-[22px] flex items-center justify-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #1a0505 0%, #3b0a0a 50%, #1a0505 100%)',
              border: '1.5px solid rgba(220,38,38,0.4)',
              boxShadow: '0 0 40px rgba(220,38,38,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            {/* Shimmer */}
            <motion.div
              className="absolute inset-y-0 w-1/3 -skew-x-12"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }}
            />
            <span
              className="relative z-10 font-black italic tracking-tighter text-white"
              style={{ fontSize: 32, letterSpacing: -2, textShadow: '0 0 20px rgba(220,38,38,0.8)' }}
            >
              C<span style={{ color: '#dc2626' }}>P</span>
            </span>
          </div>
        </div>

        {/* ── Brand name ──────────────────────────────────────── */}
        <div className="text-center mb-2">
          <motion.h1
            initial={{ opacity: 0, letterSpacing: '0.5em' }}
            animate={{ opacity: 1, letterSpacing: '-0.02em' }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-white font-black italic uppercase text-3xl leading-none"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}
          >
            CADU <span style={{ color: '#dc2626' }}>PONCE</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-[10px] font-black uppercase tracking-[0.4em] mt-1"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            Personal Training
          </motion.p>
        </div>

        {/* ── Phrase ──────────────────────────────────────────── */}
        <div className="h-6 flex items-center justify-center mt-3 mb-8">
          <AnimatePresence mode="wait">
            <motion.span
              key={stage.phrase}
              initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
              animate={{ opacity: 0.35, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.4 }}
              className="text-white font-black uppercase text-xs tracking-[0.5em]"
            >
              · {stage.phrase} ·
            </motion.span>
          </AnimatePresence>
        </div>

        {/* ── Progress bar card ────────────────────────────────── */}
        <div
          className="w-full rounded-3xl p-5 relative overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Top shine */}
          <div
            className="absolute top-0 inset-x-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }}
          />

          <div className="flex items-center justify-between mb-3">
            {/* Status text */}
            <AnimatePresence mode="wait">
              <motion.p
                key={stage.text}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.3 }}
                className="text-[11px] font-bold"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                {stage.text}
              </motion.p>
            </AnimatePresence>

            {/* Percent */}
            <span
              className="text-[11px] font-black tabular-nums"
              style={{ color: '#dc2626' }}
            >
              {progress}%
            </span>
          </div>

          {/* Bar track */}
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              className="h-full rounded-full relative overflow-hidden"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #dc2626, #f97316)',
                boxShadow: '0 0 12px rgba(220,38,38,0.7)',
                transition: 'width 0.1s linear',
              }}
            >
              {/* Shimmer on bar */}
              <motion.div
                className="absolute inset-y-0 w-8 -skew-x-12"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              />
            </motion.div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 text-[9px] font-black uppercase tracking-[0.4em]"
          style={{ color: 'rgba(255,255,255,0.15)' }}
        >
          SISTEMA EXECUTIVO
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
