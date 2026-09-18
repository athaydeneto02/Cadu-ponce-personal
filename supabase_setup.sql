-- ==============================================================================
-- CADU PONCE PERSONAL - SUPABASE SETUP COMPLETO
-- Execute este script no menu "SQL Editor" do seu painel do Supabase.
-- Ele cria todas as tabelas, permissões, buckets de mídia e triggers necessários.
-- ==============================================================================

-- 1. EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA DE PERFIS DE USUÁRIOS (Admin e Alunos)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  photo_url TEXT,
  weight NUMERIC,
  height NUMERIC,
  trainer_phone TEXT DEFAULT '5511999999999',
  role TEXT DEFAULT 'student',
  status TEXT DEFAULT 'active',
  modality TEXT DEFAULT 'Presencial',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TRIGGER AUTOMÁTICO: Cria linha em profiles ao cadastrar usuário no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, profiles.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. TABELA DE ROTINAS / FICHAS DE TREINO DO PERSONAL
CREATE TABLE IF NOT EXISTS public.admin_routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT,
  difficulty TEXT,
  day_of_week TEXT,
  muscle_group TEXT,
  general_notes TEXT,
  notes TEXT,
  student_ids TEXT[] DEFAULT '{}',
  student_names TEXT[] DEFAULT '{}',
  start_date TEXT,
  end_date TEXT,
  routine_group_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABELA DE EXERCÍCIOS DAS ROTINAS (Com suporte a bi-set / combinado)
CREATE TABLE IF NOT EXISTS public.admin_exercises (
  id TEXT PRIMARY KEY,
  routine_id TEXT REFERENCES public.admin_routines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets INTEGER DEFAULT 3,
  reps TEXT DEFAULT '10',
  rest TEXT DEFAULT '60s',
  notes TEXT,
  video_url TEXT,
  video_file_url TEXT,
  combined_with_next BOOLEAN DEFAULT FALSE,
  combined_group TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABELA DA BIBLIOTECA DE EXERCÍCIOS PERSONALIZADOS
CREATE TABLE IF NOT EXISTS public.custom_exercises (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  "group" TEXT NOT NULL,
  category TEXT NOT NULL,
  video_url TEXT,
  video_file_url TEXT,
  image TEXT,
  description TEXT,
  is_custom BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABELA DE EVENTOS DA AGENDA (Usada para aulas, rotinas atribuídas e contingência)
CREATE TABLE IF NOT EXISTS public.agenda_events (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  student_name TEXT,
  title TEXT NOT NULL,
  date TEXT,
  start_time TEXT,
  end_time TEXT,
  type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TABELA DE LOGS DE TREINOS CONCLUÍDOS PELOS ALUNOS
CREATE TABLE IF NOT EXISTS public.workout_logs (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  student_name TEXT,
  routine_id TEXT,
  routine_name TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER DEFAULT 0,
  rpe INTEGER DEFAULT 0,
  exercises_summary JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. TABELAS AUXILIARES (Grupos musculares e Categorias)
CREATE TABLE IF NOT EXISTS public.exercise_muscle_groups (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.exercise_categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- 10. TABELAS DE AVALIAÇÃO FÍSICA E ANAMNESE
CREATE TABLE IF NOT EXISTS public.assessments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  weight NUMERIC,
  height NUMERIC,
  body_fat NUMERIC,
  measurements JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.anamnesis (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  responses JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. LIBERAR PERMISSÕES COMPLETAS (DESATIVAR RLS PARA O APP OPERAR LIVREMENTE)
-- Isso elimina qualquer erro de "new row violates row-level security"
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_routines DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_exercises DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_exercises DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_muscle_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis DISABLE ROW LEVEL SECURITY;

-- 12. BUCKET DE ARMAZENAMENTO DE VÍDEOS E FOTOS (Supabase Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-videos', 'exercise-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas públicas para o bucket exercise-videos
DROP POLICY IF EXISTS "Public Select exercise-videos" ON storage.objects;
CREATE POLICY "Public Select exercise-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'exercise-videos');

DROP POLICY IF EXISTS "Public Insert exercise-videos" ON storage.objects;
CREATE POLICY "Public Insert exercise-videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'exercise-videos');

DROP POLICY IF EXISTS "Public Update exercise-videos" ON storage.objects;
CREATE POLICY "Public Update exercise-videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'exercise-videos');

DROP POLICY IF EXISTS "Public Delete exercise-videos" ON storage.objects;
CREATE POLICY "Public Delete exercise-videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'exercise-videos');
