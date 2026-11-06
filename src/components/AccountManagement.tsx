/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Link as LinkIcon,
  MessageSquare,
  Calendar,
  Search,
  Plus,
  Edit3,
  Phone,
  ArrowLeft,
  Check,
  Copy,
  Home,
  HelpCircle,
  Menu,
  User,
  Mail,
  ArrowUpRight,
  TrendingUp,
  Award,
  Sparkles,
  Lock,
  UserCheck,
  ShieldAlert,
  Send,
  LockKeyhole,
  ChevronLeft,
  ChevronRight,
  Star,
  Video,
  Dumbbell,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  Bell,
  Zap,
  BookOpen,
  Users,
  UserPlus,
  BarChart3,
  PlayCircle,
  FileText,
  FilePlus,
  LayoutGrid,
  MoreHorizontal,
  Box,
  Accessibility,
  MoreVertical,
  Eye,
  EyeOff,
  ArrowUpDown,
  Archive,
  Image as ImageIcon,
  CheckCircle2,
  Activity,
  ClipboardCheck,
  Info,
  SlidersHorizontal,
  Camera,
  RefreshCw,
  Clipboard,
  Settings,
  CreditCard,
  QrCode,
} from 'lucide-react';
import { AdminAgenda } from './AdminAgenda';
import AdminChrome, { type AdminSection } from './AdminChrome';
import AdminDashboardHome from './AdminDashboardHome';
import '../styles/admin-shell.css';
import '../styles/admin-surfaces.css';
import AdminStudentModules, { newAnamnesis } from './AdminStudentModules';
import AdminRoutineModule from './AdminRoutineModule';
import StudentProfileEditor from './StudentProfileEditor';
import AdminStudentGroups from './AdminStudentGroups';
import { normalizeStudentPhone, studentWhatsAppUrl } from '../lib/studentContact';
import NotificationsModal from './NotificationsModal';
import { UserProfile, Workout, TrainerPaymentSettings } from '../types';
import { storage, safeSetItem } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useMediaUrl, resolveMediaUrl, normalizeStoredMediaReference } from '../lib/mediaDb';
import { LibraryExercise, exerciseVideoFields } from '../lib/exerciseLibrary';
import { youtubeVideoId, isImageMedia } from '../lib/mediaPresentation';
import { generateWorkoutPDF } from '../lib/pdfGenerator';
import { TRAINER_CONFIG, getTrainerWhatsAppUrl } from '../lib/trainerConfig';
import { useTrainerNotifications } from '../lib/useTrainerNotifications';
import { useWorkoutAttendance } from '../lib/useWorkoutAttendance';
import { usePushNotifications } from '../lib/usePushNotifications';
import { workoutAttendance } from '../lib/workoutAttendance';
import { WorkoutAttendanceReport, StudentWorkoutAttendance } from './WorkoutAttendance';

function PrivateImage({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = useMediaUrl(src);
  return <img {...props} src={resolved || undefined} />;
}

interface AccountManagementProps {
  onClose: () => void;
  isDark?: boolean;
}

// Audio chime function for workout completions
function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.09); // A5
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
    osc.onended = () => { void ctx.close(); };
  } catch (e) {}
}

// Vibration function for phone
function triggerVibration() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate([200, 100, 200]); } catch {}
  }
}

function ExerciseVideoPlayer({ url, className }: { url?: string; className?: string }) {
  const resolved = useMediaUrl(url);
  const ytId = youtubeVideoId(resolved);

  if (!resolved) {
    return (
      <div className={`flex items-center justify-center bg-slate-900 text-slate-500 text-xs ${className || ''}`}>
        Sem vídeo demonstrativo
      </div>
    );
  }

  if (isImageMedia(url) || isImageMedia(resolved)) return <img src={resolved} alt="Demonstração do exercício" className={className} />;

  if (ytId) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
        className={className}
        allow="autoplay; encrypted-media"
        allowFullScreen
      />
    );
  }

  return (
    <video
      src={resolved}
      className={className}
      loop
      autoPlay
      muted
      controls
      playsInline
    />
  );
}

function ExerciseImagePreview({ url }: { url?: string }) {
  const resolved = useMediaUrl(url);
  if (!resolved) return null;
  return (
    <div className="relative w-full h-28 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
      <PrivateImage src={resolved} alt="Preview" className="w-full h-full object-cover" onError={() => {}} />
    </div>
  );
}

export default function AccountManagement({ onClose, isDark }: AccountManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersLoadError, setUsersLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [studentTab, setStudentTab] = useState<'alunos' | 'grupos'>('alunos');
  const [studentGroupSearch, setStudentGroupSearch] = useState('');
  const studentGroups = [...new Set(users.filter(user => user.role === 'student' && user.status !== 'excluded').map(user => user.metadata?.group).filter(Boolean))] as string[];
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [selectedGroupForView, setSelectedGroupForView] = useState<string | null>(null);
  const [updatesSubView, setUpdatesSubView] = useState<'grid' | 'link_cadastro' | 'aniversarios' | 'treinos' | 'avaliacao_fisica' | 'planos_recorrentes' | 'aerobico' | 'pagina_vendas' | 'anamneses' | 'faturas'>('grid');
  const [linkCadastroTab, setLinkCadastroTab] = useState<'link' | 'contatos'>('link');
  const [linkCadastroSearch, setLinkCadastroSearch] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [aniversariosTab, setAniversariosTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [aniversariosSearch, setAniversariosSearch] = useState('');
  const [treinosTab, setTreinosTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [treinosSearch, setTreinosSearch] = useState('');
  const [avaliacaoFisicaTab, setAvaliacaoFisicaTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [avaliacaoFisicaSearch, setAvaliacaoFisicaSearch] = useState('');
  const [planosRecorrentesTab, setPlanosRecorrentesTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [planosRecorrentesSearch, setPlanosRecorrentesSearch] = useState('');
  const [aerobicoTab, setAerobicoTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [aerobicoSearch, setAerobicoSearch] = useState('');
  const [paginaVendasTab, setPaginaVendasTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [paginaVendasSearch, setPaginaVendasSearch] = useState('');
  const [anamnesesTab, setAnamnesesTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [anamnesesSearch, setAnamnesesSearch] = useState('');
  const [faturasTab, setFaturasTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [faturasSearch, setFaturasSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'excluded'>('active');

  // ── Payment Settings / Formas de Pagamento para os Alunos ──
  const [paymentSettings, setPaymentSettings] = useState<TrainerPaymentSettings>({
    pixKey: '554384639369',
    pixType: 'Telefone',
    pixHolder: 'Carlos Eduardo Ponce',
    bankName: '',
    cardLink: '',
    instructions: 'Envie o comprovante no WhatsApp após realizar o pagamento.',
  });
  const [paymentSettingsSavedToast, setPaymentSettingsSavedToast] = useState(false);
  const [isSavingPaymentSettings, setIsSavingPaymentSettings] = useState(false);

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPaymentSettings(true);
    try {
      await storage.savePaymentSettings(paymentSettings);
      setPaymentSettingsSavedToast(true);
      setTimeout(() => setPaymentSettingsSavedToast(false), 3500);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar as formas de pagamento.');
    } finally {
      setIsSavingPaymentSettings(false);
    }
  };

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(() => new URLSearchParams(window.location.search).get('notifications') === '1');
  const [bannerNotif, setBannerNotif] = useState<{ title: string; message: string } | null>(null);
  const notifications = useTrainerNotifications(items => {
    if (!items.length) return;
    const latest = items[0];
    playNotificationChime();
    triggerVibration();
    setBannerNotif({ title: latest.studentName, message: latest.detailMessage || latest.studentName + ' concluiu ' + latest.workoutTitle + '.' });
  });
  const adminNotifs = notifications.items;
  const attendanceFeed = useWorkoutAttendance(adminNotifs.map(item => item.id).join(','));
  const attendance = workoutAttendance(attendanceFeed.logs);
  const push = usePushNotifications(storage.getUser()?.uid);
  const unreadNotifCount = adminNotifs.filter(item => !item.isRead).length;
  useEffect(() => {
    storage.fetchPaymentSettings().then(setPaymentSettings).catch(() => {});
  }, []);
  useEffect(() => {
    if (!bannerNotif) return;
    const timeout = setTimeout(() => setBannerNotif(null), 8000);
    return () => clearTimeout(timeout);
  }, [bannerNotif]);

  const persistStudent = async (updated: UserProfile) => {
    if (updated.role !== 'student' || updated.uid === storage.getUser()?.uid) {
      alert('Esta ação é exclusiva para fichas de alunos. Contas de treinadores foram preservadas.');
      return;
    }
    if (studentMutationLock.current) return;
    studentMutationLock.current = true; setStudentMutationBusy(true);
    try {
      await storage.updateProfile(updated);
      setUsers(previous => previous.map(user => user.uid === updated.uid ? updated : user));
      setSelectedStudent(previous => previous?.uid === updated.uid ? updated : previous);
    } catch (error) { alert(error instanceof Error ? error.message : 'Não foi possível salvar o aluno.'); }
    finally { studentMutationLock.current = false; setStudentMutationBusy(false); }
  };
  const handleDeleteStudent = async (uid: string) => {
    const student = users.find(user => user.uid === uid && user.role === 'student');
    if (student && window.confirm('Excluir este aluno da lista ativa e bloquear seu acesso? O histórico será preservado.')) {
      await persistStudent({ ...student, status: 'excluded' });
    }
  };

  const optionsSaveLock = useRef(false);
  const handleAddOption = async () => {
    if (!newOptionValue.trim() || optionsSaveLock.current) return;
    optionsSaveLock.current = true;
    try {
      if (editingOptionType === 'muscle') {
        const updated = await storage.addMuscleGroup(newOptionValue.trim());
        setAppMuscleGroups(updated);
      } else {
        const updated = await storage.addCategory(newOptionValue.trim());
        setAppCategories(updated);
      }
      setNewOptionValue('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a opção. Tente novamente.');
    } finally { optionsSaveLock.current = false; }
  };

  const handleRemoveOption = async (val: string) => {
    if (optionsSaveLock.current) return;
    optionsSaveLock.current = true;
    try {
      if (editingOptionType === 'muscle') {
        const updated = await storage.removeMuscleGroup(val);
        setAppMuscleGroups(updated);
      } else {
        const updated = await storage.removeCategory(val);
        setAppCategories(updated);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir a opção. Tente novamente.');
    } finally { optionsSaveLock.current = false; }
  };

  const [activeTab, setActiveTab] = useState<'home' | 'menu'>('home');
  const [homeSubView, setHomeSubView] = useState<'dashboard' | 'student_list' | 'retention' | 'workout_library' | 'create_routine' | 'routine_details' | 'frequency_report' | 'exercise_library' | 'agenda'>('dashboard');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Workouts and dynamic detailed states
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  // Retention Metrics Calculation
  const studentUsers = users.filter(u => u.role === 'student');
  const activeCount = studentUsers.filter(u => u.status === 'active' || !u.status).length;
  const inactiveCount = studentUsers.filter(u => u.status === 'inactive').length;
  const engagedCount = studentUsers.filter(user => user.status === 'active' && attendance.studentsThisMonth.has(user.uid)).length;
  const engagementRate = attendanceFeed.loading || attendanceFeed.error || isLoadingUsers || usersLoadError ? null : activeCount ? Math.round(engagedCount / activeCount * 100) : 0;
  const engajamentoCategorias = attendanceFeed.loading || attendanceFeed.error || isLoadingUsers || usersLoadError ? [] : [
    { label: 'Com treino no mês', count: engagedCount, percent: activeCount ? Math.round(engagedCount / activeCount * 100) : 0, color: 'bg-emerald-400' },
    { label: 'Sem treino no mês', count: activeCount - engagedCount, percent: activeCount ? Math.round((activeCount - engagedCount) / activeCount * 100) : 0, color: 'bg-slate-300' },
  ];

  const [selectedDetailTab, setSelectedDetailTab] = useState<'inicio' | 'opcoes' | 'treinos' | 'criar_rotina' | 'criar_planilha' | 'progresso' | 'treinos_extras' | 'criar_treino_extra' | 'arquivos' | 'avaliacoes' | 'anamneses' | 'editar_aluno'>('inicio');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [treinosSubTab, setTreinosSubTab] = useState<'rotinas' | 'aerobico'>('rotinas');
  const [treinosViewStatus, setTreinosViewStatus] = useState<'ativas' | 'arquivadas' | 'excluidas'>('ativas');

  // Criar Rotina form state
  const [criarRotinaForm, setCriarRotinaForm] = useState({
    nome: '',
    tipo: 'dia_semana',
    diaSemana: 'Segunda',
    grupoMuscular: '',
    objetivo: 'Definição muscular',
    dificuldade: 'Iniciante',
    orientacoes: '',
    permitirPdf: 'sim',
    mostrarTempo: 'sim',
    comecaEm: '',
    terminaEm: '',
    retirarAoVencer: false,
    naoExibirAntes: false,
  });

  // Criar Planilha (Aeróbico) form state
  const [criarPlanilhaForm, setCriarPlanilhaForm] = useState({
    nome: '',
    tipo: 'numero_treinos'
  });

  // Treino Extra form state
  const [treinoExtraForm, setTreinoExtraForm] = useState({
    dataExecucao: '',
    nome: '',
    instrucoes: '',
    linkYoutube: '',
    alunos: '',
    grupoAlunos: '',
    enviarLembrete: false
  });

  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [editWeight, setEditWeight] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editBF, setEditBF] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'pago' | 'pendente'>('pago');
  const [extraPrescription, setExtraPrescription] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [prescSuccess, setPrescSuccess] = useState(false);

  // Modals / Overlays
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [studentMutationBusy, setStudentMutationBusy] = useState(false);
  const studentMutationLock = useRef(false);
  const [createdAccess, setCreatedAccess] = useState<{ name: string; email: string; password: string; warning?: string } | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const createUserLock = useRef(false);
  const [trainerProgressPhotos, setTrainerProgressPhotos] = useState<any[]>([]);
  const [trainerLoadingPhotos, setTrainerLoadingPhotos] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [activePanel, setActivePanel] = useState<'sales_links' | 'feedbacks' | 'updates' | null>(null);
  const [isNotifyingByCategory, setIsNotifyingByCategory] = useState(false);
  // New notification flow states
  const [notifyView, setNotifyView] = useState<'list' | 'create_type' | 'create_target' | 'select_students' | 'select_groups' | 'compose'>('list');
  const [notifyListTab, setNotifyListTab] = useState<'agendadas' | 'recorrentes'>('agendadas');
  const [notifyType, setNotifyType] = useState<'now' | 'scheduled' | 'recurring' | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<'student' | 'group' | null>(null);
  const [notifyStudentSearch, setNotifyStudentSearch] = useState('');
  const [selectedUidsForNotify, setSelectedUidsForNotify] = useState<string[]>([]);
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendComplete, setSendComplete] = useState(false);
  const [notifyError, setNotifyError] = useState('');
  const [notifyResult, setNotifyResult] = useState('');
  // Legacy states (keep for compatibility)
  const [selectedCategoryForNotify, setSelectedCategoryForNotify] = useState<string | null>(null);
  const [notifyStep, setNotifyStep] = useState<'category' | 'students' | 'message'>('category');
  const [isWorkoutActionModalOpen, setIsWorkoutActionModalOpen] = useState(false);
  const [isCreateWorkoutModalOpen, setIsCreateWorkoutModalOpen] = useState(false);
  const [routineWorkouts, setRoutineWorkouts] = useState<any[]>([]);

  // States for Routine Metadata
  const [routineName, setRoutineName] = useState('NOME DA ROTINA');
  const [routineType, setRoutineType] = useState('Dia da Semana');
  const [routineGoal, setRoutineGoal] = useState('Definição muscular');
  const [routineDifficulty, setRoutineDifficulty] = useState('Adaptação');
  const [routineNotes, setRoutineNotes] = useState('');
  const [showRoutineNotes, setShowRoutineNotes] = useState(false);
  const [routinePdfPermission, setRoutinePdfPermission] = useState('Não');
  const [routineShowTime, setRoutineShowTime] = useState('Sim');
  const [routineHideBeforeStart, setRoutineHideBeforeStart] = useState(false);
  const [routineHideAfterEnd, setRoutineHideAfterEnd] = useState(false);
  const [routineDayOfWeek, setRoutineDayOfWeek] = useState('');
  const [routineMuscleGroup, setRoutineMuscleGroup] = useState('');
  const [routineGeneralNotes, setRoutineGeneralNotes] = useState('');
  const [routineStartDate, setRoutineStartDate] = useState('');
  const [routineEndDate, setRoutineEndDate] = useState('');
  const [routineGroupName, setRoutineGroupName] = useState('');

  // Admin Routines State
  const [adminRoutines, setAdminRoutines] = useState<import('../types').AdminRoutine[]>(() => storage.getAdminRoutines());
  const [editingRoutine, setEditingRoutine] = useState<import('../types').AdminRoutine | null>(null);
  const [assigningRoutine, setAssigningRoutine] = useState<import('../types').AdminRoutine | null>(null);
  const [routineExercises, setRoutineExercises] = useState<import('../types').AdminExercise[]>([]);
  const [expandedExerciseDetails, setExpandedExerciseDetails] = useState<number[]>([]);
  const [selectingExerciseForIdx, setSelectingExerciseForIdx] = useState<number | null>(null);
  const [routineStudentIds, setRoutineStudentIds] = useState<string[]>([]);
  const [appMuscleGroups, setAppMuscleGroups] = useState<string[]>(() => storage.getMuscleGroups());
  const [appCategories, setAppCategories] = useState<string[]>(() => storage.getCategories());
  const [isEditingOptions, setIsEditingOptions] = useState(false);
  const [editingOptionType, setEditingOptionType] = useState<'muscle' | 'category'>('muscle');
  const [newOptionValue, setNewOptionValue] = useState('');
  const [showOptionInput, setShowOptionInput] = useState(false);
  const [optionSearchQuery, setOptionSearchQuery] = useState('');
  const [uploadingVideoIdx, setUploadingVideoIdx] = useState<number | null>(null);
  const [routineLibraryTab, setRoutineLibraryTab] = useState<'strength' | 'aerobic'>('strength');

  // Exercise Library State
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [exerciseTab, setExerciseTab] = useState<'grupos' | 'categorias'>('grupos');
  const [exerciseFilter, setExerciseFilter] = useState<'favoritos' | 'app' | 'mine'>('mine');

  const [exercises, setExercises] = useState<LibraryExercise[]>(() => {
    const saved = storage.getCacheItem('cadu_ponce_exercises_v3');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [dataLoadError, setDataLoadError] = useState('');
  const [dataReload, setDataReload] = useState(0);

  // Load admin data from dedicated Supabase tables on mount
  useEffect(() => {
    let alive = true;
    setIsDataLoaded(false); setDataLoadError('');
    Promise.all([
      storage.fetchAdminRoutines(),
      storage.fetchCustomExercises(),
      storage.fetchMuscleGroups(),
      storage.fetchCategories(),
      storage.fetchAgendaEvents(),
    ]).then(([routines, customExercises, muscleGroups, categories, agendaEvents]) => {
      if (!alive) return;
      if (routines) setAdminRoutines(routines);
      if (customExercises) setExercises(customExercises);
      if (muscleGroups) setAppMuscleGroups(muscleGroups);
      if (categories) setAppCategories(categories);
      setIsDataLoaded(true);
    }).catch(error => { if (alive) setDataLoadError(error instanceof Error ? error.message : 'Falha ao carregar a biblioteca.'); });
    return () => { alive = false; };
  }, [dataReload]);

  useEffect(() => {
    let alive = true;
    if (selectedDetailTab === 'progresso' && selectedStudent?.uid) {
      setTrainerProgressPhotos([]);
      setTrainerLoadingPhotos(true);
      storage.fetchPhotos(selectedStudent.uid)
        .then(photos => { if (alive) setTrainerProgressPhotos(photos); })
        .catch(() => { if (alive) setTrainerProgressPhotos([]); })
        .finally(() => { if (alive) setTrainerLoadingPhotos(false); });
    }
    return () => { alive = false; };
  }, [selectedDetailTab, selectedStudent?.uid]);

  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);

  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExGroup, setNewExGroup] = useState(appMuscleGroups[0] || 'Abdômen');
  const [newExCategory, setNewExCategory] = useState(appCategories[0] || 'Musculação');
  const [newExImage, setNewExImage] = useState('');
  const [newExVideo, setNewExVideo] = useState('');
  const [newExDesc, setNewExDesc] = useState('');
  const [exerciseSaveError, setExerciseSaveError] = useState('');
  const [isSavingExercise, setIsSavingExercise] = useState(false);
  const exerciseSaveLock = useRef(false);
  const exerciseDraftId = useRef(crypto.randomUUID());
  const [isSavingRoutine, setIsSavingRoutine] = useState(false);
  const routineSaveLock = useRef(false);
  const [isUploadingExerciseImage, setIsUploadingExerciseImage] = useState(false);
  const [isUploadingExerciseVideo, setIsUploadingExerciseVideo] = useState(false);
  const [uploadImageError, setUploadImageError] = useState<string | null>(null);
  const [uploadVideoError, setUploadVideoError] = useState<string | null>(null);
  const [uploadImageProgress, setUploadImageProgress] = useState<string>('');
  const [uploadVideoProgress, setUploadVideoProgress] = useState<string>('');

  const [previewingExercise, setPreviewingExercise] = useState<LibraryExercise | null>(null);


  // Workout Form State
  const [newWorkoutDay, setNewWorkoutDay] = useState('');
  const [newWorkoutName, setNewWorkoutName] = useState('');
  const [newWorkoutNotes, setNewWorkoutNotes] = useState('');

  const handleSaveWorkout = () => {
    if (!newWorkoutDay || !newWorkoutName) return;

    const newWorkout = {
      day: newWorkoutDay,
      name: newWorkoutName,
      notes: newWorkoutNotes
    };

    setRoutineWorkouts([...routineWorkouts, newWorkout]);
    setIsCreateWorkoutModalOpen(false);

    // Reset form
    setNewWorkoutDay('');
    setNewWorkoutName('');
    setNewWorkoutNotes('');
  };

  const handleSaveAdminRoutine = async () => {
    if (!isDataLoaded || !routineName || routineName === 'NOME DA ROTINA' || routineSaveLock.current || uploadingVideoIdx !== null) return;
    routineSaveLock.current = true;
    setIsSavingRoutine(true);
    const studentNames = routineStudentIds.map(id => {
      const s = users.find(u => u.uid === id);
      return s ? s.name : '';
    });
    const routine: import('../types').AdminRoutine = {
      ...editingRoutine,
      id: editingRoutine?.id || crypto.randomUUID(),
      name: routineName,
      goal: routineGoal,
      difficulty: routineDifficulty,
      dayOfWeek: routineDayOfWeek || undefined,
      muscleGroup: routineMuscleGroup || undefined,
      generalNotes: routineGeneralNotes || undefined,
      startDate: routineStartDate || undefined,
      endDate: routineEndDate || undefined,
      routineGroupName: routineGroupName || undefined,
      notes: routineNotes,
      allowPdf: routinePdfPermission === 'Sim',
      showTimer: routineShowTime === 'Sim',
      hideBeforeStart: routineHideBeforeStart,
      hideAfterEnd: routineHideAfterEnd,
      studentIds: routineStudentIds,
      studentNames,
      exercises: routineExercises,
      createdAt: editingRoutine?.createdAt || new Date().toISOString(),
    };
    try {
      if (routine.startDate && routine.endDate && routine.endDate < routine.startDate) throw new Error('A data final deve ser posterior à inicial.');
      if (routine.hideBeforeStart && !routine.startDate) throw new Error('Informe a data inicial para restringir a exibição.');
      if (routine.hideAfterEnd && !routine.endDate) throw new Error('Informe a data final para ocultar o treino após o vencimento.');
      if (!routine.exercises.length || routine.exercises.some(exercise => !exercise.name.trim() || !exercise.reps.trim())) throw new Error('Adicione pelo menos um exercício e preencha nome e repetições de todos.');
      routine.exercises = routine.exercises.map(ex => ({ ...ex,
        videoUrl: normalizeStoredMediaReference(ex.videoUrl) ?? undefined,
        videoFileUrl: normalizeStoredMediaReference(ex.videoFileUrl) ?? undefined,
      }));
      await storage.saveAdminRoutine(routine);
    setEditingRoutine(routine);
    setAdminRoutines(prev => [routine, ...prev.filter(item => item.id !== routine.id)]);

    // Memberships and student copies are committed atomically by saveAdminRoutine.
    setEditingRoutine(null);
    setRoutineExercises([]);
    setRoutineStudentIds([]);
    setRoutineName('NOME DA ROTINA');
    setRoutineNotes('');
    setHomeSubView('workout_library');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar todas as atribuições. Tente novamente.');
    } finally {
      routineSaveLock.current = false;
      setIsSavingRoutine(false);
    }
  };

  const handleSaveRoutineAssignment = async () => {
    if (!assigningRoutine || !isDataLoaded || routineSaveLock.current) return;
    routineSaveLock.current = true; setIsSavingRoutine(true);
    const updatedRoutine = { ...assigningRoutine, studentIds: routineStudentIds,
      studentNames: routineStudentIds.map(id => users.find(user => user.uid === id)?.name || '') };
    try {
      await storage.saveAdminRoutine(updatedRoutine);
      setAdminRoutines(previous => [updatedRoutine, ...previous.filter(item => item.id !== updatedRoutine.id)]);
      setAssigningRoutine(null); setRoutineStudentIds([]);
    } catch (error) { alert(error instanceof Error ? error.message : 'Não foi possível atribuir o treino.'); }
    finally { routineSaveLock.current = false; setIsSavingRoutine(false); }
  };

  const handleDeleteAdminRoutine = async (id: string) => {
    if (!isDataLoaded || !window.confirm('Excluir esta rotina da biblioteca e de TODOS os alunos vinculados? O histórico de conclusões será preservado.')) return;
    try {
      await storage.deleteAdminRoutine(id);
      setAdminRoutines(storage.getAdminRoutines());
      setWorkouts(storage.getWorkouts());
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir a rotina. Tente novamente.');
    }
  };

  const handleEditAdminRoutine = (routine: import('../types').AdminRoutine) => {
    if (!isDataLoaded) return;
    setEditingRoutine(routine);
    setRoutineName(routine.name);
    setRoutineGoal(routine.goal);
    setRoutineDifficulty(routine.difficulty);
    setRoutineNotes(routine.notes || '');
    setRoutinePdfPermission(routine.allowPdf === false ? 'Não' : 'Sim');
    setRoutineShowTime(routine.showTimer === false ? 'Não' : 'Sim');
    setRoutineHideBeforeStart(!!routine.hideBeforeStart);
    setRoutineHideAfterEnd(!!routine.hideAfterEnd);
    setRoutineDayOfWeek(routine.dayOfWeek || '');
    setRoutineMuscleGroup(routine.muscleGroup || '');
    setRoutineGeneralNotes(routine.generalNotes || '');
    setRoutineStartDate(routine.startDate || '');
    setRoutineEndDate(routine.endDate || '');
    setRoutineGroupName(routine.routineGroupName || '');
    setRoutineExercises(routine.exercises.map(ex => ({ ...ex, prescribedLoads: ex.prescribedLoads ? [...ex.prescribedLoads] : undefined })));
    setRoutineStudentIds(routine.studentIds || []);
    setHomeSubView('create_routine');
  };

  const addExerciseToRoutine = () => {
    setRoutineExercises(prev => [...prev, {
      id: `ex_${Date.now()}`,
      name: '',
      sets: 3,
      reps: '12',
      rest: '60s',
      notes: '',
      videoUrl: '',
      videoFileUrl: '',
      prescribedLoads: [],
    }]);
  };

  const updateRoutineExercise = (idx: number, fieldOrUpdates: string | Record<string, any>, value?: any) => {
    setRoutineExercises(prev => prev.map((ex, i) => {
      if (i !== idx) return ex;
      if (typeof fieldOrUpdates === 'string') {
        return { ...ex, [fieldOrUpdates]: value };
      }
      return { ...ex, ...fieldOrUpdates };
    }));
  };

  const removeRoutineExercise = (idx: number) => {
    setRoutineExercises(prev => prev.filter((_, i) => i !== idx));
  };

  const handleExerciseVideoUpload = async (idx: number, file: File) => {
    setUploadingVideoIdx(idx);
    try {
      const exId = routineExercises[idx]?.id;
      if (!exId) return;
      const url = await storage.uploadExerciseVideo(file, exId);
      setRoutineExercises(prev => prev.map(ex => ex.id === exId ? { ...ex, videoFileUrl: url } : ex));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Não foi possível enviar o vídeo. Tente novamente.');
    } finally {
      setUploadingVideoIdx(null);
    }
  };

  // Form State for creating a user
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formGroup, setFormGroup] = useState(''); // New
  const [formBirthDate, setFormBirthDate] = useState(''); // New
  const [formGender, setFormGender] = useState(''); // New
  const [formSendAccessInfo, setFormSendAccessInfo] = useState('Sim'); // New
  const [formSendAnamnesis, setFormSendAnamnesis] = useState(''); // New
  const [formBlockDefaulters, setFormBlockDefaulters] = useState(''); // New
  const [formModality, setFormModality] = useState<'Presencial' | 'Online'>('Presencial');
  const [formRole, setFormRole] = useState<'student' | 'admin'>('student');
  const [formPassword, setFormPassword] = useState('');
  const [formConfirmPassword, setFormConfirmPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [showFormConfirmPassword, setShowFormConfirmPassword] = useState(false);
  const [formPasswordError, setFormPasswordError] = useState('');
  const confirmPasswordInput = useRef<HTMLInputElement>(null);

  const resetNewUserPasswords = () => {
    setFormPassword('');
    setFormConfirmPassword('');
    setShowFormPassword(false);
    setShowFormConfirmPassword(false);
    setFormPasswordError('');
  };

  // Account management requires the current server list: deleted students must
  // not reappear from this device's previous cache when the network is unavailable.
  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setUsersLoadError('');
    setUsers([]);
    try {
      const currentUsers = await storage.fetchUsersList({ allowCached: false });
      setUsers(currentUsers);
    } catch {
      setUsersLoadError('Não foi possível carregar os alunos. Verifique sua conexão e tente novamente.');
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    setWorkouts(storage.getWorkouts());
    void loadUsers();
  }, [loadUsers]);

  // Selected Student Form synchronization
  useEffect(() => {
    if (selectedStudent) {
      setSelectedDetailTab('inicio');
      setExpandedCategory(null);
      setEditWeight(selectedStudent.weight?.toString() || '');
      setEditHeight(selectedStudent.height?.toString() || '');

      const savedBF = storage.getCacheItem(`cadu_bf_${selectedStudent.uid}`) || '';
      setEditBF(savedBF);

      const savedPayment = storage.getCacheItem(`cadu_payment_${selectedStudent.uid}`) as 'pago' | 'pendente' | null;
      setEditPaymentStatus(savedPayment || 'pago');

      const savedPresc = storage.getCacheItem(`cadu_presc_${selectedStudent.uid}`) || '';
      setExtraPrescription(savedPresc);

    }
  }, [selectedStudent]);

  const handleDeleteWorkout = async (id: string) => {
    const w = workouts.find(w => w.id === id);
    if (!w) return;
    try {
      await storage.deleteWorkout(id, w.studentId);
      setWorkouts(storage.getWorkouts());
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir o treino. Tente novamente.');
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (createUserLock.current || !formName.trim() || !formEmail.trim()) return;
    setFormPasswordError('');
    if (formPassword.length < 12) { alert('Informe uma senha com pelo menos 12 caracteres.'); return; }
    if (formPassword !== formConfirmPassword) {
      setFormPasswordError('As senhas não coincidem. Confira a confirmação.');
      confirmPasswordInput.current?.focus();
      return;
    }
    createUserLock.current = true; setIsCreatingUser(true);
    try {
      const phone = normalizeStudentPhone(formPhone);
      const newUser = await storage.adminCreateUser(formEmail.trim(), formName.trim(), {
        role: formRole as 'student' | 'admin', password: formPassword, status: 'active',
        modality: formModality as 'Presencial' | 'Online', trainerPhone: TRAINER_CONFIG.phone,
        metadata: { group: formGroup, birthDate: formBirthDate, gender: formGender, phone },
      });
      let warning = '';
      if (formSendAnamnesis === 'Anamnese Padrão') {
        try { await storage.saveAnamnesis(newAnamnesis(newUser.uid)); }
        catch { warning = 'A conta foi criada, mas a anamnese não pôde ser criada. Abra a ficha do aluno e tente adicionar a anamnese novamente.'; }
      }
      setUsers(previous => [newUser, ...previous.filter(user => user.uid !== newUser.uid)]);
      setCreatedAccess({ name: newUser.name, email: newUser.email, password: formPassword, warning });
      setIsAddingUser(false); setFormName(''); setFormEmail(''); setFormPhone(''); resetNewUserPasswords();
    } catch (error) { alert(error instanceof Error ? error.message : 'Não foi possível criar o aluno.'); }
    finally { createUserLock.current = false; setIsCreatingUser(false); }
  };
  const handleUpdateStudentStatus = async (uid: string, status: 'active' | 'inactive' | 'excluded') => {
    const student = users.find(user => user.uid === uid);
    if (student) await persistStudent({ ...student, status });
  };
  const handleUpdateStudentModality = async (uid: string, modality: 'Presencial' | 'Online') => {
    const student = users.find(user => user.uid === uid);
    if (student) await persistStudent({ ...student, modality });
  };
  const handleDeleteUser = handleDeleteStudent;

  const handleCopyLink = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedLink(id); setTimeout(() => setCopiedLink(null), 2000); }
    catch { alert('Não foi possível copiar. Tente novamente ou copie o endereço manualmente.'); }
  };

  // Filter and catalog lists matching requested mockup
  const activeStudents = users.filter(u => u.role === 'student' && (u.status === 'active' || !u.status));
  const inactiveStudents = users.filter(u => u.role === 'student' && u.status === 'inactive');
  const excludedStudents = users.filter(u => u.role === 'student' && u.status === 'excluded');

  const filteredStudents = users.filter(u => {
    if (u.role !== 'student') return false;

    const lowerSearch = searchTerm.toLowerCase();
    const matchesSearch =
      u.name.toLowerCase().includes(lowerSearch) ||
      u.email.toLowerCase().includes(lowerSearch) ||
      (u.metadata?.phone && u.metadata.phone.includes(searchTerm));

    if (!matchesSearch) return false;

    if (statusFilter === 'active') {
      return u.status === 'active' || !u.status;
    } else if (statusFilter === 'inactive') {
      return u.status === 'inactive';
    } else if (statusFilter === 'excluded') {
      return u.status === 'excluded';
    }
    return false;
  });

  // Calculate current time for mock phone header
  const getSimulatedTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  // Quick feedback templates


  // Quick sales link templates
  const salesLinks = [{ id: 'consultoria', title: 'Contato do personal', url: getTrainerWhatsAppUrl() }];

  // Training updates timeline
  const recentUpdates: any[] = [];

  const navigateAdmin = (section: AdminSection) => {
    setActivePanel(null);
    setUpdatesSubView('grid');
    if (section === 'settings') { setActiveTab('menu'); return; }
    setActiveTab('home');
    setHomeSubView(section);
  };
  const adminSection: AdminSection = activeTab === 'menu' ? 'settings'
    : homeSubView === 'create_routine' || homeSubView === 'routine_details' ? 'workout_library'
    : homeSubView === 'retention' ? 'frequency_report' : homeSubView;
  const sceneTitle = { dashboard: 'Visão geral', student_list: 'Alunos', retention: 'Engajamento', workout_library: 'Treinos', create_routine: 'Nova rotina', routine_details: 'Detalhes da rotina', frequency_report: 'Frequência', exercise_library: 'Biblioteca de exercícios', agenda: 'Agenda' }[homeSubView];

  return (
    <div className="admin-app">

      <AdminChrome section={adminSection} unreadCount={unreadNotifCount} onNavigate={navigateAdmin} onNotifications={() => setIsNotificationsOpen(true)} onLogout={onClose} />

      {dataLoadError && <div role="alert" className="fixed top-14 left-4 right-4 z-[250] bg-red-50 text-red-900 p-4 rounded-lg shadow">{dataLoadError} <button onClick={() => setDataReload(value => value + 1)} className="underline font-bold ml-3">Recarregar dados</button></div>}
      {/* Main Content Area - Full Bleed */}
      <div className="admin-main-frame">

        {/* Real-time Workout Completion Banner Toast */}
        <AnimatePresence>
          {bannerNotif && (
            <motion.div
              role="status" aria-live="polite"
              initial={{ opacity: 0, y: -60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -60 }}
              onClick={() => {
                setIsNotificationsOpen(true);
                setBannerNotif(null);
              }}
              className="absolute top-16 left-3 right-3 sm:left-6 sm:right-6 max-w-md mx-auto z-[120] bg-[#141C2C] border-2 border-[#E23737] p-4 rounded-2xl shadow-2xl flex items-start gap-3.5 text-white cursor-pointer active:scale-98 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-[#E23737] text-white flex items-center justify-center shrink-0 shadow-md">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-black italic uppercase text-[11px] text-[#E23737] tracking-wider">Treino Concluído! 🏋️‍♂️</span>
                  <span className="text-[10px] text-slate-400 font-mono">Agora</span>
                </div>
                <p className="font-bold text-sm text-white truncate mt-0.5">{bannerNotif.title}</p>
                <p className="text-slate-300 text-xs mt-0.5 line-clamp-2">{bannerNotif.message}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setBannerNotif(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg shrink-0"
                aria-label="Fechar aviso de treino concluído"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications Modal */}
        <AnimatePresence>
          {isNotificationsOpen && (
            <NotificationsModal
              onClose={() => setIsNotificationsOpen(false)} isDark={true}
              notifications={adminNotifs} loading={notifications.loading} error={notifications.error}
              busy={notifications.busy} onMarkRead={notifications.markRead} onRefresh={notifications.refresh}
              pushControl={<div className="text-xs text-slate-400">
                {push.status === 'ready' ? <p className="text-emerald-500">Notificações neste dispositivo ativadas.</p>
                  : push.status === 'denied' ? <p>As notificações estão bloqueadas nas configurações do navegador. Os registros continuam disponíveis aqui.</p>
                  : push.status === 'unsupported' ? <p>Este navegador não oferece notificações em segundo plano. Acompanhe os registros neste painel.</p>
                  : <button onClick={() => void push.enable()} disabled={push.status === 'syncing'} className="text-red-500 font-bold disabled:opacity-50">{push.status === 'syncing' ? 'Ativando…' : 'Ativar notificações neste dispositivo'}</button>}
                {push.error && <p role="alert" className="text-red-400 mt-1">{push.error}</p>}
              </div>}
            />
          )}
        </AnimatePresence>

        {/* APP BODY WORK AREA - INTERACTIVE NAVIGATION MAP */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          <AnimatePresence mode="wait">

              {/* CURRENT VIEW 1: HOME (Início) */}
              {activeTab === 'home' && (
                <motion.div
                  key="home-tab"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col bg-[#F4F6FA] overflow-hidden"
                >
                  {homeSubView !== 'dashboard' && <div className="admin-breadcrumb"><button type="button" onClick={() => navigateAdmin('dashboard')}><Home size={14} />Início</button><ChevronRight size={13} aria-hidden="true" /><span>{sceneTitle}</span></div>}

                  {/* SCROLLABLE SCENE CONTAINER */}
                  <div className="admin-scene">

                    {/* CONDITIONAL RENDERING: LOADING VS WELCOME VS DASHBOARD VS STUDENT LIST */}
                    {isLoadingUsers && users.filter(u => u.role === 'student').length === 0 ? (
                       /* LOADING VIEW */
                       <div className="flex-1 flex flex-col items-center justify-center pt-20 px-6 text-center">
                          <div className="w-10 h-10 border-4 border-[#E23737] border-t-transparent rounded-full animate-spin mb-4" />
                          <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Carregando...</span>
                       </div>
                    ) : usersLoadError ? (
                       <div className="flex flex-col items-center gap-4 pt-20 px-6 text-center" role="alert">
                          <p className="text-slate-600 text-sm font-semibold">{usersLoadError}</p>
                          <button
                            onClick={() => { void loadUsers(); }}
                            className="rounded-xl bg-[#dc2626] px-5 py-3 text-sm font-bold text-white hover:bg-red-700"
                          >
                            Tentar novamente
                          </button>
                       </div>
                    ) : homeSubView === 'dashboard' ? (
                       <AdminDashboardHome
                         activeStudents={activeStudents.length}
                         inactiveStudents={inactiveStudents.length}
                         unreadNotifications={notifications.loading || notifications.error ? null : unreadNotifCount}
                         completedWorkoutsThisMonth={attendanceFeed.loading || attendanceFeed.error ? null : attendance.monthLogs.length}
                         studentsToday={attendanceFeed.loading || attendanceFeed.error ? null : attendance.studentsToday}
                         engagementRate={engagementRate}
                         contactCopied={copiedLink === 'reg'}
                         onAddStudent={() => setIsAddingUser(true)}
                         onStudents={() => navigateAdmin('student_list')}
                         onRetention={() => navigateAdmin('retention')}
                         onRoutines={() => navigateAdmin('workout_library')}
                         onExercises={() => navigateAdmin('exercise_library')}
                         onAgenda={() => navigateAdmin('agenda')}
                         onFrequencyReport={() => navigateAdmin('frequency_report')}
                         onNotifications={() => setIsNotificationsOpen(true)}
                         onFeedbacks={() => setActivePanel('feedbacks')}
                         onUpdates={() => setActivePanel('updates')}
                         onPersonalContact={() => handleCopyLink(getTrainerWhatsAppUrl(), 'reg')}
                       />
                    ) : homeSubView === 'agenda' ? (
                       <AdminAgenda onBack={() => setHomeSubView('dashboard')} />
                    ) : homeSubView === 'retention' ? (
                       /* RETENTION VIEW (New Image Request) */
                       <div className="flex flex-col h-full bg-[#f4f7fa]">
                          {/* Header */}
                          <div className="bg-[#0c1622] p-4 pt-1 flex flex-col items-start gap-3">
                             <button
                               onClick={() => setHomeSubView('dashboard')}
                               className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80"
                             >
                               <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                             </button>
                             <h4 className="text-white text-xl font-black italic uppercase italic tracking-tighter text-left">Retenção</h4>
                          </div>

                          <div className="flex-1 overflow-y-auto pb-4 scrollbar-none p-4 space-y-4">
                             {/* Resumo do mês */}
                             <div className="bg-white rounded-xl p-4 shadow-sm space-y-4 border border-slate-100">
                                <div className="flex justify-between items-center px-1">
                                   <h5 className="text-[11px] font-black italic uppercase text-slate-900 leading-none">Resumo do mês</h5>
                                   <button onClick={() => setHomeSubView('frequency_report')} className="text-[10px] font-bold text-[#dc2626]">Ver gráficos</button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                   <div className="border border-slate-100 rounded-lg p-3 space-y-2 text-left">
                                      <div className="flex items-center gap-1.5 grayscale opacity-50">
                                         <User className="w-3 h-3" />
                                         <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 leading-none">Alunos Ativos</span>
                                      </div>
                                      <div className="space-y-0">
                                         <p className="text-xl font-black text-slate-900 leading-none">{activeCount}</p>
                                         <p className="text-[9px] font-bold text-emerald-500 leading-none mt-1">Cadastro atual</p>
                                      </div>
                                   </div>
                                   <div className="border border-slate-100 rounded-lg p-3 space-y-2 text-left">
                                      <div className="flex items-center gap-1.5 grayscale opacity-50">
                                         <TrendingUp className="w-3 h-3" />
                                         <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 leading-none">Engajamento</span>
                                      </div>
                                      <div className="space-y-0">
                                         <p className="text-xl font-black text-slate-900 leading-none">{engagementRate === null ? '—' : engagementRate + '%'}</p>
                                         <p className="text-[9px] font-bold text-emerald-500 leading-none mt-1">Com treino concluído no mês</p>
                                      </div>
                                   </div>
                                   <div className="border border-slate-100 rounded-lg p-3 space-y-2 text-left">
                                      <div className="flex items-center gap-1.5 grayscale opacity-50">
                                         <Sparkles className="w-3 h-3" />
                                         <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 leading-none">Treinos no mês</span>
                                      </div>
                                      <div className="space-y-0">
                                         <p className="text-xl font-black text-slate-900 leading-none">{attendanceFeed.loading || attendanceFeed.error ? '—' : attendance.monthLogs.length}</p>
                                         <p className="text-[9px] font-bold text-emerald-500 leading-none mt-1">Registros sincronizados</p>
                                      </div>
                                   </div>
                                   <div className="border border-slate-100 rounded-lg p-3 space-y-2 text-left">
                                      <div className="flex items-center gap-1.5 grayscale opacity-50">
                                         <ArrowUpRight className="w-3 h-3" />
                                         <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 leading-none">Alunos hoje</span>
                                      </div>
                                      <div className="space-y-0">
                                         <p className="text-xl font-black text-slate-900 leading-none">{attendanceFeed.loading || attendanceFeed.error ? '—' : attendance.studentsToday}</p>
                                         <p className="text-[9px] font-bold text-emerald-500 leading-none mt-1">Com treino concluído</p>
                                      </div>
                                   </div>
                                </div>

                                <button onClick={() => alert('Ativos e inativos vêm do cadastro. Engajamento considera alunos ativos com ao menos um treino concluído no mês atual. Treinos de hoje usam a data local.')} className="w-full text-center py-2 text-[9px] font-bold text-[#dc2626] uppercase tracking-wider">
                                   O que significam essas métricas?
                                </button>
                             </div>

                             {/* Engajamento dos alunos */}
                             <div className="bg-white rounded-xl p-4 shadow-sm space-y-4 border border-slate-100">
                                <div className="text-left px-1">
                                   <h5 className="text-[11px] font-black italic uppercase text-slate-900 leading-none">Engajamento dos alunos</h5>
                                   <p className="text-[9px] text-slate-400 font-bold mt-1">Alunos ativos, considerando os treinos concluídos neste mês</p>
                                </div>

                                <div className="space-y-3 px-1">
                                   {engajamentoCategorias.map((item) => (
                                      <div key={item.label} className="space-y-1.5 text-left">
                                         <div className="flex justify-between items-center text-[10px] font-bold text-slate-700">
                                            <span>{item.label}</span>
                                            <span>{item.count} ({item.percent}%)</span>
                                         </div>
                                         <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                                            <motion.div
                                              initial={{ width: 0 }}
                                              animate={{ width: `${item.percent}%` }}
                                              className={`h-full ${item.color}`}
                                            />
                                         </div>
                                      </div>
                                   ))}
                                </div>

                                <button onClick={() => alert('Com treino no mês: ao menos uma conclusão sincronizada no mês atual. Sem treino no mês: nenhuma conclusão sincronizada no período. Não é uma avaliação de saúde ou de qualidade do treino.')} className="w-full text-center py-2 text-[9px] font-bold text-[#dc2626] uppercase tracking-wider border-t border-slate-50 mt-2">
                                   Entenda a classificação de engajamento
                                </button>
                             </div>

                             {/* Alunos Section */}
                             <div className="space-y-3 pt-2">
                                <h5 className="text-[11px] font-black italic uppercase text-slate-900 px-1 text-left">Alunos</h5>

                                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1 flex">
                                   <input
                                     type="text"
                                     placeholder="Pesquise por nome, email ou telefone"
                                     className="flex-1 px-4 py-3 text-xs font-bold text-slate-900 outline-none"
                                   />
                                   <div className="p-3 border-l border-slate-100 flex items-center justify-center text-slate-400">
                                      <Search className="w-4 h-4" />
                                   </div>
                                </div>

                                <div className="flex gap-2">
                                   <div className="flex-1 bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between cursor-pointer">
                                      <span className="text-xs font-bold text-slate-900">Em risco</span>
                                      <ChevronDown className="w-4 h-4 text-slate-400" />
                                   </div>
                                   <button
                                     onClick={() => {
                                        setIsNotifyingByCategory(true);
                                        setNotifyStep('category');
                                        setSelectedCategoryForNotify(null);
                                        setSelectedUidsForNotify([]);
                                        setSendComplete(false);
                                     }}
                                     className="bg-[#dc2626] px-6 py-3 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-200 hover:bg-red-600 transition whitespace-nowrap"
                                   >
                                      <Send className="w-4 h-4" />
                                      <span>Notificar alunos</span>
                                   </button>
                                </div>

                                <div className="py-20 flex flex-col items-center justify-center opacity-30 grayscale">
                                   <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                                      <Search className="w-10 h-10" />
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>
                    ) : homeSubView === 'frequency_report' ? (
                       <WorkoutAttendanceReport logs={attendanceFeed.logs} loading={attendanceFeed.loading} error={attendanceFeed.error} onRefresh={attendanceFeed.refresh} users={users} onBack={() => setHomeSubView('dashboard')} />
                     ) : homeSubView === 'exercise_library' ? (
                       /* EXERCISE LIBRARY VIEW (Image-accurate) */
                        (() => {
                           const filteredExercises = exercises.filter(ex => {
                              if (exerciseSearch) {
                                 const s = exerciseSearch.toLowerCase();
                                 if (!ex.title.toLowerCase().includes(s) && !ex.group.toLowerCase().includes(s) && !ex.category.toLowerCase().includes(s)) {
                                    return false;
                                 }
                              }
                              if (exerciseFilter === 'favoritos' && !ex.isFavorite) return false;
                              if (exerciseFilter === 'app' && ex.isCustom) return false;
                              if (exerciseFilter === 'mine' && !ex.isCustom) return false;

                              if (selectedGroupFilter && ex.group !== selectedGroupFilter) return false;
                              if (selectedCategoryFilter && ex.category !== selectedCategoryFilter) return false;

                              return true;
                           });

                           const uniqueGroups = Array.from(new Set(exercises.map(e => e.group)));
                           const uniqueCategories = Array.from(new Set(exercises.map(e => e.category)));

                           // Limit rendering to prevent UI freeze when there are hundreds of exercises
                           const limitedExercises = filteredExercises.slice(0, 30);
                           const hasMoreExercises = filteredExercises.length > 30;

                           // Group exercises by active tab ('grupos' or 'categorias')
                           const grouped: Record<string, any[]> = {};
                           limitedExercises.forEach(ex => {
                              const key = exerciseTab === 'grupos' ? ex.group : ex.category;
                              if (!grouped[key]) grouped[key] = [];
                              grouped[key].push(ex);
                           });

                           const handleToggleFavorite = (id: string, e: React.MouseEvent) => {
                              e.stopPropagation();
                              if (!isDataLoaded) return;
                              const updated = exercises.map(ex => ex.id === id ? { ...ex, isFavorite: !ex.isFavorite } : ex);
                              setExercises(updated);
                              safeSetItem('cadu_exercise_favorites', JSON.stringify(Object.fromEntries(updated.map(ex => [ex.id, !!ex.isFavorite]))));
                           };

                           const handleDeleteExercise = async (exercise: LibraryExercise, e: React.MouseEvent) => {
                              e.stopPropagation();
                              if (!isDataLoaded) return;
                              if (!window.confirm('Excluir o exercício "' + exercise.title + '" da biblioteca? Os treinos já prescritos serão mantidos.')) return;
                              try {
                                await storage.deleteCustomExercise(exercise.id);
                                setExercises(prev => prev.filter(ex => ex.id !== exercise.id));
                              } catch (error) {
                                alert(error instanceof Error ? error.message : 'Não foi possível excluir o exercício. Tente novamente.');
                              }
                           };

                           const handleAddExerciseSubmit = async (e: React.FormEvent) => {
                              e.preventDefault();
                              if (!newExName.trim() || exerciseSaveLock.current || !isDataLoaded) return;
                              if (isUploadingExerciseImage || isUploadingExerciseVideo) {
                                setExerciseSaveError('Aguarde o envio dos arquivos antes de salvar.');
                                return;
                              }
                              if (uploadImageError || uploadVideoError) {
                                setExerciseSaveError('Corrija o envio do arquivo ou informe outro link antes de salvar.');
                                return;
                              }
                              exerciseSaveLock.current = true;
                              setIsSavingExercise(true);
                              setExerciseSaveError('');
                              try {
                                const original = exercises.find(ex => ex.id === editingExerciseId);
                                const newExObj: LibraryExercise = {
                                  id: editingExerciseId || exerciseDraftId.current,
                                  title: newExName.trim(), group: newExGroup, category: newExCategory,
                                  image: normalizeStoredMediaReference(newExImage) || '',
                                  description: newExDesc.trim(), isCustom: original?.isCustom ?? true,
                                  isFavorite: original?.isFavorite ?? false,
                                  ...exerciseVideoFields(newExVideo.trim(), original),
                                };
                                await storage.saveCustomExercise(newExObj);
                                setExercises(prev => [newExObj, ...prev.filter(ex => ex.id !== newExObj.id)]);
                                setExerciseFilter('mine');
                                setSelectedGroupFilter(null);
                                setSelectedCategoryFilter(null);
                                setExerciseSearch('');
                                setIsCreatingExercise(false);
                                setEditingExerciseId(null);
                                exerciseDraftId.current = crypto.randomUUID();
                                setNewExName(''); setNewExImage(''); setNewExVideo(''); setNewExDesc('');
                              } catch (error) {
                                setExerciseSaveError(error instanceof Error ? error.message : 'Não foi possível salvar o exercício. Tente novamente.');
                              } finally {
                                exerciseSaveLock.current = false;
                                setIsSavingExercise(false);
                              }
                           };

                           return (
                              <div className="flex flex-col h-full bg-[#f4f7fa] relative">
                                 {/* Header */}
                                 <div className="bg-[#0c1622] p-4 pt-1 flex flex-col items-start gap-4 shrink-0">
                                    <button
                                      onClick={() => setHomeSubView('dashboard')}
                                      className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80 cursor-pointer text-left py-2"
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5 inline inline-block" /> Voltar
                                    </button>
                                    <h4 className="text-white text-xl font-black italic uppercase tracking-tighter text-left leading-none">Biblioteca de exercícios</h4>
                                 </div>

                                 <div className="flex-1 overflow-y-auto bg-white m-4 rounded-xl shadow-sm border border-slate-100 flex flex-col p-4 space-y-4 relative">
                                    {!isDataLoaded && <p role="status" className="text-sm text-slate-500">Carregando a biblioteca...</p>}
                                    {/* Create button */}
                                    <button
                                      disabled={!isDataLoaded}
                                      onClick={() => {
                                        setEditingExerciseId(null); setExerciseSaveError('');
                                        setUploadImageError(null); setUploadVideoError(null);
                                        setUploadImageProgress(''); setUploadVideoProgress('');
                                        setNewExName(''); setNewExImage(''); setNewExVideo(''); setNewExDesc('');
                                        exerciseDraftId.current = crypto.randomUUID();
                                        setIsCreatingExercise(true);
                                      }}
                                      className="w-full py-4 border-2 border-[#dc2626] rounded-xl text-[#dc2626] text-xs font-black italic uppercase tracking-widest hover:bg-red-50 transition cursor-pointer"
                                    >
                                       + Criar exercício
                                    </button>

                                    {/* Main Tabs */}
                                    <div className="flex gap-2">
                                       <button
                                         onClick={() => setExerciseTab('grupos')}
                                         className={`flex-1 py-3 rounded-lg text-xs font-black italic uppercase tracking-tight transition cursor-pointer ${exerciseTab === 'grupos' ? 'bg-[#dc2626]/10 text-[#dc2626]' : 'bg-slate-50 text-slate-400'}`}
                                       >
                                          Grupos
                                       </button>
                                       <button
                                         onClick={() => setExerciseTab('categorias')}
                                         className={`flex-1 py-3 rounded-lg text-xs font-black italic uppercase tracking-tight transition cursor-pointer ${exerciseTab === 'categorias' ? 'bg-[#dc2626]/10 text-[#dc2626]' : 'bg-slate-50 text-slate-400'}`}
                                       >
                                          Categorias
                                       </button>
                                    </div>

                                    {/* Search */}
                                    <div className="relative">
                                       <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                       <input
                                         type="text"
                                         value={exerciseSearch}
                                         onChange={(e) => setExerciseSearch(e.target.value)}
                                         placeholder="Buscar exercícios..."
                                         className="w-full bg-white border border-slate-200 rounded-lg py-3 pl-11 pr-4 text-xs font-bold text-slate-600 outline-none focus:border-[#dc2626] transition"
                                       />
                                       {exerciseSearch && (
                                          <button
                                            onClick={() => setExerciseSearch('')}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                          >
                                             <X className="w-3.5 h-3.5" />
                                          </button>
                                       )}
                                    </div>

                                    {/* Filter Pills */}
                                    <div className="flex flex-wrap justify-center gap-2">
                                       <button
                                         onClick={() => setExerciseFilter('favoritos')}
                                         className={`px-4 py-2 rounded-lg text-[10px] font-black italic uppercase tracking-tight transition cursor-pointer ${exerciseFilter === 'favoritos' ? 'bg-[#dc2626] text-white' : 'bg-[#fef2f2] text-[#dc2626]'}`}
                                       >
                                          Favoritos
                                       </button>
                                       <button
                                         onClick={() => setExerciseFilter('app')}
                                         className={`px-4 py-2 rounded-lg text-[10px] font-black italic uppercase tracking-tight transition cursor-pointer ${exerciseFilter === 'app' ? 'bg-[#dc2626] text-white' : 'bg-[#fef2f2] text-[#dc2626]'}`}
                                       >
                                          Exercícios do app
                                       </button>
                                       <button
                                         onClick={() => setExerciseFilter('mine')}
                                         className={`px-4 py-2 rounded-lg text-[10px] font-black italic uppercase tracking-tight transition cursor-pointer ${exerciseFilter === 'mine' ? 'bg-[#dc2626] text-white' : 'bg-[#fef2f2] text-[#dc2626]'}`}
                                       >
                                          Seus exercícios
                                       </button>
                                    </div>

                                    {/* Secondary Select Filters */}
                                    <div className="flex justify-center items-center gap-4 relative">
                                       <button
                                         onClick={() => {
                                            setIsGroupDropdownOpen(!isGroupDropdownOpen);
                                            setIsCategoryDropdownOpen(false);
                                         }}
                                         className={`flex items-center gap-1 text-[10px] font-black italic uppercase transition cursor-pointer ${selectedGroupFilter ? 'text-[#dc2626] underline font-bold' : 'text-[#dc2626]'}`}
                                       >
                                          {selectedGroupFilter ? `Grupo: ${selectedGroupFilter}` : 'Grupos musculares'} <ChevronDown className="w-3 h-3" />
                                       </button>
                                       <button
                                         onClick={() => {
                                            setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                                            setIsGroupDropdownOpen(false);
                                         }}
                                         className={`flex items-center gap-1 text-[10px] font-black italic uppercase transition cursor-pointer ${selectedCategoryFilter ? 'text-[#dc2626] underline font-bold' : 'text-[#dc2626]'}`}
                                       >
                                          {selectedCategoryFilter ? `Categorias: ${selectedCategoryFilter}` : 'Categorias'} <ChevronDown className="w-3 h-3" />
                                       </button>
                                       {(selectedGroupFilter || selectedCategoryFilter || exerciseSearch || exerciseFilter !== 'app') && (
                                          <button
                                            onClick={() => {
                                               setSelectedGroupFilter(null);
                                               setSelectedCategoryFilter(null);
                                               setExerciseSearch('');
                                               setExerciseFilter('app');
                                            }}
                                            className="text-[10px] font-black italic uppercase text-[#dc2626] hover:text-[#ef4444] cursor-pointer"
                                          >
                                             Limpar
                                          </button>
                                       )}

                                       {/* Groups Dropdown */}
                                       {isGroupDropdownOpen && (
                                          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-150 rounded-lg shadow-lg py-1.5 z-20 min-w-[140px] text-left max-h-[200px] overflow-y-auto">
                                             <button
                                               onClick={() => {
                                                  setSelectedGroupFilter(null);
                                                  setIsGroupDropdownOpen(false);
                                               }}
                                               className="w-full px-3 py-1.5 text-[10px] font-bold text-slate-700 uppercase hover:bg-slate-50 flex items-center justify-between text-left cursor-pointer"
                                             >
                                                Todos
                                                {!selectedGroupFilter && <Check className="w-3 h-3 text-[#dc2626]" />}
                                             </button>
                                             {appMuscleGroups.map(grp => (
                                                <button
                                                  key={grp}
                                                  onClick={() => {
                                                     setSelectedGroupFilter(grp);
                                                     setIsGroupDropdownOpen(false);
                                                  }}
                                                  className="w-full px-3 py-1.5 text-[10px] font-bold text-slate-700 uppercase hover:bg-slate-50 flex items-center justify-between text-left cursor-pointer"
                                                >
                                                   {grp}
                                                   {selectedGroupFilter === grp && <Check className="w-3 h-3 text-[#dc2626]" />}
                                                </button>
                                             ))}
                                             <div className="border-t border-slate-100 mt-1">
                                               <button
                                                 onClick={() => {
                                                   setEditingOptionType('muscle');
                                                   setIsEditingOptions(true);
                                                   setIsGroupDropdownOpen(false);
                                                 }}
                                                 className="w-full px-3 py-2 text-[9px] font-black italic uppercase text-slate-400 hover:text-[#dc2626] transition text-left cursor-pointer flex items-center gap-1"
                                               >
                                                 + Editar Grupos
                                               </button>
                                             </div>
                                          </div>
                                       )}

                                       {/* Categories Dropdown */}
                                       {isCategoryDropdownOpen && (
                                          <div className="absolute top-full left-1/3 mt-1 bg-white border border-slate-150 rounded-lg shadow-lg py-1.5 z-20 min-w-[140px] text-left">
                                             <button
                                               onClick={() => {
                                                  setSelectedCategoryFilter(null);
                                                  setIsCategoryDropdownOpen(false);
                                               }}
                                               className="w-full px-3 py-1.5 text-[10px] font-bold text-slate-700 uppercase hover:bg-slate-50 flex items-center justify-between text-left cursor-pointer"
                                             >
                                                Todas
                                                {!selectedCategoryFilter && <Check className="w-3 h-3 text-[#dc2626]" />}
                                             </button>
                                             {appCategories.map(cat => (
                                                <button
                                                  key={cat}
                                                  onClick={() => {
                                                     setSelectedCategoryFilter(cat);
                                                     setIsCategoryDropdownOpen(false);
                                                  }}
                                                  className="w-full px-3 py-1.5 text-[10px] font-bold text-slate-700 uppercase hover:bg-slate-50 flex items-center justify-between text-left cursor-pointer"
                                                >
                                                   {cat}
                                                   {selectedCategoryFilter === cat && <Check className="w-3 h-3 text-[#dc2626]" />}
                                                </button>
                                             ))}
                                             <div className="border-t border-slate-100 mt-1">
                                               <button
                                                 onClick={() => {
                                                   setEditingOptionType('category');
                                                   setIsEditingOptions(true);
                                                   setIsCategoryDropdownOpen(false);
                                                 }}
                                                 className="w-full px-3 py-2 text-[9px] font-black italic uppercase text-slate-400 hover:text-[#dc2626] transition text-left cursor-pointer flex items-center gap-1"
                                               >
                                                 + Editar Categorias
                                               </button>
                                             </div>
                                          </div>
                                       )}
                                    </div>

                                    {/* Cards List Grouped */}
                                    <div className="space-y-6 pt-2 flex-1 animate-fadeIn">
                                       {Object.keys(grouped).length === 0 ? (
                                          <div className="py-12 text-center text-slate-400 space-y-3">
                                             <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                                                <Dumbbell className="w-6 h-6 text-slate-300 animate-pulse" />
                                             </div>
                                             <div className="space-y-1">
                                                <p className="text-xs font-black italic uppercase text-slate-700 tracking-wider">Nenhum exercício encontrado</p>
                                                <p className="text-[10px] text-slate-400 px-4">Tente buscar por um termo diferente ou mude seus filtros no painel.</p>
                                             </div>
                                             <button
                                               onClick={() => {
                                                  setExerciseSearch('');
                                                  setSelectedGroupFilter(null);
                                                  setSelectedCategoryFilter(null);
                                                  setExerciseFilter('app');
                                               }}
                                               className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[9px] font-black uppercase tracking-tight transition cursor-pointer"
                                             >
                                                Limpar tudo
                                             </button>
                                          </div>
                                       ) : (
                                          Object.keys(grouped).sort().map(sectionTitle => (
                                             <div key={sectionTitle} className="space-y-2 text-left">
                                                <h5 className="text-[10px] font-black italic tracking-widest text-[#dc2626] uppercase bg-[#dc2626]/5 px-2.5 py-1 rounded-md w-fit border border-[#dc2626]/10 mb-2">
                                                   {sectionTitle} ({grouped[sectionTitle].length})
                                                </h5>
                                                <div className="grid grid-cols-1 gap-3">
                                                   {grouped[sectionTitle].map((ex, idx) => (
                                                      <div
                                                        key={idx}
                                                        onClick={() => setPreviewingExercise(ex)}
                                                        className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex items-center p-2 gap-4 text-left hover:border-[#dc2626]/40 transition duration-250 cursor-pointer hover:shadow-md group"
                                                      >
                                                         <div className="relative w-24 h-20 bg-slate-900 rounded-lg shrink-0 overflow-hidden shadow-inner">
                                                            <PrivateImage src={ex.image} alt={ex.title} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition duration-300" referrerPolicy="no-referrer" />
                                                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                                                               <PlayCircle className="w-8 h-8 text-white/90 group-hover:scale-110 transition duration-300 drop-shadow-md" />
                                                            </div>
                                                         </div>
                                                         <div className="flex-1 min-w-0 pr-1">
                                                            <h5 className="text-[11px] font-black italic uppercase text-slate-900 tracking-tight leading-tight mb-2 truncate group-hover:text-[#dc2626] transition-colors">
                                                               {ex.title}
                                                            </h5>
                                                            {ex.syncStatus === 'pending' && <span className="block mb-2 text-[10px] font-bold text-amber-700">Rascunho neste dispositivo · abra para salvar</span>}
                                                            <div className="flex flex-wrap gap-1.5">
                                                               <span className="px-2 py-0.5 bg-slate-50 border border-slate-150 rounded-full text-[8px] font-bold text-slate-500 uppercase tracking-tight">
                                                                  {ex.group}
                                                               </span>
                                                               <span className="px-2 py-0.5 bg-slate-50 border border-slate-150 rounded-full text-[8px] font-bold text-slate-500 uppercase tracking-tight">
                                                                  {ex.category}
                                                               </span>
                                                            </div>
                                                         </div>
                                                         <div className="flex items-center">
                                                              <button
                                                                disabled={!isDataLoaded}
                                                                aria-label={`Editar exercício ${ex.title}`}
                                                                onClick={(evt) => {
                                                                  evt.stopPropagation();
                                                                  if (!isDataLoaded) return;
                                                                  setEditingExerciseId(ex.id);
                                                                  setExerciseSaveError('');
                                                                  setUploadImageError(null);
                                                                  setUploadVideoError(null);
                                                                  setNewExName(ex.title);
                                                                  setNewExGroup(ex.group);
                                                                  setNewExCategory(ex.category);
                                                                  setNewExImage(ex.image);
                                                                  setNewExVideo(ex.videoFileUrl || ex.videoUrl || '');
                                                                  setNewExDesc(ex.description || '');
                                                                  setIsCreatingExercise(true);
                                                                }}
                                                                className="pr-2 cursor-pointer focus:outline-none shrink-0"
                                                              >
                                                                 <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center transition-all text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                                                                    <Edit3 className="w-3.5 h-3.5" />
                                                                 </div>
                                                              </button>
                                                           <button
                                                             onClick={(evt) => handleToggleFavorite(ex.id, evt)}
                                                             className="pr-2 cursor-pointer focus:outline-none shrink-0"
                                                           >
                                                              <div className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all ${ex.isFavorite ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'}`}>
                                                                 <Star className={`w-3.5 h-3.5 ${ex.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                                                              </div>
                                                           </button>
                                                           <button
                                                             onClick={(evt) => handleDeleteExercise(ex, evt)}
                                                             className="pr-2 cursor-pointer focus:outline-none shrink-0"
                                                             disabled={!isDataLoaded}
                                                             title="Excluir exercício"
                                                           >
                                                              <div className="w-7 h-7 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center transition-all text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200">
                                                                 <Trash2 className="w-3.5 h-3.5" />
                                                              </div>
                                                           </button>
                                                         </div>
                                                      </div>
                                                   ))}
                                                </div>
                                             </div>
                                          ))
                                       )}
                                    </div>
                                 </div>

                                 {/* MODAL: PREVIEW DETAILS & VIDEO LOOPS */}
                                 {previewingExercise && (
                                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col justify-end p-4">
                                       <motion.div
                                         initial={{ y: 150, opacity: 0 }}
                                         animate={{ y: 0, opacity: 1 }}
                                         className="bg-white rounded-2xl p-5 space-y-4 max-h-[95%] overflow-y-auto flex flex-col text-left text-slate-900"
                                       >
                                          <div className="flex justify-between items-start gap-4 text-left">
                                             <div>
                                                <div className="flex gap-2 mb-1">
                                                   <span className="px-2 py-0.5 bg-red-50 text-[#dc2626] rounded text-[8px] font-bold uppercase">{previewingExercise.group}</span>
                                                   <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-bold uppercase">{previewingExercise.category}</span>
                                                </div>
                                                <h3 className="text-[13px] font-black italic uppercase text-slate-900 tracking-tight leading-none text-left">
                                                   {previewingExercise.title}
                                                </h3>
                                             </div>
                                             <button
                                               onClick={() => setPreviewingExercise(null)}
                                               className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer shrink-0"
                                             >
                                                <X className="w-4 h-4" />
                                             </button>
                                          </div>

                                          {/* Video demonstration container */}
                                          <div className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-inner flex items-center justify-center">
                                             <ExerciseVideoPlayer
                                               key={previewingExercise.title}
                                               url={previewingExercise.videoFileUrl || previewingExercise.videoUrl || ''}
                                               className="w-full h-full object-cover"
                                             />
                                             <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[8px] font-black uppercase tracking-widest rounded flex items-center gap-1.5 pointer-events-none">
                                                <span className="relative flex h-1.5 w-1.5">
                                                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                   <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                                </span>
                                                DEMO LIVE
                                             </div>
                                          </div>

                                          <div className="space-y-1 text-left">
                                             <h4 className="text-[10px] font-black uppercase text-slate-900 tracking-wide">Instruções de Execução</h4>
                                             <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                                {previewingExercise.description}
                                             </p>
                                          </div>

                                          <div className="h-px bg-slate-100" />

                                          <div className="flex gap-2">
                                             <button
                                               onClick={(evt) => {
                                                  handleToggleFavorite(previewingExercise.id, evt);
                                                  setPreviewingExercise(prev => prev ? { ...prev, isFavorite: !prev.isFavorite } : null);
                                               }}
                                               className="flex-1 py-3 border border-slate-200 rounded-xl text-xs font-black italic uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-slate-50 cursor-pointer"
                                             >
                                                <Star className={`w-3.5 h-3.5 ${previewingExercise.isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
                                                {previewingExercise.isFavorite ? 'Favoritado' : 'Favoritar'}
                                             </button>
                                             <button
                                               onClick={() => setPreviewingExercise(null)}
                                               className="flex-1 py-3 bg-[#dc2626] text-white rounded-xl text-xs font-black italic uppercase tracking-wider hover:bg-[#ef4444] transition cursor-pointer"
                                             >
                                                Fechar modal
                                             </button>
                                          </div>
                                       </motion.div>
                                    </div>
                                 )}

                                 {/* MODAL: CREATE CUSTOM EXERCISE FORM */}
                                 {isCreatingExercise && (
                                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col justify-end p-4">
                                       <motion.div
                                         initial={{ y: 250, opacity: 0 }}
                                         animate={{ y: 0, opacity: 1 }}
                                         className="bg-white rounded-2xl p-5 space-y-4 max-h-[95%] overflow-y-auto flex flex-col text-left text-slate-900"
                                       >
                                          <div className="flex justify-between items-center text-left mb-6">
                                              <h3 className="text-xl font-black italic uppercase text-slate-900 tracking-tight leading-none">
                                                {editingExerciseId ? 'Editar Exercício' : 'Novo Exercício'}
                                              </h3>
                                              <button
                                                disabled={isSavingExercise || isUploadingExerciseImage || isUploadingExerciseVideo}
                                                onClick={() => {
                                                  setIsCreatingExercise(false);
                                                  setEditingExerciseId(null);
                                                  // reset
                                                  setNewExName('');
                                                  setNewExImage('');
                                                  setNewExVideo('');
                                                  setNewExDesc('');
                                                }}
                                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                                              >
                                                 <X className="w-4 h-4" />
                                              </button>
                                           </div>

                                          <form onSubmit={handleAddExerciseSubmit} className="space-y-4 text-left">
                                             {exerciseSaveError && <p role="alert" className="text-sm text-red-600">{exerciseSaveError}</p>}
                                             {editingExerciseId && <p className="text-xs text-slate-500">Treinos já prescritos mantêm suas configurações. Edite a rotina para alterá-los.</p>}
                                             <div>
                                                <label className="text-[10px] font-black uppercase text-slate-900 block mb-1">Nome do exercício *</label>
                                                <input
                                                  type="text"
                                                  value={newExName}
                                                  onChange={(e) => setNewExName(e.target.value)}
                                                  placeholder="Ex: Tríceps Testa Pronado"
                                                  required
                                                  className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-[#1a202c] outline-none focus:border-[#dc2626]"
                                                />
                                             </div>

                                             <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                   <label className="text-[10px] font-black uppercase text-slate-900 block mb-1">Grupo muscular</label>
                                                   <select
                                                     value={newExGroup}
                                                     onChange={(e) => setNewExGroup(e.target.value)}
                                                     className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-slate-700 outline-none focus:border-[#dc2626]"
                                                   >
                                                      {appMuscleGroups.map(grp => (
                                                         <option key={grp} value={grp}>{grp.toUpperCase()}</option>
                                                      ))}
                                                   </select>
                                                </div>
                                                <div>
                                                   <label className="text-[10px] font-black uppercase text-slate-900 block mb-1">Categoria</label>
                                                   <select
                                                     value={newExCategory}
                                                     onChange={(e) => setNewExCategory(e.target.value)}
                                                     className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-slate-700 outline-none focus:border-[#dc2626]"
                                                   >
                                                      {appCategories.map(cat => (
                                                         <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                                                      ))}
                                                   </select>
                                                </div>
                                             </div>
                                                              <div>
                                                 <label className="text-[10px] font-black uppercase text-slate-900 block mb-1">Imagem do Exercício (Opcional)</label>
                                                 <div className="flex flex-col gap-2">
                                                   <input
                                                     type="url"
                                                     value={newExImage}
                                                     onChange={(e) => { setNewExImage(e.target.value); setUploadImageError(null); }}
                                                     placeholder="URL da imagem (https://...)"
                                                     className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-[#1a202c] outline-none focus:border-[#dc2626]"
                                                   />

                                                   {/* Preview */}
                                                   {newExImage && <ExerciseImagePreview url={newExImage} />}

                                                   <div className="flex items-center gap-2 w-full">
                                                     <div className="h-px bg-slate-200 flex-1" />
                                                     <span className="text-[9px] font-black italic uppercase text-slate-400">ou enviar arquivo</span>
                                                     <div className="h-px bg-slate-200 flex-1" />
                                                   </div>

                                                   <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-dashed cursor-pointer transition ${
                                                     isUploadingExerciseImage
                                                       ? 'border-blue-300 bg-blue-50 opacity-80 pointer-events-none'
                                                       : uploadImageError
                                                       ? 'border-red-300 bg-red-50'
                                                       : newExImage && (newExImage.startsWith('data:image') || (newExImage.startsWith('http') && !newExImage.includes('unsplash')))
                                                       ? 'border-emerald-300 bg-emerald-50 hover:border-emerald-400'
                                                       : 'border-slate-200 hover:border-[#dc2626]/40'
                                                   }`}>
                                                     <input
                                                       type="file"
                                                       accept="image/jpeg,image/png,image/webp,image/gif"
                                                       className="hidden"
                                                       onChange={async (e) => {
                                                         const file = e.target.files?.[0];
                                                         if (!file) return;
                                                         setIsUploadingExerciseImage(true);
                                                         setUploadImageError(null);
                                                         setUploadImageProgress(`Enviando ${file.name}…`);

                                                         try {
                                                           const url = await storage.uploadExerciseVideo(file, `img-${Date.now()}`);
                                                           setNewExImage(url);
                                                           setUploadImageProgress('✅ Imagem enviada com sucesso!');
                                                         } catch (err: any) {
                                                           setUploadImageError(err?.message ?? 'Erro ao enviar imagem.');
                                                           setUploadImageProgress('');
                                                         } finally {
                                                           setIsUploadingExerciseImage(false);
                                                         }
                                                       }}
                                                     />
                                                     {isUploadingExerciseImage ? (
                                                       <span className="text-[10px] font-black uppercase text-blue-500">⏳ {uploadImageProgress || 'Enviando…'}</span>
                                                     ) : uploadImageError ? (
                                                       <span className="text-[10px] font-bold text-red-500 text-center leading-snug">{uploadImageError}</span>
                                                     ) : uploadImageProgress ? (
                                                       <span className="text-[10px] font-black uppercase text-emerald-600">{uploadImageProgress}</span>
                                                     ) : (
                                                       <>
                                                         <Plus className="w-4 h-4 text-slate-400" />
                                                         <span className="text-[10px] font-black uppercase text-slate-500">Escolher Imagem</span>
                                                       </>
                                                     )}
                                                   </label>
                                                 </div>
                                              </div>

                                              <div>
                                                 <label className="text-[10px] font-black uppercase text-slate-900 block mb-1">Vídeo Demonstrativo (Opcional)</label>
                                                 <div className="flex flex-col gap-2">
                                                   <input
                                                     type="url"
                                                     value={newExVideo}
                                                     onChange={(e) => { setNewExVideo(e.target.value); setUploadVideoError(null); }}
                                                     placeholder="URL do vídeo (https://youtube.com/...)"
                                                     className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-[#1a202c] outline-none focus:border-[#dc2626]"
                                                   />

                                                   {/* Video preview */}
                                                   {newExVideo && (
                                                     <div className="w-full rounded-lg overflow-hidden border border-slate-200 bg-black flex items-center justify-center max-h-36">
                                                       <ExerciseVideoPlayer url={newExVideo} className="w-full max-h-36 object-contain" />
                                                     </div>
                                                   )}

                                                   <div className="flex items-center gap-2 w-full">
                                                     <div className="h-px bg-slate-200 flex-1" />
                                                     <span className="text-[9px] font-black italic uppercase text-slate-400">ou enviar arquivo</span>
                                                     <div className="h-px bg-slate-200 flex-1" />
                                                   </div>

                                                   <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-dashed cursor-pointer transition ${
                                                     isUploadingExerciseVideo
                                                       ? 'border-blue-300 bg-blue-50 opacity-80 pointer-events-none'
                                                       : uploadVideoError
                                                       ? 'border-red-300 bg-red-50'
                                                       : uploadVideoProgress && !isUploadingExerciseVideo
                                                       ? 'border-emerald-300 bg-emerald-50'
                                                       : 'border-slate-200 hover:border-[#dc2626]/40'
                                                   }`}>
                                                     <input
                                                       type="file"
                                                       accept="video/mp4,video/webm,video/quicktime"
                                                       className="hidden"
                                                       onChange={async (e) => {
                                                         const file = e.target.files?.[0];
                                                         if (!file) return;
                                                         setIsUploadingExerciseVideo(true);
                                                         setUploadVideoError(null);
                                                         setUploadVideoProgress(`Enviando ${file.name}…`);

                                                         try {
                                                           const url = await storage.uploadExerciseVideo(file, `vid-${Date.now()}`);
                                                           setNewExVideo(url);
                                                           setUploadVideoProgress('✅ Vídeo enviado com sucesso!');
                                                         } catch (err: any) {
                                                           setUploadVideoError(err?.message ?? 'Erro ao enviar vídeo.');
                                                           setUploadVideoProgress('');
                                                         } finally {
                                                           setIsUploadingExerciseVideo(false);
                                                         }
                                                       }}
                                                     />
                                                     {isUploadingExerciseVideo ? (
                                                       <span className="text-[10px] font-black uppercase text-blue-500">⏳ {uploadVideoProgress || 'Enviando…'}</span>
                                                     ) : uploadVideoError ? (
                                                       <span className="text-[10px] font-bold text-red-500 text-center leading-snug px-2">{uploadVideoError}</span>
                                                     ) : uploadVideoProgress ? (
                                                       <span className="text-[10px] font-black uppercase text-emerald-600">{uploadVideoProgress}</span>
                                                     ) : (
                                                       <>
                                                         <Plus className="w-4 h-4 text-slate-400" />
                                                         <span className="text-[10px] font-black uppercase text-slate-500">Escolher Vídeo</span>
                                                       </>
                                                     )}
                                                   </label>

                                                   <p className="text-[9px] text-slate-400 text-center leading-relaxed">
                                                     Formatos aceitos: MP4, WebM e MOV · Máximo: 100 MB.<br />
                                                     Para vídeos maiores, use uma URL do YouTube no campo acima.
                                                   </p>
                                                 </div>
                                              </div>

                                             <div>
                                                <label className="text-[10px] font-black uppercase text-slate-900 block mb-1">Descrição / Instrução de Execução</label>
                                                <textarea
                                                  value={newExDesc}
                                                  onChange={(e) => setNewExDesc(e.target.value)}
                                                  placeholder="Descreva a postura recomendada, respiração e repetições sugeridas."
                                                  rows={3}
                                                  className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-[#1a202c] outline-none focus:border-[#dc2626] resize-none"
                                                />
                                             </div>

                                             <div className="flex gap-2 pt-2">
                                                <button
                                                  type="button"
                                                  disabled={isSavingExercise || isUploadingExerciseImage || isUploadingExerciseVideo}
                                                  onClick={() => { setIsCreatingExercise(false); setEditingExerciseId(null); }}
                                                  className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl text-xs font-black italic uppercase tracking-wider text-center hover:bg-slate-200 cursor-pointer"
                                                >
                                                   Cancelar
                                                </button>
                                                <button
                                                  type="submit"
                                                  disabled={isSavingExercise || isUploadingExerciseImage || isUploadingExerciseVideo}
                                                  className="disabled:opacity-50 disabled:cursor-not-allowed flex-1 py-3 bg-[#dc2626] text-white rounded-xl text-xs font-black italic uppercase tracking-wider text-center hover:bg-[#ef4444] cursor-pointer"
                                                >
                                                   {isSavingExercise ? 'Salvando...' : 'Salvar'}
                                                </button>
                                             </div>
                                          </form>
                                       </motion.div>
                                    </div>
                                 )}
                              </div>
                           );
                        })()
                        ) : homeSubView === 'create_routine' ? (
                       /* CREATE ROUTINE VIEW — FUNCTIONAL */
                       <div className="flex flex-col h-full bg-[#f4f7fa]">
                          <div className="bg-[#0c1622] p-4 flex justify-center border-b border-white/10 shrink-0">
                             <div className="flex items-center gap-1.5 grayscale opacity-80 brightness-200">
                                <div className="w-6 h-6 border-2 border-white rounded flex items-center justify-center">
                                   <div className="w-1 h-3 bg-white" />
                                </div>
                                <span className="text-sm font-black tracking-tighter text-white">CADU PONCE</span>
                             </div>
                          </div>

                          <div className="bg-[#0c1622] p-4 pt-1 flex flex-col items-start gap-4 shrink-0">
                             <button
                               onClick={() => setHomeSubView('workout_library')}
                               className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80"
                             >
                               <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                             </button>
                             <h4 className="text-white text-xl font-black italic uppercase tracking-tighter text-left leading-none">
                               {editingRoutine ? 'Editar Rotina' : 'Nova Rotina'}
                             </h4>
                          </div>

                          <div className="flex-1 overflow-y-auto pb-10">
                             <div className="m-4 bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">

                                {/* Routine Name */}
                                <div className="space-y-1.5 text-left">
                                  <label className="text-[10px] font-bold text-slate-900 uppercase">Nome da Rotina *</label>
                                  <input
                                    type="text"
                                    value={routineName}
                                    onChange={(e) => setRoutineName(e.target.value)}
                                    placeholder="Ex: Treino A — Peito e Tríceps"
                                    className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition"
                                  />
                                </div>

                                {/* Goal */}
                                <div className="space-y-1.5 text-left">
                                  <label className="text-[10px] font-bold text-slate-900 uppercase">Objetivo</label>
                                  <select
                                    value={routineGoal}
                                    onChange={(e) => setRoutineGoal(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none appearance-none"
                                  >
                                    <option>Hipertrofia</option>
                                    <option>Emagrecimento</option>
                                    <option>Definição muscular</option>
                                    <option>Ganho de Força</option>
                                    <option>Condicionamento</option>
                                    <option>Reabilitação</option>
                                  </select>
                                </div>

                                {/* Difficulty */}
                                <div className="space-y-1.5 text-left">
                                  <label className="text-[10px] font-bold text-slate-900 uppercase">Dificuldade</label>
                                  <select
                                    value={routineDifficulty}
                                    onChange={(e) => setRoutineDifficulty(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none appearance-none"
                                  >
                                    <option>Iniciante</option>
                                    <option>Adaptação</option>
                                    <option>Intermediário</option>
                                    <option>Avançado</option>
                                  </select>
                                </div>

                                {/* Assign to Students */}
                                <div className="space-y-2 text-left">
                                  <label className="text-[10px] font-bold text-slate-900 uppercase">Atribuir a Alunos (Opcional)</label>
                                  <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-lg p-2 space-y-1 bg-slate-50">
                                    {users.filter(u => u.role === 'student').length === 0 ? (
                                      <p className="text-[9px] font-bold text-slate-400 p-2">Nenhum aluno cadastrado.</p>
                                    ) : (
                                      users.filter(u => u.role === 'student').map(student => (
                                        <label key={student.uid} className="flex items-center gap-2 p-1.5 hover:bg-slate-100 rounded cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={routineStudentIds.includes(student.uid)}
                                            onChange={(e) => {
                                              if (e.target.checked) setRoutineStudentIds(prev => [...prev, student.uid]);
                                              else setRoutineStudentIds(prev => prev.filter(id => id !== student.uid));
                                            }}
                                            className="w-3 h-3 text-[#dc2626] rounded border-slate-300"
                                          />
                                          <span className="text-[10px] font-bold text-slate-700">{student.name}</span>
                                        </label>
                                      ))
                                    )}
                                  </div>
                                </div>

                                {/* General notes */}
                                <div className="space-y-1.5 text-left">
                                  <label className="text-[10px] font-bold text-slate-900 uppercase">Orientações Gerais (Exibidas ao aluno)</label>
                                  <textarea
                                    placeholder="Orientações gerais para o aluno ver no treino..."
                                    value={routineGeneralNotes}
                                    onChange={(e) => setRoutineGeneralNotes(e.target.value)}
                                    className="w-full min-h-[70px] px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] resize-none transition"
                                  />
                                </div>
                             </div>

                             {/* Exercises Section */}
                             <div className="mx-4 mb-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                                    Exercícios ({routineExercises.length})
                                  </h5>
                                  <button
                                    onClick={addExerciseToRoutine}
                                    className="flex items-center gap-1 text-[10px] font-black text-[#dc2626] uppercase tracking-wide hover:opacity-80 transition cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> Adicionar
                                  </button>
                                </div>
                                <datalist id="exercise-library-list">
                                  {exercises.map(libEx => (
                                    <option key={libEx.id} value={libEx.title} />
                                  ))}
                                </datalist>

                                {routineExercises.length === 0 && (
                                  <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                                    <Dumbbell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                    <p className="text-[11px] font-bold text-slate-400">Nenhum exercício adicionado</p>
                                    <button
                                      onClick={addExerciseToRoutine}
                                      className="mt-3 text-[10px] font-black text-[#dc2626] uppercase"
                                    >
                                      + Adicionar exercício
                                    </button>
                                  </div>
                                )}

                                {routineExercises.map((ex, idx) => (
                                  <div key={ex.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                       <div className="flex items-center gap-2">
                                         <span className="text-[9px] font-black text-[#dc2626] uppercase tracking-widest">Exercício {idx + 1}</span>
                                         {(ex.combinedWithNext || (idx > 0 && routineExercises[idx - 1]?.combinedWithNext)) && (
                                           <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[8px] font-black uppercase tracking-wider">
                                             🔗 Combinado (Bi-set)
                                           </span>
                                         )}
                                       </div>
                                       <div className="flex items-center gap-2">
                                         {idx < routineExercises.length - 1 && (
                                           <button
                                             type="button"
                                             onClick={() => updateRoutineExercise(idx, 'combinedWithNext', !ex.combinedWithNext)}
                                             className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition cursor-pointer ${
                                               ex.combinedWithNext
                                                 ? 'bg-blue-600 text-white shadow-xs'
                                                 : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                             }`}
                                             title="Combinar este exercício com o próximo em bi-set / carrossel deslizável"
                                           >
                                             <LinkIcon className="w-3 h-3" />
                                             {ex.combinedWithNext ? 'Combinado (Bi-set) ✓' : '+ Combinar (Bi-set)'}
                                           </button>
                                         )}
                                         <button
                                           onClick={() => setSelectingExerciseForIdx(idx)}
                                           className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-[#dc2626] hover:bg-red-100 rounded-lg text-[10px] font-black uppercase tracking-tight transition cursor-pointer"
                                         >
                                           <Search className="w-3.5 h-3.5" /> Puxar da Biblioteca
                                         </button>
                                         <button
                                           onClick={() => removeRoutineExercise(idx)}
                                           className="text-slate-400 hover:text-red-500 transition cursor-pointer"
                                         >
                                           <Trash2 className="w-3.5 h-3.5" />
                                         </button>
                                       </div>
                                     </div>

                                    {/* Exercise Name */}
                                    <div>
                                      <input
                                        type="text"
                                        list="exercise-library-list"
                                        value={ex.name}
                                        onChange={(e) => {
                                          const newName = e.target.value;
                                          const matches = exercises.filter(lib => lib.title.toLowerCase() === newName.toLowerCase());
                                          const libEx = matches.length === 1 ? matches[0] : undefined;
                                          if (libEx) {
                                            updateRoutineExercise(idx, {
                                              name: newName,
                                              ...exerciseVideoFields(libEx.videoFileUrl || libEx.videoUrl || '', libEx),
                                              notes: libEx.description || ''
                                            });
                                          } else {
                                            updateRoutineExercise(idx, 'name', newName);
                                          }
                                        }}
                                        placeholder="Nome do exercício"
                                        className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition"
                                      />
                                    </div>

                                    {/* Sets / Reps / Rest */}
                                    <div className="grid grid-cols-3 gap-2">
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase">Séries</label>
                                        <input
                                          type="number"
                                          value={ex.sets}
                                          onChange={(e) => updateRoutineExercise(idx, 'sets', parseInt(e.target.value) || 1)}
                                          min={1}
                                          className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition text-center"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase">Reps</label>
                                        <input
                                          type="text"
                                          value={ex.reps}
                                          onChange={(e) => updateRoutineExercise(idx, 'reps', e.target.value)}
                                          placeholder="12"
                                          className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition text-center"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase">Descanso</label>
                                        <input
                                          type="text"
                                          value={ex.rest}
                                          onChange={(e) => updateRoutineExercise(idx, 'rest', e.target.value)}
                                          placeholder="60s"
                                          className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition text-center"
                                        />
                                      </div>
                                    </div>

                                    {/* Prescribed Loads */}
                                    <div className="space-y-1 mt-2">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase">Cargas por Série (kg) - Opcional</label>
                                      <div className="flex gap-2 overflow-x-auto pb-1">
                                        {Array.from({ length: ex.sets || 1 }).map((_, setIdx) => (
                                          <div key={setIdx} className="flex-1 min-w-[60px]">
                                            <input
                                              type="number"
                                              value={ex.prescribedLoads?.[setIdx] || ''}
                                              onChange={(e) => {
                                                const newLoads = [...(ex.prescribedLoads || Array(ex.sets).fill(0))];
                                                newLoads[setIdx] = parseInt(e.target.value) || 0;
                                                updateRoutineExercise(idx, 'prescribedLoads', newLoads);
                                              }}
                                              placeholder={`S${setIdx + 1}`}
                                              className="w-full px-2 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-800 outline-none focus:border-[#dc2626] transition text-center"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Link/Badge for Media/Notes */}
                                    <div className="flex items-center justify-between pt-1">
                                      <div className="flex gap-2">
                                        {(ex.videoUrl || ex.videoFileUrl || ex.notes) && !expandedExerciseDetails.includes(idx) && (
                                          <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-tight">
                                            <Check className="w-3 h-3" /> Mídia/Obs vinculados
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => setExpandedExerciseDetails(prev =>
                                          prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                        )}
                                        className="text-[9px] font-black text-slate-400 hover:text-[#dc2626] uppercase transition flex items-center gap-1 cursor-pointer"
                                      >
                                        {expandedExerciseDetails.includes(idx) ? (
                                          <><ChevronUp className="w-3 h-3" /> Ocultar detalhes</>
                                        ) : (
                                          <><ChevronDown className="w-3 h-3" /> Ver/Editar detalhes</>
                                        )}
                                      </button>
                                    </div>

                                    {expandedExerciseDetails.includes(idx) && (
                                      <div className="space-y-3 pt-2 border-t border-slate-100">
                                        {/* Video Link */}
                                        <div className="space-y-1.5">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                        <LinkIcon className="w-3 h-3" /> Link do vídeo (YouTube ou outro)
                                      </label>
                                      <input
                                        type="url"
                                        value={ex.videoUrl || ''}
                                        onChange={(e) => updateRoutineExercise(idx, 'videoUrl', e.target.value)}
                                        placeholder="https://youtube.com/watch?v=..."
                                        className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-700 outline-none focus:border-[#dc2626] transition"
                                      />
                                      {ex.videoUrl && (ex.videoUrl.includes('youtube.com') || ex.videoUrl.includes('youtu.be')) && (() => {
                                        const ytId = ex.videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
                                        return ytId ? (
                                          <PrivateImage src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="YouTube preview" className="w-full rounded-lg object-cover h-24" />
                                        ) : null;
                                      })()}
                                    </div>

                                    {/* Video File Upload */}
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                        <Video className="w-3 h-3" /> Ou anexar vídeo (MP4, MOV)
                                      </label>
                                      {ex.videoFileUrl ? (
                                        <div className="flex items-center gap-2">
                                          <ExerciseVideoPlayer url={ex.videoFileUrl} className="w-full rounded-lg h-24 object-cover bg-black" />
                                          <button
                                            onClick={() => updateRoutineExercise(idx, 'videoFileUrl', '')}
                                            className="text-slate-400 hover:text-red-500 shrink-0"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      ) : (
                                        <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-dashed border-slate-200 cursor-pointer hover:border-[#dc2626]/40 transition ${uploadingVideoIdx === idx ? 'opacity-50 pointer-events-none' : ''}`}>
                                          <input
                                            type="file"
                                            accept="video/mp4,video/webm,video/quicktime"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) handleExerciseVideoUpload(idx, file);
                                            }}
                                          />
                                          {uploadingVideoIdx === idx ? (
                                            <span className="text-[10px] font-bold text-slate-400">Enviando...</span>
                                          ) : (
                                            <>
                                              <Video className="w-4 h-4 text-slate-400" />
                                              <span className="text-[10px] font-bold text-slate-400">Clique para selecionar vídeo</span>
                                            </>
                                          )}
                                        </label>
                                      )}
                                    </div>

                                    {/* Notes */}
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase">Observações</label>
                                      <input
                                        type="text"
                                        value={ex.notes || ''}
                                        onChange={(e) => updateRoutineExercise(idx, 'notes', e.target.value)}
                                        placeholder="Ex: Foco na contração, não trave o joelho..."
                                        className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-700 outline-none focus:border-[#dc2626] transition"
                                      />
                                    </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {routineExercises.length > 0 && (
                                  <button
                                    onClick={addExerciseToRoutine}
                                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-wide hover:border-[#dc2626]/40 hover:text-[#dc2626] transition"
                                  >
                                    + Adicionar exercício
                                  </button>
                                )}
                             </div>

                             <div className="mx-4 mb-4 space-y-2 text-sm text-slate-800">
                               <label className="flex gap-2"><input type="checkbox" checked={routinePdfPermission === 'Sim'} onChange={event => setRoutinePdfPermission(event.target.checked ? 'Sim' : 'Não')} />Permitir PDF para o aluno</label>
                               <label className="flex gap-2"><input type="checkbox" checked={routineShowTime === 'Sim'} onChange={event => setRoutineShowTime(event.target.checked ? 'Sim' : 'Não')} />Mostrar cronômetro ao aluno</label>
                               <label className="flex gap-2"><input type="checkbox" checked={routineHideBeforeStart} onChange={event => setRoutineHideBeforeStart(event.target.checked)} />Exibir somente após a data inicial</label>
                               <label className="flex gap-2"><input type="checkbox" checked={routineHideAfterEnd} onChange={event => setRoutineHideAfterEnd(event.target.checked)} />Ocultar após a data final</label>
                             </div>
                             {/* Save Button */}
                             <div className="mx-4 mb-4">
                               <button
                                 onClick={handleSaveAdminRoutine}
                                 disabled={!isDataLoaded || !routineName || routineName === 'NOME DA ROTINA' || isSavingRoutine || uploadingVideoIdx !== null}
                                 className="w-full bg-[#dc2626] py-4 rounded-xl text-white font-black italic uppercase text-xs tracking-widest shadow-lg shadow-red-200 hover:bg-[#ef4444] transition disabled:opacity-40 disabled:cursor-not-allowed"
                               >
                                 {isSavingRoutine ? 'Salvando...' : editingRoutine ? 'Salvar Alterações' : 'Salvar Rotina'}
                               </button>
                             </div>
                          </div>
                       </div>
                  ) : homeSubView === 'workout_library' ? (
                     /* WORKOUT LIBRARY VIEW — FUNCTIONAL */
                     <div className="flex flex-col h-full bg-[#f4f7fa]">
                        <div className="bg-[#0c1622] p-4 pt-6 flex flex-col items-start gap-4 shrink-0">
                           <button
                             onClick={() => setHomeSubView('dashboard')}
                             className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80 cursor-pointer text-left"
                           >
                             <ChevronLeft className="w-3.5 h-3.5 inline inline-block" /> Voltar
                           </button>
                           <h4 className="text-white text-xl font-black italic uppercase tracking-tighter">Biblioteca de treinos</h4>
                        </div>

                        {/* Tabs */}
                        <div className="flex bg-[#0c1622] px-0 shrink-0">
                           <button
                             onClick={() => setRoutineLibraryTab('strength')}
                             className={`flex-1 py-3 text-xs font-bold transition cursor-pointer ${routineLibraryTab === 'strength' ? 'bg-[#f4f7fa] text-slate-900 rounded-t-lg' : 'bg-transparent text-white/70 hover:text-white'}`}
                           >
                             Rotinas de Treino
                           </button>
                           <button
                             onClick={() => setRoutineLibraryTab('aerobic')}
                             className={`flex-1 py-3 text-xs font-bold transition cursor-pointer ${routineLibraryTab === 'aerobic' ? 'bg-[#f4f7fa] text-slate-900 rounded-t-lg' : 'bg-transparent text-white/70 hover:text-white'}`}
                           >
                             Aeróbico
                           </button>
                        </div>

                        <div className="p-4 space-y-4 overflow-y-auto flex-1">
                           {routineLibraryTab === 'strength' ? (
                             <>
                               <button
                             onClick={() => {
                               setEditingRoutine(null);
                               setRoutineExercises([]);
                               setRoutineStudentIds([]);
                               setRoutineName('');
                               setRoutineGoal('Hipertrofia');
                               setRoutineDifficulty('Intermediário');
                               setRoutineNotes(''); setRoutineDayOfWeek(''); setRoutineMuscleGroup(''); setRoutineGeneralNotes('');
                               setRoutineStartDate(''); setRoutineEndDate(''); setRoutineGroupName('');
                               setRoutinePdfPermission('Sim'); setRoutineShowTime('Sim'); setRoutineHideBeforeStart(false); setRoutineHideAfterEnd(false);
                               setHomeSubView('create_routine');
                             }}
                             className="w-full bg-[#dc2626] text-white py-4 rounded-xl font-black italic uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-red-200 hover:bg-[#ef4444] transition active:scale-95 cursor-pointer"
                           >
                             <Plus className="w-4 h-4" /> Nova Rotina
                           </button>

                           <div className="space-y-3">
                              <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-wider text-left pt-2">
                                Suas Rotinas Salvas ({adminRoutines.length})
                              </h5>

                              {adminRoutines.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-xs font-bold">
                                  Nenhuma rotina criada ainda.<br/>Clique em "Nova Rotina" para começar.
                                </div>
                              ) : (
                                adminRoutines.map((routine) => (
                                  <div key={routine.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 text-left group hover:border-[#dc2626]/30 transition">
                                    <div className="flex justify-between items-start mb-2">
                                       <h6 className="text-sm font-black italic uppercase text-slate-900 leading-tight group-hover:text-[#dc2626] transition flex-1 mr-2">{routine.name}</h6>
                                       <div className="flex gap-1 shrink-0">
                                         <button
                                           onClick={() => {
                                             setAssigningRoutine(routine);
                                             setRoutineStudentIds(routine.studentIds || []);
                                           }}
                                           className="p-1.5 text-slate-400 hover:text-blue-500 transition cursor-pointer"
                                           title="Atribuir a Alunos"
                                         >
                                           <UserPlus className="w-3.5 h-3.5" />
                                         </button>
                                         <button
                                           onClick={() => handleEditAdminRoutine(routine)}
                                           className="p-1.5 text-slate-400 hover:text-[#dc2626] transition cursor-pointer"
                                           title="Editar"
                                         >
                                           <FileText className="w-3.5 h-3.5" />
                                         </button>
                                         <button
                                           onClick={() => handleDeleteAdminRoutine(routine.id)}
                                           className="p-1.5 text-slate-400 hover:text-red-500 transition cursor-pointer"
                                           title="Excluir"
                                         >
                                           <Trash2 className="w-3.5 h-3.5" />
                                         </button>
                                       </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                       <span className="px-2 py-1 bg-slate-50 text-slate-500 text-[9px] font-bold uppercase rounded-md border border-slate-100">{routine.goal}</span>
                                       <span className="px-2 py-1 bg-slate-50 text-slate-500 text-[9px] font-bold uppercase rounded-md border border-slate-100">{routine.difficulty}</span>
                                       <span className="px-2 py-1 bg-[#dc2626]/10 text-[#dc2626] text-[9px] font-black italic uppercase rounded-md">{routine.exercises.length} Exerc.</span>
                                    </div>
                                    {routine.studentNames && routine.studentNames.length > 0 && (
                                      <div className="mt-2 flex items-center gap-1 flex-wrap">
                                        <Users className="w-3 h-3 text-slate-400" />
                                        {routine.studentNames.map((n, i) => (
                                          <span key={i} className="text-[9px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{n}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                           </div>
                        </>
                           ) : (
<div className="space-y-3 text-slate-900"><p className="text-sm">Planilhas aeróbicas por aluno</p>{activeStudents.map(student => <button className="block w-full p-4 bg-white border rounded-xl text-left" key={student.uid} onClick={() => { setSelectedStudent(student); setSelectedDetailTab('treinos'); setTreinosSubTab('aerobico'); }}>{student.name} · {adminRoutines.filter(routine => routine.kind === 'aerobic' && routine.studentIds.includes(student.uid)).length} planilhas</button>)}</div>
                           )}
                        </div>
                     </div>
                  ) : (
                        /* STUDENT LIST VIEW (Image 2) */
                       <div className="flex flex-col h-full bg-[#f4f7fa]">
                          {/* Inner Header for Student List */}
                          <div className="bg-[#0c1622] p-4 pt-1 flex flex-col items-start gap-3">
                             <button
                               onClick={() => setHomeSubView('dashboard')}
                               className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80"
                             >
                               <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                             </button>
                             <h4 className="text-white text-xl font-black italic uppercase italic tracking-tighter">Seus alunos</h4>
                          </div>

                          {/* Inner Tabs for Alunos/Grupos */}
                          <div className="flex bg-[#0c1622] px-0">
                             <button
                               onClick={() => setStudentTab('alunos')}
                               className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${
                                 studentTab === 'alunos'
                                   ? 'bg-[#f4f7fa] text-slate-900 rounded-t-lg'
                                   : 'bg-transparent text-white/70 hover:text-white'
                               }`}
                             >
                               Alunos
                             </button>
                             <button
                               onClick={() => setStudentTab('grupos')}
                               className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${
                                 studentTab === 'grupos'
                                   ? 'bg-[#f4f7fa] text-slate-900 rounded-t-lg'
                                   : 'bg-transparent text-white/70 hover:text-white'
                               }`}
                             >
                               Grupos
                             </button>
                          </div>

                          <div className="p-4 space-y-4 overflow-y-auto flex-1">
                             {studentTab === 'alunos' ? (
                               <>
                                 {/* Search and Filters */}
                                 <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1 flex">
                                    <input
                                      type="text"
                                      value={searchTerm}
                                      onChange={(e) => setSearchTerm(e.target.value)}
                                      placeholder="Pesquise por nome, email ou telefone"
                                      className="flex-1 px-4 py-3 text-xs font-bold text-slate-900 outline-none"
                                    />
                                    <div className="p-3 border-l border-slate-100 flex items-center justify-center text-slate-400">
                                       <Search className="w-4 h-4" />
                                    </div>
                                 </div>

                                 {/* Pill Filters */}
                                 <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => setStatusFilter('active')}
                                      className={`px-4 py-1.5 rounded-full text-[10px] font-bold border ${statusFilter === 'active' ? 'bg-[#dc2626]/10 border-[#dc2626] text-[#dc2626]' : 'bg-slate-200 border-transparent text-slate-400'}`}
                                    >
                                       Ativos: {activeStudents.length}
                                    </button>
                                    <button
                                      onClick={() => setStatusFilter('inactive')}
                                      className={`px-4 py-1.5 rounded-full text-[10px] font-bold border ${statusFilter === 'inactive' ? 'bg-[#dc2626]/10 border-[#dc2626] text-[#dc2626]' : 'bg-slate-200 border-transparent text-slate-400'}`}
                                    >
                                       Inativos: {inactiveStudents.length}
                                    </button>
                                    <button
                                      onClick={() => setStatusFilter('excluded')}
                                      className={`px-4 py-1.5 rounded-full text-[10px] font-bold border ${statusFilter === 'excluded' ? 'bg-[#dc2626]/10 border-[#dc2626] text-[#dc2626]' : 'bg-slate-200 border-transparent text-slate-400'}`}
                                    >
                                       Excluídos: {excludedStudents.length}
                                    </button>
                                 </div>

                                 {/* Routine Group Name */}
                                 <div className="space-y-1.5 text-left">
                                   <label className="text-[10px] font-bold text-slate-900 uppercase">Grupo (agrupa dias na mesma rotina)</label>
                                   <input type="text" value={routineGroupName} onChange={(e) => setRoutineGroupName(e.target.value)} placeholder="Ex: Treino Musculação I" className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition" />
                                 </div>

                                 {/* Day of Week */}
                                 <div className="space-y-1.5 text-left">
                                   <label className="text-[10px] font-bold text-slate-900 uppercase">Dia da Semana</label>
                                   <select value={routineDayOfWeek} onChange={(e) => setRoutineDayOfWeek(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none appearance-none">
                                     <option value="">Selecionar dia...</option>
                                     <option>Segunda</option><option>Terça</option><option>Quarta</option><option>Quinta</option><option>Sexta</option><option>Sábado</option><option>Domingo</option>
                                   </select>
                                 </div>

                                 {/* Muscle Group */}
                                 <div className="space-y-1.5 text-left">
                                   <label className="text-[10px] font-bold text-slate-900 uppercase">Grupo Muscular do Dia</label>
                                   <input type="text" value={routineMuscleGroup} onChange={(e) => setRoutineMuscleGroup(e.target.value)} placeholder="Ex: Peito, Tríceps e Ombro" className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition" />
                                 </div>

                                 {/* Start/End Date */}
                                 <div className="grid grid-cols-2 gap-3">
                                   <div className="space-y-1.5 text-left">
                                     <label className="text-[10px] font-bold text-slate-900 uppercase">Data Início</label>
                                     <input type="date" value={routineStartDate} onChange={(e) => setRoutineStartDate(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition" />
                                   </div>
                                   <div className="space-y-1.5 text-left">
                                     <label className="text-[10px] font-bold text-slate-900 uppercase">Data Fim</label>
                                     <input type="date" value={routineEndDate} onChange={(e) => setRoutineEndDate(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-800 outline-none focus:border-[#dc2626] transition" />
                                   </div>
                                 </div>

                                 {/* Add Student link */}
                                 <button
                                   onClick={() => setIsAddingUser(true)}
                                   className="flex items-center justify-center gap-2 text-[#dc2626] text-xs font-bold w-full py-2 hover:opacity-80 transition"
                                 >
                                    <UserCheck className="w-4 h-4" />
                                    <span>Adicionar aluno</span>
                                 </button>

                                 {/* Student List items */}
                                 <div className="space-y-3 pb-20">
                                    {filteredStudents.length === 0 ? (
                                       <div className="py-10 text-center text-slate-400 text-xs font-bold">Nenhum aluno encontrado</div>
                                    ) : (
                                       filteredStudents.map((student) => (
                                          <div
                                            key={student.uid}
                                            className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between"
                                          >
                                             <button
                                               onClick={() => setSelectedStudent(student)}
                                               className="flex items-center gap-4 text-left flex-1"
                                             >
                                                <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 overflow-hidden">
                                                   {student.photoURL ? (
                                                      <PrivateImage src={student.photoURL} alt="" className="w-full h-full object-cover" />
                                                   ) : (
                                                      <User className="w-6 h-6" />
                                                   )}
                                                </div>
                                                <div>
                                                   <p className="text-xs font-black italic uppercase text-slate-900 leading-none">{student.name}</p>
                                                   <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">{student.modality}</p>
                                                </div>
                                             </button>
                                             <a
                                               href={studentWhatsAppUrl(student)}
                                                title={studentWhatsAppUrl(student) ? 'Conversar com o aluno' : 'Cadastrar WhatsApp do aluno'}
                                                onClick={event => { if (!studentWhatsAppUrl(student)) { event.preventDefault(); setSelectedStudent(student); setSelectedDetailTab('editar_aluno'); } }}
                                               target="_blank"
                                               className="text-emerald-500 hover:text-emerald-600 transition"
                                             >
                                                <MessageSquare className="w-6 h-6 fill-current opacity-80" />
                                             </a>
                                             {student.status !== 'excluded' && (
                                               <button
                                                 onClick={() => handleDeleteStudent(student.uid)}
                                                 className="text-slate-300 hover:text-red-500 transition ml-2 cursor-pointer"
                                                 title="Excluir aluno"
                                               >
                                                 <Trash2 className="w-5 h-5" />
                                               </button>
                                             )}
                                          </div>
                                       ))
                                    )}
                                 </div>
                               </>
                             ) : (<AdminStudentGroups users={users} onSaved={updated => setUsers(previous => previous.map(user => user.uid === updated.uid ? updated : user))} onOpen={student => { setSelectedStudent(student); setSelectedDetailTab('editar_aluno'); }} />)}
                          </div>
                       </div>
                    )}

                  </div>
                </motion.div>
               )}

              {/* CURRENT VIEW 2: QUICK OPTION MENU & CONFIGURAÇÕES */}
              {activeTab === 'menu' && (
                <motion.div
                  key="menu-tab"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="admin-settings flex-1 flex flex-col overflow-y-auto space-y-5 text-left"
                >
                  <div className="space-y-1">
                    <span className="text-[9px] text-red-500 font-black tracking-widest uppercase">Painel do Treinador</span>
                    <h3 className="text-2xl font-semibold tracking-tight text-white">Configurações</h3>
                  </div>

                  {/* SEÇÃO 1: FORMAS DE PAGAMENTO PARA OS ALUNOS */}
                  <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-4">
                    <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-800">
                      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black uppercase text-white tracking-tight">Formas de Pagamento para os Alunos</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Configure seu PIX e links que os alunos usarão para pagar
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleSavePaymentSettings} className="space-y-3.5">
                      {/* Tipo de Chave e Chave PIX */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                            Tipo de Chave PIX
                          </label>
                          <select
                            value={paymentSettings.pixType}
                            onChange={(e) => setPaymentSettings({ ...paymentSettings, pixType: e.target.value as any })}
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:border-red-500 outline-none"
                          >
                            <option value="Telefone">Telefone</option>
                            <option value="CPF">CPF</option>
                            <option value="CNPJ">CNPJ</option>
                            <option value="Email">Email</option>
                            <option value="Aleatória">Chave Aleatória</option>
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                            Chave PIX
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 554384639369 ou seu CPF/Email"
                            value={paymentSettings.pixKey}
                            onChange={(e) => setPaymentSettings({ ...paymentSettings, pixKey: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:border-red-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* Nome do Titular e Banco */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                            Nome do Titular do PIX
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Carlos Eduardo Ponce"
                            value={paymentSettings.pixHolder}
                            onChange={(e) => setPaymentSettings({ ...paymentSettings, pixHolder: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:border-red-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                            Banco / Instituição (opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Nubank, Itaú, Inter..."
                            value={paymentSettings.bankName || ''}
                            onChange={(e) => setPaymentSettings({ ...paymentSettings, bankName: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:border-red-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* Link Cartão de Crédito */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                          Link de Pagamento no Cartão (opcional)
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: https://mpago.la/... ou link InfinitePay/PicPay/Asaas"
                          value={paymentSettings.cardLink || ''}
                          onChange={(e) => setPaymentSettings({ ...paymentSettings, cardLink: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:border-red-500 outline-none"
                        />
                      </div>

                      {/* Instruções de Pagamento */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                          Instruções aos Alunos
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Ex: Envie o comprovante no WhatsApp após o pagamento para liberar seu próximo ciclo de treinos."
                          value={paymentSettings.instructions || ''}
                          onChange={(e) => setPaymentSettings({ ...paymentSettings, instructions: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-medium focus:border-red-500 outline-none resize-none"
                        />
                      </div>

                      {/* Botão Salvar Formas de Pagamento */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-emerald-400 font-bold">
                          {paymentSettingsSavedToast ? '✅ Formas de pagamento salvas com sucesso!' : ''}
                        </span>
                        <button
                          type="submit"
                          disabled={isSavingPaymentSettings}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow transition active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingPaymentSettings ? 'Salvando...' : 'Salvar Formas de Pagamento'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* SEÇÃO 2: DADOS DO PERSONAL */}
                  <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-3">
                    <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-800">
                      <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black uppercase text-white tracking-tight">Dados de Contato do Personal</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Informações visíveis aos alunos no app
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block">WhatsApp de Atendimento</span>
                        <span className="font-extrabold text-white block mt-0.5">+{TRAINER_CONFIG.phone.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '$1 $2 $3-$4')}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block">Instagram Oficial</span>
                        <span className="font-extrabold text-red-400 block mt-0.5">@{TRAINER_CONFIG.instagramHandle}</span>
                      </div>
                    </div>
                  </div>

                  {/* SEÇÃO 3: SAIR DA CONTA */}
                  <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black uppercase text-white tracking-tight">Encerrar Sessão</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Desconectar deste dispositivo
                        </p>
                      </div>
                      <button
                        onClick={onClose}
                        className="px-4 py-2.5 bg-red-650 hover:bg-red-500 text-white font-black uppercase text-xs tracking-wider rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" /> Sair
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>

            {/* NEW NOTIFICATION FLOW OVERLAY */}
            <AnimatePresence>
              {isNotifyingByCategory && (
                <motion.div
                  initial={{ opacity: 0, y: 100 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 100 }}
                  className="absolute inset-0 z-50 bg-[#f4f7fa] flex flex-col"
                >
                  {/* ── HEADER ── */}
                  <div className="bg-[#0c1622] p-4 pt-6 flex flex-col items-start gap-2 shrink-0">
                    <button
                      onClick={() => {
                        if (notifyView === 'list') setIsNotifyingByCategory(false);
                        else if (notifyView === 'create_type') setNotifyView('list');
                        else if (notifyView === 'create_target') setNotifyView('create_type');
                        else if (notifyView === 'select_students' || notifyView === 'select_groups') setNotifyView('create_target');
                        else if (notifyView === 'compose') { setNotifyView(notifyTarget === 'student' ? 'select_students' : 'select_groups'); }
                      }}
                      className="text-white/80 text-[11px] font-bold flex items-center gap-1 cursor-pointer mb-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                    </button>
                    <h4 className="text-white text-xl font-black italic uppercase tracking-tighter">
                      {notifyView === 'list' ? 'Notificações' :
                       notifyView === 'create_type' ? 'Criar notificação' :
                       notifyView === 'create_target' ? 'Notificações' :
                       notifyView === 'select_students' ? 'Notificações' :
                       notifyView === 'select_groups' ? 'Notificações' :
                       'Notificações'}
                    </h4>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* ── VIEW: LIST ── */}
                    {notifyView === 'list' && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
                        {/* Criar notificação */}
                        <button
                          onClick={() => setNotifyView('create_type')}
                          className="w-full py-4 border border-[#3182ce] rounded-lg text-[#3182ce] font-bold text-sm hover:bg-blue-50 transition cursor-pointer"
                        >
                          + Criar notificação
                        </button>

                        <p className="text-slate-600 text-sm">Envio imediato aos dispositivos que ativaram notificações. Agendamentos e lembretes ficam na agenda do treinador.</p>
                      </div>
                    )}

                    {/* ── VIEW: CREATE TYPE ── */}
                    {notifyView === 'create_type' && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        {[
                          { key: 'now', icon: '🔔', title: 'Enviar na hora', desc: 'Enviar agora aos dispositivos com permissão ativa' },


                        ].map((item, idx) => (
                          <button
                            key={item.key}
                            onClick={() => {
                              setNotifyType(item.key as any);
                              setNotifyView('create_target');
                            }}
                            className={`w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition cursor-pointer text-left ${
                              idx < 2 ? 'border-b border-slate-100' : ''
                            }`}
                          >
                            <div className="w-12 h-12 bg-[#dbeafe] rounded-full flex items-center justify-center text-xl shrink-0">
                              {item.icon}
                            </div>
                            <div>
                              <p className="text-slate-900 font-bold text-sm">{item.title}</p>
                              <p className="text-orange-500 text-xs font-medium">{item.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ── VIEW: CREATE TARGET (Aluno / Grupo) ── */}
                    {notifyView === 'create_target' && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                        <div>
                          <h5 className="text-slate-900 font-bold text-base mb-1">Criar notificação</h5>
                          <p className="text-slate-400 text-xs">Escolha se a ação será feita para alunos ou grupos.</p>
                        </div>
                        <div className="space-y-2">
                          <button
                            onClick={() => { setNotifyTarget('student'); setSelectedUidsForNotify([]); setNotifyStudentSearch(''); setNotifyView('select_students'); }}
                            className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-[#dbeafe] rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-[#3182ce]" />
                              </div>
                              <span className="font-bold text-slate-800 text-sm">Aluno</span>
                            </div>
                            <ChevronLeft className="w-5 h-5 text-slate-400 rotate-180" />
                          </button>
                          <button
                            onClick={() => { setNotifyTarget('group'); setNotifyView('select_groups'); }}
                            className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-[#dbeafe] rounded-full flex items-center justify-center">
                                <Users className="w-5 h-5 text-[#3182ce]" />
                              </div>
                              <span className="font-bold text-slate-800 text-sm">Grupo</span>
                            </div>
                            <ChevronLeft className="w-5 h-5 text-slate-400 rotate-180" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── VIEW: SELECT STUDENTS ── */}
                    {notifyView === 'select_students' && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                        <h5 className="font-bold text-slate-900 text-base">Selecionar aluno</h5>
                        <p className="text-slate-400 text-xs -mt-1">Escolha quais alunos devem receber esta ação.</p>

                        {/* Search */}
                        <input
                          type="text"
                          placeholder="Buscar aluno"
                          value={notifyStudentSearch}
                          onChange={(e) => setNotifyStudentSearch(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#3182ce] transition"
                        />

                        {/* Count + select all */}
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-600">{users.filter(u => u.role === 'student').length} alunos</span>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-500">
                            Selecionar todos
                            <input
                              type="checkbox"
                              checked={selectedUidsForNotify.length === users.filter(u => u.role === 'student').length}
                              onChange={(e) => {
                                const students = users.filter(u => u.role === 'student');
                                setSelectedUidsForNotify(e.target.checked ? students.map(s => s.uid) : []);
                              }}
                              className="w-4 h-4 accent-[#3182ce]"
                            />
                          </label>
                        </div>

                        {/* Student list */}
                        <div className="space-y-0 divide-y divide-slate-100">
                          {users
                            .filter(u => u.role === 'student' && (notifyStudentSearch === '' || u.name.toLowerCase().includes(notifyStudentSearch.toLowerCase()) || (u.email || '').toLowerCase().includes(notifyStudentSearch.toLowerCase())))
                            .map(student => (
                              <div key={student.uid} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                                    {student.photoURL ? <PrivateImage src={student.photoURL} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-900 uppercase">{student.name}</p>
                                    <p className="text-[10px] text-slate-400">{student.email}</p>
                                  </div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={selectedUidsForNotify.includes(student.uid)}
                                  onChange={() => {
                                    if (selectedUidsForNotify.includes(student.uid)) {
                                      setSelectedUidsForNotify(prev => prev.filter(id => id !== student.uid));
                                    } else {
                                      setSelectedUidsForNotify(prev => [...prev, student.uid]);
                                    }
                                  }}
                                  className="w-5 h-5 accent-[#3182ce] cursor-pointer"
                                />
                              </div>
                          ))}
                        </div>

                        {/* Count + Próximo */}
                        <div className="pt-2 space-y-2">
                          <p className="text-center text-[#3182ce] text-xs font-bold">
                            {selectedUidsForNotify.length} {selectedUidsForNotify.length === 1 ? 'aluno selecionado' : 'alunos selecionados'}
                          </p>
                          <button
                            disabled={selectedUidsForNotify.length === 0}
                            onClick={() => setNotifyView('compose')}
                            className="w-full py-3 bg-[#3182ce] disabled:opacity-40 text-white font-bold rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition"
                          >
                            Próximo
                          </button>
                          <button
                            onClick={() => setNotifyView('create_target')}
                            className="w-full py-3 border border-[#3182ce] text-[#3182ce] font-bold rounded-lg text-sm cursor-pointer hover:bg-blue-50 transition"
                          >
                            Voltar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── VIEW: SELECT GROUPS ── */}
                    {notifyView === 'select_groups' && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                        <h5 className="font-bold text-slate-900 text-base">Selecionar grupo</h5>
                        <p className="text-slate-400 text-xs -mt-1">Escolha quais grupos devem receber esta ação.</p>
                        <div className="space-y-0 divide-y divide-slate-100">
                          {studentGroups.map(group => {
                            const count = users.filter(u => u.role === 'student' && u.status === 'active' && u.metadata?.group === group).length;
                            return (
                              <button
                                key={group}
                                onClick={() => {
                                  const groupStudents = users.filter(u => u.role === 'student' && u.status === 'active' && u.metadata?.group === group);
                                  setSelectedUidsForNotify(groupStudents.map(s => s.uid));
                                  setNotifyView('compose');
                                }}
                                className="w-full flex items-center justify-between py-4 hover:bg-slate-50 transition cursor-pointer text-left"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-[#dbeafe] rounded-full flex items-center justify-center">
                                    <Users className="w-5 h-5 text-[#3182ce]" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{group}</p>
                                    <p className="text-xs text-slate-400">{count} {count === 1 ? 'aluno' : 'alunos'}</p>
                                  </div>
                                </div>
                                <ChevronLeft className="w-4 h-4 text-slate-400 rotate-180" />
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setNotifyView('create_target')}
                          className="w-full py-3 border border-[#3182ce] text-[#3182ce] font-bold rounded-lg text-sm cursor-pointer hover:bg-blue-50 transition"
                        >
                          Voltar
                        </button>
                      </div>
                    )}

                    {/* ── VIEW: COMPOSE ── */}
                    {notifyView === 'compose' && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                        <h5 className="font-bold text-slate-900 text-base">Criar notificação</h5>

                        {/* Título */}
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Título</label>
                          <input
                            type="text"
                            value={notifyTitle}
                            onChange={(e) => setNotifyTitle(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3182ce] transition"
                          />
                        </div>

                        {/* Mensagem */}
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Mensagem</label>
                          <textarea
                            value={notifyMessage}
                            onChange={(e) => setNotifyMessage(e.target.value)}
                            rows={4}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3182ce] transition resize-none"
                          />
                        </div>

                        {/* Destinatários */}
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Destinatários</label>
                          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">{notifyTarget === 'student' ? 'Aluno' : 'Grupo'}</p>
                            <p className="text-sm font-bold text-slate-800">
                              {selectedUidsForNotify.length} {selectedUidsForNotify.length === 1 ? 'aluno selecionado' : 'alunos selecionados'}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        {notifyError && <p role="alert" className="text-sm text-red-600">{notifyError}</p>}
                        {notifyResult && <p role="status" className="text-sm text-emerald-700">{notifyResult}</p>}
                        <button
                          disabled={!notifyTitle.trim() || !notifyMessage.trim() || isSending || selectedUidsForNotify.length === 0}
                          onClick={async () => {
                            setIsSending(true);
                            setSendComplete(false);
                            setNotifyError('');
                            setNotifyResult('');
                            try {
                              const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                              if (sessionError || !session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
                              const response = await fetch('/api/send-notification', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: 'Bearer ' + session.access_token,
                                },
                                body: JSON.stringify({ userIds: selectedUidsForNotify, title: notifyTitle.trim(), body: notifyMessage.trim() }),
                              });
                              const result = await response.json().catch(() => ({}));
                              if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a notificação.');
                              const sent = Number(result.sentCount) || 0;
                              const failed = Number(result.failedCount) || (Array.isArray(result.errors) ? result.errors.length : 0);
                              if (!sent) throw new Error('Nenhuma notificação foi enviada. Os destinatários precisam ativar as notificações no aplicativo.');
                              setNotifyResult(sent + ' notificação(ões) enviada(s).');
                              if (failed) {
                                setNotifyError(failed + ' envio(s) falharam. Confira os destinatários antes de reenviar, para evitar duplicatas.');
                              } else {
                                setSendComplete(true);
                              }
                            } catch (error) {
                              setNotifyError(error instanceof Error ? error.message : 'Falha de conexão. Tente novamente.');
                            } finally {
                              setIsSending(false);
                            }
                          }}
                          className="w-full py-3 bg-[#3182ce] disabled:opacity-40 text-white font-bold rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition flex items-center justify-center gap-2"
                        >
                          {isSending ? (
                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
                          ) : sendComplete ? (
                            <><Check className="w-4 h-4" /> Enviado!</>
                          ) : 'Enviar'}
                        </button>
                        <button
                          onClick={() => setNotifyView(notifyTarget === 'student' ? 'select_students' : 'select_groups')}
                          className="w-full py-3 border border-[#3182ce] text-[#3182ce] font-bold rounded-lg text-sm cursor-pointer hover:bg-blue-50 transition"
                        >
                          Alterar público
                        </button>
                      </div>
                    )}

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* WORKOUT ACTION MODAL */}
            <AnimatePresence>
              {isWorkoutActionModalOpen && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full max-w-[320px] bg-white rounded-xl shadow-2xl overflow-hidden text-left"
                  >
                    <div className="p-4 flex items-center justify-between">
                       <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tight">O que você deseja fazer?</h4>
                       <button onClick={() => setIsWorkoutActionModalOpen(false)}>
                          <X className="w-3.5 h-3.5 text-slate-400" />
                       </button>
                    </div>
                    <div className="px-4 pb-6 space-y-2.5">
                       <button
                         className="w-full py-2.5 px-4 border border-[#dc2626] rounded-lg text-[#dc2626] text-[10px] font-black uppercase tracking-tight hover:bg-red-50 transition text-center"
                         onClick={() => {
                            setIsWorkoutActionModalOpen(false);
                            setHomeSubView('create_routine');
                         }}
                       >
                          Adicionar novo treino
                       </button>
                       <button
                         className="w-full py-2.5 px-4 border border-[#dc2626] rounded-lg text-[#dc2626] text-[10px] font-black uppercase tracking-tight hover:bg-red-50 transition text-center"
                         onClick={() => setIsWorkoutActionModalOpen(false)}
                       >
                          Adicionar nova pasta
                       </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* CREATE WORKOUT MODAL (Requested Image) */}
            <AnimatePresence>
              {isCreateWorkoutModalOpen && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full max-w-[340px] bg-white rounded-xl shadow-2xl overflow-hidden text-left"
                  >
                    <div className="p-4 border-b border-slate-50">
                       <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-tight text-left">Criar Treino</h4>
                    </div>

                    <div className="p-5 space-y-4">
                       <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Treino</label>
                          <select
                            value={newWorkoutDay}
                            onChange={(e) => setNewWorkoutDay(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-red-200 text-xs font-bold text-slate-800 outline-none appearance-none"
                          >
                             <option value="">Selecione um dia</option>
                             <option value="Segunda-Feira">Segunda-Feira</option>
                             <option value="Terça-Feira">Terça-Feira</option>
                             <option value="Quarta-Feira">Quarta-Feira</option>
                             <option value="Quinta-Feira">Quinta-Feira</option>
                             <option value="Sexta-Feira">Sexta-Feira</option>
                             <option value="Sábado">Sábado</option>
                             <option value="Domingo">Domingo</option>
                          </select>
                       </div>

                       <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Nome</label>
                          <input
                            type="text"
                            value={newWorkoutName}
                            onChange={(e) => setNewWorkoutName(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 outline-none"
                            placeholder="Ex: athayde"
                          />
                       </div>

                       <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Copiar de</label>
                          <div className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-400 flex items-center justify-between">
                             <span />
                             <ChevronDown className="w-4 h-4" />
                          </div>
                       </div>

                       <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-bold text-slate-400 uppercase text-left">Orientações gerais <span className="text-[8px] opacity-60">(Opcional)</span></label>
                          <textarea
                            value={newWorkoutNotes}
                            onChange={(e) => setNewWorkoutNotes(e.target.value)}
                            className="w-full h-24 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 outline-none resize-none"
                          />
                       </div>

                       <div className="space-y-2 pt-2">
                          <button
                            onClick={handleSaveWorkout}
                            className="w-full bg-[#dc2626] py-3.5 rounded-lg text-white font-black italic uppercase text-[11px] tracking-widest shadow-lg shadow-red-100"
                          >
                             Salvar
                          </button>
                          <button
                            onClick={() => setIsCreateWorkoutModalOpen(false)}
                            className="w-full py-3.5 rounded-lg border border-[#dc2626] text-[#dc2626] font-black italic uppercase text-[11px] tracking-widest font-bold"
                          >
                             Fechar
                          </button>
                       </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* QUICK FLOATING DETAILED PANEL COMPONENT (Handles clicked circular buttons custom overlays!) */}
          <AnimatePresence>
            {activePanel && (
              <motion.div
                initial={{ opacity: 0, y: activePanel === 'updates' ? 100 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: activePanel === 'updates' ? 100 : 0 }}
                className={`absolute inset-0 flex flex-col z-[40] ${
                  activePanel === 'updates'
                    ? 'bg-[#f4f7fa]'
                    : 'bg-slate-950/95 backdrop-blur-md justify-end'
                }`}
              >
                {/* Header */}
                {activePanel === 'updates' ? (
                  <div className="bg-[#0c1622] px-5 pt-6 pb-4 flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => {
                        if (updatesSubView === 'link_cadastro') { setUpdatesSubView('grid'); setLinkCadastroTab('link'); }
                        else if (updatesSubView === 'aniversarios') { setUpdatesSubView('grid'); }
                        else if (updatesSubView === 'treinos') { setUpdatesSubView('grid'); }
                        else if (updatesSubView === 'avaliacao_fisica') { setUpdatesSubView('grid'); }
                        else if (updatesSubView === 'planos_recorrentes') { setUpdatesSubView('grid'); }
                        else if (updatesSubView === 'aerobico') { setUpdatesSubView('grid'); }
                        else if (updatesSubView === 'pagina_vendas') { setUpdatesSubView('grid'); }
                        else if (updatesSubView === 'anamneses') { setUpdatesSubView('grid'); }
                        else if (updatesSubView === 'faturas') { setUpdatesSubView('grid'); }
                        else setActivePanel(null);
                      }}
                      className="text-white/80 text-[11px] font-bold flex items-center gap-1 mb-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                    </button>
                    <h4 className="text-white text-xl font-black italic uppercase tracking-tighter">
                      {updatesSubView === 'link_cadastro' ? 'Link de Cadastro' :
                       (updatesSubView === 'aniversarios' || updatesSubView === 'treinos' || updatesSubView === 'avaliacao_fisica' || updatesSubView === 'planos_recorrentes' || updatesSubView === 'aerobico' || updatesSubView === 'pagina_vendas' || updatesSubView === 'anamneses' || updatesSubView === 'faturas') ? 'Atualizações' :
                       'Atualizações'}
                    </h4>
                  </div>
                ) : (
                  <div className="flex justify-between items-center px-6 py-5 border-b border-slate-900">
                    <span className="text-[10px] font-black tracking-widest text-red-500 uppercase">
                      {activePanel === 'sales_links' && 'Contato do personal'}
                      {activePanel === 'feedbacks' && '💬 Feedbacks Recebidos'}

                    </span>
                    <button
                      onClick={() => setActivePanel(null)}
                      className="p-1 px-3 bg-slate-900 border border-slate-800 text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white rounded-lg"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* PANEL CONTENT INTERACTIVE SWITCHES */}
                <div className={`overflow-y-auto space-y-4 text-left ${
                  activePanel === 'updates' ? 'flex-1 p-4' : 'p-6 max-h-[85%]'
                }`}>

                  {/* PANEL 1: Sales links copy panel */}
                  {activePanel === 'sales_links' && (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-400 font-semibold leading-normal">
                        Copie o contato do personal para conversar sobre a consultoria e combinar o pagamento pelo WhatsApp.
                      </p>

                      <div className="space-y-3">
                        {salesLinks.map((link) => (
                          <div key={link.id} className="p-4 bg-slate-900 border border-slate-850 rounded-2xl flex flex-col space-y-2.5">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-xs font-black text-white">{link.title}</h4>
                              </div>
                              <button
                                onClick={() => handleCopyLink(link.url, link.id)}
                                className={`p-2 rounded-xl transition duration-300 active:scale-90 ${
                                  copiedLink === link.id ? 'bg-emerald-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {copiedLink === link.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <span className="text-[9px] font-mono text-slate-500 truncate select-all">{link.url}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PANEL 2: Feedbacks checklist */}
                  {activePanel === 'feedbacks' && <AdminStudentModules module="feedbacks" users={users} />}

                  {/* PANEL 3: Updates category grid or sub-view */}
                  {activePanel === 'updates' && (
                    <>
                    {updatesSubView === 'grid' && (
                    <div className="space-y-5">
                      <div className="bg-white rounded-xl overflow-hidden">
                        <div className="grid grid-cols-3">
                          {[
                            { label: 'Treinos', emoji: '🏋️', badge: 0, key: 'treinos' },
                            { label: 'Avaliação física', emoji: '📋', badge: 0, key: 'avaliacao_fisica' },
                            { label: 'Aeróbico', emoji: '🏃', badge: 0, key: 'aerobico' },



                            { label: 'Link de acesso', emoji: '🔗', badge: 0, key: 'link_cadastro' },
                            { label: 'Avaliação Online', emoji: '📝', badge: 0, key: 'avaliacao_fisica' },
                            { label: 'Anamneses', emoji: '📋', badge: 0, key: 'anamneses' },
                            { label: 'Progresso do aluno', emoji: '✅', badge: 0, key: 'progresso' },
                            { label: 'Aniversários', emoji: '🎂', badge: 0, key: 'aniversarios' },
                          ].map((item, idx) => (
                            <button
                              key={item.label}
                              onClick={() => {
                                if (item.key === 'progresso') { setActivePanel(null); setHomeSubView('student_list'); }
                                else if (item.key === 'link_cadastro') { setUpdatesSubView('link_cadastro'); setLinkCadastroTab('link'); }
                                else if (item.key === 'aniversarios') { setUpdatesSubView('aniversarios'); setAniversariosTab('pendentes'); setAniversariosSearch(''); }
                                else if (item.key === 'treinos') { setUpdatesSubView('treinos'); setTreinosTab('pendentes'); setTreinosSearch(''); }
                                else if (item.key === 'avaliacao_fisica') { setUpdatesSubView('avaliacao_fisica'); setAvaliacaoFisicaTab('pendentes'); setAvaliacaoFisicaSearch(''); }
                                else if (item.key === 'planos_recorrentes') { setUpdatesSubView('planos_recorrentes'); setPlanosRecorrentesTab('pendentes'); setPlanosRecorrentesSearch(''); }
                                else if (item.key === 'aerobico') { setUpdatesSubView('aerobico'); setAerobicoTab('pendentes'); setAerobicoSearch(''); }
                                else if (item.key === 'pagina_vendas') { setUpdatesSubView('pagina_vendas'); setPaginaVendasTab('pendentes'); setPaginaVendasSearch(''); }
                                else if (item.key === 'anamneses') { setUpdatesSubView('anamneses'); setAnamnesesTab('pendentes'); setAnamnesesSearch(''); }
                                else if (item.key === 'faturas') { setUpdatesSubView('faturas'); setFaturasTab('pendentes'); setFaturasSearch(''); }
                              }}
                              className={`flex flex-col items-center justify-center py-5 px-2 hover:bg-slate-50 transition cursor-pointer relative ${
                                idx % 3 !== 2 ? 'border-r border-slate-100' : ''
                              } ${
                                idx < 9 ? 'border-b border-slate-100' : ''
                              }`}
                            >
                              <div className="relative mb-2">
                                <div className="w-14 h-14 bg-[#dbeafe] rounded-full flex items-center justify-center text-2xl">
                                  {item.emoji}
                                </div>
                                {item.badge > 0 && (
                                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#dc2626] rounded-full text-white text-[10px] font-black flex items-center justify-center">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <span className="text-[#3182ce] text-[10px] font-bold text-center leading-tight">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {notifications.error && <p role="alert" className="text-red-700 text-sm">{notifications.error}</p>}
                      {/* Marcar todas como lidas */}
                      <button disabled={notifications.busy || !unreadNotifCount} onClick={async () => { try { await notifications.markRead(adminNotifs.filter(item => !item.isRead).map(item => item.id)); } catch {} }} className="w-full py-4 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer disabled:opacity-50">
                        Marcar conclusões de treino como lidas
                      </button>
                    </div>
                    )}

                    {/* ── LINK DE CADASTRO SUB-VIEW ── */}
                    {updatesSubView === 'link_cadastro' && <div className="space-y-4 bg-white p-4 rounded-xl text-slate-900"><h3 className="font-bold">Link de acesso ao aplicativo</h3><p className="text-sm">As contas são criadas pelo treinador. Compartilhe este link e entregue o e-mail e a senha inicial manualmente após o cadastro.</p><p className="text-sm select-text break-all">{window.location.origin}</p><button className="text-blue-700 underline" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin); alert('Link copiado.'); } catch { alert('Copie o endereço exibido.'); } }}>Copiar link</button><h4 className="font-bold">Alunos cadastrados</h4>{users.filter(user => user.role === 'student').map(user => <button key={user.uid} onClick={() => { setSelectedStudent(user); setSelectedDetailTab('opcoes'); }} className="block w-full text-left border rounded p-3">{user.name} · {user.email}</button>)}</div>}

                    {/* ── ANIVERSÁRIOS SUB-VIEW ── */}
                    {updatesSubView === 'aniversarios' && <div className="space-y-3 text-slate-900"><h3 className="font-bold">Aniversariantes deste mês</h3><input className="w-full bg-white rounded border p-3 text-sm" placeholder="Pesquisar aluno" value={aniversariosSearch} onChange={event => setAniversariosSearch(event.target.value)} />{(() => { const birthdayStudents = activeStudents.filter(student => { const date = student.metadata?.birthDate; return date && Number(date.split('-')[1]) === new Date().getMonth() + 1 && student.name.toLocaleLowerCase().includes(aniversariosSearch.toLocaleLowerCase()); }).sort((a, b) => Number(a.metadata!.birthDate!.slice(8)) - Number(b.metadata!.birthDate!.slice(8))); return birthdayStudents.length ? birthdayStudents.map(student => <article key={student.uid} className="bg-white rounded border p-4 space-y-2"><p className="font-semibold">{student.name}</p><p className="text-sm">{student.metadata!.birthDate!.slice(8)}/{student.metadata!.birthDate!.slice(5, 7)}</p>{studentWhatsAppUrl(student) ? <a className="text-green-700 underline text-sm" href={studentWhatsAppUrl(student, 'Feliz aniversário, ' + student.name + '!')} target="_blank" rel="noopener noreferrer">Parabenizar pelo WhatsApp</a> : <button className="text-blue-700 underline text-sm" onClick={() => { setSelectedStudent(student); setSelectedDetailTab('editar_aluno'); }}>Cadastrar WhatsApp</button>}</article>) : <p className="text-sm text-slate-500">Nenhum aniversário cadastrado neste mês para a busca.</p>; })()}</div>}

                    {/* ── TREINOS SUB-VIEW ── */}
                    {updatesSubView === 'treinos' && (() => {
                      const treinosNotifs = adminNotifs.filter(n => n.type === 'completion');
                      const pendentes = treinosNotifs.filter(n => !n.isRead);
                      const resolvidas = treinosNotifs.filter(n => n.isRead);

                      let listToShow = treinosTab === 'pendentes' ? pendentes : resolvidas;
                      if (treinosSearch) {
                        listToShow = listToShow.filter(n =>
                          n.studentName.toLowerCase().includes(treinosSearch.toLowerCase()) ||
                          n.workoutTitle.toLowerCase().includes(treinosSearch.toLowerCase())
                        );
                      }

                      const markAllAsRead = () => { void notifications.markRead(pendentes.map(item => item.id)).catch(() => {}); };
                      const toggleReadStatus = (id: string) => { void notifications.markRead([id]).catch(() => {}); };

                      return (
                        <div className="space-y-3">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setTreinosTab('pendentes')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${treinosTab === 'pendentes' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Pendentes
                            </button>
                            <button
                              onClick={() => setTreinosTab('resolvidas')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${treinosTab === 'resolvidas' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Resolvidas
                            </button>
                          </div>

                          {/* Marcar como lidas button (Pendentes only) */}
                          {treinosTab === 'pendentes' && listToShow.length > 0 && (
                            <button onClick={markAllAsRead} disabled={notifications.busy} className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                              Marcar todas como lidas
                            </button>
                          )}

                          {/* Search + Filter */}
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                              <input
                                type="text"
                                placeholder="Pesquisar treino ou aluno"
                                value={treinosSearch}
                                onChange={(e) => setTreinosSearch(e.target.value)}
                                className="flex-1 text-xs outline-none text-slate-700"
                              />
                              <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Treinos concluídos</p>
                          {notifications.error && <p role="alert" className="text-xs text-red-600">{notifications.error}</p>}

                          {/* Cards or empty state */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {listToShow.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  {treinosSearch ? '🔍' : '📝'}
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">
                                    {treinosSearch ? 'Nenhum resultado foi encontrado, tente uma nova busca.' : 'Todas as atualizações foram lidas.'}
                                  </p>
                                  {!treinosSearch && (
                                    <p className="text-slate-500 text-xs mt-1">Assim que houver novas atividades dos seus alunos, elas serão exibidas aqui.</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100">
                                {listToShow.map(notif => (
                                  <div key={notif.id} className="p-4 hover:bg-slate-50 flex items-start justify-between gap-4 transition-colors">
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                                        <h4 className="text-sm font-bold text-slate-800">{notif.studentName}</h4>
                                      </div>
                                      <p className="text-xs text-slate-600 mb-1 leading-relaxed">{notif.workoutTitle} — Treino concluído</p>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {new Date(notif.fullDate).toLocaleString('pt-BR')}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => toggleReadStatus(notif.id)}
                                      disabled={notifications.busy || notif.isRead}
                                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
                                      title={notif.isRead ? 'Lida' : 'Marcar como lida'}
                                    >
                                      <CheckCircle2 className="w-5 h-5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── AVALIAÇÃO FÍSICA SUB-VIEW ── */}
                    {updatesSubView === 'avaliacao_fisica' && <AdminStudentModules module="assessments" users={users} />}                 {/* ── PLANOS RECORRENTES SUB-VIEW ── */}


                    {/* ── AERÓBICO SUB-VIEW ── */}
                    {updatesSubView === 'aerobico' && <div className="space-y-3 text-slate-900"><p>Escolha um aluno para consultar ou criar sua planilha aeróbica.</p>{activeStudents.map(student => <button key={student.uid} className="block w-full bg-white border rounded p-3 text-left" onClick={() => { setSelectedStudent(student); setSelectedDetailTab('criar_planilha'); }}>{student.name}</button>)}</div>}                 {/* ── PÁGINA DE VENDAS SUB-VIEW ── */}


                    {/* ── ANAMNESES SUB-VIEW ── */}
                    {updatesSubView === 'anamneses' && <AdminStudentModules module="anamneses" users={users} />}                 {/* ── FATURAS SUB-VIEW ── */}

                    </>
                  )}



                </div>
              </motion.div>
            )}
          </AnimatePresence>



        </div>

      {/* OVERLAY 1: STUDENT DETAILS & COACH ACTIONS MODAL */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-[100] bg-[#141C2C] flex flex-col md:p-6 overflow-hidden font-sans">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full h-full flex flex-col max-w-lg mx-auto bg-[#F4F6FA] md:rounded-3xl overflow-hidden relative text-left"
            >
              {/* HEADER */}
              <div className="bg-[#141C2C] flex flex-col shrink-0">
                <div className="px-4 py-4">
                  <button
                    onClick={() => {
                      if (selectedDetailTab !== 'inicio' && selectedDetailTab !== 'opcoes') setSelectedDetailTab('inicio');
                      else setSelectedStudent(null);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-white mb-4 hover:opacity-80 transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" /> Voltar
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-400 text-white rounded-full flex items-center justify-center font-bold text-xl uppercase select-none shrink-0 overflow-hidden">
                      <User className="w-8 h-8 text-slate-200 mt-2" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-white tracking-wide leading-tight mb-0.5">{selectedStudent.name}</h3>
                      <p className="text-xs text-white/80">{selectedStudent.modality || 'Presencial'}</p>
                    </div>
                  </div>
                </div>

                {/* TABS */}
                {!['progresso', 'treinos_extras', 'criar_treino_extra', 'arquivos'].includes(selectedDetailTab) && (
                  <div className="flex px-2 pt-2">
                    {selectedDetailTab === 'treinos' ? (
                      <>
                        <button
                          onClick={() => setTreinosSubTab('rotinas')}
                          className={`flex-1 py-3 text-sm font-semibold rounded-t-lg transition cursor-pointer ${
                            treinosSubTab === 'rotinas'
                              ? 'bg-white text-slate-800'
                              : 'bg-[#2b88ff] hover:bg-[#1e78eb] text-white'
                          }`}
                        >
                          Rotinas de treino
                        </button>
                        <button
                          onClick={() => setTreinosSubTab('aerobico')}
                          className={`flex-1 py-3 text-sm font-semibold rounded-t-lg transition cursor-pointer ${
                            treinosSubTab === 'aerobico'
                              ? 'bg-white text-slate-800'
                              : 'bg-[#2b88ff] hover:bg-[#1e78eb] text-white'
                          }`}
                        >
                          Aeróbico
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setSelectedDetailTab('inicio')}
                          className={`flex-1 py-3 text-sm font-semibold rounded-t-lg transition cursor-pointer ${
                            selectedDetailTab === 'inicio'
                              ? 'bg-white text-slate-800'
                              : 'bg-[#2b88ff] hover:bg-[#1e78eb] text-white'
                          }`}
                        >
                          Início
                        </button>
                        <button
                          onClick={() => setSelectedDetailTab('opcoes')}
                          className={`flex-1 py-3 text-sm font-semibold rounded-t-lg transition cursor-pointer ${
                            selectedDetailTab === 'opcoes'
                              ? 'bg-white text-slate-800'
                              : 'bg-[#2b88ff] hover:bg-[#1e78eb] text-white'
                          }`}
                        >
                          Opções
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Scrollable Container */}
              <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-none space-y-4">

                {/* TABCONTENT: INITIAL (INÍCIO) */}
                {selectedDetailTab === 'inicio' && (
                  <div className="space-y-4">
                    {/* Top Icons */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 grid grid-cols-3 gap-2 text-center">
                      <button
                        onClick={() => setSelectedDetailTab('treinos')}
                        className="flex flex-col items-center gap-2 group cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff] transition group-hover:bg-[#dbeafe]">
                          <Dumbbell className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] font-medium text-slate-700">Treinos</span>
                      </button>
                      <button onClick={() => setSelectedDetailTab('anamneses')} className="flex flex-col items-center gap-2 group cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff] transition group-hover:bg-[#dbeafe]">
                          <Clipboard className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] font-medium text-slate-700">Anamneses</span>
                      </button>
                      <button onClick={() => setSelectedDetailTab('avaliacoes')} className="flex flex-col items-center gap-2 group cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff] transition group-hover:bg-[#dbeafe]">
                          <Activity className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] font-medium text-slate-700">Avaliações</span>
                      </button>
                    </div>

                    <StudentWorkoutAttendance logs={attendanceFeed.logs} loading={attendanceFeed.loading} error={attendanceFeed.error} onRefresh={attendanceFeed.refresh} studentId={selectedStudent.uid} />

                    {/* List Items */}
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-100">
                      <button
                        onClick={() => setSelectedDetailTab('progresso')}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff]">
                          <Activity className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-700">Progresso do aluno</span>
                      </button>
                      <button
                        onClick={() => setSelectedDetailTab('treinos_extras')}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff]">
                          <Plus className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-700">Treinos extras</span>
                      </button>
                      <button
                        onClick={() => setSelectedDetailTab('arquivos')}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff]">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-700">Arquivos</span>
                      </button>
                    </div>

                    {/* Anotações */}
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-800 mb-2">Anotações</h4>
                      <textarea
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 focus:outline-none focus:border-[#2b88ff] min-h-[100px] resize-y"
                        placeholder="Digite suas anotações aqui..."
                      />
                    </div>
                  </div>
                )}

                {!isDataLoaded && ['treinos', 'criar_rotina', 'criar_planilha', 'treinos_extras', 'criar_treino_extra'].includes(selectedDetailTab) && <p role="status" className="text-slate-700">Aguarde o carregamento da biblioteca antes de editar.</p>}
                {isDataLoaded && selectedDetailTab === 'treinos' && <AdminRoutineModule key={treinosSubTab} student={selectedStudent} routines={adminRoutines} kind={treinosSubTab === 'aerobico' ? 'aerobic' : 'strength'} onChanged={setAdminRoutines} />}
                {isDataLoaded && selectedDetailTab === 'criar_rotina' && <AdminRoutineModule student={selectedStudent} routines={adminRoutines} kind="strength" onChanged={setAdminRoutines} createInitially />}
                {isDataLoaded && selectedDetailTab === 'criar_planilha' && <AdminRoutineModule student={selectedStudent} routines={adminRoutines} kind="aerobic" onChanged={setAdminRoutines} createInitially />}
                {selectedDetailTab === 'avaliacoes' && <AdminStudentModules student={selectedStudent} module="assessments" />}
                {selectedDetailTab === 'anamneses' && <AdminStudentModules student={selectedStudent} module="anamneses" />}
                {selectedDetailTab === 'editar_aluno' && <StudentProfileEditor key={selectedStudent.uid} student={selectedStudent} onCancel={() => setSelectedDetailTab('opcoes')} onSaved={updated => { setSelectedStudent(updated); setUsers(previous => previous.map(user => user.uid === updated.uid ? updated : user)); setSelectedDetailTab('opcoes'); }} />}

                {/* TABCONTENT: OPTIONS (OPÇÕES) */}
                {selectedDetailTab === 'opcoes' && (
                  <div className="space-y-4 pt-1">

                    {/* Option List Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                      <a
                        href={studentWhatsAppUrl(selectedStudent, `Olá ${selectedStudent.name}!`)}
                        onClick={event => { if (!studentWhatsAppUrl(selectedStudent)) { event.preventDefault(); setSelectedDetailTab('editar_aluno'); } }}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <MessageSquare className="w-5 h-5 text-emerald-500" />
                        </div>
                        <span className="text-sm font-medium text-slate-700">{studentWhatsAppUrl(selectedStudent) ? 'Conversar com o aluno' : 'WhatsApp não cadastrado — edite o aluno'}</span>
                      </a>

                      <button
                        onClick={() => {
                          const link = `https://cadu-ponce-personal.vercel.app/login?email=${encodeURIComponent(selectedStudent.email)}`;
                          void handleCopyLink(link, selectedStudent.uid);
                        }}
                        className="w-full flex items-center gap-4 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer text-left"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Info className="w-5 h-5 text-[#3182ce]" />
                        </div>
                        <span className="text-sm font-medium text-slate-700">
                          {copiedLink === selectedStudent.uid ? 'Copiado!' : 'Informações de login'}
                        </span>
                      </button>

                      <button onClick={() => { setSelectedStudent(null); setIsNotificationsOpen(true); }}
                        className="w-full flex items-center gap-4 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer text-left"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Bell className="w-5 h-5 text-[#3182ce]" />
                        </div>
                        <span className="text-sm font-medium text-slate-700">Notificações neste dispositivo</span>
                      </button>

                      <button onClick={() => setSelectedDetailTab('editar_aluno')}
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition cursor-pointer text-left"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Edit3 className="w-5 h-5 text-[#3182ce]" />
                        </div>
                        <span className="text-sm font-medium text-slate-700">Editar informações do aluno</span>
                      </button>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3 pt-2">
                      <button
                        disabled={studentMutationBusy}
                        onClick={() => handleUpdateStudentStatus(selectedStudent.uid, selectedStudent.status === 'active' || !selectedStudent.status ? 'inactive' : 'active')}
                        className="w-full py-3.5 bg-white border border-[#3182ce] text-[#3182ce] font-medium rounded-lg text-sm transition hover:bg-blue-50 cursor-pointer"
                      >
                        {selectedStudent.status === 'active' || !selectedStudent.status ? 'Inativar aluno' : 'Reativar aluno'}
                      </button>

                      <button
                        disabled={studentMutationBusy || selectedStudent.status === 'excluded'} onClick={() => handleDeleteUser(selectedStudent.uid)}
                        className="w-full py-3.5 bg-white border border-red-500 text-red-500 font-medium rounded-lg text-sm transition hover:bg-red-50 cursor-pointer"
                      >
                        Excluir aluno
                      </button>
                    </div>

                  </div>
                )}

                {/* TABCONTENT: PROGRESSO DO ALUNO */}
                {selectedDetailTab === 'progresso' && (
                  <div className="space-y-4 pb-6">
                    {trainerLoadingPhotos ? (
                      <div className="bg-white rounded-xl p-8 text-center text-slate-500 font-medium text-xs">
                        Carregando fotos de progresso...
                      </div>
                    ) : trainerProgressPhotos.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                            Fotos registradas pelo aluno ({trainerProgressPhotos.length})
                          </h4>
                        </div>
                        {trainerProgressPhotos.map((photo) => {
                          const dateFormatted = photo.date ? new Date(photo.date).toLocaleString('pt-BR') : '';
                          return (
                            <div key={photo.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 font-bold">
                                <span>{dateFormatted}</span>
                              </div>
                              <div className="p-3 bg-slate-900 flex items-center justify-center max-h-[380px] overflow-hidden">
                                <PrivateImage
                                  src={photo.photoURL}
                                  alt="Foto do aluno"
                                  className="w-full h-auto max-h-[380px] object-contain rounded-lg"
                                />
                              </div>
                              {photo.notes && (
                                <div className="p-3 bg-white border-t border-slate-100 text-xs text-slate-800">
                                  <span className="font-bold text-slate-500 block mb-1">Comentário do aluno:</span>
                                  <p className="leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                                    "{photo.notes}"
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 flex flex-col items-center">
                        <div className="w-16 h-16 bg-[#EBF4FF] rounded-full flex items-center justify-center text-[#2b88ff] mb-6">
                          <ClipboardCheck className="w-8 h-8" />
                        </div>

                        <h3 className="text-[15px] font-bold text-slate-800 mb-8 text-center">
                          Incentive seu <span className="text-[#0070f3]">aluno</span> a registrar o progresso!
                        </h3>

                        <div className="w-full space-y-4 mb-8">
                          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <div className="w-8 h-8 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff] shrink-0">
                              <Camera className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">Acompanhe a evolução com fotos</span>
                          </div>

                          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <div className="w-8 h-8 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff] shrink-0">
                              <TrendingUp className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">Registre mudanças ao longo do tempo</span>
                          </div>

                          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <div className="w-8 h-8 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff] shrink-0">
                              <RefreshCw className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">Compare resultados</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#EBF4FF] flex items-center justify-center text-[#2b88ff] shrink-0">
                              <Zap className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">Mantenha o aluno motivado</span>
                          </div>
                        </div>

                        <button
                          className="w-full bg-[#0070f3] hover:bg-[#005ccc] text-white font-semibold py-3.5 rounded-md transition"
                          onClick={() => {
                            const msg = `Olá ${selectedStudent.name}, não esqueça de registrar seu progresso no app!`;
                            const url = studentWhatsAppUrl(selectedStudent, msg);
                            if (url) window.open(url, '_blank', 'noopener,noreferrer');
                            else { alert('Cadastre o WhatsApp do aluno para enviar o lembrete.'); setSelectedDetailTab('editar_aluno'); }
                          }}
                        >
                          Enviar lembrete
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isDataLoaded && ['treinos_extras', 'criar_treino_extra'].includes(selectedDetailTab) && <AdminRoutineModule student={selectedStudent} routines={adminRoutines} kind="extra" onChanged={setAdminRoutines} createInitially={selectedDetailTab === 'criar_treino_extra'} />}
                {selectedDetailTab === 'arquivos' && <AdminStudentModules student={selectedStudent} module="files" />}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {createdAccess && <div role="dialog" aria-modal="true" aria-label="Acesso criado" className="fixed inset-0 z-[220] bg-black/60 flex items-center justify-center p-4"><div className="bg-white text-slate-900 rounded-xl p-6 max-w-lg w-full space-y-4"><h3 className="font-bold text-lg">Acesso criado para {createdAccess.name}</h3><p className="text-sm">Compartilhe estes dados manualmente com o aluno. Nenhum e-mail ou WhatsApp foi enviado.</p><p className="text-sm select-text break-all">E-mail: {createdAccess.email}</p><p className="text-sm select-text break-all">Senha inicial: {createdAccess.password}</p>{createdAccess.warning && <p role="alert" className="text-amber-800">{createdAccess.warning}</p>}<button className="bg-blue-600 text-white rounded px-4 py-2" onClick={async () => { try { await navigator.clipboard.writeText('Seu acesso ao Cadu Ponce Personal: https://cadu-ponce-personal.vercel.app\nE-mail: ' + createdAccess.email + '\nSenha inicial: ' + createdAccess.password + '\nVocê pode trocar a senha na opção Esqueci minha senha.'); alert('Dados copiados. Envie diretamente ao aluno.'); } catch { alert('Não foi possível copiar. Selecione os dados exibidos.'); } }}>Copiar dados de acesso</button><button className="ml-3" onClick={() => setCreatedAccess(null)}>Concluir</button></div></div>}

      {/* OVERLAY 2: ADD NEW STUDENT MODAL (REWRITTEN TO MATCH IMAGE) */}
      <AnimatePresence>
        {isAddingUser && (
          <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-start md:p-6 overflow-y-auto">

            {/* Header / Banner area */}
            <div className="w-full max-w-xl bg-[#0c1d2e] p-6 pb-20 md:rounded-t-3xl flex flex-col items-start relative shrink-0">
               <button
                type="button"
                disabled={isCreatingUser}
                onClick={() => { if (createUserLock.current) return; setIsAddingUser(false); resetNewUserPasswords(); }}
                className="flex items-center text-white text-[10px] font-bold opacity-80 hover:opacity-100 transition mb-6 uppercase tracking-wider"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
              </button>
              <h2 className="text-white text-xl font-black italic uppercase tracking-tight">
                Adicionar novo aluno
              </h2>
            </div>

            {/* Mobile-friendly Form Container */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: -60, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-xl bg-white rounded-3xl p-6 shadow-2xl relative border border-slate-100 mx-4"
            >
              <form onSubmit={handleCreateUser} className="space-y-5">
                <fieldset disabled={isCreatingUser} className="space-y-5 disabled:opacity-60">

                {/* Nome completo */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Nome completo</label>
                  <input
                    autoFocus
                    required
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none focus:bg-white focus:border-[#dc2626] transition duration-200"
                  />
                </div>

                {/* E-mail */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">E-mail</label>
                  <input
                    required
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none focus:bg-white focus:border-[#dc2626] transition duration-200"
                  />
                </div>

                {/* Access password and confirmation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="new-account-password" className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Senha de Acesso</label>
                    <div className="relative">
                      <input
                        id="new-account-password"
                        required
                        type={showFormPassword ? 'text' : 'password'}
                        minLength={12}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={formPassword}
                        onChange={(e) => { setFormPassword(e.target.value); setFormPasswordError(''); }}
                        placeholder="Pelo menos 12 caracteres"
                        className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none focus:bg-white focus:border-[#dc2626] transition duration-200"
                      />
                      <button type="button" onClick={() => setShowFormPassword(value => !value)} aria-label={showFormPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-controls="new-account-password" aria-pressed={showFormPassword} className="absolute right-0 top-0 bottom-0 w-11 flex items-center justify-center text-slate-500 hover:text-red-600 rounded-lg">
                        {showFormPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-account-confirm-password" className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Confirmar Senha</label>
                    <div className="relative">
                      <input
                        ref={confirmPasswordInput}
                        id="new-account-confirm-password"
                        required
                        type={showFormConfirmPassword ? 'text' : 'password'}
                        minLength={12}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={formConfirmPassword}
                        onChange={(e) => { setFormConfirmPassword(e.target.value); setFormPasswordError(''); }}
                        placeholder="Repita a senha de acesso"
                        aria-invalid={Boolean(formPasswordError)}
                        aria-describedby={formPasswordError ? 'new-account-password-error' : undefined}
                        className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none focus:bg-white focus:border-[#dc2626] transition duration-200"
                      />
                      <button type="button" onClick={() => setShowFormConfirmPassword(value => !value)} aria-label={showFormConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'} aria-controls="new-account-confirm-password" aria-pressed={showFormConfirmPassword} className="absolute right-0 top-0 bottom-0 w-11 flex items-center justify-center text-slate-500 hover:text-red-600 rounded-lg">
                        {showFormConfirmPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                </div>
                {formPasswordError && <p id="new-account-password-error" role="alert" className="text-sm text-red-600">{formPasswordError}</p>}

                <div className="space-y-1.5">
                    <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Tipo de Conta</label>
                    <div className="relative">
                      <select
                        value={formRole}
                        onChange={(e) => setFormRole(e.target.value as 'student' | 'admin')}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none appearance-none focus:bg-white focus:border-[#dc2626]"
                      >
                        <option value="student">Aluno</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {/* Selecione um grupo */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Selecione um grupo</label>
                  <div className="relative">
                    <select
                      value={formGroup}
                      onChange={(e) => setFormGroup(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none appearance-none focus:bg-white focus:border-[#dc2626]"
                    >
                      <option value="">Selecione</option>
                      <option value="Consultoria">Consultoria</option>
                      <option value="Personal Trainer">Personal Trainer</option>
                      <option value="Avaliação">Avaliação</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Data de nascimento */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Data de nascimento</label>
                  <input
                    type="date"
                    placeholder="DD/MM/YYYY"
                    value={formBirthDate}
                    onChange={(e) => setFormBirthDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-400 outline-none focus:bg-white focus:border-[#dc2626]"
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">WhatsApp do aluno (DDD e número)</label>
                  <div className="flex items-center">
                    <div className="flex items-center px-3 py-3 bg-slate-50 border border-r-0 border-slate-100 rounded-l-lg space-x-2">
                       <PrivateImage src="https://flagcdn.com/w20/br.png" width="20" alt="Brazil" className="rounded-sm" />
                       <span className="text-sm font-bold text-slate-600">+55</span>
                    </div>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-r-lg font-bold text-sm text-slate-900 outline-none focus:bg-white focus:border-[#dc2626]"
                    />
                  </div>
                </div>

                {/* Gênero */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Gênero</label>
                  <div className="relative">
                    <select
                      value={formGender}
                      onChange={(e) => setFormGender(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none appearance-none focus:bg-white focus:border-[#dc2626]"
                    >
                      <option value="">Selecione</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                      <option value="Outro">Outro</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Entrega manual do acesso: após salvar, copie o e-mail e a senha e compartilhe diretamente com o aluno. Nenhuma mensagem é enviada automaticamente.</p>

                {/* Enviar anamnese */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Criar anamnese no aplicativo</label>
                  <div className="relative">
                    <select
                      value={formSendAnamnesis}
                      onChange={(e) => setFormSendAnamnesis(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none appearance-none focus:bg-white focus:border-[#dc2626]"
                    >
                      <option value="">Selecione</option>
                      <option value="Anamnese Padrão">Anamnese Padrão</option>
                      <option value="Nenhuma">Nenhuma</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Salvar Button */}
                <button
                  type="submit"
                  className="w-full bg-[#dc2626] hover:bg-[#ef4444] text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 text-xs uppercase tracking-widest italic"
                >
                  Salvar
                </button>
              </fieldset>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ASSIGN ROUTINE MODAL */}
      <AnimatePresence>
        {assigningRoutine && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                <div>
                  <h3 className="font-black italic uppercase text-slate-900 tracking-tighter">Atribuir Rotina</h3>
                  <p className="text-[10px] font-bold text-slate-500 mt-0.5">{assigningRoutine.name}</p>
                </div>
                <button
                  onClick={() => setAssigningRoutine(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 bg-white rounded-xl shadow-sm border border-slate-100 transition active:scale-95"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                <p className="text-xs font-bold text-slate-600">Selecione os alunos que devem receber este treino:</p>

                <div className="space-y-2">
                  {users.filter(u => u.role === 'student').length === 0 ? (
                    <p className="text-xs text-slate-400 font-medium text-center py-4 bg-slate-50 rounded-xl">Nenhum aluno cadastrado</p>
                  ) : users.filter(u => u.role === 'student').map(student => (
                    <label key={student.uid} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:border-[#dc2626]/30 transition bg-white">
                      <input
                        type="checkbox"
                        checked={routineStudentIds.includes(student.uid)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setRoutineStudentIds(prev => [...prev, student.uid]);
                          } else {
                            setRoutineStudentIds(prev => prev.filter(id => id !== student.uid));
                          }
                        }}
                        className="accent-[#dc2626] w-4 h-4"
                      />
                      <span className="text-sm font-bold text-slate-800">{student.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0">
                <button
                  disabled={isSavingRoutine}
                  onClick={handleSaveRoutineAssignment}
                  className="w-full bg-[#dc2626] text-white py-4 rounded-xl font-black italic uppercase tracking-widest text-xs shadow-lg shadow-red-200 hover:bg-[#ef4444] active:scale-95 transition"
                >
                  Salvar Atribuição ({routineStudentIds.length})
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OPTIONS EDITOR MODAL */}
      <AnimatePresence>
        {isEditingOptions && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed inset-0 z-[100] bg-[#f4f7fa] flex flex-col"
          >
            {/* Header */}
            <div className="bg-[#0c1622] px-4 pt-6 pb-6 flex flex-col items-start gap-4 shrink-0">
               <button
                 onClick={() => setIsEditingOptions(false)}
                 className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80 cursor-pointer text-left"
               >
                 <ChevronLeft className="w-3.5 h-3.5 inline inline-block" /> Voltar
               </button>
               <h4 className="text-white text-xl font-black tracking-tighter text-left leading-none">
                 {editingOptionType === 'muscle' ? 'Grupos' : 'Categorias'}
               </h4>
            </div>

            {/* Body Card */}
            <div className="flex-1 bg-white mt-4 mx-4 rounded-t-lg shadow-sm border border-slate-100 flex flex-col overflow-hidden relative">
               <div className="p-4 space-y-4 shrink-0 bg-white">
                  {/* Create Button */}
                  {!showOptionInput ? (
                    <button
                      onClick={() => setShowOptionInput(true)}
                      className="w-full py-4 bg-white border border-[#dc2626] rounded-lg text-[#dc2626] text-sm font-bold transition cursor-pointer"
                    >
                       + Criar {editingOptionType === 'muscle' ? 'grupo muscular' : 'categoria'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newOptionValue}
                        onChange={(e) => setNewOptionValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddOption();
                            setShowOptionInput(false);
                          }
                        }}
                        placeholder={`Nome ${editingOptionType === 'muscle' ? 'do grupo' : 'da categoria'}...`}
                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-[#dc2626]"
                      />
                      <button
                        onClick={() => {
                          handleAddOption();
                          setShowOptionInput(false);
                        }}
                        className="bg-[#dc2626] text-white px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wider hover:bg-red-600 transition cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowOptionInput(false);
                          setNewOptionValue('');
                        }}
                        className="text-slate-400 p-3 hover:text-slate-600 transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Search Input */}
                  <input
                     type="text"
                     value={optionSearchQuery}
                     onChange={(e) => setOptionSearchQuery(e.target.value)}
                     placeholder={`Buscar ${editingOptionType === 'muscle' ? 'grupos' : 'categorias'}...`}
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg py-3 px-4 text-sm text-slate-600 outline-none focus:border-slate-300 transition"
                  />
               </div>

               {/* List */}
               <div className="flex-1 overflow-y-auto px-4 pb-4 bg-white text-left">
                  <div className="space-y-0">
                    {(editingOptionType === 'muscle' ? appMuscleGroups : appCategories)
                      .filter(opt => opt.toLowerCase().includes(optionSearchQuery.toLowerCase()))
                      .map((opt) => (
                      <div key={opt} className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0 group">
                        <span className="text-[14px] font-bold text-slate-800">{opt}</span>
                        <button
                          onClick={() => handleRemoveOption(opt)}
                          className="text-slate-200 hover:text-red-500 transition cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EXERCISE LIBRARY PICKER MODAL */}
      <AnimatePresence>
        {selectingExerciseForIdx !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-slate-50 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-black italic uppercase text-slate-900 tracking-tighter">Buscar na Biblioteca</h3>
                <button
                  onClick={() => {
                    setSelectingExerciseForIdx(null);
                    setExerciseSearch('');
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 rounded-xl transition active:scale-95 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 shrink-0 bg-white border-b border-slate-100">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Nome do exercício..."
                    value={exerciseSearch}
                    onChange={(e) => setExerciseSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border-none text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#dc2626]/20 transition"
                  />
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-3">
                {exercises
                  .filter(e => e.title.toLowerCase().includes(exerciseSearch.toLowerCase()))
                  .map(libEx => (
                    <button
                      key={libEx.title}
                      onClick={() => {
                        updateRoutineExercise(selectingExerciseForIdx, {
                          name: libEx.title,
                          ...exerciseVideoFields(libEx.videoFileUrl || libEx.videoUrl || '', libEx),
                          notes: libEx.description || ''
                        });
                        setSelectingExerciseForIdx(null);
                        setExerciseSearch('');
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100 hover:border-[#dc2626] transition text-left cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                        <PrivateImage src={libEx.image} alt={libEx.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-black text-slate-900 truncate">{libEx.title}</h4>
                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">{libEx.group} • {libEx.category}</p>
                      </div>
                      <div className="shrink-0 flex gap-1">
                        {libEx.videoUrl && <Video className="w-4 h-4 text-blue-500" />}
                      </div>
                    </button>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
