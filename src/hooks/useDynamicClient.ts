import { useClientAuth } from "@/hooks/useClientAuth";
import { createClientSupabase } from "@/lib/createClientSupabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export function useDynamicClient(): SupabaseClient | null {
  const { auth } = useClientAuth();
  if (!auth?.client_supabase_url || !auth?.client_supabase_anon_key) return null;
  return createClientSupabase(auth.client_supabase_url, auth.client_supabase_anon_key);
}
