import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://umqjakmxhfgclcxmpfda.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcWpha214aGZnY2xjeG1wZmRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQyNzcxMjQsImV4cCI6MjAyNTg1MzEyNH0.xyz'; // Wait, I don't know the exact key, let me parse it from .env

import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const { data: routines, error: rErr } = await supabase.from('admin_routines').select('id');
  console.log('admin_routines:', rErr ? rErr.message : routines.length + ' rows');

  const { data: agenda, error: aErr } = await supabase.from('agenda_events').select('id, type');
  console.log('agenda_events:', aErr ? aErr.message : agenda.length + ' rows');

  const { data: exercises, error: eErr } = await supabase.from('custom_exercises').select('id');
  console.log('custom_exercises:', eErr ? eErr.message : exercises.length + ' rows');
}
check();
