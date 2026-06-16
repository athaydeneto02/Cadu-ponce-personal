/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Dumbbell, ChevronRight, Plus, Calendar, Clock, Download } from 'lucide-react';
import { Workout } from '../types';
import { generateWorkoutPDF } from '../lib/pdfGenerator';

interface WorkoutListProps {
  workouts: Workout[];
  onSelectWorkout: (workout: Workout) => void;
  trainerPhone?: string;
}

export default function WorkoutList({ workouts, onSelectWorkout, trainerPhone }: WorkoutListProps) {
  const cleanPhone = (trainerPhone || '5511999999999').replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=Olá%20Cadu%2C%20tenho%20uma%20dúvida%20sobre%20meu%20treino!`;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold dark:text-white transition-colors">Minhas Fichas</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm font-medium transition-colors">Você tem {workouts.length} treinos ativos</p>
        </div>
        <button className="bg-slate-900 dark:bg-white dark:text-slate-950 text-white p-3 rounded-2xl shadow-lg active:scale-95 transition-transform">
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <div className="space-y-4">
        {workouts.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-gray-200 dark:border-slate-800 transition-colors">
            <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Dumbbell className="text-gray-300 dark:text-slate-600 w-8 h-8" />
            </div>
            <p className="text-gray-500 dark:text-slate-400 font-medium">Nenhum treino encontrado.</p>
            <p className="text-gray-400 dark:text-slate-500 text-sm">Adicione seu primeiro treino para começar.</p>
          </div>
        ) : (
          workouts.map((workout) => (
            <div
              key={workout.id}
              className="w-full bg-white dark:bg-slate-900 p-5 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex items-center justify-between group"
            >
              <div 
                onClick={() => onSelectWorkout(workout)}
                className="flex-1 flex items-center space-x-4 cursor-pointer"
              >
                <div className="w-14 h-14 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-500 rounded-2xl flex items-center justify-center transition-colors group-hover:bg-red-600 group-hover:text-white shrink-0">
                  <Dumbbell className="w-7 h-7" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-900 dark:text-white transition-colors line-clamp-1 italic">{workout.name}</h3>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="flex items-center text-xs text-slate-400 font-medium tracking-tight">
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      {workout.exercises.length} exercícios
                    </span>
                    <span className="flex items-center text-xs text-slate-400 font-medium tracking-tight">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      ~45-60 min
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
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
                  className="p-3 bg-gray-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-500 rounded-2xl transition-all active:scale-95"
                  title="Baixar ficha em PDF"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onSelectWorkout(workout)}
                  className="p-3 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all active:scale-95 flex items-center justify-center"
                  title="Começar Treino"
                >
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-12 bg-slate-950 rounded-[32px] p-6 border border-slate-900 shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h4 className="text-white font-black italic uppercase tracking-tighter mb-2">Suporte do Treinador</h4>
          <p className="text-slate-400 text-sm mb-6">Tira suas dúvidas sobre execução ou ajuste de ficha com o Cadu Ponce.</p>
          <a 
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-900/20 active:scale-95 transition-all uppercase tracking-tighter italic block text-center"
          >
            CHAMAR NO WHATSAPP
          </a>
        </div>
        <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-emerald-600/10 rounded-full blur-2xl"></div>
      </div>
    </div>
  );
}
