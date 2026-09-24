import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import type { ContractGuarantee } from "@/lib/contracts/assembleContract";

// ── Tipo completo do banco ────────────────────────────────────────────────────

export interface ContractGuaranteeRow extends ContractGuarantee {
  contract_id: string;
  organization_id: string;
  client_id: string;
  kpi_id: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ── KPIs predefinidas globais (usadas no seletor de garantias) ────────────────
// Espelham PREDEFINED_KPIS de KPIConfigs.tsx — fonte única de verdade aqui.

export const PREDEFINED_KPI_OPTIONS: {
  name: string;
  unit: ContractGuarantee['kpi_unit'];
}[] = [
  { name: "Faturamento Bruto",                      unit: "currency"    },
  { name: "Faturamento Líquido",                    unit: "currency"    },
  { name: "Taxa de Crescimento de Receita",          unit: "percentage"  },
  { name: "Ticket Médio Físico",                    unit: "currency"    },
  { name: "Ticket Médio Digital",                   unit: "currency"    },
  { name: "Margem de Contribuição",                  unit: "percentage"  },
  { name: "Custo de Aquisição de Cliente (CAC)",    unit: "currency"    },
  { name: "ROI (Retorno Sobre o Investimento)",     unit: "number"      },
  { name: "Número de Clientes Ativos",              unit: "number"      },
  { name: "Número Total de Clientes",               unit: "number"      },
  { name: "Número de Pedidos",                      unit: "number"      },
];

// ── Hook principal ────────────────────────────────────────────────────────────

export function useContractGuarantees(contractId: string | undefined) {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const queryKey = ["contract_guarantees", organizationId, contractId];

  const query = useQuery<ContractGuaranteeRow[]>({
    queryKey,
    queryFn: async () => {
      if (!organizationId || !contractId) return [];
      const { data, error } = await supabase
        .from("contract_guarantees")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("contract_id", contractId)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as ContractGuaranteeRow[];
    },
    enabled: !!organizationId && !!contractId,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (
      g: Partial<ContractGuaranteeRow> & {
        contract_id: string;
        client_id: string;
        kpi_name: string;
        growth_percent: number;
        deadline: string;
      }
    ) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const payload = {
        contract_id:    g.contract_id,
        client_id:      g.client_id,
        kpi_id:         g.kpi_id ?? null,
        kpi_name:       g.kpi_name,
        kpi_unit:       g.kpi_unit ?? "number",
        growth_percent: g.growth_percent,
        base_value:     g.base_value ?? null,
        deadline:       g.deadline,
        notes:          g.notes ?? null,
        display_order:  g.display_order ?? 0,
      };
      if (g.id) {
        const { error } = await supabase
          .from("contract_guarantees")
          .update(payload)
          .eq("id", g.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_guarantees")
          .insert({ ...payload, organization_id: organizationId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contract_guarantees")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      await Promise.all(
        ids.map((id, i) =>
          supabase
            .from("contract_guarantees")
            .update({ display_order: i })
            .eq("id", id)
            .eq("organization_id", organizationId)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { ...query, save, remove, reorder };
}
