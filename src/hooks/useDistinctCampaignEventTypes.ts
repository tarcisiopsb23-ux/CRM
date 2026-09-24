/**
 * useDistinctCampaignEventTypes
 * Busca os objective_metric_label distintos que chegaram na campaign_data de um cliente.
 * Usado para popular os selects de "O que conta como Lead" e "O que conta como Venda"
 * com os eventos reais que vieram do Pixel do Meta e Google Tag.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CampaignEventType {
  label: string;           // objective_metric_label (ex: "Leads", "Compras", "Adições ao carrinho")
  objective: string | null; // objetivo da campanha (ex: "OUTCOME_LEADS", "OUTCOME_SALES")
  platform: string | null;  // "meta" | "google"
}

// Campos fixos sempre disponíveis, independente dos dados
export const FIXED_CAMPAIGN_FIELDS = [
  { value: "leads",   label: "Lead Form",           description: "Campo 'leads' — leads de formulário do Meta/Google Ads" },
  { value: "clicks",  label: "Cliques no Anúncio",  description: "Campo 'clicks' — total de cliques (ideal para campanhas de WhatsApp)" },
  { value: "sales",   label: "Conversões de Venda", description: "Campo 'sales' — conversões de venda registradas nas plataformas" },
  { value: "revenue", label: "Faturamento",          description: "Campo 'revenue' — faturamento estimado das campanhas" },
  { value: "manual",  label: "Informar Manualmente", description: "Preencher os valores mês a mês manualmente" },
] as const;

export type FixedCampaignField = typeof FIXED_CAMPAIGN_FIELDS[number]["value"];

export function useDistinctCampaignEventTypes(
  clientId: string | undefined,
  organizationId: string | undefined
) {
  return useQuery<CampaignEventType[]>({
    queryKey: ["distinct_campaign_event_types", clientId],
    queryFn: async () => {
      if (!clientId) return [];

      // Busca os objective_metric_label distintos do histórico do cliente
      const { data, error } = await supabase
        .from("campaign_data")
        .select("objective_metric_label, objective, platform")
        .eq("client_id", clientId)
        .not("objective_metric_label", "is", null)
        .order("objective_metric_label", { ascending: true });

      if (error || !data) return [];

      // Deduplica por label
      const seen = new Set<string>();
      const unique: CampaignEventType[] = [];
      for (const row of data) {
        if (!row.objective_metric_label) continue;
        if (seen.has(row.objective_metric_label)) continue;
        seen.add(row.objective_metric_label);
        unique.push({
          label: row.objective_metric_label,
          objective: row.objective ?? null,
          platform: row.platform ?? null,
        });
      }
      return unique;
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000, // 5 min — dados históricos não mudam com frequência
  });
}
