import { createClient } from "@supabase/supabase-js";

// Access environment variables (Vite uses import.meta.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase keys in .env file");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
