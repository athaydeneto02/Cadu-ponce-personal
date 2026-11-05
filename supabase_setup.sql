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

-- Match the GIF format accepted by the exercise editor, preserving access and size limits.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
WHERE id = 'exercise-videos'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('image/gif' = ANY(allowed_mime_types));

-- The completion log and each administrator's inbox entry commit together.
CREATE TABLE IF NOT EXISTS public.workout_completion_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_log_id TEXT NOT NULL REFERENCES public.workout_logs(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  routine_name TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  push_sent_at TIMESTAMPTZ,
  UNIQUE(workout_log_id,recipient_id)
);
CREATE INDEX IF NOT EXISTS workout_completion_inbox_idx
  ON public.workout_completion_notifications(recipient_id,completed_at DESC);
CREATE INDEX IF NOT EXISTS workout_completion_student_idx
  ON public.workout_completion_notifications(student_id);
ALTER TABLE public.workout_completion_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_completion_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workout_completion_notifications TO authenticated;
GRANT UPDATE(read_at) ON public.workout_completion_notifications TO authenticated;
GRANT ALL ON public.workout_completion_notifications TO service_role;
DROP POLICY IF EXISTS completion_recipient_read ON public.workout_completion_notifications;
DROP POLICY IF EXISTS completion_recipient_mark_read ON public.workout_completion_notifications;
CREATE POLICY completion_recipient_read ON public.workout_completion_notifications
  FOR SELECT TO authenticated USING (
    (SELECT private.is_admin()) AND recipient_id=(SELECT auth.uid()));
CREATE POLICY completion_recipient_mark_read ON public.workout_completion_notifications
  FOR UPDATE TO authenticated USING (
    (SELECT private.is_admin()) AND recipient_id=(SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_admin()) AND recipient_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.record_workout_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sender_name TEXT; workout_name TEXT;
BEGIN
  SELECT left(coalesce(nullif(btrim(p.name),''),'Aluno'),120) INTO sender_name
  FROM public.profiles p WHERE p.id::text=NEW.student_id::text AND p.role='student' AND p.status='active';
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT left(coalesce(
    (SELECT r.name FROM public.admin_routines r WHERE r.id::text=NEW.routine_id
      AND (NEW.student_id::text=ANY(r.student_ids) OR EXISTS
        (SELECT 1 FROM public.workouts w WHERE w.routine_id::text=r.id::text AND w.student_id::text=NEW.student_id::text)) LIMIT 1),
    (SELECT w.name FROM public.workouts w WHERE w.id::text=NEW.routine_id AND w.student_id::text=NEW.student_id::text LIMIT 1),
    'Treino'),120) INTO workout_name;
  INSERT INTO public.workout_completion_notifications
    (workout_log_id,recipient_id,student_id,student_name,routine_name,completed_at,duration_seconds)
  SELECT NEW.id::text,p.id,NEW.student_id::text::uuid,sender_name,workout_name,
    coalesce(NEW.completed_at,now()),greatest(0,least(coalesce(NEW.duration_seconds,0),2678400))
  FROM public.profiles p WHERE p.role='admin' AND p.status='active'
  ON CONFLICT(workout_log_id,recipient_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_workout_completion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS cadu_workout_completion ON public.workout_logs;
CREATE TRIGGER cadu_workout_completion AFTER INSERT ON public.workout_logs
FOR EACH ROW EXECUTE FUNCTION private.record_workout_completion();

-- Preserve existing completions in the new inbox without ever pushing history.
INSERT INTO public.workout_completion_notifications
  (workout_log_id,recipient_id,student_id,student_name,routine_name,completed_at,duration_seconds,push_sent_at)
SELECT l.id::text,a.id,s.id,left(coalesce(nullif(btrim(s.name),''),'Aluno'),120),
  left(coalesce(nullif(l.routine_name,''),'Treino'),120),coalesce(l.completed_at,now()),
  greatest(0,least(coalesce(l.duration_seconds,0),2678400)),now()
FROM public.workout_logs l JOIN public.profiles s ON s.id::text=l.student_id::text AND s.role='student'
CROSS JOIN public.profiles a WHERE a.role='admin' AND a.status='active'
ON CONFLICT(workout_log_id,recipient_id) DO NOTHING;

-- Old clients can still save a log; they cannot manufacture trainer messages.
DROP POLICY IF EXISTS cadu_agenda_student_insert ON public.agenda_events;
CREATE POLICY cadu_agenda_student_insert ON public.agenda_events FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_active()) AND student_id=(SELECT auth.uid())::text
  AND type IN ('evolution_photo','student_file'));

CREATE TABLE IF NOT EXISTS private.workout_completion_push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.workout_completion_notifications(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  terminal BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(notification_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS completion_push_subscription_idx
  ON private.workout_completion_push_deliveries(subscription_id);
ALTER TABLE private.workout_completion_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workout_completion_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.workout_completion_push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_workout_completion_push(p_log_id TEXT,p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE deliveries JSONB; skipped INTEGER;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workout_logs l JOIN public.profiles owner ON owner.id::text=l.student_id::text
    JOIN public.profiles actor ON actor.id=p_actor_id WHERE l.id::text=p_log_id
    AND owner.role='student' AND owner.status='active' AND actor.status='active'
    AND (actor.id::text=l.student_id::text OR actor.role='admin')) THEN
    RAISE EXCEPTION 'Completion access denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO private.workout_completion_push_deliveries(notification_id,subscription_id)
  SELECT n.id,s.id FROM public.workout_completion_notifications n
  JOIN public.profiles a ON a.id=n.recipient_id AND a.role='admin' AND a.status='active'
  JOIN public.push_subscriptions s ON s.user_id=a.id
  WHERE n.workout_log_id=p_log_id AND n.push_sent_at IS NULL
  ON CONFLICT(notification_id,subscription_id) DO NOTHING;
  WITH ready AS (
    SELECT d.id FROM private.workout_completion_push_deliveries d
    JOIN public.workout_completion_notifications n ON n.id=d.notification_id
    JOIN public.profiles a ON a.id=n.recipient_id AND a.role='admin' AND a.status='active'
    WHERE n.workout_log_id=p_log_id AND n.push_sent_at IS NULL AND d.sent_at IS NULL AND NOT d.terminal
      AND (d.claimed_at IS NULL OR d.claimed_at<clock_timestamp()-interval '60 seconds')
    ORDER BY d.id LIMIT 20 FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE private.workout_completion_push_deliveries d SET claim_token=gen_random_uuid(),
      claimed_at=clock_timestamp(),attempts=d.attempts+1 FROM ready WHERE d.id=ready.id RETURNING d.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('delivery_id',d.id,'claim_token',d.claim_token,
    'notification_id',n.id,'subscription_id',s.id,'subscription',s.subscription,
    'student_name',n.student_name,'routine_name',n.routine_name)),'[]'::jsonb) INTO deliveries
  FROM claimed d JOIN public.workout_completion_notifications n ON n.id=d.notification_id
  JOIN public.push_subscriptions s ON s.id=d.subscription_id;
  SELECT count(*) INTO skipped FROM public.workout_completion_notifications n
  WHERE n.workout_log_id=p_log_id AND (n.push_sent_at IS NOT NULL OR NOT EXISTS
    (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id=n.recipient_id));
  RETURN jsonb_build_object('deliveries',deliveries,'skippedCount',skipped);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_workout_completion_push(p_delivery_id UUID,p_claim_token UUID,p_success BOOLEAN,p_terminal BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE notification UUID;
BEGIN
  SELECT notification_id INTO notification FROM private.workout_completion_push_deliveries WHERE id=p_delivery_id;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Serialize acknowledgements for the same inbox row, including different devices.
  PERFORM 1 FROM public.workout_completion_notifications WHERE id=notification FOR NO KEY UPDATE;
  UPDATE private.workout_completion_push_deliveries SET
    sent_at=CASE WHEN p_success THEN clock_timestamp() ELSE sent_at END,
    terminal=p_terminal,claimed_at=NULL,claim_token=NULL
  WHERE id=p_delivery_id AND claim_token=p_claim_token AND sent_at IS NULL
  RETURNING notification_id INTO notification;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.workout_completion_push_deliveries d
    WHERE d.notification_id=notification AND d.sent_at IS NULL AND NOT d.terminal) THEN
    UPDATE public.workout_completion_notifications SET push_sent_at=clock_timestamp() WHERE id=notification;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.workout_completion_push_pending(p_log_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM private.workout_completion_push_deliveries d
    JOIN public.workout_completion_notifications n ON n.id=d.notification_id
    JOIN public.profiles p ON p.id=n.recipient_id AND p.role='admin' AND p.status='active'
    WHERE n.workout_log_id=p_log_id AND n.push_sent_at IS NULL AND d.sent_at IS NULL AND NOT d.terminal);
$$;
REVOKE ALL ON FUNCTION public.claim_workout_completion_push(TEXT,UUID),
  public.finish_workout_completion_push(UUID,UUID,BOOLEAN,BOOLEAN),public.workout_completion_push_pending(TEXT)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workout_completion_push(TEXT,UUID),
  public.finish_workout_completion_push(UUID,UUID,BOOLEAN,BOOLEAN),public.workout_completion_push_pending(TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(p_user_id UUID,p_action TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result INTEGER; max_attempts INTEGER;
BEGIN
  max_attempts:=CASE p_action WHEN 'notification' THEN 10 WHEN 'upload' THEN 20
    WHEN 'create-user' THEN 10 WHEN 'workout-completed' THEN 30 ELSE 0 END;
  IF max_attempts=0 THEN RETURN false; END IF;
  INSERT INTO private.api_rate_limits(user_id,action,window_start,attempts)
  VALUES(p_user_id,p_action,clock_timestamp(),1)
  ON CONFLICT(user_id,action) DO UPDATE SET
    attempts=CASE WHEN private.api_rate_limits.window_start<clock_timestamp()-interval '1 minute'
      THEN 1 ELSE private.api_rate_limits.attempts+1 END,
    window_start=CASE WHEN private.api_rate_limits.window_start<clock_timestamp()-interval '1 minute'
      THEN clock_timestamp() ELSE private.api_rate_limits.window_start END
  RETURNING attempts INTO result;
  RETURN result<=max_attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(UUID,TEXT) TO service_role;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
    AND schemaname='public' AND tablename='workout_completion_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workout_completion_notifications;
  END IF;
END $$;

BEGIN;

ALTER TABLE public.admin_routines ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.admin_routines ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS video_file_url TEXT;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS combined_with_next BOOLEAN;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS combined_group TEXT;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION private.prescription_visible(p_settings JSONB,p_start TEXT,p_end TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT (coalesce(p_settings->>'hideBeforeStart','false')<>'true' OR nullif(p_start,'') IS NULL OR p_start<=to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD'))
    AND (coalesce(p_settings->>'hideAfterEnd','false')<>'true' OR nullif(p_end,'') IS NULL OR p_end>=to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD'));
$$;
REVOKE ALL ON FUNCTION private.prescription_visible(JSONB,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.prescription_visible(JSONB,TEXT,TEXT) TO authenticated;
DROP POLICY IF EXISTS cadu_routine_read ON public.admin_routines;
CREATE POLICY cadu_routine_read ON public.admin_routines FOR SELECT TO authenticated
  USING((SELECT private.is_active()) AND (SELECT auth.uid())::text=ANY(student_ids::text[]) AND private.prescription_visible(settings,start_date,end_date));
DROP POLICY IF EXISTS cadu_workout_read ON public.workouts;
CREATE POLICY cadu_workout_read ON public.workouts FOR SELECT TO authenticated
  USING((SELECT private.is_active()) AND student_id::text=(SELECT auth.uid())::text
    AND private.prescription_visible(settings,settings->>'startDate',settings->>'endDate')
    AND (routine_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_routines r WHERE r.id=workouts.routine_id)));

-- All prescription mutations go through versioned, atomic operations. Old
-- clients fail visibly instead of writing a half-prescription or stale children.
REVOKE INSERT,UPDATE,DELETE ON public.admin_routines,public.admin_exercises,public.workouts,public.exercises FROM authenticated;

CREATE OR REPLACE FUNCTION private.write_prescription(p_kind TEXT,p_payload JSONB,p_expected_version BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent_table TEXT; child_table TEXT; parent_column TEXT; parent_columns TEXT; child_columns TEXT;
  row_id TEXT:=p_payload->>'id'; current_version BIGINT; next_version BIGINT;
  child JSONB; child_id TEXT; child_ids TEXT[]:='{}'; result JSONB; parent_data JSONB; update_columns TEXT;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('routine','workout') OR coalesce(length(row_id),0) NOT BETWEEN 1 AND 200
    OR length(p_payload::text)>2097152
    OR coalesce(length(btrim(p_payload->>'name')),0) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_payload->'exercises') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'exercises')>300 THEN
    RAISE EXCEPTION 'Invalid prescription' USING ERRCODE='22023';
  END IF;
  parent_table:=CASE p_kind WHEN 'routine' THEN 'admin_routines' ELSE 'workouts' END;
  child_table:=CASE p_kind WHEN 'routine' THEN 'admin_exercises' ELSE 'exercises' END;
  parent_column:=CASE p_kind WHEN 'routine' THEN 'routine_id' ELSE 'workout_id' END;
  PERFORM pg_advisory_xact_lock(hashtextextended(parent_table||':'||row_id,0));
  EXECUTE format('SELECT version FROM public.%I WHERE id::text=$1 FOR UPDATE',parent_table) INTO current_version USING row_id;
  IF current_version IS NOT NULL AND p_expected_version IS DISTINCT FROM current_version
    OR current_version IS NULL AND p_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'Este treino mudou ou foi excluído. Recarregue antes de salvar.' USING ERRCODE='40001';
  END IF;
  next_version:=coalesce(current_version,0)+1;
  parent_data:=p_payload-'exercises'||jsonb_build_object('version',next_version,'settings',coalesce(p_payload->'settings','{}'));
  IF coalesce(p_payload->'settings'->>'kind','strength') NOT IN ('strength','aerobic','extra') THEN
    RAISE EXCEPTION 'Invalid workout category' USING ERRCODE='22023';
  END IF;
  IF nullif(p_payload->>'start_date','') IS NOT NULL THEN PERFORM (p_payload->>'start_date')::date; END IF;
  IF nullif(p_payload->>'end_date','') IS NOT NULL THEN PERFORM (p_payload->>'end_date')::date; END IF;
  IF p_payload->>'end_date'<p_payload->>'start_date' THEN RAISE EXCEPTION 'A data final deve ser posterior à inicial.' USING ERRCODE='22023'; END IF;
  IF p_kind='routine' THEN
    IF jsonb_typeof(p_payload->'student_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'student_ids')>1000 THEN
      RAISE EXCEPTION 'Invalid student list' USING ERRCODE='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'student_ids') s(id)
      WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id::text=s.id AND p.role='student')) THEN
      RAISE EXCEPTION 'Aluno não encontrado.' USING ERRCODE='22023';
    END IF;
    parent_columns:='id,name,goal,difficulty,day_of_week,muscle_group,general_notes,notes,student_ids,student_names,start_date,end_date,routine_group_name,settings,version';
    parent_data:=parent_data||jsonb_build_object('student_names',coalesce((SELECT jsonb_agg(p.name ORDER BY s.ord)
      FROM jsonb_array_elements_text(p_payload->'student_ids') WITH ORDINALITY s(id,ord)
      JOIN public.profiles p ON p.id::text=s.id),'[]'));
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id::text=p_payload->>'student_id' AND p.role='student') THEN
      RAISE EXCEPTION 'Aluno não encontrado.' USING ERRCODE='22023';
    END IF;
    IF nullif(p_payload->>'routine_id','') IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('assignment:'||(p_payload->>'routine_id')||':'||(p_payload->>'student_id'),0));
      IF EXISTS(SELECT 1 FROM public.workouts w WHERE w.routine_id=p_payload->>'routine_id'
        AND w.student_id::text=p_payload->>'student_id' AND w.id::text<>row_id) THEN
        RAISE EXCEPTION 'Este aluno já possui esta rotina.' USING ERRCODE='23505';
      END IF;
    END IF;
    parent_columns:='id,name,description,student_id,routine_id,settings,version';
  END IF;
  SELECT string_agg(format('%I=EXCLUDED.%I',c,c),',') INTO update_columns FROM unnest(string_to_array(parent_columns,',')) c WHERE c<>'id';
  EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1) ON CONFLICT(id) DO UPDATE SET %3$s',parent_table,parent_columns,update_columns) USING parent_data;
  child_columns:=CASE p_kind WHEN 'routine' THEN
    'id,routine_id,name,sets,reps,rest,notes,video_url,video_file_url,combined_with_next,combined_group,prescribed_loads,sort_order' ELSE
    'id,workout_id,name,sets,reps,rest,notes,current_load,video_url,video_file_url,combined_with_next,combined_group,prescribed_loads,sort_order' END;
  FOR child IN SELECT value FROM jsonb_array_elements(p_payload->'exercises') LOOP
    child_id:=child->>'id';
    IF coalesce(length(child_id),0) NOT BETWEEN 1 AND 200 OR child_id=ANY(child_ids)
      OR coalesce(length(btrim(child->>'name')),0) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Invalid or duplicate exercise' USING ERRCODE='22023';
    END IF;
    EXECUTE format('SELECT to_jsonb(e) FROM public.%I e WHERE id::text=$1 AND %I::text<>$2',child_table,parent_column) INTO result USING child_id,row_id;
    IF result IS NOT NULL THEN RAISE EXCEPTION 'Exercise belongs to another prescription' USING ERRCODE='42501'; END IF;
    child:=child||jsonb_build_object(parent_column,row_id,'sort_order',cardinality(child_ids));
    child_ids:=array_append(child_ids,child_id);
    SELECT string_agg(format('%I=EXCLUDED.%I',c,c),',') INTO update_columns FROM unnest(string_to_array(child_columns,',')) c WHERE c<>'id';
    EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1) ON CONFLICT(id) DO UPDATE SET %3$s',child_table,child_columns,update_columns) USING child;
  END LOOP;
  EXECUTE format('DELETE FROM public.%I WHERE %I::text=$1 AND NOT(id::text=ANY($2))',child_table,parent_column) USING row_id,child_ids;
  EXECUTE format('SELECT to_jsonb(p)||jsonb_build_object(''exercises'',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY sort_order,id) FROM public.%I e WHERE e.%I::text=p.id::text),''[]'')) FROM public.%I p WHERE p.id::text=$1',child_table,parent_column,parent_table) INTO result USING row_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.write_prescription(TEXT,JSONB,BIGINT) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sync_routine_assignments(p_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.admin_routines; student TEXT; w public.workouts; payload JSONB; child_rows JSONB; assigned_ids TEXT[];
BEGIN
  SELECT * INTO STRICT r FROM public.admin_routines WHERE id=p_id FOR UPDATE;
  assigned_ids:=coalesce(r.student_ids,'{}');
  -- Only explicit routine links identify copies; no matching by display name.
  DELETE FROM public.exercises e WHERE EXISTS(SELECT 1 FROM public.workouts target WHERE target.id::text=e.workout_id::text
    AND target.routine_id=p_id AND NOT(target.student_id::text=ANY(assigned_ids)));
  DELETE FROM public.workouts WHERE routine_id=p_id AND NOT(student_id::text=ANY(assigned_ids));
  FOR student IN SELECT DISTINCT unnest(assigned_ids) LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('assignment:'||p_id||':'||student,0));
    SELECT * INTO w FROM public.workouts WHERE routine_id=p_id AND student_id::text=student ORDER BY created_at,id LIMIT 1 FOR UPDATE;
    SELECT coalesce(jsonb_agg((to_jsonb(e)-'id'-'routine_id')||jsonb_build_object('id',
      coalesce((SELECT ex.id::text FROM public.exercises ex WHERE ex.workout_id::text=w.id::text AND ex.sort_order=e.sort_order ORDER BY ex.id LIMIT 1),gen_random_uuid()::text),
      'current_load',0) ORDER BY e.sort_order,e.id),'[]') INTO child_rows FROM public.admin_exercises e WHERE e.routine_id=p_id;
    payload:=jsonb_build_object('id',coalesce(w.id::text,gen_random_uuid()::text),'name',r.name,
      'description',coalesce(r.general_notes,r.notes),'student_id',student,'routine_id',p_id,'exercises',child_rows,
      'settings',r.settings||jsonb_build_object('startDate',r.start_date,'endDate',r.end_date));
    -- Legacy duplicate copies remain preserved; choose the canonical row. New
    -- writes cannot create duplicates. Unassignment removes every linked copy.
    IF EXISTS(SELECT 1 FROM public.workouts x WHERE x.routine_id=p_id AND x.student_id::text=student AND x.id::text<>w.id::text) THEN
      CONTINUE;
    END IF;
    PERFORM private.write_prescription('workout',payload,w.version);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_routine_assignments(TEXT) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_admin_routine(p_payload JSONB,p_expected_version BIGINT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result JSONB;
BEGIN
  result:=private.write_prescription('routine',p_payload,p_expected_version);
  PERFORM private.sync_routine_assignments(p_payload->>'id');
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.save_workout(p_payload JSONB,p_expected_version BIGINT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN private.write_prescription('workout',p_payload,p_expected_version); END;
$$;

CREATE OR REPLACE FUNCTION public.assign_routine_to_student(p_routine_id TEXT,p_student_id TEXT,p_remove BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.admin_routines; row_json JSONB;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT r FROM public.admin_routines WHERE id=p_routine_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id::text=p_student_id AND role='student') THEN RAISE EXCEPTION 'Aluno não encontrado.'; END IF;
  IF p_remove THEN r.student_ids:=array_remove(coalesce(r.student_ids,'{}'),p_student_id);
  ELSIF NOT(p_student_id=ANY(coalesce(r.student_ids,'{}'))) THEN r.student_ids:=array_append(coalesce(r.student_ids,'{}'),p_student_id);
  END IF;
  UPDATE public.admin_routines SET student_ids=r.student_ids,
    student_names=ARRAY(SELECT coalesce(p.name,'Aluno') FROM unnest(r.student_ids) WITH ORDINALITY s(id,ord) JOIN public.profiles p ON p.id::text=s.id ORDER BY ord),
    version=version+1 WHERE id=p_routine_id;
  PERFORM private.sync_routine_assignments(p_routine_id);
  SELECT to_jsonb(w)||jsonb_build_object('exercises',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY sort_order,id) FROM public.exercises e WHERE e.workout_id::text=w.id::text),'[]')) INTO row_json
    FROM public.workouts w WHERE routine_id=p_routine_id AND student_id::text=p_student_id ORDER BY created_at,id LIMIT 1;
  RETURN coalesce(row_json,'{}');
END;
$$;

-- A page contains complete parent/children snapshots from one SQL statement.
-- Client pagination cannot mistake a truncated child list for an empty workout.
CREATE OR REPLACE FUNCTION public.read_prescriptions(p_kind TEXT,p_offset INTEGER DEFAULT 0,p_limit INTEGER DEFAULT 100,p_student_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result JSONB;
BEGIN
  IF p_kind='routine' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY row_data->>'id'),'[]') INTO result FROM (
      SELECT to_jsonb(r)||jsonb_build_object('exercises',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sort_order,e.id)
        FROM public.admin_exercises e WHERE e.routine_id=r.id),'[]')) row_data FROM public.admin_routines r ORDER BY r.id
        OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),100)) q;
  ELSIF p_kind='workout' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY row_data->>'id'),'[]') INTO result FROM (
      SELECT to_jsonb(w)||jsonb_build_object('exercises',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sort_order,e.id)
        FROM public.exercises e WHERE e.workout_id::text=w.id::text),'[]')) row_data FROM public.workouts w
      WHERE p_student_id IS NULL OR w.student_id::text=p_student_id ORDER BY w.id
        OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),100)) q;
  ELSE RAISE EXCEPTION 'Invalid prescription type'; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_admin_routine(JSONB,BIGINT),public.save_workout(JSONB,BIGINT),
  public.assign_routine_to_student(TEXT,TEXT,BOOLEAN),public.read_prescriptions(TEXT,INTEGER,INTEGER,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_admin_routine(JSONB,BIGINT),public.save_workout(JSONB,BIGINT),
  public.assign_routine_to_student(TEXT,TEXT,BOOLEAN),public.read_prescriptions(TEXT,INTEGER,INTEGER,TEXT) TO authenticated;

CREATE INDEX IF NOT EXISTS exercises_workout_id_idx ON public.exercises(workout_id);
CREATE INDEX IF NOT EXISTS admin_exercises_routine_id_idx ON public.admin_exercises(routine_id);
CREATE INDEX IF NOT EXISTS workouts_student_id_idx ON public.workouts(student_id);
CREATE INDEX IF NOT EXISTS workouts_routine_student_idx ON public.workouts(routine_id,student_id);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workouts WHERE routine_id IS NOT NULL GROUP BY routine_id,student_id HAVING count(*)>1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS workouts_unique_assignment_idx ON public.workouts(routine_id,student_id) WHERE routine_id IS NOT NULL;
  ELSE
    RAISE NOTICE 'Legacy duplicate assignments preserved; reviewed consolidation is required before adding the uniqueness index.';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS progress_entries_student_id_idx ON public.progress_entries(student_id);
CREATE INDEX IF NOT EXISTS evolution_photos_student_id_idx ON public.evolution_photos(student_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS workout_logs_student_id_idx ON public.workout_logs(student_id);

CREATE TABLE IF NOT EXISTS private.deleted_evolution_photos (
  photo_id TEXT PRIMARY KEY,student_id UUID NOT NULL,deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE private.deleted_evolution_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.deleted_evolution_photos FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.prevent_deleted_photo_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('photo:'||NEW.id::text,0));
  IF EXISTS(SELECT 1 FROM private.deleted_evolution_photos WHERE photo_id=NEW.id::text) THEN
    RAISE EXCEPTION 'Esta foto foi excluída. Selecione o arquivo novamente para criar uma nova foto.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_deleted_photo_write() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS cadu_deleted_photo_guard ON public.evolution_photos;
CREATE TRIGGER cadu_deleted_photo_guard BEFORE INSERT OR UPDATE ON public.evolution_photos FOR EACH ROW EXECUTE FUNCTION private.prevent_deleted_photo_write();
DROP TRIGGER IF EXISTS cadu_deleted_legacy_photo_guard ON public.agenda_events;
CREATE TRIGGER cadu_deleted_legacy_photo_guard BEFORE INSERT OR UPDATE ON public.agenda_events
  FOR EACH ROW WHEN(NEW.type='evolution_photo') EXECUTE FUNCTION private.prevent_deleted_photo_write();
CREATE OR REPLACE FUNCTION public.delete_evolution_photo(p_photo_id TEXT,p_student_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actual_owner TEXT; refs JSONB;
BEGIN
  IF NOT private.is_active() OR NOT(private.is_admin() OR p_student_id=auth.uid()) THEN RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('photo:'||p_photo_id,0));
  SELECT student_id::text INTO actual_owner FROM public.evolution_photos WHERE id::text=p_photo_id FOR UPDATE;
  IF actual_owner IS NOT NULL AND actual_owner<>p_student_id::text THEN RAISE EXCEPTION 'Photo owner mismatch' USING ERRCODE='42501'; END IF;
  SELECT student_id::text INTO actual_owner FROM public.agenda_events WHERE id::text=p_photo_id AND type='evolution_photo' FOR UPDATE;
  IF actual_owner IS NOT NULL AND actual_owner<>p_student_id::text THEN RAISE EXCEPTION 'Photo owner mismatch' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(photo_url),'[]') INTO refs FROM public.evolution_photos WHERE id::text=p_photo_id;
  INSERT INTO private.deleted_evolution_photos(photo_id,student_id) VALUES(p_photo_id,p_student_id) ON CONFLICT(photo_id) DO NOTHING;
  DELETE FROM public.evolution_photos WHERE id::text=p_photo_id;
  DELETE FROM public.agenda_events WHERE id::text=p_photo_id AND type='evolution_photo';
  RETURN refs;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_evolution_photo(TEXT,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_evolution_photo(TEXT,UUID) TO authenticated;
REVOKE DELETE ON public.evolution_photos FROM authenticated;
DROP POLICY IF EXISTS cadu_photo_delete_via_rpc ON public.agenda_events;
CREATE POLICY cadu_photo_delete_via_rpc ON public.agenda_events AS RESTRICTIVE FOR DELETE TO authenticated
  USING(type IS DISTINCT FROM 'evolution_photo');

-- Student responses preserve the administrator's question set. No student may
-- create, delete, or replace an administrator's form with arbitrary metadata.
DROP POLICY IF EXISTS cadu_owner_all ON public.anamnesis;
DROP POLICY IF EXISTS cadu_anamnesis_owner_read ON public.anamnesis;
CREATE POLICY cadu_anamnesis_owner_read ON public.anamnesis FOR SELECT TO authenticated
  USING((SELECT private.is_active()) AND student_id::text=(SELECT auth.uid())::text);
REVOKE INSERT,UPDATE ON public.anamnesis FROM authenticated;
CREATE OR REPLACE FUNCTION public.save_anamnesis(p_payload JSONB,p_expected_version BIGINT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_row public.anamnesis; data JSONB:=p_payload->'responses'; result JSONB;
BEGIN
  IF NOT private.is_active() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('anamnesis:'||(p_payload->>'id'),0));
  SELECT * INTO old_row FROM public.anamnesis WHERE id=p_payload->>'id' FOR UPDATE;
  IF old_row.id IS NOT NULL AND old_row.version IS DISTINCT FROM p_expected_version OR old_row.id IS NULL AND p_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'Este formulário mudou. Recarregue antes de responder.' USING ERRCODE='40001';
  END IF;
  IF NOT private.is_admin() THEN
    IF old_row.id IS NULL OR old_row.student_id::text<>auth.uid()::text OR (p_payload->>'student_id') IS DISTINCT FROM old_row.student_id::text THEN
      RAISE EXCEPTION 'Form access denied' USING ERRCODE='42501';
    END IF;
    IF data->>'title' IS DISTINCT FROM old_row.responses->>'title' OR (data->>'status') IS DISTINCT FROM 'answered'
      OR (SELECT jsonb_agg(value-'answer' ORDER BY ord) FROM jsonb_array_elements(data->'questions') WITH ORDINALITY q(value,ord)) IS DISTINCT FROM
         (SELECT jsonb_agg(value-'answer' ORDER BY ord) FROM jsonb_array_elements(old_row.responses->'questions') WITH ORDINALITY q(value,ord)) THEN
      RAISE EXCEPTION 'Only answers may change' USING ERRCODE='42501';
    END IF;
  END IF;
  IF jsonb_typeof(data->'questions') IS DISTINCT FROM 'array' OR jsonb_array_length(data->'questions')>100 OR length(data::text)>100000
    OR coalesce(data->>'status','') NOT IN ('pending','answered') OR coalesce(length(btrim(data->>'title')),0) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid form' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.anamnesis(id,student_id,responses,version,updated_at)
    VALUES(p_payload->>'id',p_payload->>'student_id',data,coalesce(old_row.version,0)+1,now())
    ON CONFLICT(id) DO UPDATE SET responses=EXCLUDED.responses,version=EXCLUDED.version,updated_at=EXCLUDED.updated_at RETURNING to_jsonb(anamnesis) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_anamnesis(JSONB,BIGINT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_anamnesis(JSONB,BIGINT) TO authenticated;

DROP POLICY IF EXISTS cadu_feedback_owner_insert ON public.agenda_events;
DROP POLICY IF EXISTS cadu_feedback_owner_update ON public.agenda_events;
DROP POLICY IF EXISTS cadu_feedback_owner_delete ON public.agenda_events;
CREATE POLICY cadu_feedback_owner_insert ON public.agenda_events FOR INSERT TO authenticated
  WITH CHECK((SELECT private.is_active()) AND student_id=(SELECT auth.uid())::text AND type='workout_feedback' AND length(notes)<=16000);
CREATE POLICY cadu_feedback_owner_update ON public.agenda_events FOR UPDATE TO authenticated
  USING((SELECT private.is_active()) AND student_id=(SELECT auth.uid())::text AND type='workout_feedback')
  WITH CHECK((SELECT private.is_active()) AND student_id=(SELECT auth.uid())::text AND type='workout_feedback' AND length(notes)<=16000);
CREATE POLICY cadu_feedback_owner_delete ON public.agenda_events FOR DELETE TO authenticated
  USING((SELECT private.is_active()) AND student_id=(SELECT auth.uid())::text AND type='workout_feedback');

CREATE TABLE IF NOT EXISTS public.student_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,type TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),read_at TIMESTAMPTZ,
  UNIQUE(recipient_id,source_key)
);
CREATE INDEX IF NOT EXISTS student_notifications_recipient_idx ON public.student_notifications(recipient_id,created_at DESC,id);
ALTER TABLE public.student_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE(read_at) ON public.student_notifications TO authenticated;
GRANT ALL ON public.student_notifications TO service_role;
DROP POLICY IF EXISTS student_notification_read ON public.student_notifications;
DROP POLICY IF EXISTS student_notification_mark_read ON public.student_notifications;
CREATE POLICY student_notification_read ON public.student_notifications FOR SELECT TO authenticated
  USING((SELECT private.is_active()) AND recipient_id=(SELECT auth.uid()));
CREATE POLICY student_notification_mark_read ON public.student_notifications FOR UPDATE TO authenticated
  USING((SELECT private.is_active()) AND recipient_id=(SELECT auth.uid())) WITH CHECK(recipient_id=(SELECT auth.uid()));
CREATE OR REPLACE FUNCTION private.notify_student_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE title TEXT; body TEXT; kind TEXT; student UUID;
BEGIN
  student:=NEW.student_id::text::uuid;
  IF TG_TABLE_NAME='workouts' THEN title:='Novo treino disponível'; body:=NEW.name; kind:='workout';
  ELSIF TG_TABLE_NAME='assessments' THEN title:='Nova avaliação física'; body:='Sua avaliação está disponível no aplicativo.'; kind:='assessment';
  ELSE title:='Nova anamnese'; body:=coalesce(NEW.responses->>'title','Responda ao formulário enviado pelo treinador.'); kind:='anamnesis'; END IF;
  INSERT INTO public.student_notifications(recipient_id,source_key,title,body,type) VALUES(student,TG_TABLE_NAME||':'||NEW.id::text,title,left(body,1000),kind)
    ON CONFLICT(recipient_id,source_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_student_record() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS cadu_notify_student_workout ON public.workouts;
CREATE TRIGGER cadu_notify_student_workout AFTER INSERT ON public.workouts FOR EACH ROW EXECUTE FUNCTION private.notify_student_record();
DROP TRIGGER IF EXISTS cadu_notify_student_assessment ON public.assessments;
CREATE TRIGGER cadu_notify_student_assessment AFTER INSERT ON public.assessments FOR EACH ROW EXECUTE FUNCTION private.notify_student_record();
DROP TRIGGER IF EXISTS cadu_notify_student_anamnesis ON public.anamnesis;
CREATE TRIGGER cadu_notify_student_anamnesis AFTER INSERT ON public.anamnesis FOR EACH ROW EXECUTE FUNCTION private.notify_student_record();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(
   SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='student_notifications') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.student_notifications;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.media_reference_in_use(p_reference TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE object_path TEXT; bucket TEXT;
BEGIN
  bucket:=split_part(replace(p_reference,'storage://',''), '/',1);
  object_path:=substring(p_reference FROM length('storage://'||bucket||'/')+1);
  IF NOT private.is_active() OR bucket NOT IN ('evolution-photos','exercise-videos','arquivos-alunos')
    OR NOT(private.is_admin() OR (bucket<>'exercise-videos' AND split_part(object_path,'/',1)=auth.uid()::text)) THEN
    RAISE EXCEPTION 'Media access denied' USING ERRCODE='42501';
  END IF;
  RETURN EXISTS(SELECT 1 FROM public.profiles WHERE photo_url=p_reference OR strpos(coalesce(photo_url,''),bucket||'/'||object_path)>0)
    OR EXISTS(SELECT 1 FROM public.evolution_photos WHERE photo_url=p_reference OR strpos(coalesce(photo_url,''),bucket||'/'||object_path)>0)
    OR EXISTS(SELECT 1 FROM public.custom_exercises WHERE p_reference IN(image,video_url,video_file_url))
    OR EXISTS(SELECT 1 FROM public.admin_exercises WHERE p_reference IN(video_url,video_file_url))
    OR EXISTS(SELECT 1 FROM public.exercises WHERE p_reference IN(video_url,video_file_url))
    OR EXISTS(SELECT 1 FROM public.agenda_events WHERE strpos(coalesce(notes,''),object_path)>0);
END;
$$;
REVOKE ALL ON FUNCTION public.media_reference_in_use(TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.media_reference_in_use(TEXT) TO authenticated;
CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(p_user_id UUID,p_action TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result INTEGER; max_attempts INTEGER;
BEGIN
  max_attempts:=CASE p_action WHEN 'notification' THEN 10 WHEN 'upload' THEN 20
    WHEN 'create-user' THEN 10 WHEN 'workout-completed' THEN 30 WHEN 'client-error' THEN 5 ELSE 0 END;
  IF max_attempts=0 THEN RETURN false; END IF;
  INSERT INTO private.api_rate_limits(user_id,action,window_start,attempts)
  VALUES(p_user_id,p_action,clock_timestamp(),1)
  ON CONFLICT(user_id,action) DO UPDATE SET
    attempts=CASE WHEN private.api_rate_limits.window_start<clock_timestamp()-interval '1 minute'
      THEN 1 ELSE private.api_rate_limits.attempts+1 END,
    window_start=CASE WHEN private.api_rate_limits.window_start<clock_timestamp()-interval '1 minute'
      THEN clock_timestamp() ELSE private.api_rate_limits.window_start END
  RETURNING attempts INTO result;
  RETURN result<=max_attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(UUID,TEXT) TO service_role;
COMMIT;

-- Keep the pre-existing index. Fresh databases that only have the new index
-- retain it, so both upgrade and repeatable-setup paths stay indexed.
DO $$
BEGIN
  IF to_regclass('public.idx_workout_logs_student_id') IS NOT NULL
    AND to_regclass('public.workout_logs_student_id_idx') IS NOT NULL THEN
    IF pg_get_indexdef('public.idx_workout_logs_student_id'::regclass) IS DISTINCT FROM
      replace(pg_get_indexdef('public.workout_logs_student_id_idx'::regclass),
        'workout_logs_student_id_idx','idx_workout_logs_student_id') THEN
      RAISE EXCEPTION 'Index definitions differ; manual review required';
    END IF;
    DROP INDEX public.workout_logs_student_id_idx;
  END IF;
END;
$$;
