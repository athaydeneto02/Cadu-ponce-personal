/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Link as LinkIcon, 
  MessageSquare, 
  Calendar, 
  Wallet, 
  Search, 
  Plus, 
  Edit3,
  Phone, 
  ArrowLeft, 
  Check, 
  Copy, 
  Home, 
  DollarSign, 
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
  LayoutGrid,
  MoreHorizontal,
  Box,
  Accessibility,
  MoreVertical,
  Eye,
  ArrowUpDown,
  Archive,
  Image as ImageIcon,
  CheckCircle2,
  Activity,
  ClipboardCheck,
  Info,
  SlidersHorizontal
} from 'lucide-react';
import { AdminAgenda } from './AdminAgenda';
import { UserProfile, Workout } from '../types';
import { storage } from '../lib/storage';
import { generateWorkoutPDF } from '../lib/pdfGenerator';

interface AccountManagementProps {
  onClose: () => void;
  isDark?: boolean;
}

// Ensure initial list has the students in the screenshot
const DEFAULT_STUDENTS: UserProfile[] = [
  {
    uid: '11111111-1111-1111-1111-111111111111',
    name: 'Aline Rocha',
    email: 'aline.rocha@gmail.com',
    weight: 59,
    height: 164,
    trainerPhone: '5511999999999',
    role: 'student',
    status: 'active',
    modality: 'Presencial',
    photoURL: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120',
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
  },
  {
    uid: '22222222-2222-2222-2222-222222222222',
    name: 'Carla Pereira',
    email: 'carla.pereira@gmail.com',
    weight: 65,
    height: 168,
    trainerPhone: '5511999999999',
    role: 'student',
    status: 'active',
    modality: 'Online',
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  },
  {
    uid: '33333333-3333-3333-3333-333333333333',
    name: 'José Soares',
    email: 'jose.soares@gmail.com',
    weight: 85,
    height: 182,
    trainerPhone: '5511999999999',
    role: 'student',
    status: 'active',
    modality: 'Online',
    photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120',
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString()
  },
  {
    uid: '44444444-4444-4444-4444-444444444444',
    name: 'ATHAYDE FELIPPE LEITAO NETO',
    email: 'athaydefelippeleitao@gmail.com',
    weight: 85,
    height: 182,
    trainerPhone: '5511999999999',
    role: 'student',
    status: 'active',
    modality: 'Presencial',
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
  },
  {
    uid: '55555555-5555-5555-5555-555555555555',
    name: 'Carolina Santos',
    email: 'carol.santos@email.com',
    weight: 62,
    height: 168,
    trainerPhone: '5511999999999',
    role: 'student',
    status: 'active',
    modality: 'Online',
    createdAt: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString()
  },
  {
    uid: '66666666-6666-6666-6666-666666666666',
    name: 'João Pereira',
    email: 'joao.p@email.com',
    weight: 92,
    height: 178,
    trainerPhone: '5511999999999',
    role: 'student',
    status: 'inactive',
    modality: 'Presencial',
    createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString()
  },
  {
    uid: '77777777-7777-7777-7777-777777777777',
    name: 'Sônia Maria',
    email: 'sonia.m@email.com',
    weight: 65,
    height: 160,
    trainerPhone: '5511999999999',
    status: 'active',
    modality: 'Online',
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  },
  {
    uid: '88888888-8888-8888-8888-888888888888',
    name: 'Aluno Teste',
    email: 'aluno.teste@caduponce.com',
    weight: 70,
    height: 170,
    trainerPhone: '5511999999999',
    role: 'student',
    status: 'active',
    modality: 'Online',
    createdAt: new Date().toISOString()
  }
];

export default function AccountManagement({ onClose, isDark }: AccountManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [studentTab, setStudentTab] = useState<'alunos' | 'grupos'>('alunos');
  const [studentGroupSearch, setStudentGroupSearch] = useState('');
  const [studentGroups, setStudentGroups] = useState<string[]>(() => {
    const saved = localStorage.getItem('cadu_ponce_student_groups');
    if (saved) {
      try { return JSON.parse(saved); } catch(e){}
    }
    return ['Online', 'Presencial'];
  });
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
  const [adminNotifs, setAdminNotifs] = useState<any[]>([]);

  useEffect(() => {
    const loadNotifs = () => {
      try {
        const stored = localStorage.getItem('cadu_notifs_admin');
        if (stored) setAdminNotifs(JSON.parse(stored));
      } catch {}
    };
    loadNotifs();
    window.addEventListener('cadu_new_notification', loadNotifs);
    return () => window.removeEventListener('cadu_new_notification', loadNotifs);
  }, []);
  const handleDeleteStudent = async (uid: string) => {
    if (window.confirm('Tem certeza que deseja excluir este aluno?')) {
      const student = users.find(u => u.uid === uid);
      if (student) {
        const updatedStudent = { ...student, status: 'excluded' as const };
        
        try {
          // Update local state immediately for better UX
          setUsers(users.map(u => u.uid === uid ? updatedStudent : u));
          
          // Actually persist
          await storage.updateProfile(updatedStudent);
        } catch (err) {
          console.error("Failed to exclude student", err);
          alert('Erro ao excluir aluno. Tente novamente.');
          // Revert if failed
          setUsers(users);
        }
      }
    }
  };

  const handleAddOption = () => {
    if (!newOptionValue.trim()) return;
    if (editingOptionType === 'muscle') {
      const updated = [...appMuscleGroups, newOptionValue.trim()];
      setAppMuscleGroups(updated);
      storage.saveMuscleGroups(updated);
    } else {
      const updated = [...appCategories, newOptionValue.trim()];
      setAppCategories(updated);
      storage.saveCategories(updated);
    }
    setNewOptionValue('');
  };

  const handleRemoveOption = (val: string) => {
    if (editingOptionType === 'muscle') {
      const updated = appMuscleGroups.filter(g => g !== val);
      setAppMuscleGroups(updated);
      storage.saveMuscleGroups(updated);
    } else {
      const updated = appCategories.filter(c => c !== val);
      setAppCategories(updated);
      storage.saveCategories(updated);
    }
  };

  const [activeTab, setActiveTab] = useState<'home' | 'wallet' | 'menu'>('home');
  const [homeSubView, setHomeSubView] = useState<'dashboard' | 'student_list' | 'retention' | 'workout_library' | 'create_routine' | 'routine_details' | 'frequency_report' | 'exercise_library' | 'agenda'>('dashboard');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Workouts and dynamic detailed states
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  // Retention Metrics Calculation
  const studentUsers = users.filter(u => u.role === 'student');
  const activeCount = studentUsers.filter(u => u.status === 'active' || !u.status).length;
  const inactiveCount = studentUsers.filter(u => u.status === 'inactive').length;
  const engagementRate = studentUsers.length > 0 ? 75 : 0; // Simulated for now

  // Categories for Retention
  const engajamentoCategorias = [
    { label: 'Engajado', count: Math.max(0, activeCount - 2), percent: activeCount > 0 ? Math.round((Math.max(0, activeCount - 2) / activeCount) * 100) : 0, color: 'bg-emerald-400' },
    { label: 'Oscilando', count: activeCount > 1 ? 1 : 0, percent: activeCount > 0 ? Math.round(( (activeCount > 1 ? 1 : 0) / activeCount) * 100) : 0, color: 'bg-amber-300' },
    { label: 'Em risco', count: activeCount > 2 ? 1 : 0, percent: activeCount > 0 ? Math.round(( (activeCount > 2 ? 1 : 0) / activeCount) * 100) : 0, color: 'bg-amber-400' },
    { label: 'Abandono', count: inactiveCount, percent: studentUsers.length > 0 ? Math.round((inactiveCount / studentUsers.length) * 100) : 0, color: 'bg-rose-500' },
    { label: 'Recuperado', count: 0, percent: 0, color: 'bg-[#dc2626]' },
  ];

  const [selectedDetailTab, setSelectedDetailTab] = useState<'inicio' | 'opcoes'>('inicio');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showFrequencyCalendar, setShowFrequencyCalendar] = useState(false);
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [frequency, setFrequency] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [editWeight, setEditWeight] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editBF, setEditBF] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'pago' | 'pendente'>('pago');
  const [extraPrescription, setExtraPrescription] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [prescSuccess, setPrescSuccess] = useState(false);

  // Modals / Overlays
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [activePanel, setActivePanel] = useState<'sales_links' | 'feedbacks' | 'updates' | 'wallet_panel' | null>(null);
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
  const [routineShowTime, setRoutineShowTime] = useState('Não');

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

  const [exercises, setExercises] = useState(() => {
    const saved = localStorage.getItem('cadu_ponce_exercises_v3');
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

  // Load admin data from dedicated Supabase tables on mount
  useEffect(() => {
    Promise.all([
      storage.fetchAdminRoutines(),
      storage.fetchCustomExercises(),
      storage.fetchMuscleGroups(),
      storage.fetchCategories(),
      storage.fetchAgendaEvents(),
    ]).then(([routines, customExercises, muscleGroups, categories, agendaEvents]) => {
      if (routines && routines.length > 0) setAdminRoutines(routines);
      if (customExercises && customExercises.length > 0) setExercises(customExercises);
      if (muscleGroups && muscleGroups.length > 0) setAppMuscleGroups(muscleGroups);
      if (categories && categories.length > 0) setAppCategories(categories);
      setIsDataLoaded(true);
    }).catch(() => setIsDataLoaded(true));
  }, []);

  useEffect(() => {
    if (!isDataLoaded) return;
    storage.saveMuscleGroups(appMuscleGroups as string[]);
  }, [appMuscleGroups, isDataLoaded]);

  useEffect(() => {
    if (!isDataLoaded) return;
    storage.saveCategories(appCategories as string[]);
  }, [appCategories, isDataLoaded]);

  useEffect(() => {
    if (!isDataLoaded) return;
    // Sync custom exercises to Supabase: save only newly added/modified ones
    // (bulk save - iterate and upsert each)
    const cached = localStorage.getItem('cadu_ponce_exercises_v3');
    const cachedList = cached ? JSON.parse(cached) : [];
    exercises.forEach((ex: any) => {
      const was = cachedList.find((c: any) => c.id === ex.id);
      if (!was || JSON.stringify(was) !== JSON.stringify(ex)) {
        storage.saveCustomExercise(ex);
      }
    });
    localStorage.setItem('cadu_ponce_exercises_v3', JSON.stringify(exercises));
  }, [exercises, isDataLoaded]);

  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [editingExerciseOriginalTitle, setEditingExerciseOriginalTitle] = useState<string | null>(null);

  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExGroup, setNewExGroup] = useState(appMuscleGroups[0] || 'Abdômen');
  const [newExCategory, setNewExCategory] = useState(appCategories[0] || 'Musculação');
  const [newExImage, setNewExImage] = useState('');
  const [newExVideo, setNewExVideo] = useState('');
  const [newExDesc, setNewExDesc] = useState('');
  const [isUploadingExerciseImage, setIsUploadingExerciseImage] = useState(false);
  const [isUploadingExerciseVideo, setIsUploadingExerciseVideo] = useState(false);

  const [previewingExercise, setPreviewingExercise] = useState<{ title: string; group: string; category: string; image: string; isFavorite: boolean; isCustom: boolean; videoUrl?: string; description?: string; } | null>(null);


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
    if (!routineName || routineName === 'NOME DA ROTINA') return;
    const studentNames = routineStudentIds.map(id => {
      const s = users.find(u => u.uid === id);
      return s ? s.name : '';
    });
    const routine: import('../types').AdminRoutine = {
      id: editingRoutine?.id || `routine_${Date.now()}`,
      name: routineName,
      goal: routineGoal,
      difficulty: routineDifficulty,
      notes: routineNotes,
      studentIds: routineStudentIds,
      studentNames,
      exercises: routineExercises,
      createdAt: editingRoutine?.createdAt || new Date().toISOString(),
    };
    await storage.saveAdminRoutine(routine);
    setAdminRoutines(storage.getAdminRoutines());

    // Automatically create Workouts for assigned students
    if (routineStudentIds.length > 0) {
      routineStudentIds.forEach(async (studentId) => {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId);
        if (!isUUID) {
          console.warn(`Skipping assignment for legacy student ID: ${studentId}`);
          return;
        }

        const newWorkout: import('../types').Workout = {
          id: crypto.randomUUID(),
          studentId,
          name: routine.name,
          description: routine.notes || routine.goal,
          exercises: routine.exercises.map((ex, idx) => ({
            ...ex,
            id: crypto.randomUUID()
          })),
          createdAt: new Date().toISOString()
        };
        try {
          await storage.saveWorkout(newWorkout);
        } catch (err: any) {
          console.error('Failed to assign workout to student:', err);
          alert('Erro ao atribuir treino ao aluno: ' + JSON.stringify(err));
        }
      });
    }
    setEditingRoutine(null);
    setRoutineExercises([]);
    setRoutineStudentIds([]);
    setRoutineName('NOME DA ROTINA');
    setRoutineNotes('');
    setHomeSubView('workout_library');
  };

  const handleSaveRoutineAssignment = async () => {
    if (!assigningRoutine) return;
    const studentNames = routineStudentIds.map(id => {
      const s = users.find(u => u.uid === id);
      return s ? s.name : '';
    });
    const updatedRoutine = {
      ...assigningRoutine,
      studentIds: routineStudentIds,
      studentNames,
    };
    await storage.saveAdminRoutine(updatedRoutine);
    setAdminRoutines(storage.getAdminRoutines());

    // Create a Workout for each student so it shows up on their end
    let successCount = 0;
    for (const studentId of routineStudentIds) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId);
      if (!isUUID) {
        alert(`O aluno com ID "${studentId}" é um usuário antigo/fantasma. A ficha foi ignorada para ele.`);
        continue;
      }

      const newWorkout: import('../types').Workout = {
        id: crypto.randomUUID(),
        studentId,
        name: assigningRoutine.name,
        description: assigningRoutine.notes || assigningRoutine.goal,
        exercises: assigningRoutine.exercises.map((ex, idx) => ({
          ...ex,
          id: crypto.randomUUID()
        })),
        createdAt: new Date().toISOString()
      };
      try {
        await storage.saveWorkout(newWorkout);
        successCount++;
      } catch (err: any) {
        console.error('Failed to assign workout to student:', err);
        alert('Erro ao atribuir treino ao aluno: ' + JSON.stringify(err));
      }
    }
    
    if (successCount > 0) {
      alert(`Treino atribuído com sucesso a ${successCount} aluno(s) no Supabase!`);
    }

    setAssigningRoutine(null);
    setRoutineStudentIds([]);
    alert('Treino atribuído com sucesso!');
  };

  const handleDeleteAdminRoutine = async (id: string) => {
    await storage.deleteAdminRoutine(id);
    setAdminRoutines(storage.getAdminRoutines());
  };

  const handleEditAdminRoutine = (routine: import('../types').AdminRoutine) => {
    setEditingRoutine(routine);
    setRoutineName(routine.name);
    setRoutineGoal(routine.goal);
    setRoutineDifficulty(routine.difficulty);
    setRoutineNotes(routine.notes || '');
    setRoutineExercises(routine.exercises);
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
      const exId = routineExercises[idx]?.id || `ex_${Date.now()}`;
      const url = await storage.uploadExerciseVideo(file, exId);
      updateRoutineExercise(idx, 'videoFileUrl', url);
    } catch (e) {
      console.error('Video upload failed', e);
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

  // Load and clean users & load workouts
  useEffect(() => {
    setWorkouts(storage.getWorkouts());
    const list = storage.getUsersList();
    
    // Filter out legacy and dummy students
    const isRealUUID = (id: string) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
      // Filter out the repeating fake UUIDs (like 44444444-4444-...)
      if (/^(\d)\1{7}-\1{4}-\1{4}-\1{4}-\1{12}$/.test(id)) return false;
      return true;
    };

    const realUsers = list.filter(u => isRealUUID(u.uid));
    
    storage.saveUsersList(realUsers);
    setUsers(realUsers);

    // Asynchronously fetch from Supabase to get real users
    storage.fetchUsersList().then((supabaseUsers) => {
      if (supabaseUsers && supabaseUsers.length > 0) {
        const validUsers = supabaseUsers.filter(u => isRealUUID(u.uid));
        setUsers(validUsers);
        storage.saveUsersList(validUsers);
      } else {
        // If Supabase is empty, force empty state to override any lingering cache
        setUsers([]);
        storage.saveUsersList([]);
      }
    }).catch(err => {
      console.error('Error fetching data for admin:', err);
    });
  }, []);

  // Selected Student Form synchronization
  useEffect(() => {
    if (selectedStudent) {
      setSelectedDetailTab('inicio');
      setExpandedCategory(null);
      setEditWeight(selectedStudent.weight?.toString() || '');
      setEditHeight(selectedStudent.height?.toString() || '');
      
      const savedBF = localStorage.getItem(`cadu_bf_${selectedStudent.uid}`) || '';
      setEditBF(savedBF);
      
      const savedPayment = localStorage.getItem(`cadu_payment_${selectedStudent.uid}`) as 'pago' | 'pendente' | null;
      setEditPaymentStatus(savedPayment || 'pago');
      
      const savedPresc = localStorage.getItem(`cadu_presc_${selectedStudent.uid}`) || '';
      setExtraPrescription(savedPresc);

      const savedFreq = localStorage.getItem(`cadu_freq_${selectedStudent.uid}`);
      if (savedFreq) {
        setFrequency(JSON.parse(savedFreq));
      } else {
        const def = [true, false, true, false, true, false, false];
        setFrequency(def);
        localStorage.setItem(`cadu_freq_${selectedStudent.uid}`, JSON.stringify(def));
      }
    }
  }, [selectedStudent]);

  const handleToggleDay = (index: number) => {
    if (!selectedStudent) return;
    const updated = [...frequency];
    updated[index] = !updated[index];
    setFrequency(updated);
    localStorage.setItem(`cadu_freq_${selectedStudent.uid}`, JSON.stringify(updated));
  };

  const handleSaveAssessment = () => {
    if (!selectedStudent) return;
    const parsedWeight = editWeight ? parseFloat(editWeight) : undefined;
    const parsedHeight = editHeight ? parseInt(editHeight) : undefined;
    
    const updatedUsers = users.map(u => {
      if (u.uid === selectedStudent.uid) {
        return {
          ...u,
          weight: parsedWeight,
          height: parsedHeight
        };
      }
      return u;
    });
    
    storage.saveUsersList(updatedUsers);
    setUsers(updatedUsers);
    setSelectedStudent(prev => prev ? {
      ...prev,
      weight: parsedWeight,
      height: parsedHeight
    } : null);
    
    localStorage.setItem(`cadu_bf_${selectedStudent.uid}`, editBF);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleSavePrescription = () => {
    if (!selectedStudent) return;
    localStorage.setItem(`cadu_presc_${selectedStudent.uid}`, extraPrescription);
    setPrescSuccess(true);
    setTimeout(() => setPrescSuccess(false), 2000);
  };

  const handleTogglePayment = () => {
    if (!selectedStudent) return;
    const nextPayment = editPaymentStatus === 'pago' ? 'pendente' : 'pago';
    setEditPaymentStatus(nextPayment);
    localStorage.setItem(`cadu_payment_${selectedStudent.uid}`, nextPayment);
  };

  const handleToggleModality = () => {
    if (!selectedStudent) return;
    const nextModality = selectedStudent.modality === 'Presencial' ? 'Online' : 'Presencial';
    
    const updatedUsers = users.map(u => {
      if (u.uid === selectedStudent.uid) {
        return { ...u, modality: nextModality };
      }
      return u;
    });
    
    storage.saveUsersList(updatedUsers);
    setUsers(updatedUsers);
    setSelectedStudent(prev => prev ? { ...prev, modality: nextModality } : null);
  };

  const handleAddWorkout = (templateType: 'inferiores' | 'superiores' | 'cardio') => {
    if (!selectedStudent) return;
    
    let name = '';
    let description = '';
    let exercises: any[] = [];
    
    const count = workouts.filter(w => w.studentId === selectedStudent.uid).length;
    const letter = String.fromCharCode(65 + count); // A, B, C...
    
    if (templateType === 'inferiores') {
      name = `Treino ${letter} - Membros Inferiores`;
      description = 'Foco em força de membros inferiores e estabilização de joelhos';
      exercises = [
        { id: `ex_i1_${Date.now()}`, name: 'Cadeira Extensora (Série Pirâmide)', sets: 4, reps: '12-10-8-6', rest: '60s', currentLoad: 40 },
        { id: `ex_i2_${Date.now()}`, name: 'Leg Press 45º Integrado', sets: 4, reps: '12', rest: '60s', currentLoad: 160 },
        { id: `ex_i3_${Date.now()}`, name: 'Agachamento Búlgaro', sets: 3, reps: '10 de cada lado', rest: '45s', currentLoad: 12 },
        { id: `ex_i4_${Date.now()}`, name: 'Cadeira Flexora Unilateral', sets: 3, reps: '15', rest: '45s', currentLoad: 30 }
      ];
    } else if (templateType === 'superiores') {
      name = `Treino ${letter} - Superiores Completo`;
      description = 'Definição e fortalecimento do core e membros superiores';
      exercises = [
        { id: `ex_s1_${Date.now()}`, name: 'Supino Reto com Halteres', sets: 4, reps: '10', rest: '60s', currentLoad: 18 },
        { id: `ex_s2_${Date.now()}`, name: 'Puxada Alta Pronada', sets: 4, reps: '12', rest: '60s', currentLoad: 40 },
        { id: `ex_s3_${Date.now()}`, name: 'Elevação Lateral', sets: 3, reps: '15', rest: '45s', currentLoad: 8 },
        { id: `ex_s4_${Date.now()}`, name: 'Rosca Direta Polia', sets: 3, reps: '12', rest: '45s', currentLoad: 20 }
      ];
    } else {
      name = `Treino ${letter} - Hipertrofia e Core`;
      description = 'Combinação de exercícios multiarticulares e prancha abdominal';
      exercises = [
        { id: `ex_c1_${Date.now()}`, name: 'Stiff com Halteres', sets: 4, reps: '12', rest: '60s', currentLoad: 16 },
        { id: `ex_c2_${Date.now()}`, name: 'Prancha Abdominal Isométrica', sets: 3, reps: '45s', rest: '30s', currentLoad: 0 },
        { id: `ex_c3_${Date.now()}`, name: 'Elevação de Quadril', sets: 3, reps: '15', rest: '45s', currentLoad: 20 }
      ];
    }
    
    const newWorkout: Workout = {
      id: `w_custom_${Date.now()}`,
      name,
      description,
      studentId: selectedStudent.uid,
      createdAt: new Date().toISOString(),
      exercises
    };
    
    const updatedWorkouts = [...workouts, newWorkout];
    storage.saveWorkouts(updatedWorkouts);
    setWorkouts(updatedWorkouts);
  };

  const handleDeleteWorkout = (id: string) => {
    const updated = workouts.filter(w => w.id !== id);
    storage.saveWorkouts(updated);
    setWorkouts(updated);
  };

  const refreshList = () => {
    setUsers(storage.getUsersList());
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail) return;

    try {
      const newUser = await storage.adminCreateUser(
        formEmail,
        formName,
        {
          role: formRole as 'student' | 'admin',
          password: formPassword || '123456',
          status: 'active',
          modality: formModality as 'Presencial' | 'Online',
          trainerPhone: formPhone || '5511999999999',
          metadata: {
            group: formGroup,
            birthDate: formBirthDate,
            gender: formGender,
            sendAccessInfo: formSendAccessInfo === 'Sim',
            sendAnamnesis: formSendAnamnesis,
            blockDefaulters: formBlockDefaulters
          }
        }
      );

      setUsers([newUser, ...users]);
      setIsAddingUser(false);
      
      // Reset form
      setFormName('');
      setFormEmail('');
      setFormPhone('');
      setFormPassword('');
      alert('Aluno criado com sucesso no Supabase!');
    } catch (err: any) {
      console.error('Error creating user:', err);
      alert('Erro ao criar aluno: ' + err.message);
    }
  };

  const handleUpdateStudentStatus = (uid: string, newStatus: 'active' | 'inactive' | 'excluded') => {
    const updated = users.map(u => {
      if (u.uid === uid) {
        return { ...u, status: newStatus };
      }
      return u;
    });
    storage.saveUsersList(updated);
    setUsers(updated);
    if (selectedStudent?.uid === uid) {
      setSelectedStudent(null);
    }
  };

  const handleUpdateStudentModality = (uid: string, newModality: 'Presencial' | 'Online') => {
    const updated = users.map(u => {
      if (u.uid === uid) {
        return { ...u, modality: newModality };
      }
      return u;
    });
    storage.saveUsersList(updated);
    setUsers(updated);
    if (selectedStudent?.uid === uid) {
      setSelectedStudent(prev => prev ? { ...prev, modality: newModality } : null);
    }
  };

  const handleDeleteUser = (uid: string) => {
    // Soft-delete to excluded or full delete? To fit "Seus Alunos" deleted filter pill, we soft delete to status: 'excluded'!
    // But if already 'excluded', we can permanently remove it.
    const isAlreadyExcluded = users.some(u => u.uid === uid && u.status === 'excluded');
    let updated;
    if (isAlreadyExcluded) {
      updated = users.filter(u => u.uid !== uid);
    } else {
      updated = users.map(u => {
        if (u.uid === uid) {
          return { ...u, status: 'excluded' as const };
        }
        return u;
      });
    }
    storage.saveUsersList(updated);
    setUsers(updated);
    setSelectedStudent(null);
  };

  const handleCopyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
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
      (u.trainerPhone && u.trainerPhone.includes(searchTerm));

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
  const mockFeedbacks: any[] = [];

  // Quick sales link templates
  const salesLinks = [
    { id: 'mensal', title: 'Consultoria Individual - Mensal', price: 'R$ 149,90/mês', url: 'https://pay.caduponce.com/consultoria-mensal' },
    { id: 'trimestral', title: 'Consultoria Individual - Trimestral', price: 'R$ 119,90/mês (Total 359,70)', url: 'https://pay.caduponce.com/consultoria-trimestral' },
    { id: 'semestral', title: 'Consultoria Individual - Semestral', price: 'R$ 99,90/mês (Total 599,40)', url: 'https://pay.caduponce.com/consultoria-semestral' },
  ];

  // Training updates timeline
  const recentUpdates: any[] = [];

  return (
    <div className="fixed inset-0 z-[60] bg-[#0c131c] text-white overflow-y-auto font-sans flex items-center justify-center p-0 md:p-6 lg:p-10 select-none">
      
      {/* Absolute background visual details */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-red-650/5 to-transparent pointer-events-none" />
      <div className="absolute bottom-12 right-12 w-96 h-96 bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Content Area - Full Bleed */}
      <div className="w-full h-full bg-[#0c1622] relative overflow-hidden flex flex-col">
        
        {/* Top App Header (Mobile style but visible everywhere) */}
        <div className="h-14 bg-[#0c1622] px-6 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-white font-black italic uppercase tracking-tighter text-lg">
              Painel Admin
            </span>
          </div>
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-red-600/10 text-red-500 font-black uppercase text-[10px] tracking-widest hover:bg-red-600/20 transition-colors"
          >
            Voltar ao App
          </button>
        </div>

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
                  className="flex-1 flex flex-col bg-[#f4f7fa] overflow-hidden"
                >
                  {/* Top Tab Bar (Image structure) */}
                  <div className="flex bg-[#0c1622] shrink-0 pt-2 px-1">
                    <button 
                      onClick={() => {
                        setActiveTab('home');
                        setHomeSubView('dashboard');
                      }}
                      className={`flex-1 py-3 text-sm font-bold border-b-4 transition ${activeTab === 'home' && homeSubView === 'dashboard' ? 'bg-white text-slate-900 border-white rounded-t-lg shadow-sm' : 'bg-[#dc2626] text-white border-[#dc2626]'}`}
                    >
                      Início
                    </button>
                    <button 
                      onClick={() => setActiveTab('wallet')}
                      className={`flex-1 py-3 text-sm font-bold border-b-4 transition ${activeTab === 'wallet' ? 'bg-white text-slate-900 border-white rounded-t-lg' : 'bg-[#dc2626] text-white border-[#dc2626]'}`}
                    >
                      Finanças
                    </button>
                  </div>

                  {/* SCROLLABLE SCENE CONTAINER */}
                  <div className="flex-1 overflow-y-auto pb-4 scrollbar-none">
                    
                    {/* CONDITIONAL RENDERING: WELCOME VS DASHBOARD VS STUDENT LIST */}
                    {users.filter(u => u.role === 'student').length === 0 ? (
                       /* WELCOME VIEW (Image 1) */
                       <div className="flex-1 flex flex-col items-center justify-center pt-20 px-6 text-center">
                          <div className="w-24 h-24 bg-[#dc2626] rounded-full flex items-center justify-center shadow-lg mb-8">
                             <Dumbbell className="w-12 h-12 text-white" />
                          </div>
                          <h3 className="text-2xl font-black text-slate-900 leading-tight mb-2">Bem-vindo à MFIT</h3>
                          <p className="text-slate-500 text-sm font-semibold mb-10 max-w-[280px]">
                            Bora dar o primeiro passo e cadastrar seu primeiro aluno no app?
                          </p>
                          
                          <div className="w-full space-y-3 max-w-xs">
                            <button 
                              onClick={() => setIsAddingUser(true)}
                              className="w-full bg-[#dc2626] hover:bg-[#ef4444] text-white font-black py-4 rounded-xl shadow-md transition-all active:scale-95 text-xs uppercase tracking-wider"
                            >
                              Cadastrar aluno
                            </button>
                            <button 
                              onClick={() => handleCopyLink('https://caduponce.app/registro', 'reg')}
                              className="w-full bg-white border-2 border-slate-100 hover:bg-slate-50 text-slate-600 font-black py-4 rounded-xl transition-all active:scale-95 text-xs uppercase tracking-wider"
                            >
                              {copiedLink === 'reg' ? '✓ Link Copiado!' : 'Link de cadastro'}
                            </button>
                          </div>
                       </div>
                    ) : homeSubView === 'dashboard' ? (
                       /* DASHBOARD VIEW (Image 3) */
                       <div className="px-4 pt-4 space-y-4">
                          {/* Top Icons Row (Image Row 1) */}
                          <div className="grid grid-cols-3 gap-2">
                              <button 
                                 onClick={() => setActivePanel('feedbacks')}
                                 className="flex flex-col items-center space-y-1 focus:outline-none group active:scale-95 transition cursor-pointer"
                              >
                                 <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-[#dc2626] border border-slate-100 group-hover:bg-red-50/50 transition shadow-md shadow-red-150/10">
                                   <MessageSquare className="w-5 h-5" />
                                 </div>
                                 <span className="text-[10px] text-slate-700 font-bold font-sans">Feedbacks</span>
                              </button>
                              <button 
                                 onClick={() => setActivePanel('updates')}
                                 className="flex flex-col items-center space-y-1 focus:outline-none group active:scale-95 transition cursor-pointer"
                              >
                                 <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-[#dc2626] border border-slate-100 group-hover:bg-red-50/50 transition shadow-md shadow-red-150/10">
                                   <Calendar className="w-5 h-5" />
                                 </div>
                                 <span className="text-[10px] text-slate-700 font-bold font-sans">Atualizações</span>
                              </button>
                              <button 
                                 onClick={() => {
                                    setIsNotifyingByCategory(true);
                                    setNotifyView('list');
                                    setSelectedUidsForNotify([]);
                                    setSendComplete(false);
                                    setNotifyTitle('');
                                    setNotifyMessage('');
                                 }}
                                 className="flex flex-col items-center space-y-1 focus:outline-none group active:scale-95 transition cursor-pointer"
                              >
                                 <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-[#dc2626] border border-slate-100 group-hover:bg-red-50/50 transition shadow-md shadow-red-150/10">
                                   <Bell className="w-5 h-5" />
                                 </div>
                                 <span className="text-[10px] text-slate-700 font-bold font-sans">Notificações</span>
                              </button>
                           </div>

                          {/* Section Seus Alunos */}
                          <div className="space-y-2 text-left">
                            <h4 className="text-xs font-black uppercase text-slate-900 tracking-tight">Seus alunos</h4>
                            
                            <div className="grid grid-cols-2 gap-3">
                               <button 
                                 onClick={() => setIsAddingUser(true)}
                                 className="bg-[#dc2626] p-4 rounded-xl text-white text-left flex flex-col justify-between h-24 hover:bg-red-600 transition shadow-lg shadow-red-200"
                               >
                                  <UserCheck className="w-6 h-6" />
                                  <div className="space-y-0.5">
                                     <p className="text-[10px] font-black italic uppercase">Adicionar alunos</p>
                                     <Plus className="w-4 h-4 opacity-70" />
                                  </div>
                               </button>

                               <button 
                                 onClick={() => handleCopyLink('https://caduponce.app/registro', 'reg')}
                                 className="bg-[#dc2626] p-4 rounded-xl text-white text-left flex flex-col justify-between h-24 hover:bg-red-600 transition shadow-lg shadow-red-200"
                               >
                                  <LinkIcon className="w-6 h-6 rotate-45" />
                                  <div className="space-y-0.5">
                                     <p className="text-[10px] font-black italic uppercase">Link de cadastro</p>
                                     <Plus className="w-4 h-4 opacity-70" />
                                  </div>
                               </button>
                            </div>

                            <button 
                              onClick={() => setHomeSubView('student_list')}
                              className="w-full bg-[#dc2626] p-4 rounded-xl text-white flex items-center justify-between shadow-lg shadow-red-200"
                            >
                               <div className="flex items-center gap-4">
                                  <Users className="w-8 h-8" />
                                  <div className="text-left">
                                     <p className="text-sm font-black italic uppercase">Alunos</p>
                                     <div className="flex gap-2 mt-1">
                                        <span className="bg-white/20 px-2 py-0.5 rounded text-[9px] font-bold">Ativos: {activeStudents.length}</span>
                                        <span className="bg-white/20 px-2 py-0.5 rounded text-[9px] font-bold">Inativos: {inactiveStudents.length}</span>
                                     </div>
                                  </div>
                               </div>
                               <ChevronLeft className="w-5 h-5 rotate-180" />
                            </button>

                            <button 
                              onClick={() => setHomeSubView('retention')}
                              className="w-full bg-white border border-slate-100 p-4 rounded-xl flex items-center justify-between shadow-sm hover:bg-slate-50 transition"
                            >
                               <div className="flex items-center gap-3">
                                  <BarChart3 className="w-5 h-5 text-[#dc2626]" />
                                  <span className="text-[11px] font-black italic uppercase text-[#dc2626]">Retenção</span>
                               </div>
                               <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-[#dc2626] uppercase tracking-tighter">{engagementRate}% de engajamento</span>
                                  <ChevronLeft className="w-4 h-4 text-[#dc2626] rotate-180" />
                               </div>
                            </button>
                          </div>

                          {/* Section Treinos */}
                          <div className="space-y-2 text-left">
                             <h4 className="text-xs font-black uppercase text-slate-900 tracking-tight">Treinos</h4>
                          <div className="grid grid-cols-2 gap-3 pb-8">
                             <button 
                               onClick={() => setHomeSubView('workout_library')}
                               className="border-2 border-[#dc2626]/20 bg-white p-4 rounded-xl flex flex-col justify-between h-24 text-left hover:bg-slate-50 transition"
                             >
                                <div className="w-8 h-8 bg-[#dc2626]/10 rounded-full flex items-center justify-center text-[#dc2626]">
                                   <Dumbbell className="w-4 h-4" />
                                </div>
                                <span className="text-[11px] font-black italic uppercase text-[#dc2626] leading-none">Treinos</span>
                             </button>
                             <button 
                               onClick={() => setHomeSubView('agenda')}
                               className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-sm border border-slate-100 gap-3 hover:border-[#dc2626]/30 transition group cursor-pointer"
                             >
                                <div className="w-8 h-8 bg-[#dc2626]/10 rounded-full flex items-center justify-center text-[#dc2626]">
                                   <Calendar className="w-4 h-4" />
                                </div>
                                <span className="text-[11px] font-black italic uppercase text-[#dc2626] leading-none">Agenda</span>
                             </button>
                             <button 
                               onClick={() => setHomeSubView('frequency_report')}
                               className="border-2 border-[#dc2626]/20 bg-white p-4 rounded-xl flex flex-col justify-between h-24 text-left hover:bg-slate-50 transition"
                             >
                                <div className="w-8 h-8 bg-[#dc2626]/10 rounded-full flex items-center justify-center text-[#dc2626]">
                                   <FileText className="w-4 h-4" />
                                </div>
                                <span className="text-[11px] font-black italic uppercase text-[#dc2626] leading-none">Relatório de frequência</span>
                             </button>
                             <button 
                               onClick={() => setHomeSubView('exercise_library')}
                               className="border-2 border-[#dc2626]/20 bg-white p-4 rounded-xl flex flex-col justify-between h-24 text-left hover:bg-slate-50 transition"
                             >
                                <div className="w-8 h-8 bg-[#dc2626]/10 rounded-full flex items-center justify-center text-[#dc2626]">
                                   <PlayCircle className="w-4 h-4" />
                                </div>
                                <span className="text-[11px] font-black italic uppercase text-[#dc2626] leading-none">Biblioteca de exercícios</span>
                             </button>
                          </div>
                          </div>
                       </div>
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
                                   <button className="text-[10px] font-bold text-[#dc2626]">Ver gráficos</button>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                   <div className="border border-slate-100 rounded-lg p-3 space-y-2 text-left">
                                      <div className="flex items-center gap-1.5 grayscale opacity-50">
                                         <User className="w-3 h-3" />
                                         <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 leading-none">Alunos Ativos</span>
                                      </div>
                                      <div className="space-y-0">
                                         <p className="text-xl font-black text-slate-900 leading-none">{activeCount}</p>
                                         <p className="text-[9px] font-bold text-emerald-500 leading-none mt-1">+{activeCount > 0 ? '12' : '0'}%</p>
                                      </div>
                                   </div>
                                   <div className="border border-slate-100 rounded-lg p-3 space-y-2 text-left">
                                      <div className="flex items-center gap-1.5 grayscale opacity-50">
                                         <TrendingUp className="w-3 h-3" />
                                         <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 leading-none">Engajamento</span>
                                      </div>
                                      <div className="space-y-0">
                                         <p className="text-xl font-black text-slate-900 leading-none">{engagementRate}%</p>
                                         <p className="text-[9px] font-bold text-emerald-500 leading-none mt-1">+8%</p>
                                      </div>
                                   </div>
                                   <div className="border border-slate-100 rounded-lg p-3 space-y-2 text-left">
                                      <div className="flex items-center gap-1.5 grayscale opacity-50">
                                         <Sparkles className="w-3 h-3" />
                                         <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 leading-none">Crescimento</span>
                                      </div>
                                      <div className="space-y-0">
                                         <p className="text-xl font-black text-slate-900 leading-none">12%</p>
                                         <p className="text-[9px] font-bold text-emerald-500 leading-none mt-1">+2%</p>
                                      </div>
                                   </div>
                                   <div className="border border-slate-100 rounded-lg p-3 space-y-2 text-left">
                                      <div className="flex items-center gap-1.5 grayscale opacity-50">
                                         <ArrowUpRight className="w-3 h-3" />
                                         <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 leading-none">Recuperação</span>
                                      </div>
                                      <div className="space-y-0">
                                         <p className="text-xl font-black text-slate-900 leading-none">5%</p>
                                         <p className="text-[9px] font-bold text-emerald-500 leading-none mt-1">+1%</p>
                                      </div>
                                   </div>
                                </div>

                                <button className="w-full text-center py-2 text-[9px] font-bold text-[#dc2626] uppercase tracking-wider">
                                   O que significam essas métricas?
                                </button>
                             </div>

                             {/* Engajamento dos alunos */}
                             <div className="bg-white rounded-xl p-4 shadow-sm space-y-4 border border-slate-100">
                                <div className="text-left px-1">
                                   <h5 className="text-[11px] font-black italic uppercase text-slate-900 leading-none">Engajamento dos alunos</h5>
                                   <p className="text-[9px] text-slate-400 font-bold mt-1">Referente à semana anterior concluída</p>
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

                                <button className="w-full text-center py-2 text-[9px] font-bold text-[#dc2626] uppercase tracking-wider border-t border-slate-50 mt-2">
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
                       /* FREQUENCY REPORT VIEW */
                       <div className="flex flex-col h-full bg-[#f4f7fa]">
                          {/* Header */}
                          <div className="bg-[#0c1622] p-4 pt-1 flex flex-col items-start gap-4 shrink-0">
                             <button 
                               onClick={() => setHomeSubView('dashboard')}
                               className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80"
                             >
                               <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                             </button>
                             <h4 className="text-white text-xl font-black italic uppercase italic tracking-tighter text-left leading-none">Relatório de frequência</h4>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-4">
                             <div className="bg-white rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 border border-slate-100 shadow-sm">
                                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-[#dc2626]">
                                   <FileText className="w-8 h-8" />
                                </div>
                                <div className="space-y-1">
                                   <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">Frequência dos Alunos</h3>
                                   <p className="text-xs font-medium text-slate-500">Visualize a assiduidade e check-ins aqui.</p>
                                </div>
                                <div className="w-full pt-4 border-t border-slate-50 grid grid-cols-2 gap-4">
                                   <div className="bg-slate-50 p-4 rounded-xl text-left">
                                      <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Média Mensal</span>
                                      <span className="text-2xl font-black text-slate-900">88%</span>
                                   </div>
                                   <div className="bg-slate-50 p-4 rounded-xl text-left">
                                      <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Presenças Hoje</span>
                                      <span className="text-2xl font-black text-slate-900">12</span>
                                   </div>
                                </div>
                             </div>
                             <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                                <h5 className="text-[11px] font-black italic uppercase text-slate-900 mb-3">Últimas atividades</h5>
                                <div className="space-y-3">
                                   {[1, 2, 3].map(i => (
                                      <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 text-left">
                                         <div className="w-8 h-8 bg-slate-100 rounded-full shrink-0" />
                                         <div className="flex-1">
                                            <p className="text-xs font-bold text-slate-900">Aluno {i}</p>
                                            <p className="text-[10px] text-slate-500">Check-in às 0{i}:30</p>
                                         </div>
                                         <div className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase rounded">Presente</div>
                                      </div>
                                   ))}
                                 </div>
                              </div>
                           </div>
                        </div>
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

                           // Group exercises by active tab ('grupos' or 'categorias')
                           const grouped = {};
                           filteredExercises.forEach(ex => {
                              const key = exerciseTab === 'grupos' ? ex.group : ex.category;
                              if (!grouped[key]) grouped[key] = [];
                              grouped[key].push(ex);
                           });

                           const handleToggleFavorite = (title, e) => {
                              e.stopPropagation();
                              setExercises(prev => prev.map(ex => 
                                 ex.title === title ? { ...ex, isFavorite: !ex.isFavorite } : ex
                              ));
                           };

                           const handleDeleteExercise = (title, e) => {
                              e.stopPropagation();
                              if (window.confirm(`Tem certeza que deseja excluir o exercício "${title}"?`)) {
                                 setExercises(prev => prev.filter(ex => ex.title !== title));
                              }
                           };

                           const handleAddExerciseSubmit = (e) => {
                              e.preventDefault();
                              if (!newExName.trim()) return;

                              const valImg = newExImage.trim() || 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&q=80&w=200';
                              const valVid = newExVideo.trim() || 'https://www.w3schools.com/html/mov_bbb.mp4';
                              const valDesc = newExDesc.trim() || 'Exercício personalizado adicionado pelo treinador Cadu Ponce.';

                              const newExObj = {
                                 id: editingExerciseOriginalTitle 
                                      ? exercises.find(ex => ex.title === editingExerciseOriginalTitle)?.id || crypto.randomUUID()
                                      : crypto.randomUUID(),
                                 title: newExName.trim(),
                                 group: newExGroup,
                                 category: newExCategory,
                                 image: valImg,
                                 isFavorite: editingExerciseOriginalTitle ? exercises.find(ex => ex.title === editingExerciseOriginalTitle)?.isFavorite || false : false,
                                 isCustom: true,
                                 videoUrl: valVid,
                                 description: valDesc
                              };

                              if (editingExerciseOriginalTitle) {
                                setExercises(prev => prev.map(ex => ex.title === editingExerciseOriginalTitle ? newExObj : ex));
                                setEditingExerciseOriginalTitle(null);
                              } else {
                                setExercises(prev => [newExObj, ...prev]);
                                // Auto switch to "Seus exercícios" tab so the new exercise is visible immediately
                                setExerciseFilter('mine');
                                setSelectedGroupFilter(null);
                                setSelectedCategoryFilter(null);
                                setExerciseSearch('');
                              }
                              setIsCreatingExercise(false);

                              // reset
                              setNewExName('');
                              setNewExImage('');
                              setNewExVideo('');
                              setNewExDesc('');
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
                                    {/* Create button */}
                                    <button 
                                      onClick={() => setIsCreatingExercise(true)}
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
                                                            <img src={ex.image} alt={ex.title} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition duration-300" referrerPolicy="no-referrer" />
                                                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                                                               <PlayCircle className="w-8 h-8 text-white/90 group-hover:scale-110 transition duration-300 drop-shadow-md" />
                                                            </div>
                                                         </div>
                                                         <div className="flex-1 min-w-0 pr-1">
                                                            <h5 className="text-[11px] font-black italic uppercase text-slate-900 tracking-tight leading-tight mb-2 truncate group-hover:text-[#dc2626] transition-colors">
                                                               {ex.title}
                                                            </h5>
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
                                                                onClick={(evt) => {
                                                                  evt.stopPropagation();
                                                                  setEditingExerciseOriginalTitle(ex.title);
                                                                  setNewExName(ex.title);
                                                                  setNewExGroup(ex.group);
                                                                  setNewExCategory(ex.category);
                                                                  setNewExImage(ex.image);
                                                                  setNewExVideo(ex.videoUrl || '');
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
                                                             onClick={(evt) => handleToggleFavorite(ex.title, evt)}
                                                             className="pr-2 cursor-pointer focus:outline-none shrink-0"
                                                           >
                                                              <div className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all ${ex.isFavorite ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'}`}>
                                                                 <Star className={`w-3.5 h-3.5 ${ex.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                                                              </div>
                                                           </button>
                                                           <button 
                                                             onClick={(evt) => handleDeleteExercise(ex.title, evt)}
                                                             className="pr-2 cursor-pointer focus:outline-none shrink-0"
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
                                             <video 
                                               key={previewingExercise.title}
                                               src={previewingExercise.videoUrl || 'https://www.w3schools.com/html/mov_bbb.mp4'} 
                                               className="w-full h-full object-cover" 
                                               loop 
                                               autoPlay 
                                               muted 
                                               controls
                                               playsInline
                                             />
                                             <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[8px] font-black uppercase tracking-widest rounded flex items-center gap-1.5">
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
                                                  handleToggleFavorite(previewingExercise.title, evt);
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
                                                {editingExerciseOriginalTitle ? 'Editar Exercício' : 'Novo Exercício'}
                                              </h3>
                                              <button 
                                                onClick={() => {
                                                  setIsCreatingExercise(false);
                                                  setEditingExerciseOriginalTitle(null);
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
                                                    onChange={(e) => setNewExImage(e.target.value)} 
                                                    placeholder="URL da imagem (https://...)" 
                                                    className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-[#1a202c] outline-none focus:border-[#dc2626]"
                                                  />
                                                  <div className="flex items-center gap-2 w-full">
                                                    <div className="h-px bg-slate-200 flex-1" />
                                                    <span className="text-[9px] font-black italic uppercase text-slate-400">ou enviar arquivo</span>
                                                    <div className="h-px bg-slate-200 flex-1" />
                                                  </div>
                                                  <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-dashed border-slate-200 cursor-pointer hover:border-[#dc2626]/40 transition ${isUploadingExerciseImage ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    <input 
                                                      type="file" 
                                                      accept="image/*" 
                                                      className="hidden"
                                                      onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        setIsUploadingExerciseImage(true);
                                                        try {
                                                          const url = await storage.uploadExerciseVideo(file, `img-${Date.now()}`);
                                                          setNewExImage(url);
                                                        } catch (err) {
                                                          console.error('Erro no upload da imagem:', err);
                                                        } finally {
                                                          setIsUploadingExerciseImage(false);
                                                        }
                                                      }}
                                                    />
                                                    {isUploadingExerciseImage ? (
                                                      <span className="text-[10px] font-black uppercase text-slate-400">Enviando...</span>
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
                                                    onChange={(e) => setNewExVideo(e.target.value)} 
                                                    placeholder="URL do vídeo (https://...)" 
                                                    className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-[#1a202c] outline-none focus:border-[#dc2626]"
                                                  />
                                                  <div className="flex items-center gap-2 w-full">
                                                    <div className="h-px bg-slate-200 flex-1" />
                                                    <span className="text-[9px] font-black italic uppercase text-slate-400">ou enviar arquivo</span>
                                                    <div className="h-px bg-slate-200 flex-1" />
                                                  </div>
                                                  <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-dashed border-slate-200 cursor-pointer hover:border-[#dc2626]/40 transition ${isUploadingExerciseVideo ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    <input 
                                                      type="file" 
                                                      accept="video/*" 
                                                      className="hidden"
                                                      onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        setIsUploadingExerciseVideo(true);
                                                        try {
                                                          const url = await storage.uploadExerciseVideo(file, `vid-${Date.now()}`);
                                                          setNewExVideo(url);
                                                        } catch (err) {
                                                          console.error('Erro no upload do vídeo:', err);
                                                        } finally {
                                                          setIsUploadingExerciseVideo(false);
                                                        }
                                                      }}
                                                    />
                                                    {isUploadingExerciseVideo ? (
                                                      <span className="text-[10px] font-black uppercase text-slate-400">Enviando...</span>
                                                    ) : (
                                                      <>
                                                        <Plus className="w-4 h-4 text-slate-400" />
                                                        <span className="text-[10px] font-black uppercase text-slate-500">Escolher Vídeo</span>
                                                      </>
                                                    )}
                                                  </label>
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
                                                  onClick={() => setIsCreatingExercise(false)}
                                                  className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl text-xs font-black italic uppercase tracking-wider text-center hover:bg-slate-200 cursor-pointer"
                                                >
                                                   Cancelar
                                                </button>
                                                <button 
                                                  type="submit"
                                                  className="flex-1 py-3 bg-[#dc2626] text-white rounded-xl text-xs font-black italic uppercase tracking-wider text-center hover:bg-[#ef4444] cursor-pointer"
                                                >
                                                   Salvar
                                                </button>
                                             </div>
                                          </form>
                                       </motion.div>
                                    </div>
                                 )}
                              </div>
                           );
                        })()
                        ) : homeSubView === 'routine_details' ? (
                       /* ROUTINE DETAILS VIEW (New Image Request) */
                       <div className="flex flex-col h-full bg-[#f4f7fa]">
                          {/* Top Brand Block */}
                          <div className="bg-[#0c1622] p-4 flex justify-center border-b border-white/10 shrink-0">
                             <div className="flex items-center gap-1.5 grayscale opacity-80 brightness-200">
                                <div className="w-6 h-6 border-2 border-white rounded flex items-center justify-center">
                                   <div className="w-1 h-3 bg-white" />
                                </div>
                                <span className="text-sm font-black tracking-tighter text-white">CADU PONCE</span>
                             </div>
                          </div>

                          {/* Header with Back */}
                          <div className="bg-[#0c1622] p-4 pt-1 flex flex-col items-start gap-4 shrink-0">
                             <button 
                               onClick={() => setHomeSubView('workout_library')}
                               className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80"
                             >
                               <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                             </button>
                             <h4 className="text-white text-xl font-black italic uppercase tracking-tighter text-left leading-none">Criar Rotina</h4>
                          </div>

                          <div className="flex-1 overflow-y-auto p-4 space-y-4">
                             {/* Routine Profile Card */}
                             <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-5">
                                <div className="flex items-center justify-between">
                                   <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-[#dc2626]">
                                         <Accessibility className="w-7 h-7" />
                                      </div>
                                      <div className="text-left">
                                         <h3 className="text-sm font-black italic uppercase text-slate-900 leading-none">{routineName || 'NOME DA ROTINA'}</h3>
                                         <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{routineGoal} | {routineDifficulty}</p>
                                      </div>
                                   </div>
                                   <button className="text-slate-400">
                                      <MoreVertical className="w-5 h-5" />
                                   </button>
                                </div>

                                <div className="h-px bg-slate-50 w-full" />

                                <div className="grid grid-cols-1 gap-4 text-left">
                                   <div className="space-y-0.5">
                                      <p className="text-[10px] font-black text-slate-900 uppercase">Tipo de treino:</p>
                                      <p className="text-[10px] font-bold text-slate-500">{routineType}</p>
                                   </div>
                                   <div className="space-y-0.5">
                                      <p className="text-[10px] font-black text-slate-900 uppercase">Mostrar para o aluno:</p>
                                      <p className="text-[10px] font-bold text-slate-500">Sempre</p>
                                   </div>
                                   <div className="space-y-0.5">
                                      <p className="text-[10px] font-black text-slate-900 uppercase">Arquivar automaticamente:</p>
                                      <p className="text-[10px] font-bold text-slate-500">Não</p>
                                   </div>
                                </div>

                                <div className="space-y-2">
                                  <button 
                                    onClick={() => setShowRoutineNotes(!showRoutineNotes)}
                                    className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center justify-between"
                                  >
                                     <span className="text-[11px] font-black italic uppercase text-slate-900">Orientações gerais</span>
                                     <Eye className={`w-4 h-4 transition ${showRoutineNotes ? 'text-[#dc2626]' : 'text-slate-400'}`} />
                                  </button>
                                  <AnimatePresence>
                                    {showRoutineNotes && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100/50 text-[10px] font-bold text-slate-500 text-left">
                                          {routineNotes || 'Nenhuma orientação cadastrada.'}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                             </div>

                             {/* Empty Training State OR Workouts List */}
                             {routineWorkouts.length === 0 ? (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 flex flex-col items-center justify-center space-y-6">
                                   <div className="w-16 h-16 bg-[#dc2626]/10 rounded-full flex items-center justify-center text-[#dc2626]">
                                      <Dumbbell className="w-8 h-8" />
                                   </div>
                                   
                                   <p className="text-[11px] font-black italic uppercase text-slate-900">Essa rotina ainda não tem nenhum treino</p>

                                   <button 
                                      onClick={() => setIsCreateWorkoutModalOpen(true)}
                                      className="w-full bg-[#dc2626] py-4 rounded-xl text-white font-black italic uppercase text-xs tracking-widest shadow-lg shadow-red-200 hover:bg-red-600 transition"
                                   >
                                      Criar primeiro treino
                                   </button>
                                </div>
                             ) : (
                                <div className="space-y-4">
                                   {/* Action Buttons */}
                                   <div className="flex gap-3">
                                      <button className="flex-1 bg-white border border-[#dc2626] py-3 rounded-lg flex items-center justify-center gap-2 text-[#dc2626] text-[10px] font-black uppercase italic tracking-tight">
                                         <ArrowUpDown className="w-3.5 h-3.5" /> Reordenar treinos
                                      </button>
                                      <button 
                                        onClick={() => setIsCreateWorkoutModalOpen(true)}
                                        className="flex-1 bg-[#dc2626] py-3 rounded-lg flex items-center justify-center gap-2 text-white text-[10px] font-black uppercase italic tracking-tight"
                                      >
                                         <Plus className="w-3.5 h-3.5" /> Adicionar treino
                                      </button>
                                   </div>

                                   {/* Workout Cards */}
                                   {routineWorkouts.map((w, idx) => (
                                      <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4 text-left">
                                         <div className="flex items-start justify-between">
                                            <div className="space-y-0.5">
                                               <h4 className="text-[11px] font-black text-slate-900 uppercase italic tracking-tight leading-none">{w.day}</h4>
                                               <p className="text-[10px] font-bold text-slate-500 uppercase">{w.name}</p>
                                            </div>
                                            <button className="text-slate-400">
                                               <MoreVertical className="w-4 h-4" />
                                            </button>
                                         </div>

                                         <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center justify-between">
                                            <div className="space-y-0.5">
                                               <span className="text-[9px] font-black italic uppercase text-slate-900 block leading-none">Orientações gerais</span>
                                               <span className="text-[9px] font-bold text-slate-400 block mt-1">{w.notes || 'Nenhuma orientação'}</span>
                                            </div>
                                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                                         </div>
                                      </div>
                                   ))}
                                </div>
                             )}
                          </div>
                        </div>
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
                                  <label className="text-[10px] font-bold text-slate-900 uppercase">Orientações Gerais</label>
                                  <textarea
                                    placeholder="Orientações gerais para o aluno..."
                                    value={routineNotes}
                                    onChange={(e) => setRoutineNotes(e.target.value)}
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
                                    <option key={libEx.title} value={libEx.title} />
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
                                      <span className="text-[9px] font-black text-[#dc2626] uppercase tracking-widest">Exercício {idx + 1}</span>
                                      <div className="flex items-center gap-3">
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
                                    {/* Exercise Name */}
                                    <div>
                                      <input
                                        type="text"
                                        list="exercise-library-list"
                                        value={ex.name}
                                        onChange={(e) => {
                                          const newName = e.target.value;
                                          const libEx = exercises.find(lib => lib.title.toLowerCase() === newName.toLowerCase());
                                          if (libEx) {
                                            const isMp4 = libEx.videoUrl?.includes('.mp4') || libEx.videoUrl?.includes('.mov') || libEx.videoUrl?.includes('supabase.co/storage');
                                            updateRoutineExercise(idx, {
                                              name: newName,
                                              videoUrl: isMp4 ? '' : (libEx.videoUrl || ''),
                                              videoFileUrl: isMp4 ? (libEx.videoUrl || '') : '',
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
                                          <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="YouTube preview" className="w-full rounded-lg object-cover h-24" />
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
                                          <video src={ex.videoFileUrl} className="w-full rounded-lg h-24 object-cover bg-black" controls />
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
                                            accept="video/*"
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

                             {/* Save Button */}
                             <div className="mx-4 mb-4">
                               <button
                                 onClick={handleSaveAdminRoutine}
                                 disabled={!routineName || routineName === 'NOME DA ROTINA'}
                                 className="w-full bg-[#dc2626] py-4 rounded-xl text-white font-black italic uppercase text-xs tracking-widest shadow-lg shadow-red-200 hover:bg-[#ef4444] transition disabled:opacity-40 disabled:cursor-not-allowed"
                               >
                                 {editingRoutine ? 'Salvar Alterações' : 'Salvar Rotina'}
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
                               setRoutineNotes('');
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
                             /* Aerobic Empty State */
                             <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col p-8 items-center text-center mt-2">
                               <div className="w-20 h-20 bg-[#dc2626]/10 rounded-full flex items-center justify-center mb-6">
                                 <Activity className="w-10 h-10 text-[#dc2626]" />
                               </div>
                               <h5 className="text-xl font-black text-slate-900 mb-6">Treinos Aeróbicos</h5>
                               
                               <ul className="text-xs font-bold text-slate-600 space-y-3 mb-8 text-left w-full px-2">
                                 <li className="flex items-center gap-3">
                                   <div className="w-1.5 h-1.5 bg-slate-400 rounded-full shrink-0" />
                                   <span>Crie treinos para reutilizar no futuro</span>
                                 </li>
                                 <li className="flex items-center gap-3">
                                   <div className="w-1.5 h-1.5 bg-slate-400 rounded-full shrink-0" />
                                   <span>Organize seus treinos em pastas</span>
                                 </li>
                                 <li className="flex items-center gap-3">
                                   <div className="w-1.5 h-1.5 bg-slate-400 rounded-full shrink-0" />
                                   <span>Clone treinos para um ou mais alunos</span>
                                 </li>
                               </ul>
                               
                               <button 
                                 onClick={() => {
                                    // Optional: Add logic for aerobic routines later
                                    alert('Criação de treinos aeróbicos em breve!');
                                 }}
                                 className="w-full bg-[#dc2626] text-white py-4 rounded-xl font-black italic uppercase text-xs tracking-widest hover:bg-red-600 transition cursor-pointer shadow-lg shadow-red-200 active:scale-95"
                               >
                                 Comece agora
                               </button>
                             </div>
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
                                                      <img src={student.photoURL} alt="" className="w-full h-full object-cover" />
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
                                               href={`https://wa.me/${student.trainerPhone}`}
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
                             ) : selectedGroupForView !== null ? (
                                /* GROUP DETAIL VIEW */
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={() => setSelectedGroupForView(null)}
                                      className="text-[#dc2626] text-xs font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                                    </button>
                                    <h5 className="text-sm font-black text-slate-900 uppercase">{selectedGroupForView}</h5>
                                    {selectedGroupForView !== 'Sem grupo' && (
                                      <button
                                        onClick={() => {
                                          if (window.confirm(`Excluir o grupo "${selectedGroupForView}"?`)) {
                                            const updated = studentGroups.filter(g => g !== selectedGroupForView);
                                            setStudentGroups(updated);
                                            localStorage.setItem('cadu_ponce_student_groups', JSON.stringify(updated));
                                            setSelectedGroupForView(null);
                                          }
                                        }}
                                        className="text-red-400 hover:text-red-600 transition cursor-pointer"
                                        title="Excluir grupo"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    {selectedGroupForView === 'Sem grupo' && <div className="w-6" />}
                                  </div>

                                  {/* Students in group */}
                                  {(() => {
                                    const groupStudents = selectedGroupForView === 'Sem grupo'
                                      ? users.filter(u => u.role === 'student' && !u.modality)
                                      : users.filter(u => u.role === 'student' && u.modality === selectedGroupForView);
                                    return groupStudents.length === 0 ? (
                                      <div className="py-8 text-center text-slate-400 text-xs font-bold">Nenhum aluno neste grupo</div>
                                    ) : (
                                      <div className="space-y-2 pb-20">
                                        {groupStudents.map(student => (
                                          <div key={student.uid} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                                              {student.photoURL ? <img src={student.photoURL} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-black italic uppercase text-slate-900 truncate">{student.name}</p>
                                              <p className="text-[10px] text-slate-400 font-bold">{student.modality || 'Sem grupo'}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col p-4 relative text-left">
                                   {/* Button Criar novo grupo or input */}
                                   {showNewGroupInput ? (
                                     <div className="flex gap-2 mb-4">
                                       <input
                                         type="text"
                                         autoFocus
                                         placeholder="Nome do grupo"
                                         value={newGroupName}
                                         onChange={(e) => setNewGroupName(e.target.value)}
                                         onKeyDown={(e) => {
                                           if (e.key === 'Enter' && newGroupName.trim()) {
                                             const updated = [...studentGroups, newGroupName.trim()];
                                             setStudentGroups(updated);
                                             localStorage.setItem('cadu_ponce_student_groups', JSON.stringify(updated));
                                             setNewGroupName('');
                                             setShowNewGroupInput(false);
                                           }
                                           if (e.key === 'Escape') { setShowNewGroupInput(false); setNewGroupName(''); }
                                         }}
                                         className="flex-1 border border-[#dc2626] rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none"
                                       />
                                       <button
                                         onClick={() => {
                                           if (newGroupName.trim()) {
                                             const updated = [...studentGroups, newGroupName.trim()];
                                             setStudentGroups(updated);
                                             localStorage.setItem('cadu_ponce_student_groups', JSON.stringify(updated));
                                             setNewGroupName('');
                                             setShowNewGroupInput(false);
                                           }
                                         }}
                                         className="px-4 py-2 bg-[#dc2626] text-white rounded-lg text-sm font-bold cursor-pointer hover:bg-red-600 transition"
                                       >
                                         Criar
                                       </button>
                                       <button
                                         onClick={() => { setShowNewGroupInput(false); setNewGroupName(''); }}
                                         className="px-3 py-2 border border-slate-200 text-slate-500 rounded-lg text-sm cursor-pointer"
                                       >
                                         <X className="w-4 h-4" />
                                       </button>
                                     </div>
                                   ) : (
                                     <button 
                                       onClick={() => setShowNewGroupInput(true)}
                                       className="w-full py-4 bg-white border border-[#dc2626] hover:bg-[#dc2626]/5 rounded-lg text-[#dc2626] text-sm font-bold transition cursor-pointer mb-4"
                                     >
                                       + Criar novo grupo
                                     </button>
                                   )}
                                   
                                   {/* Pesquisar grupos */}
                                   <div className="relative mb-4">
                                      <input 
                                        type="text" 
                                        placeholder="Pesquisar grupos"
                                        value={studentGroupSearch}
                                        onChange={(e) => setStudentGroupSearch(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg py-3 pl-4 pr-11 text-sm font-medium text-slate-700 outline-none focus:border-slate-300 transition"
                                      />
                                      <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                                   </div>

                                   {/* Lista de grupos */}
                                   <div className="space-y-3">
                                      {['Sem grupo', ...studentGroups]
                                        .filter(g => g.toLowerCase().includes(studentGroupSearch.toLowerCase()))
                                        .map(group => {
                                        const count = group === 'Sem grupo'
                                          ? users.filter(u => u.role === 'student' && !u.modality).length
                                          : users.filter(u => u.role === 'student' && u.modality === group).length;
                                        return (
                                          <button
                                            key={group}
                                            onClick={() => setSelectedGroupForView(group)}
                                            className="w-full border border-slate-200 rounded-lg p-4 cursor-pointer hover:border-[#dc2626]/30 hover:bg-red-50/30 transition flex items-center justify-between text-left bg-white"
                                          >
                                            <div>
                                              <span className="text-[#dc2626] font-bold text-[15px] leading-tight block mb-0.5">{group}</span>
                                              <span className="text-slate-500 text-[11px] font-medium">
                                                {count === 0 ? 'Esse grupo não tem alunos' : count === 1 ? '1 aluno está nesse grupo' : `${count} alunos nesse grupo`}
                                              </span>
                                            </div>
                                            <ChevronLeft className="w-4 h-4 text-slate-300 rotate-180 shrink-0" />
                                          </button>
                                        );
                                      })}
                                   </div>
                                </div>
                             )}
                          </div>
                       </div>
                    )}

                  </div>
                </motion.div>
               )}

              {/* CURRENT VIEW 2: BILLING HUB */}
              {activeTab === 'wallet' && (
                <motion.div 
                  key="wallet-tab"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: -20 }}
                  className="flex-1 flex flex-col overflow-y-auto px-5 py-2 space-y-5 text-left"
                >
                  <div className="space-y-1">
                    <span className="text-[9px] text-red-500 font-black tracking-widest uppercase">Estatísticas Financeiras</span>
                    <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">FATURAMENTO</h3>
                  </div>

                  {/* Removed Mocked Revenue Overview */}

                  {/* Pricing subscription lists */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Próximos Vencimentos</span>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-900 text-xs">
                        <div>
                          <span className="font-extrabold block">Aline Rocha</span>
                          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Pago via PIX</span>
                        </div>
                        <span className="font-black text-orange-400">R$ 119,90 (Vence em 22/06)</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-900 text-xs">
                        <div>
                          <span className="font-extrabold block">José Soares</span>
                          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Pago via CARTÃO</span>
                        </div>
                        <span className="font-black text-emerald-400">R$ 149,90 (Vence em 29/06)</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* CURRENT VIEW 4: QUICK OPTION MENU drawer */}
              {activeTab === 'menu' && (
                <motion.div 
                  key="menu-tab"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: -15 }}
                  className="flex-1 flex flex-col justify-center px-5 space-y-5 text-left"
                >
                  <div className="text-center space-y-1.5">
                    <Sparkles className="w-10 h-10 text-red-600 mx-auto animate-bounce" />
                    <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">SAIR DO CONSOLE</h3>
                    <p className="text-[10.5px] text-slate-400 font-bold uppercase tracking-wider max-w-xs mx-auto text-center">
                      Deseja retornar para a sua visualização normal de aluno principal?
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button 
                      onClick={onClose}
                      className="w-full py-4 text-center bg-red-650 hover:bg-red-500 text-white font-black uppercase text-xs tracking-wider rounded-2xl shadow-md transition"
                    >
                      Voltar ao App de Aluno
                    </button>
                    
                    <button 
                      onClick={() => setActiveTab('home')}
                      className="w-full py-4 text-center bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-black uppercase text-xs tracking-wider rounded-2xl transition"
                    >
                      Continuar no Painel Cadu
                    </button>
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

                        {/* Lista de notificações tabs */}
                        <div>
                          <p className="text-slate-700 text-xs font-bold mb-2">Lista de notificações</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setNotifyListTab('agendadas')}
                              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                notifyListTab === 'agendadas' ? 'bg-[#3182ce] text-white border-[#3182ce]' : 'bg-white text-[#3182ce] border-[#3182ce]'
                              }`}
                            >
                              <span>🗓</span> Agendadas
                            </button>
                            <button 
                              onClick={() => setNotifyListTab('recorrentes')}
                              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                notifyListTab === 'recorrentes' ? 'bg-[#3182ce] text-white border-[#3182ce]' : 'bg-white text-[#3182ce] border-[#3182ce]'
                              }`}
                            >
                              <span>🔄</span> Recorrentes
                            </button>
                          </div>
                        </div>

                        {/* Empty state */}
                        <p className="text-[#3182ce] text-xs font-bold">
                          {notifyListTab === 'agendadas' 
                            ? 'Quando você tiver notificações agendadas, elas aparecerão aqui!'
                            : 'Quando você tiver notificações recorrentes, elas aparecerão aqui!'}
                        </p>
                      </div>
                    )}

                    {/* ── VIEW: CREATE TYPE ── */}
                    {notifyView === 'create_type' && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        {[
                          { key: 'now', icon: '🔔', title: 'Enviar na hora', desc: 'Seu aluno receberá a notificação imediatamente' },
                          { key: 'scheduled', icon: '🗓️', title: 'Agendar', desc: 'Defina um dia e horário específico para o envio' },
                          { key: 'recurring', icon: '🔄', title: 'Recorrentes', desc: 'Defina dias e horários recorrentes para o envio' },
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
                                    {student.photoURL ? <img src={student.photoURL} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
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
                            const count = users.filter(u => u.modality === group).length;
                            return (
                              <button 
                                key={group}
                                onClick={() => {
                                  const groupStudents = users.filter(u => u.modality === group);
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
                        <button 
                          disabled={!notifyTitle || !notifyMessage || isSending || selectedUidsForNotify.length === 0}
                          onClick={() => {
                            setIsSending(true);
                            fetch('/api/send-notification', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                userIds: selectedUidsForNotify,
                                title: notifyTitle,
                                body: notifyMessage
                              })
                            }).then(() => {
                              setIsSending(false);
                              setSendComplete(true);
                              setTimeout(() => {
                                setIsNotifyingByCategory(false);
                                setSendComplete(false);
                                setNotifyTitle('');
                                setNotifyMessage('');
                                setNotifyView('list');
                              }, 2000);
                            }).catch(() => {
                              setIsSending(false);
                              setSendComplete(true);
                              setTimeout(() => {
                                setIsNotifyingByCategory(false);
                                setSendComplete(false);
                                setNotifyView('list');
                              }, 2000);
                            });
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
                      {activePanel === 'sales_links' && '🚀 Links de Checkout'}
                      {activePanel === 'feedbacks' && '💬 Feedbacks Recebidos'}
                      {activePanel === 'wallet_panel' && '💳 Gestão de Assinaturas'}
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
                        Copie qualquer link e envie diretamente para prospects no WhatsApp. O checkout é automático e libera a conta de aluno instantaneamente após pagar.
                      </p>

                      <div className="space-y-3">
                        {salesLinks.map((link) => (
                          <div key={link.id} className="p-4 bg-slate-900 border border-slate-850 rounded-2xl flex flex-col space-y-2.5">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-xs font-black text-white">{link.title}</h4>
                                <span className="text-emerald-400 font-black text-[10.5px] block mt-0.5">{link.price}</span>
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
                  {activePanel === 'feedbacks' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-400 font-semibold leading-normal">
                        Confira as últimas dúvidas e updates de treinos submetidos pelos seus alunos. Toque no telefone para retornar no WhatsApp.
                      </p>

                      <div className="space-y-3 pt-2">
                        {mockFeedbacks.map((item, id) => (
                          <div key={id} className={`p-4 rounded-2xl border flex justify-between gap-3 ${
                            item.unread ? 'bg-slate-900/90 border-red-900/30 shadow-md shadow-red-950/5' : 'bg-slate-900/40 border-slate-900'
                          }`}>
                            <div className="space-y-1.5 flex-1 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-white">{item.name}</span>
                                <span className="text-[9px] font-bold text-slate-500">• {item.time}</span>
                                {item.unread && (
                                  <span className="text-[7.5px] bg-red-600 text-white font-extrabold uppercase px-1.5 py-0.5 rounded-full">Novo</span>
                                )}
                              </div>
                              <p className="text-slate-400 font-medium leading-relaxed italic">"{item.text}"</p>
                            </div>

                            <a
                              href={`https://wa.me/5511999999999?text=Olá%20${item.name},%20vi%20seu%20feedback%20no%20sistema%20da%2520consultoria.%20Vamos%20ajustar%20isso%20agora.`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-600 hover:text-white flex items-center justify-center transition shrink-0"
                            >
                              <Phone className="w-3.5 h-3.5 fill-current" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
                            { label: 'Faturas', emoji: '📄', badge: 0, key: 'faturas' },
                            { label: 'Planos Recorrentes', emoji: '💲', badge: 0, key: 'planos_recorrentes' },
                            { label: 'Página de vendas', emoji: '🌐', badge: 0, key: 'pagina_vendas' },
                            { label: 'Link de cadastro', emoji: '🔗', badge: 1, key: 'link_cadastro' },
                            { label: 'Avaliação Online', emoji: '📝', badge: 0, key: '' },
                            { label: 'Anamneses', emoji: '📋', badge: 0, key: 'anamneses' },
                            { label: 'Progresso do aluno', emoji: '✅', badge: 0, key: '' },
                            { label: 'Aniversários', emoji: '🎂', badge: 0, key: 'aniversarios' },
                          ].map((item, idx) => (
                            <button
                              key={item.label}
                              onClick={() => {
                                if (item.key === 'link_cadastro') { setUpdatesSubView('link_cadastro'); setLinkCadastroTab('link'); }
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

                      {/* Marcar todas como lidas */}
                      <button className="w-full py-4 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                        Marcar todas como lidas
                      </button>
                    </div>
                    )}

                    {/* ── LINK DE CADASTRO SUB-VIEW ── */}
                    {updatesSubView === 'link_cadastro' && (() => {
                      const trainerProfile = JSON.parse(localStorage.getItem('cadu_ponce_user') || '{}');
                      const registrationLink = `https://client.mfitpersonal.com.br/out/signup-link/${trainerProfile.uid || 'Njk2NDk4'}`;
                      const contactsFromLink = users.filter(u => u.role === 'student');
                      const filteredContacts = contactsFromLink.filter(u =>
                        linkCadastroSearch === '' ||
                        u.name.toLowerCase().includes(linkCadastroSearch.toLowerCase()) ||
                        (u.email || '').toLowerCase().includes(linkCadastroSearch.toLowerCase())
                      );
                      return (
                        <div className="space-y-4">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-t-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setLinkCadastroTab('link')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${
                                linkCadastroTab === 'link' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              Link
                            </button>
                            <button
                              onClick={() => setLinkCadastroTab('contatos')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${
                                linkCadastroTab === 'contatos' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              Contatos
                            </button>
                          </div>

                          {linkCadastroTab === 'link' && (
                            <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 flex flex-col items-center gap-5">
                              {/* Icon */}
                              <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                🔗
                              </div>

                              <div className="text-center space-y-3">
                                <h3 className="text-slate-900 font-black text-lg">Link de cadastro</h3>
                                <div className="space-y-1">
                                  <p className="text-slate-700 text-sm font-bold">Utilize esse link para:</p>
                                  <p className="text-[#3182ce] text-sm">Facilitar o cadastro de novos alunos no app</p>
                                  <p className="text-[#3182ce] text-sm">Deixar o link na sua bio para captar pessoas interessadas no seu trabalho e entrar em contato depois</p>
                                </div>
                              </div>

                              {/* Link box */}
                              <div className="w-full bg-slate-100 rounded-lg p-4">
                                <p className="text-slate-600 text-xs text-center break-all">{registrationLink}</p>
                              </div>

                              {/* Buttons */}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(registrationLink);
                                  setLinkCopied(true);
                                  setTimeout(() => setLinkCopied(false), 2000);
                                }}
                                className="w-full py-3.5 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-2"
                              >
                                {linkCopied ? <>✓ Link copiado!</> : 'Copiar link'}
                              </button>

                              <a
                                href={`https://wa.me/?text=${encodeURIComponent('Cadastre-se no meu app de treinos! ' + registrationLink)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-3.5 bg-[#25d366] hover:bg-green-500 text-white font-bold rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-2"
                              >
                                📱 Enviar pelo WhatsApp
                              </a>
                            </div>
                          )}

                          {linkCadastroTab === 'contatos' && (
                            <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-5 flex flex-col gap-4">
                              {/* Icon + title */}
                              <div className="flex flex-col items-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  👥
                                </div>
                                <h3 className="text-slate-900 font-black text-lg">Contatos</h3>
                                <p className="text-slate-500 text-xs text-center leading-relaxed">
                                  Todos os contatos que se cadastrarem a partir do <span className="text-[#3182ce]">seu link</span> ficarão nesta lista, você pode <span className="text-[#3182ce]">transformá-los em alunos</span> ou <span className="text-[#3182ce]">excluí-los</span>.
                                </p>
                              </div>

                              {/* Search */}
                              <div className="flex gap-2">
                                <div className="flex-1 flex items-center border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                                  <input
                                    type="text"
                                    placeholder="Pesquise por nome, email ou telefone"
                                    value={linkCadastroSearch}
                                    onChange={(e) => setLinkCadastroSearch(e.target.value)}
                                    className="flex-1 text-xs outline-none text-slate-700"
                                  />
                                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                                </div>
                                <button className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                                  <SlidersHorizontal className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Contact list */}
                              <div className="space-y-2 pb-10">
                                {filteredContacts.length === 0 ? (
                                  <div className="py-8 text-center text-slate-400 text-xs font-bold">Nenhum contato encontrado</div>
                                ) : filteredContacts.map(contact => (
                                  <div key={contact.uid} className="flex items-center justify-between py-3 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                                        {contact.photoURL ? <img src={contact.photoURL} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
                                      </div>
                                      <div>
                                        <p className="text-xs font-bold text-slate-900">{contact.name}</p>
                                        <p className="text-[10px] text-slate-400">{contact.email}</p>
                                      </div>
                                    </div>
                                    <button className="text-[#3182ce] text-[10px] font-bold border border-[#3182ce] px-2 py-1 rounded cursor-pointer hover:bg-blue-50 transition">
                                      Ver
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── ANIVERSÁRIOS SUB-VIEW ── */}
                    {updatesSubView === 'aniversarios' && (() => {
                      const today = new Date();
                      const todayMonth = today.getMonth() + 1;
                      const todayDay = today.getDate();

                      const studentsWithBirth = users
                        .filter(u => u.role === 'student' && u.metadata?.birthDate)
                        .map(u => {
                          const [year, month, day] = (u.metadata!.birthDate!).split('-').map(Number);
                          const thisYearBirthday = new Date(today.getFullYear(), month - 1, day);
                          const nextBirthday = thisYearBirthday < today
                            ? new Date(today.getFullYear() + 1, month - 1, day)
                            : thisYearBirthday;
                          const diffMs = nextBirthday.getTime() - today.getTime();
                          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                          const isToday = month === todayMonth && day === todayDay;
                          const age = today.getFullYear() - year + (thisYearBirthday <= today ? 0 : -1);
                          return { ...u, month, day, diffDays, isToday, age, birthStr: `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}` };
                        })
                        .filter(u =>
                          aniversariosSearch === '' ||
                          u.name.toLowerCase().includes(aniversariosSearch.toLowerCase())
                        )
                        .sort((a, b) => a.diffDays - b.diffDays);

                      const upcoming = studentsWithBirth.filter(u => u.diffDays <= 30 || u.isToday);
                      const resolved = studentsWithBirth.filter(u => !u.isToday && u.diffDays > 30);
                      const listToShow = aniversariosTab === 'pendentes' ? upcoming : resolved;

                      return (
                        <div className="space-y-3">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setAniversariosTab('pendentes')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${aniversariosTab === 'pendentes' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Pendentes
                            </button>
                            <button
                              onClick={() => setAniversariosTab('resolvidas')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${aniversariosTab === 'resolvidas' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Resolvidas
                            </button>
                          </div>

                          {/* Marcar como lidas button (Pendentes only) */}
                          {aniversariosTab === 'pendentes' && upcoming.length > 0 && (
                            <button className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                              Marcar todas como lidas
                            </button>
                          )}

                          {/* Search + Filter */}
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                              <input
                                type="text"
                                placeholder="Pesquisar aluno"
                                value={aniversariosSearch}
                                onChange={(e) => setAniversariosSearch(e.target.value)}
                                className="flex-1 text-xs outline-none text-slate-700"
                              />
                              <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                            <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Aniversários</p>

                          {/* Birthday cards or empty state */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {listToShow.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  {aniversariosSearch ? '🔍' : '📅'}
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">
                                    {aniversariosSearch ? 'Nenhum resultado foi encontrado, tente uma nova busca.' : 'Todas as atualizações foram lidas.'}
                                  </p>
                                  {!aniversariosSearch && (
                                    <p className="text-slate-400 text-xs mt-1">Assim que houver novas atividades dos seus alunos, elas serão exibidas aqui.</p>
                                  )}
                                </div>
                              </div>
                            ) : listToShow.map((student, idx) => (
                              <div
                                key={student.uid}
                                className={`flex items-center gap-3 p-4 ${idx < listToShow.length - 1 ? 'border-b border-slate-100' : ''} ${student.isToday ? 'bg-blue-50' : ''}`}
                              >
                                {/* Avatar */}
                                <div className="w-11 h-11 bg-slate-100 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
                                  {student.photoURL ? <img src={student.photoURL} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-900 truncate">{student.name}</p>
                                  <p className="text-[11px] text-slate-500 font-medium">
                                    🎂 {student.birthStr} — {student.age} anos
                                  </p>
                                  {student.isToday ? (
                                    <span className="text-[10px] bg-[#3182ce] text-white font-bold px-2 py-0.5 rounded-full inline-block mt-0.5">🎉 Hoje!</span>
                                  ) : (
                                    <p className="text-[10px] text-[#3182ce] font-medium">Em {student.diffDays} {student.diffDays === 1 ? 'dia' : 'dias'}</p>
                                  )}
                                </div>

                                {/* WhatsApp button */}
                                <a
                                  href={`https://wa.me/55${(student.trainerPhone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Feliz aniversário, ${student.name.split(' ')[0]}! 🎂🎉`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-9 h-9 bg-[#25d366] rounded-full flex items-center justify-center shrink-0 hover:bg-green-500 transition"
                                  title="Enviar parabéns via WhatsApp"
                                >
                                  <Phone className="w-4 h-4 text-white fill-white" />
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── TREINOS SUB-VIEW ── */}
                    {updatesSubView === 'treinos' && (() => {
                      const treinosNotifs = adminNotifs.filter(n => n.type === 'treinos');
                      const pendentes = treinosNotifs.filter(n => !n.read);
                      const resolvidas = treinosNotifs.filter(n => n.read);
                      
                      let listToShow = treinosTab === 'pendentes' ? pendentes : resolvidas;
                      if (treinosSearch) {
                        listToShow = listToShow.filter(n => 
                          (n.title && n.title.toLowerCase().includes(treinosSearch.toLowerCase())) ||
                          (n.body && n.body.toLowerCase().includes(treinosSearch.toLowerCase()))
                        );
                      }

                      const markAllAsRead = () => {
                        try {
                          const updated = adminNotifs.map(n => n.type === 'treinos' ? { ...n, read: true } : n);
                          localStorage.setItem('cadu_notifs_admin', JSON.stringify(updated));
                          setAdminNotifs(updated);
                        } catch {}
                      };

                      const toggleReadStatus = (id: string) => {
                        try {
                          const updated = adminNotifs.map(n => n.id === id ? { ...n, read: !n.read } : n);
                          localStorage.setItem('cadu_notifs_admin', JSON.stringify(updated));
                          setAdminNotifs(updated);
                        } catch {}
                      };

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
                            <button onClick={markAllAsRead} className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
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
                            <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Treinos</p>

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
                                        <h4 className="text-sm font-bold text-slate-800">{notif.title}</h4>
                                      </div>
                                      <p className="text-xs text-slate-600 mb-1 leading-relaxed">{notif.body}</p>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {new Date(notif.date).toLocaleString()}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => toggleReadStatus(notif.id)}
                                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
                                      title={treinosTab === 'pendentes' ? 'Marcar como lida' : 'Mover para pendentes'}
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
                    {updatesSubView === 'avaliacao_fisica' && (() => {
                      const listToShow: any[] = []; 

                      return (
                        <div className="space-y-3">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setAvaliacaoFisicaTab('pendentes')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${avaliacaoFisicaTab === 'pendentes' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Pendentes
                            </button>
                            <button
                              onClick={() => setAvaliacaoFisicaTab('resolvidas')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${avaliacaoFisicaTab === 'resolvidas' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Resolvidas
                            </button>
                          </div>

                          {/* Marcar como lidas button (Pendentes only) */}
                          {avaliacaoFisicaTab === 'pendentes' && listToShow.length > 0 && (
                            <button className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                              Marcar todas como lidas
                            </button>
                          )}

                          {/* Search + Filter */}
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                              <input
                                type="text"
                                placeholder="Pesquisar aluno"
                                value={avaliacaoFisicaSearch}
                                onChange={(e) => setAvaliacaoFisicaSearch(e.target.value)}
                                className="flex-1 text-xs outline-none text-slate-700"
                              />
                              <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                            <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Avaliação física</p>

                          {/* Cards or empty state */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {listToShow.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  {avaliacaoFisicaSearch ? '🔍' : '📝'}
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">
                                    {avaliacaoFisicaSearch ? 'Nenhum resultado foi encontrado, tente uma nova busca.' : 'Todas as atualizações foram lidas.'}
                                  </p>
                                  {!avaliacaoFisicaSearch && (
                                    <p className="text-slate-400 text-xs mt-1">Assim que houver novas atividades dos seus alunos, elas serão exibidas aqui.</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-slate-500 text-sm">
                                Itens de avaliação física...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── PLANOS RECORRENTES SUB-VIEW ── */}
                    {updatesSubView === 'planos_recorrentes' && (() => {
                      const listToShow: any[] = []; 

                      return (
                        <div className="space-y-3">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setPlanosRecorrentesTab('pendentes')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${planosRecorrentesTab === 'pendentes' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Pendentes
                            </button>
                            <button
                              onClick={() => setPlanosRecorrentesTab('resolvidas')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${planosRecorrentesTab === 'resolvidas' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Resolvidas
                            </button>
                          </div>

                          {/* Marcar como lidas button (Pendentes only) */}
                          {planosRecorrentesTab === 'pendentes' && listToShow.length > 0 && (
                            <button className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                              Marcar todas como lidas
                            </button>
                          )}

                          {/* Search + Filter */}
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                              <input
                                type="text"
                                placeholder="Pesquisar aluno"
                                value={planosRecorrentesSearch}
                                onChange={(e) => setPlanosRecorrentesSearch(e.target.value)}
                                className="flex-1 text-xs outline-none text-slate-700"
                              />
                              <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                            <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Planos Recorrentes</p>

                          {/* Cards or empty state */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {listToShow.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  {planosRecorrentesSearch ? '🔍' : '📝'}
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">
                                    {planosRecorrentesSearch ? 'Nenhum resultado foi encontrado, tente uma nova busca.' : 'Todas as atualizações foram lidas.'}
                                  </p>
                                  {!planosRecorrentesSearch && (
                                    <p className="text-slate-400 text-xs mt-1">Assim que houver novas atividades dos seus alunos, elas serão exibidas aqui.</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-slate-500 text-sm">
                                Itens de planos recorrentes...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── AERÓBICO SUB-VIEW ── */}
                    {updatesSubView === 'aerobico' && (() => {
                      const listToShow: any[] = []; 

                      return (
                        <div className="space-y-3">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setAerobicoTab('pendentes')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${aerobicoTab === 'pendentes' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Pendentes
                            </button>
                            <button
                              onClick={() => setAerobicoTab('resolvidas')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${aerobicoTab === 'resolvidas' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Resolvidas
                            </button>
                          </div>

                          {/* Marcar como lidas button (Pendentes only) */}
                          {aerobicoTab === 'pendentes' && listToShow.length > 0 && (
                            <button className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                              Marcar todas como lidas
                            </button>
                          )}

                          {/* Search + Filter */}
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                              <input
                                type="text"
                                placeholder="Pesquisar aluno"
                                value={aerobicoSearch}
                                onChange={(e) => setAerobicoSearch(e.target.value)}
                                className="flex-1 text-xs outline-none text-slate-700"
                              />
                              <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                            <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Aeróbico</p>

                          {/* Cards or empty state */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {listToShow.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  {aerobicoSearch ? '🔍' : '📝'}
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">
                                    {aerobicoSearch ? 'Nenhum resultado foi encontrado, tente uma nova busca.' : 'Todas as atualizações foram lidas.'}
                                  </p>
                                  {!aerobicoSearch && (
                                    <p className="text-slate-400 text-xs mt-1">Assim que houver novas atividades dos seus alunos, elas serão exibidas aqui.</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-slate-500 text-sm">
                                Itens de aeróbico...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── PÁGINA DE VENDAS SUB-VIEW ── */}
                    {updatesSubView === 'pagina_vendas' && (() => {
                      const listToShow: any[] = []; 

                      return (
                        <div className="space-y-3">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setPaginaVendasTab('pendentes')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${paginaVendasTab === 'pendentes' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Pendentes
                            </button>
                            <button
                              onClick={() => setPaginaVendasTab('resolvidas')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${paginaVendasTab === 'resolvidas' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Resolvidas
                            </button>
                          </div>

                          {/* Marcar como lidas button (Pendentes only) */}
                          {paginaVendasTab === 'pendentes' && listToShow.length > 0 && (
                            <button className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                              Marcar todas como lidas
                            </button>
                          )}

                          {/* Search + Filter */}
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                              <input
                                type="text"
                                placeholder="Pesquisar aluno"
                                value={paginaVendasSearch}
                                onChange={(e) => setPaginaVendasSearch(e.target.value)}
                                className="flex-1 text-xs outline-none text-slate-700"
                              />
                              <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                            <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Página de vendas</p>

                          {/* Cards or empty state */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {listToShow.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  {paginaVendasSearch ? '🔍' : '📝'}
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">
                                    {paginaVendasSearch ? 'Nenhum resultado foi encontrado, tente uma nova busca.' : 'Todas as atualizações foram lidas.'}
                                  </p>
                                  {!paginaVendasSearch && (
                                    <p className="text-slate-400 text-xs mt-1">Assim que houver novas atividades dos seus alunos, elas serão exibidas aqui.</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-slate-500 text-sm">
                                Itens de página de vendas...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── ANAMNESES SUB-VIEW ── */}
                    {updatesSubView === 'anamneses' && (() => {
                      const listToShow: any[] = []; 

                      return (
                        <div className="space-y-3">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setAnamnesesTab('pendentes')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${anamnesesTab === 'pendentes' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Pendentes
                            </button>
                            <button
                              onClick={() => setAnamnesesTab('resolvidas')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${anamnesesTab === 'resolvidas' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Resolvidas
                            </button>
                          </div>

                          {/* Marcar como lidas button (Pendentes only) */}
                          {anamnesesTab === 'pendentes' && listToShow.length > 0 && (
                            <button className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                              Marcar todas como lidas
                            </button>
                          )}

                          {/* Search + Filter */}
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                              <input
                                type="text"
                                placeholder="Pesquisar aluno"
                                value={anamnesesSearch}
                                onChange={(e) => setAnamnesesSearch(e.target.value)}
                                className="flex-1 text-xs outline-none text-slate-700"
                              />
                              <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                            <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Anamneses</p>

                          {/* Cards or empty state */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {listToShow.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  {anamnesesSearch ? '🔍' : '📝'}
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">
                                    {anamnesesSearch ? 'Nenhum resultado foi encontrado, tente uma nova busca.' : 'Todas as atualizações foram lidas.'}
                                  </p>
                                  {!anamnesesSearch && (
                                    <p className="text-slate-400 text-xs mt-1">Assim que houver novas atividades dos seus alunos, elas serão exibidas aqui.</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-slate-500 text-sm">
                                Itens de anamneses...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── FATURAS SUB-VIEW ── */}
                    {updatesSubView === 'faturas' && (() => {
                      const listToShow: any[] = []; 

                      return (
                        <div className="space-y-3">
                          {/* Tabs */}
                          <div className="flex bg-white rounded-xl overflow-hidden border border-slate-200">
                            <button
                              onClick={() => setFaturasTab('pendentes')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${faturasTab === 'pendentes' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Pendentes
                            </button>
                            <button
                              onClick={() => setFaturasTab('resolvidas')}
                              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${faturasTab === 'resolvidas' ? 'bg-[#3182ce] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              Resolvidas
                            </button>
                          </div>

                          {/* Marcar como lidas button (Pendentes only) */}
                          {faturasTab === 'pendentes' && listToShow.length > 0 && (
                            <button className="w-full py-3 bg-[#3182ce] hover:bg-blue-600 text-white font-bold rounded-lg text-sm transition cursor-pointer">
                              Marcar todas como lidas
                            </button>
                          )}

                          {/* Search + Filter */}
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 gap-2">
                              <input
                                type="text"
                                placeholder="Pesquisar aluno"
                                value={faturasSearch}
                                onChange={(e) => setFaturasSearch(e.target.value)}
                                className="flex-1 text-xs outline-none text-slate-700"
                              />
                              <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                            <button className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer shrink-0">
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Section label */}
                          <p className="text-slate-900 font-black text-sm">Faturas</p>

                          {/* Cards or empty state */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {listToShow.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                                <div className="w-16 h-16 bg-[#dbeafe] rounded-full flex items-center justify-center text-3xl">
                                  {faturasSearch ? '🔍' : '📝'}
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">
                                    {faturasSearch ? 'Nenhum resultado foi encontrado, tente uma nova busca.' : 'Todas as atualizações foram lidas.'}
                                  </p>
                                  {!faturasSearch && (
                                    <p className="text-slate-400 text-xs mt-1">Assim que houver novas atividades dos seus alunos, elas serão exibidas aqui.</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-slate-500 text-sm">
                                Itens de faturas...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    </>
                  )}

                  {/* PANEL 4: Wallet Panel details */}
                  {activePanel === 'wallet_panel' && (
                    <div className="space-y-4">
                      <div className="text-center p-6 bg-slate-900 rounded-[32px] border border-slate-850 space-y-2">
                        <Wallet className="w-12 h-12 text-emerald-500 mx-auto animate-pulse" />
                        <div>
                          <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">FATURAMENTO BRUTO</span>
                          <span className="text-3xl font-black text-white">R$ 5.480,00</span>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Histórico de Vendas</span>
                        
                        <div className="p-3.5 bg-slate-900/50 border border-slate-900 rounded-2xl flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-white block">Aline Rocha</span>
                            <span className="text-[8px] text-slate-500 uppercase tracking-widest font-black block">Plano Trimestral</span>
                          </div>
                          <span className="font-black text-emerald-400">R$ 359,70 • Aprovado</span>
                        </div>

                        <div className="p-3.5 bg-slate-900/50 border border-slate-900 rounded-2xl flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-white block">Carla Pereira</span>
                            <span className="text-[8px] text-slate-500 uppercase tracking-widest font-black block">Plano Semestral</span>
                          </div>
                          <span className="font-black text-emerald-400">R$ 599,40 • Aprovado</span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SMARTPHONE BOTTOM BAR NAVIGATION TAB VIEWPORTS (Same as design requested!) */}
          <nav className="h-[64px] border-t border-[#132235] bg-[#0c1622] px-3 flex justify-between items-center shrink-0 z-30 select-none">
            
            {/* Tab 1: Inicio */}
            <button
              onClick={() => {
                setActiveTab('home');
                setActivePanel(null);
              }}
              className={`flex-1 flex flex-col items-center justify-center text-center space-y-1 outline-none select-none ${
                activeTab === 'home' ? 'text-[#dc2626]' : 'text-slate-500 hover:text-white'
              }`}
            >
              <Home className="w-5 h-5 mx-auto" />
              <span className="text-[8.5px] font-black uppercase tracking-wider">Início</span>
            </button>

            {/* Tab 2: Assinatura/Carteira */}
            <button
              onClick={() => {
                setActiveTab('wallet');
                setActivePanel(null);
              }}
              className={`flex-1 flex flex-col items-center justify-center text-center space-y-1 outline-none select-none ${
                activeTab === 'wallet' ? 'text-[#dc2626]' : 'text-slate-500 hover:text-white'
              }`}
            >
              <DollarSign className="w-5 h-5 mx-auto" />
              <span className="text-[8.5px] font-black uppercase tracking-wider">Assinatura</span>
            </button>

            {/* Tab 4: Menu / Fechar */}
            <button
              onClick={() => {
                setActiveTab('menu');
                setActivePanel(null);
              }}
              className={`flex-1 flex flex-col items-center justify-center text-center space-y-1 outline-none select-none ${
                activeTab === 'menu' ? 'text-[#dc2626]' : 'text-slate-500 hover:text-white'
              }`}
            >
              <Menu className="w-5 h-5 mx-auto" />
              <span className="text-[8.5px] font-black uppercase tracking-wider">Menu</span>
            </button>

          </nav>

        </div>

      {/* OVERLAY 1: STUDENT DETAILS & COACH ACTIONS MODAL */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-[100] bg-[#f4f7fa] flex flex-col md:p-6 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full h-full flex flex-col max-w-lg mx-auto bg-[#f4f7fa] md:rounded-3xl md:shadow-2xl overflow-hidden relative text-left"
            >
              {/* NEW HEADER */}
              <div className="bg-[#1c2e40] pt-6 flex flex-col shrink-0">
                <div className="px-6 pb-6">
                  <button 
                    onClick={() => setSelectedStudent(null)}
                    className="flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white transition mb-6 uppercase tracking-wider cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" /> Voltar
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-white/10 text-white rounded-full flex items-center justify-center font-black text-2xl uppercase select-none shrink-0 border-2 border-white/20">
                      {selectedStudent.name.substring(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white uppercase tracking-wider leading-tight mb-1">{selectedStudent.name}</h3>
                      <p className="text-sm text-slate-300 font-semibold">{selectedStudent.modality || 'Presencial'}</p>
                    </div>
                  </div>
                </div>

                {/* TABS attached to header */}
                <div className="flex px-4 gap-2">
                  <button
                    onClick={() => setSelectedDetailTab('inicio')}
                    className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-t-xl transition duration-300 cursor-pointer ${
                      selectedDetailTab === 'inicio' 
                        ? 'bg-[#f4f7fa] text-slate-800' 
                        : 'bg-[#3182ce] hover:bg-[#2b6cb0] text-white shadow-inner'
                    }`}
                  >
                    Início
                  </button>
                  <button
                    onClick={() => setSelectedDetailTab('opcoes')}
                    className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-t-xl transition duration-300 cursor-pointer ${
                      selectedDetailTab === 'opcoes' 
                        ? 'bg-[#f4f7fa] text-slate-800' 
                        : 'bg-[#3182ce] hover:bg-[#2b6cb0] text-white shadow-inner'
                    }`}
                  >
                    Opções
                  </button>
                </div>
              </div>

              {/* Scrollable Container */}
              <div className="flex-1 overflow-y-auto px-4 py-5 scrollbar-none space-y-4">
                
                {/* TABCONTENT: INITIAL (INÍCIO) */}
                {selectedDetailTab === 'inicio' && (
                  <div className="space-y-4">
                    
                    {/* Weekly Frequency Section */}
                    <div 
                      onClick={() => setShowFrequencyCalendar(true)}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-[#3182ce] transition"
                    >
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-5 text-center">Frequência de Treinos</h4>
                      
                      <div className="flex justify-between items-center">
                        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, idx) => {
                          const isActive = frequency[idx];
                          return (
                            <div
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleDay(idx);
                              }}
                              className="flex flex-col items-center gap-2 cursor-pointer group"
                            >
                              <div className={`w-8 h-8 rounded-full border-[2px] flex items-center justify-center transition-colors ${
                                isActive 
                                  ? 'border-[#3182ce] bg-white' 
                                  : 'border-slate-300 bg-white'
                              }`}>
                                {isActive ? (
                                  <div className="w-2.5 h-2.5 bg-[#3182ce] rounded-full" />
                                ) : (
                                  <X className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 transition" strokeWidth={3} />
                                )}
                              </div>
                              <span className="text-[10px] font-black text-slate-500 uppercase">{day}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Expanding Categories List */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                      
                      {/* CATEGORY: WORKOUTS (TREINOS) */}
                      <div className="overflow-hidden">
                        <button
                          onClick={() => setExpandedCategory(expandedCategory === 'treinos' ? null : 'treinos')}
                          className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition"
                        >
                          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#3182ce] shrink-0">
                            <Dumbbell className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <span className="block text-sm font-bold text-slate-800">Treinos Sincronizados</span>
                            <span className="block text-[11px] font-semibold text-slate-500">
                              {workouts.filter(w => w.studentId === selectedStudent.uid).length} Fichas Ativas
                            </span>
                          </div>
                          {expandedCategory === 'treinos' ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                        
                        {expandedCategory === 'treinos' && (
                          <div className="px-5 pb-5 pt-2 space-y-4">
                            {/* Workout list */}
                            {workouts.filter(w => w.studentId === selectedStudent.uid).length === 0 ? (
                              <div className="text-center py-6 text-slate-500 text-xs font-semibold">
                                <p className="mb-3.5">Nenhuma ficha de treino ativa cadastrada.</p>
                                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                                  <button
                                    onClick={() => handleAddWorkout('inferiores')}
                                    className="bg-[#3182ce] hover:bg-[#2b6cb0] text-white font-bold py-2.5 px-4 rounded-xl text-[11px] uppercase tracking-wider transition cursor-pointer shadow-sm"
                                  >
                                    ⚡ Inicializar Treino Inferiores
                                  </button>
                                  <button
                                    onClick={() => handleAddWorkout('superiores')}
                                    className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-xl text-[11px] uppercase tracking-wider transition cursor-pointer shadow-sm"
                                  >
                                    ⚡ Inicializar Treino Superiores
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {workouts.filter(w => w.studentId === selectedStudent.uid).map((w) => (
                                  <div key={w.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <h5 className="font-bold text-sm text-slate-800">{w.name}</h5>
                                      {w.description && <p className="text-[11px] text-slate-500 mt-1">{w.description}</p>}
                                      
                                      {/* Quick exercises preview indicator */}
                                      <span className="inline-block text-[10px] bg-blue-50 text-[#3182ce] px-2 py-0.5 rounded-full font-bold mt-2.5 uppercase tracking-wide">
                                        {w.exercises?.length || 0} exercícios
                                      </span>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                      {/* PDF EXPORT BUTTON */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          generateWorkoutPDF(w, selectedStudent.name);
                                        }}
                                        className="p-2.5 bg-blue-50 hover:bg-[#3182ce] text-[#3182ce] hover:text-white rounded-xl transition duration-200 active:scale-90 cursor-pointer"
                                        title="Baixar Treino em PDF"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>
                                      
                                      {/* DELETE INDIVIDUAL WORKOUT */}
                                      <button
                                        onClick={() => handleDeleteWorkout(w.id)}
                                        className="p-2.5 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition duration-200 cursor-pointer"
                                        title="Excluir ficha"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                ))}

                                {/* Add training presets panel */}
                                <div className="pt-4 mt-2 border-t border-dashed border-slate-200">
                                  <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 text-center">Prescrever Novo Treino</span>
                                  <div className="grid grid-cols-3 gap-2">
                                    <button
                                      onClick={() => handleAddWorkout('inferiores')}
                                      className="py-2.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] text-[11px] font-bold text-slate-600 rounded-xl transition cursor-pointer text-center shadow-sm"
                                    >
                                      + Inferiores
                                    </button>
                                    <button
                                      onClick={() => handleAddWorkout('superiores')}
                                      className="py-2.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] text-[11px] font-bold text-slate-600 rounded-xl transition cursor-pointer text-center shadow-sm"
                                    >
                                      + Superiores
                                    </button>
                                    <button
                                      onClick={() => handleAddWorkout('cardio')}
                                      className="py-2.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] text-[11px] font-bold text-slate-600 rounded-xl transition cursor-pointer text-center shadow-sm"
                                    >
                                      + Core/Cardio
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* CATEGORY: ASSESSMENTS (AVALIAÇÕES) */}
                      <div className="overflow-hidden">
                        <button
                          onClick={() => setExpandedCategory(expandedCategory === 'avaliacoes' ? null : 'avaliacoes')}
                          className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition"
                        >
                          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#3182ce] shrink-0">
                            <ClipboardCheck className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <span className="block text-sm font-bold text-slate-800">Avaliações Físicas</span>
                            <span className="block text-[11px] font-semibold text-slate-500">
                              {selectedStudent.weight || '--'} kg • {selectedStudent.height || '--'} cm
                            </span>
                          </div>
                          {expandedCategory === 'avaliacoes' ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                        
                        {expandedCategory === 'avaliacoes' && (
                          <div className="px-5 pb-5 pt-2 space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Peso (kg)</label>
                                <input 
                                  type="number"
                                  step="0.1"
                                  value={editWeight}
                                  onChange={(e) => setEditWeight(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-sm outline-none text-slate-800 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20"
                                  placeholder="59"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Altura (cm)</label>
                                <input 
                                  type="number"
                                  value={editHeight}
                                  onChange={(e) => setEditHeight(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-sm outline-none text-slate-800 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20"
                                  placeholder="164"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gordura (BF)</label>
                                <input 
                                  type="text"
                                  value={editBF}
                                  onChange={(e) => setEditBF(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-sm outline-none text-slate-800 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20"
                                  placeholder="18.5%"
                                />
                              </div>
                            </div>

                            <button
                              onClick={handleSaveAssessment}
                              className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-sm ${
                                saveSuccess 
                                  ? 'bg-emerald-500 text-white' 
                                  : 'bg-[#3182ce] hover:bg-[#2b6cb0] text-white'
                              }`}
                            >
                              {saveSuccess ? '✓ Atualizado com Sucesso!' : 'Salvar Dados da Avaliação'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* CATEGORY: FINANCE (POSIÇÃO FINANCEIRA) */}
                      <div className="overflow-hidden">
                        <button
                          onClick={() => setShowFinanceModal(true)}
                          className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition border-b border-slate-100"
                        >
                          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#3182ce] shrink-0">
                            <Wallet className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <span className="block text-sm font-bold text-slate-800">Posição Financeira</span>
                            <span className={`block text-[11px] font-semibold text-slate-500`}>
                              Gerenciar faturas e pagamentos
                            </span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        </button>
                      </div>

                      {/* CATEGORY: STUDENT PROGRESS (PROGRESSO DO ALUNO) */}
                      <div className="overflow-hidden">
                        <button
                          onClick={() => setExpandedCategory(expandedCategory === 'progresso' ? null : 'progresso')}
                          className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition"
                        >
                          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#3182ce] shrink-0">
                            <Activity className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <span className="block text-sm font-bold text-slate-800">Progresso do Aluno</span>
                            <span className="block text-[11px] font-semibold text-slate-500">Resumo de cargas de repetição</span>
                          </div>
                          {expandedCategory === 'progresso' ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                        
                        {expandedCategory === 'progresso' && (
                          <div className="px-5 pb-5 pt-2 space-y-3.5">
                            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Evolução Fiel de Carga</span>
                              <div className="space-y-2 text-sm font-semibold text-slate-700">
                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                  <span>Supino Reto</span>
                                  <span className="text-[#3182ce] font-bold font-mono">60 kg → 64 kg 🔥</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                  <span>Agachamento Búlgaro</span>
                                  <span className="text-[#3182ce] font-bold font-mono">10 kg → 12 kg 🔥</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Puxada Aberta</span>
                                  <span className="text-slate-500 font-mono">55 kg (estável)</span>
                                </div>
                              </div>
                            </div>
                            
                            <p className="text-[10px] text-slate-400 text-center font-bold">Visite a aba de Fotos de Evolução do aluno no Feed para revisões visuais.</p>
                          </div>
                        )}
                      </div>

                      {/* CATEGORY: EXTRA ROUTINES (TREINOS EXTRAS) */}
                      <div className="overflow-hidden">
                        <button
                          onClick={() => setExpandedCategory(expandedCategory === 'extras' ? null : 'extras')}
                          className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition"
                        >
                          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#3182ce] shrink-0">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <span className="block text-sm font-bold text-slate-800">Treinos Extras & Cardio</span>
                            <span className="block text-[11px] font-semibold text-slate-500">Orientações extras prescritas</span>
                          </div>
                          {expandedCategory === 'extras' ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                        
                        {expandedCategory === 'extras' && (
                          <div className="px-5 pb-5 pt-2 space-y-3.5 text-sm">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Recomendações Auxiliares (Cardio, Mobilidade...)</label>
                              <textarea
                                value={extraPrescription}
                                onChange={(e) => setExtraPrescription(e.target.value)}
                                rows={2}
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl font-semibold text-sm outline-none text-slate-800 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 resize-none placeholder:text-slate-400"
                                placeholder="Insira aqui as prescrições de cardio ou mobilidade... Ex: 30 minutos de hit corrida 3x na semana."
                              />
                            </div>

                            <button
                              onClick={handleSavePrescription}
                              className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-sm ${
                                prescSuccess 
                                  ? 'bg-emerald-500 text-white' 
                                  : 'bg-[#3182ce] hover:bg-[#2b6cb0] text-white'
                              }`}
                            >
                              {prescSuccess ? '✓ Prescrição Salva!' : 'Salvar Recomendações'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* CATEGORY: FILES (ARQUIVOS) */}
                      <div className="overflow-hidden">
                        <button
                          onClick={() => setExpandedCategory(expandedCategory === 'arquivos' ? null : 'arquivos')}
                          className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition"
                        >
                          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#3182ce] shrink-0">
                            <Archive className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <span className="block text-sm font-bold text-slate-800">Arquivos Exportáveis</span>
                            <span className="block text-[11px] font-semibold text-slate-500">Formulários e Fichas offline do aluno</span>
                          </div>
                          {expandedCategory === 'arquivos' ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                        
                        {expandedCategory === 'arquivos' && (
                          <div className="px-5 pb-5 pt-2 space-y-2.5">
                            {workouts.filter(w => w.studentId === selectedStudent.uid).map((workout) => (
                              <button
                                key={workout.id}
                                onClick={() => generateWorkoutPDF(workout, selectedStudent.name)}
                                className="w-full p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between font-bold text-sm text-slate-700 transition group cursor-pointer shadow-sm"
                              >
                                <span className="group-hover:text-[#3182ce] transition">{workout.name}.pdf</span>
                                <Download className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce]" />
                              </button>
                            ))}
                            
                            {workouts.filter(w => w.studentId === selectedStudent.uid).length === 0 && (
                              <p className="text-xs text-slate-500 font-semibold text-center italic py-2">Sem arquivos de PDFs geráveis disponíveis para esse aluno. Crie uma ficha na categoria "Treinos" acima primeiro!</p>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}

                {/* TABCONTENT: OPTIONS (OPÇÕES) */}
                {selectedDetailTab === 'opcoes' && (
                  <div className="space-y-4 pt-1">
                    
                    {/* Option List Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                      <a
                        href={`https://wa.me/${selectedStudent.trainerPhone || '5511999999999'}?text=Olá%20${encodeURIComponent(selectedStudent.name)}%2C%20acabei%20de%20atualizar%20suas%20fichas%20e%20frequência%20no%20meu%20painel%20Cadu%20Ponce%20Personal!`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <MessageSquare className="w-5 h-5 text-emerald-500" />
                        </div>
                        <span className="text-sm font-medium text-slate-700">Conversar</span>
                      </a>
                      
                      <button
                        onClick={() => {
                          const link = `https://cadu-ponce-personal.vercel.app/login?email=${selectedStudent.email}`;
                          navigator.clipboard.writeText(link);
                          setCopiedLink(selectedStudent.uid);
                          setTimeout(() => setCopiedLink(null), 2000);
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

                      <button
                        className="w-full flex items-center gap-4 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer text-left opacity-70"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Bell className="w-5 h-5 text-[#3182ce]" />
                        </div>
                        <span className="text-sm font-medium text-slate-700">Preferências de notificações</span>
                      </button>

                      <button
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition cursor-pointer text-left opacity-70"
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
                        onClick={handleToggleModality}
                        className="w-full py-3.5 bg-white border border-[#3182ce] text-[#3182ce] font-medium rounded-lg text-sm transition hover:bg-blue-50 cursor-pointer"
                      >
                        Inativar aluno
                      </button>
                      
                      <button
                        onClick={() => handleDeleteUser(selectedStudent.uid)}
                        className="w-full py-3.5 bg-white border border-red-500 text-red-500 font-medium rounded-lg text-sm transition hover:bg-red-50 cursor-pointer"
                      >
                        Excluir aluno
                      </button>
                    </div>

                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FREQUENCY CALENDAR MODAL */}
      <AnimatePresence>
        {showFrequencyCalendar && (
          <div className="fixed inset-0 z-[150] bg-[#22354a] flex flex-col items-center justify-start overflow-y-auto">
            <div className="w-full max-w-xl flex flex-col min-h-screen relative">
              {/* Header */}
              <div className="px-6 pt-8 pb-20 shrink-0 text-center relative">
                <h2 className="text-white text-xl font-bold">
                  Frequência de Treinos
                </h2>
              </div>

              {/* Calendar Card */}
              <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="flex-1 bg-white rounded-xl shadow-xl p-6 relative -mt-14 mx-4 mb-8"
              >
                {/* < Anterior and Date */}
                <div className="flex justify-between items-start mb-8">
                  <button 
                    onClick={() => setShowFrequencyCalendar(false)} 
                    className="text-[#3182ce] flex items-center gap-1 font-medium text-sm"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <div className="text-center absolute left-1/2 -translate-x-1/2">
                    <h3 className="font-bold text-lg text-slate-800 tracking-tight">2026</h3>
                    <p className="text-slate-700 text-sm capitalize">{format(new Date(), 'MMMM', { locale: ptBR })}</p>
                  </div>
                  <div className="w-20" />
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-y-6 text-center mt-12">
                  {['Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.', 'Dom.'].map(d => (
                    <div key={d} className="text-sm font-medium text-slate-800">{d}</div>
                  ))}
                  {/* Empty spaces if month doesn't start on Monday. Hardcoded for image demo (starts on Monday) */}
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className="flex justify-center">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-[#f1f5f9] text-slate-700">
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Ver ano completo */}
                <div className="mt-12 text-right pr-2">
                  <button className="text-[#3182ce] text-sm font-medium hover:underline">
                    Ver ano completo
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* FINANCE MODAL */}
      <AnimatePresence>
        {showFinanceModal && (
          <div className="fixed inset-0 z-[150] bg-[#f4f7f9] flex flex-col items-center justify-start overflow-y-auto">
            <div className="w-full max-w-xl flex flex-col min-h-screen relative">
              {/* Header */}
              <div className="px-6 pt-6 pb-24 shrink-0 relative bg-[#22354a]">
                 <div className="flex items-center gap-4 mb-4">
                  <button onClick={() => setShowFinanceModal(false)} className="text-white flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider opacity-80 hover:opacity-100">
                    <ChevronLeft className="w-4 h-4" /> Voltar
                  </button>
                </div>
                <h2 className="text-white text-lg font-black uppercase tracking-tight">
                  {selectedStudent?.name}
                </h2>
              </div>

              {/* Finance Cards */}
              <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="flex-1 relative -mt-16 mx-4 mb-8"
              >
                {/* 3 Summary Cards */}
                <div className="flex gap-3 overflow-x-auto pb-4 snap-x scrollbar-none">
                  {/* Card 1 */}
                  <div className="bg-white rounded-md shadow-sm p-5 min-w-[220px] shrink-0 snap-center border border-slate-100">
                    <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider mb-3">Recebido no período</p>
                    <p className="text-xl font-black text-[#10b981]">R$ 0,00</p>
                  </div>
                  {/* Card 2 */}
                  <div className="bg-white rounded-md shadow-sm p-5 min-w-[220px] shrink-0 snap-center border border-slate-100">
                    <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider mb-3">Em aberto no período</p>
                    <p className="text-xl font-black text-[#f43f5e]">R$ 0,00</p>
                  </div>
                  {/* Card 3 */}
                  <div className="bg-white rounded-md shadow-sm p-5 min-w-[220px] shrink-0 snap-center border border-slate-100">
                    <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider mb-3">Recebido em 2026</p>
                    <p className="text-xl font-black text-[#10b981]">R$ 0,00</p>
                  </div>
                </div>

                {/* Date Filter */}
                <div className="text-center mt-2 mb-6 relative group">
                   <div className="inline-block relative">
                     {/* Tooltip mockup */}
                     <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white text-slate-600 text-[11px] px-3 py-2 rounded shadow-md border border-slate-100 whitespace-nowrap z-10 hidden group-hover:block">
                        Clique aqui para alterar o período
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-slate-100 rotate-45" />
                     </div>
                     <button className="text-[#0070d2] text-sm font-medium cursor-pointer">
                        01/06/2026 - 30/06/2026
                     </button>
                   </div>
                </div>

                {/* Main Content Area */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 min-h-[400px]">
                  {/* Tabs */}
                  <div className="flex flex-wrap gap-2 mb-8">
                    <button className="flex-1 py-2.5 bg-[#0070d2] text-white text-xs font-medium rounded-md whitespace-nowrap">
                      Faturas Abertas
                    </button>
                    <button className="flex-1 py-2.5 bg-white border border-slate-200 text-[#0070d2] text-xs font-medium rounded-md whitespace-nowrap hover:bg-slate-50">
                      Faturas Pagas
                    </button>
                    <button className="flex-1 py-2.5 bg-white border border-slate-200 text-[#0070d2] text-xs font-medium rounded-md whitespace-nowrap hover:bg-slate-50">
                      Faturas Vencidas
                    </button>
                    <button className="flex-1 py-2.5 bg-white border border-slate-200 text-[#0070d2] text-xs font-medium rounded-md whitespace-nowrap hover:bg-slate-50">
                      Planos
                    </button>
                  </div>

                  {/* Add Invoice Button */}
                  <div className="flex justify-end">
                    <button className="bg-[#22354a] text-white px-5 py-2.5 rounded-md text-xs font-bold flex items-center gap-1 hover:bg-[#152332] transition">
                      + Fatura
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* OVERLAY 2: ADD NEW STUDENT MODAL (REWRITTEN TO MATCH IMAGE) */}
      <AnimatePresence>
        {isAddingUser && (
          <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-start md:p-6 overflow-y-auto">
            
            {/* Header / Banner area */}
            <div className="w-full max-w-xl bg-[#0c1d2e] p-6 pb-20 md:rounded-t-3xl flex flex-col items-start relative shrink-0">
               <button 
                onClick={() => setIsAddingUser(false)}
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

                {/* Password and Role */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Senha de Acesso</label>
                    <input 
                      required
                      type="text"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Ex: 123456"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none focus:bg-white focus:border-[#dc2626] transition duration-200"
                    />
                  </div>
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
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={formBirthDate}
                    onChange={(e) => setFormBirthDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-400 outline-none focus:bg-white focus:border-[#dc2626]"
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">WhatsApp</label>
                  <div className="flex items-center">
                    <div className="flex items-center px-3 py-3 bg-slate-50 border border-r-0 border-slate-100 rounded-l-lg space-x-2">
                       <img src="https://flagcdn.com/w20/br.png" width="20" alt="Brazil" className="rounded-sm" />
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

                {/* Enviar informações de acesso ao aluno */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Enviar informações de acesso ao aluno</label>
                  <div className="relative">
                    <select 
                      value={formSendAccessInfo}
                      onChange={(e) => setFormSendAccessInfo(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none appearance-none focus:bg-white focus:border-[#dc2626]"
                    >
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Enviar anamnese */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Enviar anamnese</label>
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

                {/* Bloquear acesso de inadimplentes */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black italic uppercase tracking-tight text-slate-800">Bloquear acesso de inadimplentes</label>
                  <div className="relative">
                    <select 
                      value={formBlockDefaulters}
                      onChange={(e) => setFormBlockDefaulters(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg font-bold text-sm text-slate-900 outline-none appearance-none focus:bg-white focus:border-[#dc2626]"
                    >
                      <option value="">Selecione</option>
                      <option value="Automático">Automático</option>
                      <option value="Manual">Manual</option>
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
                        const isMp4 = libEx.videoUrl?.includes('.mp4') || libEx.videoUrl?.includes('.mov') || libEx.videoUrl?.includes('supabase.co/storage');
                        updateRoutineExercise(selectingExerciseForIdx, {
                          name: libEx.title,
                          videoUrl: isMp4 ? '' : (libEx.videoUrl || ''),
                          videoFileUrl: isMp4 ? (libEx.videoUrl || '') : '',
                          notes: libEx.description || ''
                        });
                        setSelectingExerciseForIdx(null);
                        setExerciseSearch('');
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100 hover:border-[#dc2626] transition text-left cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                        <img src={libEx.image} alt={libEx.title} className="w-full h-full object-cover" />
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
