/**
 * useAmendmentAssembly
 *
 * Orquestra a montagem do documento de aditivo:
 *   1. Busca o template de aditivo (padrão da org ou override do contrato)
 *   2. Busca dados do cliente
 *   3. Busca representantes
 *   4. Chama assembleAmendment e abre o modal de revisão
 *   5. confirmGenerate salva pdf_url no aditivo e marca como assinado
 */
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { assembleAmendment } from "@/lib/contracts/assembleAmendment";
import type { ContractAmendment } from "@/hooks/useContractAmendments";
import type { ContractTemplate } from "@/hooks/useContractTemplates";
import type { ContractRow } from "@/hooks/useContracts";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface AmendmentAssemblyState {
  isReviewOpen: boolean;
  setIsReviewOpen: (v: boolean) => void;
  assembledHtml: string | null;
  assemblyError: string | null;
  isAssembling: boolean;
  isConfirming: boolean;
  openReview: (amendmentOverride?: ContractAmendment | null) => Promise<void>;
  confirmGenerate: () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAmendmentAssembly(
  amendment: ContractAmendment | null,
  contract:  ContractRow | null
): AmendmentAssemblyState {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const [isReviewOpen,  setIsReviewOpen]  = useState(false);
  const [assembledHtml, setAssembledHtml] = useState<string | null>(null);
  const [assemblyError, setAssemblyError] = useState<string | null>(null);
  const [isAssembling,  setIsAssembling]  = useState(false);
  const [isConfirming,  setIsConfirming]  = useState(false);
  // Aditivo que está sendo montado/confirmado (pode vir do parâmetro ou do override)
  const [activeAmendment, setActiveAmendment] = useState<ContractAmendment | null>(amendment);

  // ── Template de aditivo ────────────────────────────────────────────────────
  // Prefere amendment_template_id do contrato; fallback: template padrão de aditivo da org
  const { data: template } = useQuery<ContractTemplate | null>({
    queryKey: ["amendment_template", organizationId, (contract as any)?.amendment_template_id],
    queryFn: async (): Promise<ContractTemplate | null> => {
      if (!organizationId) return null;

      // Override por contrato
      const overrideId = (contract as any)?.amendment_template_id as string | null | undefined;
      if (overrideId) {
        const { data } = await supabase
          .from("contract_templates")
          .select("*")
          .eq("id", overrideId)
          .single();
        if (data) return data as ContractTemplate;
      }

      // Padrão de aditivo da org
      const { data } = await supabase
        .from("contract_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("template_type", "aditivo")
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as ContractTemplate | null;
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  // ── Cliente ────────────────────────────────────────────────────────────────
  const { data: client } = useQuery({
    queryKey: ["amendment_client", contract?.client_id],
    queryFn: async () => {
      if (!contract?.client_id) return null;
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", contract.client_id)
        .single();
      return data as Record<string, unknown> | null;
    },
    enabled: !!contract?.client_id,
    staleTime: 60_000,
  });

  // ── Representantes ─────────────────────────────────────────────────────────
  const { data: representatives } = useQuery({
    queryKey: ["amendment_reps", contract?.client_id, organizationId],
    queryFn: async () => {
      if (!contract?.client_id || !organizationId) return [];
      const { data } = await supabase
        .from("client_representatives_vw")
        .select("id, nome, cpf, cargo, qualificacao, tipo_representacao, is_signing_responsible, is_legal_representative")
        .eq("client_id", contract.client_id)
        .eq("organization_id", organizationId)
        .order("display_order");
      return (data ?? []) as Record<string, unknown>[];
    },
    enabled: !!contract?.client_id && !!organizationId,
    staleTime: 60_000,
  });

  // ── openReview ─────────────────────────────────────────────────────────────
  const openReview = useCallback(async (amendmentOverride?: ContractAmendment | null): Promise<void> => {
    const targetAmendment = amendmentOverride ?? amendment;
    if (!targetAmendment || !contract) {
      toast.error("Dados do aditivo não disponíveis.");
      return;
    }
    setActiveAmendment(targetAmendment);

    setAssemblyError(null);
    setIsAssembling(true);

    try {
      if (!template) {
        throw new Error(
          "Nenhum template de aditivo configurado. Acesse Configurações → Contratos → Templates de Aditivo."
        );
      }

      const assemblyClient = {
        name:          client?.name as string | null,
        company_name:  (client?.company ?? client?.company_name) as string | null,
        document:      client?.document as string | null,
        cidade:        client?.address_city as string | null,
        estado:        client?.address_state as string | null,
        estado_civil:  client?.estado_civil as string | null,
        nacionalidade: (client?.nacionalidade as string | null) ?? "brasileiro(a)",
        representatives: (representatives ?? []).map(r => ({
          nome:                  String(r.nome ?? ""),
          cpf:                   String(r.cpf ?? ""),
          cargo:                 r.cargo as string | null,
          qualificacao:          r.qualificacao as string | null,
          is_signing_responsible: r.is_signing_responsible as boolean | undefined,
        })),
      };

      const result = assembleAmendment(targetAmendment, contract as any, assemblyClient, template);

      if (result.unresolvedVariables.length > 0) {
        toast.warning(
          `Variáveis não resolvidas no aditivo: ${result.unresolvedVariables.join(", ")}. Aparecerão em branco.`
        );
      }

      setAssembledHtml(result.html);
      setIsReviewOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao montar o aditivo.";
      setAssemblyError(msg);
      toast.error(msg);
    } finally {
      setIsAssembling(false);
    }
  }, [amendment, contract, template, client, representatives]);

  // ── confirmGenerate ────────────────────────────────────────────────────────
  const confirmGenerate = useCallback(async (): Promise<void> => {
    if (!activeAmendment || !assembledHtml || !organizationId) return;

    setIsConfirming(true);
    try {
      const { error } = await supabase
        .from("contract_amendments")
        .update({
          document_content: assembledHtml,
          status:           "assinado",
          signed_at:        new Date().toISOString(),
        })
        .eq("id", activeAmendment.id)
        .eq("organization_id", organizationId);

      if (error) throw error;

      qc.invalidateQueries({
        queryKey: ["contract_amendments", organizationId, activeAmendment.contract_id],
      });

      toast.success("Documento do aditivo gerado com sucesso!");
      setIsReviewOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar documento.";
      toast.error(msg);
    } finally {
      setIsConfirming(false);
    }
  }, [activeAmendment, assembledHtml, organizationId, qc]);

  return {
    isReviewOpen,
    setIsReviewOpen: (v: boolean) => {
      if (!v) { setIsReviewOpen(false); setAssembledHtml(null); }
      else setIsReviewOpen(true);
    },
    assembledHtml,
    assemblyError,
    isAssembling,
    isConfirming,
    openReview,
    confirmGenerate,
  };
}
