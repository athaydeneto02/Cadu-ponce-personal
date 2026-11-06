/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Play, TrendingUp, Calendar, Clock, ChevronRight, Activity, BarChart2, Scale, Plus, MessageSquare, Bell, Dumbbell, CheckCircle, DollarSign, Box, Check, AlertCircle, CreditCard, Copy, Trash2, Edit2, Maximize2, User as UserIcon, Loader2, X as CloseIcon } from 'lucide-react';
import { storage } from '../lib/storage';
import { Workout, UserProfile } from '../types';
import StudentHome from './StudentHome';
import { supabase } from '../lib/supabase';

import { useWorkoutFrequency } from '../lib/useWorkoutFrequency';
import { localWorkoutDateKey } from '../lib/workoutFrequency';
import WorkoutList from './WorkoutList';
import { TRAINER_CONFIG, getTrainerWhatsAppUrl } from '../lib/trainerConfig';
import StudentFiles from './StudentFiles';
import StudentAssessments from './StudentAssessments';
import StudentAnamneses from './StudentAnamneses';
import StudentAgenda from './StudentAgenda';
import { compressImage, useMediaUrl } from '../lib/mediaDb';
import { ensurePushSubscription } from '../lib/pushSubscription';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function PrivateImage({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = useMediaUrl(src);
  return <img {...props} src={resolved || undefined} />;
}

interface DashboardProps {
  user: UserProfile | null;
  workouts: Workout[];
  onStartWorkout: (workout: Workout) => void;
  onUpdateUser?: (updated: UserProfile) => void;
  resetKey?: number;
}

export default function Dashboard({ user, workouts, onStartWorkout, onUpdateUser, resetKey = 0 }: DashboardProps) {
  const [pushStatus, setPushStatus] = useState<'unsupported' | 'needs-permission' | 'denied' | 'syncing' | 'ready' | 'error'>('unsupported');
  const [pushAttempt, setPushAttempt] = useState(0);

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

  const [showFreqCalendar, setShowFreqCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date());
  const frequency = useWorkoutFrequency(user?.uid, calMonth, showFreqCalendar);

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


  // ── Meu Progresso ──
  const [progressPhotos, setProgressPhotos] = useState<any[]>([]);
  const [progressLoadingPhotos, setProgressLoadingPhotos] = useState(false);
  const [progressSelectedFile, setProgressSelectedFile] = useState<File | null>(null);
  const [progressPreview, setProgressPreview] = useState<string>('');
  const [progressComment, setProgressComment] = useState('');
  const [progressSending, setProgressSending] = useState(false);
  const progressSendingLock = useRef(false);
  const photoSelectionRevision = useRef(0);
  const photoRequestRevision = useRef(0);
  const [progressSendError, setProgressSendError] = useState('');
  const [progressEditingId, setProgressEditingId] = useState<string | null>(null);
  const [progressEditComment, setProgressEditComment] = useState('');
  const [progressLightbox, setProgressLightbox] = useState<string>('');

  useEffect(() => {
    if (!showMeuProgresso || !user?.uid) return;
    let active = true;
    const studentId = user.uid;
    const request = ++photoRequestRevision.current;
    const current = () => active && request === photoRequestRevision.current && storage.getUser()?.uid === studentId;
    setProgressPhotos(storage.getPhotos().filter(photo => photo.studentId === studentId));
    setProgressLoadingPhotos(true);
    storage.fetchPhotos(studentId)
      .then(photos => { if (current()) setProgressPhotos(photos.filter(photo => photo.studentId === studentId)); })
      .catch(() => { if (current()) setProgressSendError('Não foi possível atualizar as fotos. Exibindo as salvas neste aparelho.'); })
      .finally(() => { if (current()) setProgressLoadingPhotos(false); });
    return () => { active = false; };
  }, [showMeuProgresso, user?.uid]);

  useEffect(() => {
    const refresh = () => {
      if (storage.getUser()?.uid !== user?.uid) return;
      // Other outbox records can synchronize while the gallery is still loading.
      // Keep that read alive; photo mutations invalidate stale reads separately.
      setProgressPhotos(storage.getPhotos().filter(photo => photo.studentId === user?.uid));
    };
    window.addEventListener('cadu_data_synced', refresh);
    return () => window.removeEventListener('cadu_data_synced', refresh);
  }, [user?.uid]);

  const [showAnamneses, setShowAnamneses] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  useEffect(() => {
    setShowFreqCalendar(false); setShowTreinosExtra(false); setShowTreinos(false);
    setShowMeuProgresso(false); setShowAvaliacoes(false); setShowFaturas(false);
    setShowArquivos(false); setShowAnamneses(false); setShowAgenda(false);
  }, [resetKey]);

  if (showAnamneses && user) return <StudentAnamneses studentId={user.uid} onBack={() => setShowAnamneses(false)} />;
  if (showAgenda && user) return <StudentAgenda studentId={user.uid} onBack={() => setShowAgenda(false)} />;

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
            <button
              onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="text-[#0070f3] flex items-center gap-1 text-sm font-semibold"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
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
                  <div
                    aria-label={`${localWorkoutDateKey(new Date(calMonth.getFullYear(), calMonth.getMonth(), day))}: ${frequency.monthCompletedDays.has(day) ? 'treino concluído' : 'sem treino registrado'}`}
                    className={`relative w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-medium ${frequency.monthCompletedDays.has(day) ? 'bg-emerald-600 text-white' : 'bg-[#f0f4f8] text-slate-700'}`}
                  >
                    {day}
                    {frequency.monthCompletedDays.has(day) && <Check aria-hidden="true" className="absolute -right-1 -bottom-1 w-4 h-4 bg-white text-emerald-700 rounded-full" />}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <p className="text-center text-emerald-700 text-sm font-semibold mt-4">{frequency.monthCompletedDays.size} {frequency.monthCompletedDays.size === 1 ? 'dia com treino concluído' : 'dias com treino concluído'}</p>
          {frequency.loading && <p role="status" className="text-slate-500 text-xs mt-2 text-center">Atualizando frequência...</p>}
          {frequency.error && <p role="status" className="text-amber-700 text-xs mt-2">{frequency.error}</p>}
        </div>
      </div>
    );
  }

  if (showTreinosExtra || showTreinos) {
    return <WorkoutList workouts={workouts} onSelectWorkout={onStartWorkout} trainerPhone={user?.trainerPhone}
      initialKind={showTreinosExtra ? 'extra' : 'strength'} onBack={() => { setShowTreinos(false); setShowTreinosExtra(false); }} />;
  }

  if (showMeuProgresso) {
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const selection = ++photoSelectionRevision.current;
        setProgressPreview('');
        setProgressSelectedFile(file);
        try {
          // Comprime a imagem para 800px max a 80% qualidade garantindo tamanho leve (<80KB)
          const compressedBlob = await compressImage(file, 800, 0.8);
          const reader = new FileReader();
          reader.onloadend = () => {
            if (selection === photoSelectionRevision.current) setProgressPreview(reader.result as string);
          };
          reader.readAsDataURL(compressedBlob);
        } catch {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (selection === photoSelectionRevision.current) setProgressPreview(reader.result as string);
          };
          reader.readAsDataURL(file);
        }
      }
    };

    const handleSendProgress = async () => {
      if (!progressPreview || !user?.uid || progressSendingLock.current) return;
      progressSendingLock.current = true;
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
        photoRequestRevision.current++; setProgressLoadingPhotos(false);
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
        progressSendingLock.current = false;
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
      photoRequestRevision.current++; setProgressLoadingPhotos(false);
      setProgressPhotos(previous => previous.filter(p => p.id !== photoId));
    };

    const handleSaveEditComment = async (photoId: string) => {
      try {
        await storage.updatePhotoNotes(photoId, progressEditComment.trim());
        photoRequestRevision.current++; setProgressLoadingPhotos(false);
        const saved = storage.getPhotos().find(photo => photo.id === photoId);
        setProgressPhotos(previous => previous.map(photo => photo.id === photoId ? saved || { ...photo, notes: progressEditComment.trim() } : photo));
        if (saved?.syncStatus === 'pending') setProgressSendError('Comentário salvo neste aparelho. Será enviado quando a conexão voltar.');
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

  if (showAvaliacoes && user) return <StudentAssessments studentId={user.uid} onBack={() => setShowAvaliacoes(false)} />;
  if (showArquivos && user) return <StudentFiles studentId={user.uid} onBack={() => setShowArquivos(false)} />;
  if (showFaturas) return (
    <div className="min-h-full bg-[#1c2b3e] p-4 space-y-5">
      <button onClick={() => setShowFaturas(false)} className="text-white text-sm">← Voltar</button>
      <h2 className="text-white text-xl font-semibold">Pagamento da consultoria</h2>
      <div className="bg-white rounded-xl p-6 space-y-4">
        <p className="text-slate-700">Combine o pagamento, os planos e a renovação diretamente com o Cadu pelo WhatsApp.</p>
        <a href={getTrainerWhatsAppUrl('Olá Cadu! Gostaria de conversar sobre o pagamento da minha consultoria.')} target="_blank" rel="noopener noreferrer" className="block text-center rounded-xl bg-emerald-600 p-4 font-bold text-white">Conversar sobre pagamento</a>
      </div>
    </div>
  );

  return (
    <StudentHome
      name={user?.name}
      weekDates={frequency.weekDates}
      completedDates={frequency.dates}
      frequencyLoading={frequency.loading}
      frequencyError={frequency.error}
      pushStatus={pushStatus}
      onEnableNotifications={() => { void enablePushNotifications(); }}
      onFrequency={() => setShowFreqCalendar(true)}
      onWorkouts={() => setShowTreinos(true)}
      onExtraWorkouts={() => setShowTreinosExtra(true)}
      onAssessments={() => setShowAvaliacoes(true)}
      onProgress={() => setShowMeuProgresso(true)}
      onPayment={() => setShowFaturas(true)}
      onFiles={() => setShowArquivos(true)}
      onAnamneses={() => setShowAnamneses(true)}
      onAgenda={() => setShowAgenda(true)}
    />
  );
}