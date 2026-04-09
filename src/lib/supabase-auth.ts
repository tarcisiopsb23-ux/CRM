/**
 * supabase-auth.ts
 *
 * Autenticação agora usa diretamente o banco CRM (xcymhcqbyyuozkzhpxgi).
 * Não há mais dependência do Maestr.ia / SaaS externo.
 *
 * O custom_access_token_hook no CRM injeta tenant_id e role no JWT.
 * O supabaseCrm em supabase.ts usa a mesma sessão — sem necessidade de
 * injetar token manualmente, pois auth e dados estão no mesmo projeto.
 */
import { createClient } from "@supabase/supabase-js";

const crmUrl     = import.meta.env.VITE_SUPABASE_URL;
const crmAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseAuth = createClient(
  crmUrl     || "",
  crmAnonKey || "",
  {
    auth: {
      persistSession:   true,
      storageKey:       "c8control-auth",
      storage:          window.localStorage,
      autoRefreshToken: true,
    },
  }
);
