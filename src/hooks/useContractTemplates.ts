// src/hooks/useContractTemplates.ts
// Requirements: 4.2, 4.3, 4.4, 4.6, 4.8

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractTemplateV2 } from "@/types/contracts";

const sb = () => supabase as unknown as SupabaseClient;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeleteTemplateBlocked {
  blocked: true;
  /** Number of active/generated contracts referencing this template */
  affectedCount: number;
}

export interface DeleteTemplateSuccess {
  blocked: false;
}

export type DeleteTemplateResult = DeleteTemplateBlocked | DeleteTemplateSuccess;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContractTemplates(organizationId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["contract-templates", organizationId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ContractTemplateV2[]> => {
      if (!organizationId) return [];
      const { data, error } = await sb()
        .from("contract_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContractTemplateV2[];
    },
    enabled: !!organizationId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const createTemplate = useMutation({
    mutationFn: async (input: { name: string; content: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { data, error } = await sb()
        .from("contract_templates")
        .insert({ ...input, organization_id: organizationId })
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as ContractTemplateV2;
    },
    onSuccess: invalidate,
  });

  const updateTemplate = useMutation({
    mutationFn: async (input: Partial<ContractTemplateV2> & { id: string }) => {
      const { id, ...rest } = input;
      const { data, error } = await sb()
        .from("contract_templates")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as ContractTemplateV2;
    },
    onSuccess: invalidate,
  });

  // ── setDefault ─────────────────────────────────────────────────────────────
  //
  // Requirements 4.3, 4.4: ensure at most one template has is_default = true
  // in the organization at any time.
  //
  // Step 1: SET is_default = false WHERE organization_id = org AND id != targetId
  // Step 2: SET is_default = true  WHERE id = targetId
  //
  // No observable intermediate state with two defaults thanks to sequential ops.

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Sem organização");

      // Step 1 — unset all defaults in the org except the target
      const { error: unsetError } = await sb()
        .from("contract_templates")
        .update({ is_default: false })
        .eq("organization_id", organizationId)
        .neq("id", id);
      if (unsetError) throw unsetError;

      // Step 2 — mark the target as default
      const { error: setError } = await sb()
        .from("contract_templates")
        .update({ is_default: true })
        .eq("id", id);
      if (setError) throw setError;
    },
    onSuccess: invalidate,
  });

  // ── deleteTemplate ─────────────────────────────────────────────────────────
  //
  // Requirement 4.8: before deleting, check contracts with status IN ('ativo',
  // 'gerado') that reference this template via template_id. If any exist,
  // return a blocked result with the count; otherwise perform the delete.

  const deleteTemplate = useMutation({
    mutationFn: async (templateId: string): Promise<DeleteTemplateResult> => {
      if (!organizationId) throw new Error("Sem organização");

      // Check for active/generated contracts referencing this template
      const { count, error: countError } = await sb()
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("template_id", templateId)
        .in("status", ["ativo", "gerado"]);

      if (countError) throw countError;

      const affectedCount = count ?? 0;
      if (affectedCount > 0) {
        return { blocked: true, affectedCount };
      }

      // Safe to delete
      const { error: deleteError } = await sb()
        .from("contract_templates")
        .delete()
        .eq("id", templateId);

      if (deleteError) throw deleteError;

      return { blocked: false };
    },
    onSuccess: (result) => {
      if (!result.blocked) {
        invalidate();
      }
    },
  });

  return {
    ...query,
    templates: query.data ?? [],
    createTemplate,
    updateTemplate,
    setDefault,
    deleteTemplate,
  };
}
