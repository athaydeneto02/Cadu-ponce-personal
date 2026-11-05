import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

for (const studentType of ['TEXT', 'UUID']) test(`completion inbox and push outbox enforce ownership/idempotency with ${studentType} student IDs`, async t => {
  const db = new PGlite();
  const read = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
  const migration = await read('20261105144934_workout_completion_notifications.sql');
  const student = 'a0000000-0000-4000-8000-000000000001';
  const other = 'b0000000-0000-4000-8000-000000000002';
  const admin = 'c0000000-0000-4000-8000-000000000003';
  const admin2 = 'd0000000-0000-4000-8000-000000000004';
  const inactive = 'e0000000-0000-4000-8000-000000000005';
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    GRANT USAGE ON SCHEMA auth,public,storage TO anon,authenticated,service_role;
    CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects(id UUID DEFAULT gen_random_uuid(),bucket_id TEXT,name TEXT);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
  `);
  let core = await read('20261105125428_secure_access.sql');
  if (studentType === 'UUID') {
    // Existing production uses UUID student IDs; a fresh setup uses TEXT.
    core = core.replace(/(CREATE TABLE IF NOT EXISTS public\.workout_logs \(\r?\n  id TEXT PRIMARY KEY, student_id )TEXT/, '$1UUID')
      .replace(/(CREATE TABLE IF NOT EXISTS public\.workouts \(\r?\n  id TEXT PRIMARY KEY, student_id )TEXT/, '$1UUID');
  }
  await db.exec(core);
  await db.exec(`INSERT INTO auth.users(id,email) VALUES
    ('${student}','student@example.test'),('${other}','other@example.test'),
    ('${admin}','admin@example.test'),('${admin2}','admin2@example.test'),('${inactive}','inactive@example.test');
    UPDATE profiles SET status='active';
    UPDATE profiles SET role='admin' WHERE id IN('${admin}','${admin2}','${inactive}');
    UPDATE profiles SET status='inactive' WHERE id='${inactive}';
    UPDATE profiles SET name='Nome verificado' WHERE id='${student}';
    INSERT INTO admin_routines(id,name,student_ids) VALUES('routine','Treino prescrito',ARRAY['${student}']);
    INSERT INTO workout_logs(id,student_id,routine_id,routine_name,completed_at,duration_seconds)
      VALUES('historical','${student}','routine','Histórico','2026-01-01T10:00:00Z',90);
  `);
  async function actor(id, role = 'authenticated') {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id, role]);
    await db.exec('SET ROLE ' + role);
  }
  const count = async sql => Number((await db.query(sql)).rows[0].count);
  try {
    await t.test('migration is repeatable and backfill does not queue historical pushes', async () => {
      await db.exec(migration);
      await db.exec(migration);
      assert.equal(await count('SELECT count(*) FROM workout_completion_notifications'), 2);
      assert.equal(await count('SELECT count(*) FROM workout_completion_notifications WHERE push_sent_at IS NOT NULL'), 2);
      assert.equal(await count("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='workout_completion_notifications'"), 1);
    });
    await t.test('one persisted completion creates one immutable-content inbox row per active administrator', async () => {
      await actor(student);
      await db.query(`INSERT INTO workout_logs(id,student_id,student_name,routine_id,routine_name,completed_at,duration_seconds)
        VALUES('new-log',$1,'Forged name','routine','Forged message','2026-11-05T12:00:00Z',120)`, [student]);
      assert.equal(await count('SELECT count(*) FROM workout_completion_notifications'), 0);
      await assert.rejects(db.exec(`INSERT INTO workout_completion_notifications(workout_log_id,recipient_id,student_id,student_name,routine_name,completed_at)
        VALUES('new-log','${admin}','${student}','fake','fake',now())`), /permission denied/);
      await assert.rejects(db.exec(`INSERT INTO agenda_events(id,student_id,type,title) VALUES('fake','${student}','trainer_notification','fake')`), /row-level security/);
      await actor(admin);
      const rows = (await db.query("SELECT * FROM workout_completion_notifications WHERE workout_log_id='new-log'")).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].student_name, 'Nome verificado');
      assert.equal(rows[0].routine_name, 'Treino prescrito');
      assert.equal(rows[0].duration_seconds, 120);
      assert.equal(rows[0].recipient_id, admin);
      await assert.rejects(db.exec("UPDATE workout_completion_notifications SET student_name='changed'"), /permission denied/);
      await assert.rejects(db.exec('DELETE FROM workout_completion_notifications'), /permission denied/);
    });
    await t.test('retrying an upsert is idempotent and reading is individual', async () => {
      await actor(student);
      await db.query(`INSERT INTO workout_logs(id,student_id,routine_id,routine_name) VALUES('new-log',$1,'routine','retry')
        ON CONFLICT(id) DO UPDATE SET comment='retry'`, [student]);
      await actor(admin);
      await db.exec("UPDATE workout_completion_notifications SET read_at=now() WHERE workout_log_id='new-log'");
      assert.equal(await count("SELECT count(*) FROM workout_completion_notifications WHERE workout_log_id='new-log' AND read_at IS NOT NULL"), 1);
      await actor(admin2);
      assert.equal(await count("SELECT count(*) FROM workout_completion_notifications WHERE workout_log_id='new-log' AND read_at IS NULL"), 1);
      assert.equal((await db.query(`UPDATE workout_completion_notifications SET read_at=now() WHERE recipient_id='${admin}' RETURNING id`)).rows.length, 0);
      await db.exec('RESET ROLE');
      assert.equal(await count("SELECT count(*) FROM workout_completion_notifications WHERE workout_log_id='new-log'"), 2);
    });
    await t.test('rollback removes both the log and notifications; inactive and anonymous readers cannot see inbox', async () => {
      await actor(student);
      await db.exec(`BEGIN; INSERT INTO workout_logs(id,student_id,routine_id,routine_name) VALUES('rolled-back','${student}','routine','x'); ROLLBACK;`);
      await db.exec('RESET ROLE');
      assert.equal(await count("SELECT count(*) FROM workout_completion_notifications WHERE workout_log_id='rolled-back'"), 0);
      await actor(inactive);
      assert.equal(await count('SELECT count(*) FROM workout_completion_notifications'), 0);
      await actor('', 'anon');
      await assert.rejects(db.exec('SELECT * FROM workout_completion_notifications'), /permission denied/);
      await assert.rejects(db.query('SELECT public.claim_workout_completion_push($1,$2)', ['new-log',student]), /permission denied/);
    });
    await t.test('only the service can claim per-device deliveries and ownership is rechecked', async () => {
      await db.exec('RESET ROLE');
      for (const id of [admin,admin2]) await db.query(`INSERT INTO push_subscriptions(user_id,subscription)
        VALUES($1,$2)`, [id,{ endpoint:'https://fcm.googleapis.com/' + id,keys:{p256dh:'public',auth:'auth'} }]);
      await actor(student);
      await assert.rejects(db.query('SELECT public.claim_workout_completion_push($1,$2)', ['new-log',student]), /permission denied/);
      await actor('', 'service_role');
      await assert.rejects(db.query('SELECT public.claim_workout_completion_push($1,$2)', ['new-log',other]), /Completion access denied/);
      const history = (await db.query('SELECT public.claim_workout_completion_push($1,$2) AS result', ['historical',student])).rows[0].result;
      assert.equal(history.deliveries.length, 0);
      const claim = (await db.query('SELECT public.claim_workout_completion_push($1,$2) AS result', ['new-log',student])).rows[0].result;
      assert.equal(claim.deliveries.length, 2);
      const duplicate = (await db.query('SELECT public.claim_workout_completion_push($1,$2) AS result', ['new-log',student])).rows[0].result;
      assert.equal(duplicate.deliveries.length, 0, 'active leases prevent concurrent sending');
      const [success, retry] = claim.deliveries;
      assert.equal((await db.query('SELECT public.finish_workout_completion_push($1,$2,true,false) AS ok', [success.delivery_id,other])).rows[0].ok,false);
      await db.query('SELECT public.finish_workout_completion_push($1,$2,true,false)', [success.delivery_id,success.claim_token]);
      await db.query('SELECT public.finish_workout_completion_push($1,$2,false,false)', [retry.delivery_id,retry.claim_token]);
      assert.equal((await db.query("SELECT public.workout_completion_push_pending('new-log') AS pending")).rows[0].pending,true);
      const retried = (await db.query('SELECT public.claim_workout_completion_push($1,$2) AS result', ['new-log',student])).rows[0].result;
      assert.equal(retried.deliveries.length,1);
      assert.equal(retried.deliveries[0].delivery_id,retry.delivery_id);
      await db.query('SELECT public.finish_workout_completion_push($1,$2,false,true)', [retry.delivery_id,retried.deliveries[0].claim_token]);
      assert.equal((await db.query("SELECT public.workout_completion_push_pending('new-log') AS pending")).rows[0].pending,false);
      assert.equal((await db.query('SELECT public.claim_workout_completion_push($1,$2) AS result', ['new-log',student])).rows[0].result.deliveries.length,0);
    });
  } finally { await db.close(); }
});
