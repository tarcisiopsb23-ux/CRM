// src/hooks/useProposalTemplate.ts
// CRUD do template padrão de propostas por organização.
// A tabela proposal_templates tem UNIQUE (organization_id), então usamos
// upsert para criar ou atualizar com uma única operação.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { SectionKey } from "@/types/proposals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalTemplateHero {
  hero_logo_url: string | null;
  hero_image_url: string | null;
  hero_title: string;
  hero_subtitle: string | null;
  hero_message: string | null;
  hero_video_url: string | null;
  hero_whatsapp_text: string;
  hero_whatsapp_number: string | null;
  hero_cta_text: string;
  hero_cta_color: string;
}

export interface ProposalTemplateSectionEntry {
  content: string;
  is_visible: boolean;
}

export interface ProposalTemplateSchedule {
  default_recurrence: "mensal" | "trimestral" | "semestral" | "anual";
  default_installments: number;
  default_due_day: number;
}

export interface ProposalTemplate extends ProposalTemplateHero, ProposalTemplateSchedule {
  id: string;
  organization_id: string;
  default_sections: Partial<Record<SectionKey, ProposalTemplateSectionEntry>>;
  created_at: string;
  updated_at: string;
}

export type ProposalTemplateInput = ProposalTemplateHero &
  ProposalTemplateSchedule & {
    default_sections: Partial<Record<SectionKey, ProposalTemplateSectionEntry>>;
  };

export const DEFAULT_PROPOSAL_TEMPLATE: ProposalTemplateInput = {
  hero_logo_url: null,
  hero_image_url: null,
  hero_title: "",
  hero_subtitle: null,
  hero_message: null,
  hero_video_url: null,
  hero_whatsapp_text: "Falar no WhatsApp",
  hero_whatsapp_number: null,
  hero_cta_text: "Aprovar Proposta",
  hero_cta_color: "#16a34a",
  default_sections: {},
  default_recurrence: "mensal",
  default_installments: 12,
  default_due_day: 10,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProposalTemplate(organizationId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["proposal_template", organizationId];
  const sb = supabase as any;

  // ── Query ──────────────────────────────────────────────────────────────────

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ProposalTemplate | null> => {
      if (!organizationId) return null;
      const { data, error } = await sb
        .from("proposal_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return (data as ProposalTemplate | null) ?? null;
    },
    enabled: !!organizationId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  // ── Save (upsert) ──────────────────────────────────────────────────────────
  // Cria se não existir, atualiza se já existir.

  const save = useMutation({
    mutationFn: async (input: ProposalTemplateInput): Promise<ProposalTemplate> => {
      if (!organizationId) throw new Error("Sem organização");

      const payload = {
        organization_id: organizationId,
        ...input,
      };

      const { data, error } = await sb
        .from("proposal_templates")
        .upsert(payload, { onConflict: "organization_id" })
        .select("*")
        .single();

      if (error) throw error;
      return data as ProposalTemplate;
    },
    onSuccess: () => {
      toast.success("Template padrão salvo.");
      invalidate();
    },
    onError: () => {
      toast.error("Erro ao salvar template padrão.");
    },
  });

  // ── Derived helpers ────────────────────────────────────────────────────────

  /** Retorna o template atual ou os defaults caso ainda não tenha sido criado. */
  const templateOrDefault: ProposalTemplateInput = query.data
    ? {
        hero_logo_url: query.data.hero_logo_url,
        hero_image_url: query.data.hero_image_url,
        hero_title: query.data.hero_title,
        hero_subtitle: query.data.hero_subtitle,
        hero_message: query.data.hero_message,
        hero_video_url: query.data.hero_video_url,
        hero_whatsapp_text: query.data.hero_whatsapp_text,
        hero_whatsapp_number: query.data.hero_whatsapp_number,
        hero_cta_text: query.data.hero_cta_text,
        hero_cta_color: query.data.hero_cta_color,
        default_sections: query.data.default_sections ?? {},
        default_recurrence: query.data.default_recurrence,
        default_installments: query.data.default_installments,
        default_due_day: query.data.default_due_day,
      }
    : DEFAULT_PROPOSAL_TEMPLATE;

  return {
    template: query.data ?? null,
    templateOrDefault,
    isLoading: query.isLoading,
    isError: query.isError,
    save,
  };
}
