import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { subDays, format, startOfDay } from "date-fns";

export type LeadSourceGroup = "Campanha" | "WhatsApp" | "Manual / CSV" | "Outros";

export interface LeadSourceCount {
  source: LeadSourceGroup;
  count: number;
  color: string;
}

export interface LeadFunnelStage {
  stage_id: string;
  label: string;
  count: number;
}

const SOURCE_COLORS: Record<LeadSourceGroup, string> = {
  "Campanha":    "#a855f7",
  "WhatsApp":    "#10b981",
  "Manual / CSV":"#2D8CC7",
  "Outros":      "#94a3b8",
};

/** Classify a lead row into one of the 3 canonical sources */
function classifySource(row: { source?: string | null; contact_origin?: string | null }): LeadSourceGroup {
  // Campaign: contact_origin is campanha_google/campanha_meta OR source mentions campanha/ads/google/meta/facebook
  if (
    row.contact_origin === "campanha_google" ||
    row.contact_origin === "campanha_meta" ||
    (row.source && /campanha|google.?ads|meta.?ads|facebook.?ads|tráfego|trafego/i.test(row.source))
  ) return "Campanha";

  // WhatsApp: source contains whatsapp (case-insensitive)
  if (row.source && /whatsapp/i.test(row.source)) return "WhatsApp";

  // Manual / CSV: prospeccao, indicacao, organico, null source, or explicit manual
  if (
    !row.source ||
    row.contact_origin === "prospeccao" ||
    row.contact_origin === "indicacao" ||
    row.contact_origin === "organico" ||
    row.contact_origin === "outras"
  ) return "Manual / CSV";

  return "Outros";
}

export function useLeadsBySource(organizationId: string | undefined, days = 30) {
  const from = format(startOfDay(subDays(new Date(), days)), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["leads-by-source", organizationId, days],
    queryFn: async () => {
      if (!organizationId) return { sources: [], total: 0 };

      const { data, error } = await supabase
        .from("leads")
        .select("source, contact_origin, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", from);

      if (error) throw error;

      const counts: Record<LeadSourceGroup, number> = {
        "Campanha": 0,
        "WhatsApp": 0,
        "Manual / CSV": 0,
        "Outros": 0,
      };

      for (const row of data ?? []) {
        counts[classifySource(row)]++;
      }

      const sources: LeadSourceCount[] = (Object.entries(counts) as [LeadSourceGroup, number][])
        .filter(([, c]) => c > 0)
        .map(([source, count]) => ({ source, count, color: SOURCE_COLORS[source] }))
        .sort((a, b) => b.count - a.count);

      return { sources, total: (data ?? []).length };
    },
    enabled: !!organizationId,
  });
}

export function useLeadFunnel(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["lead-funnel", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("leads")
        .select("etapa_kanban")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const STAGES: { id: string; label: string }[] = [
        { id: "leads_recebidos",   label: "Recebidos" },
        { id: "qualificados",      label: "Qualificados" },
        { id: "contato_realizado", label: "Contato" },
        { id: "reuniao_agendada",  label: "Reunião" },
        { id: "emissao_contrato",  label: "Contrato" },
        { id: "efetivados",        label: "Fechados" },
      ];

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const s = (row.etapa_kanban as string) ?? "leads_recebidos";
        counts[s] = (counts[s] ?? 0) + 1;
      }

      return STAGES.map(s => ({ ...s, count: counts[s.id] ?? 0 }));
    },
    enabled: !!organizationId,
  });
}
