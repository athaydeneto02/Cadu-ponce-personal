import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function createStudent() {
  console.log('Creating real Aluno Teste in Supabase...');
  const { data, error } = await supabase.auth.signUp({
    email: 'alunoteste@gmail.com',
    password: 'password123',
  });
  
  if (error) {
    console.error('Error creating user:', error);
    return;
  }
  
  console.log('User created:', data.user?.id);
  
  if (data.user) {
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      name: 'Aluno Teste',
      role: 'student',
      status: 'active'
    });
    console.log('Profile created:', profileError || 'Success');
  }
}

createStudent();
