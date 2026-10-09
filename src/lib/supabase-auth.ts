/**
 * supabase-auth.ts
 *
 * Re-exporta o cliente único do supabase.ts.
 * Mantido para compatibilidade com imports existentes.
 * NÃO cria uma nova instância — evita o aviso "Multiple GoTrueClient instances".
 */
export { supabaseAuth } from "@/lib/supabase";
