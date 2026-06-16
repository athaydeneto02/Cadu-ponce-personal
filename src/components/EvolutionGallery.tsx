/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Calendar, Plus, PlusCircle, Trash2, Maximize2, Columns, X } from 'lucide-react';
import { EvolutionPhoto } from '../types';
import { storage } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';

const MOCK_PHOTOS: EvolutionPhoto[] = [
  {
    id: 'p1',
    studentId: 'user123',
    photoURL: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80',
    date: '2026-05-12T10:00:00Z',
    notes: 'Início do projeto'
  },
  {
    id: 'p2',
    studentId: 'user123',
    photoURL: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800&q=80',
    date: '2026-06-12T10:00:00Z',
    notes: 'Após 1 mês de consultoria'
  }
];

export default function EvolutionGallery() {
  const [photos, setPhotos] = useState<EvolutionPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const fetched = await storage.fetchPhotos(authData.user.id);
        setPhotos(fetched.length > 0 ? fetched : MOCK_PHOTOS);
      } else {
        const saved = storage.getPhotos();
        setPhotos(saved.length > 0 ? saved : MOCK_PHOTOS);
      }
    })();
  }, []);

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const studentId = authData.user?.id ?? 'guest';

      const newPhoto: EvolutionPhoto = {
        id: Math.random().toString(36).substr(2, 9),
        studentId,
        photoURL: '',
        date: new Date().toISOString(),
        notes: 'Nova foto'
      };

      const publicUrl = await storage.savePhoto(newPhoto, file);
      const savedPhoto = { ...newPhoto, photoURL: publicUrl };
      setPhotos(prev => [savedPhoto, ...prev]);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedPhotos.includes(id)) {
      setSelectedPhotos(prev => prev.filter(p => p !== id));
    } else {
      if (selectedPhotos.length < 2) {
        setSelectedPhotos(prev => [...prev, id]);
      }
    }
  };

  const comparisonPhotos = photos.filter(p => selectedPhotos.includes(p.id))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold dark:text-white transition-colors">Evolução</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm font-medium transition-colors">Fotos de acompanhamento</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => {
              setIsComparisonMode(!isComparisonMode);
              setSelectedPhotos([]);
            }}
            className={`p-3 rounded-2xl border transition-all ${isComparisonMode ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-slate-400'}`}
          >
            <Columns className="w-5 h-5" />
          </button>
        <button 
            onClick={handleUpload}
            disabled={isUploading}
            className="bg-red-600 text-white px-5 py-3 rounded-2xl shadow-lg shadow-red-900/20 active:scale-95 transition-all flex items-center space-x-2 disabled:opacity-50"
          >
            <Camera className="w-5 h-5" />
            <span className="font-black italic uppercase tracking-tighter text-sm">CÂMERA</span>
          </button>
          {/* Hidden real file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {isComparisonMode && (
        <div className="mb-6 p-4 bg-red-600/5 border border-red-600/20 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
             <div className="w-8 h-8 bg-red-600 text-white rounded-lg flex items-center justify-center font-bold text-xs">
               {selectedPhotos.length}
             </div>
             <p className="text-sm font-bold text-red-600 italic uppercase tracking-tight">
               Selecione 2 fotos para comparar
             </p>
          </div>
          {selectedPhotos.length === 2 && (
            <button 
              onClick={() => setShowComparison(true)}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase italic tracking-widest shadow-lg shadow-red-600/30 active:scale-95 transition-all"
            >
              Comparar Agora
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {photos.map((photo, index) => {
          const isSelected = selectedPhotos.includes(photo.id);
          return (
            <motion.div 
              key={photo.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`group relative cursor-pointer`}
              onClick={() => isComparisonMode && toggleSelect(photo.id)}
            >
              <div className={`aspect-[3/4] bg-slate-200 dark:bg-slate-800 rounded-[32px] overflow-hidden shadow-sm border transition-all duration-300 ${isSelected ? 'ring-4 ring-red-600 ring-offset-4 dark:ring-offset-slate-950 scale-[0.98]' : 'border-gray-100 dark:border-slate-800'}`}>
                <img 
                  src={photo.photoURL} 
                  alt={`Evolução ${index + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                
                {isComparisonMode && (
                  <div className={`absolute top-4 left-4 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-red-600 border-red-600' : 'bg-white/20 backdrop-blur-md border-white/50'}`}>
                    {isSelected && <Plus className="w-4 h-4 text-white rotate-45" />}
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-slate-950/80 to-transparent">
                  <div className="flex items-center text-white space-x-2">
                    <Calendar className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black uppercase italic">
                      {new Date(photo.date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                
                {!isComparisonMode && (
                  <button className="absolute top-4 right-4 p-2.5 bg-slate-950/40 backdrop-blur-md rounded-xl text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {index > 0 && photos[index-1] && !isComparisonMode && (
                 <motion.div 
                   initial={{ y: 5 }}
                   animate={{ y: 0 }}
                   className="mt-3 text-center"
                 >
                   <span className="text-[10px] font-black text-white bg-red-600 px-3 py-1 rounded-full uppercase tracking-widest italic">+1kg massa</span>
                 </motion.div>
              )}
            </motion.div>
          );
        })}

        {isUploading && (
          <div className="aspect-[3/4] bg-slate-100 dark:bg-slate-900 rounded-[32px] border-2 border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center space-y-3 animate-pulse transition-colors">
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ENVIANDO...</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showComparison && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-950 flex flex-col"
          >
            <div className="h-20 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
              <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">
                Comparação <span className="text-red-600">Visual</span>
              </h2>
              <button 
                onClick={() => setShowComparison(false)}
                className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 flex items-center justify-center p-6 space-x-4">
              {comparisonPhotos.map((photo, i) => (
                <div key={photo.id} className="flex-1 max-w-md space-y-4">
                  <div className="text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">
                      {i === 0 ? 'Anterior' : 'Atual'}
                    </span>
                    <span className="text-sm font-bold text-white uppercase italic tracking-tighter">
                      {new Date(photo.date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="aspect-[3/4] rounded-[40px] overflow-hidden border-2 border-slate-800 shadow-2xl">
                    <img src={photo.photoURL} className="w-full h-full object-cover" />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 bg-slate-900 border-t border-slate-800">
               <div className="max-w-md mx-auto flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-red-600 tracking-widest block mb-1">Evolução Percebida</span>
                    <p className="text-sm text-slate-400 font-medium">Observe a melhora na postura e definição muscular.</p>
                  </div>
                  <div className="bg-red-600 px-6 py-2 rounded-2xl">
                    <span className="text-xl font-black italic text-white tracking-tighter">SUCESSO</span>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isComparisonMode && (
        <div className="mt-12 p-8 bg-slate-950 dark:bg-black rounded-[40px] text-white overflow-hidden relative shadow-2xl transition-colors">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center mb-6">
              <Maximize2 className="text-white w-6 h-6" />
            </div>
            <h3 className="text-xl font-black italic uppercase tracking-tighter mb-3">Dica do Cadu</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              Para fotos de evolução mais precisas, utilize sempre o mesmo local, iluminação e horário (preferencialmente em jejum).
            </p>
            <div className="flex space-x-2">
              <div className="w-1.5 h-1.5 bg-red-600 rounded-full"></div>
              <div className="w-1.5 h-1.5 bg-slate-800 rounded-full"></div>
              <div className="w-1.5 h-1.5 bg-slate-800 rounded-full"></div>
            </div>
          </div>
          <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-red-600/10 rounded-full blur-3xl"></div>
        </div>
      )}
    </div>
  );
}
