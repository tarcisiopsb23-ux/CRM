// src/hooks/useContractClauses.ts
// CRUD + reordering for the contract_clauses table.
// Requirements: 2.3, 2.4, 10.2

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractClause, JSONContent } from "@/types/contracts";

const sb = () => supabase as unknown as SupabaseClient;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateClauseInput {
  title: string;
  content: JSONContent;
  condition_type?: ContractClause["condition_type"];
  condition_value?: ContractClause["condition_value"] | null;
  is_editable?: boolean;
  service_id?: string | null;
}

export interface UpdateClauseInput {
  id: string;
  title?: string;
  content?: JSONContent;
  condition_type?: ContractClause["condition_type"];
  condition_value?: ContractClause["condition_value"] | null;
  is_editable?: boolean;
  service_id?: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContractClauses(organizationId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["contract-clauses", organizationId];

  // ── Query ─────────────────────────────────────────────────────────────────

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ContractClause[]> => {
      if (!organizationId) return [];
      const { data, error } = await sb()
        .from("contract_clauses")
        .select("*")
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ContractClause[];
    },
    enabled: !!organizationId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  // ── Create ────────────────────────────────────────────────────────────────

  const createClause = useMutation({
    mutationFn: async (input: CreateClauseInput): Promise<ContractClause> => {
      if (!organizationId) throw new Error("Sem organização");

      // Assign display_order = count of existing clauses (0-based next index)
      const { count, error: countError } = await sb()
        .from("contract_clauses")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (countError) throw countError;

      const displayOrder = count ?? 0;

      const { data, error } = await sb()
        .from("contract_clauses")
        .insert({
          organization_id: organizationId,
          title: input.title,
          content: input.content,
          display_order: displayOrder,
          condition_type: input.condition_type ?? "always",
          condition_value: input.condition_value ?? null,
          is_editable: input.is_editable ?? false,
          service_id: input.service_id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as ContractClause;
    },
    onSuccess: invalidate,
  });

  // ── Update ────────────────────────────────────────────────────────────────

  const updateClause = useMutation({
    mutationFn: async (input: UpdateClauseInput): Promise<ContractClause> => {
      const { id, ...fields } = input;

      // Only pass defined fields to avoid overwriting with undefined
      const payload: Record<string, unknown> = {};
      if (fields.title !== undefined) payload.title = fields.title;
      if (fields.content !== undefined) payload.content = fields.content;
      if (fields.condition_type !== undefined) payload.condition_type = fields.condition_type;
      if ("condition_value" in fields) payload.condition_value = fields.condition_value ?? null;
      if (fields.is_editable !== undefined) payload.is_editable = fields.is_editable;
      if ("service_id" in fields) payload.service_id = fields.service_id ?? null;

      const { data, error } = await sb()
        .from("contract_clauses")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as ContractClause;
    },
    onSuccess: invalidate,
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteClause = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!organizationId) throw new Error("Sem organização");

      // 1. Delete the clause
      const { error: deleteError } = await sb()
        .from("contract_clauses")
        .delete()
        .eq("id", id);
      if (deleteError) throw deleteError;

      // 2. Fetch remaining clauses ordered by display_order to renumber them
      const { data: remaining, error: fetchError } = await sb()
        .from("contract_clauses")
        .select("id")
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true });
      if (fetchError) throw fetchError;

      const rows = (remaining ?? []) as Array<{ id: string }>;
      if (rows.length === 0) return;

      // 3. Renumber to gap-free sequence {0, 1, ..., n-1}
      await Promise.all(
        rows.map((row, index) =>
          sb()
            .from("contract_clauses")
            .update({ display_order: index })
            .eq("id", row.id)
        )
      );
    },
    onSuccess: invalidate,
  });

  // ── Reorder ───────────────────────────────────────────────────────────────

  /**
   * reorderClauses — accepts an ordered array of clause IDs and assigns
   * display_order = index for each, producing a gap-free sequence {0, …, n-1}.
   *
   * Property 4: Sequência de display_order sem lacunas  (Req 2.3, 2.4)
   * Property 5: Idempotência de reordenação de cláusulas (Req 2.3)
   */
  async function reorderClauses(clauseIds: string[]): Promise<void> {
    await Promise.all(
      clauseIds.map((id, index) =>
        sb()
          .from("contract_clauses")
          .update({ display_order: index })
          .eq("id", id)
      )
    );
    await invalidate();
  }

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    clauses: query.data ?? [],
    isLoading: query.isLoading,
    createClause,
    updateClause,
    deleteClause,
    reorderClauses,
  };
}
