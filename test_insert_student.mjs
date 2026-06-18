import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const uuid = crypto.randomUUID();
  console.log('Trying to insert workout with string student_id...');
  const { data, error } = await supabase.from('workouts').insert({
    id: uuid,
    student_id: 'student_joao',
    name: 'test'
  });
  console.log('Workouts insert result:', error || data);
}
test();
