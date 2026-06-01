/**
 * useAgencyCampaignData
 * Busca campaign_data filtrado pelo client_id da própria agência.
 * O client_id é configurado nas Settings → n8n → "Client ID da Agência".
 * Usado pelo Dashboard e módulo Campanhas.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { useIntegration } from "@/hooks/useSettings";
import type { N8nConfig } from "@/types/settings";

export interface PeriodRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export function useAgencyClientId() {
  const organizationId = useOrganization();

  // Lê o override manual configurado nas Settings → n8n → adsClientId
  // Tem prioridade máxima: se o usuário configurou manualmente, usa sempre.
  const n8nIntegration = useIntegration(organizationId, "n8n");
  const settingsLoading = n8nIntegration.isLoading;
  const manualClientId = ((n8nIntegration.data?.config ?? {}) as N8nConfig).adsClientId?.trim() || null;

  // Detecção automática: busca o primeiro cliente com integração de ads (meta ou google)
  // que NÃO tem dashboard_slug (clientes externos têm slug; a agência não tem).
  // Só roda se não houver override manual e as settings já carregaram.
  const autoQuery = useQuery({
    queryKey: ["agency_client_id_auto", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;

      // Filtra diretamente no banco: clientes sem dashboard_slug com integração de ads
      const { data, error } = await supabase
        .from("client_integrations")
        .select("client_id, platform, clients!inner(id, dashboard_slug)")
        .eq("organization_id", organizationId)
        .in("platform", ["meta", "google"])
        .is("clients.dashboard_slug", null)
        .order("created_at", { ascending: true })
        .limit(5);

      if (error || !data || data.length === 0) return null;

      return (data[0] as any).client_id as string;
    },
    enabled: !!organizationId && !settingsLoading && !manualClientId,
    staleTime: 10 * 60 * 1000,
  });

  // Prioridade: manual (Settings) > automático (detecção por slug)
  const clientId = manualClientId ?? autoQuery.data ?? null;

  // isResolved: true quando sabemos com certeza o resultado (mesmo que seja null)
  // Evita que consumidores busquem dados antes de saber o client_id correto
  const isResolved = !settingsLoading && (!!manualClientId || !autoQuery.isLoading);

  return { clientId, isResolved };
}

export function useAgencyCampaignData(range?: PeriodRange) {
  const organizationId = useOrganization();
  const { clientId: agencyClientId, isResolved: agencyClientIdResolved } = useAgencyClientId();

  const rawQuery = useQuery({
    queryKey: ["agency_campaign_data", organizationId, agencyClientId, range?.from, range?.to],
    queryFn: async () => {
      if (!organizationId) return [];
      // Se não há client_id configurado, retorna vazio com aviso
      if (!agencyClientId) {
        console.warn("[useAgencyCampaignData] adsClientId não configurado nas Settings → n8n.");
        return [];
      }
      let q = supabase
        .from("campaign_data")
        .select("campaign_id, campaign_name, platform, date, spend, impressions, reach, clicks, leads, sales, revenue, objective, objective_metric_label, objective_metric_value")
        .eq("organization_id", organizationId)
        .eq("client_id", agencyClientId)
        .order("date", { ascending: true });
      if (range?.from) q = q.gte("date", range.from);
      if (range?.to)   q = q.lte("date", range.to);
      const { data, error } = await q;
      if (error) {
        console.warn("[useAgencyCampaignData] Erro:", error.message);
        return [];
      }
      return data ?? [];
    },
    // Só busca quando o client_id já foi resolvido (evita buscar todos os clientes enquanto carrega)
    enabled: !!organizationId && agencyClientIdResolved,
    staleTime: 2 * 60 * 1000,
  });

  const rows = rawQuery.data ?? [];

  // Agrega por campanha
  const campaigns = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of rows as any[]) {
      const key = `${r.platform}||${r.campaign_id ?? r.campaign_name ?? ""}`;
      const existing = map.get(key);
      if (existing) {
        existing.spend       += Number(r.spend       ?? 0);
        existing.revenue     += Number(r.revenue     ?? 0);
        existing.impressions += Number(r.impressions ?? 0);
        existing.clicks      += Number(r.clicks      ?? 0);
        existing.reach       += Number(r.reach       ?? 0);
        existing.leads       += Number(r.leads       ?? 0);
        existing.conversions += Number(r.sales       ?? 0);
      } else {
        const platform =
          r.platform === "google" ? "Google Ads" :
          r.platform === "meta"   ? "Meta Ads"   :
          (r.platform ?? "");
        map.set(key, {
          id:           r.campaign_id ?? r.campaign_name ?? key,
          name:         r.campaign_name ?? "Sem nome",
          platform,
          status:       "Ativa",
          objective:    r.objective ?? null,
          budget_amount: null,
          budget_type:  null,
          start_date:   null,
          end_date:     null,
          spend:        Number(r.spend       ?? 0),
          revenue:      Number(r.revenue     ?? 0),
          impressions:  Number(r.impressions ?? 0),
          clicks:       Number(r.clicks      ?? 0),
          reach:        Number(r.reach       ?? 0),
          leads:        Number(r.leads       ?? 0),
          conversions:  Number(r.sales       ?? 0),
        });
      }
    }
    return Array.from(map.values()).map(c => ({
      ...c,
      cpc:  c.clicks      > 0 ? c.spend / c.clicks : 0,
      cpm:  c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
      ctr:  c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      cpl:  c.leads       > 0 ? c.spend / c.leads : 0,
      roas: c.spend       > 0 ? c.revenue / c.spend : 0,
      roi:  c.spend       > 0 ? ((c.revenue - c.spend) / c.spend) * 100 : 0,
      budgetPct: 0,
      // Para compatibilidade com useCampaigns
      account:   "Conta Principal",
      qualified: Math.round(c.leads * 0.4),
      meetings:  Math.round(c.leads * 0.1),
      contracts: Math.round(c.leads * 0.05),
    })).sort((a, b) => b.spend - a.spend);
  }, [rows]);

  const totals = useMemo(() => campaigns.reduce((acc, c) => ({
    spend:       acc.spend       + c.spend,
    revenue:     acc.revenue     + c.revenue,
    impressions: acc.impressions + c.impressions,
    clicks:      acc.clicks      + c.clicks,
    reach:       acc.reach       + c.reach,
    leads:       acc.leads       + c.leads,
    conversions: acc.conversions + c.conversions,
  }), { spend: 0, revenue: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, conversions: 0 }), [campaigns]);

  const trend = useMemo(() => {
    const byDate: Record<string, any> = {};
    for (const r of rows as any[]) {
      const d = r.date;
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d, spend: 0, revenue: 0, leads: 0, impressions: 0, clicks: 0 };
      byDate[d].spend       += Number(r.spend       ?? 0);
      byDate[d].revenue     += Number(r.revenue     ?? 0);
      byDate[d].leads       += Number(r.leads       ?? 0);
      byDate[d].impressions += Number(r.impressions ?? 0);
      byDate[d].clicks      += Number(r.clicks      ?? 0);
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [rows]);

  const byPlatform = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of campaigns) {
      map[c.platform] = (map[c.platform] ?? 0) + c.spend;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .filter(p => p.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [campaigns]);

  const topByRoas        = useMemo(() => [...campaigns].filter(c => c.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 5), [campaigns]);
  const topByRevenue     = useMemo(() => [...campaigns].filter(c => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5), [campaigns]);
  const topByConversions = useMemo(() => [...campaigns].filter(c => c.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 5), [campaigns]);

  // Métricas derivadas (compatibilidade com useCampaigns)
  const metrics = useMemo(() => ({
    cpc:  totals.clicks      > 0 ? totals.spend / totals.clicks : 0,
    cpm:  totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
    ctr:  totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    cpl:  totals.leads       > 0 ? totals.spend / totals.leads : 0,
    roas: totals.spend       > 0 ? totals.revenue / totals.spend : 0,
    roi:  totals.spend       > 0 ? ((totals.revenue - totals.spend) / totals.spend) * 100 : 0,
  }), [totals]);

  return {
    campaigns,
    totals,
    trend,
    byPlatform,
    topByRoas,
    topByRevenue,
    topByConversions,
    metrics,
    agencyClientId,
    isConfigured: !!agencyClientId,
    isLoading: rawQuery.isLoading || !agencyClientIdResolved,
  };
}
