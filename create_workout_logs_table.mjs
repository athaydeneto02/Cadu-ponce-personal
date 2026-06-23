import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log('Checking workout_logs table...');

  // Check if table exists by trying to select from it
  const { data, error } = await supabase.from('workout_logs').select('id').limit(1);

  if (!error) {
    console.log('✅ workout_logs table already exists and is accessible!');
    return;
  }

  if (error.code === '42P01') {
    console.log('❌ Table does not exist yet.');
    console.log('\n📋 Please run this SQL in your Supabase dashboard → SQL Editor:\n');
    console.log(`CREATE TABLE IF NOT EXISTS workout_logs (
  id              TEXT PRIMARY KEY,
  student_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_name    TEXT,
  routine_id      TEXT NOT NULL,
  routine_name    TEXT NOT NULL,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  rpe             INTEGER CHECK (rpe >= 0 AND rpe <= 10),
  exercises_summary JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_logs_student_id ON workout_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_completed_at ON workout_logs(completed_at DESC);

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own workout logs"
  ON workout_logs FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admins read all workout logs"
  ON workout_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );`);
  } else {
    console.log('Status da tabela:', error.message, '(code:', error.code, ')');
  }
}

run().catch(console.error);
