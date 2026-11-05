import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const root = new URL('../', import.meta.url);
const base = await readFile(new URL('supabase/migrations/20261105125428_secure_access.sql', root), 'utf8');
const migration = await readFile(new URL('supabase/migrations/20261105161811_transactional_prescriptions_and_student_records.sql', root), 'utf8');
const admin = 'a0000000-0000-4000-8000-000000000001', student = 'b0000000-0000-4000-8000-000000000002', other = 'c0000000-0000-4000-8000-000000000003';
for (const uuidIds of [false, true]) test(`transactional prescriptions and student records (${uuidIds ? 'deployed UUID' : 'fresh TEXT'} IDs)`, async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;CREATE SCHEMA storage;
      CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
      GRANT USAGE ON SCHEMA auth,public,storage TO anon,authenticated,service_role;
      CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
      CREATE TABLE storage.objects(id UUID DEFAULT gen_random_uuid(),bucket_id TEXT,name TEXT);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT ALL ON storage.objects TO authenticated,service_role;`);
    let initial = base;
    if (uuidIds) for (const table of ['workouts', 'exercises', 'evolution_photos']) {
      initial = initial.replace(new RegExp(`(CREATE TABLE IF NOT EXISTS public\\.${table} \\([\\s\\S]*?\\n\\);)`), block =>
        block.replace('id TEXT PRIMARY KEY', 'id UUID PRIMARY KEY').replace('student_id TEXT', 'student_id UUID').replace('workout_id TEXT', 'workout_id UUID'));
    }
    await db.exec(initial); await db.exec(migration); await db.exec(migration);
    await db.exec(`INSERT INTO auth.users(id,email) VALUES('${admin}','admin@example.test'),('${student}','student@example.test'),('${other}','other@example.test');
      UPDATE profiles SET status='active'; UPDATE profiles SET role='admin' WHERE id='${admin}';`);
    async function actor(id, role = 'authenticated') {
      await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id, role]); await db.exec('SET ROLE ' + role);
    }
    const routine = { id: 'r1', name: 'Treino', student_ids: [student], settings: {}, exercises: [
      { id: 'exercise-one', name: 'Agachamento', sets: 3, reps: '10', rest: '60s' },
    ] };
    async function save(payload, version = null) { return (await db.query('SELECT save_admin_routine($1,$2) result', [payload, version])).rows[0].result; }
    await actor(admin);
    const first = await save(routine); assert.equal(first.version, 1); assert.equal(first.exercises.length, 1);
    assert.equal((await db.query('SELECT * FROM workouts')).rows.length, 1);
    const assignment = (await db.query('SELECT * FROM workouts')).rows[0];
    await assert.rejects(save({ ...routine, name: 'Partial', exercises: [{ id: 'bad', name: '', sets: 1, reps: '1' }] }, 1), /Invalid or duplicate exercise/);
    assert.equal((await db.query('SELECT name,version FROM admin_routines')).rows[0].name, 'Treino');
    assert.equal((await db.query('SELECT * FROM admin_exercises')).rows.length, 1);
    const updated = await save({ ...routine, name: 'Updated', general_notes: null }, 1); assert.equal(updated.version, 2);
    await assert.rejects(save({ ...routine, name: 'Stale' }, 1), /Recarregue/);
    await assert.rejects(save(routine), /Recarregue/);
    await db.query('SELECT assign_routine_to_student($1,$2)', ['r1', student]);
    await db.query('SELECT assign_routine_to_student($1,$2)', ['r1', student]);
    assert.equal((await db.query('SELECT * FROM workouts')).rows.length, 1);
    assert.equal((await db.query('SELECT id FROM workouts')).rows[0].id, assignment.id);
    await db.query('SELECT assign_routine_to_student($1,$2)', ['r1', other]);
    await db.query('SELECT assign_routine_to_student($1,$2,true)', ['r1', student]);
    assert.deepEqual((await db.query('SELECT student_id::text FROM workouts')).rows.map(x => x.student_id), [other]);
    await actor(student);
    await assert.rejects(save(routine), /Administrator/);
    await assert.rejects(db.exec("UPDATE admin_routines SET name='bad'"), /permission denied/);
    assert.equal((await db.query("SELECT read_prescriptions('routine') data")).rows[0].data.length, 0);
    const ownNotices = (await db.query('SELECT * FROM student_notifications')).rows;
    assert.equal(ownNotices.length, 1); assert.equal(ownNotices[0].recipient_id, student);
    await db.query('UPDATE student_notifications SET read_at=now() WHERE id=$1', [ownNotices[0].id]);
    await assert.rejects(db.exec("UPDATE student_notifications SET title='forged'"), /permission denied/);
    const photo = 'd0000000-0000-4000-8000-000000000004';
    await db.query('INSERT INTO evolution_photos(id,student_id,photo_url) VALUES($1,$2,$3)', [photo, student, 'storage://evolution-photos/' + student + '/photo.jpg']);
    await db.query('SELECT delete_evolution_photo($1,$2)', [photo, student]);
    await assert.rejects(db.query('INSERT INTO evolution_photos(id,student_id,photo_url) VALUES($1,$2,$3)', [photo, student, 'retry']), /excluída/);
    await assert.rejects(db.query("INSERT INTO agenda_events(id,student_id,title,type) VALUES($1,$2,'Legacy','evolution_photo')", [photo,student]), /excluída/);
    const lockSql=(await db.query("SELECT pg_get_functiondef('private.prevent_deleted_photo_write()'::regprocedure) guard,pg_get_functiondef('public.delete_evolution_photo(text,uuid)'::regprocedure) remover")).rows[0];
    assert.match(lockSql.guard,/pg_advisory_xact_lock\(hashtextextended\('photo:'/);
    assert.match(lockSql.remover,/pg_advisory_xact_lock\(hashtextextended\('photo:'/);
    await actor(admin);
    const form = { id: 'f1', student_id: student, responses: { title: 'Saúde', status: 'pending', questions: [{ id: 'q', label: 'Objetivo?' }] } };
    const savedForm = (await db.query('SELECT save_anamnesis($1) data', [form])).rows[0].data;
    await actor(student);
    await assert.rejects(db.query('SELECT save_anamnesis($1,$2)', [{ ...form, responses: { ...form.responses, title: 'Forjado', status: 'answered' } }, savedForm.version]), /Only answers/);
    for(const status of [undefined,null]) await assert.rejects(db.query('SELECT save_anamnesis($1,$2)',[{...form,responses:{...form.responses,status}},savedForm.version]),/Only answers/);
    await assert.rejects(db.query('SELECT save_anamnesis($1,$2)',[{...form,student_id:null,responses:{...form.responses,status:'answered'}},savedForm.version]),/Form access denied/);
    assert.equal((await db.query("SELECT version FROM anamnesis WHERE id='f1'")).rows[0].version,1);
    await actor(admin);
    for(const status of [undefined,null]) await assert.rejects(db.query('SELECT save_anamnesis($1,$2)',[{...form,responses:{...form.responses,status}},savedForm.version]),/Invalid form/);
    await actor(student);
    const answer = (await db.query('SELECT save_anamnesis($1,$2) data', [{ ...form, responses: { ...form.responses, status: 'answered', questions: [{ id: 'q', label: 'Objetivo?', answer: 'Força' }] } }, savedForm.version])).rows[0].data;
    assert.equal(answer.responses.questions[0].answer, 'Força');
    assert.equal((await db.query("DELETE FROM anamnesis WHERE id='f1' RETURNING id")).rows.length, 0);
    await actor(admin);
    await save({...routine,id:'hidden',exercises:routine.exercises.map(e=>({...e,id:'hidden-'+e.id})),start_date:'2999-01-01',settings:{hideBeforeStart:true}});
    await actor(student);
    assert.equal((await db.query("SELECT read_prescriptions('routine') data")).rows[0].data.length,0);
    assert.equal((await db.query("SELECT read_prescriptions('workout') data")).rows[0].data.length,0);
    await db.exec('RESET ROLE');
    await db.exec('DROP INDEX public.workouts_unique_assignment_idx');
    const duplicateId='e0000000-0000-4000-8000-000000000005';
    await db.query("INSERT INTO workouts(id,student_id,routine_id,name,settings) VALUES($1,$2,'hidden','Legacy duplicate','{}')",[duplicateId,student]);
    await actor(student);
    assert.equal((await db.query("SELECT read_prescriptions('workout') data")).rows[0].data.length,0,'a stale legacy copy cannot reopen a hidden template');
    await assert.rejects(db.query('SELECT consume_api_rate_limit($1,$2)',[student,'client-error']),/permission denied/);
    await actor('', 'service_role');
    for(let i=0;i<5;i++) assert.equal((await db.query('SELECT consume_api_rate_limit($1,$2) allowed',[student,'client-error'])).rows[0].allowed,true);
    assert.equal((await db.query('SELECT consume_api_rate_limit($1,$2) allowed',[student,'client-error'])).rows[0].allowed,false);
  } finally { await db.close(); }
});
