/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Check, Timer, ChevronLeft, ChevronRight, Info, Trophy, Target, Dumbbell, Star, Flame, Download } from 'lucide-react';
import { Workout, Exercise } from '../types';
import { storage } from '../lib/storage';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { generateWorkoutPDF } from '../lib/pdfGenerator';

interface WorkoutSessionProps {
  workout: Workout;
  onClose: () => void;
}

export default function WorkoutSession({ workout, onClose }: WorkoutSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());
  const [timer, setTimer] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [userNotes, setUserNotes] = useState<Record<string, string>>({});
  const [rpe, setRpe] = useState<number>(0);
  const [hoverRpe, setHoverRpe] = useState<number>(0);
  const [loads, setLoads] = useState<Record<string, number[]>>(() => {
    const initial: Record<string, number[]> = {};
    workout.exercises.forEach(e => {
      const setsCount = parseInt(e.sets) || 1;
      initial[e.id] = Array(setsCount).fill(e.currentLoad || 0);
    });
    return initial;
  });

  // Rest and Set tracker states
  const [isResting, setIsResting] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [restTotalTime, setRestTotalTime] = useState(0);
  const [isRestPaused, setIsRestPaused] = useState(false);
  const [showRestAlert, setShowRestAlert] = useState(false);
  const [isRestMinimized, setIsRestMinimized] = useState(false);
  const [checkedSets, setCheckedSets] = useState<Record<string, boolean[]>>({});

  // Helper to parse rest string (e.g., "45s", "1 min", "60 segundos") into seconds
  const parseRestToSeconds = (restStr: string): number => {
    if (!restStr) return 45;
    const matchSec = restStr.match(/(\d+)\s*s/i);
    if (matchSec) return parseInt(matchSec[1]);
    const matchMin = restStr.match(/(\d+)\s*min/i);
    if (matchMin) return parseInt(matchMin[1]) * 60;
    const num = parseInt(restStr);
    if (!isNaN(num)) return num;
    return 45; // Default fallback
  };

  const startRest = (durationSeconds: number) => {
    setRestTotalTime(durationSeconds);
    setRestTimeLeft(durationSeconds);
    setIsResting(true);
    setIsRestPaused(false);
    setShowRestAlert(false);
  };

  // General session timer effect
  useEffect(() => {
    setIsTimerActive(true);
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (isTimerActive && !isFinished) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerActive, isFinished]);

  // Rest countdown effect
  useEffect(() => {
    let interval: any = null;
    if (isResting && !isRestPaused && restTimeLeft > 0) {
      interval = setInterval(() => {
        setRestTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setShowRestAlert(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (restTimeLeft === 0 && isResting && !showRestAlert) {
      setShowRestAlert(true);
    }
    return () => clearInterval(interval);
  }, [isResting, isRestPaused, restTimeLeft, showRestAlert]);

  const getCheckedSetsForExercise = (exerciseId: string, totalSets: number): boolean[] => {
    if (!checkedSets[exerciseId]) {
      return Array(totalSets).fill(false);
    }
    return checkedSets[exerciseId];
  };

  const toggleSetCheck = (exerciseId: string, setIndex: number, totalSets: number, restStr: string) => {
    const current = [...getCheckedSetsForExercise(exerciseId, totalSets)];
    const newValue = !current[setIndex];
    current[setIndex] = newValue;
    
    setCheckedSets(prev => ({
      ...prev,
      [exerciseId]: current
    }));

    // If checked a new set, trigger countdown automatically!
    if (newValue) {
      const restSec = parseRestToSeconds(restStr);
      startRest(restSec);
    }
  };

  useEffect(() => {
    if (isFinished) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      // Save a persistent notification to localStorage for the trainer (admin role)
      try {
        const adminNotifsKey = 'cadu_notifs_admin';
        const savedNotifsStr = localStorage.getItem(adminNotifsKey);
        let adminNotifs: any[] = [];
        if (savedNotifsStr) {
          try {
            adminNotifs = JSON.parse(savedNotifsStr);
          } catch (e) {
            adminNotifs = [];
          }
        }
        
        // If empty, pre-populate with default simulated historical notifications so there is a rich list
        if (adminNotifs.length === 0) {
          adminNotifs = [
            {
              id: 'notif_felippe',
              studentName: 'Felippe Leitao',
              workoutTitle: 'Treino D - Superiores Completo',
              duration: '55 min',
              intensity: 'high',
              timestamp: 'Há 5 min',
              isRead: false,
              type: 'completion',
              detailMessage: 'Treino concluído com foco em dorsal e bíceps. Solicitou ajuste de exercício para o ombro esquerdo.'
            },
            {
              id: 'notif_mariana',
              studentName: 'Mariana Costa',
              workoutTitle: 'Treino A - Diário (Foco em Glúteos)',
              duration: '48 min',
              intensity: 'high',
              timestamp: 'Há 45 min',
              isRead: false,
              type: 'completion',
              detailMessage: 'Concluiu todas as séries de Elevação Pélvica com excelente contração muscular!'
            },
            {
              id: 'notif_1',
              studentName: 'Aline Rocha',
              workoutTitle: 'Treino A - Diário (Inferiores com Foco em Quadríceps)',
              duration: '52 min',
              intensity: 'high',
              timestamp: 'Há 2 horas',
              isRead: false,
              type: 'completion',
              detailMessage: 'Completou todas as 5 séries de Agachamento Búlgaro com aumento de +2kg de sobrecarga!'
            }
          ];
        }

        // Get currently logged-in student name
        let currentStudentName = 'Felippe Leitao';
        const userStr = localStorage.getItem('cadu_user');
        if (userStr) {
          try {
            const parsedUser = JSON.parse(userStr);
            if (parsedUser && parsedUser.name) {
              currentStudentName = parsedUser.name;
            }
          } catch (e) {}
        }

        const newNotifItem = {
          id: 'notif_' + Date.now(),
          studentName: currentStudentName,
          workoutTitle: workout.name || 'Treino do Dia',
          duration: `${Math.round(timer / 60)} min` || '35 min',
          intensity: 'high',
          timestamp: 'Agora mesmo',
          isRead: false,
          type: 'completion',
          detailMessage: 'Completou com sucesso o treino do dia e registrou nota de feedback na plataforma do Cadu.'
        };

        const updatedNotifs = [newNotifItem, ...adminNotifs];
        localStorage.setItem(adminNotifsKey, JSON.stringify(updatedNotifs));
        
        // Dispatch custom event to let the rest of the application know a new workout completion happened of student!
        window.dispatchEvent(new CustomEvent('cadu_new_notification', { detail: newNotifItem }));
      } catch (err) {
        console.error('Error storing student completion notification:', err);
      }

      return () => clearInterval(interval);
    }
  }, [isFinished]);

  const currentExercise = workout.exercises[currentIndex];

  const toggleExercise = (id: string) => {
    const newSet = new Set(completedExercises);
    if (newSet.has(id)) newSet.delete(id);
    else {
      newSet.add(id);
      // Log progress
      storage.saveProgress({
        id: Math.random().toString(36).substr(2, 9),
        studentId: workout.studentId,
        exerciseName: currentExercise.name,
        load: Math.max(...(loads[currentExercise.id] || [0])),
        reps: parseInt(currentExercise.reps) || 0,
        notes: userNotes[currentExercise.id],
        date: new Date().toISOString(),
      });
    }
    setCompletedExercises(newSet);
  };

  const updateLoad = (id: string, setIndex: number, value: number) => {
    setLoads(prev => {
      const arr = [...(prev[id] || [])];
      arr[setIndex] = Math.max(0, value);
      return { ...prev, [id]: arr };
    });
  };

  if (isFinished) {
    let totalLoad = 0;
    workout.exercises.forEach(ex => {
      const exLoads = loads[ex.id] || [];
      const setsCount = parseInt(ex.sets) || 1;
      const setsDone = getCheckedSetsForExercise(ex.id, setsCount).filter(c => c).length;
      const reps = parseInt(ex.reps) || 1;
      for (let i = 0; i < setsDone; i++) {
        totalLoad += (exLoads[i] || 0) * reps;
      }
    });
    return (
      <div className="fixed inset-0 bg-slate-950 z-[60] flex flex-col items-center justify-center p-8 overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 flex flex-col items-center text-center"
        >
          <div className="w-24 h-24 bg-red-600 rounded-[40px] flex items-center justify-center shadow-2xl shadow-red-900/40 mb-8 relative">
            <Trophy className="w-12 h-12 text-white" />
            <motion.div 
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -inset-4 border-2 border-red-600/30 rounded-[48px]"
            />
          </div>

          <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter mb-4">
            TREINO <span className="text-red-600">CONCLUÍDO!</span>
          </h2>
          <p className="text-slate-400 font-medium mb-12">Você deu o seu máximo hoje. Ótimo trabalho!</p>

          <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
              <Target className="w-6 h-6 text-red-600 mb-2 mx-auto" />
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Exercícios</span>
              <span className="text-2xl font-black text-white italic tracking-tighter">{completedExercises.size} / {workout.exercises.length}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
              <Dumbbell className="w-6 h-6 text-red-600 mb-2 mx-auto" />
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Carga Total</span>
              <span className="text-2xl font-black text-white italic tracking-tighter">{totalLoad}kg</span>
            </div>
          </div>

          <div className="w-full max-w-sm mb-12 bg-slate-900 border border-slate-800 p-6 rounded-3xl">
            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Como foi o esforço? (RPE)</span>
            <div className="flex items-center justify-center space-x-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHoverRpe(star)}
                  onMouseLeave={() => setHoverRpe(0)}
                  onClick={() => setRpe(star)}
                  className="p-1 transition-transform active:scale-90"
                >
                  <Star 
                    className={`w-10 h-10 transition-colors ${
                      star <= (hoverRpe || rpe) 
                      ? 'fill-red-600 text-red-600' 
                      : 'text-slate-700'
                    }`} 
                  />
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs font-black italic uppercase tracking-widest text-red-600 h-4">
              {rpe === 1 && "Muito Leve"}
              {rpe === 2 && "Leve / Moderado"}
              {rpe === 3 && "Esforço Intenso"}
              {rpe === 4 && "Muito Difícil"}
              {rpe === 5 && "Esforço Máximo"}
            </p>
          </div>

          <button 
            onClick={onClose}
            className="w-full max-w-sm bg-white text-slate-950 font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all uppercase italic tracking-tighter"
          >
            VOLTAR PARA O INÍCIO
          </button>
        </motion.div>

        {/* Cinematic background elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
      {/* Screen-wide rest alert blinking flash */}
      {showRestAlert && (
        <motion.div 
          animate={{ opacity: [0, 0.4, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="fixed inset-0 bg-red-650/40 z-[49] pointer-events-none"
        />
      )}

      {/* Session Header */}
      <div className="bg-slate-900 pt-12 pb-6 px-6 text-white shrink-0 shadow-md">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
            <X className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg">Modo Treino</h2>
          <button 
            onClick={() => {
              let studentName = 'Felippe Leitao';
              try {
                const userStr = localStorage.getItem('cadu_user');
                if (userStr) {
                  const parsed = JSON.parse(userStr);
                  if (parsed && parsed.name) studentName = parsed.name;
                }
              } catch (e) {}
              generateWorkoutPDF(workout, studentName);
            }} 
            className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-red-500 hover:text-red-400 flex items-center justify-center"
            title="Baixar ficha em PDF"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold line-clamp-1">{workout.name}</h1>
            <p className="text-slate-400 text-sm mt-1">Exercício {currentIndex + 1} de {workout.exercises.length}</p>
          </div>
          <div className="text-right">
            <div className={`p-2 rounded-xl flex items-center space-x-2 ${isTimerActive ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
              <Timer className="w-4 h-4 text-white animate-pulse" />
              <span className="font-mono text-sm tracking-wide">
                {Math.floor(timer / 60).toString().padStart(2, '0')}:{(timer % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800 w-full relative">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / workout.exercises.length) * 100}%` }}
          className="h-full bg-red-650"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-slate-900 pb-32">
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentExercise.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Exercise Card */}
              <div className="bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-700">
                <div className="aspect-video bg-slate-900 rounded-2xl mb-6 flex items-center justify-center overflow-hidden border border-slate-700 relative">
                  <img 
                    src="/src/assets/images/cadu_ponce_logo_new.png" 
                    className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm"
                  />
                  <div className="relative z-10 flex flex-col items-center text-white">
                    <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-900/40 mb-3">
                      <PlayCircle className="w-8 h-8 fill-current" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Ver Execução</span>
                  </div>
                </div>

                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">{currentExercise.name}</h3>
                
                <div className="grid grid-cols-3 gap-3 mt-8">
                  <button 
                    onClick={() => {
                      const totalSetsNum = Number(currentExercise.sets) || 3;
                      const restSec = parseRestToSeconds(currentExercise.rest);
                      startRest(restSec);
                    }}
                    className="col-span-3 mb-2 p-3 bg-red-600/10 hover:bg-red-600/20 border border-red-600/20 text-red-500 font-extrabold text-[11px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition"
                  >
                    <Timer className="w-4 h-4 text-red-500" />
                    Iniciar Descanso de {currentExercise.rest}
                  </button>

                  <ExerciseInfo label="Séries" value={`${currentExercise.sets}`} />
                  <ExerciseInfo label="Reps" value={currentExercise.reps} />
                  <ExerciseInfo label="Descanso" value={currentExercise.rest} />
                </div>

                {currentExercise.notes && (
                  <div className="mt-8 p-4 bg-red-600/5 rounded-2xl border border-red-600/20 flex items-start space-x-3">
                    <Info className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300 font-medium leading-relaxed">{currentExercise.notes}</p>
                  </div>
                )}
              </div>

              {/* Set-by-Set Checklist Grid */}
              {(() => {
                const setsCount = Number(currentExercise.sets) || 3;
                return (
                  <div className="bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                        Checklist de Séries
                      </label>
                      <span className="text-[9px] font-extrabold text-red-500 uppercase tracking-widest italic">
                        Acione o cronômetro ao concluir
                      </span>
                    </div>
                    
                    <div className="space-y-2.5">
                      {Array.from({ length: setsCount }).map((_, idx) => {
                        const isChecked = getCheckedSetsForExercise(currentExercise.id, setsCount)[idx];
                        return (
                          <button
                            key={idx}
                            onClick={() => toggleSetCheck(currentExercise.id, idx, setsCount, currentExercise.rest)}
                            className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between text-left group active:scale-[0.99] ${
                              isChecked
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-slate-900 border-slate-750 hover:border-slate-600 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs ${
                                isChecked ? 'bg-emerald-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {idx + 1}
                              </span>
                              <span className={`font-bold text-sm ${isChecked ? 'text-white' : 'text-slate-200'}`}>
                                Série {idx + 1}
                              </span>
                            </div>
                            
                            <div className="flex items-center space-x-3">
                              <span className="text-xs font-semibold text-slate-400 font-mono">
                                {loads[currentExercise.id]?.[idx] ?? 0} kg × {currentExercise.reps}
                              </span>
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                isChecked 
                                  ? 'bg-emerald-500 border-emerald-400 text-white' 
                                  : 'border-slate-700 bg-slate-950 text-transparent group-hover:border-slate-500'
                              }`}>
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Load Control */}
              {(() => {
                const setsCount = parseInt(currentExercise.sets) || 1;
                const checks = getCheckedSetsForExercise(currentExercise.id, setsCount);
                const activeSetIndex = checks.findIndex(c => !c);
                const targetSetIndex = activeSetIndex === -1 ? setsCount - 1 : activeSetIndex;
                const currentSetLoad = loads[currentExercise.id]?.[targetSetIndex] ?? 0;

                return (
                  <div className="bg-slate-800 rounded-3xl p-8 shadow-sm border border-slate-700 mt-6">
                    <label className="block text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6 text-center">
                      Carga - Série {targetSetIndex + 1} (kg)
                    </label>
                    <div className="flex items-center justify-between max-w-[280px] mx-auto">
                      <button 
                        onClick={() => updateLoad(currentExercise.id, targetSetIndex, currentSetLoad - 2)}
                        className="w-16 h-16 bg-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center text-2xl font-bold text-white active:scale-90 transition-transform"
                      >
                        -
                      </button>
                      <div className="text-center group">
                        <span className="text-5xl font-black text-white italic tracking-tighter group-active:scale-110 transition-transform inline-block">
                          {currentSetLoad}
                        </span>
                        <span className="block text-red-600 text-xs font-black uppercase mt-1">kg</span>
                      </div>
                      <button 
                        onClick={() => updateLoad(currentExercise.id, targetSetIndex, currentSetLoad + 2)}
                        className="w-16 h-16 bg-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center text-2xl font-bold text-white active:scale-90 transition-transform"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Notes Field */}
              <div className="bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-700">
                <label className="block text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
                  Notas / Dificuldades
                </label>
                <textarea
                  value={userNotes[currentExercise.id] || ''}
                  onChange={(e) => setUserNotes(prev => ({ ...prev, [currentExercise.id]: e.target.value }))}
                  placeholder="Ex: Senti um incômodo no ombro ou a execução foi muito leve..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-slate-300 text-sm focus:outline-none focus:border-red-600 transition-colors resize-none h-32"
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950 border-t border-slate-800 z-50 flex items-center space-x-4">
        <button 
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="p-4 bg-slate-800 text-slate-400 rounded-2xl disabled:opacity-20 active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
        
        <button 
          onClick={() => toggleExercise(currentExercise.id)}
          className={`flex-1 p-5 rounded-2xl font-black text-sm uppercase italic tracking-tighter flex items-center justify-center space-x-2 transition-all active:scale-[0.98] ${
            completedExercises.has(currentExercise.id) 
            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
            : 'bg-red-600 text-white shadow-lg shadow-red-900/20'
          }`}
        >
          {completedExercises.has(currentExercise.id) ? (
            <><Check className="w-5 h-5" /> <span>CONCLUÍDO</span></>
          ) : (
            <span>FINALIZAR SÉRIE</span>
          )}
        </button>

        <button 
          onClick={() => {
            if (currentIndex < workout.exercises.length - 1) {
              setCurrentIndex(currentIndex + 1);
            } else {
              setIsFinished(true);
            }
          }}
          className="p-4 bg-white text-slate-950 rounded-2xl active:scale-95 transition-transform"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      </div>

      {/* Rest Timer Drawer/Overlay */}
      <AnimatePresence>
        {isResting && (
          <motion.div
            initial={{ opacity: 0, y: 150 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              height: isRestMinimized ? '88px' : '400px'
            }}
            exit={{ opacity: 0, y: 150 }}
            className={`fixed bottom-0 left-0 right-0 z-[55] mx-auto w-full max-w-md md:max-w-lg rounded-t-[36px] border-t border-x shadow-2xl flex flex-col justify-between overflow-hidden transition-all duration-350 ${
              showRestAlert
                ? 'bg-red-950 border-red-500 shadow-red-900/60'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            {/* Header of rest drawer */}
            <div className={`px-6 py-4 flex items-center justify-between border-b ${
              showRestAlert ? 'border-red-900/40' : 'border-slate-800'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-lg ${showRestAlert ? 'bg-red-500 animate-bounce text-white' : 'bg-red-600/20 text-red-500'}`}>
                  <Timer className={`w-4 h-4 ${showRestAlert ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-500">
                    {showRestAlert ? '⌛ TEMPO ESGOTADO!' : '⏳ DESCANSO ATIVO'}
                  </span>
                  <p className="text-[11px] text-zinc-100 font-extrabold uppercase tracking-wide truncate max-w-[200px]">
                    {currentExercise.name}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {/* Minimize toggler */}
                <button
                  onClick={() => setIsRestMinimized(!isRestMinimized)}
                  className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                >
                  {isRestMinimized ? 'Expandir' : 'Minimizar'}
                </button>
                {/* Skip / Close */}
                <button
                  onClick={() => {
                    setIsResting(false);
                    setShowRestAlert(false);
                  }}
                  className="p-1 px-2.5 bg-red-650 hover:bg-red-750 hover:text-white text-[10px] font-black uppercase tracking-wide text-white rounded-lg transition-all"
                >
                  Pular
                </button>
              </div>
            </div>

            {/* Body of timer */}
            {!isRestMinimized && (
              <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-6">
                {showRestAlert ? (
                  // Alarm visual screen
                  <div className="text-center space-y-4 py-4 w-full">
                    {/* Ring flashing background indicator */}
                    <motion.div 
                      animate={{ scale: [1, 1.12, 1], opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center mx-auto shadow-lg shadow-red-950/50"
                    >
                      <Flame className="w-10 h-10 text-white fill-current animate-pulse" />
                    </motion.div>
                    <div className="space-y-1">
                      <h4 className="text-2xl font-black italic uppercase tracking-tighter text-white animate-pulse">DESCANSO CONCLUÍDO!</h4>
                      <p className="text-xs text-red-400 font-extrabold uppercase tracking-wide">HORA DE ESMAGAR! VOLTE PARA A PRÓXIMA SÉRIE!</p>
                    </div>
                  </div>
                ) : (
                  // Countdown view
                  <div className="text-center space-y-4 w-full">
                    {/* Ring progress simulation */}
                    <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                      {/* Outer track */}
                      <div className="absolute inset-0 rounded-full border-4 border-slate-900" />
                      {/* Active glowing ring track */}
                      <div 
                        className="absolute inset-0 rounded-full border-4 border-red-600 opacity-80"
                        style={{
                          clipPath: `polygon(50% 50%, -50% -50%, ${100 * (restTimeLeft / restTotalTime)}% -50%, 100% 150%, -50% 150%)`,
                          transform: 'rotate(-90deg)'
                        }}
                      />
                      
                      <div className="relative z-10 text-center">
                        <span className="text-3xl font-black font-mono tracking-tighter text-white">
                          {Math.floor(restTimeLeft / 60)}:{(restTimeLeft % 60).toString().padStart(2, '0')}
                        </span>
                        <span className="block text-[8px] text-slate-500 font-black uppercase tracking-widest mt-1">
                          restam de {Math.floor(restTotalTime / 60)}:{(restTotalTime % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    </div>

                    {/* Quick fine-tune adjustment buttons */}
                    <div className="flex items-center justify-center space-x-3">
                      <button
                        onClick={() => setRestTimeLeft(prev => Math.max(5, prev - 10))}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-[10px] font-black tracking-wider transition"
                      >
                        -10s
                      </button>
                      <button
                        onClick={() => setIsRestPaused(!isRestPaused)}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          isRestPaused 
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md' 
                            : 'bg-slate-900 border border-slate-850 text-slate-300'
                        }`}
                      >
                        {isRestPaused ? 'Retomar' : 'Paulinha'}
                      </button>
                      <button
                        onClick={() => setRestTimeLeft(prev => prev + 10)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-[10px] font-black tracking-wider transition"
                      >
                        +10s
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Minimized strip / Bottom action strip */}
            <div className={`px-6 py-4 flex justify-between items-center transition-colors ${
              showRestAlert ? 'bg-red-700/30 border-t border-red-500/30' : 'bg-slate-900/60 border-t border-slate-800'
            }`}>
              {isRestMinimized && (
                <div className="flex items-center space-x-3 flex-1 mr-4">
                  <span className="font-mono text-sm font-black text-white">
                    {showRestAlert 
                      ? 'Despertador! 💪' 
                      : `${Math.floor(restTimeLeft / 60)}:${(restTimeLeft % 60).toString().padStart(2, '0')}`
                    }
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold truncate leading-none">
                    {showRestAlert ? 'Toque para continuar' : 'Descanso ativo...'}
                  </span>
                </div>
              )}
              
              <button
                onClick={() => {
                  setIsResting(false);
                  setShowRestAlert(false);
                }}
                className={`w-full py-3.5 font-black uppercase italic tracking-tighter text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                  showRestAlert 
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg animate-pulse' 
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
              >
                {showRestAlert ? (
                  <>
                    <Flame className="w-4 h-4 fill-current animate-bounce" />
                    <span>HORA DE BRUTALIZAR! FECHAR</span>
                  </>
                ) : (
                  <span>VOLTAR AO TREINO</span>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExerciseInfo({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl text-center">
      <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</span>
      <span className="text-lg font-black text-white italic tracking-tighter">{value}</span>
    </div>
  );
}


function PlayCircle(props: any) {
  return (
    <svg 
      {...props}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
    </svg>
  );
}
