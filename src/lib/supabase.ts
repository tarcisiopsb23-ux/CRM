import { createClient } from "@supabase/supabase-js";
import { getSaasToken } from "./supabase-auth";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: Variáveis de ambiente do Supabase não encontradas!");
}

// Cliente CRM com JWT do SaaS injetado dinamicamente
export const supabaseCrm = createClient(
  supabaseUrl || "",
  supabaseKey || "",
  {
    auth: { persistSession: false },
    global: {
      fetch: (url, options = {}) => {
        const token = getSaasToken();
        const headers = new Headers((options as RequestInit).headers ?? {});
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(url, { ...options, headers });
      },
    },
  }
);

// Re-export do cliente legado para compatibilidade com hooks existentes
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
