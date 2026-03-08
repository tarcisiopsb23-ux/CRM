import type { Json } from "@/types/supabase";

/** Converte Record<string, unknown> para Json (compatível com colunas JSONB do Supabase) */
export function toJson(value: Record<string, unknown> | null | undefined): Json | undefined {
  if (value === null || value === undefined) return undefined;
  return value as Json;
}
