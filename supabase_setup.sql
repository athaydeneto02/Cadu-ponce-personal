-- Non-destructive, repeatable hardening. Read docs/security-deployment.md first.
-- Existing admin roles are preserved: verify them against the real owner before deployment.
BEGIN;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT, email TEXT, photo_url TEXT, weight NUMERIC, height NUMERIC,
  trainer_phone TEXT, role TEXT DEFAULT 'student', status TEXT DEFAULT 'inactive',
  modality TEXT DEFAULT 'Online', metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.admin_routines (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT, difficulty TEXT,
  day_of_week TEXT, muscle_group TEXT, general_notes TEXT, notes TEXT,
  student_ids TEXT[] DEFAULT '{}', student_names TEXT[] DEFAULT '{}',
  start_date TEXT, end_date TEXT, routine_group_name TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.admin_exercises (
  id TEXT PRIMARY KEY, routine_id TEXT, name TEXT NOT NULL, sets INTEGER DEFAULT 3,
  reps TEXT DEFAULT '10', rest TEXT DEFAULT '60s', notes TEXT, video_url TEXT,
  video_file_url TEXT, combined_with_next BOOLEAN DEFAULT FALSE, combined_group TEXT,
  prescribed_loads JSONB, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.workouts (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, routine_id TEXT, name TEXT NOT NULL,
  description TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.exercises (
  id TEXT PRIMARY KEY, workout_id TEXT, name TEXT NOT NULL, sets INTEGER DEFAULT 3,
  reps TEXT, rest TEXT, notes TEXT, current_load NUMERIC DEFAULT 0,
  prescribed_loads JSONB, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.progress_entries (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, exercise_name TEXT NOT NULL,
  load NUMERIC, reps NUMERIC, date TIMESTAMPTZ DEFAULT NOW(), notes TEXT
);
CREATE TABLE IF NOT EXISTS public.evolution_photos (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, photo_url TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(), notes TEXT
);
CREATE TABLE IF NOT EXISTS public.custom_exercises (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, "group" TEXT NOT NULL, category TEXT NOT NULL,
  video_url TEXT, video_file_url TEXT, image TEXT, description TEXT,
  is_custom BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.agenda_events (
  id TEXT PRIMARY KEY, student_id TEXT, student_name TEXT, title TEXT NOT NULL,
  date TEXT, start_time TEXT, end_time TEXT, type TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.workout_logs (
  id TEXT PRIMARY KEY, student_id TEXT, student_name TEXT, routine_id TEXT,
  routine_name TEXT, completed_at TIMESTAMPTZ DEFAULT NOW(), duration_seconds INTEGER DEFAULT 0,
  rpe INTEGER DEFAULT 0, exercises_summary JSONB DEFAULT '[]'::jsonb, comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.muscle_groups (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS public.exercise_muscle_groups (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS public.exercise_categories (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS public.assessments (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, date DATE DEFAULT CURRENT_DATE,
  weight NUMERIC, height NUMERIC, body_fat NUMERIC, measurements JSONB DEFAULT '{}'::jsonb,
  notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.anamnesis (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, responses JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
);
-- CREATE TABLE IF NOT EXISTS leaves deployed tables unchanged. Add fields used by
-- the current client explicitly, retaining existing column types, IDs and rows.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.admin_routines
  ADD COLUMN IF NOT EXISTS day_of_week TEXT,
  ADD COLUMN IF NOT EXISTS muscle_group TEXT,
  ADD COLUMN IF NOT EXISTS general_notes TEXT,
  ADD COLUMN IF NOT EXISTS start_date TEXT,
  ADD COLUMN IF NOT EXISTS end_date TEXT,
  ADD COLUMN IF NOT EXISTS routine_group_name TEXT;
ALTER TABLE public.admin_exercises
  ADD COLUMN IF NOT EXISTS combined_with_next BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS combined_group TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.custom_exercises
  ADD COLUMN IF NOT EXISTS image TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT TRUE;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS routine_id TEXT;
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE public.admin_exercises ADD COLUMN IF NOT EXISTS prescribed_loads JSONB;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS prescribed_loads JSONB;

-- Existing UUID-based schemas are supported without rewriting IDs or deleting orphans.
-- NOT VALID checks future writes immediately; validate existing rows after a data audit.
DO $$
DECLARE relation RECORD; child_type OID; parent_type OID;
BEGIN
  FOR relation IN SELECT * FROM (VALUES
    ('exercises','workout_id','workouts','cadu_exercises_workout_fk'),
    ('admin_exercises','routine_id','admin_routines','cadu_admin_exercises_routine_fk')
  ) AS r(child_table,child_column,parent_table,constraint_name) LOOP
    SELECT atttypid INTO child_type FROM pg_attribute
      WHERE attrelid = ('public.' || relation.child_table)::regclass AND attname = relation.child_column;
    SELECT atttypid INTO parent_type FROM pg_attribute
      WHERE attrelid = ('public.' || relation.parent_table)::regclass AND attname = 'id';
    IF child_type = parent_type THEN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.contype='f'
        AND c.conrelid=('public.' || relation.child_table)::regclass
        AND c.confrelid=('public.' || relation.parent_table)::regclass
        AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname=relation.child_column)]::smallint[]) THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE CASCADE NOT VALID',
          relation.child_table, relation.constraint_name, relation.child_column, relation.parent_table);
      END IF;
    ELSE
      RAISE NOTICE 'Foreign key for %.% requires a reviewed ID type migration; existing data preserved', relation.child_table, relation.child_column;
    END IF;
  END LOOP;
END;
$$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin' AND p.status = 'active');
$$;
CREATE OR REPLACE FUNCTION private.is_active()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.status = 'active');
$$;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin(), private.is_active() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, status)
  VALUES (new.id, new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'student', 'inactive')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Students may update their personal data, never their role, membership or billing settings.
CREATE OR REPLACE FUNCTION private.guard_profile_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL OR private.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id <> auth.uid() OR
    (to_jsonb(NEW) - ARRAY['name','photo_url','weight','height','metadata','updated_at'])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['name','photo_url','weight','height','metadata','updated_at']) OR
    (COALESCE(NEW.metadata, '{}'::jsonb) - ARRAY['phone','instagram','birthDate','gender'])
      IS DISTINCT FROM
    (COALESCE(OLD.metadata, '{}'::jsonb) - ARRAY['phone','instagram','birthDate','gender']) THEN
    RAISE EXCEPTION 'Only an administrator may change account permissions or membership' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_profile_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS cadu_guard_profile_update ON public.profiles;
CREATE TRIGGER cadu_guard_profile_update BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_profile_update();

-- Remove old permissive policies on this application's tables, preserving all rows.
DO $$
DECLARE tbl TEXT; p RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profiles','admin_routines','admin_exercises','workouts','exercises',
    'progress_entries','evolution_photos','custom_exercises','agenda_events','workout_logs',
    'muscle_groups','exercise_muscle_groups','exercise_categories','assessments','anamnesis','push_subscriptions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    END LOOP;
    EXECUTE format('CREATE POLICY cadu_admin_all ON public.%I FOR ALL TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()))', tbl);
  END LOOP;
END;
$$;

CREATE POLICY cadu_profile_read ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY cadu_profile_update ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT private.is_active()) AND id = (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_active()) AND id = (SELECT auth.uid()));
CREATE POLICY cadu_routine_read ON public.admin_routines FOR SELECT TO authenticated
  USING ((SELECT private.is_active()) AND (SELECT auth.uid())::text = ANY(student_ids::text[]));
CREATE POLICY cadu_admin_exercise_read ON public.admin_exercises FOR SELECT TO authenticated
  USING ((SELECT private.is_active()) AND EXISTS (SELECT 1 FROM public.admin_routines r
    WHERE r.id::text = routine_id::text AND (SELECT auth.uid())::text = ANY(r.student_ids::text[])));
CREATE POLICY cadu_workout_read ON public.workouts FOR SELECT TO authenticated
  USING ((SELECT private.is_active()) AND student_id::text = (SELECT auth.uid())::text);
CREATE POLICY cadu_exercise_read ON public.exercises FOR SELECT TO authenticated
  USING ((SELECT private.is_active()) AND EXISTS (SELECT 1 FROM public.workouts w
    WHERE w.id::text = workout_id::text AND w.student_id::text = (SELECT auth.uid())::text));

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['progress_entries','evolution_photos','workout_logs','anamnesis'] LOOP
    EXECUTE format('CREATE POLICY cadu_owner_all ON public.%I FOR ALL TO authenticated USING ((SELECT private.is_active()) AND student_id::text = (SELECT auth.uid())::text) WITH CHECK ((SELECT private.is_active()) AND student_id::text = (SELECT auth.uid())::text)', tbl);
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['custom_exercises','muscle_groups','exercise_muscle_groups','exercise_categories'] LOOP
    EXECUTE format('CREATE POLICY cadu_member_read ON public.%I FOR SELECT TO authenticated USING ((SELECT private.is_active()))', tbl);
  END LOOP;
END;
$$;
CREATE POLICY cadu_assessment_read ON public.assessments FOR SELECT TO authenticated
  USING ((SELECT private.is_active()) AND student_id::text = (SELECT auth.uid())::text);

-- The agenda also stores invoices/settings. Students cannot modify those records.
CREATE POLICY cadu_agenda_read ON public.agenda_events FOR SELECT TO authenticated
  USING ((SELECT private.is_active()) AND
    (student_id::text = (SELECT auth.uid())::text OR type IN ('trainer_payment_settings','media_storage')));
CREATE POLICY cadu_agenda_student_insert ON public.agenda_events FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_active()) AND student_id::text = (SELECT auth.uid())::text
    AND type IN ('evolution_photo','student_file','trainer_notification'));
CREATE POLICY cadu_agenda_student_update ON public.agenda_events FOR UPDATE TO authenticated
  USING ((SELECT private.is_active()) AND student_id::text = (SELECT auth.uid())::text
    AND type IN ('evolution_photo','student_file'))
  WITH CHECK ((SELECT private.is_active()) AND student_id::text = (SELECT auth.uid())::text
    AND type IN ('evolution_photo','student_file'));
CREATE POLICY cadu_agenda_student_delete ON public.agenda_events FOR DELETE TO authenticated
  USING ((SELECT private.is_active()) AND student_id::text = (SELECT auth.uid())::text
    AND type IN ('evolution_photo','student_file'));
CREATE POLICY cadu_subscription_owner ON public.push_subscriptions FOR ALL TO authenticated
  USING ((SELECT private.is_active()) AND user_id::text = (SELECT auth.uid())::text)
  WITH CHECK ((SELECT private.is_active()) AND user_id::text = (SELECT auth.uid())::text);

CREATE OR REPLACE FUNCTION private.check_push_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Serialize per-user checks so simultaneous devices cannot evade the cap.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  IF jsonb_typeof(NEW.subscription) <> 'object' OR
      length(COALESCE(NEW.subscription->>'endpoint','')) NOT BETWEEN 10 AND 2048 OR
      (NEW.subscription->>'endpoint') !~ '^https://' OR
      length(NEW.subscription::text) > 8192 THEN
    RAISE EXCEPTION 'Invalid push subscription' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.user_id=NEW.user_id
    AND p.subscription->>'endpoint'=NEW.subscription->>'endpoint'
    AND p.id::text IS DISTINCT FROM NEW.id::text) THEN
    RAISE EXCEPTION 'Subscription endpoint already registered' USING ERRCODE='23505';
  END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM public.push_subscriptions WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Subscription device limit reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.check_push_subscription() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS cadu_check_push_subscription ON public.push_subscriptions;
CREATE TRIGGER cadu_check_push_subscription BEFORE INSERT OR UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.check_push_subscription();

-- Private buckets: object keys remain stable; clients obtain short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('exercise-videos', 'exercise-videos', false, 104857600, ARRAY['video/mp4','video/webm','video/quicktime','image/jpeg','image/png','image/webp']),
  ('evolution-photos', 'evolution-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('arquivos-alunos', 'arquivos-alunos', false, 20971520, ARRAY['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/msword','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','video/mp4','video/quicktime'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public Select exercise-videos" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert exercise-videos" ON storage.objects;
DROP POLICY IF EXISTS "Public Update exercise-videos" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete exercise-videos" ON storage.objects;

CREATE OR REPLACE FUNCTION private.can_read_media(bucket TEXT, object_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_active() AND (private.is_admin() OR bucket = 'exercise-videos' OR
    (bucket IN ('evolution-photos','arquivos-alunos') AND split_part(object_name,'/',1) = auth.uid()::text));
$$;
CREATE OR REPLACE FUNCTION private.can_write_media(bucket TEXT, object_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_active() AND (private.is_admin() OR
    (bucket IN ('evolution-photos','arquivos-alunos') AND split_part(object_name,'/',1) = auth.uid()::text));
$$;
REVOKE ALL ON FUNCTION private.can_read_media(TEXT,TEXT), private.can_write_media(TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_media(TEXT,TEXT), private.can_write_media(TEXT,TEXT) TO authenticated, service_role;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'cadu_%' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END;
$$;
-- Restrictive guards prevent unknown legacy permissive policies from reopening these buckets.
-- Other applications' buckets are unaffected.
CREATE POLICY cadu_guard_read ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (bucket_id NOT IN ('exercise-videos','evolution-photos','arquivos-alunos') OR
    (auth.role() = 'authenticated' AND private.can_read_media(bucket_id, name)));
CREATE POLICY cadu_guard_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (bucket_id NOT IN ('exercise-videos','evolution-photos','arquivos-alunos') OR
    (auth.role() = 'authenticated' AND private.can_write_media(bucket_id, name)));
CREATE POLICY cadu_guard_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (bucket_id NOT IN ('exercise-videos','evolution-photos','arquivos-alunos') OR
    (auth.role() = 'authenticated' AND private.can_write_media(bucket_id, name)))
  WITH CHECK (bucket_id NOT IN ('exercise-videos','evolution-photos','arquivos-alunos') OR
    (auth.role() = 'authenticated' AND private.can_write_media(bucket_id, name)));
CREATE POLICY cadu_guard_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (bucket_id NOT IN ('exercise-videos','evolution-photos','arquivos-alunos') OR
    (auth.role() = 'authenticated' AND private.can_write_media(bucket_id, name)));
CREATE POLICY cadu_media_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('exercise-videos','evolution-photos','arquivos-alunos') AND private.can_read_media(bucket_id,name));
CREATE POLICY cadu_media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('exercise-videos','evolution-photos','arquivos-alunos') AND private.can_write_media(bucket_id,name));
CREATE POLICY cadu_media_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('exercise-videos','evolution-photos','arquivos-alunos') AND private.can_write_media(bucket_id,name))
  WITH CHECK (bucket_id IN ('exercise-videos','evolution-photos','arquivos-alunos') AND private.can_write_media(bucket_id,name));
CREATE POLICY cadu_media_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('exercise-videos','evolution-photos','arquivos-alunos') AND private.can_write_media(bucket_id,name));

CREATE TABLE IF NOT EXISTS private.api_rate_limits (
  user_id UUID NOT NULL, action TEXT NOT NULL, window_start TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL, PRIMARY KEY (user_id, action)
);
REVOKE ALL ON private.api_rate_limits FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(p_user_id UUID, p_action TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result INTEGER; max_attempts INTEGER;
BEGIN
  max_attempts := CASE p_action WHEN 'notification' THEN 10 WHEN 'upload' THEN 20 WHEN 'create-user' THEN 10 ELSE 0 END;
  IF max_attempts = 0 THEN RETURN false; END IF;
  INSERT INTO private.api_rate_limits (user_id, action, window_start, attempts)
  VALUES (p_user_id, p_action, clock_timestamp(), 1)
  ON CONFLICT (user_id, action) DO UPDATE SET
    attempts = CASE WHEN private.api_rate_limits.window_start < clock_timestamp() - interval '1 minute'
      THEN 1 ELSE private.api_rate_limits.attempts + 1 END,
    window_start = CASE WHEN private.api_rate_limits.window_start < clock_timestamp() - interval '1 minute'
      THEN clock_timestamp() ELSE private.api_rate_limits.window_start END
  RETURNING attempts INTO result;
  RETURN result <= max_attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(UUID,TEXT) TO service_role;

-- Every deletion below is one database transaction. No names are used as identities.
CREATE OR REPLACE FUNCTION public.delete_workout_assignment(p_workout_id TEXT, p_student_id TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_student TEXT;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
  END IF;
  SELECT w.student_id::text INTO target_student FROM public.workouts w
    WHERE w.id::text=p_workout_id AND (p_student_id IS NULL OR w.student_id::text=p_student_id)
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.exercises WHERE workout_id::text=p_workout_id;
  DELETE FROM public.workouts WHERE id::text=p_workout_id AND student_id::text=target_student;
  DELETE FROM public.agenda_events WHERE type='assigned_routine' AND id::text=p_workout_id
    AND student_id::text=target_student;
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.delete_admin_routine(p_routine_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE assignment_ids TEXT[];
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.admin_routines WHERE id::text=p_routine_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT COALESCE(array_agg(id::text), ARRAY[]::text[]) INTO assignment_ids
    FROM public.workouts WHERE routine_id::text=p_routine_id;
  DELETE FROM public.exercises WHERE workout_id::text=ANY(assignment_ids);
  DELETE FROM public.workouts WHERE routine_id::text=p_routine_id;
  DELETE FROM public.admin_exercises WHERE routine_id::text=p_routine_id;
  DELETE FROM public.admin_routines WHERE id::text=p_routine_id;
  DELETE FROM public.agenda_events WHERE type='assigned_routine'
    AND (id::text=p_routine_id OR id::text=ANY(assignment_ids));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_workout_assignment(TEXT,TEXT), public.delete_admin_routine(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_workout_assignment(TEXT,TEXT), public.delete_admin_routine(TEXT) TO authenticated;

-- Serial category inserts require sequence privileges, but table RLS still limits writes to admins.
DO $$
DECLARE tbl TEXT; seq TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['muscle_groups','exercise_muscle_groups','exercise_categories'] LOOP
    seq := pg_get_serial_sequence('public.' || tbl, 'id');
    IF seq IS NOT NULL THEN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', seq); END IF;
  END LOOP;
END;
$$;

COMMIT;
