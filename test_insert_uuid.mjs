import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const uuid = crypto.randomUUID();
  console.log('Trying to insert workout with UUID:', uuid);
  const { data, error } = await supabase.from('workouts').insert({
    id: uuid,
    student_id: crypto.randomUUID(),
    name: 'test'
  });
  console.log('Workouts insert result:', error || data);
}
test();
