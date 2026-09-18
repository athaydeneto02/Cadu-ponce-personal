import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

const tables = [
  'profiles',
  'workouts',
  'exercises',
  'admin_routines',
  'admin_exercises',
  'custom_exercises',
  'agenda_events',
  'exercise_muscle_groups',
  'exercise_categories',
  'workout_logs',
  'progress',
  'photos',
  'assessments',
  'financial_records',
  'notifications'
];

async function run() {
  console.log('--- SUPABASE AUDIT ---');
  for (const t of tables) {
    try {
      const { data, error, count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`❌ Table [${t}]: Error - ${error.message} (Code: ${error.code})`);
      } else {
        console.log(`✅ Table [${t}]: OK - Count: ${count}`);
      }
    } catch (e) {
      console.log(`💥 Table [${t}]: Exception - ${e.message}`);
    }
  }

  // Storage
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  console.log('--- STORAGE BUCKETS ---');
  if (bErr) console.log('❌ Buckets error:', bErr.message);
  else console.log('Buckets:', buckets);
}

run();
