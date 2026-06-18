import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Trying to insert workout without auth...');
  const { data, error } = await supabase.from('workouts').insert({
    id: 'test_123',
    student_id: 'some_id',
    name: 'test'
  });
  console.log('Workouts insert result:', error || data);
}
test();
