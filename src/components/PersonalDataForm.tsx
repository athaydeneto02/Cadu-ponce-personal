import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { UserProfile } from '../types';
import { storage } from '../lib/storage';
import { useMediaUrl } from '../lib/mediaDb';

interface PersonalDataFormProps {
  user: UserProfile | null;
  onSave: (updatedUser: UserProfile) => Promise<void> | void;
  onClose: () => void;
  isDark?: boolean;
}

export default function PersonalDataForm({ user, onSave, onClose }: PersonalDataFormProps) {
  const nameParts = (user?.name || '').split(' ');
  const defaultFirstName = nameParts[0] || '';
  const defaultLastName = nameParts.slice(1).join(' ') || '';

  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const email = user?.email || '';
  
  // Student's own metadata
  const [whatsapp, setWhatsapp] = useState(user?.metadata?.phone || '');
  
  // Instagram
  // Note: For the admin, their instagram is in metadata.instagram too.
  const [instagram, setInstagram] = useState(user?.metadata?.instagram || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoReference, setPhotoReference] = useState(user?.photoURL || '');
  const [photoPreview, setPhotoPreview] = useState('');
  const resolvedPhoto = useMediaUrl(photoReference);
  const saveLock = useRef(false);
  useEffect(() => {
    if (!photoFile) { setPhotoPreview(''); return; }
    const url = URL.createObjectURL(photoFile); setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || saveLock.current) return;
    saveLock.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      let photoURL = photoReference;
      if (photoFile) {
        photoURL = await storage.uploadProfilePhoto(user.uid, photoFile);
        setPhotoReference(photoURL); setPhotoFile(null);
      }
      await onSave({
        ...user,
        name: `${firstName} ${lastName}`.trim(),
        photoURL: photoURL || undefined,
        metadata: {
          ...user.metadata,
          phone: whatsapp,
          instagram: instagram
        }
      } as UserProfile);
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'Não foi possível salvar seus dados. Verifique a conexão e tente novamente.');
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#1c2b3e]">
      {/* Header Section */}
      <div className="pt-6 px-4 pb-8 shrink-0">
        <button 
          disabled={isSaving}
          onClick={onClose} 
          className="flex items-center text-white/80 text-sm font-medium hover:text-white transition mb-6"
        >
          <ChevronLeft className="w-5 h-5 -ml-1" /> Voltar
        </button>
        <h1 className="text-white text-[22px] font-normal">Seus dados</h1>
      </div>

      {/* Form Container */}
      <div className="bg-white flex-1 rounded-t-xl px-4 pt-6 pb-20 shadow-[0_-8px_20px_rgba(0,0,0,0.1)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
          <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
            {(photoPreview || resolvedPhoto) && <img src={photoPreview || resolvedPhoto} alt="Sua foto de perfil" className="w-16 h-16 rounded-full object-cover" />}
            <label className="text-sm font-semibold text-blue-700 cursor-pointer">Alterar foto
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={isSaving} className="block mt-2 text-xs max-w-[210px]" onChange={event => {
                const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { setSaveError('Escolha uma imagem JPG, PNG ou WebP de até 20 MB.'); return; }
                setSaveError(''); setPhotoFile(file);
              }} />
            </label>
          </div>
          
          {/* Nome */}
          <div className="space-y-1.5">
            <label htmlFor="profile-first-name" className="text-[13px] font-bold text-slate-800">Nome</label>
            <input 
              id="profile-first-name"
              required
              autoComplete="given-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full bg-[#f8fafc] border border-slate-200 rounded-lg px-3 py-2.5 text-[15px] text-slate-700 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Sobrenome */}
          <div className="space-y-1.5">
            <label htmlFor="profile-last-name" className="text-[13px] font-bold text-slate-800">Sobrenome</label>
            <input 
              id="profile-last-name"
              autoComplete="family-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full bg-[#f8fafc] border border-slate-200 rounded-lg px-3 py-2.5 text-[15px] text-slate-700 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <label htmlFor="profile-email" className="text-[13px] font-bold text-slate-800">E-mail de acesso</label>
            <input 
              id="profile-email"
              type="email"
              value={email}
              readOnly
              aria-describedby="profile-email-help"
              className="w-full bg-[#f8fafc] border border-slate-200 rounded-lg px-3 py-2.5 text-[15px] text-slate-700 outline-none focus:border-blue-500 transition-colors"
            />
            <p id="profile-email-help" className="text-xs text-slate-600">Para trocar seu e-mail de acesso, entre em contato com o personal.</p>
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <label htmlFor="profile-phone" className="text-[13px] font-bold text-slate-800">WhatsApp</label>
            <div className="w-full bg-[#f8fafc] border border-slate-200 rounded-lg px-3 py-2.5 flex items-center focus-within:border-blue-500 transition-colors">
              <div className="flex items-center gap-1 pr-2 border-r border-slate-200 mr-2 shrink-0">
                <span className="text-lg leading-none">🇧🇷</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </div>
              <input 
                id="profile-phone"
                type="tel"
                autoComplete="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="flex-1 text-[15px] text-slate-700 outline-none bg-transparent w-full"
                placeholder="+55 (00) 00000-0000"
              />
            </div>
          </div>

          {/* Instagram */}
          <div className="space-y-1.5">
            <label htmlFor="profile-instagram" className="text-[13px] font-bold text-slate-800">Instagram</label>
            <input 
              id="profile-instagram"
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              className="w-full bg-[#f8fafc] border border-slate-200 rounded-lg px-3 py-2.5 text-[15px] text-slate-700 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-[#0070f3] text-white font-medium py-3 rounded-lg mt-8 active:scale-[0.98] transition-transform"
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>

        </form>
      </div>
    </div>
  );
}
