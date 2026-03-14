export const DEFAULT_JOB_TITLES = [
  "CEO",
  "CFO",
  "CMO",
  "COO",
  "VP",
  "Gerente",
  "Supervisor",
  "Assistente",
  "Analista Júnior",
  "Analista Pleno",
  "Analista Sênior",
  "Produtor",
  "Técnico",
  "Auxiliar Administrativo",
  "Estagiário",
  "Serviços Gerais",
] as const;

export function normalizeJobTitle(value: unknown) {
  return String(value ?? "").trim();
}

export function getJobTitleFromProfileMetadata(metadata: unknown) {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  return normalizeJobTitle(meta.job_title ?? meta.cargo ?? "");
}

export function getJobTitleOptions(input: {
  profiles?: Array<{ metadata?: unknown }>;
  mappingTitles?: string[];
  extra?: string[];
  includeDefaults?: boolean;
}) {
  const set = new Set<string>(input.includeDefaults === false ? [] : DEFAULT_JOB_TITLES);

  for (const t of input.extra ?? []) {
    const v = normalizeJobTitle(t);
    if (v) set.add(v);
  }

  for (const t of input.mappingTitles ?? []) {
    const v = normalizeJobTitle(t);
    if (v) set.add(v);
  }

  for (const p of input.profiles ?? []) {
    const jt = getJobTitleFromProfileMetadata(p.metadata);
    if (jt) set.add(jt);
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
