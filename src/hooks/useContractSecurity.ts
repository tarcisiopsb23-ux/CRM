/**
 * useContractSecurity
 *
 * Camadas de segurança para contratos v2:
 *   - computeContentHash: SHA-256 do conteúdo (html + variables + schedule + contract_number)
 *   - emitContract: muda para "emitido", grava hash, emitted_by, emitted_at, audit_log
 *   - checkHashIntegrity: recalcula hash atual e compara com o salvo
 *   - confirmSignature: chama RPC confirm_contract_signature (four-eyes)
 *   - revertToDraft: chama RPC revert_contract_to_draft (novo número)
 *   - useContractAuditLog: lista o log de auditoria de um contrato
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import type { ContractV2 } from "@/hooks/useContracts";
import { notifyContractPending } from "@/hooks/useNotifications";

// ── Tipo do registro de auditoria ─────────────────────────────────────────────

export interface ContractAuditEntry {
  id: string;
  organization_id: string;
  contract_id: string;
  contract_number: string | null;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  action_label: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

// ── Labels legíveis por ação ──────────────────────────────────────────────────

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  criacao:                         "Contrato criado",
  visualizacao:                    "Contrato visualizado",
  emissao:                         "PDF emitido",
  alteracao_campo:                 "Campo alterado",
  retorno_rascunho:                "Retornado para rascunho",
  assinatura_confirmada:           "Assinatura confirmada",
  cancelamento:                    "Contrato cancelado",
  encerramento:                    "Contrato encerrado",
  tentativa_confirmacao_negada:    "Tentativa de confirmação negada",
};

// ── Cálculo de Hash SHA-256 (SubtleCrypto nativo — sem dependência externa) ───

/**
 * Calcula SHA-256 do conteúdo do contrato.
 * Input: html_content + variables JSON + payment_schedule JSON + contract_number
 * Retorna: string hexadecimal de 64 caracteres.
 */
export async function computeContentHash(contract: {
  html_content: string | null;
  variables: Record<string, unknown> | null;
  contract_number: string | null;
  payment_schedule?: unknown[];
}): Promise<string> {
  const payload = [
    contract.contract_number ?? "",
    contract.html_content ?? "",
    JSON.stringify(contract.variables ?? {}),
    JSON.stringify(contract.payment_schedule ?? []),
  ].join("\n---\n");

  const encoder = new TextEncoder();
  const data    = encoder.encode(payload);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useContractSecurity() {
  const { profile } = useAuth();
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const invalidate = useCallback((contractId: string, clientId?: string) => {
    qc.invalidateQueries({ queryKey: ["contracts_v2", organizationId] });
    if (clientId) qc.invalidateQueries({ queryKey: ["contracts_v2", organizationId, clientId] });
    qc.invalidateQueries({ queryKey: ["contract_audit_log", contractId] });
    qc.invalidateQueries({ queryKey: ["contracts_v2_pending"] });
  }, [organizationId, qc]);

  // ── emitContract ────────────────────────────────────────────────────────────
  /**
   * Muda o contrato para "emitido" e registra:
   *   - emitted_by / emitted_at
   *   - content_hash / content_hash_at
   * Além de gravar no audit_log via RPC log_contract_action.
   *
   * Chamado pelo ContractViewer quando o usuário clica em Imprimir ou Salvar PDF.
   */
  const emitContract = useCallback(async (
    contract: ContractV2 & { payment_schedule?: unknown[] },
    clientId: string
  ): Promise<void> => {
    if (!profile?.id || !organizationId) return;
    if (contract.status !== "rascunho") return; // só emite rascunhos

    const hash = await computeContentHash({
      html_content:     contract.html_content,
      variables:        contract.variables,
      contract_number:  contract.contract_number,
      payment_schedule: contract.payment_schedule ?? [],
    });

    const { error } = await supabase
      .from("contracts_v2")
      .update({
        status:           "emitido",
        emitted_by:       profile.id,
        emitted_at:       new Date().toISOString(),
        content_hash:     hash,
        content_hash_at:  new Date().toISOString(),
        signed_at:        null,
      })
      .eq("id", contract.id)
      .eq("organization_id", organizationId);

    if (error) {
      console.error("[useContractSecurity] emitContract error:", error);
      return;
    }

    // Registra no audit_log via RPC
    await supabase.rpc("log_contract_action", {
      p_contract_id:  contract.id,
      p_action:       "emissao",
      p_action_label: `PDF emitido por ${profile.full_name ?? "usuário"}`,
      p_metadata:     { content_hash: hash },
    });

    // Notifica gestores/admins/owners que há contrato pendente de assinatura
    await notifyContractPending(
      organizationId,
      contract.contract_number,
      contract.title,
      profile.full_name ?? null
    );

    invalidate(contract.id, clientId);
  }, [profile, organizationId, invalidate]);

  // ── checkHashIntegrity ──────────────────────────────────────────────────────
  /**
   * Recalcula o hash atual do contrato e compara com o salvo em content_hash.
   * Retorna:
   *   { ok: true }  — hash bate (conteúdo não foi alterado)
   *   { ok: false, reason: "..." } — hash diverge (conteúdo foi alterado após emissão)
   *   { ok: true, noHash: true }  — contrato ainda não foi emitido
   */
  const checkHashIntegrity = useCallback(async (
    contract: ContractV2 & { payment_schedule?: unknown[] }
  ): Promise<{ ok: boolean; noHash?: boolean; reason?: string }> => {
    if (!contract.content_hash) {
      return { ok: true, noHash: true }; // ainda não emitido
    }

    const currentHash = await computeContentHash({
      html_content:     contract.html_content,
      variables:        contract.variables,
      contract_number:  contract.contract_number,
      payment_schedule: contract.payment_schedule ?? [],
    });

    if (currentHash !== contract.content_hash) {
      return {
        ok:     false,
        reason: "O conteúdo deste contrato foi alterado após a emissão do PDF. "
               + "Qualquer PDF gerado anteriormente está desatualizado. "
               + "Retorne para Rascunho, faça as correções necessárias e gere um novo PDF.",
      };
    }

    return { ok: true };
  }, []);

  // ── confirmSignature ────────────────────────────────────────────────────────
  /**
   * Chama a RPC confirm_contract_signature (four-eyes no banco).
   * Retorna { success, message?, error? }.
   */
  const confirmSignature = useCallback(async (
    contractId: string,
    clientId: string,
    signedAt?: string  // yyyy-MM-dd
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    const { data, error } = await supabase.rpc("confirm_contract_signature", {
      p_contract_id: contractId,
      p_signed_at:   signedAt ?? null,
    });

    if (error) return { success: false, error: error.message };

    const result = data as { success: boolean; message?: string; error?: string };
    if (result.success) invalidate(contractId, clientId);
    return result;
  }, [invalidate]);

  // ── revertToDraft ───────────────────────────────────────────────────────────
  /**
   * Chama a RPC revert_contract_to_draft (gera novo número, limpa emissão).
   * Retorna { success, contract_number?, old_number?, error? }.
   */
  const revertToDraft = useCallback(async (
    contractId: string,
    clientId: string
  ): Promise<{ success: boolean; contract_number?: string; old_number?: string; error?: string }> => {
    const { data, error } = await supabase.rpc("revert_contract_to_draft", {
      p_contract_id: contractId,
    });

    if (error) return { success: false, error: error.message };

    const result = data as {
      success: boolean;
      contract_number?: string;
      old_number?: string;
      error?: string;
    };
    if (result.success) invalidate(contractId, clientId);
    return result;
  }, [invalidate]);

  // ── registerSignature ────────────────────────────────────────────────────────
  /**
   * Registra a assinatura do contrato com data e número do contrato físico.
   * Chama a RPC register_contract_signature (migration 111).
   * Move lançamentos de previsto → pendente.
   */
  const registerSignature = useCallback(async (
    contractId: string,
    clientId: string,
    signedDate: string,           // "YYYY-MM-DD"
    signedContractNumber?: string // número do contrato físico assinado (opcional)
  ): Promise<{ success: boolean; error?: string; signed_contract_number?: string; awaiting_confirmation?: boolean }> => {
    const { data, error } = await supabase.rpc("register_contract_signature", {
      p_contract_id:            contractId,
      p_signed_date:            signedDate,
      p_signed_contract_number: signedContractNumber ?? null,
    });

    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string; signed_contract_number?: string; awaiting_confirmation?: boolean };
    if (result.success) invalidate(contractId, clientId);
    return result;
  }, [invalidate]);

  // ── logView ──────────────────────────────────────────────────────────────────
  /**
   * Registra visualização de contrato no audit_log.
   */
  const logView = useCallback(async (contractId: string): Promise<void> => {
    await supabase.rpc("log_contract_action", {
      p_contract_id:  contractId,
      p_action:       "visualizacao",
      p_action_label: `Contrato visualizado por ${profile?.full_name ?? "usuário"}`,
      p_metadata:     {},
    });
  }, [profile]);

  return {
    computeContentHash,
    emitContract,
    checkHashIntegrity,
    confirmSignature,
    revertToDraft,
    registerSignature,
    logView,
  };
}

// ── Hook de leitura do audit_log ──────────────────────────────────────────────

export function useContractAuditLog(contractId: string | undefined) {
  const organizationId = useOrganization();

  return useQuery<ContractAuditEntry[]>({
    queryKey: ["contract_audit_log", contractId],
    queryFn: async () => {
      if (!contractId || !organizationId) return [];
      const { data, error } = await supabase
        .from("contract_audit_log")
        .select("*")
        .eq("contract_id", contractId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractAuditEntry[];
    },
    enabled: !!contractId && !!organizationId,
    staleTime: 10_000,
  });
}

// ── Hook de listagem de contratos pendentes de assinatura ─────────────────────

export interface ContractPendingItem {
  id: string;
  organization_id: string;
  client_id: string;
  contract_number: string | null;
  title: string;
  emitted_by: string | null;
  emitted_by_name: string | null;
  emitted_at: string | null;
  content_hash: string | null;
  client_company: string | null;
  client_name_raw: string | null;
}

export function useContractsPendingSignature() {
  const organizationId = useOrganization();

  return useQuery<ContractPendingItem[]>({
    queryKey: ["contracts_v2_pending", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("contracts_v2_pending_signature")
        .select("id, organization_id, client_id, contract_number, title, emitted_by, emitted_by_name: emitted_by_name, emitted_at, content_hash, client_company, client_name_raw")
        .eq("organization_id", organizationId)
        .order("emitted_at", { ascending: true }); // mais antigos primeiro
      if (error) throw error;
      return (data ?? []) as ContractPendingItem[];
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });
}

// ── Hook de listagem geral de contratos pendentes/rascunhos ──────────────────

export interface ContractWorkItem {
  id: string;
  organization_id: string;
  client_id: string;
  contract_number: string | null;
  signed_contract_number: string | null;
  title: string;
  status: "rascunho" | "emitido" | "assinado" | "cancelado" | "encerrado";
  /** true = emitido com signed_at preenchido mas signed_confirmed_at nulo */
  awaiting_confirmation: boolean;
  emitted_by: string | null;
  emitted_at: string | null;
  signed_at: string | null;
  signed_confirmed_at: string | null;
  start_date: string | null;
  total_monthly: number | null;
  created_at: string;
  client_name: string | null;
  client_company: string | null;
}

export function useContractsWorkList() {
  const organizationId = useOrganization();

  return useQuery<ContractWorkItem[]>({
    queryKey: ["contracts_work_list", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      // Busca contratos sem join (evita falha silenciosa de FK)
      const { data, error } = await supabase
        .from("contracts_v2")
        .select(
          "id, organization_id, client_id, contract_number, signed_contract_number, " +
          "title, status, emitted_by, emitted_at, signed_at, signed_confirmed_at, " +
          "start_date, total_monthly, created_at"
        )
        .eq("organization_id", organizationId)
        .in("status", ["rascunho", "emitido"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[useContractsWorkList] error:", error.message, error.details);
        throw error;
      }
      if (!data || data.length === 0) return [];

      // Busca nomes dos clientes separadamente
      const clientIds = [...new Set((data as { client_id: string }[]).map(r => r.client_id))];
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, name, company")
        .in("id", clientIds);
      const clientMap = new Map<string, { name: string; company: string | null }>(
        ((clientsData ?? []) as { id: string; name: string; company: string | null }[])
          .map(c => [c.id, { name: c.name, company: c.company ?? null }])
      );

      return (data as unknown[]).map((row: unknown) => {
        const r = row as Record<string, unknown>;
        const cl = clientMap.get(String(r["client_id"] ?? ""));
        return {
          id:                     String(r["id"]),
          organization_id:        String(r["organization_id"]),
          client_id:              String(r["client_id"]),
          contract_number:        (r["contract_number"] as string | null) ?? null,
          signed_contract_number: (r["signed_contract_number"] as string | null) ?? null,
          title:                  String(r["title"] ?? ""),
          status:                 String(r["status"] ?? "rascunho") as ContractWorkItem["status"],
          awaiting_confirmation:  r["status"] === "emitido" && !!r["signed_at"] && !r["signed_confirmed_at"],
          emitted_by:             (r["emitted_by"] as string | null) ?? null,
          emitted_at:             (r["emitted_at"] as string | null) ?? null,
          signed_at:              (r["signed_at"] as string | null) ?? null,
          signed_confirmed_at:    (r["signed_confirmed_at"] as string | null) ?? null,
          start_date:             (r["start_date"] as string | null) ?? null,
          total_monthly:          (r["total_monthly"] as number | null) ?? null,
          created_at:             String(r["created_at"] ?? ""),
          client_name:            cl?.name ?? null,
          client_company:         cl?.company ?? null,
        } as ContractWorkItem;
      });
    },
    enabled: !!organizationId,
    staleTime: 15_000,
  });
}