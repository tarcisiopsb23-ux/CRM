/**
 * Color configuration for pre-qualification status fields.
 * Each entry maps a field value → { label, className (Tailwind bg+text) }
 */

export const GMN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  nao_possui:               { label: "Não possui",            className: "bg-red-100 text-red-700 border-red-200" },
  desatualizado_desativado: { label: "Desatualizado/Desativ.", className: "bg-orange-100 text-orange-700 border-orange-200" },
  desatualizado:            { label: "Desatualizado",          className: "bg-amber-100 text-amber-700 border-amber-200" },
  incompleto:               { label: "Incompleto",             className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  completo:                 { label: "Completo",               className: "bg-green-100 text-green-700 border-green-200" },
};

export const ADS_LEVEL_CONFIG: Record<string, { label: string; className: string }> = {
  conta_nao_encontrada: { label: "Conta não encontrada", className: "bg-muted text-muted-foreground border-border" },
  sem_anuncios:         { label: "Sem anúncios",         className: "bg-red-100 text-red-700 border-red-200" },
  poucos_anuncios:      { label: "Poucos anúncios",      className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  muitos_anuncios:      { label: "Muitos anúncios",      className: "bg-green-100 text-green-700 border-green-200" },
};

export const SOCIAL_MEDIA_CONFIG: Record<string, { label: string; className: string }> = {
  sem_frequencia:            { label: "Sem frequência",         className: "bg-red-100 text-red-700 border-red-200" },
  parado_inexistente:        { label: "Parado/Inexistente",     className: "bg-orange-100 text-orange-700 border-orange-200" },
  frequente_sem_estrategia:  { label: "Frequente s/ estratégia", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  frequente_estruturado:     { label: "Frequente/Estruturado",  className: "bg-green-100 text-green-700 border-green-200" },
};

/** Returns a colored badge className + label for any of the four fields. */
export function getStatusConfig(
  field: "gmn" | "ads" | "social",
  value: string | null | undefined
): { label: string; className: string } | null {
  if (!value) return null;
  const map =
    field === "gmn"    ? GMN_STATUS_CONFIG :
    field === "ads"    ? ADS_LEVEL_CONFIG  :
    /* social */         SOCIAL_MEDIA_CONFIG;
  return map[value] ?? null;
}
