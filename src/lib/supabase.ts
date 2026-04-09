/**
 * supabase.ts
 *
 * Auth e dados agora estão no mesmo projeto Supabase (CRM).
 * supabaseCrm e supabase são o mesmo cliente — sem injeção manual de JWT.
 * O Supabase JS gerencia a sessão e envia o Authorization header automaticamente.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: Variáveis de ambiente do Supabase não encontradas!");
}

export const supabaseCrm = createClient(
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

// Alias para compatibilidade com código legado que importa `supabase`
export const supabase = supabaseCrm;
