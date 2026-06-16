import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateUniqueSlug } from "@/lib/proposalSlug";
import type { Proposal, ProposalFilters, ProposalSummary, ProposalStatus } from "@/types/proposals";

const sb = () => supabase as unknown as SupabaseClient;

function buildSummary(proposals: Proposal[]): ProposalSummary {
  const total = proposals.length;
  const sent = proposals.filter(p => p.status !== "rascunho").length;
  const approved = proposals.filter(p => p.status === "aprovada").length;
  const approvalRate = sent > 0 ? (approved / sent) * 100 : null;
  const totalApprovedValue = proposals
    .filter(p => p.status === "aprovada")
    .reduce((sum, p) => sum + p.plan_value, 0);
  return { total, sent, approved, approvalRate, totalApprovedValue };
}

export function useProposals(organizationId: string | undefined, filters?: ProposalFilters) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["proposals", organizationId, filters],
    queryFn: async () => {
      if (!organizationId) return { proposals: [] as Proposal[], summary: buildSummary([]) };

      let q = sb()
        .from("proposals")
        .select("*")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.closer_id) q = q.eq("closer_id", filters.closer_id);
      if (filters?.date_from) q = q.gte("created_at", filters.date_from);
      if (filters?.date_to) q = q.lte("created_at", filters.date_to);
      if (filters?.campaign_origin) q = q.eq("campaign_origin", filters.campaign_origin);
      if (filters?.lead_origin) q = q.eq("lead_origin", filters.lead_origin);
      if (filters?.tags && filters.tags.length > 0) q = q.overlaps("tags", filters.tags);

      const { data, error } = await q;
      if (error) throw error;
      const proposals = (data ?? []) as unknown as Proposal[];
      return { proposals, summary: buildSummary(proposals) };
    },
    enabled: !!organizationId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["proposals", organizationId] });

  const createProposal = useMutation({
    mutationFn: async (input: {
      client_id: string;
      title: string;
      lead_id?: string;
      closer_id?: string;
      campaign_origin?: string;
      lead_origin?: string;
    }) => {
      if (!organizationId) throw new Error("Sem organização");
      const public_slug = await generateUniqueSlug(sb());
      const { data, error } = await sb()
        .from("proposals")
        .insert({ ...input, organization_id: organizationId, public_slug, status: "rascunho" })
        .select("*")
        .single();
      if (error) throw error;
      await sb().from("proposal_audit_log").insert({
        organization_id: organizationId,
        proposal_id: (data as Record<string, unknown>).id,
        action: "criacao",
      });
      return data as unknown as Proposal;
    },
    onSuccess: invalidate,
  });

  const updateProposal = useMutation({
    mutationFn: async (input: Partial<Proposal> & { id: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { id, ...rest } = input;
      const { data, error } = await sb()
        .from("proposals")
        .update(rest)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();
      if (error) throw error;
      await sb().from("proposal_audit_log").insert({
        organization_id: organizationId,
        proposal_id: id,
        action: "edicao",
      });
      return data as unknown as Proposal;
    },
    onSuccess: invalidate,
  });

  const sendProposal = useMutation({
    mutationFn: async ({ id, channel }: { id: string; channel: "whatsapp" | "email" | "link" }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { data: prop } = await sb().from("proposals").select("plan_value").eq("id", id).single();
      if (!prop || Number((prop as Record<string, unknown>).plan_value) <= 0) {
        throw new Error("O valor do plano deve ser maior que zero para enviar a proposta");
      }
      const { error } = await sb()
        .from("proposals")
        .update({ status: "enviada" as ProposalStatus })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await sb().from("proposal_audit_log").insert({
        organization_id: organizationId,
        proposal_id: id,
        action: "envio",
        metadata: { channel },
      });
    },
    onSuccess: invalidate,
  });

  const archiveProposal = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { error } = await sb()
        .from("proposals")
        .update({ status: "expirada" as ProposalStatus })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteProposal = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { error } = await sb()
        .from("proposals")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await sb().from("proposal_audit_log").insert({
        organization_id: organizationId,
        proposal_id: id,
        action: "exclusao",
      });
    },
    onSuccess: invalidate,
  });

  const duplicateProposal = useMutation({
    mutationFn: async (proposal: Proposal) => {
      if (!organizationId) throw new Error("Sem organização");
      const newSlug = await generateUniqueSlug(sb());
      
      // Duplicate proposal
      const { id: _id, public_slug: _slug, created_at: _ca, updated_at: _ua,
        deleted_at: _da, status: _st, total_views: _tv, total_accesses: _ta,
        avg_session_secs: _as, first_accessed_at: _fa, last_accessed_at: _la,
        ...rest } = proposal;

      const { data: newProposal, error: propErr } = await sb()
        .from("proposals")
        .insert({
          ...rest,
          organization_id: organizationId,
          public_slug: newSlug,
          status: "rascunho",
          title: `${proposal.title} (cópia)`,
          total_views: 0,
          total_accesses: 0,
          avg_session_secs: 0,
          first_accessed_at: null,
          last_accessed_at: null,
          deleted_at: null,
        })
        .select("*")
        .single();

      if (propErr) throw propErr;

      // Duplicate services
      const { data: services } = await sb().from("proposal_services").select("*").eq("proposal_id", proposal.id);
      if (services && services.length > 0) {
        const newServices = (services as Record<string, unknown>[]).map(
          ({ id: _sid, proposal_id: _pid, created_at: _sca, ...s }) => ({
            ...s,
            proposal_id: (newProposal as Record<string, unknown>).id,
            organization_id: organizationId,
          })
        );
        await sb().from("proposal_services").insert(newServices);
      }

      // Duplicate sections
      const { data: sections } = await sb().from("proposal_sections").select("*").eq("proposal_id", proposal.id);
      if (sections && sections.length > 0) {
        const newSections = (sections as Record<string, unknown>[]).map(
          ({ id: _sid, proposal_id: _pid, created_at: _sca, updated_at: _sua, ...s }) => ({
            ...s,
            proposal_id: (newProposal as Record<string, unknown>).id,
            organization_id: organizationId,
          })
        );
        await sb().from("proposal_sections").insert(newSections);
      }

      return (newProposal as Record<string, unknown>).id as string;
    },
    onSuccess: invalidate,
  });

  return {
    ...query,
    proposals: query.data?.proposals ?? [],
    summary: query.data?.summary ?? buildSummary([]),
    createProposal,
    updateProposal,
    sendProposal,
    archiveProposal,
    deleteProposal,
    duplicateProposal,
  };
}
