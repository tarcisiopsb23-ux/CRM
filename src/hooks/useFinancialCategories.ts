import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FinancialCategoryType = "credit" | "debit";

export type FinancialCategoryRow = {
  id: string;
  organization_id: string;
  name: string;
  category_type: FinancialCategoryType;
  created_at: string | null;
  updated_at: string | null;
};

const asCategoryType = (v: string): FinancialCategoryType =>
  v === "credit" || v === "debit" ? v : "debit";

export function useFinancialCategories(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;

  const query = useQuery({
    queryKey: ["financial_categories", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabaseUntyped
        .from("financial_categories")
        .select("*")
        .eq("organization_id", organizationId)
        .order("category_type")
        .order("name");
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        organization_id: String(r.organization_id),
        name: String(r.name ?? ""),
        category_type: asCategoryType(String(r.category_type ?? "debit")),
        created_at: (r.created_at as string | null) ?? null,
        updated_at: (r.updated_at as string | null) ?? null,
      })) as FinancialCategoryRow[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: { name: string; category_type: FinancialCategoryType }) => {
      if (!organizationId) throw new Error("Sem organização");
      const payload = {
        organization_id: organizationId,
        name: input.name,
        category_type: input.category_type,
      };
      const { data, error } = await supabaseUntyped
        .from("financial_categories")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as FinancialCategoryRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_categories", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; name: string; category_type: FinancialCategoryType }) => {
      const { data, error } = await supabaseUntyped
        .from("financial_categories")
        .update({ name: input.name, category_type: input.category_type })
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as FinancialCategoryRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_categories", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseUntyped.from("financial_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_categories", organizationId] }),
  });

  return { ...query, create, update, remove };
}

