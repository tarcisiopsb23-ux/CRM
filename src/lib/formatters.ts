export function onlyDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\D/g, "");
}

/**
 * Formata um código numérico de entidade com prefixo e zero-padding.
 * Ex: formatEntityCode("CLI", 7) → "CLI-0007"
 *     formatEntityCode("PRJ", null) → "—"
 */
export function formatEntityCode(
  prefix: "CLI" | "PRJ" | "FOR",
  code: number | null | undefined
): string {
  if (code == null) return "—";
  return `${prefix}-${String(code).padStart(4, "0")}`;
}

export function formatBRL(value: number | null | undefined): string {
  const n = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function formatPhoneBR(value: string | number | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return value == null ? "" : String(value);
}

export function formatCpfCnpj(value: string | number | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value == null ? "" : String(value);
}


/**
 * Formata um valor de KPI com no máximo 2 casas decimais.
 * - currency: R$ 1.250,00
 * - percentage: 15,50%
 * - number: 1.250,50 (ou inteiro se sem decimais)
 */
export function fmtKpiValue(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) return "—";
  if (unit === "currency") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  }
  if (unit === "percentage") {
    return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v)}%`;
  }
  // number: sem casas decimais se inteiro, até 2 se tiver decimal
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}
