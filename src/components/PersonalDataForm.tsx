/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Save, User, Mail, Scale, Ruler, Camera, Phone } from 'lucide-react';
import { UserProfile } from '../types';

interface PersonalDataFormProps {
  user: UserProfile | null;
  onSave: (updatedUser: UserProfile) => void;
  onClose: () => void;
  isDark?: boolean;
}

export default function PersonalDataForm({ user, onSave, onClose, isDark }: PersonalDataFormProps) {
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: user?.name || '',
    email: user?.email || '',
    weight: user?.weight || 0,
    height: user?.height || 0,
    trainerPhone: user?.trainerPhone || '',
    metadata: {
      ...user?.metadata,
      instagram: user?.metadata?.instagram || '',
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      onSave({
        ...user,
        ...formData,
      } as UserProfile);
    }
  };

  return (
    <div className={`fixed inset-0 z-[60] flex flex-col ${isDark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`h-20 border-b flex items-center justify-between px-6 shrink-0 transition-colors duration-300 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center space-x-4">
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
          <h2 className={`text-xl font-black italic uppercase tracking-tighter ${isDark ? 'text-white' : 'text-slate-950'}`}>
            Dados <span className="text-red-600">Pessoais</span>
          </h2>
        </div>
        <button 
          onClick={handleSubmit}
          className="flex items-center space-x-2 bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-red-600/20 active:scale-95 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>Salvar</span>
        </button>
      </header>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto space-y-8">
          {/* Avatar Section */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <div className="w-32 h-32 bg-red-50 dark:bg-red-950/20 rounded-[40px] flex items-center justify-center overflow-hidden border-4 border-white dark:border-slate-900 shadow-2xl relative">
                <img 
                  src="/src/assets/images/cadu_ponce_logo_new.png" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              </div>
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-xl border-4 border-white dark:border-slate-900"
              >
                <Camera className="w-5 h-5" />
              </motion.div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Nome Completo</label>
              <div className={`relative flex items-center ${isDark ? 'text-white' : 'text-slate-950'}`}>
                <User className="absolute left-4 w-5 h-5 text-slate-400" />
                <input 
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full pl-12 pr-4 py-4 rounded-3xl border outline-none focus:border-red-600 transition-all font-bold ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}
                  placeholder="Seu nome"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">E-mail</label>
              <div className={`relative flex items-center ${isDark ? 'text-white' : 'text-slate-950'}`}>
                <Mail className="absolute left-4 w-5 h-5 text-slate-400" />
                <input 
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full pl-12 pr-4 py-4 rounded-3xl border outline-none focus:border-red-600 transition-all font-bold ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}
                  placeholder="seu@email.com"
                />
              </div>
            </div>



            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Peso (kg)</label>
                <div className={`relative flex items-center ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  <Scale className="absolute left-4 w-5 h-5 text-slate-400" />
                  <input 
                    type="number"
                    value={formData.weight || ''}
                    onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
                    className={`w-full pl-12 pr-4 py-4 rounded-3xl border outline-none focus:border-red-600 transition-all font-bold ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}
                    placeholder="0.0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Altura (cm)</label>
                <div className={`relative flex items-center ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  <Ruler className="absolute left-4 w-5 h-5 text-slate-400" />
                  <input 
                    type="number"
                    value={formData.height || ''}
                    onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) })}
                    className={`w-full pl-12 pr-4 py-4 rounded-3xl border outline-none focus:border-red-600 transition-all font-bold ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </form>

          {/* Quick Info Card */}
          <div className={`p-6 rounded-[32px] border transition-colors duration-300 ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-red-50/50 border-red-100'}`}>
            <h4 className="text-xs font-black uppercase tracking-widest text-red-600 mb-2">Por que esses dados?</h4>
            <p className="text-xs text-slate-400 leading-relaxed font-medium">
              Utilizamos suas informações para calcular seu gasto calórico basal e ajustar as intensidades do seu treinamento de forma automática.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
