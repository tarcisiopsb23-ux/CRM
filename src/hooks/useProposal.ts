import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SECTION_LABELS as LABELS,
  SECTION_ORDER as ORDER,
} from "@/types/proposals";
import type {
  Proposal, ProposalService, ProposalSection, ProposalAcceptance, SectionKey,
} from "@/types/proposals";

const sb = () => supabase as unknown as SupabaseClient;

export interface ProposalDetail {
  proposal: Proposal;
  services: ProposalService[];
  sections: ProposalSection[];
  acceptance: ProposalAcceptance | null;
}

export function useProposal(proposalId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["proposal", proposalId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ProposalDetail | null> => {
      if (!proposalId) return null;
      const [propRes, servRes, sectRes, accRes] = await Promise.all([
        sb().from("proposals").select("*").eq("id", proposalId).single(),
        sb().from("proposal_services").select("*").eq("proposal_id", proposalId).order("sort_order"),
        sb().from("proposal_sections").select("*").eq("proposal_id", proposalId).order("section_order"),
        sb().from("proposal_acceptances").select("*").eq("proposal_id", proposalId).maybeSingle(),
      ]);
      if (propRes.error) throw propRes.error;
      return {
        proposal: propRes.data as unknown as Proposal,
        services: (servRes.data ?? []) as unknown as ProposalService[],
        sections: (sectRes.data ?? []) as unknown as ProposalSection[],
        acceptance: (accRes.data as unknown as ProposalAcceptance) ?? null,
      };
    },
    enabled: !!proposalId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const updateHero = useMutation({
    mutationFn: async (heroData: Partial<Proposal>) => {
      if (!proposalId) throw new Error("Sem proposalId");
      const { error } = await sb().from("proposals").update(heroData).eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateSchedule = useMutation({
    mutationFn: async (schedule: Proposal["schedule"]) => {
      if (!proposalId) throw new Error("Sem proposalId");
      const { error } = await sb().from("proposals").update({ schedule }).eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: Proposal["status"]) => {
      if (!proposalId) throw new Error("Sem proposalId");
      const { error } = await sb().from("proposals").update({ status }).eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const upsertServices = useMutation({
    mutationFn: async (services: Array<Omit<ProposalService, "id" | "created_at"> & { id?: string }>) => {
      if (!proposalId) throw new Error("Sem proposalId");
      const { data: prop } = await sb().from("proposals").select("organization_id").eq("id", proposalId).single();
      const orgId = (prop as Record<string, unknown>)?.organization_id as string;
      await sb().from("proposal_services").delete().eq("proposal_id", proposalId);
      if (services.length > 0) {
        const toInsert = services.map((s, i) => ({
          proposal_id: proposalId,
          organization_id: orgId,
          name: s.name,
          description: s.description,
          value: s.value,
          is_bonus: s.is_bonus,
          sort_order: i,
        }));
        const { error } = await sb().from("proposal_services").insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const upsertSection = useMutation({
    mutationFn: async (section: { section_key: SectionKey; content: string; is_visible?: boolean }) => {
      if (!proposalId) throw new Error("Sem proposalId");
      const { data: prop } = await sb().from("proposals").select("organization_id").eq("id", proposalId).single();
      const orgId = (prop as Record<string, unknown>)?.organization_id as string;
      const sectionIndex = ORDER.indexOf(section.section_key);
      const { error } = await sb().from("proposal_sections").upsert({
        proposal_id: proposalId,
        organization_id: orgId,
        section_key: section.section_key,
        title: LABELS[section.section_key],
        content: section.content,
        is_visible: section.is_visible ?? true,
        section_order: sectionIndex >= 0 ? sectionIndex : 99,
      }, { onConflict: "proposal_id,section_key" });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    ...query,
    detail: query.data,
    updateHero,
    updateSchedule,
    updateStatus,
    upsertServices,
    upsertSection,
  };
}
