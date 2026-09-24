import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

// ── Tipos: categorias e alíneas ───────────────────────────────────────────────

export interface ClauseCategory {
  id: string;
  key: string;           // ex: "objeto"
  label: string;         // ex: "Objeto"
  placeholder: string;   // ex: "{{clausula_objeto}}"
  display_order: number;
  description: string | null;
  created_at: string;
}

export interface ContractClause {
  id: string;
  organization_id: string;
  category_key: string;   // FK → contract_clause_categories.key
  service_slug: string | null;  // null = fixa; "agente_ia" = condicional (retrocompat)
  title: string | null;
  html_content: string;
  display_order: number;
  is_fixed: boolean;
  is_active: boolean;
  // Novo sistema de condições (substitui is_fixed + service_slug)
  condition_type: string | null;
  condition_value: Record<string, unknown> | null;
  // Hierarquia (migration 00216)
  parent_id: string | null;          // null = alínea raiz
  depth: number;                     // 0=raiz | 1=sub-alínea | 2=detalhe | 3=tópico
  marker_type: 'number' | 'letter' | 'bullet' | 'none'; // tipo de marcador do nó
  // Inversão de condição (migration 00218)
  condition_negate: boolean;         // false = inclui quando verdadeiro; true = oculta quando verdadeiro
  created_at: string;
  updated_at: string;
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ContractTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  html_content: string;
  letterhead_url: string | null;  // fundo / papel timbrado
  header_url: string | null;
  footer_url: string | null;
  header_height: number;
  footer_height: number;
  margin_top: number;
  margin_bottom: number;
  margin_left: number;
  margin_right: number;
  is_default: boolean;
  is_active: boolean;
  /** Estrutura do template (parties_block, clauses_block, signature_block, header, footer) */
  structure?: {
    header?: string;
    parties_block?: string;
    clauses_block?: string;
    signature_block?: string;
    footer?: string;
  } | null;
  /** Tipo do template: 'contrato' (padrão) ou 'aditivo' */
  template_type: 'contrato' | 'aditivo';
  created_at: string;
  updated_at: string;
}

export interface ServiceBlock {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  description: string | null;
  html_content: string;
  has_setup: boolean;
  setup_amount: number | null;
  has_monthly: boolean;
  monthly_amount: number | null;
  grace_months: number;
  is_one_time: boolean;
  one_time_amount: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Hook: templates de contrato ───────────────────────────────────────────────

export function useContractTemplates() {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const query = useQuery<ContractTemplate[]>({
    queryKey: ["contract_templates", organizationId, "contrato"],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("contract_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .or("template_type.eq.contrato,template_type.is.null")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as ContractTemplate[];
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const saveTemplate = useMutation({
    mutationFn: async (tpl: Partial<ContractTemplate> & { name: string; html_content: string }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      if (tpl.id) {
        const { error } = await supabase
          .from("contract_templates")
          .update({
            name:           tpl.name,
            description:    tpl.description ?? null,
            html_content:   tpl.html_content,
            letterhead_url: tpl.letterhead_url ?? null,
            header_url:     tpl.header_url ?? null,
            footer_url:     tpl.footer_url ?? null,
            header_height:  tpl.header_height ?? 120,
            footer_height:  tpl.footer_height ?? 80,
            margin_top:     tpl.margin_top ?? 30,
            margin_bottom:  tpl.margin_bottom ?? 25,
            margin_left:    tpl.margin_left ?? 25,
            margin_right:   tpl.margin_right ?? 20,
          })
          .eq("id", tpl.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_templates")
          .insert({
            organization_id: organizationId,
            name:           tpl.name,
            description:    tpl.description ?? null,
            html_content:   tpl.html_content,
            letterhead_url: tpl.letterhead_url ?? null,
            header_url:     tpl.header_url ?? null,
            footer_url:     tpl.footer_url ?? null,
            header_height:  tpl.header_height ?? 120,
            footer_height:  tpl.footer_height ?? 80,
            margin_top:     tpl.margin_top ?? 30,
            margin_bottom:  tpl.margin_bottom ?? 25,
            margin_left:    tpl.margin_left ?? 25,
            margin_right:   tpl.margin_right ?? 20,
            is_default:     false,
            template_type:  'contrato',
          });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_templates", organizationId] }),
  });

  const removeTemplate = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contract_templates")
        .update({ is_active: false })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_templates", organizationId] }),
  });

  return { ...query, saveTemplate, removeTemplate };
}

// ── Hook: templates de aditivo ────────────────────────────────────────────────

export function useAmendmentTemplates() {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const query = useQuery<ContractTemplate[]>({
    queryKey: ["contract_templates", organizationId, "aditivo"],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("contract_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("template_type", "aditivo")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as ContractTemplate[];
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const saveTemplate = useMutation({
    mutationFn: async (tpl: Partial<ContractTemplate> & { name: string; html_content: string }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      if (tpl.id) {
        const { error } = await supabase
          .from("contract_templates")
          .update({
            name:           tpl.name,
            description:    tpl.description ?? null,
            html_content:   tpl.html_content,
            letterhead_url: tpl.letterhead_url ?? null,
            header_url:     tpl.header_url ?? null,
            footer_url:     tpl.footer_url ?? null,
            header_height:  tpl.header_height ?? 120,
            footer_height:  tpl.footer_height ?? 80,
            margin_top:     tpl.margin_top ?? 30,
            margin_bottom:  tpl.margin_bottom ?? 25,
            margin_left:    tpl.margin_left ?? 25,
            margin_right:   tpl.margin_right ?? 20,
          })
          .eq("id", tpl.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_templates")
          .insert({
            organization_id: organizationId,
            name:           tpl.name,
            description:    tpl.description ?? null,
            html_content:   tpl.html_content,
            letterhead_url: tpl.letterhead_url ?? null,
            header_url:     tpl.header_url ?? null,
            footer_url:     tpl.footer_url ?? null,
            header_height:  tpl.header_height ?? 120,
            footer_height:  tpl.footer_height ?? 80,
            margin_top:     tpl.margin_top ?? 30,
            margin_bottom:  tpl.margin_bottom ?? 25,
            margin_left:    tpl.margin_left ?? 25,
            margin_right:   tpl.margin_right ?? 20,
            is_default:     false,
            template_type:  'aditivo',
          });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_templates", organizationId] }),
  });

  const removeTemplate = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contract_templates")
        .update({ is_active: false })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_templates", organizationId] }),
  });

  return { ...query, saveTemplate, removeTemplate };
}

// ── Hook: blocos de serviço ───────────────────────────────────────────────────

export function useServiceBlocks() {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const query = useQuery<ServiceBlock[]>({
    queryKey: ["contract_service_blocks", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("contract_service_blocks")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as ServiceBlock[];
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const saveBlock = useMutation({
    mutationFn: async (block: Partial<ServiceBlock> & { slug: string; name: string; html_content: string }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const payload = {
        name:             block.name,
        description:      block.description ?? null,
        html_content:     block.html_content,
        has_setup:        block.has_setup ?? false,
        setup_amount:     block.setup_amount ?? null,
        has_monthly:      block.has_monthly ?? false,
        monthly_amount:   block.monthly_amount ?? null,
        grace_months:     block.grace_months ?? 0,
        is_one_time:      block.is_one_time ?? false,
        one_time_amount:  block.one_time_amount ?? null,
        display_order:    block.display_order ?? 99,
      };
      if (block.id) {
        const { error } = await supabase
          .from("contract_service_blocks")
          .update(payload)
          .eq("id", block.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_service_blocks")
          .insert({ ...payload, organization_id: organizationId, slug: block.slug });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_service_blocks", organizationId] }),
  });

  const removeBlock = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contract_service_blocks")
        .update({ is_active: false })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_service_blocks", organizationId] }),
  });

  return { ...query, saveBlock, removeBlock };
}

// ── Hook: categorias de cláusulas (global) ────────────────────────────────────

export function useClauseCategories() {
  const qc = useQueryClient();

  const query = useQuery<ClauseCategory[]>({
    queryKey: ["contract_clause_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_clause_categories")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as ClauseCategory[];
    },
    staleTime: 5 * 60_000,
  });

  const saveCategory = useMutation({
    mutationFn: async (cat: Partial<ClauseCategory> & { key: string; label: string }) => {
      if (cat.id) {
        // Edição: UPDATE pelo id
        const { error } = await supabase
          .from("contract_clause_categories")
          .update({
            label:         cat.label,
            description:   cat.description ?? null,
            display_order: cat.display_order ?? 99,
            placeholder:   `{{clausula_${cat.key}}}`,
          })
          .eq("id", cat.id);
        if (error) throw error;
      } else {
        // Criação: upsert pelo key (UNIQUE) — evita 409 se já existir
        const { error } = await supabase
          .from("contract_clause_categories")
          .upsert({
            key:           cat.key,
            label:         cat.label,
            description:   cat.description ?? null,
            display_order: cat.display_order ?? 99,
            placeholder:   `{{clausula_${cat.key}}}`,
          }, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_clause_categories"] }),
  });

  const reorderCategory = useMutation({
    mutationFn: async ({ id, display_order }: { id: string; display_order: number }) => {
      const { error } = await supabase
        .from("contract_clause_categories")
        .update({ display_order })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_clause_categories"] }),
  });

  const removeCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contract_clause_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_clause_categories"] }),
  });

  return { ...query, saveCategory, reorderCategory, removeCategory };
}

// ── Hook: alíneas de cláusulas (por organização) ──────────────────────────────

export function useClauses() {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const query = useQuery<ContractClause[]>({
    queryKey: ["contract_clauses", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("contract_clauses")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("category_key")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as ContractClause[];
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const saveClause = useMutation({
    mutationFn: async (clause: Partial<ContractClause> & { category_key: string; html_content: string; is_fixed: boolean }) => {
      if (!organizationId) throw new Error("Organização não identificada.");

      // condition_type determina is_fixed e service_slug
      const condType = clause.condition_type ?? (clause.is_fixed ? "always" : null);
      const isFixed  = condType === "always";
      const svcSlug  = condType === "service"
        ? ((clause.condition_value as { slugs?: string[] } | null)?.slugs?.[0] ?? clause.service_slug ?? null)
        : null;

      // Para novas alíneas sem display_order definido, calcular o próximo índice
      // dentro do mesmo (category_key, parent_id) para evitar colisões entre categorias.
      let nextDisplayOrder = clause.display_order;
      if (!clause.id && nextDisplayOrder == null) {
        const { count } = await supabase
          .from("contract_clauses")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("category_key", clause.category_key)
          .is("parent_id", clause.parent_id ?? null);
        nextDisplayOrder = count ?? 0;
      }

      const payload = {
        category_key:    clause.category_key,
        service_slug:    svcSlug,
        title:           clause.title ?? null,
        html_content:    clause.html_content,
        display_order:   nextDisplayOrder ?? 0,
        is_fixed:        isFixed,
        condition_type:  condType ?? null,
        condition_value: condType && condType !== "always" ? (clause.condition_value ?? null) : null,
        // Hierarquia
        parent_id:       clause.parent_id   ?? null,
        depth:           clause.depth       ?? 0,
        marker_type:     clause.marker_type ?? "number",
        // Inversão de condição
        condition_negate: clause.condition_negate ?? false,
      };
      if (clause.id) {
        const { error } = await supabase
          .from("contract_clauses")
          .update(payload)
          .eq("id", clause.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_clauses")
          .insert({ ...payload, organization_id: organizationId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_clauses", organizationId] }),
  });

  const removeClause = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contract_clauses")
        .update({ is_active: false })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_clauses", organizationId] }),
  });

  const reorderClause = useMutation({
    mutationFn: async ({ id, display_order }: { id: string; display_order: number }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contract_clauses")
        .update({ display_order })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_clauses", organizationId] }),
  });

  return { ...query, saveClause, removeClause, reorderClause };
}

// ── Tipo: bloco de assinatura configurável ────────────────────────────────────

export interface SignatureBlock {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  html_content: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Hook: blocos de assinatura ────────────────────────────────────────────────

export function useSignatureBlocks() {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const query = useQuery<SignatureBlock[]>({
    queryKey: ["contract_signature_blocks", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("contract_signature_blocks")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as SignatureBlock[];
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const saveSignatureBlock = useMutation({
    mutationFn: async (block: Partial<SignatureBlock> & { name: string; slug: string; html_content: string }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const payload = {
        name:          block.name,
        slug:          block.slug,
        html_content:  block.html_content,
        display_order: block.display_order ?? 0,
      };
      if (block.id) {
        const { error } = await supabase
          .from("contract_signature_blocks")
          .update(payload)
          .eq("id", block.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_signature_blocks")
          .insert({ ...payload, organization_id: organizationId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_signature_blocks", organizationId] }),
  });

  const removeSignatureBlock = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contract_signature_blocks")
        .update({ is_active: false })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract_signature_blocks", organizationId] }),
  });

  return { ...query, saveSignatureBlock, removeSignatureBlock };
}
