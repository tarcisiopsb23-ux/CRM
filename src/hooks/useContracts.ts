import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import type { ContractPaymentLine } from "@/hooks/useContractSchedule";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ContractV2 {
  id: string;
  organization_id: string;
  client_id: string;
  template_id: string | null;
  proposal_id: string | null;
  contract_number: string | null;
  title: string;
  service_slugs: string[];
  variables: Record<string, string | number | null>;
  html_content: string | null;
  due_day: number | null;
  first_payment_date: string | null;
  total_monthly: number | null;
  total_setup: number | null;
  status: "rascunho" | "emitido" | "assinado" | "cancelado" | "encerrado";
  signed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  /** Vigência diferida — data de início efetivo quando posterior à assinatura */
  vigencia_inicio: string | null;
  /** Prazo mínimo de permanência em meses */
  prazo_minimo_meses: number | null;
  created_at: string;
  updated_at: string;
  /** @deprecated grace_period_months removido — carência não é mais suportada */
  grace_period_months?: number | null;
  // ── Campos de segurança (migration 092) ──────────────────────────────────
  /** Usuário que criou o contrato */
  created_by: string | null;
  /** Usuário que gerou o PDF (emitiu) */
  emitted_by: string | null;
  /** Momento da emissão */
  emitted_at: string | null;
  /** SHA-256 do conteúdo no momento da emissão */
  content_hash: string | null;
  /** Momento em que o hash foi calculado */
  content_hash_at: string | null;
  /** Usuário que confirmou a assinatura (four-eyes) */
  signed_confirmed_by: string | null;
  /** Momento da confirmação */
  signed_confirmed_at: string | null;
  /** Número do contrato físico assinado (migration 111) */
  signed_contract_number: string | null;
  /** Data de assinatura registrada manualmente (migration 111) */
  signed_date: string | null;
  // joins opcionais
  clients?: { name: string; company: string | null } | null;
  payment_schedule?: ContractPaymentLine[];
}

export interface CreateContractInput {
  client_id: string;
  template_id?: string;
  proposal_id?: string;
  title?: string;
  service_slugs: string[];
  primary_service_slug?: string | null;
  variables: Record<string, string | number | null>;
  html_content?: string;
  due_day?: number;
  first_payment_date?: string;
  total_monthly?: number | null;
  total_setup?: number | null;
  start_date?: string | null;
  end_date?: string;
  notes?: string;
  vigencia_inicio?: string | null;
  prazo_minimo_meses?: number | null;
  /** @deprecated grace_period_months removido — carência não é mais suportada */
  grace_period_months?: number | null;
  setup_amount_manual?: number | null;
  recurring_payment_method?: string | null;
  payment_schedule?: Omit<ContractPaymentLine, "id" | "contract_id" | "created_at">[];
  clause_snapshot?: Record<string, string>;
}

// ── Hook: listagem por cliente ────────────────────────────────────────────────

export function useClientContracts(clientId: string | undefined) {
  const organizationId = useOrganization();

  return useQuery<ContractV2[]>({
    queryKey: ["contracts_v2", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("contracts_v2")
        .select("*, payment_schedule:contract_payment_schedule(*)")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractV2[];
    },
    enabled: !!organizationId && !!clientId,
    staleTime: 30_000,
  });
}

// ── Hook: CRUD completo ───────────────────────────────────────────────────────

export function useContracts() {
  const organizationId = useOrganization();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const invalidate = (clientId?: string) => {
    qc.invalidateQueries({ queryKey: ["contracts_v2", organizationId] });
    if (clientId) qc.invalidateQueries({ queryKey: ["contracts_v2", organizationId, clientId] });
  };

  // ── Criar contrato ──────────────────────────────────────────────────────────
  const createContract = useMutation({
    mutationFn: async (input: CreateContractInput): Promise<ContractV2> => {
      if (!organizationId) throw new Error("Organização não identificada.");

      // Gera número sequencial via RPC
      const { data: numData } = await supabase
        .rpc("generate_contract_number", { p_org_id: organizationId });
      const contractNumber = numData as string | null;

      const { data, error } = await supabase
        .from("contracts_v2")
        .insert({
          organization_id:      organizationId,
          client_id:            input.client_id,
          template_id:          input.template_id ?? null,
          proposal_id:          input.proposal_id ?? null,
          contract_number:      contractNumber,
          title:                input.title ?? "Contrato de Prestação de Serviços",
          service_slugs:        input.service_slugs,
          primary_service_slug: input.primary_service_slug ?? null,
          variables:            input.variables,
          html_content:         input.html_content ?? null,
          due_day:              input.due_day ?? null,
          first_payment_date:   input.first_payment_date ?? null,
          total_monthly:        input.total_monthly ?? null,
          total_setup:          input.total_setup ?? null,
          start_date:           input.start_date ?? null,
          end_date:             input.end_date ?? null,
          notes:                input.notes ?? null,
          vigencia_inicio:      input.vigencia_inicio ?? null,
          prazo_minimo_meses:   input.prazo_minimo_meses ?? null,
          grace_period_months:  input.grace_period_months ?? null,
          setup_amount_manual:  input.setup_amount_manual ?? null,
          recurring_payment_method: input.recurring_payment_method ?? null,
          clause_snapshot:      input.clause_snapshot ?? null,
          status:               "rascunho",
          // created_by requer migration 092 — inserido com guard abaixo
        })
        .select()
        .single();
      if (error) throw error;

      const contract = data as ContractV2;

      // Tenta registrar created_by (requer migration 092).
      // Se a coluna ainda não existir no banco, o erro é silenciado para não
      // bloquear a criação do contrato.
      if (profile?.id) {
        await supabase
          .from("contracts_v2")
          .update({ created_by: profile.id })
          .eq("id", contract.id)
          .then(({ error: e }) => {
            if (e) console.warn("[useContracts] created_by update skipped (migration 092 pending?):", e.message);
          });
      }

      // Insere cronograma de pagamento se fornecido
      if (input.payment_schedule?.length) {
        const lines = input.payment_schedule.map((l, idx) => ({
          ...l,
          contract_id: contract.id,
          line_order:  l.line_order ?? idx,
        }));
        const { error: schedErr } = await supabase
          .from("contract_payment_schedule")
          .insert(lines);
        if (schedErr) console.error("[useContracts] schedule insert:", schedErr);
      }

      // Injeta numero_contrato nas variables para que {{numero_contrato}}
      // funcione em reimpreções e visualizações do template
      if (contractNumber && contract.variables) {
        const updatedVars = {
          ...contract.variables,
          numero_contrato: contractNumber,
        };
        const { error: varErr } = await supabase
          .from("contracts_v2")
          .update({ variables: updatedVars })
          .eq("id", contract.id);
        if (!varErr) contract.variables = updatedVars;
      }

      // Registra criação no audit_log (requer migration 092).
      // Silencia erros se a tabela ainda não existir.
      supabase.rpc("log_contract_action", {
        p_contract_id:  contract.id,
        p_action:       "criacao",
        p_action_label: `Contrato ${contractNumber ?? ""} criado`,
        p_metadata:     {
          title:           contract.title,
          service_slugs:   input.service_slugs,
          created_by_name: profile?.full_name ?? null,
        },
      }).then(({ error: e }) => {
        if (e) console.warn("[useContracts] audit log skipped (migration 092 pending?):", e.message);
      });

      return contract;
    },
    onSuccess: (data) => invalidate(data.client_id),
  });

  // ── Atualizar contrato ──────────────────────────────────────────────────────
  const updateContract = useMutation({
    mutationFn: async ({ id, clientId, ...updates }: Partial<ContractV2> & { id: string; clientId: string }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contracts_v2")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidate(vars.clientId),
  });

  // ── Atualizar cronograma (substitui tudo) ───────────────────────────────────
  const updateSchedule = useMutation({
    mutationFn: async ({
      contractId,
      clientId,
      lines,
    }: {
      contractId: string;
      clientId: string;
      lines: Omit<ContractPaymentLine, "id" | "contract_id" | "created_at">[];
    }) => {
      // Deleta e reinsere
      await supabase.from("contract_payment_schedule").delete().eq("contract_id", contractId);
      if (lines.length > 0) {
        const { error } = await supabase.from("contract_payment_schedule").insert(
          lines.map((l, idx) => ({ ...l, contract_id: contractId, line_order: l.line_order ?? idx }))
        );
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => invalidate(vars.clientId),
  });

  // ── Alterar status ──────────────────────────────────────────────────────────
  const changeStatus = useMutation({
    mutationFn: async ({
      id, clientId, status, reason, signedAt,
    }: {
      id: string;
      clientId: string;
      status: ContractV2["status"];
      reason?: string;
      /** ISO date string da data de assinatura (yyyy-MM-dd). Usado quando status = "assinado". */
      signedAt?: string;
    }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const updates: Record<string, unknown> = { status };

      if (status === "assinado") {
        // signed_at é registro interno — não altera o template do contrato.
        // A confirmação real usa a RPC confirm_contract_signature (four-eyes).
        const signedDate = signedAt
          ? new Date(signedAt + "T12:00:00").toISOString()
          : new Date().toISOString();
        updates.signed_at = signedDate;
      }

      if (status === "cancelado") {
        updates.cancelled_at        = new Date().toISOString();
        updates.cancellation_reason = reason ?? null;
      }

      const { error } = await supabase
        .from("contracts_v2")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidate(vars.clientId),
  });

  return { createContract, updateContract, updateSchedule, changeStatus };
}

// ── Aliases e stubs de compatibilidade com código legado ─────────────────────
// Esses exports existiam no hook antigo e são usados por componentes existentes
// (C8ControlTab, ContractDetailPage, ClientsPage, etc.).
// Buscam da tabela 'contracts' original para preservar todos os campos legados.

export type ContractRow = Record<string, unknown>;

function useLegacyContracts(
  organizationId: string | undefined,
  filters?: Record<string, unknown>
) {
  return useQuery({
    queryKey: ["contracts_legacy", organizationId, filters],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from("contracts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v !== undefined && v !== null) q = q.eq(k, v);
        });
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ContractRow[];
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });
}

export function useContractsByClient(
  organizationId: string | undefined,
  clientId: string | undefined
) {
  return useQuery({
    queryKey: ["contracts_legacy", organizationId, "client", clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractRow[];
    },
    enabled: !!organizationId && !!clientId,
    staleTime: 30_000,
  });
}

export function useContractsWithC8(organizationId: string | undefined, clientId?: string) {
  return useLegacyContracts(organizationId, clientId ? { client_id: clientId } : undefined);
}

export function useCreateContract(organizationId?: string) {
  const qc = useQueryClient();
  // Colunas válidas da tabela contracts — evita PGRST204 por campos inexistentes
  const VALID_COLUMNS = new Set([
    "organization_id","client_id","responsible_id","title","description","value",
    "status","start_date","end_date","billing_cycle","metadata","service_contracted",
    "contract_type","periodicity","contract_date","duration_months",
    "first_payment_value","first_payment_due_date","first_payment_method",
    "first_payment_split","first_payment_second_due_date","first_payment_installments",
    "first_payment_fees","recurring_due_date","min_duration_months",
    "ended_at","ended_reason","ended_by","is_dashboard_reference","proposal_id",
    "contract_version","contract_content","pdf_url","is_signed","generated_at","template_id",
  ]);
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const raw = organizationId ? { ...input, organization_id: organizationId } : input;
      // Filtra apenas colunas que existem na tabela
      const payload = Object.fromEntries(
        Object.entries(raw).filter(([k]) => VALID_COLUMNS.has(k))
      );
      const { data, error } = await supabase.from("contracts").insert(payload).select().single();
      if (error) {
        console.error("[useCreateContract] error code:", error.code, "message:", error.message);
        throw error;
      }
      return data as ContractRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts_legacy"] }),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  const VALID_COLUMNS = new Set([
    "client_id","responsible_id","title","description","value",
    "status","start_date","end_date","billing_cycle","metadata","service_contracted",
    "contract_type","periodicity","contract_date","duration_months",
    "first_payment_value","first_payment_due_date","first_payment_method",
    "first_payment_split","first_payment_second_due_date","first_payment_installments",
    "first_payment_fees","recurring_due_date","min_duration_months",
    "ended_at","ended_reason","ended_by","is_dashboard_reference","proposal_id",
    "contract_version","contract_content","pdf_url","is_signed","generated_at","template_id",
    "organization_id",
  ]);
  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, unknown> & { id: string }) => {
      const filtered = Object.fromEntries(
        Object.entries(updates).filter(([k]) => VALID_COLUMNS.has(k))
      );
      const { error } = await supabase.from("contracts").update(filtered).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts_legacy"] }),
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, client_id }: { id: string; client_id: string }) => {
      // Verifica se há pagamentos pagos — se sim, arquiva em vez de deletar
      const { data: paidPayments } = await supabase
        .from("payments")
        .select("id")
        .eq("contract_id", id)
        .eq("status", "pago")
        .limit(1);

      const hasPaid = (paidPayments ?? []).length > 0;

      // Cancela todos os pagamentos pendentes
      await supabase
        .from("payments")
        .update({ status: "cancelado" })
        .eq("contract_id", id)
        .in("status", ["pendente", "atrasado", "processando"]);

      if (hasPaid) {
        // Arquiva o contrato — mantém histórico de pagamentos realizados
        const { error } = await supabase
          .from("contracts")
          .update({ status: "cancelado", ended_at: new Date().toISOString(), ended_reason: "Excluído com pagamentos realizados — arquivado" })
          .eq("id", id);
        if (error) throw error;
      } else {
        // Sem pagamentos realizados — pode deletar definitivamente
        const { error } = await supabase.from("contracts").delete().eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts_legacy"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useSuspendContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, client_id, reason }: { id: string; client_id: string; reason?: string }) => {
      const { error } = await supabase
        .from("contracts")
        .update({ status: "suspenso", ...(reason ? { ended_reason: reason } : {}) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts_legacy"] }),
  });
}

export function useReactivateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, client_id }: { id: string; client_id: string }) => {
      const { error } = await supabase
        .from("contracts").update({ status: "ativo" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts_legacy"] }),
  });
}

export function useEndContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, client_id, reason }: { id: string; client_id: string; reason?: string }) => {
      // Encerra o contrato
      const { error } = await supabase
        .from("contracts")
        .update({
          status: "encerrado",
          ended_at: new Date().toISOString(),
          ...(reason ? { ended_reason: reason } : {}),
        })
        .eq("id", id);
      if (error) throw error;

      // Cancela todos os pagamentos pendentes do contrato
      await supabase
        .from("payments")
        .update({ status: "cancelado" })
        .eq("contract_id", id)
        .in("status", ["pendente", "atrasado", "processando"]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts_legacy"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useSignContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contracts")
        .update({ status: "assinado", signed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts_legacy"] }),
  });
}

export function useSetDashboardReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, clientId, organizationId }: {
      contractId: string; clientId: string; organizationId: string;
    }) => {
      // Remove referência anterior do cliente
      await supabase
        .from("contracts")
        .update({ is_dashboard_reference: false })
        .eq("organization_id", organizationId)
        .eq("client_id", clientId);
      // Define nova referência
      const { error } = await supabase
        .from("contracts")
        .update({ is_dashboard_reference: true })
        .eq("id", contractId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts_legacy"] }),
  });
}

export function useGenerateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from("contracts").select("*").eq("id", id).single();
      if (error) throw error;
      return data as ContractRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts_legacy"] }),
  });
}
