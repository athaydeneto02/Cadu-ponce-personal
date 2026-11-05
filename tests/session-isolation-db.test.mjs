import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const read = name => readFile(new URL(name, migrations), 'utf8');
const admin = 'a0000000-0000-4000-8000-000000000001';
const student = 'b0000000-0000-4000-8000-000000000002';
const other = 'c0000000-0000-4000-8000-000000000003';
const sessions = new Map([admin, student, other].map((id, index) => [id, `d0000000-0000-4000-8000-00000000000${index + 1}`]));

for (const uuidIds of [false, true]) test(`session revocation and student confidentiality (${uuidIds ? 'deployed UUID' : 'fresh TEXT'})`, async t => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}',
        banned_until TIMESTAMPTZ,deleted_at TIMESTAMPTZ,is_anonymous BOOLEAN DEFAULT false);
      CREATE TABLE auth.sessions(id UUID PRIMARY KEY,user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,not_after TIMESTAMPTZ);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      GRANT USAGE ON SCHEMA auth,public,storage TO anon,authenticated,service_role;
      GRANT CREATE ON SCHEMA public TO PUBLIC,anon,authenticated;
      CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
      CREATE TABLE storage.objects(id UUID DEFAULT gen_random_uuid(),bucket_id TEXT,name TEXT);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON storage.objects TO anon,authenticated,service_role;
      CREATE POLICY inherited_storage_all ON storage.objects FOR ALL TO PUBLIC USING(true) WITH CHECK(true);`);
    let core = await read('20261105125428_secure_access.sql');
    if (uuidIds) for (const table of ['workouts','exercises','evolution_photos']) {
      core = core.replace(new RegExp(`(CREATE TABLE IF NOT EXISTS public\\.${table} \\([\\s\\S]*?\\n\\);)`), block =>
        block.replace('id TEXT PRIMARY KEY','id UUID PRIMARY KEY').replace('student_id TEXT','student_id UUID').replace('workout_id TEXT','workout_id UUID'));
    }
    await db.exec(core);
    for (const name of ['20261105135939_exercise_gif_uploads.sql','20261105144934_workout_completion_notifications.sql',
      '20261105161811_transactional_prescriptions_and_student_records.sql','20261105163348_remove_redundant_workout_log_index.sql']) await db.exec(await read(name));
    // Reproduce privileges inherited by the actual deployed schema, not present
    // in a clean CREATE TABLE fixture. No production data/connection is used.
    await db.exec(`GRANT TRUNCATE,REFERENCES,TRIGGER ON ALL TABLES IN SCHEMA public TO authenticated;
      INSERT INTO auth.users(id,email) VALUES('${admin}','admin@example.test'),('${student}','student@example.test'),('${other}','other@example.test');
      UPDATE profiles SET status='active'; UPDATE profiles SET role='admin' WHERE id='${admin}';
      UPDATE profiles SET name='Aluno A' WHERE id='${student}'; UPDATE profiles SET name='Aluno B privado' WHERE id='${other}';`);
    for (const [user, session] of sessions) await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,user]);
    async function actor(id, session = sessions.get(id), role = 'authenticated') {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claims',$3,false)",
        [id ?? '',role,JSON.stringify({sub:id,role,session_id:session,user_metadata:{role:'admin'}})]);
      await db.exec('SET ROLE '+role);
    }
    const count = async sql => Number((await db.query(sql)).rows[0].count);
    const rpc = async (kind, target = null) => (await db.query('SELECT read_prescriptions($1,0,100,$2) data',[kind,target])).rows[0].data;
    const routine = {id:'shared',name:'Compartilhado',student_ids:[student,other],settings:{},exercises:[{id:'exercise',name:'Agachamento',sets:3,reps:'10'}]};
    await actor(admin);
    await db.query('SELECT save_admin_routine($1)',[routine]);
    await db.exec('RESET ROLE');
    await db.exec(`INSERT INTO agenda_events(id,student_id,title,type,notes) VALUES
      ('orphan-media','${admin}','Private orphan','media_storage','data:image/png;base64,AA=='),
      ('library-media','${admin}','Generic demonstration','media_storage','data:image/png;base64,AA=='),
      ('routine-media','${admin}','Assigned demonstration','media_storage','data:image/png;base64,AA=='),
      ('payment-settings',NULL,'Private payment config','trainer_payment_settings','{}'),
      ('payment-owner','${student}','Private payment config','trainer_payment_settings','{}'),
      ('other-file','${other}','Private document','student_file','{}');
      INSERT INTO custom_exercises(id,title,"group",category,image) VALUES('library','Demo','G','C','supamedia:library-media');
      UPDATE admin_exercises SET video_file_url='supamedia:routine-media' WHERE id='exercise';
      INSERT INTO evolution_photos(id,student_id,photo_url) VALUES('e0000000-0000-4000-8000-000000000001','${student}','storage://evolution-photos/${student}/own.jpg'),
        ('e0000000-0000-4000-8000-000000000002','${other}','storage://evolution-photos/${other}/private.jpg');
      INSERT INTO progress_entries(id,student_id,exercise_name) VALUES('own-progress','${student}','Demo'),('other-progress','${other}','Private');
      INSERT INTO assessments(id,student_id,notes) VALUES('private-assessment','${other}','Private health');
      INSERT INTO storage.objects(bucket_id,name) VALUES('evolution-photos','${student}/own.jpg'),('evolution-photos','${other}/private.jpg'),
        ('arquivos-alunos','${other}/private.pdf'),('exercise-videos','shared.mp4');`);
    await actor(student, 'f0000000-0000-4000-8000-000000000000');
    assert.equal(await count('SELECT count(*) FROM evolution_photos'),1,'before fix, a revoked-session JWT can still read private data');
    assert.deepEqual((await rpc('routine'))[0].student_names,['Aluno A','Aluno B privado'],'before fix, a shared routine exposes another student name');
    assert.equal(await count("SELECT count(*) FROM agenda_events WHERE id='orphan-media'"),1,'before fix, all media_storage rows are readable');
    await db.exec('RESET ROLE');
    const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename);
    const snapshot=async()=>Promise.all(tables.map(async table=>[table,await count('SELECT count(*) FROM public.'+table)]));
    const before=await snapshot();
    assert.equal((await db.query("SELECT has_schema_privilege('authenticated','public','create') allowed")).rows[0].allowed,true);
    assert.equal((await db.query("SELECT has_table_privilege('authenticated','progress_entries','truncate') allowed")).rows[0].allowed,true);
    const fix = await read('20261105170511_session_and_student_data_isolation.sql');
    await db.exec(fix); await db.exec(fix);
    assert.deepEqual(await snapshot(),before,'hardening must not remove or duplicate existing app records');

    await t.test('shared templates use a scoped projection; direct reads cannot enumerate another recipient',async () => {
      await actor(student);
      assert.equal(await count('SELECT count(*) FROM admin_routines'),0);
      const own = await rpc('routine'); assert.equal(own.length,1);
      assert.deepEqual(own[0].student_ids,[student]); assert.deepEqual(own[0].student_names,['Aluno A']);
      assert.equal(JSON.stringify(own).includes(other),false); assert.equal(JSON.stringify(own).includes('Aluno B privado'),false);
      assert.equal(own[0].exercises.length,1);
      assert.equal((await rpc('workout')).length,1); assert.equal((await rpc('workout',other)).length,0);
      assert.equal(await count('SELECT count(*) FROM workouts'),1); assert.equal(await count('SELECT count(*) FROM exercises'),1);
      await assert.rejects(db.query('SELECT save_admin_routine($1)',[routine]),/Administrator/);
      await actor(admin);
      assert.equal((await rpc('routine'))[0].student_ids.length,2); assert.equal((await rpc('workout')).length,2);
      await db.query('SELECT save_admin_routine($1,1)',[{...routine,start_date:'2999-01-01',settings:{hideBeforeStart:true}}]);
      await actor(student);
      assert.equal((await rpc('routine')).length,0); assert.equal((await rpc('workout')).length,0);
      assert.equal(await count('SELECT count(*) FROM admin_exercises'),0); assert.equal(await count('SELECT count(*) FROM exercises'),0);
      await actor(admin); await db.query('SELECT save_admin_routine($1,2)',[routine]);
    });

    await t.test('legacy media preserves library and owner access while hiding unreferenced/private rows',async () => {
      await actor(admin);
      await db.query('SELECT save_admin_routine($1,3)',[{...routine,exercises:[{...routine.exercises[0],video_file_url:'supamedia:routine-media'}]}]);
      await actor(student);
      const media = (await db.query("SELECT id FROM agenda_events WHERE type='media_storage' ORDER BY id")).rows.map(x=>x.id);
      assert.deepEqual(media,['library-media','routine-media']);
      assert.equal(await count("SELECT count(*) FROM agenda_events WHERE id='other-file'"),0);
      assert.equal(await count("SELECT count(*) FROM agenda_events WHERE type='trainer_payment_settings'"),0,'WhatsApp-only checkout does not expose PIX/bank configuration');
      await actor(admin); assert.equal(await count("SELECT count(*) FROM agenda_events WHERE type='media_storage'"),3);
      assert.equal(await count("SELECT count(*) FROM agenda_events WHERE type='trainer_payment_settings'"),2);
    });

    await t.test('revoked, missing, malformed, mismatched, expired and banned sessions fail closed',async () => {
      for (const invalid of [null,'not-a-uuid','f0000000-0000-4000-8000-000000000000',sessions.get(other)]) {
        await actor(student,invalid);
        assert.equal(await count('SELECT count(*) FROM profiles'),0);
        assert.equal(await count('SELECT count(*) FROM evolution_photos'),0);
        assert.equal(await count('SELECT count(*) FROM storage.objects'),0);
        await assert.rejects(rpc('routine'),/Active session/);
      }
      await db.exec('RESET ROLE'); await db.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",[sessions.get(student)]);
      await actor(student); assert.equal(await count('SELECT count(*) FROM profiles'),0);
      await db.exec('RESET ROLE'); await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[sessions.get(student)]);
      await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1",[student]);
      await actor(student); assert.equal(await count('SELECT count(*) FROM profiles'),0);
      await db.exec('RESET ROLE'); await db.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[student]);
      await actor(student); assert.equal(await count('SELECT count(*) FROM evolution_photos'),1);
      await db.exec('RESET ROLE'); await db.query('DELETE FROM auth.sessions WHERE id=$1',[sessions.get(student)]);
      await actor(student); assert.equal(await count('SELECT count(*) FROM evolution_photos'),0);
      await db.exec('RESET ROLE'); await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sessions.get(student),student]);
      await actor(admin,'f0000000-0000-4000-8000-000000000000');
      assert.equal(await count('SELECT count(*) FROM profiles'),0);
      await assert.rejects(db.query("SELECT delete_admin_routine('shared')"),/Administrator/);
    });

    await t.test('inactive account keeps only its status profile; cannot read private data or files',async () => {
      await actor(admin); await db.query("UPDATE profiles SET status='inactive' WHERE id=$1",[student]);
      await actor(student);
      assert.equal(await count('SELECT count(*) FROM profiles'),1); assert.equal(await count('SELECT count(*) FROM evolution_photos'),0);
      assert.equal(await count('SELECT count(*) FROM storage.objects'),0);
      assert.equal((await db.query("UPDATE profiles SET status='active' RETURNING id")).rows.length,0);
      await actor(admin); await db.query("UPDATE profiles SET status='active' WHERE id=$1",[student]);
    });

    await t.test('ownership changes, storage lateral access and privileged function calls are rejected',async () => {
      await actor(student);
      assert.equal(await count('SELECT count(*) FROM assessments'),0);
      await assert.rejects(db.query("UPDATE progress_entries SET student_id=$1 WHERE id='own-progress'",[other]),/row-level security/);
      await assert.rejects(db.query('UPDATE evolution_photos SET student_id=$1',[other]),/row-level security/);
      await assert.rejects(db.exec("UPDATE profiles SET role='admin'"),/Only an administrator/);
      assert.equal(await count("SELECT count(*) FROM storage.objects WHERE bucket_id='evolution-photos'"),1);
      await assert.rejects(db.query("UPDATE storage.objects SET name=$1 WHERE bucket_id='evolution-photos'",[other+'/stolen.jpg']),/row-level security/);
      await assert.rejects(db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES('exercise-videos','forged.mp4')"),/row-level security/);
      await assert.rejects(db.query('SELECT server_has_valid_session($1,$2)',[other,sessions.get(other)]),/permission denied/);
      await assert.rejects(db.query('SELECT consume_api_rate_limit($1,$2)',[other,'notification']),/permission denied/);
      await assert.rejects(db.exec('SELECT * FROM auth.sessions'),/permission denied/);
      await assert.rejects(db.exec('SELECT * FROM private.workout_completion_push_deliveries'),/permission denied/);
      await assert.rejects(db.exec('TRUNCATE public.progress_entries'),/permission denied/);
      await assert.rejects(db.exec('CREATE TABLE public.attacker(id int)'),/permission denied/);
      await actor('',null,'anon'); await assert.rejects(db.exec('SELECT * FROM profiles'),/permission denied/);
      await assert.rejects(db.query("SELECT read_prescriptions('routine')"),/permission denied/);
      await assert.rejects(db.exec('CREATE TABLE public.attacker(id int)'),/permission denied/);
    });

    await t.test('a valid owner can still save progress and complete a workout without granting access to another student',async () => {
      await actor(student);
      await db.exec("UPDATE profiles SET name='Aluno A atualizado'");
      await db.exec("UPDATE progress_entries SET load=20 WHERE id='own-progress'");
      await db.query("INSERT INTO workout_logs(id,student_id,routine_id,routine_name,duration_seconds) VALUES('completed',$1,'shared','Forged client title',120)",[student]);
      assert.equal(await count('SELECT count(*) FROM workout_completion_notifications'),0);
      await actor(other); assert.equal(await count("SELECT count(*) FROM workout_logs WHERE id='completed'"),0);
      await actor(admin);
      const notices=(await db.query("SELECT * FROM workout_completion_notifications WHERE workout_log_id='completed'")).rows;
      assert.equal(notices.length,1); assert.equal(notices[0].student_name,'Aluno A atualizado'); assert.equal(notices[0].routine_name,'Compartilhado');
      await db.query('UPDATE workout_completion_notifications SET read_at=now() WHERE id=$1',[notices[0].id]);
      await actor(admin,'f0000000-0000-4000-8000-000000000000');
      assert.equal(await count('SELECT count(*) FROM workout_completion_notifications'),0);
    });

    await t.test('server verifier has narrow grants and validates both session owner and auth account state',async () => {
      await actor('',null,'service_role');
      const valid = async (user,session) => (await db.query('SELECT server_has_valid_session($1,$2) valid',[user,session])).rows[0].valid;
      assert.equal(await valid(student,sessions.get(student)),true);
      assert.equal(await valid(student,sessions.get(other)),false);
      assert.equal(await valid(student,null),false);
      await db.exec('RESET ROLE'); await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1',[student]);
      await actor('',null,'service_role'); assert.equal(await valid(student,sessions.get(student)),false);
      await db.exec('RESET ROLE'); await db.query('UPDATE auth.users SET deleted_at=NULL,is_anonymous=true WHERE id=$1',[student]);
      await actor('',null,'service_role'); assert.equal(await valid(student,sessions.get(student)),false);
      await db.exec('RESET ROLE');
      const functions=(await db.query("SELECT n.nspname,p.proname,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.prosecdef")).rows;
      for(const fn of functions){assert.equal(fn.anon,false,fn.proname);assert.ok(fn.proconfig.includes('search_path=""'),fn.proname);}
      assert.equal(await count("SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND grantee IN('anon','authenticated') AND privilege_type IN('TRUNCATE','TRIGGER','REFERENCES')"),0);
    });
  } finally { await db.close(); }
});
