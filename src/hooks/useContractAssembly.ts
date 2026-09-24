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
import type { ContractAssemblyResult, ContractClause, ContractTemplateV2, ClientRepresentativeAssembly } from "@/types/contracts";
import type { Client } from "@/types/crm";
import type { ContractRow } from "@/hooks/useContracts";

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

  // Contract (with metadata)
  const { data: contract } = useQuery<ContractWithMeta | null>({
    queryKey: ["contract-assembly", "contract", contractId],
    queryFn: async (): Promise<ContractWithMeta | null> => {
      if (!contractId) return null;
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
        metadata: {
          ...((contract as ContractWithMeta).metadata ?? {}),
          // Pass catalogItems snapshot so buildScopeString can enrich {{servicos}}
          catalogItems: (contract as ContractWithMeta).metadata?.catalogItems ?? [],
        },
      },
      clauses ?? [],
      template,
      assemblyClient
    );
  }, [contract, client, clauses, template, representatives]);

  // ── openReviewModal ────────────────────────────────────────────────────────

  const openReviewModal = useCallback(async (): Promise<void> => {
    setAssemblyError(null);
    setIsAssembling(true);

    try {
      // Aguarda até os dados estarem disponíveis (até 5 tentativas com 300ms de intervalo)
      let result;
      let attempts = 0;
      while (attempts < 5) {
        try {
          result = assemble();
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          // Só retenta se for erro de dados não carregados
          if ((msg.includes('não carregado') || msg.includes('not loaded')) && attempts < 4) {
            attempts++;
            await new Promise(res => setTimeout(res, 400));
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

      // Seed clauseEdits from previously persisted edits in metadata
      const persistedEdits =
        (contract?.metadata?.clause_edits as Record<string, string> | undefined) ?? {};

      setAssembledResult(result);
      setClauseEdits(persistedEdits);

      // Build initial rendered HTML with any already-saved edits
      const html = renderContractHtml(result, persistedEdits);
      setAssembledHtml(html);
      setIsOpen(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro desconhecido ao montar o contrato.";
      setAssemblyError(message);
    } finally {
      setIsAssembling(false);
    }
  }, [assemble, contract]);

  // ── closeReviewModal ───────────────────────────────────────────────────────

  const closeReviewModal = useCallback((): void => {
    setIsOpen(false);
    setAssembledResult(null);
    setAssembledHtml(null);
    setClauseEdits({});
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

      // Persist the edit snapshot to metadata.clause_edits
      const currentMeta = (contract?.metadata ?? {}) as Record<string, unknown>;
      const nextMeta = {
        ...currentMeta,
        clause_edits: nextEdits,
      };

      const { error } = await sb()
        .from("contracts")
        .update({ metadata: nextMeta })
        .eq("id", contractId);

      if (error) {
        // Non-fatal — the local state is already updated
        console.warn("[useContractAssembly] Failed to persist clause_edits:", error.message);
      } else {
        // Keep the cached contract in sync
        qc.invalidateQueries({ queryKey: ["contract-assembly", "contract", contractId] });
      }
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

      // Dispatch webhook (fire-and-forget — dispatchWebhook handles errors internally)
      void dispatchWebhook(organizationId, "contract.generated", {
        contract_id: contractId,
        client_id: contract?.client_id,
        html: finalHtml,
        clause_edits: clauseEdits,
        generated_at: new Date().toISOString(),
      });

      // Register generated_at timestamp
      const { error } = await sb()
        .from("contracts")
        .update({ generated_at: new Date().toISOString() })
        .eq("id", contractId);

      if (error) throw error;

      // Invalidate any caches that show generated_at
      if (contract?.client_id) {
        qc.invalidateQueries({ queryKey: ["contracts", organizationId, contract.client_id] });
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
    openReviewModal,
    openReview: openReviewModal,
    closeReviewModal,
    setIsReviewOpen,
    editClause,
    confirmGenerate,
  };
}
