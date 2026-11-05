/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Play, TrendingUp, Calendar, Clock, ChevronRight, Activity, BarChart2, Scale, Plus, MessageSquare, Bell, Dumbbell, CheckCircle, DollarSign, Box, Check, AlertCircle, CreditCard, Copy, Trash2, Edit2, Maximize2, User as UserIcon, Loader2, X as CloseIcon } from 'lucide-react';
import { storage } from '../lib/storage';
import { Workout, UserProfile, Goal } from '../types';
import caduAvatar from '../assets/images/cadu_ponce_avatar.jpg';
import { supabase } from '../lib/supabase';
import LoadHistory from './LoadHistory';
import PersonalGoals from './PersonalGoals';
import WeeklyCalendar from './WeeklyCalendar';
import WorkoutList from './WorkoutList';
import { TRAINER_CONFIG } from '../lib/trainerConfig';
import { compressImage, useMediaUrl } from '../lib/mediaDb';
import { ensurePushSubscription } from '../lib/pushSubscription';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function PrivateImage({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = useMediaUrl(src);
  return <img {...props} src={resolved || undefined} />;
}

import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line
} from 'recharts';

interface DashboardProps {
  user: UserProfile | null;
  workouts: Workout[];
  onStartWorkout: (workout: Workout) => void;
  onUpdateUser?: (updated: UserProfile) => void;
}

const mockGoals: Goal[] = [];

const progressData: {name: string, load: number}[] = [];

const weeklyData: {day: string, load: number}[] = [];

export default function Dashboard({ user, workouts, onStartWorkout, onUpdateUser }: DashboardProps) {
  const currentWorkout = workouts[0]; // Suggest the first one

  const currentWeight = user?.weight || 82;
  const [weightHistory, setWeightHistory] = useState<{ week: string; peso: number }[]>(() => {
    const saved = storage.getCacheItem(`cadu_ponce_weight_history_${user?.uid || 'guest'}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback below
      }
    }
    // Fallback to empty array if no saved data
    return user?.weight ? [{ week: 'Semana 1', peso: user.weight }] : [];
  });

  const [newWeight, setNewWeight] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [pushStatus, setPushStatus] = useState<'unsupported' | 'needs-permission' | 'denied' | 'syncing' | 'ready' | 'error'>('unsupported');
  const [pushAttempt, setPushAttempt] = useState(0);

  // Sync the current weight from user profile to the final week if it changed
  React.useEffect(() => {
    if (user?.weight) {
      setWeightHistory(prev => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1] = { 
            ...updated[updated.length - 1], 
            peso: user.weight 
          };
        }
        storage.setCacheItem(`cadu_ponce_weight_history_${user.uid || 'guest'}`, JSON.stringify(updated));
        return updated;
      });
    }
  }, [user?.weight, user?.uid]);

  // Renew an existing permission silently; first consent requires a user click.
  React.useEffect(() => {
    let active = true;
    const userId = user?.uid;
    const isCurrent = () => active && storage.getUser()?.uid === userId;
    async function subscribeToPush() {
      if (!VAPID_PUBLIC_KEY || !userId || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushStatus('unsupported');
        return;
      }
      if (Notification.permission !== 'granted') {
        setPushStatus(Notification.permission === 'denied' ? 'denied' : 'needs-permission');
        return;
      }
      setPushStatus('syncing');
      try {
        const registration = await navigator.serviceWorker.ready;
        const status = await ensurePushSubscription({
          manager: registration.pushManager, publicKey: VAPID_PUBLIC_KEY,
          permission: Notification.permission, isCurrent,
          persist: async (subscription, previousEndpoint) => {
            if (!isCurrent()) throw new Error('A sessão mudou.');
            const { data: existing, error: lookupError } = await supabase.from('push_subscriptions')
              .select('id').eq('user_id', userId)
              .eq('subscription->>endpoint', previousEndpoint || subscription.endpoint).limit(1).maybeSingle();
            if (lookupError) throw lookupError;
            if (!isCurrent()) throw new Error('A sessão mudou.');
            const row = { user_id: userId, subscription: subscription.toJSON() };
            const result = existing
              ? await supabase.from('push_subscriptions').update(row).eq('id', existing.id).eq('user_id', userId).select('id').single()
              : await supabase.from('push_subscriptions').insert(row).select('id').single();
            if (result.error || !result.data?.id) throw new Error('Não foi possível salvar a inscrição.');
          },
        });
        if (isCurrent()) setPushStatus(status);
      } catch {
        if (isCurrent()) setPushStatus('error');
      }
    }
    void subscribeToPush();
    return () => { active = false; };
  }, [user?.uid, pushAttempt]);

  const enablePushNotifications = async () => {
    if (!('Notification' in window)) return;
    try {
      if (Notification.permission === 'default') await Notification.requestPermission();
      setPushAttempt(attempt => attempt + 1);
    } catch { setPushStatus('error'); }
  };

  const handleAddWeight = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(newWeight);
    if (!isNaN(parsed) && parsed > 0) {
      // 1. Update the user profile weight
      if (user && onUpdateUser) {
        onUpdateUser({
          ...user,
          weight: parsed
        });
      }

      // 2. Append/Update weight history list
      setWeightHistory(prev => {
        const updated = [
          { week: 'Semana 1', peso: prev[1]?.peso || parsed },
          { week: 'Semana 2', peso: prev[2]?.peso || parsed },
          { week: 'Semana 3', peso: prev[3]?.peso || parsed },
          { week: 'Semana 4', peso: parsed }
        ];
        storage.setCacheItem(`cadu_ponce_weight_history_${user?.uid || 'guest'}`, JSON.stringify(updated));
        return updated;
      });

      setNewWeight('');
      setIsUpdating(false);
    }
  };

  const [showFreqCalendar, setShowFreqCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date());

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    // Convert to Mon-first: Sun=6, Mon=0...
    const startOffset = (firstDay === 0 ? 6 : firstDay - 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { startOffset, daysInMonth };
  };

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const [showTreinosExtra, setShowTreinosExtra] = useState(false);
  const [showTreinos, setShowTreinos] = useState(false);
  const [treinosTab, setTreinosTab] = useState<'rotinas' | 'aerobico'>('rotinas');
  const [showMeuProgresso, setShowMeuProgresso] = useState(false);
  const [showAvaliacoes, setShowAvaliacoes] = useState(false);
  const [showFaturas, setShowFaturas] = useState(false);
  const [showArquivos, setShowArquivos] = useState(false);
  const [arquivosUploading, setArquivosUploading] = useState(false);
  const [arquivosError, setArquivosError] = useState('');
  const [arquivosSucesso, setArquivosSucesso] = useState('');


  // ── Meu Progresso ──
  const [progressPhotos, setProgressPhotos] = useState<any[]>([]);
  const [progressLoadingPhotos, setProgressLoadingPhotos] = useState(false);
  const [progressSelectedFile, setProgressSelectedFile] = useState<File | null>(null);
  const [progressPreview, setProgressPreview] = useState<string>('');
  const [progressComment, setProgressComment] = useState('');
  const [progressSending, setProgressSending] = useState(false);
  const [progressSendError, setProgressSendError] = useState('');
  const [progressEditingId, setProgressEditingId] = useState<string | null>(null);
  const [progressEditComment, setProgressEditComment] = useState('');
  const [progressLightbox, setProgressLightbox] = useState<string>('');

  useEffect(() => {
    if (!showMeuProgresso || !user?.uid) return;
    setProgressLoadingPhotos(true);
    storage.fetchPhotos(user.uid)
      .then(photos => setProgressPhotos(photos))
      .catch(() => setProgressPhotos(storage.getPhotos()))
      .finally(() => setProgressLoadingPhotos(false));
  }, [showMeuProgresso, user?.uid]);

  useEffect(() => {
    const refresh = () => setProgressPhotos(storage.getPhotos().filter(photo => photo.studentId === user?.uid));
    window.addEventListener('cadu_data_synced', refresh);
    return () => window.removeEventListener('cadu_data_synced', refresh);
  }, [user?.uid]);

  // Configurações de pagamento do personal (carregadas do Supabase)
  const [paymentSettings, setPaymentSettings] = useState<{
    pixKey: string; pixType: string; pixHolder: string;
    cardLink?: string; instructions?: string;
  }>({
    pixKey: '554384639369', pixType: 'Telefone', pixHolder: 'Carlos Eduardo Ponce',
    cardLink: '', instructions: 'Envie o comprovante no WhatsApp após realizar o pagamento.',
  });
  const [pixCopied, setPixCopied] = useState(false);

  useEffect(() => {
    storage.fetchPaymentSettings().then(cfg => setPaymentSettings(cfg as any));
  }, []);

  // Dias da semana atual com treino concluído (0=seg, 1=ter, ..., 6=dom)
  const [weekCompletedDays, setWeekCompletedDays] = useState<boolean[]>([false, false, false, false, false, false, false]);

  useEffect(() => {
    if (!user?.uid) return;
    // Calcula o início e fim da semana atual (segunda a domingo)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=dom, 1=seg..6=sab
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Carrega do cache local primeiro (instantâneo), depois do Supabase
    const localLogs = storage.getWorkoutLogs();
    const completed = new Array(7).fill(false);
    localLogs.forEach(log => {
      const d = new Date(log.completedAt);
      if (d >= monday && d <= sunday) {
        const dow = d.getDay(); // 0=dom
        const idx = dow === 0 ? 6 : dow - 1; // converte para 0=seg..6=dom
        completed[idx] = true;
      }
    });
    setWeekCompletedDays([...completed]);

    // Atualiza do Supabase em background
    storage.fetchWorkoutLogs(user.uid).then(logs => {
      const fresh = new Array(7).fill(false);
      logs.forEach(log => {
        const d = new Date(log.completedAt);
        if (d >= monday && d <= sunday) {
          const dow = d.getDay();
          const idx = dow === 0 ? 6 : dow - 1;
          fresh[idx] = true;
        }
      });
      setWeekCompletedDays([...fresh]);
    });
  }, [user?.uid]);

  if (showFreqCalendar) {
    const { startOffset, daysInMonth } = getDaysInMonth(calMonth);
    const cells: (number | null)[] = Array(startOffset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        {/* Voltar */}
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowFreqCalendar(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Frequência de Treinos</h2>

        {/* Calendar Card */}
        <div className="mx-4 bg-white rounded-xl shadow-xl p-5 mb-6">
          {/* Month nav */}
          <div className="flex items-start justify-between mb-6">
            <button
              onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="text-[#0070f3] flex items-center gap-1 text-sm font-semibold"
            >
              <ChevronRight className="w-4 h-4 rotate-180" /> Anterior
            </button>
            <div className="text-center">
              <p className="text-slate-800 font-bold text-lg leading-tight">{calMonth.getFullYear()}</p>
              <p className="text-slate-500 text-sm">{monthNames[calMonth.getMonth()]}</p>
            </div>
            <div className="w-20" /> {/* spacer */}
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Seg.','Ter.','Qua.','Qui.','Sex.','Sáb.','Dom.'].map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-slate-500">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => (
              <div key={i} className="flex items-center justify-center py-1">
                {day !== null ? (
                  <div className="w-9 h-9 rounded-full bg-[#f0f4f8] flex items-center justify-center text-slate-700 text-[13px] font-medium">
                    {day}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Ver ano completo */}
          <div className="text-right mt-4">
            <button className="text-[#0070f3] text-sm font-semibold">Ver ano completo</button>
          </div>
        </div>
      </div>
    );
  }

  if (showTreinosExtra) {
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        {/* Voltar */}
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowTreinosExtra(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Treinos Extra</h2>

        {/* Empty state card */}
        <div className="mx-4 bg-white rounded-xl shadow-xl flex flex-col items-center justify-center py-16 px-6">
          <div className="w-20 h-20 rounded-full bg-[#dbeafe] flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6M5 8.5A2.5 2.5 0 017.5 6h9A2.5 2.5 0 0119 8.5v9a2.5 2.5 0 01-2.5 2.5h-9A2.5 2.5 0 015 17.5v-9z" />
            </svg>
          </div>
          <p className="text-slate-800 font-bold text-[16px] text-center leading-snug">
            Seu professor ainda não adicionou<br />nenhum treino extra!
          </p>
        </div>
      </div>
    );
  }

  if (showTreinos) {
    return (
      <WorkoutList
        workouts={workouts}
        onSelectWorkout={onStartWorkout}
        trainerPhone={user?.trainerPhone}
        onBack={() => setShowTreinos(false)}
      />
    );
  }

  if (showMeuProgresso) {
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setProgressSelectedFile(file);
        try {
          // Comprime a imagem para 800px max a 80% qualidade garantindo tamanho leve (<80KB)
          const compressedBlob = await compressImage(file, 800, 0.8);
          const reader = new FileReader();
          reader.onloadend = () => {
            setProgressPreview(reader.result as string);
          };
          reader.readAsDataURL(compressedBlob);
        } catch {
          const reader = new FileReader();
          reader.onloadend = () => {
            setProgressPreview(reader.result as string);
          };
          reader.readAsDataURL(file);
        }
      }
    };

    const handleSendProgress = async () => {
      if (!progressPreview || !user?.uid) return;
      setProgressSending(true);
      setProgressSendError('');
      try {
        const photoId = crypto.randomUUID();
        const newPhoto = {
          id: photoId,
          studentId: user.uid,
          studentName: user.name || 'Aluno',
          photoURL: progressPreview,
          notes: progressComment.trim() || undefined,
          date: new Date().toISOString(),
        };

        const photoURL = await storage.savePhoto(newPhoto, progressSelectedFile || undefined);
        const savedPhoto = storage.getPhotos().find(photo => photo.id === photoId) ?? { ...newPhoto, photoURL };
        setProgressPhotos(prev => [savedPhoto, ...prev.filter(photo => photo.id !== photoId)]);
        if ('syncStatus' in savedPhoto && savedPhoto.syncStatus === 'pending') {
          setProgressSendError('Foto salva neste dispositivo. O envio será retomado quando a conexão estiver disponível.');
        }
        setProgressSelectedFile(null);
        setProgressPreview('');
        setProgressComment('');
      } catch (err: any) {
        console.error('Erro ao enviar foto de progresso:', err);
        setProgressSendError('Não foi possível salvar a foto. Tente novamente; sua seleção foi mantida.');
      } finally {
        setProgressSending(false);
      }
    };

    const handleDeleteProgressPhoto = async (photoId: string) => {
      if (!window.confirm('Tem certeza que deseja excluir esta foto de progresso?')) return;
      try {
        await storage.deletePhoto(photoId);
      } catch (err) {
        setProgressSendError('Não foi possível excluir a foto. Tente novamente.');
        return;
      }
      const updated = progressPhotos.filter(p => p.id !== photoId);
      setProgressPhotos(updated);
      storage.setCacheItem('cadu_ponce_photos', JSON.stringify(updated));
    };

    const handleSaveEditComment = async (photoId: string) => {
      try {
        await storage.updatePhotoNotes(photoId, progressEditComment.trim());
        const updatedList = progressPhotos.map(p => p.id === photoId ? { ...p, notes: progressEditComment.trim() } : p);
        setProgressPhotos(updatedList);
      } catch (err) {
        console.warn('Erro ao atualizar comentário:', err);
        setProgressSendError('Não foi possível salvar o comentário. Tente novamente.');
        return;
      }
      setProgressEditingId(null);
      setProgressEditComment('');
    };

    const formatDateTime = (dateStr: string) => {
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return { date: `${day}/${month}/${year}`, time: `${hours}:${mins}` };
      } catch {
        return { date: dateStr, time: '' };
      }
    };

    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        {/* Voltar */}
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowMeuProgresso(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-bold px-4 pb-3">Meu Progresso</h2>

        <div className="px-4 space-y-4 pb-12">
          {/* Modal / Card de Envio se tiver foto selecionada */}
          {progressPreview ? (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden p-4 space-y-4 border border-slate-100">
              {/* Preview da foto */}
              <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center max-h-[380px]">
                <img src={progressPreview} alt="Foto selecionada" className="w-full h-auto max-h-[380px] object-contain" />
              </div>

              {/* Botão Trocar foto */}
              <div className="flex justify-center">
                <label className="text-[#0070f3] hover:text-[#005ccc] font-bold text-sm cursor-pointer py-1">
                  Trocar foto
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </label>
              </div>

              {/* Comentário */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-slate-800 font-bold text-sm">Escreva um comentário</label>
                  <span className="text-slate-400 text-xs font-semibold">{progressComment.length}/255</span>
                </div>
                <textarea
                  value={progressComment}
                  onChange={(e) => setProgressComment(e.target.value.slice(0, 255))}
                  placeholder="Ex: Treino concluído com foco total, me sentindo mais definido..."
                  rows={3}
                  className="w-full rounded-xl border border-sky-300 focus:border-[#0070f3] focus:ring-2 focus:ring-sky-100 p-3 text-sm text-slate-800 outline-none resize-none transition"
                />
              </div>

              {progressSendError && (
                <p className="text-red-600 text-xs font-semibold">{progressSendError}</p>
              )}

              {/* Botões Enviar e Fechar */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleSendProgress}
                  disabled={progressSending}
                  className="w-full bg-[#0070f3] hover:bg-[#005ccc] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl shadow-md transition text-sm flex items-center justify-center gap-2"
                >
                  {progressSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar'
                  )}
                </button>
                <button
                  onClick={() => {
                    setProgressPreview('');
                    setProgressSelectedFile(null);
                    setProgressComment('');
                  }}
                  disabled={progressSending}
                  className="w-full bg-white hover:bg-slate-50 border border-sky-300 text-[#0070f3] font-bold py-3.5 rounded-xl transition text-sm"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            /* Botão Enviar Foto estilizado conforme MFIT */
            <label className="w-full bg-white hover:bg-slate-50 border-2 border-[#0070f3] rounded-2xl p-4 flex items-center justify-center gap-2 cursor-pointer transition shadow-sm group">
              <Plus className="w-5 h-5 text-[#0070f3] stroke-[2.5]" />
              <span className="text-[#0070f3] font-bold text-base">Enviar foto</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </label>
          )}

          {/* Histórico / Feed de Fotos do Aluno */}
          {progressLoadingPhotos ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/60 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#0070f3]" />
              <span className="text-xs">Carregando fotos...</span>
            </div>
          ) : progressPhotos.length === 0 && !progressPreview ? (
            <div className="bg-white rounded-2xl shadow-md p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-[#dbeafe] flex items-center justify-center mx-auto text-[#0070f3]">
                <Activity className="w-8 h-8" />
              </div>
              <p className="text-slate-800 font-bold text-base">Nenhuma foto enviada ainda</p>
              <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                Tire fotos do seu corpo e envie para o professor Cadu acompanhar sua evolução e evolução de cargas!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {progressPhotos.map((photo) => {
                const dt = formatDateTime(photo.date);
                const isEditing = progressEditingId === photo.id;

                return (
                  <div key={photo.id} className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">
                    {/* Header do Card: Data, Hora e Lixeira */}
                    <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                      <div className="flex items-center gap-2 text-slate-700 text-xs font-bold">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{typeof dt === 'object' ? dt.date : dt}</span>
                        {typeof dt === 'object' && dt.time && (
                          <>
                            <Clock className="w-3.5 h-3.5 text-slate-400 ml-1" />
                            <span>{dt.time}</span>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteProgressPhoto(photo.id)}
                        className="text-red-500 hover:text-red-700 p-1 transition"
                        title="Excluir foto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Foto */}
                    <div className="relative bg-slate-950 flex items-center justify-center max-h-[440px] overflow-hidden">
                      <PrivateImage
                        src={photo.photoURL}
                        alt="Foto de progresso"
                        className="w-full h-auto max-h-[440px] object-contain cursor-pointer"
                        onClick={() => setProgressLightbox(photo.photoURL)}
                      />
                    </div>
                    {photo.syncStatus === 'pending' && <p role="status" className="px-4 py-2 text-xs text-amber-700">Salva no dispositivo · envio pendente</p>}

                    {/* Botão Ampliar foto */}
                    <div className="py-2 text-center border-b border-slate-100">
                      <button
                        onClick={() => setProgressLightbox(photo.photoURL)}
                        className="text-[#0070f3] hover:underline text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        Ampliar foto
                      </button>
                    </div>

                    {/* Bloco de Comentário com Avatar */}
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-500 overflow-hidden">
                          {user?.photoURL ? (
                            <PrivateImage src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                          ) : (
                            <UserIcon className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 font-bold text-sm leading-tight">{user?.name || 'Aluno'}</p>

                          {isEditing ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                value={progressEditComment}
                                onChange={(e) => setProgressEditComment(e.target.value)}
                                rows={2}
                                className="w-full rounded-lg border border-[#0070f3] p-2 text-xs text-slate-800 outline-none resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveEditComment(photo.id)}
                                  className="px-3 py-1 bg-[#0070f3] text-white rounded-md text-xs font-bold"
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => setProgressEditingId(null)}
                                  className="px-3 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-bold"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-slate-700 text-xs mt-1 leading-relaxed break-words">
                              {photo.notes || <span className="text-slate-400 italic">Sem comentário</span>}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 font-medium">
                            <span>{typeof dt === 'object' ? `${dt.date} ${dt.time}` : dt}</span>
                            <span>•</span>
                            <button
                              onClick={() => {
                                setProgressEditingId(photo.id);
                                setProgressEditComment(photo.notes || '');
                              }}
                              className="text-[#0070f3] hover:underline font-bold"
                            >
                              Editar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal de Zoom / Lightbox */}
        {progressLightbox && (
          <div
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
            onClick={() => setProgressLightbox('')}
          >
            <button
              onClick={() => setProgressLightbox('')}
              className="absolute top-4 right-4 text-white hover:text-slate-300 p-2"
            >
              <CloseIcon className="w-7 h-7" />
            </button>
            <PrivateImage
              src={progressLightbox}
              alt="Foto ampliada"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    );
  }

  if (showAvaliacoes) {
    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowAvaliacoes(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Suas Avaliações</h2>
        <div className="mx-4 bg-white rounded-xl shadow-xl flex flex-col items-center justify-center py-16 px-6">
          <div className="w-20 h-20 rounded-full bg-[#dbeafe] flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4" />
            </svg>
          </div>
          <p className="text-slate-800 font-bold text-[16px] text-center leading-snug">
            Seu professor ainda não disponibilizou nenhuma avaliação
          </p>
        </div>
      </div>
    );
  }


  if (showFaturas) {
    const handleCopyPix = () => {
      navigator.clipboard.writeText(paymentSettings.pixKey).then(() => {
        setPixCopied(true);
        setTimeout(() => setPixCopied(false), 2500);
      }).catch(() => {
        // fallback para mobile
        const el = document.createElement('textarea');
        el.value = paymentSettings.pixKey;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setPixCopied(true);
        setTimeout(() => setPixCopied(false), 2500);
      });
    };

    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowFaturas(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-bold px-4 pb-4">Formas de Pagamento</h2>

        <div className="px-4 space-y-4 pb-8">

          {/* Card PIX */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-[#0070f3] to-[#005cc5] px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                {/* Ícone PIX */}
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.05 4.652a3.394 3.394 0 0 0-2.406.996l-2.116 2.116a1.13 1.13 0 0 1-1.598 0L8.82 5.648a3.394 3.394 0 0 0-2.406-.996H5.3l3.652 3.651a3.18 3.18 0 0 0 4.496 0l3.652-3.651h-2.054ZM5.3 19.348a3.394 3.394 0 0 0 2.406-.996l2.116-2.116a1.13 1.13 0 0 1 1.598 0l2.116 2.116a3.394 3.394 0 0 0 2.406.996h2.054l-3.652-3.651a3.18 3.18 0 0 0-4.496 0L5.3 19.348Z"/>
                  <path d="M4.652 6.95a3.394 3.394 0 0 0-.996 2.406v5.288a3.394 3.394 0 0 0 .996 2.406l.996-.996V9.356L4.652 6.95Zm14.696 0-.996 2.406v6.698l.996.996a3.394 3.394 0 0 0 .996-2.406V9.356a3.394 3.394 0 0 0-.996-2.406Z"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-black text-[15px]">PIX</p>
                <p className="text-white/75 text-[11px]">Transferência instantânea</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider mb-1">Tipo de chave</p>
                <p className="text-slate-800 font-bold text-[15px]">{paymentSettings.pixType}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider mb-1">Chave PIX</p>
                <div className="flex items-center gap-2">
                  <p className="text-slate-800 font-bold text-[15px] flex-1 break-all">{paymentSettings.pixKey}</p>
                  <button
                    onClick={handleCopyPix}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold transition-all ${
                      pixCopied
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-[#0070f3] text-white active:scale-95'
                    }`}
                  >
                    {pixCopied ? (
                      <><Check className="w-3.5 h-3.5" /> Copiado!</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> Copiar</>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider mb-1">Titular</p>
                <p className="text-slate-800 font-medium text-[14px]">{paymentSettings.pixHolder}</p>
              </div>
            </div>
          </div>

          {/* Card Cartão de Crédito */}
          {paymentSettings.cardLink ? (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-black text-[15px]">Cartão de Crédito</p>
                  <p className="text-white/75 text-[11px]">Parcelamento disponível</p>
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-slate-500 text-[13px] mb-3">Clique no botão abaixo para ser redirecionado ao link de pagamento seguro.</p>
                <a
                  href={paymentSettings.cardLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 text-white font-bold text-[14px] rounded-xl py-3 active:scale-95 transition-all"
                >
                  <CreditCard className="w-4 h-4" /> Pagar com Cartão
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-black text-[15px]">Cartão de Crédito</p>
                  <p className="text-white/75 text-[11px]">Parcelamento disponível</p>
                </div>
              </div>
              <div className="px-5 py-4 flex flex-col items-center py-6">
                <p className="text-slate-400 text-[13px] text-center">Pagamento via cartão em breve. Entre em contato com seu professor.</p>
              </div>
            </div>
          )}

          {/* Instrução do personal */}
          {paymentSettings.instructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex gap-3">
              <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-800 text-[13px] font-medium leading-snug">{paymentSettings.instructions}</p>
            </div>
          )}

          {/* Contato WhatsApp */}
          <a
            href={`https://wa.me/${TRAINER_CONFIG.phone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[14px] rounded-xl py-3.5 shadow-md active:scale-95 transition-all"
          >
            <MessageSquare className="w-4 h-4" /> Falar com o Professor
          </a>
        </div>
      </div>
    );
  }

  if (showArquivos) {
    const categories = [
      { label: 'Planos alimentares', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h.01M12 3v1M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zM9 12a3 3 0 006 0" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 19l2-5h10l2 5" />
        </svg>
      )},
      { label: 'Exames médicos', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0 3.314-3.134 6-7 6s-7-2.686-7-6 3.134-6 7-6c1.94 0 3.694.757 4.97 1.984" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l1.5-1.5M18 6l-1.5 1.5M12 9v3l2 1" />
        </svg>
      )},
      { label: 'Planners', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M9 21V9" />
        </svg>
      )},
      { label: 'Arquivos diversos', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )},
    ];

    const handleArquivosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files: File[] = Array.from(e.currentTarget.files ?? []);
      if (!files.length) return;
      if (!user?.uid) {
        setArquivosError('Você precisa estar logado para enviar arquivos.');
        return;
      }

      setArquivosUploading(true);
      setArquivosError('');
      setArquivosSucesso('');

      let successCount = 0;
      const errors: string[] = [];

      for (const file of files) {
        try {
          const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
            'application/msword', 'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'video/mp4', 'video/quicktime'];
          if (!allowedTypes.includes(file.type)) {
            errors.push(`${file.name}: formato não suportado. Use JPG, PNG, WebP, PDF, DOC, DOCX, XLS, XLSX, TXT, MP4 ou MOV.`);
            continue;
          }
          if (file.size > 20 * 1024 * 1024) {
            errors.push(`${file.name}: o limite é 20 MB por arquivo.`);
            continue;
          }
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = `${user.uid}/${Date.now()}_${safeName}`;

          const { error: uploadError } = await supabase.storage
            .from('arquivos-alunos')
            .upload(filePath, file, { upsert: false });

          if (uploadError) {
            errors.push(`${file.name}: ${uploadError.message}`);
            continue;
          }

          // Registra o envio na tabela agenda_events para notificar o admin
          const { error: recordError } = await supabase.from('agenda_events').insert({
            id: crypto.randomUUID(),
            student_id: user.uid,
            student_name: user.name || 'Aluno',
            title: `Arquivo enviado: ${file.name}`,
            date: new Date().toISOString().split('T')[0],
            start_time: new Date().toISOString().substring(11, 16),
            end_time: new Date().toISOString().substring(11, 16),
            type: 'student_file',
            notes: JSON.stringify({ fileName: file.name, filePath, fileSize: file.size, fileType: file.type }),
          });
          if (recordError) {
            await supabase.storage.from('arquivos-alunos').remove([filePath]);
            errors.push(`${file.name}: não foi possível registrar o envio. Tente novamente.`);
            continue;
          }

          successCount++;
        } catch (err: any) {
          errors.push(`${file.name}: erro inesperado`);
        }
      }

      setArquivosUploading(false);

      if (successCount > 0) {
        setArquivosSucesso(`✅ ${successCount} arquivo${successCount > 1 ? 's' : ''} enviado${successCount > 1 ? 's' : ''} com sucesso!`);
      }
      if (errors.length > 0) {
        setArquivosError(`Erro ao enviar: ${errors.join('; ')}`);
      }

      // Limpa o input
      e.target.value = '';
    };

    return (
      <div className="flex flex-col min-h-full bg-[#1c2b3e]">
        <div className="px-4 pt-4 pb-2">
          <button onClick={() => setShowArquivos(false)} className="flex items-center gap-1 text-white/80 text-sm font-medium hover:text-white transition">
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        </div>
        <h2 className="text-white text-xl font-semibold px-4 pb-4">Arquivos</h2>

        <div className="mx-4 bg-white rounded-xl shadow-xl overflow-hidden">
          {/* Icon + headline */}
          <div className="flex flex-col items-center pt-8 pb-4 px-6">
            <div className="w-16 h-16 rounded-full bg-[#dbeafe] flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[#0070f3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <p className="text-slate-800 font-bold text-[16px] text-center leading-snug">
              Envie <span className="text-[#0070f3]">arquivos</span> para o seu professor!
            </p>
          </div>

          {/* Category list */}
          <div className="divide-y divide-slate-100 px-4 pb-2">
            {categories.map((cat, i) => (
              <div key={i} className="flex items-center gap-4 py-4">
                <div className="w-10 h-10 rounded-full bg-[#eff6ff] flex items-center justify-center shrink-0">
                  {cat.icon}
                </div>
                <span className="text-slate-700 font-medium text-sm">{cat.label}</span>
              </div>
            ))}
          </div>

          {/* Feedback */}
          {arquivosSucesso && (
            <div className="mx-4 mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 text-sm font-medium">{arquivosSucesso}</p>
            </div>
          )}
          {arquivosError && (
            <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm font-medium">{arquivosError}</p>
            </div>
          )}

          {/* Button */}
          <div className="px-4 pb-6 pt-2">
            <label className={`w-full text-white font-semibold py-3.5 rounded-md flex items-center justify-center cursor-pointer transition text-sm gap-2 ${arquivosUploading ? 'bg-[#0070f3]/60 cursor-not-allowed' : 'bg-[#0070f3] hover:bg-[#005ccc] active:scale-95'}`}>
              {arquivosUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Adicionar arquivos
                </>
              )}
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.mp4,.mov"
                disabled={arquivosUploading}
                onChange={handleArquivosUpload}
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-[#F4F6FA] overflow-y-auto">
      {/* Header Extension (Dark Blue) */}
      <div className="bg-[#1c2b3e] px-4 pt-4 pb-8 flex flex-col items-center">
        {/* Avatar and Info */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#0070f3] mb-2 bg-slate-400">
            <img 
              src={caduAvatar} 
              alt="Cadu Ponce" 
              className="w-full h-full object-cover"
            />
          </div>
          <h2 className="text-white text-sm font-medium">Cadu Ponce</h2>
          <p className="text-slate-400 text-xs">CREF: 044859-G\PR</p>
        </div>

        {/* Greeting */}
        <div className="w-full mt-6 text-left">
          <h1 className="text-white text-xl font-medium">Boa noite, {user?.name?.split(' ')[0] || 'Aluno'}!</h1>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4 pb-6">
        {pushStatus !== 'unsupported' && (
          <div className="bg-white rounded-xl shadow-sm p-3 relative z-10 flex items-center gap-3 text-sm">
            <Bell aria-hidden="true" className="w-5 h-5 text-slate-500 shrink-0" />
            <p role="status" className="flex-1 text-slate-600">
              {pushStatus === 'ready' ? 'Notificações ativadas neste dispositivo.' : pushStatus === 'syncing' ? 'Atualizando notificações...' : pushStatus === 'denied' ? 'Notificações bloqueadas nas permissões do navegador.' : pushStatus === 'error' ? 'Não foi possível ativar as notificações.' : 'Receba avisos do personal neste dispositivo.'}
            </p>
            {(pushStatus === 'needs-permission' || pushStatus === 'error') && <button type="button" onClick={() => { void enablePushNotifications(); }} className="font-semibold text-blue-700">{pushStatus === 'error' ? 'Tentar novamente' : 'Ativar'}</button>}
          </div>
        )}
        {/* Frequência de Treinos */}
        <button
          onClick={() => setShowFreqCalendar(true)}
          className="w-full bg-white rounded-xl shadow-sm p-4 relative z-10 text-left"
        >
          <h3 className="text-slate-800 font-bold text-[15px] mb-4">Frequência de Treinos</h3>
          <div className="flex justify-between items-center px-1">
            {(['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const).map((day, i) => {
              const today = new Date();
              const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=seg..6=dom
              const isDone = weekCompletedDays[i];
              const isToday = i === todayIdx;
              const isPendingToday = isToday && !isDone;
              return (
                <div key={i} className="flex flex-col items-center gap-2">
                  {isDone ? (
                    // ✓ Treino concluído — círculo azul preenchido com check
                    <div className="w-8 h-8 rounded-full bg-[#0070f3] flex items-center justify-center shadow-sm">
                      <Check className="w-4 h-4 text-white stroke-[3]" />
                    </div>
                  ) : isPendingToday ? (
                    // ! Hoje pendente — círculo vermelho com exclamação
                    <div className="w-8 h-8 rounded-full border-2 border-red-500 bg-red-50 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    </div>
                  ) : (
                    // Dia sem treino / futuro — círculo vazio azul
                    <div className="w-8 h-8 rounded-full border-2 border-[#0070f3] flex items-center justify-center" />
                  )}
                  <span className={`text-[10px] font-bold ${isToday ? 'text-[#0070f3]' : 'text-slate-400'}`}>{day}</span>
                </div>
              );
            })}
          </div>
        </button>


        {/* Grid de Botões */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={() => { setShowTreinos(true); setTreinosTab('rotinas'); }}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Dumbbell className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Treinos</span>
          </button>
          
          <button
            onClick={() => setShowTreinosExtra(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Treinos<br/>Extras</span>
          </button>
          
          <button
            onClick={() => setShowAvaliacoes(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Avaliações</span>
          </button>
          
          <button
            onClick={() => setShowMeuProgresso(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Meu<br/>Progresso</span>
          </button>
          
          <button
            onClick={() => setShowFaturas(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Pagamento</span>
          </button>
          
          <button
            onClick={() => setShowArquivos(true)}
            className="bg-[#2c405a] hover:bg-[#233348] transition rounded-xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#0070f3] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Box className="w-5 h-5" />
            </div>
            <span className="text-white font-medium text-sm leading-tight">Arquivos</span>
          </button>
        </div>
      </div>
    </div>
  );
}
