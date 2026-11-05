import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261105125554_rotate_push_subscriptions.sql', import.meta.url), 'utf8');
const fixture = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA private;
  GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON TABLES TO anon, authenticated, service_role;
  CREATE TABLE public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL,
    subscription JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
    legacy_extra_field TEXT
  );
  INSERT INTO public.push_subscriptions(user_id, subscription, legacy_extra_field)
  SELECT CASE WHEN n <= 72 THEN 'a0000000-0000-4000-8000-000000000001'::uuid
         ELSE 'b0000000-0000-4000-8000-000000000002'::uuid END,
         jsonb_build_object('endpoint', 'https://push.invalid/old-' || (n % 12),
                            'keys', jsonb_build_object('auth', 'synthetic-' || n)),
         'preserve-' || n
  FROM generate_series(1,98) n;
`;

test('VAPID rotation preserves all legacy records privately and never removes new registrations on rerun', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    const before = (await db.query('SELECT * FROM public.push_subscriptions ORDER BY id')).rows;
    assert.equal(before.length, 98);
    assert.equal(new Set(before.map(row => row.subscription.endpoint)).size, 12);
    await db.exec(migration);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.push_subscriptions')).rows[0].count, 0);
    assert.deepEqual((await db.query('SELECT * FROM private.legacy_push_subscriptions_20261105 ORDER BY id')).rows, before);

    for (const role of ['anon', 'authenticated', 'service_role']) {
      const permissions = (await db.query(`SELECT has_table_privilege($1,'private.legacy_push_subscriptions_20261105','SELECT') AS read,
        has_table_privilege($1,'private.legacy_push_subscriptions_20261105','INSERT') AS write`, [role])).rows[0];
      assert.deepEqual(permissions, { read: false, write: false });
      await db.exec('SET ROLE ' + role);
      await assert.rejects(db.query('SELECT * FROM private.legacy_push_subscriptions_20261105'), /permission denied/);
      await db.exec('RESET ROLE');
    }
    assert.equal((await db.query("SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='private.legacy_push_subscriptions_20261105'::regclass")).rows[0].enabled, true);

    await db.exec(`INSERT INTO public.push_subscriptions(user_id,subscription,legacy_extra_field)
      VALUES ('a0000000-0000-4000-8000-000000000001','{"endpoint":"https://push.invalid/new-key"}','new-registration');`);
    const newRegistration = (await db.query('SELECT * FROM public.push_subscriptions')).rows;
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM public.push_subscriptions')).rows, newRegistration);
    assert.deepEqual((await db.query('SELECT * FROM private.legacy_push_subscriptions_20261105 ORDER BY id')).rows, before);
  } finally { await db.close(); }
});

test('a failed cleanup rolls back the archive and leaves all original subscriptions intact', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(`CREATE FUNCTION public.reject_test_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated cleanup failure'; END; $$;
      CREATE TRIGGER reject_test_delete BEFORE DELETE ON public.push_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.reject_test_delete();`);
    await assert.rejects(db.exec(migration), /simulated cleanup failure/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.push_subscriptions')).rows[0].count, 98);
    assert.equal((await db.query("SELECT to_regclass('private.legacy_push_subscriptions_20261105') AS archive")).rows[0].archive, null);
  } finally { await db.close(); }
});
