-- One-time cleanup for the VAPID key rotation of 2026-11-05.
-- Preserve every legacy row, including duplicate endpoints and extra columns.
-- The archive's existence is the durable completion marker: do not drop it.
-- Do not copy this operation into the repeatable core setup.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE CREATE ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

-- Serialize concurrent runs and block new registrations until the first archive
-- and cleanup commit together. Registrations made after commit remain active.
LOCK TABLE public.push_subscriptions IN ACCESS EXCLUSIVE MODE;

DO $rotation$
BEGIN
  IF to_regclass('private.legacy_push_subscriptions_20261105') IS NULL THEN
    CREATE TABLE private.legacy_push_subscriptions_20261105 AS
      SELECT * FROM public.push_subscriptions;

    DELETE FROM public.push_subscriptions;
  END IF;
END;
$rotation$;

REVOKE ALL ON TABLE private.legacy_push_subscriptions_20261105
  FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE private.legacy_push_subscriptions_20261105 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE private.legacy_push_subscriptions_20261105 IS
  'Owner-only backup of subscriptions retired during the 2026-11-05 VAPID rotation. Its existence prevents reprocessing; retain this table. Not exposed through the Data API.';

COMMIT;
