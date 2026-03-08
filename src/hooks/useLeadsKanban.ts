import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Lead, EtapaKanban } from "@/types/database";

export interface CreateLeadInput {
  empresa: string;
  nicho?: string | null;
  cidade?: string | null;
  email?: string | null;
  telefone?: string | null;
  origem?: string | null;
  faturamento?: number;
  prioridade?: string | null;
  responsavel?: string | null;
  observacoes?: string | null;
}

export function useLeadsKanban(organizationId: string | undefined) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("leads")
      .select("*, profiles:assigned_to(full_name)")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true });
    if (fetchError) {
      setError(fetchError as Error);
      setLeads([]);
    } else {
      setLeads((data as Lead[]) ?? []);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          fetchLeads();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, fetchLeads]);

  const updateEtapaKanban = useCallback(
    async (leadId: string, etapaKanban: EtapaKanban) => {
      const { error: updateError } = await supabase
        .from("leads")
        .update({ etapa_kanban: etapaKanban, stage_id: etapaKanban })
        .eq("id", leadId);
      if (updateError) {
        setError(updateError as Error);
        fetchLeads();
      }
    },
    [fetchLeads]
  );

  const createLead = useCallback(
    async (input: CreateLeadInput) => {
      if (!organizationId) throw new Error("Sem organização");
      const etapa = "leads_recebidos" as const;
      const metadata = input.cidade ? { cidade: input.cidade } : undefined;
      const { data, error: insertError } = await supabase
        .from("leads")
        .insert({
          organization_id: organizationId,
          name: input.empresa,
          company: input.empresa,
          nicho: input.nicho ?? null,
          email: input.email ?? null,
          phone: input.telefone ?? null,
          source: input.origem ?? null,
          value: input.faturamento ?? 0,
          prioridade: input.prioridade ?? "media",
          assigned_to: (input.responsavel?.trim() || null) as string | null,
          notes: input.observacoes ?? null,
          etapa_kanban: etapa,
          stage_id: etapa,
          ...(metadata && { metadata: toJson(metadata) }),
        })
        .select("*, profiles:assigned_to(full_name)")
        .single();
      if (insertError) throw insertError;
      fetchLeads();
      return data as Lead;
    },
    [organizationId, fetchLeads]
  );

  const importLeadsBatch = useCallback(
    async (
      items: CreateLeadInput[],
      profileNameToId?: (name: string) => string | null
    ): Promise<{ created: number; errors: string[] }> => {
      if (!organizationId) throw new Error("Sem organização");
      const etapa = "leads_recebidos" as const;
      const errors: string[] = [];
      let created = 0;
      for (let i = 0; i < items.length; i++) {
        const input = items[i];
        if (!input.empresa?.trim()) {
          errors.push(`Linha ${i + 2}: Empresa vazia`);
          continue;
        }
        const responsavelId =
          profileNameToId && input.responsavel?.trim()
            ? profileNameToId(input.responsavel)
            : null;
        const metadata = input.cidade ? { cidade: input.cidade } : undefined;
        try {
          const { error: insertError } = await supabase.from("leads").insert({
            organization_id: organizationId,
            name: input.empresa,
            company: input.empresa,
            nicho: input.nicho ?? null,
            email: input.email ?? null,
            phone: input.telefone ?? null,
            source: input.origem ?? null,
            value: input.faturamento ?? 0,
            prioridade: input.prioridade ?? "media",
            assigned_to: responsavelId,
            notes: null,
            etapa_kanban: etapa,
            stage_id: etapa,
            ...(metadata && { metadata: toJson(metadata) }),
          });
          if (insertError) throw insertError;
          created++;
        } catch (err) {
          errors.push(
            `Linha ${i + 2} (${input.empresa}): ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      if (created > 0) fetchLeads();
      return { created, errors };
    },
    [organizationId, fetchLeads]
  );

  return { leads, loading, error, updateEtapaKanban, createLead, importLeadsBatch, refetch: fetchLeads };
}
