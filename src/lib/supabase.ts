/**
 * supabase.ts — C8 Control
 *
 * Cliente único do Supabase apontando para o Banco A.
 * supabaseAuth e supabaseCrm são aliases do mesmo objeto
 * para evitar múltiplas instâncias GoTrueClient.
 *
 * storageKey diferente do Maestr.ia para não conflitar sessões
 * quando ambos estiverem abertos no mesmo navegador.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  console.error("[C8 Control] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontrados.");
}

const _client = createClient(
  supabaseUrl || "",
  supabaseKey || "",
  {
    auth: {
      persistSession:   true,
      storageKey:       "c8control-auth",   // chave separada do Maestr.ia
      storage:          window.localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export const supabase     = _client;
export const supabaseCrm  = _client;
export const supabaseAuth = _client;
