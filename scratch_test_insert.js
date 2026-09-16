import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const { error } = await supabase.from('custom_exercises').insert({
    id: 'test_123',
    title: 'test',
    group: 'test',
    category: 'test'
  });
  console.log('insert error:', error ? error.message : 'Success');
}
check();
