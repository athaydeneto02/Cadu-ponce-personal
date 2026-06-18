import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Signing in as João...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'joao@email.com',
    password: 'password123' // wait, I don't know the exact password. I'll just check all workouts as admin if I can.
  });
  console.log(authErr || 'Success');
}
test();
