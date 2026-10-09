// src/hooks/useContractAssembly.ts
// Orchestrates contract document assembly, the Review Modal lifecycle,
// inline clause editing and final generation (webhook + generated_at).
//
// Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleContract } from "@/lib/contracts/assembleContract";
import { renderContractHtml } from "@/lib/contracts/renderContractHtml";
import { dispatchWebhook } from "@/lib/webhookDispatcher";
import { useOrganization } from "@/hooks/useOrganization";
import type { ContractAssemblyResult, ContractClause, ContractTemplateV2, ClientRepresentativeAssembly, ServiceCatalogItem } from "@/types/contracts";
import type { Client } from "@/types/crm";
import type { ContractRow } from "@/hooks/useContracts";
import type { PixKey } from "@/hooks/usePixKeys";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ContractWithMeta extends ContractRow {
  // Ensure metadata is typed with our extension fields
  metadata: {
    services?: Array<{
      service_id: string;
      service_name: string;
      selected_deliverables: import('@/types/contracts').SelectedDeliverable[];
    }>;
    /** Snapshot dos ServiceCatalogItems — para enriquecer {{servicos}} com modalidade/escopo */
    catalogItems?: import('@/types/contracts').ServiceCatalogItem[];
    setup_value?: number;
    setup_installments?: number;
    setup_parcel_value?: number;
    setup_fees?: number;
    setup_first_due_date?: string;
    setup_payment_method?: string;
    clause_edits?: Record<string, string>;
    unresolved_variables?: string[];
    [key: string]: unknown;
  } | null;
}

// ---------------------------------------------------------------------------
// Hook return shape
// ---------------------------------------------------------------------------

export interface UseContractAssemblyReturn {
  // State
  isOpen: boolean;
  /** Alias for isOpen — used by GenerateContractButton */
  isReviewOpen: boolean;
  assembledResult: ContractAssemblyResult | null;
  assembledHtml: string | null;
  clauseEdits: Record<string, string>;
  assemblyError: string | null;
  isAssembling: boolean;
  isConfirming: boolean;
  /** Template resolvido — exposto para o ReviewModal montar o preview com timbrado/margens */
  template: ContractTemplateV2 | null | undefined;

  // Actions
  openReviewModal: () => Promise<void>;
  /** Alias for openReviewModal — used by GenerateContractButton */
  openReview: () => Promise<void>;
  closeReviewModal: () => void;
  /** Setter alias — used by GenerateContractButton (passes false to close) */
  setIsReviewOpen: (open: boolean) => void;
  editClause: (clauseId: string, html: string) => Promise<void>;
  confirmGenerate: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase client (untyped cast — consistent with rest of codebase)
// ---------------------------------------------------------------------------
const sb = () => supabase as unknown as SupabaseClient;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContractAssembly(
  contractId: string | undefined
): UseContractAssemblyReturn {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  // ── Modal state ───────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [assembledResult, setAssembledResult] = useState<ContractAssemblyResult | null>(null);
  const [assembledHtml, setAssembledHtml] = useState<string | null>(null);
  const [clauseEdits, setClauseEdits] = useState<Record<string, string>>({});
  const [assemblyError, setAssemblyError] = useState<string | null>(null);
  const [isAssembling, setIsAssembling] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  // Contract (with metadata) — busca em contracts_v2 primeiro, depois contracts legado
  const { data: contract } = useQuery<ContractWithMeta | null>({
    queryKey: ["contract-assembly", "contract", contractId],
    queryFn: async (): Promise<ContractWithMeta | null> => {
      if (!contractId) return null;

      // Tenta contracts_v2 primeiro
      const { data: v2, error: v2Err } = await sb()
        .from("contracts_v2")
        .select("*")
        .eq("id", contractId)
        .maybeSingle();
      if (!v2Err && v2) return v2 as unknown as ContractWithMeta;

      // Fallback para contracts legado
      const { data, error } = await sb()
        .from("contracts")
        .select("*")
        .eq("id", contractId)
        .single();
      if (error) throw error;
      return data as unknown as ContractWithMeta;
    },
    enabled: !!contractId,
  });

  // Client (derived from contract.client_id)
  const { data: client } = useQuery<Client | null>({
    queryKey: ["contract-assembly", "client", contract?.client_id],
    queryFn: async (): Promise<Client | null> => {
      if (!contract?.client_id) return null;
      const { data, error } = await sb()
        .from("clients")
        .select("*")
        .eq("id", contract.client_id)
        .single();
      if (error) throw error;
      return data as unknown as Client;
    },
    enabled: !!contract?.client_id,
  });

  // Representatives (legais + procuradores) — via view que inclui procuracao_vencida
  const { data: representatives } = useQuery<ClientRepresentativeAssembly[]>({
    queryKey: ["contract-assembly", "representatives", contract?.client_id, organizationId],
    queryFn: async (): Promise<ClientRepresentativeAssembly[]> => {
      if (!contract?.client_id || !organizationId) return [];
      const { data, error } = await sb()
        .from("client_representatives_vw")
        .select("id, nome, cpf, cargo, qualificacao, tipo_representacao, procuracao_tipo, procuracao_data, procuracao_indeterminada, representa_ids, is_signing_responsible, is_legal_representative")
        .eq("client_id", contract.client_id)
        .eq("organization_id", organizationId)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as ClientRepresentativeAssembly[];
    },
    enabled: !!contract?.client_id && !!organizationId,
  });

  // Clauses — all org clauses (filtering by condition happens inside assembleContract)
  const { data: clauses } = useQuery<ContractClause[]>({
    queryKey: ["contract-assembly", "clauses", organizationId],
    queryFn: async (): Promise<ContractClause[]> => {
      if (!organizationId) return [];
      const { data, error } = await sb()
        .from("contract_clauses")
        .select("*")
        .eq("organization_id", organizationId)
        .neq("is_active", false)          // exclui inativas (aceita null/true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ContractClause[];
    },
    enabled: !!organizationId,
  });

  // Payment schedule — linhas do cronograma para {{cronograma_pagamento}}
  const { data: paymentSchedule } = useQuery<Array<{
    line_type: string; period_label: string; due_date: string | null;
    amount: number; month_to: number | null;
  }>>({
    queryKey: ["contract-assembly", "schedule", contractId],
    queryFn: async () => {
      if (!contractId) return [];
      const { data, error } = await sb()
        .from("contract_payment_schedule")
        .select("line_type, period_label, due_date, amount, month_to")
        .eq("contract_id", contractId)
        .order("line_order", { ascending: true });
      if (error) return [];
      return (data ?? []) as Array<{
        line_type: string; period_label: string; due_date: string | null;
        amount: number; month_to: number | null;
      }>;
    },
    enabled: !!contractId,
  });

  // Service catalog — enriches {{servicos}} with modality, scope and deliverable details.
  // Keyed by slug (matches how service_id is stored in metadata.services).
  const { data: catalogItems } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["contract-assembly", "catalog", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await sb()
        .from("service_catalog")
        .select("*")
        .eq("organization_id", organizationId);
      if (error) return [];
      return (data ?? []) as unknown as ServiceCatalogItem[];
    },
    enabled: !!organizationId,
  });

  // PIX keys — resolve contract.chave_pix (UUID) to the key_value string
  const { data: pixKeys } = useQuery<PixKey[]>({
    queryKey: ["contract-assembly", "pix_keys", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await sb()
        .from("pix_keys")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true);
      if (error) return [];
      return (data ?? []) as unknown as PixKey[];
    },
    enabled: !!organizationId,
  });

  // Template — prefer contract.template_id, fall back to org default
  const { data: template } = useQuery<ContractTemplateV2 | null>({
    queryKey: ["contract-assembly", "template", organizationId, contract?.template_id],
    queryFn: async (): Promise<ContractTemplateV2 | null> => {
      if (!organizationId) return null;

      if (contract?.template_id) {
        const { data, error } = await sb()
          .from("contract_templates")
          .select("*")
          .eq("id", contract.template_id)
          .single();
        if (error) throw error;
        return data as unknown as ContractTemplateV2;
      }

      // Fall back to the org's default template
      const { data, error } = await sb()
        .from("contract_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_default", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ContractTemplateV2 | null;
    },
    enabled: !!organizationId && !!contract,
  });

  // ── assemble — pure call, does not open modal ──────────────────────────────

  const assemble = useCallback((): ContractAssemblyResult => {
    if (!contract) throw new Error("Contrato não carregado.");
    if (!client) throw new Error("Cliente não carregado.");
    if (!template) {
      throw new Error(
        "Nenhum template padrão encontrado. Acesse Configurações → Contratos para definir um template padrão."
      );
    }

    // Monta endereço completo a partir dos campos address_* do cliente
    const c = client as unknown as Record<string, unknown>;
    const addressParts = [
      c.address_street,
      c.address_number,
      c.address_complement,
      c.address_neighborhood,
      c.address_city && c.address_state
        ? `${c.address_city}/${c.address_state}`
        : c.address_city ?? c.address_state,
    ].filter(Boolean);
    const fullAddress = addressParts.join(", ") || null;

    // AssemblyClient enriquecido com todos os campos necessários para qualificacao_contratante
    const assemblyClient = {
      name:             c.name as string | null | undefined,
      responsible_name: c.responsible_name as string | null | undefined,
      company_name:     (c.company ?? c.company_name) as string | null | undefined,
      document:         c.document as string | null | undefined,
      cnpj:             c.cnpj as string | null | undefined,
      cpf:              c.cpf as string | null | undefined,
      cidade:           c.address_city as string | null | undefined,
      estado:           c.address_state as string | null | undefined,
      address:          fullAddress,
      estado_civil:     c.estado_civil as string | null | undefined,
      nacionalidade:    (c.nacionalidade as string | null | undefined) ?? "brasileiro(a)",
      representatives:  representatives ?? [],
    };

    const cr = contract as Record<string, unknown>;

    // assembleContract throws with the spec error message when structure is null
    return assembleContract(
      {
        ...(contract as Parameters<typeof assembleContract>[0]),
        duration_months:          cr.duration_months as number | null | undefined,
        due_day:                  cr.due_day as number | null | undefined,
        recurring_payment_method: cr.recurring_payment_method as string | null | undefined,
        chave_pix:                cr.chave_pix as string | null | undefined,
        payment_schedule:         paymentSchedule ?? [],
        // Resolve chave_pix: if stored value is a UUID matching a pix_key, use its key_value
        chave_pix: (() => {
          const stored = cr.chave_pix as string | null | undefined;
          if (!stored) {
            // fallback: use default pix key for the org
            const def = (pixKeys ?? []).find(k => k.is_default) ?? (pixKeys ?? [])[0];
            if (!def) return null;
            return def.holder_name
              ? `${def.key_value} – ${def.holder_name}`
              : def.key_value;
          }
          const match = (pixKeys ?? []).find(k => k.id === stored);
          if (match) {
            return match.holder_name
              ? `${match.key_value} – ${match.holder_name}`
              : match.key_value;
          }
          return stored; // legacy literal value
        })(),
        metadata: {
          ...((contract as ContractWithMeta).metadata ?? {}),
          // Pass catalogItems from DB so buildScopeString can enrich {{servicos}}
          catalogItems: catalogItems ?? [],
        },
      },
      clauses ?? [],
      template,
      assemblyClient
    );
  }, [contract, client, clauses, template, representatives, paymentSchedule, catalogItems, pixKeys]);

  // ── openReviewModal ────────────────────────────────────────────────────────

  const openReviewModal = useCallback(async (): Promise<void> => {
    setAssemblyError(null);
    setIsAssembling(true);

    try {
      // Aguarda até os dados estarem disponíveis (até 8 tentativas com 500ms de intervalo)
      let result;
      let attempts = 0;
      while (attempts < 8) {
        try {
          result = assemble();
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          // Só retenta se for erro de dados não carregados ou template/client não carregado
          const isLoadingError = msg.includes('não carregado')
            || msg.includes('not loaded')
            || msg.includes('template padrão')
            || msg.includes('Nenhum template');
          if (isLoadingError && attempts < 7) {
            attempts++;
            await new Promise(res => setTimeout(res, 500));
            continue;
          }
          throw err;
        }
      }
      if (!result) throw new Error("Não foi possível montar o contrato.");
      // Warn about unresolved variables (Requirement 9.4 / 3.6)
      if (result.unresolvedVariables.length > 0) {
        const varList = result.unresolvedVariables.join(", ");
        toast.warning(
          `Variáveis não resolvidas no documento: ${varList}. Elas aparecerão em branco no contrato.`
        );
      }

      // Sem edits — renderiza direto
      const html = renderContractHtml(result, {});
      setAssembledResult(result);
      setAssembledHtml(html);
      setIsOpen(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro desconhecido ao montar o contrato.";
      console.error("[useContractAssembly] openReviewModal error:", message, {
        contractId,
        hasContract: !!contract,
        hasClient: !!client,
        hasTemplate: !!template,
        hasClauses: !!(clauses?.length),
        organizationId,
        contractClientId: contract?.client_id,
      });
      setAssemblyError(message);
      toast.error(message);
    } finally {
      setIsAssembling(false);
    }
  }, [assemble, contract]);

  // ── closeReviewModal ───────────────────────────────────────────────────────

  const closeReviewModal = useCallback((): void => {
    setIsOpen(false);
    setAssembledResult(null);
    setAssembledHtml(null);
    setAssemblyError(null);
  }, []);

  // ── editClause ─────────────────────────────────────────────────────────────
  //
  // Updates local clauseEdits state AND persists to contracts.metadata.clause_edits.
  // Requirement 9.6

  const editClause = useCallback(
    async (clauseId: string, html: string): Promise<void> => {
      if (!contractId || !assembledResult) return;

      const nextEdits = { ...clauseEdits, [clauseId]: html };
      setClauseEdits(nextEdits);

      // Re-render the preview with the new edit applied
      const updatedHtml = renderContractHtml(assembledResult, nextEdits);
      setAssembledHtml(updatedHtml);

      // Persist the edit snapshot — tenta contracts_v2 primeiro, fallback para contracts
      const currentMeta = (contract?.metadata ?? {}) as Record<string, unknown>;
      const nextMeta = { ...currentMeta, clause_edits: nextEdits };

      const { error: v2Err } = await sb()
        .from("contracts_v2")
        .update({ metadata: nextMeta })
        .eq("id", contractId);

      if (v2Err) {
        // Fallback para contracts legado
        const { error } = await sb()
          .from("contracts")
          .update({ metadata: nextMeta })
          .eq("id", contractId);
        if (error) {
          console.warn("[useContractAssembly] Failed to persist clause_edits:", error.message);
        }
      }

      qc.invalidateQueries({ queryKey: ["contract-assembly", "contract", contractId] });
    },
    [contractId, contract, assembledResult, clauseEdits, qc]
  );

  // ── confirmGenerate ────────────────────────────────────────────────────────
  //
  // 1. Render final HTML with all clause edits
  // 2. Dispatch contract.generated webhook
  // 3. UPDATE contracts SET generated_at = now()
  // Requirement 9.7

  const confirmGenerate = useCallback(async (): Promise<void> => {
    if (!contractId || !assembledResult || !organizationId) return;

    setIsConfirming(true);
    try {
      const finalHtml = renderContractHtml(assembledResult, clauseEdits);

      // Dispatch webhook (fire-and-forget)
      void dispatchWebhook(organizationId, "contract.generated", {
        contract_id: contractId,
        client_id: contract?.client_id,
        html: finalHtml,
        generated_at: new Date().toISOString(),
      });

      const generatedAt = new Date().toISOString();

      // Tenta salvar em contracts_v2 primeiro (html_content + status emitido)
      const { error: v2Err } = await sb()
        .from("contracts_v2")
        .update({
          html_content: finalHtml,
          status:       "emitido",
          emitted_at:   generatedAt,
        })
        .eq("id", contractId);

      // Se não era contracts_v2, salva em contracts legado
      if (v2Err) {
        const { error: legacyErr } = await sb()
          .from("contracts")
          .update({ generated_at: generatedAt })
          .eq("id", contractId);
        if (legacyErr) throw legacyErr;
      }

      // Invalidate caches
      if (contract?.client_id) {
        qc.invalidateQueries({ queryKey: ["contracts", organizationId, contract.client_id] });
        qc.invalidateQueries({ queryKey: ["contracts_v2", organizationId, contract.client_id] });
        qc.invalidateQueries({ queryKey: ["contracts_with_c8", organizationId, contract.client_id] });
      }
      qc.invalidateQueries({ queryKey: ["contract-assembly", "contract", contractId] });

      toast.success("Contrato gerado com sucesso!");
      setIsOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao confirmar geração do contrato.";
      toast.error(message);
    } finally {
      setIsConfirming(false);
    }
  }, [contractId, contract, assembledResult, clauseEdits, organizationId, qc]);

  // ── Return ─────────────────────────────────────────────────────────────────

  // setIsReviewOpen alias — GenerateContractButton passes `false` to close
  const setIsReviewOpen = useCallback(
    (open: boolean) => {
      if (!open) closeReviewModal();
    },
    [closeReviewModal]
  );

  return {
    isOpen,
    isReviewOpen: isOpen,
    assembledResult,
    assembledHtml,
    clauseEdits,
    assemblyError,
    isAssembling,
    isConfirming,
    template,
    openReviewModal,
    openReview: openReviewModal,
    closeReviewModal,
    setIsReviewOpen,
    editClause,
    confirmGenerate,
  };
}
