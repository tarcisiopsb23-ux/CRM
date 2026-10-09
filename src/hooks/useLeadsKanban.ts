import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import { dispatchWebhook } from "@/lib/webhookDispatcher";
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
  cidade?: string | null;
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
  // flag to suppress realtime re-fetches during bulk imports
  const suppressRealtimeRef = useRef(false);
  // flag: após o primeiro fetch bem-sucedido, refetches subsequentes
  // não devem setar loading=true para evitar desmontar a UI (e fechar modais abertas)
  const hasLoadedOnceRef = useRef(false);

  const fetchLeads = useCallback(async () => {
    if (!organizationId) return;
    // Só mostra loading na tela no primeiro carregamento.
    // Refetches silenciosos (realtime, pós-save) não devem desmontar a UI.
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
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
      // Cast the data to include the joined profile information
      const raw = (data as unknown as (Lead & { profiles: { full_name: string } | null })[]) ?? [];
      
      // Map the data to ensure 'responsavel' is populated for the UI
      const mappedRaw = raw.map(item => ({
        ...item,
        responsavel: item.profiles ? { full_name: item.profiles.full_name } : null
      })) as Lead[];

      if (includeConverted) {
        // Exclui leads ainda na antecâmara do formulário mesmo nos relatórios
        setLeads(mappedRaw.filter((l) => l.stage_id !== "formulario"));
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
        const filtered = mappedRaw.filter((l) => {
          const meta = (l.metadata ?? {}) as Record<string, unknown>;
          return (
            // Exclui leads ainda na antecâmara do formulário (aguardando triagem)
            l.stage_id !== "formulario" &&
            meta.converted_to_client !== true &&
            !linkedLeadIds.has(String(l.id))
          );
        });
        setLeads(filtered);
      }
    }
    hasLoadedOnceRef.current = true;
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
          if (suppressRealtimeRef.current) return;
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
      dispatchWebhook(organizationId!, "lead.stage_changed", { id: leadId, etapa_kanban: etapaKanban });
      await fetchLeads();
    },
    [fetchLeads]
  );

  const createLead = useCallback(
    async (input: CreateLeadInput) => {
      if (!organizationId) throw new Error("Sem organização");
      const etapa = "leads_recebidos" as const;
      // Keep cidade in metadata for backwards compatibility with existing queries
      const metadata = input.cidade ? { cidade: input.cidade } : undefined;
      const { data, error: insertError } = await supabase
        .from("leads")
        .insert({
          organization_id: organizationId,
          name: input.empresa,
          company: input.empresa,
          cidade: input.cidade ?? null,
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
      
      // Auto-link a lista (se houver match por cidade+nicho)
      if (data?.id && input.cidade && input.nicho) {
        try {
          await supabase.rpc('link_lead_to_lista', {
            p_lead_id: data.id,
            p_organization_id: organizationId,
          });
        } catch (err) {
          console.warn('Falha ao auto-vincular lista:', err);
        }
      }
      
      fetchLeads();
      dispatchWebhook(organizationId, "lead.created", data);
      return data as unknown as Lead;
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
        // Keep cidade in metadata for backwards compatibility
        const metadata = input.cidade ? { cidade: input.cidade } : undefined;
        try {
          const { data: insertedLead, error: insertError } = await supabase.from("leads").insert({
            organization_id: organizationId,
            name: input.empresa,
            company: input.empresa,
            cidade: input.cidade ?? null,
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
          }).select().single();
          
          if (insertError) throw insertError;
          
          // Auto-link a lista para cada lead importado
          if (insertedLead?.id && input.cidade && input.nicho) {
            try {
              await supabase.rpc('link_lead_to_lista', {
                p_lead_id: insertedLead.id,
                p_organization_id: organizationId,
              });
            } catch (err) {
              console.warn(`Falha ao auto-vincular lista para lead ${insertedLead.id}:`, err);
            }
          }
          
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
      profileNameToId?: (name: string) => string | null,
      listaId?: string | null
    ): Promise<{ created: number; errors: string[] }> => {
      if (!organizationId) throw new Error("Sem organização");
      const etapa = "leads_recebidos" as const;
      const errors: string[] = [];
      let created = 0;

      const looksLikeUuid = (v: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

      // If a lista was selected, fetch its cidade/nicho once to use as fallback
      // for rows that have no cidade of their own.
      let listaCidade: string | null = null;
      let listaNicho: string | null = null;
      if (listaId) {
        const { data: listaData } = await (supabase as any)
          .from("listas")
          .select("cidade, nicho")
          .eq("id", listaId)
          .single();
        if (listaData) {
          listaCidade = listaData.cidade ?? null;
          listaNicho = listaData.nicho ?? null;
        }
      }

      // Suppress realtime subscription callbacks for the duration of the import
      // to avoid 95+ re-renders (one per insert event)
      suppressRealtimeRef.current = true;

      try {
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
              cidade: r.cidade ?? listaCidade ?? null,
              nicho: r.nicho ?? listaNicho ?? null,
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
              ...(listaId ? { lista_id: listaId } : {}),
              ...(r.metadata ? { metadata: toJson({
                // If the row had no cidade, inherit it from the lista
                ...(listaCidade && !(r.metadata as Record<string,unknown>)?.cidade
                  ? { cidade: listaCidade }
                  : {}),
                ...(r.metadata as Record<string,unknown>),
              }) } : listaCidade ? { metadata: toJson({ cidade: listaCidade }) } : {}),
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
      } finally {
        suppressRealtimeRef.current = false;
      }

      // Single fetch after all inserts are done
      if (created > 0) await fetchLeads();
      return { created, errors };
    },
    [organizationId, fetchLeads]
  );

  const updateLead = useCallback(
    async (id: string, input: Partial<Lead>) => {
      const payload: Record<string, unknown> = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.company !== undefined && { company: input.company }),
        ...(input.cidade !== undefined && { cidade: input.cidade }),
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
