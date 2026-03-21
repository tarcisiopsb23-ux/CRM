import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO CRÍTICO: Variáveis de ambiente do Supabase não encontradas!", {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
    env: import.meta.env
  });
}

export const supabase = createClient(
  supabaseUrl || "",
  supabaseKey || "",
  {
    auth: {
      persistSession: true,
      storageKey: 'maestr-ia-auth-session',
      storage: window.sessionStorage, // Usar sessionStorage para limpar ao fechar a aba
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
