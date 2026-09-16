import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const { data: agenda, error: aErr } = await supabase.from('agenda_events').select('*');
  console.log(JSON.stringify(agenda, null, 2));
}
check();
