import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ClientIntegration, ClientKPI, CampaignData, DailyMetrics } from "@/types/hub_performance";

async function getAdsWebhookUrl(organizationId: string): Promise<string | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("config")
    .eq("organization_id", organizationId)
    .eq("integration_type", "n8n")
    .maybeSingle();
  return (data?.config as Record<string, string> | null)?.adsWebhookUrl
    ?? import.meta.env.VITE_N8N_WEBHOOK_SYNC_ADS
    ?? null;
}

// Hook para gerenciar integrações de clientes
export function useClientIntegrations(organizationId?: string, clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<ClientIntegration[]>({ 
    queryKey: ["client_integrations", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("client_integrations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!clientId,
  });

  const upsert = useMutation({
    mutationFn: async (integration: Partial<ClientIntegration>) => {
      if (!organizationId || !clientId) throw new Error("Faltando ID da organização ou cliente");
      // Remove apenas campos undefined — null é enviado explicitamente para limpar valores
      const payload = Object.fromEntries(
        Object.entries({ ...integration, organization_id: organizationId, client_id: clientId })
          .filter(([, v]) => v !== undefined)
      );
      const { data, error } = await supabase.from("client_integrations").upsert(payload).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_integrations", organizationId, clientId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_integrations", organizationId, clientId] });
    },
  });

  // Trigger manual sync via n8n webhook
  const triggerSync = useMutation({
    mutationFn: async (integrationId?: string) => {
      const n8nWebhookUrl = organizationId ? await getAdsWebhookUrl(organizationId) : null;
      if (!n8nWebhookUrl) throw new Error("Webhook de sync de Ads não configurado. Acesse Configurações → n8n → Ads.");

      // Mark as syncing — limpa erro anterior
      if (integrationId) {
        await supabase.from("client_integrations")
          .update({ sync_status: "syncing", sync_error: null })
          .eq("id", integrationId);
      }

      const res = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, client_id: clientId, integration_id: integrationId }),
      });
      if (!res.ok) throw new Error(`Sync falhou: ${res.statusText}`);
      // Retorna o integrationId para uso no onSuccess/onError
      return integrationId;
    },
    onSuccess: (integrationId) => {
      if (!integrationId) return;

      // Polling a cada 5s por até 120s — para quando o n8n gravar success/error
      // Não grava erro no banco: deixa o n8n ser a única fonte de verdade do status
      let elapsed = 0;
      const INTERVAL = 5_000;
      const MAX_WAIT = 120_000;

      const interval = setInterval(async () => {
        elapsed += INTERVAL;

        const { data } = await supabase
          .from("client_integrations")
          .select("sync_status, sync_error, last_sync_at")
          .eq("id", integrationId)
          .single();

        const status = data?.sync_status;

        // Para o polling assim que o n8n atualizar (success ou error real)
        if (status === "success" || status === "error") {
          clearInterval(interval);
          qc.invalidateQueries({ queryKey: ["client_integrations", organizationId, clientId] });
          qc.invalidateQueries({ queryKey: ["campaign_data", organizationId, clientId], exact: false });
          qc.invalidateQueries({ queryKey: ["daily_metrics", organizationId, clientId], exact: false });
          return;
        }

        // Timeout: apenas invalida queries para mostrar o estado atual do banco
        if (elapsed >= MAX_WAIT) {
          clearInterval(interval);
          // Força reset para error se ainda estiver syncing após timeout
          await supabase
            .from("client_integrations")
            .update({ sync_status: "error", sync_error: "Timeout: o workflow não respondeu a tempo." })
            .eq("id", integrationId)
            .eq("sync_status", "syncing"); // só atualiza se ainda estiver syncing
          qc.invalidateQueries({ queryKey: ["client_integrations", organizationId, clientId] });
        }
      }, INTERVAL);
    },
    onError: async (_, integrationId) => {
      // Se o fetch falhou antes de chegar no n8n, reseta o status imediatamente
      if (integrationId) {
        await supabase
          .from("client_integrations")
          .update({ sync_status: "error", sync_error: "Falha ao chamar o webhook de sync." })
          .eq("id", integrationId);
        qc.invalidateQueries({ queryKey: ["client_integrations", organizationId, clientId] });
      }
    },
  });

  return { ...query, upsert, remove, triggerSync };
}

// Hook para buscar todas as integrações da organização (usado na IntegrationsPage)
export function useAllClientIntegrations(organizationId?: string) {
  return useQuery({
    queryKey: ["all_client_integrations", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("client_integrations")
        .select("*, clients!left(id, name, company)")
        .eq("organization_id", organizationId)
        .order("last_sync_at", { ascending: false, nullsFirst: true });
      if (error) throw error;
      return (data || []) as Array<ClientIntegration & { clients: { id: string; name: string; company: string | null } }>;
    },
    enabled: !!organizationId,
    refetchInterval: 30_000, // refresh every 30s to catch sync status updates
  });
}

// Hook para gerenciar KPIs manuais de clientes
export function useClientKPIs(organizationId?: string, clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<ClientKPI[]>({ 
    queryKey: ["client_kpis", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("client_kpis")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!clientId,
  });

  const create = useMutation({
    mutationFn: async (kpi: Omit<ClientKPI, 'id' | 'created_at' | 'updated_at' | 'organization_id'>) => {
      if (!organizationId || !clientId) throw new Error("Faltando ID da organização ou cliente");
      const { data, error } = await supabase.from("client_kpis").insert({ ...kpi, organization_id: organizationId, client_id: clientId }).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_kpis", organizationId, clientId] });
    },
  });

  return { ...query, create };
}

// Hook para buscar dados de relatórios (campaign_data e daily_metrics)
export function useClientReports(organizationId?: string, clientId?: string, dateRange?: { from: string, to: string }, usePublicRpc?: boolean) {

  const campaignDataQuery = useQuery<CampaignData[]>({ 
    queryKey: ["campaign_data", organizationId, clientId, dateRange, usePublicRpc],
    queryFn: async () => {
      if (!clientId || !dateRange) return [];
      // Dashboard público: tenta RPC SECURITY DEFINER primeiro, cai na query direta se falhar
      if (usePublicRpc) {
        const { data, error } = await supabase
          .rpc('get_campaign_data_public', { p_client_id: clientId, p_from: dateRange.from, p_to: dateRange.to });
        if (!error) return (data || []) as CampaignData[];
        // RPC não existe ou falhou — fallback para query direta (funciona se RLS permitir anon)
        console.warn('[useClientReports] RPC get_campaign_data_public indisponível, usando query direta:', error.message);
      }
      let q = supabase
        .from("campaign_data")
        .select("*")
        .eq("client_id", clientId)
        .gte("date", dateRange.from)
        .lte("date", dateRange.to);
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) { console.error('[useClientReports] campaign_data error:', error); return []; }
      return data || [];
    },
    enabled: !!clientId && !!dateRange,
  });

  const dailyMetricsQuery = useQuery<DailyMetrics[]>({ 
    queryKey: ["daily_metrics", organizationId, clientId, dateRange, usePublicRpc],
    queryFn: async () => {
      if (!clientId || !dateRange) return [];
      // Dashboard público: tenta RPC SECURITY DEFINER primeiro, cai na query direta se falhar
      if (usePublicRpc) {
        const { data, error } = await supabase
          .rpc('get_daily_metrics_public', { p_client_id: clientId, p_from: dateRange.from, p_to: dateRange.to });
        if (!error) return (data || []) as DailyMetrics[];
        // RPC não existe ou falhou — fallback para query direta
        console.warn('[useClientReports] RPC get_daily_metrics_public indisponível, usando query direta:', error.message);
      }
      let q = supabase
        .from("daily_metrics")
        .select("*")
        .eq("client_id", clientId)
        .gte("date", dateRange.from)
        .lte("date", dateRange.to)
        .order("date", { ascending: true });
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) { console.error('[useClientReports] daily_metrics error:', error); return []; }
      return data || [];
    },
    enabled: !!clientId && !!dateRange,
  });

  return { campaignDataQuery, dailyMetricsQuery };
}
