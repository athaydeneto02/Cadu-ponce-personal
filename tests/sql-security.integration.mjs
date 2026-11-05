import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const base = new URL('../', import.meta.url);
const sql = await readFile(new URL('supabase/migrations/20261105125428_secure_access.sql', base), 'utf8');
const gifSql = await readFile(new URL('supabase/migrations/20261105135939_exercise_gif_uploads.sql', base), 'utf8');
const completionSql = await readFile(new URL('supabase/migrations/20261105144934_workout_completion_notifications.sql', base), 'utf8');
const integritySql = await readFile(new URL('supabase/migrations/20261105161811_transactional_prescriptions_and_student_records.sql', base), 'utf8');
const indexCleanupSql = await readFile(new URL('supabase/migrations/20261105163348_remove_redundant_workout_log_index.sql', base), 'utf8');
const sessionIsolationSql = await readFile(new URL('supabase/migrations/20261105170511_session_and_student_data_isolation.sql', base), 'utf8');
const bootstrap = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB DEFAULT '{}');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role',true),'') $$;
  GRANT USAGE ON SCHEMA auth, public, storage TO anon, authenticated, service_role;
  CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
  CREATE TABLE storage.objects(id UUID DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
  CREATE POLICY legacy_allow_everything ON storage.objects FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
`;
await db.exec(bootstrap);
await db.exec(sql);
await db.exec(sql);
await db.exec(gifSql);
await db.exec(gifSql);
const normalizeSql = value => value.replace(/\r\n/g, '\n').trim();
assert.equal(normalizeSql(await readFile(new URL('supabase_setup.sql', base),'utf8')), [sql, gifSql, completionSql, integritySql, indexCleanupSql, sessionIsolationSql].map(normalizeSql).join('\n\n'));
const gifBucket = (await db.query("SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='exercise-videos'")).rows[0];
assert.equal(gifBucket.public, false);
assert.equal(Number(gifBucket.file_size_limit), 104857600);
assert.equal(gifBucket.allowed_mime_types.filter(type => type === 'image/gif').length, 1);
console.log('PASS migration applies to fresh database and is repeatable');

const a='a0000000-0000-4000-8000-000000000001';
const b='b0000000-0000-4000-8000-000000000002';
const admin='c0000000-0000-4000-8000-000000000003';
const inactive='d0000000-0000-4000-8000-000000000004';
await db.exec(`
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('${a}','a@example.test','{"role":"admin"}'),('${b}','b@example.test','{}'),
 ('${admin}','admin@example.test','{}'),('${inactive}','inactive@example.test','{}');
`);
assert.deepEqual((await db.query('SELECT role,status FROM public.profiles WHERE id=$1',[a])).rows[0],{role:'student',status:'inactive'});
await db.exec(`UPDATE public.profiles SET status='active' WHERE id<>'${inactive}'; UPDATE public.profiles SET role='admin' WHERE id='${admin}';
 INSERT INTO public.workouts(id,student_id,name) VALUES ('w-a','${a}','Treino A'),('w-b','${b}','Treino A');
 INSERT INTO public.admin_routines(id,name,student_ids) VALUES ('r-a','Aluno A',ARRAY['${a}']),('r-b','Aluno B',ARRAY['${b}']);
 INSERT INTO public.agenda_events(id,student_id,title,type) VALUES
 ('inv-a','${a}','Fatura A','financial_invoice'),('inv-b','${b}','Fatura B','financial_invoice'),
 ('settings',NULL,'Settings','trainer_payment_settings'),('broadcast','all','Secret broadcast','assigned_routine');
 INSERT INTO storage.objects(bucket_id,name) VALUES ('evolution-photos','${a}/a.jpg'),('evolution-photos','${b}/b.jpg'),('exercise-videos','video.mp4');
`);
async function actor(id,role='authenticated') {
 await db.exec('RESET ROLE');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);
 await db.exec('SET ROLE '+role);
}
await actor(a);
assert.equal((await db.query('SELECT * FROM profiles')).rows.length,1);
assert.deepEqual((await db.query('SELECT id FROM workouts')).rows.map(r=>r.id),['w-a']);
assert.deepEqual((await db.query('SELECT id FROM admin_routines')).rows.map(r=>r.id),['r-a']);
assert.deepEqual((await db.query('SELECT id FROM agenda_events ORDER BY id')).rows.map(r=>r.id),['inv-a','settings']);
await assert.rejects(db.exec("UPDATE profiles SET role='admin'"), /Only an administrator/);
await assert.rejects(db.exec("UPDATE profiles SET metadata='{\"group\":\"admin\"}'"), /Only an administrator/);
await db.exec("UPDATE profiles SET name='Aluno atualizado',metadata='{\"phone\":\"123\"}'");
await assert.rejects(db.exec(`INSERT INTO workout_logs(id,student_id) VALUES ('wrong','${b}')`), /row-level security/);
await db.exec(`INSERT INTO workout_logs(id,student_id) VALUES ('own','${a}')`);
assert.equal((await db.query('UPDATE agenda_events SET title=\'paid\' WHERE id=\'inv-a\' RETURNING id')).rows.length,0);
assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,2);
await assert.rejects(db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES ('exercise-videos','rogue.mp4')`), /row-level security/);
await assert.rejects(db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES ('evolution-photos','${b}/rogue.jpg')`), /row-level security/);
await db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES ('evolution-photos','${a}/own.jpg')`);
assert.equal((await db.query(`DELETE FROM storage.objects WHERE name='${b}/b.jpg' RETURNING name`)).rows.length,0);
console.log('PASS student isolation, metadata/role protection, own writes and legacy storage restriction');

await actor(inactive);
assert.equal((await db.query('SELECT * FROM profiles')).rows.length,1);
assert.equal((await db.query('SELECT * FROM workouts')).rows.length,0);
assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0);
await actor(admin);
assert.equal((await db.query('SELECT * FROM profiles')).rows.length,4);
assert.equal((await db.query('SELECT * FROM workouts')).rows.length,2);
await db.exec(`UPDATE profiles SET status='inactive' WHERE id='${b}'`);
console.log('PASS inactive account blocked and admin retains management');

await actor('', 'anon');
await assert.rejects(db.exec('SELECT * FROM profiles'), /permission denied/);
let anonRows=[]; try { anonRows=(await db.query('SELECT * FROM storage.objects')).rows; } catch(e) { assert.match(e.message,/permission denied/); }
assert.equal(anonRows.length,0);
await assert.rejects(db.query('SELECT public.consume_api_rate_limit($1,$2)',[admin,'notification']), /permission denied/);
await actor('', 'service_role');
assert.equal((await db.query('SELECT * FROM profiles')).rows.length,4);
await db.exec(`UPDATE profiles SET status='active' WHERE id='${b}'`);
for(let i=0;i<10;i++) assert.equal((await db.query('SELECT public.consume_api_rate_limit($1,$2) AS allowed',[admin,'notification'])).rows[0].allowed,true);
assert.equal((await db.query('SELECT public.consume_api_rate_limit($1,$2) AS allowed',[admin,'notification'])).rows[0].allowed,false);
console.log('PASS anonymous access denied and database rate limiting enforced');

await actor(admin);
await db.exec(`
  UPDATE workouts SET routine_id='r-a' WHERE id='w-a';
  UPDATE workouts SET routine_id='r-b' WHERE id='w-b';
  INSERT INTO exercises(id,workout_id,name) VALUES ('ex-a','w-a','Agachamento'),('ex-b','w-b','Agachamento');
  INSERT INTO admin_exercises(id,routine_id,name) VALUES ('aex-a','r-a','Agachamento'),('aex-b','r-b','Agachamento');
  INSERT INTO agenda_events(id,student_id,title,type) VALUES ('w-a','${a}','Treino A','assigned_routine'),('w-b','${b}','Treino A','assigned_routine');
`);
await actor(a);
await assert.rejects(db.query('SELECT delete_workout_assignment($1,$2)',['w-a',a]), /Administrator access required/);
await actor(admin);
assert.equal((await db.query('SELECT delete_workout_assignment($1,$2) AS deleted',['w-a',b])).rows[0].deleted,false);
assert.equal((await db.query('SELECT delete_workout_assignment($1,$2) AS deleted',['w-a',a])).rows[0].deleted,true);
assert.deepEqual((await db.query('SELECT id FROM workouts')).rows.map(r=>r.id),['w-b']);
assert.deepEqual((await db.query('SELECT id FROM exercises')).rows.map(r=>r.id),['ex-b']);
assert.equal((await db.query("SELECT * FROM admin_exercises WHERE routine_id='r-a'")).rows.length,1);
console.log('PASS exact assignment deletion preserves same-name sibling and template');

// An injected failure late in a routine deletion must restore every earlier deletion.
await actor('', 'postgres');
await db.exec(`CREATE FUNCTION public.test_block_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated delete failure'; END $$;
 CREATE TRIGGER test_block_delete BEFORE DELETE ON agenda_events FOR EACH ROW EXECUTE FUNCTION public.test_block_delete();`);
await actor(admin);
await assert.rejects(db.query('SELECT delete_admin_routine($1)',['r-b']), /simulated delete failure/);
assert.equal((await db.query("SELECT * FROM workouts WHERE id='w-b'")).rows.length,1);
assert.equal((await db.query("SELECT * FROM exercises WHERE id='ex-b'")).rows.length,1);
assert.equal((await db.query("SELECT * FROM admin_exercises WHERE id='aex-b'")).rows.length,1);
await actor('', 'postgres');
await db.exec('DROP TRIGGER test_block_delete ON agenda_events; DROP FUNCTION public.test_block_delete()');
await actor(admin);
assert.equal((await db.query('SELECT delete_admin_routine($1) AS deleted',['r-b'])).rows[0].deleted,true);
assert.equal((await db.query("SELECT * FROM workouts WHERE id='w-b'")).rows.length,0);
assert.equal((await db.query("SELECT * FROM exercises WHERE id='ex-b'")).rows.length,0);
assert.equal((await db.query("SELECT * FROM admin_exercises WHERE id='aex-b'")).rows.length,0);
assert.equal((await db.query("SELECT * FROM admin_routines WHERE id='r-a'")).rows.length,1);
// The fresh-schema FK also protects direct administrative deletes outside the RPC.
await db.exec(`INSERT INTO workouts(id,student_id,name) VALUES ('cascade','${a}','Cascade');
 INSERT INTO exercises(id,workout_id,name) VALUES ('cascade-ex','cascade','Ex');
 DELETE FROM workouts WHERE id='cascade';`);
assert.equal((await db.query("SELECT * FROM exercises WHERE id='cascade-ex'")).rows.length,0);
console.log('PASS routine deletion scopes copies by ID, cascades children and rolls back on failure');

await actor(a);
for (let i=0;i<10;i++) await db.query('INSERT INTO push_subscriptions(user_id,subscription) VALUES ($1,$2)',
  [a,JSON.stringify({endpoint:`https://fcm.googleapis.com/sub-${i}`})]);
await assert.rejects(db.query('INSERT INTO push_subscriptions(user_id,subscription) VALUES ($1,$2)',
  [a,JSON.stringify({endpoint:'https://fcm.googleapis.com/sub-0'})]), /already registered/);
await assert.rejects(db.query('INSERT INTO push_subscriptions(user_id,subscription) VALUES ($1,$2)',
  [a,JSON.stringify({endpoint:'https://fcm.googleapis.com/overflow'})]), /limit reached/);
console.log('PASS subscription uniqueness and per-user device limit');

await actor('', 'postgres');
await db.exec(`ALTER TABLE exercises DROP CONSTRAINT cadu_exercises_workout_fk;
 INSERT INTO exercises(id,workout_id,name) VALUES ('old-orphan','missing-workout','Legacy');`);
await db.exec(sql);
assert.equal((await db.query("SELECT * FROM exercises WHERE id='old-orphan'")).rows.length,1);
await assert.rejects(db.exec("INSERT INTO exercises(id,workout_id,name) VALUES ('new-orphan','missing-workout','New')"), /foreign key constraint/);
console.log('PASS migration preserves legacy orphan rows while protecting new relationships');
const freshColumns = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name")).rows;
await db.close();

// Sanitized structural fixture from the deployed schema inspected on 2026-11-05.
// No production rows or account identifiers. UUID defaults use the built-in generator.
const legacySchema = `
CREATE TABLE "public"."profiles" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "photo_url" text,
  "weight" numeric,
  "height" numeric,
  "trainer_phone" text,
  "role" text NOT NULL DEFAULT 'student'::text CHECK (role = ANY (ARRAY['admin'::text, 'student'::text])),
  "status" text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'excluded'::text])),
  "modality" text CHECK (modality = ANY (ARRAY['Presencial'::text, 'Online'::text])),
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."workouts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "student_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."exercises" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workout_id" uuid NOT NULL,
  "name" text NOT NULL,
  "sets" int4 NOT NULL DEFAULT 3,
  "reps" text NOT NULL DEFAULT '10'::text,
  "rest" text DEFAULT '60s'::text,
  "notes" text,
  "current_load" numeric DEFAULT 0,
  "sort_order" int4 DEFAULT 0,
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."progress_entries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "student_id" uuid NOT NULL,
  "exercise_name" text NOT NULL,
  "load" numeric NOT NULL DEFAULT 0,
  "reps" int4 NOT NULL DEFAULT 0,
  "notes" text,
  "date" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."evolution_photos" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "student_id" uuid NOT NULL,
  "photo_url" text NOT NULL,
  "notes" text,
  "date" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."admin_routines" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "goal" text DEFAULT ''::text,
  "difficulty" text DEFAULT ''::text,
  "notes" text,
  "student_ids" TEXT[] DEFAULT '{}'::text[],
  "student_names" TEXT[] DEFAULT '{}'::text[],
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."admin_exercises" (
  "id" text NOT NULL,
  "routine_id" text NOT NULL,
  "name" text NOT NULL,
  "sets" int4 DEFAULT 3,
  "reps" text DEFAULT '10'::text,
  "rest" text DEFAULT '60s'::text,
  "notes" text,
  "video_url" text,
  "video_file_url" text,
  "sort_order" int4 DEFAULT 0,
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."custom_exercises" (
  "id" text NOT NULL,
  "title" text NOT NULL,
  "group" text DEFAULT ''::text,
  "category" text DEFAULT ''::text,
  "video_url" text,
  "video_file_url" text,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."muscle_groups" (
  "id" SERIAL NOT NULL,
  "name" text NOT NULL,
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."exercise_categories" (
  "id" SERIAL NOT NULL,
  "name" text NOT NULL,
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."agenda_events" (
  "id" uuid NOT NULL,
  "student_id" text,
  "student_name" text,
  "title" text NOT NULL,
  "date" text NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "type" text NOT NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."push_subscriptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "subscription" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."workout_logs" (
  "id" text NOT NULL,
  "student_id" uuid NOT NULL,
  "student_name" text,
  "routine_id" text NOT NULL,
  "routine_name" text NOT NULL,
  "completed_at" timestamptz NOT NULL DEFAULT now(),
  "duration_seconds" int4 NOT NULL DEFAULT 0,
  "rpe" int4 CHECK (rpe >= 0 AND rpe <= 10),
  "exercises_summary" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
CREATE TABLE "public"."exercise_muscle_groups" (
  "id" SERIAL NOT NULL,
  "name" text NOT NULL,
  PRIMARY KEY ("id")
);
ALTER TABLE "public"."progress_entries" ADD CONSTRAINT "progress_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles" ("id");
ALTER TABLE "public"."workout_logs" ADD CONSTRAINT "workout_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles" ("id");
ALTER TABLE "public"."workouts" ADD CONSTRAINT "workouts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles" ("id");
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users" ("id");
ALTER TABLE "public"."evolution_photos" ADD CONSTRAINT "evolution_photos_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles" ("id");
ALTER TABLE "public"."exercises" ADD CONSTRAINT "exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts" ("id");
ALTER TABLE "public"."admin_exercises" ADD CONSTRAINT "admin_exercises_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "public"."admin_routines" ("id");
ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id");
`;

const legacy = new PGlite();
await legacy.exec(bootstrap);
await legacy.exec(legacySchema);
const legacyWorkout = '10000000-0000-4000-8000-000000000001';
const legacyExercise = '20000000-0000-4000-8000-000000000001';
const otherWorkout = '10000000-0000-4000-8000-000000000002';
const originalColumns = (await legacy.query(`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name`)).rows;
await legacy.exec(`
  INSERT INTO auth.users(id,email) VALUES ('${a}','a@example.test'),('${b}','b@example.test'),('${admin}','admin@example.test');
  INSERT INTO profiles(id,name,email,role,status) VALUES
    ('${a}','Aluno A','a@example.test','student','active'),('${b}','Aluno B','b@example.test','student','active'),
    ('${admin}','Treinador','admin@example.test','admin','active');
  INSERT INTO admin_routines(id,name,notes,student_ids) VALUES ('legacy-routine','Rotina preservada','Manter observações',ARRAY['${a}']);
  INSERT INTO admin_exercises(id,routine_id,name) VALUES ('legacy-admin-ex','legacy-routine','Agachamento');
  INSERT INTO workouts(id,student_id,name) VALUES ('${legacyWorkout}','${a}','Treino preservado'),('${otherWorkout}','${b}','Treino preservado');
  INSERT INTO exercises(id,workout_id,name,current_load) VALUES ('${legacyExercise}','${legacyWorkout}','Agachamento',25);
  INSERT INTO progress_entries(student_id,exercise_name,load,reps) VALUES ('${a}','Agachamento',25,10);
  INSERT INTO evolution_photos(student_id,photo_url) VALUES ('${a}','storage://evolution-photos/${a}/original.jpg');
  INSERT INTO custom_exercises(id,title,"group",category) VALUES ('legacy-custom','Agachamento','Pernas','Livre');
  INSERT INTO muscle_groups(name) VALUES ('Pernas');
  INSERT INTO exercise_muscle_groups(name) VALUES ('Pernas');
  INSERT INTO exercise_categories(name) VALUES ('Livre');
  INSERT INTO agenda_events(id,student_id,title,date,start_time,end_time,type) VALUES
    ('${legacyWorkout}','${a}','Treino preservado','2026-11-05','08:00','09:00','assigned_routine');
  INSERT INTO workout_logs(id,student_id,routine_id,routine_name,rpe) VALUES ('legacy-log','${a}','legacy-routine','Rotina preservada',7);
  INSERT INTO push_subscriptions(user_id,subscription) VALUES ('${a}','{"endpoint":"https://fcm.googleapis.com/legacy-device"}');
`);
const originalRows = new Map();
for (const table of new Set(originalColumns.map(column => column.table_name))) {
  const columns = originalColumns.filter(column => column.table_name === table).map(column => '"' + column.column_name + '"').join(',');
  originalRows.set(table, { columns, rows: (await legacy.query(`SELECT ${columns} FROM "${table}" ORDER BY id`)).rows });
}
await legacy.exec(sql);
await legacy.exec(sql);
assert.deepEqual((await legacy.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name")).rows, freshColumns);
const migratedColumns = (await legacy.query(`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name`)).rows;
for (const column of originalColumns) {
  assert.deepEqual(migratedColumns.find(item => item.table_name === column.table_name && item.column_name === column.column_name), column);
}
for (const [table, original] of originalRows) {
  assert.deepEqual((await legacy.query(`SELECT ${original.columns} FROM "${table}" ORDER BY id`)).rows, original.rows);
}
console.log('PASS deployed UUID schema gains every fresh-schema column without changing existing rows, types or constraints');

async function legacyActor(id) {
  await legacy.exec('RESET ROLE');
  await legacy.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id]);
  await legacy.exec('SET ROLE authenticated');
}
await legacyActor(admin);
// These are the current app's complete prescription payloads, including every newly added field.
await legacy.query(`INSERT INTO admin_routines(id,name,goal,difficulty,day_of_week,muscle_group,general_notes,notes,student_ids,student_names,start_date,end_date,routine_group_name)
  VALUES ('new-routine','Rotina completa','Força','Intermediário','Segunda','Pernas','Notas gerais','Observação',$1,$2,'2026-11-05','2026-12-05','Ciclo A')`,[[a],['Aluno A']]);
await legacy.exec(`INSERT INTO admin_exercises(id,routine_id,name,sets,reps,rest,notes,video_url,video_file_url,combined_with_next,combined_group,prescribed_loads,sort_order)
  VALUES ('new-admin-ex','new-routine','Agachamento',3,'10','60s','Nota',NULL,'storage://exercise-videos/exercises/test.mp4',TRUE,'pair-a','[25,30,35]',0);
  INSERT INTO custom_exercises(id,title,"group",category,video_url,video_file_url,image,description,is_custom)
  VALUES ('new-custom','Exercício','Pernas','Livre',NULL,NULL,'image.jpg','Descrição',TRUE);
  UPDATE workouts SET routine_id='new-routine' WHERE id='${legacyWorkout}';
  UPDATE exercises SET prescribed_loads='[25,30,35]' WHERE id='${legacyExercise}';
`);
assert.deepEqual((await legacy.query("SELECT combined_with_next,combined_group,prescribed_loads FROM admin_exercises WHERE id='new-admin-ex'")).rows[0],
  {combined_with_next:true,combined_group:'pair-a',prescribed_loads:[25,30,35]});
assert.equal((await legacy.query("SELECT day_of_week FROM admin_routines WHERE id='new-routine'")).rows[0].day_of_week,'Segunda');
await legacyActor(a);
assert.deepEqual((await legacy.query('SELECT id FROM workouts')).rows.map(row=>row.id),[legacyWorkout]);
assert.equal((await legacy.query("SELECT * FROM admin_routines WHERE id='new-routine'")).rows.length,1);
await legacy.query('UPDATE profiles SET updated_at=now(),name=$1 WHERE id=$2',['Aluno atualizado',a]);
await legacy.query(`INSERT INTO progress_entries(id,student_id,exercise_name,load,reps,notes,date) VALUES ($1,$2,'Agachamento',35,10,'Concluído','2026-11-05T12:00:00Z')`,
  ['30000000-0000-4000-8000-000000000001',a]);
await legacy.query(`INSERT INTO evolution_photos(id,student_id,photo_url,notes,date) VALUES ($1,$2,$3,'Evolução','2026-11-05T12:00:00Z')`,
  ['40000000-0000-4000-8000-000000000001',a,`storage://evolution-photos/${a}/new.jpg`]);
await legacy.query(`INSERT INTO workout_logs(id,student_id,student_name,routine_id,routine_name,completed_at,duration_seconds,rpe,exercises_summary,comment)
  VALUES ('new-log',$1,'Aluno A','new-routine','Rotina completa','2026-11-05T12:00:00Z',600,7,'[]','Treino concluído')`,[a]);
assert.equal((await legacy.query("SELECT comment FROM workout_logs WHERE id='new-log'")).rows[0].comment,'Treino concluído');
for (const type of ['trainer_notification','student_file','evolution_photo']) {
  await legacy.query(`INSERT INTO agenda_events(id,student_id,student_name,title,date,start_time,end_time,type,notes)
    VALUES (gen_random_uuid(),$1,'Aluno A','Registro','2026-11-05','12:00','12:00',$2,'{}')`,[a,type]);
}
await assert.rejects(legacy.query('INSERT INTO progress_entries(id,student_id,exercise_name) VALUES ($1,$2,$3)',['timestamp-id',a,'Exercício']),/invalid input syntax for type uuid/);
await assert.rejects(legacy.query('INSERT INTO progress_entries(student_id,exercise_name) VALUES ($1,$2)',[b,'Exercício']),/row-level security/);
console.log('PASS current prescription, profile, progress, media, log and agenda writes on migrated deployed schema');

await legacyActor(admin);
assert.equal((await legacy.query('SELECT delete_workout_assignment($1,$2) AS deleted',[legacyWorkout,b])).rows[0].deleted,false);
assert.equal((await legacy.query('SELECT delete_workout_assignment($1,$2) AS deleted',[legacyWorkout,a])).rows[0].deleted,true);
assert.equal((await legacy.query('SELECT * FROM exercises WHERE id=$1',[legacyExercise])).rows.length,0);
assert.equal((await legacy.query('SELECT * FROM workouts WHERE id=$1',[otherWorkout])).rows.length,1);
assert.equal((await legacy.query("SELECT delete_admin_routine('legacy-routine') AS deleted")).rows[0].deleted,true);
assert.equal((await legacy.query("SELECT * FROM admin_exercises WHERE id='legacy-admin-ex'")).rows.length,0);
console.log('PASS deletion RPCs support pre-existing UUID foreign keys without deleting another student assignment');
await legacy.close();
