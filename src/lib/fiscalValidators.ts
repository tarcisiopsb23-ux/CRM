/**
 * fiscalValidators.ts
 * Funções puras de validação e utilitários para o módulo Fiscal NFS-e.
 * Sem dependências React — testáveis de forma isolada.
 */

import type { NotaasConfig, ServicoMapping } from "@/types/fiscal";

/**
 * Valida CNPJ: aceita string com exatamente 14 dígitos numéricos
 * (após remoção de formatação como pontos, barras e hífens).
 */
export function validateCnpj(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return digits.length === 14;
}

/**
 * Valida alíquota ISS: aceita valores numéricos no intervalo [0, 100].
 */
export function validateAliquota(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Valida competência: aceita strings no formato YYYY-MM
 * onde MM está entre 01 e 12 inclusive.
 */
export function validateCompetencia(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = parseInt(value.slice(5, 7), 10);
  return month >= 1 && month <= 12;
}

/**
 * Valida valor do serviço: aceita apenas valores estritamente maiores que 0.
 */
export function validateValorServico(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Mascara a API key para exibição segura.
 * Retorna formato `sk_****xxxx` expondo no máximo os últimos 4 caracteres.
 * Para strings com 4 ou menos caracteres, retorna `****`.
 */
export function maskApiKey(value: string): string {
  if (!value) return "****";
  if (value.length <= 4) return "****";
  const prefix = value.startsWith("sk_") ? "sk_" : value.slice(0, 3);
  const suffix = value.slice(-4);
  return `${prefix}****${suffix}`;
}

/**
 * Resolve o código de serviço LC 116 seguindo a hierarquia:
 * 1. Mapeamento por tipo de contrato em `codigos_servico_por_tipo_contrato`
 * 2. Fallback para `codigo_servico_padrao`
 * 3. String vazia se nenhum configurado
 *
 * Suporta tanto o formato legado (string) quanto o novo (ServicoMapping).
 */
export function resolveCodigoServico(
  contractType: string | null | undefined,
  config: NotaasConfig
): string {
  if (contractType && config.codigos_servico_por_tipo_contrato) {
    const mapped = config.codigos_servico_por_tipo_contrato[contractType];
    if (mapped) {
      return typeof mapped === "string" ? mapped : mapped.codigo;
    }
  }
  return config.codigo_servico_padrao ?? "";
}

/**
 * Resolve o mapeamento completo de serviço para um tipo de contrato.
 * Retorna o ServicoMapping se existir, ou null se não houver mapeamento.
 * Suporta tanto o formato legado (string) quanto o novo (ServicoMapping).
 */
export function resolveServicoMapping(
  contractType: string | null | undefined,
  config: NotaasConfig
): ServicoMapping | null {
  if (!contractType || !config.codigos_servico_por_tipo_contrato) return null;
  const mapped = config.codigos_servico_por_tipo_contrato[contractType];
  if (!mapped) return null;
  if (typeof mapped === "string") return { codigo: mapped };
  return mapped;
}

/**
 * Deriva a competência (YYYY-MM) a partir de uma data ISO 8601.
 * Usa o mês e ano da data fornecida.
 */
export function deriveCompetencia(paidAt: string): string {
  const d = new Date(paidAt);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
