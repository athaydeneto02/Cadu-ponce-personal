-- Session revocation and cross-student isolation. No rows/files are removed.
-- Requires Supabase Auth's standard sessions and users tables.
BEGIN;

-- RLS does not constrain DDL/TRUNCATE. Remove inherited Supabase defaults that
-- this application never needs, without changing the explicit CRUD grants.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
DO $$
DECLARE relation RECORD;
BEGIN
  FOR relation IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
    'profiles','admin_routines','admin_exercises','workouts','exercises','progress_entries',
    'evolution_photos','custom_exercises','agenda_events','workout_logs','muscle_groups',
    'exercise_muscle_groups','exercise_categories','assessments','anamnesis','push_subscriptions',
    'workout_completion_notifications','student_notifications') LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM PUBLIC, anon, authenticated',relation.tablename);
  END LOOP;
END $$;

-- Called by server APIs only AFTER auth.getUser has verified the supplied JWT.
-- Do not expose a general session/user existence oracle to client roles.
CREATE OR REPLACE FUNCTION public.server_has_valid_session(p_user_id UUID,p_session_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
    WHERE s.id=p_session_id AND s.user_id=p_user_id
      AND (s.not_after IS NULL OR s.not_after>now())
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND NOT coalesce(u.is_anonymous,false));
$$;
REVOKE ALL ON FUNCTION public.server_has_valid_session(UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_has_valid_session(UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION private.has_valid_session()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.server_has_valid_session((SELECT auth.uid()),
    CASE WHEN (SELECT auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (SELECT auth.jwt()->>'session_id')::uuid ELSE NULL END);
$$;
REVOKE ALL ON FUNCTION private.has_valid_session() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.has_valid_session() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.has_valid_session() AND EXISTS(SELECT 1 FROM public.profiles p
    WHERE p.id=(SELECT auth.uid()) AND p.role='admin' AND p.status='active');
$$;
CREATE OR REPLACE FUNCTION private.is_active()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.has_valid_session() AND EXISTS(SELECT 1 FROM public.profiles p
    WHERE p.id=(SELECT auth.uid()) AND p.status='active');
$$;
REVOKE ALL ON FUNCTION private.is_admin(),private.is_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_admin(),private.is_active() TO authenticated,service_role;
-- An inactive user still needs their own status for the blocked-account screen,
-- but a revoked/banned session cannot read even that profile.
DROP POLICY IF EXISTS cadu_profile_read ON public.profiles;
CREATE POLICY cadu_profile_read ON public.profiles FOR SELECT TO authenticated
  USING((SELECT private.has_valid_session()) AND id=(SELECT auth.uid()));

-- A shared routine contains the roster of every recipient. Row-level access to
-- the template would disclose those names/IDs; students use the scoped RPC below.
DROP POLICY IF EXISTS cadu_routine_read ON public.admin_routines;
CREATE OR REPLACE FUNCTION private.can_read_routine(p_routine_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.is_active() AND EXISTS(SELECT 1 FROM public.admin_routines r
    WHERE r.id::text=p_routine_id AND (private.is_admin() OR (
      (SELECT auth.uid())::text=ANY(r.student_ids::text[])
      AND private.prescription_visible(r.settings,r.start_date,r.end_date))));
$$;
REVOKE ALL ON FUNCTION private.can_read_routine(TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_read_routine(TEXT) TO authenticated,service_role;
DROP POLICY IF EXISTS cadu_admin_exercise_read ON public.admin_exercises;
CREATE POLICY cadu_admin_exercise_read ON public.admin_exercises FOR SELECT TO authenticated
  USING(private.can_read_routine(routine_id::text));
DROP POLICY IF EXISTS cadu_workout_read ON public.workouts;
CREATE POLICY cadu_workout_read ON public.workouts FOR SELECT TO authenticated
  USING((SELECT private.is_active()) AND student_id::text=(SELECT auth.uid())::text
    AND private.prescription_visible(settings,settings->>'startDate',settings->>'endDate')
    AND (routine_id IS NULL OR private.can_read_routine(routine_id::text)));

CREATE OR REPLACE FUNCTION public.read_prescriptions(p_kind TEXT,p_offset INTEGER DEFAULT 0,p_limit INTEGER DEFAULT 100,p_student_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result JSONB; actor_id UUID:=auth.uid(); admin_access BOOLEAN:=private.is_admin();
BEGIN
  IF NOT private.is_active() THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
  IF p_kind='routine' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY row_data->>'id'),'[]') INTO result FROM (
      SELECT (CASE WHEN admin_access THEN to_jsonb(r) ELSE
        (to_jsonb(r)-ARRAY['student_ids','student_names'])||jsonb_build_object(
          'student_ids',jsonb_build_array(actor_id::text),
          'student_names',jsonb_build_array((SELECT p.name FROM public.profiles p WHERE p.id=actor_id))) END)
        ||jsonb_build_object('exercises',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sort_order,e.id)
          FROM public.admin_exercises e WHERE e.routine_id::text=r.id::text),'[]')) row_data
      FROM public.admin_routines r WHERE admin_access OR (
        actor_id::text=ANY(r.student_ids::text[]) AND private.prescription_visible(r.settings,r.start_date,r.end_date))
      ORDER BY r.id OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),100)) q;
  ELSIF p_kind='workout' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY row_data->>'id'),'[]') INTO result FROM (
      SELECT to_jsonb(w)||jsonb_build_object('exercises',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sort_order,e.id)
        FROM public.exercises e WHERE e.workout_id::text=w.id::text),'[]')) row_data
      FROM public.workouts w WHERE (p_student_id IS NULL OR w.student_id::text=p_student_id)
        AND (admin_access OR (w.student_id::text=actor_id::text
          AND private.prescription_visible(w.settings,w.settings->>'startDate',w.settings->>'endDate')
          AND (w.routine_id IS NULL OR private.can_read_routine(w.routine_id::text))))
      ORDER BY w.id OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),100)) q;
  ELSE RAISE EXCEPTION 'Invalid prescription type' USING ERRCODE='22023'; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.read_prescriptions(TEXT,INTEGER,INTEGER,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_prescriptions(TEXT,INTEGER,INTEGER,TEXT) TO authenticated;

-- Legacy embedded media is not a public library merely because of its type.
-- Preserve owner/admin access and actual references in the shared exercise
-- library or the current student's visible prescription; deny orphan enumeration.
CREATE OR REPLACE FUNCTION private.can_read_legacy_media(p_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.is_active() AND (private.is_admin()
    OR EXISTS(SELECT 1 FROM public.custom_exercises c WHERE ('supamedia:'||p_id) IN(c.image,c.video_url,c.video_file_url))
    OR EXISTS(SELECT 1 FROM public.admin_exercises e WHERE ('supamedia:'||p_id) IN(e.video_url,e.video_file_url)
      AND private.can_read_routine(e.routine_id::text))
    OR EXISTS(SELECT 1 FROM public.exercises e JOIN public.workouts w ON w.id::text=e.workout_id::text
      WHERE ('supamedia:'||p_id) IN(e.video_url,e.video_file_url) AND w.student_id::text=(SELECT auth.uid())::text
        AND private.prescription_visible(w.settings,w.settings->>'startDate',w.settings->>'endDate')
        AND (w.routine_id IS NULL OR private.can_read_routine(w.routine_id::text))));
$$;
REVOKE ALL ON FUNCTION private.can_read_legacy_media(TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_read_legacy_media(TEXT) TO authenticated,service_role;
DROP POLICY IF EXISTS cadu_agenda_read ON public.agenda_events;
CREATE POLICY cadu_agenda_read ON public.agenda_events FOR SELECT TO authenticated
  USING((SELECT private.is_active()) AND type IS DISTINCT FROM 'trainer_payment_settings'
    AND (student_id::text=(SELECT auth.uid())::text OR (type='media_storage' AND private.can_read_legacy_media(id::text))));

COMMIT;
