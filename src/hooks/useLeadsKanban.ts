import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Lead, EtapaKanban } from "@/types/database";

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
        .update({ etapa_kanban: etapaKanban })
        .eq("id", leadId);
      if (updateError) {
        setError(updateError as Error);
        fetchLeads();
      }
    },
    [fetchLeads]
  );

  return { leads, loading, error, updateEtapaKanban, refetch: fetchLeads };
}
