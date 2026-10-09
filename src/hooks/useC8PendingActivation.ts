import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useN8nConfig } from "@/hooks/useN8nConfig";

export interface C8PendingClient {
  client_id: string;
  client_name: string;
  client_email: string | null;
  dashboard_slug: string | null;
  supabase_url: string | null;
  anon_key: string | null;
  has_service_key: boolean;
  contract_id: string | null;
  contract_service: string | null;
  contract_start: string | null;
  contract_end: string | null;
  c8_activation_status: "pendente" | "em_andamento" | "ativo" | "falhou";
  c8_activation_error: string | null;
  c8_included: boolean;
  plan_value: number;
  max_users: number;
}

export function useC8PendingActivation(organizationId: string | undefined) {
  const qc = useQueryClient();
  const n8nConfig = useN8nConfig(organizationId);

  // Fallback local para pendingCount quando a RPC ainda não existe no banco
  const query = useQuery<C8PendingClient[]>({
    queryKey: ["c8_pending_activations", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      // Tenta via RPC primeiro
      const { data, error } = await supabase.rpc("get_c8_pending_activations", {
        p_org_id: organizationId,
      });

      // Se a RPC não existe ainda (migration 047 não executada), faz fallback local
      if (error) {
        console.warn("[useC8PendingActivation] RPC get_c8_pending_activations falhou:", error.code, error.message, error.details);
        // Busca clientes habilitados pelas 3 fontes (igual à RPC corrigida):
        // 1) contrato habilitador, 2) c8_control_enabled = true, 3) banco B configurado

        const [contractsRes, manualRes, bankBRes] = await Promise.all([
          // Fonte 1: contratos habilitadores
          supabase
            .from("contracts")
            .select("client_id, service_contracted, start_date, end_date, id")
            .eq("organization_id", organizationId)
            .not("status", "in", '("cancelado","encerrado","rascunho")')
            .or(
              "service_contracted.ilike.%assessoria%," +
              "service_contracted.ilike.%consultoria%," +
              "service_contracted.ilike.%agente_ia%," +
              "service_contracted.ilike.%agente ia%," +
              "service_contracted.ilike.%c8 control%," +
              "service_contracted.ilike.%c8control%"
            ),
          // Fonte 2: flag manual
          supabase
            .from("clients")
            .select("id, name, email, dashboard_slug, client_supabase_url, client_supabase_anon_key, client_supabase_service_key_set")
            .eq("organization_id", organizationId)
            .eq("c8_control_enabled", true)
            .eq("is_active", true),
          // Fonte 3: banco B configurado
          supabase
            .from("clients")
            .select("id, name, email, dashboard_slug, client_supabase_url, client_supabase_anon_key, client_supabase_service_key_set")
            .eq("organization_id", organizationId)
            .not("client_supabase_url", "is", null)
            .eq("is_active", true),
        ]);

        // Mapa de clientId → contrato (fonte 1)
        const contractByClient = new Map(
          (contractsRes.data ?? []).map(c => [c.client_id, c])
        );

        // União de todos os client_ids habilitados
        const allClientIds = new Set([
          ...(contractsRes.data ?? []).map(c => c.client_id),
          ...(manualRes.data ?? []).map(c => c.id),
          ...(bankBRes.data ?? []).map(c => c.id),
        ]);

        if (allClientIds.size === 0) return [];

        // Busca todos os clientes e planos de uma vez
        const [clientsRes, plansRes] = await Promise.all([
          supabase
            .from("clients")
            .select("id, name, email, dashboard_slug, client_supabase_url, client_supabase_anon_key, client_supabase_service_key_set, c8_control_enabled")
            .in("id", Array.from(allClientIds))
            .eq("is_active", true),
          supabase
            .from("crm_client_plans")
            .select("client_id, c8_activation_status, c8_activated_at, plan_value, max_users")
            .in("client_id", Array.from(allClientIds)),
        ]);

        return (clientsRes.data ?? [])
          .filter(c => {
            const plan = plansRes.data?.find(p => p.client_id === c.id);
            const status = (plan as any)?.c8_activation_status ?? "pendente";
            return status !== "ativo";
          })
          .map(c => {
            const plan = plansRes.data?.find(p => p.client_id === c.id);
            const contract = contractByClient.get(c.id);
            return {
              client_id: c.id,
              client_name: c.name,
              client_email: c.email ?? null,
              dashboard_slug: c.dashboard_slug ?? null,
              supabase_url: c.client_supabase_url ?? null,
              anon_key: c.client_supabase_anon_key ?? null,
              has_service_key: !!(c as any).client_supabase_service_key_set,
              contract_id: contract?.id ?? null,
              contract_service: contract?.service_contracted ?? null,
              contract_start: contract?.start_date ?? null,
              contract_end: contract?.end_date ?? null,
              c8_activation_status: ((plan as any)?.c8_activation_status ?? "pendente") as C8PendingClient["c8_activation_status"],
              c8_activation_error: null,
              c8_included: !!contract,
              plan_value: (plan as any)?.plan_value ?? 0,
              max_users: (plan as any)?.max_users ?? 3,
            } satisfies C8PendingClient;
          });
      }

      return (data ?? []) as C8PendingClient[];
    },
    enabled: !!organizationId,
    staleTime: 15_000,
  });

  // Reseta ativação presa: reverte em_andamento ou falhou → pendente
  const resetActivation = useMutation({
    mutationKey: ["c8_reset_activation", organizationId],
    mutationFn: async (clientId: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");

      const { data, error } = await supabase.rpc("reset_c8_activation", {
        p_client_id: clientId,
        p_org_id: organizationId,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Erro ao resetar ativação.");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["c8_pending_activations", organizationId] });
    },
  });

  // Dispara ativação:
  //   1. RPC trigger_c8_activation — marca em_andamento e retorna payload
  //   2. Edge Function c8-provision-tenant — cria usuário no Banco B + envia e-mail
  //      (geração de senha, credenciais e comunicação com o cliente ficam aqui)
  //   3. Webhook n8n — aplica schema do Banco B, aguarda resultado
  //   4. update_c8_activation_result — marca ativo (schema ok) ou falhou
  const activate = useMutation({
    mutationKey: ["c8_activate", organizationId],
    mutationFn: async (clientId: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");

      // ── Passo 1: RPC marca em_andamento e retorna payload ───────────────────
      const { data, error } = await supabase.rpc("trigger_c8_activation", {
        p_client_id: clientId,
        p_org_id: organizationId,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Erro ao preparar ativação.");

      if (!data.supabase_url || !data.anon_key) {
        throw new Error(
          "URL e Anon Key do Supabase do cliente são obrigatórias. " +
          "Preencha na aba Integrações do cliente."
        );
      }
      if (!data.service_key) {
        throw new Error(
          "Service Key do Supabase não configurada. " +
          "Preencha na aba Integrações do cliente."
        );
      }

      const adminEmail: string | null =
        data.admin_email ?? data.primary_user_email ?? data.client_email ?? null;
      if (!adminEmail) {
        throw new Error(
          "E-mail do usuário principal não definido. " +
          "Configure em C8 Control → detalhe do cliente."
        );
      }

      // ── Passo 2: c8-provision-tenant — cria usuário + envia e-mail ──────────
      // Responsável por: gerar senha temporária, criar/atualizar auth.users no
      // Banco B e enviar o e-mail de boas-vindas ou nova senha via Resend.
      // Falha aqui não interrompe o fluxo — o schema precisa ser aplicado
      // independentemente. O admin pode reenviar credenciais depois.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");

      const provisionRes = await fetch(`${supabaseUrl}/functions/v1/c8-provision-tenant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          client_id:          clientId,
          admin_email:        adminEmail,
          tenant_name:        data.client_name ?? undefined,
          plan_name:          data.plan_name ?? "Incluído",
          max_users:          data.max_users ?? 3,
          send_welcome_email: true,
        }),
      });

      // Loga aviso se falhar mas não lança — schema continua sendo aplicado
      if (!provisionRes.ok) {
        const errBody = await provisionRes.json().catch(() => ({}));
        console.warn(
          "[c8-activate] c8-provision-tenant falhou:",
          (errBody as { error?: string }).error ?? `HTTP ${provisionRes.status}`
        );
      }

      // ── Passo 3: n8n — aplica schema do Banco B (aguardado) ─────────────────
      // O workflow recebe o payload sem senha e é responsável apenas por:
      //   - Aplicar bank_b_full_schema.sql no Banco B do cliente
      //   - Retornar { success: true/false, error? }
      // O resultado determina se a ativação é marcada como ativo ou falhou.
      const webhookUrl =
        (n8nConfig as any)?.c8ProvisionWebhookUrl ??
        import.meta.env.VITE_N8N_C8_PROVISION_WEBHOOK ??
        null;

      if (!webhookUrl) {
        throw new Error(
          "Webhook de provisionamento n8n não configurado. " +
          "Acesse Configurações → n8n → C8 Control Provision Webhook."
        );
      }

      const n8nRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:         "provision_c8_client",
          client_id:      clientId,
          client_name:    data.client_name,
          supabase_url:   data.supabase_url,
          anon_key:       data.anon_key,
          service_key:    data.service_key,
          org_id:         data.org_id,
          contract_start: data.contract_start,
          contract_end:   data.contract_end,
          max_users:      data.max_users,
          plan_name:      data.plan_name,
          // Sem admin_email nem senha — usuário já criado pela Edge Function
        }),
      });

      if (!n8nRes.ok) {
        throw new Error(`n8n respondeu com status ${n8nRes.status}. Verifique o workflow.`);
      }

      const n8nBody = await n8nRes.json().catch(() => ({ success: true })) as {
        success?: boolean;
        error?: string;
      };

      if (n8nBody.success === false) {
        throw new Error(n8nBody.error ?? "Workflow n8n reportou falha ao aplicar schema.");
      }

      // ── Passo 4: marca ativo no Banco A ─────────────────────────────────────
      // Só chegamos aqui se o schema foi aplicado com sucesso.
      await supabase.rpc("update_c8_activation_result", {
        p_client_id: clientId,
        p_success:   true,
        p_error:     null,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["c8_pending_activations", organizationId] });
      qc.invalidateQueries({ queryKey: ["c8_tenants", organizationId] });
    },
    onError: async (_err, clientId) => {
      // Reverte para 'falhou' em qualquer etapa anterior ao sucesso
      await supabase.rpc("update_c8_activation_result", {
        p_client_id: clientId,
        p_success: false,
        p_error: (_err as Error).message,
      });
      qc.invalidateQueries({ queryKey: ["c8_pending_activations", organizationId] });
    },
  });

  return {
    ...query,
    activate,
    resetActivation,
    pendingCount: (query.data ?? []).filter(
      c => c.c8_activation_status === "pendente" || c.c8_activation_status === "falhou"
    ).length,
  };
}
