import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: Variáveis de ambiente do Supabase não encontradas!");
}

export const supabase = createClient(
  supabaseUrl || "",
  supabaseKey || "",
  {
    auth: {
      persistSession: true,
      storageKey: "c8control-auth",
      storage: window.localStorage,
      autoRefreshToken: true,
    },
  }
);
