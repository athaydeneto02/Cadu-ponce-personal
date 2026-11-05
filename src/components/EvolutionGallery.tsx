import React, { useState, useEffect, useRef } from 'react';
import { Camera, Calendar, Plus, PlusCircle, Trash2, Maximize2, Columns, X } from 'lucide-react';
import { EvolutionPhoto } from '../types';
import { storage } from '../lib/storage';
import { motion, AnimatePresence } from 'motion/react';
import { useMediaUrl } from '../lib/mediaDb';

// Componente auxiliar para resolver URLs idb: ou http normalmente
function PhotoImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const resolved = useMediaUrl(src);
  return <img src={resolved || undefined} alt={alt} className={className} />;
}

export default function EvolutionGallery() {
  const [photos, setPhotos] = useState<EvolutionPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const studentId = storage.getUser()?.uid;
      if (!studentId) return;
      try {
        const fetched = await storage.fetchPhotos(studentId);
        if (active) setPhotos(fetched);
      } catch {
        if (active) setPhotos(storage.getPhotos().filter(photo => photo.studentId === studentId));
      }
    };
    void refresh();
    window.addEventListener('cadu_data_synced', refresh);
    return () => {
      active = false;
      window.removeEventListener('cadu_data_synced', refresh);
    };
  }, []);

  const handleUpload = () => {
    setUploadError(null);

    const studentId = storage.getUser()?.uid;
    if (!studentId) {
      setUploadError('Entre na sua conta para salvar uma foto.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const studentId = storage.getUser()?.uid;
    if (!studentId) {
      setUploadError('Entre na sua conta para salvar uma foto.');
      return;
    }

    setUploadError(null);

    // 1. Cria URL local instantânea — foto aparece na tela imediatamente
    const previewUrl = URL.createObjectURL(file);
    const tempId = crypto.randomUUID();

    const tempPhoto: EvolutionPhoto = {
      id: tempId,
      studentId,
      photoURL: previewUrl,
      date: new Date().toISOString(),
      notes: 'Nova foto',
      syncStatus: 'pending',
    };

    // Adiciona a foto na tela agora mesmo (preview local)
    setPhotos(prev => [tempPhoto, ...prev]);
    setIsUploading(true);

    // 2. Faz o upload em background (não bloqueia a UI)
    try {
      const finalUrl = await storage.savePhoto(tempPhoto, file);

      const saved = storage.getPhotos().find(photo => photo.id === tempId);
      setPhotos(prev => prev.map(photo => photo.id === tempId ? (saved ?? { ...tempPhoto, photoURL: finalUrl }) : photo));
      if (saved?.syncStatus === 'pending') setUploadError('Foto salva neste dispositivo. O envio será retomado quando a conexão estiver disponível.');
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setPhotos(prev => prev.filter(photo => photo.id !== tempId));
      setUploadError('Não foi possível salvar a foto. Selecione o arquivo novamente para tentar outra vez.');
    } finally {
      URL.revokeObjectURL(previewUrl);
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
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Banner de erro de upload */}
      {uploadError && (
        <div className="mb-4 p-4 bg-red-600/10 border border-red-600/30 rounded-2xl flex items-center justify-between">
          <p className="text-sm font-bold text-red-600">{uploadError}</p>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
                <PhotoImage
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
                  {photo.syncStatus === 'pending' && <p className="text-xs text-amber-200 mt-1">Salva no dispositivo · envio pendente</p>}
                </div>
                
                {!isComparisonMode && (
                  <button className="absolute top-4 right-4 p-2.5 bg-slate-950/40 backdrop-blur-md rounded-xl text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}
              </div>
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
                    <PhotoImage src={photo.photoURL} alt="Foto de evolução para comparação" className="w-full h-full object-cover" />
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
