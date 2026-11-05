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
