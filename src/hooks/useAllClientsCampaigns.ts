/**
 * useAllClientsCampaigns
 * Agrega campaign_data de TODOS os clientes da organização.
 * Usado no Módulo Relatórios para visão consolidada.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";

export interface ClientCampaignRow {
  id: string;
  client_id: string;
  client_name: string;
  organization_id: string;
  platform: string;
  date: string;
  campaign_id: string | null;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
}

export interface ClientCampaignSummary {
  client_id: string;
  client_name: string;
  platform: string;
  campaign_id: string | null;
  campaign_name: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
  // derived
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
  roas: number;
}

export interface PeriodRange {
  from: string;
  to: string;
}

export function useAllClientsCampaigns(range?: PeriodRange) {
  const organizationId = useOrganization();
  const { data: clients = [] } = useClients(organizationId);

  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) {
      m.set(c.id, c.company || c.name);
    }
    return m;
  }, [clients]);

  const query = useQuery({
    queryKey: ["all_clients_campaigns", organizationId, range?.from, range?.to],
    queryFn: async () => {
      if (!organizationId) return [] as ClientCampaignRow[];
      let q = supabase
        .from("campaign_data")
        .select("id, client_id, organization_id, platform, date, campaign_id, campaign_name, spend, impressions, reach, clicks, leads, sales, revenue")
        .eq("organization_id", organizationId)
        .order("date", { ascending: false });

      if (range?.from) q = q.gte("date", range.from);
      if (range?.to)   q = q.lte("date", range.to);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(r => ({
        ...r,
        client_name: "",  // preenchido abaixo
        spend:       Number(r.spend       ?? 0),
        impressions: Number(r.impressions ?? 0),
        reach:       Number(r.reach       ?? 0),
        clicks:      Number(r.clicks      ?? 0),
        leads:       Number(r.leads       ?? 0),
        sales:       Number(r.sales       ?? 0),
        revenue:     Number(r.revenue     ?? 0),
      })) as ClientCampaignRow[];
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });

  // Enriquece com nome do cliente
  const rows = useMemo(() =>
    (query.data ?? []).map(r => ({
      ...r,
      client_name: clientMap.get(r.client_id) ?? r.client_id,
    })),
  [query.data, clientMap]);

  // Agrega por cliente + plataforma + campanha
  const summaries = useMemo<ClientCampaignSummary[]>(() => {
    const map = new Map<string, ClientCampaignSummary>();
    for (const r of rows) {
      const key = `${r.client_id}||${r.platform}||${r.campaign_id ?? r.campaign_name ?? ""}`;
      const existing = map.get(key);
      if (existing) {
        existing.spend       += r.spend;
        existing.impressions += r.impressions;
        existing.reach       += r.reach;
        existing.clicks      += r.clicks;
        existing.leads       += r.leads;
        existing.sales       += r.sales;
        existing.revenue     += r.revenue;
      } else {
        map.set(key, {
          client_id:     r.client_id,
          client_name:   r.client_name,
          platform:      r.platform,
          campaign_id:   r.campaign_id,
          campaign_name: r.campaign_name ?? "Sem nome",
          spend:         r.spend,
          impressions:   r.impressions,
          reach:         r.reach,
          clicks:        r.clicks,
          leads:         r.leads,
          sales:         r.sales,
          revenue:       r.revenue,
          ctr: 0, cpc: 0, cpm: 0, cpl: 0, roas: 0,
        });
      }
    }
    return Array.from(map.values()).map(s => ({
      ...s,
      ctr:  s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0,
      cpc:  s.clicks      > 0 ? s.spend / s.clicks : 0,
      cpm:  s.impressions > 0 ? (s.spend / s.impressions) * 1000 : 0,
      cpl:  s.leads       > 0 ? s.spend / s.leads : 0,
      roas: s.spend       > 0 ? s.revenue / s.spend : 0,
    })).sort((a, b) => b.spend - a.spend);
  }, [rows]);

  // Totais consolidados
  const totals = useMemo(() => summaries.reduce((acc, s) => ({
    spend:       acc.spend       + s.spend,
    impressions: acc.impressions + s.impressions,
    reach:       acc.reach       + s.reach,
    clicks:      acc.clicks      + s.clicks,
    leads:       acc.leads       + s.leads,
    sales:       acc.sales       + s.sales,
    revenue:     acc.revenue     + s.revenue,
  }), { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 }), [summaries]);

  // Por cliente
  const byClient = useMemo(() => {
    const map = new Map<string, { client_name: string; spend: number; revenue: number; leads: number; roas: number }>();
    for (const s of summaries) {
      const existing = map.get(s.client_id);
      if (existing) {
        existing.spend   += s.spend;
        existing.revenue += s.revenue;
        existing.leads   += s.leads;
      } else {
        map.set(s.client_id, { client_name: s.client_name, spend: s.spend, revenue: s.revenue, leads: s.leads, roas: 0 });
      }
    }
    return Array.from(map.values()).map(c => ({
      ...c,
      roas: c.spend > 0 ? c.revenue / c.spend : 0,
    })).sort((a, b) => b.spend - a.spend);
  }, [summaries]);

  // Por plataforma
  const byPlatform = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of summaries) {
      map.set(s.platform, (map.get(s.platform) ?? 0) + s.spend);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(p => p.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [summaries]);

  return {
    summaries,
    totals,
    byClient,
    byPlatform,
    isLoading: query.isLoading,
    rowCount: rows.length,
  };
}
