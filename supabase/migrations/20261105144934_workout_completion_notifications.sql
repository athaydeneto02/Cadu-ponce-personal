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
