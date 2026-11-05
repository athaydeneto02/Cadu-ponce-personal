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
