import { createClient, SupabaseClient } from "@supabase/supabase-js";

const clientCache = new Map<string, SupabaseClient>();

export function createClientSupabase(url: string, key: string): SupabaseClient {
  const cacheKey = `${url}::${key}`;
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clientCache.set(cacheKey, client);
  return client;
}
