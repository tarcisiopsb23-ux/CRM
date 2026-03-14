import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Lead, EtapaKanban } from "@/types/database";
import type { TablesInsert } from "@/types/supabase";

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

export interface CreateLeadRow {
  company?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  nicho?: string | null;
  source?: string | null;
  value?: number | null;
  prioridade?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
  first_contact_date?: string | null;
  last_contact_date?: string | null;
  product_service?: string | null;
  cpf_cnpj?: string | number | null;
  contact_origin?: string | null;
  decision_maker?: boolean | null;
  decision_maker_name?: string | null;
  decision_maker_phone?: string | number | null;
  gbp_url?: string | null;
  instagram_url?: string | null;
  website_url?: string | null;
  gmn_status?: string | null;
  google_ads_level?: string | null;
  meta_ads_level?: string | null;
  social_media_status?: string | null;
  lost_reason?: string | null;
  cadence?: string | null;
  temperature?: number | null;
  campaign_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UseLeadsKanbanOptions {
  /**
   * when true the hook will not remove leads that have been converted to
   * clients (or marked with metadata.converted_to_client) from the result.  the
   * default behaviour is still to hide those records because the main purpose
   * of this hook is to power the kanban/list view. callers like the dashboard
   * or reports that need full counts can opt-in via this flag.
   */
  includeConverted?: boolean;
}

export function useLeadsKanban(
  organizationId: string | undefined,
  options: UseLeadsKanbanOptions = {}
) {
  const { includeConverted = false } = options;
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
      const raw = (data as Lead[]) ?? [];

      if (includeConverted) {
        // when the caller requested all leads, just return the raw rows
        setLeads(raw);
      } else {
        // preserve old behaviour: filter out leads that were converted to
        // clients or marked with metadata.converted_to_client
        const { data: clientLeadRows } = await supabase
          .from("clients")
          .select("lead_id")
          .eq("organization_id", organizationId)
          .not("lead_id", "is", null);
        const linkedLeadIds = new Set(
          (clientLeadRows ?? []).map((r) =>
            String((r as { lead_id: string | null }).lead_id)
          )
        );
        const filtered = raw.filter((l) => {
          const meta = (l.metadata ?? {}) as Record<string, unknown>;
          return (
            meta.converted_to_client !== true &&
            !linkedLeadIds.has(String(l.id))
          );
        });
        setLeads(filtered);
      }
    }
    setLoading(false);
  }, [organizationId, includeConverted]);

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
      if (etapaKanban === "qualificados") {
        const { data: current, error: readErr } = await supabase
          .from("leads")
          .select("etapa_kanban, metadata")
          .eq("id", leadId)
          .single();
        if (readErr) throw readErr;
        const etapaAtual = (current?.etapa_kanban ?? "leads_recebidos") as EtapaKanban;
        const meta = (current?.metadata ?? {}) as Record<string, unknown>;
        const preQual = (meta.pre_qualificacao ?? null) as Record<string, unknown> | null;
        const preQualConcluida = preQual?.concluida === true;
        if (etapaAtual === "leads_recebidos" && !preQualConcluida) {
          throw new Error("Pré-qualificação obrigatória para mover de Lead Recebido para Qualificado.");
        }
      }
      const { error: updateError } = await supabase
        .from("leads")
        .update({ etapa_kanban: etapaKanban, stage_id: etapaKanban })
        .eq("id", leadId);
      if (updateError) throw updateError;
      await fetchLeads();
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

  const importLeadsMapped = useCallback(
    async (
      rows: CreateLeadRow[],
      profileNameToId?: (name: string) => string | null
    ): Promise<{ created: number; errors: string[] }> => {
      if (!organizationId) throw new Error("Sem organização");
      const etapa = "leads_recebidos" as const;
      const errors: string[] = [];
      let created = 0;

      const looksLikeUuid = (v: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] ?? {};
        const rawName = (r.name ?? "").toString().trim();
        const rawCompany = (r.company ?? "").toString().trim();
        const name = rawName || rawCompany;
        const company = rawCompany || rawName;
        if (!name) {
          errors.push(`Linha ${i + 2}: Nome/Empresa vazio`);
          continue;
        }

        let assignedTo: string | null = (r.assigned_to ?? null) as string | null;
        if (assignedTo && !looksLikeUuid(assignedTo) && profileNameToId) {
          assignedTo = profileNameToId(assignedTo) ?? null;
        }

        try {
          const payload: Record<string, unknown> = {
            organization_id: organizationId,
            etapa_kanban: etapa,
            stage_id: etapa,
            name,
            company,
            email: r.email ?? null,
            phone: r.phone ?? null,
            nicho: r.nicho ?? null,
            source: r.source ?? null,
            value: r.value ?? 0,
            prioridade: r.prioridade ?? "media",
            assigned_to: assignedTo,
            notes: r.notes ?? null,
            first_contact_date: r.first_contact_date ?? null,
            last_contact_date: r.last_contact_date ?? null,
            product_service: r.product_service ?? null,
            cpf_cnpj: r.cpf_cnpj ?? null,
            contact_origin: r.contact_origin ?? null,
            decision_maker: r.decision_maker ?? null,
            decision_maker_name: r.decision_maker_name ?? null,
            decision_maker_phone: r.decision_maker_phone ?? null,
            gbp_url: r.gbp_url ?? null,
            instagram_url: r.instagram_url ?? null,
            website_url: r.website_url ?? null,
            gmn_status: r.gmn_status ?? null,
            google_ads_level: r.google_ads_level ?? null,
            meta_ads_level: r.meta_ads_level ?? null,
            social_media_status: r.social_media_status ?? null,
            lost_reason: r.lost_reason ?? null,
            cadence: r.cadence ?? null,
            temperature: r.temperature ?? null,
            ...(r.metadata ? { metadata: toJson(r.metadata) } : {}),
          };

          const { error: insertError } = await supabase
            .from("leads")
            .insert(payload as unknown as TablesInsert<"leads">);
          if (insertError) throw insertError;
          created++;
        } catch (err) {
          errors.push(`Linha ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (created > 0) fetchLeads();
      return { created, errors };
    },
    [organizationId, fetchLeads]
  );

  const updateLead = useCallback(
    async (id: string, input: Partial<Lead>) => {
      const payload: Record<string, unknown> = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.company !== undefined && { company: input.company }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.nicho !== undefined && { nicho: input.nicho }),
        ...(input.source !== undefined && { source: input.source }),
        ...(input.value !== undefined && { value: input.value }),
        ...(input.prioridade !== undefined && { prioridade: input.prioridade }),
        ...(input.assigned_to !== undefined && { assigned_to: input.assigned_to }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.first_contact_date !== undefined && { first_contact_date: input.first_contact_date }),
        ...(input.last_contact_date !== undefined && { last_contact_date: input.last_contact_date }),
        ...(input.product_service !== undefined && { product_service: input.product_service }),
        ...(input.cpf_cnpj !== undefined && { cpf_cnpj: input.cpf_cnpj }),
        ...(input.contact_origin !== undefined && { contact_origin: input.contact_origin }),
        ...(input.decision_maker !== undefined && { decision_maker: input.decision_maker }),
        ...(input.decision_maker_name !== undefined && { decision_maker_name: input.decision_maker_name }),
        ...(input.decision_maker_phone !== undefined && { decision_maker_phone: input.decision_maker_phone }),
        ...(input.gbp_url !== undefined && { gbp_url: input.gbp_url }),
        ...(input.instagram_url !== undefined && { instagram_url: input.instagram_url }),
        ...(input.website_url !== undefined && { website_url: input.website_url }),
        ...(input.gmn_status !== undefined && { gmn_status: input.gmn_status }),
        ...(input.google_ads_level !== undefined && { google_ads_level: input.google_ads_level }),
        ...(input.meta_ads_level !== undefined && { meta_ads_level: input.meta_ads_level }),
        ...(input.social_media_status !== undefined && { social_media_status: input.social_media_status }),
        ...(input.lost_reason !== undefined && { lost_reason: input.lost_reason }),
        ...(input.cadence !== undefined && { cadence: input.cadence }),
        ...(input.temperature !== undefined && { temperature: input.temperature }),
      };
      if (input.metadata !== undefined) {
        const { data: current, error: readErr } = await supabase.from("leads").select("metadata").eq("id", id).single();
        if (readErr) throw readErr;
        const currentMeta = (current?.metadata ?? {}) as Record<string, unknown>;
        const incomingMeta =
          typeof input.metadata === "object" && input.metadata
            ? (input.metadata as Record<string, unknown>)
            : {};
        payload.metadata = toJson({ ...currentMeta, ...incomingMeta });
      }
      const { error: updErr } = await supabase.from("leads").update(payload).eq("id", id);
      if (updErr) {
        setError(updErr as Error);
        throw updErr;
      }
      await fetchLeads();
    },
    [fetchLeads]
  );

  const removeLead = useCallback(
    async (id: string) => {
      const { error: delErr } = await supabase.from("leads").delete().eq("id", id);
      if (delErr) {
        setError(delErr as Error);
      }
      await fetchLeads();
    },
    [fetchLeads]
  );

  return { leads, loading, error, updateEtapaKanban, createLead, updateLead, removeLead, importLeadsBatch, importLeadsMapped, refetch: fetchLeads };
}
