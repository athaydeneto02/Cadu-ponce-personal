import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Trying to insert exercise with invalid uuid...');
  const { data, error } = await supabase.from('exercises').insert({
    id: 'ex_123',
    workout_id: '5e0b2ac4-ec33-4170-8aa2-0606e6c2de20',
    name: 'test'
  });
  console.log('Exercises insert result:', error || data);
}
test();
