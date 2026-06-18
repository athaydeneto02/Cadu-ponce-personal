import { supabase } from './src/lib/supabase.ts'; async function check() { const {data, error} = await supabase.rpc('get_policies'); console.log(data, error); } check();  
