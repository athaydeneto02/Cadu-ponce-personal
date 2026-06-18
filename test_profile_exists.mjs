import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkProfile() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'alunoteste@gmail.com',
    password: 'password123',
  });
  
  if (data.user) {
    console.log('Logged in! Fetching profile...');
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
    console.log('Profile:', profile);
  } else {
    console.log('Login failed:', error);
  }
}

checkProfile();
