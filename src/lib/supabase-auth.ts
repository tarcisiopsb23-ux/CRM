import { createClient } from "@supabase/supabase-js";

const saasUrl = import.meta.env.VITE_SAAS_URL;
const saasAnonKey = import.meta.env.VITE_SAAS_ANON_KEY;

export const supabaseAuth = createClient(
  saasUrl || "",
  saasAnonKey || "",
  {
    auth: {
      persistSession: true,
      storageKey: "c8control-saas-auth",
      storage: window.localStorage,
      autoRefreshToken: true,
    },
  }
);

// Retorna o JWT da sessão SaaS atual (para injetar no CRM client)
export function getSaasToken(): string | null {
  const raw = window.localStorage.getItem("c8control-saas-auth");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}
