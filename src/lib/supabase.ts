/**
 * supabase.ts
 *
 * Cliente único do Supabase — auth e dados no mesmo projeto.
 * supabaseAuth e supabaseCrm são o MESMO objeto para evitar
 * múltiplas instâncias GoTrueClient (que causam conflito de sessão).
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: Variáveis de ambiente do Supabase não encontradas!");
}

// Cliente único compartilhado por toda a aplicação
const _client = createClient(
  supabaseUrl || "",
  supabaseKey || "",
  {
    auth: {
      persistSession:   true,
      storageKey:       "c8control-auth",
      storage:          window.localStorage,
      autoRefreshToken: true,
    },
  }
);

export const supabaseCrm  = _client;
export const supabase     = _client; // alias legado
export const supabaseAuth = _client; // alias — mesmo cliente, sem duplicação
