/**
 * useConversionMetrics
 * Gerencia a configuração de mapeamento de métricas de conversão por cliente
 * e os registros manuais de lead/venda quando não há dados automáticos.
 *
 * Configuração: salva em clients.metadata.conversion_metrics (jsonb — sem migration)
 * Registros manuais: salva em client_kpi_history com kpi_id dos KPIs especiais
 *   __lead_manual e __sale_manual (criados automaticamente se não existirem)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format, startOfMonth, parseISO } from "date-fns";

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Um campo de conversão pode ser:
 * - Um dos campos fixos: "leads", "clicks", "sales", "revenue", "manual"
 * - Um objective_metric_label dinâmico vindo da campaign_data (ex: "Compras", "Adições ao carrinho")
 * - "none" → não mapear (funil adaptativo sem essa métrica)
 */
export type ConversionField = string; // inclui campos fixos, labels dinâmicos, "manual", "none"

export interface ConversionMetricsConfig {
  /** Campos que contam como Lead — pode ser múltiplos ou vazio */
  lead_fields: ConversionField[];
  /** Campos que contam como Venda/Compra — pode ser múltiplos ou vazio */
  sale_fields: ConversionField[];
  // Retrocompatibilidade com versão anterior (campo único)
  lead_field?: string;
  sale_field?: string;
}

export interface ConversionMetricsEntry {
  id: string;
  month_year: string; // "yyyy-MM-dd" (primeiro dia do mês)
  leads_manual: number | null;
  sales_manual: number | null;
}

const DEFAULT_CONFIG: ConversionMetricsConfig = {
  lead_fields: ["leads"],
  sale_fields: ["sales"],
};

/** Resolve config salva — suporta formato antigo (campo único) e novo (array) */
export function normalizeConfig(raw: any): ConversionMetricsConfig {
  if (!raw) return DEFAULT_CONFIG;
  // Novo formato
  if (Array.isArray(raw.lead_fields) || Array.isArray(raw.sale_fields)) {
    return {
      lead_fields: Array.isArray(raw.lead_fields) ? raw.lead_fields : [],
      sale_fields: Array.isArray(raw.sale_fields) ? raw.sale_fields : [],
    };
  }
  // Formato antigo (retrocompatibilidade)
  return {
    lead_fields: raw.lead_field && raw.lead_field !== "none" ? [raw.lead_field] : [],
    sale_fields: raw.sale_field && raw.sale_field !== "none" ? [raw.sale_field] : [],
    lead_field: raw.lead_field,
    sale_field: raw.sale_field,
  };
}

/**
 * Dado um array de campos configurados e um row da campaign_data,
 * retorna o valor agregado para aquele row.
 * - Campos fixos: acessa diretamente r[field]
 * - Campos dinâmicos (objective_metric_label): usa r.objective_metric_value se r.objective_metric_label === field
 * - "manual": retorna 0 (preenchido separadamente)
 * - "none" / vazio: retorna 0
 */
export function resolveFieldValue(
  row: Record<string, any>,
  fields: ConversionField[]
): number {
  if (!fields || fields.length === 0) return 0;
  let total = 0;
  const fixedFields = ["leads", "clicks", "sales", "revenue", "impressions", "reach", "spend",
                       "objective_metric_value"];
  for (const field of fields) {
    if (!field || field === "none" || field === "manual") continue;
    if (fixedFields.includes(field)) {
      total += Number(row[field] ?? 0);
    } else {
      // Campo dinâmico = objective_metric_label corresponde ao valor
      if (row.objective_metric_label === field) {
        total += Number(row.objective_metric_value ?? 0);
      }
    }
  }
  return total;
}

/** Retrocompatibilidade: mantém as funções antigas */
export function resolveLeadValue(
  row: Record<string, number | undefined | null>,
  field: string
): number {
  return resolveFieldValue(row as Record<string, any>, field && field !== "none" ? [field] : []);
}

export function resolveSaleValue(
  row: Record<string, number | undefined | null>,
  field: string
): number {
  return resolveFieldValue(row as Record<string, any>, field && field !== "none" ? [field] : []);
}

// ─── Nomes especiais dos KPIs de registro manual ─────────────────────────────

export const MANUAL_LEAD_KPI_NAME = "__lead_manual";
export const MANUAL_SALE_KPI_NAME = "__sale_manual";

export function useConversionMetricsConfig(
  organizationId: string | undefined,
  clientId: string | undefined
) {
  const qc = useQueryClient();

  const query = useQuery<ConversionMetricsConfig>({
    queryKey: ["conversion_metrics_config", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return DEFAULT_CONFIG;
      const { data, error } = await supabase
        .from("clients")
        .select("metadata")
        .eq("id", clientId)
        .single();
      if (error || !data) return DEFAULT_CONFIG;
      const meta = (data.metadata ?? {}) as Record<string, unknown>;
      const saved = meta.conversion_metrics;
      return normalizeConfig(saved);
    },
    enabled: !!organizationId && !!clientId,
  });

  const save = useMutation({
    mutationFn: async (config: ConversionMetricsConfig) => {
      if (!organizationId || !clientId) throw new Error("IDs ausentes");
      // Lê metadata atual para fazer merge seguro
      const { data: current } = await supabase
        .from("clients")
        .select("metadata")
        .eq("id", clientId)
        .single();
      const currentMeta = ((current?.metadata ?? {}) as Record<string, unknown>);
      const { error } = await supabase
        .from("clients")
        .update({ metadata: { ...currentMeta, conversion_metrics: config } })
        .eq("id", clientId);
      if (error) throw error;
      return config;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversion_metrics_config", organizationId, clientId] });
      qc.invalidateQueries({ queryKey: ["clients", organizationId] });
    },
  });

  return { ...query, save };
}

// ─── Hook de registros manuais ────────────────────────────────────────────────

export function useConversionMetricsEntries(
  organizationId: string | undefined,
  clientId: string | undefined
) {
  const qc = useQueryClient();

  // Garante que os KPIs especiais existam, retorna seus IDs
  const kpiIdsQuery = useQuery<{ leadKpiId: string; saleKpiId: string } | null>({
    queryKey: ["conversion_metrics_kpi_ids", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return null;

      const { data: existing } = await supabase
        .from("client_kpis")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .in("name", [MANUAL_LEAD_KPI_NAME, MANUAL_SALE_KPI_NAME]);

      const existingLead = existing?.find((k) => k.name === MANUAL_LEAD_KPI_NAME);
      const existingSale = existing?.find((k) => k.name === MANUAL_SALE_KPI_NAME);

      let leadKpiId = existingLead?.id;
      let saleKpiId = existingSale?.id;

      if (!leadKpiId) {
        const { data } = await supabase
          .from("client_kpis")
          .insert({
            organization_id: organizationId,
            client_id: clientId,
            name: MANUAL_LEAD_KPI_NAME,
            category: "Conversão",
            unit: "number",
            is_predefined: false,
          })
          .select("id")
          .single();
        leadKpiId = data?.id;
      }

      if (!saleKpiId) {
        const { data } = await supabase
          .from("client_kpis")
          .insert({
            organization_id: organizationId,
            client_id: clientId,
            name: MANUAL_SALE_KPI_NAME,
            category: "Conversão",
            unit: "number",
            is_predefined: false,
          })
          .select("id")
          .single();
        saleKpiId = data?.id;
      }

      if (!leadKpiId || !saleKpiId) return null;
      return { leadKpiId, saleKpiId };
    },
    enabled: !!organizationId && !!clientId,
  });

  // Busca todos os registros mensais dos dois KPIs especiais
  const entriesQuery = useQuery<ConversionMetricsEntry[]>({
    queryKey: ["conversion_metrics_entries", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId || !kpiIdsQuery.data) return [];
      const { leadKpiId, saleKpiId } = kpiIdsQuery.data;

      const { data, error } = await supabase
        .from("client_kpi_history")
        .select("id, kpi_id, month_year, value")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .in("kpi_id", [leadKpiId, saleKpiId])
        .order("month_year", { ascending: false });

      if (error || !data) return [];

      // Agrupa por mês: combina lead e sale no mesmo objeto
      const byMonth = new Map<string, ConversionMetricsEntry>();

      for (const row of data) {
        const mk = format(parseISO(row.month_year), "yyyy-MM");
        if (!byMonth.has(mk)) {
          byMonth.set(mk, {
            id: row.id,
            month_year: row.month_year,
            leads_manual: null,
            sales_manual: null,
          });
        }
        const entry = byMonth.get(mk)!;
        if (row.kpi_id === leadKpiId) {
          entry.leads_manual = row.value;
          entry.id = row.id; // usa o id do lead como referência
        } else if (row.kpi_id === saleKpiId) {
          entry.sales_manual = row.value;
        }
      }

      return Array.from(byMonth.values());
    },
    enabled: !!organizationId && !!clientId && !!kpiIdsQuery.data,
  });

  // Upsert de um mês (salva lead e/ou venda)
  const upsertEntry = useMutation({
    mutationFn: async ({
      monthYear,
      leadsManual,
      salesManual,
    }: {
      monthYear: string; // "yyyy-MM-dd"
      leadsManual: number | null;
      salesManual: number | null;
    }) => {
      if (!organizationId || !clientId || !kpiIdsQuery.data) throw new Error("IDs ausentes");
      const { leadKpiId, saleKpiId } = kpiIdsQuery.data;

      const ops: Promise<unknown>[] = [];

      if (leadsManual !== null) {
        ops.push(
          Promise.resolve(
            supabase.from("client_kpi_history").upsert(
              {
                organization_id: organizationId,
                client_id: clientId,
                kpi_id: leadKpiId,
                month_year: monthYear,
                value: leadsManual,
              },
              { onConflict: "kpi_id, month_year" }
            )
          )
        );
      }

      if (salesManual !== null) {
        ops.push(
          Promise.resolve(
            supabase.from("client_kpi_history").upsert(
              {
                organization_id: organizationId,
                client_id: clientId,
                kpi_id: saleKpiId,
                month_year: monthYear,
                value: salesManual,
              },
              { onConflict: "kpi_id, month_year" }
            )
          )
        );
      }

      await Promise.all(ops);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversion_metrics_entries", organizationId, clientId] });
    },
  });

  // Remove os registros de um mês (lead + venda)
  const removeEntry = useMutation({
    mutationFn: async (monthYear: string) => {
      if (!organizationId || !clientId || !kpiIdsQuery.data) throw new Error("IDs ausentes");
      const { leadKpiId, saleKpiId } = kpiIdsQuery.data;
      await supabase
        .from("client_kpi_history")
        .delete()
        .eq("client_id", clientId)
        .in("kpi_id", [leadKpiId, saleKpiId])
        .eq("month_year", monthYear);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversion_metrics_entries", organizationId, clientId] });
    },
  });

  return {
    kpiIds: kpiIdsQuery.data,
    entries: entriesQuery.data ?? [],
    isLoading: kpiIdsQuery.isLoading || entriesQuery.isLoading,
    upsertEntry,
    removeEntry,
  };
}
