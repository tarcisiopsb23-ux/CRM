/**
 * useKnowledgeBase — CRUD de FAQ, políticas e serviços (Banco A) via RPCs SECURITY DEFINER.
 *
 * RPCs (migration 129):
 *   get_knowledge_faqs_for_client(p_client_id)          -> SETOF client_knowledge_faqs
 *   insert_knowledge_faq(p_client_id, p_organization_id, p_question, p_answer, p_keywords, p_category, p_priority, p_active) -> VOID
 *   update_knowledge_faq(p_id, p_question, p_answer, p_keywords, p_category, p_priority, p_active) -> VOID
 *   delete_knowledge_faq(p_id)                           -> VOID
 *
 *   get_knowledge_policies_for_client(p_client_id)       -> SETOF client_knowledge_policies
 *   insert_knowledge_policy(p_client_id, p_organization_id, p_title, p_content, p_policy_type, p_active) -> VOID
 *   update_knowledge_policy(p_id, p_title, p_content, p_policy_type, p_active) -> VOID
 *   delete_knowledge_policy(p_id)                        -> VOID
 *
 *   get_knowledge_services_for_client(p_client_id)       -> SETOF client_knowledge_services
 *   insert_knowledge_service(p_client_id, p_organization_id, p_name, p_description, p_price_info, p_duration_info, p_category, p_keywords, p_active) -> VOID
 *   update_knowledge_service(p_id, p_name, p_description, p_price_info, p_duration_info, p_category, p_keywords, p_active) -> VOID
 *   delete_knowledge_service(p_id)                       -> VOID
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface KnowledgeFaq {
  id: string;
  client_id: string;
  organization_id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFaqInput {
  question: string;
  answer: string;
  keywords?: string[];
  category?: string;
  priority?: number;
  active?: boolean;
}

export interface UpdateFaqInput {
  question: string;
  answer: string;
  keywords?: string[];
  category?: string;
  priority?: number;
  active?: boolean;
}

export interface KnowledgePolicy {
  id: string;
  client_id: string;
  organization_id: string;
  title: string;
  content: string;
  policy_type: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePolicyInput {
  title: string;
  content: string;
  policy_type?: string;
  active?: boolean;
}

export interface UpdatePolicyInput {
  title: string;
  content: string;
  policy_type?: string;
  active?: boolean;
}

export interface KnowledgeService {
  id: string;
  client_id: string;
  organization_id: string;
  name: string;
  description: string;
  price_info: string;
  duration_info: string;
  category: string;
  keywords: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceInput {
  name: string;
  description?: string;
  price_info?: string;
  duration_info?: string;
  category?: string;
  keywords?: string[];
  active?: boolean;
}

export interface UpdateServiceInput {
  name: string;
  description?: string;
  price_info?: string;
  duration_info?: string;
  category?: string;
  keywords?: string[];
  active?: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useKnowledgeBase(clientId: string, organizationId: string) {
  const qc = useQueryClient();

  const faqKey      = ["knowledge_faqs",      clientId] as const;
  const policyKey   = ["knowledge_policies",  clientId] as const;
  const serviceKey  = ["knowledge_services",  clientId] as const;

  // ── Queries ─────────────────────────────────────────────────────────────────

  const faqs = useQuery<KnowledgeFaq[]>({
    queryKey: faqKey,
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.rpc("get_knowledge_faqs_for_client", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as KnowledgeFaq[];
    },
    enabled: !!clientId,
    staleTime: 15_000,
  });

  const policies = useQuery<KnowledgePolicy[]>({
    queryKey: policyKey,
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.rpc("get_knowledge_policies_for_client", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as KnowledgePolicy[];
    },
    enabled: !!clientId,
    staleTime: 15_000,
  });

  const services = useQuery<KnowledgeService[]>({
    queryKey: serviceKey,
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.rpc("get_knowledge_services_for_client", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as KnowledgeService[];
    },
    enabled: !!clientId,
    staleTime: 15_000,
  });

  // ── FAQ mutations ────────────────────────────────────────────────────────────

  const createFaqMutation = useMutation({
    mutationFn: async (v: CreateFaqInput) => {
      const { error } = await supabase.rpc("insert_knowledge_faq", {
        p_client_id:       clientId,
        p_organization_id: organizationId,
        p_question:        v.question,
        p_answer:          v.answer,
        p_keywords:        v.keywords ?? [],
        p_category:        v.category ?? "",
        p_priority:        v.priority ?? 0,
        p_active:          v.active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: faqKey }),
  });

  const updateFaqMutation = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: UpdateFaqInput }) => {
      const { error } = await supabase.rpc("update_knowledge_faq", {
        p_id:       id,
        p_question: v.question,
        p_answer:   v.answer,
        p_keywords: v.keywords ?? [],
        p_category: v.category ?? "",
        p_priority: v.priority ?? 0,
        p_active:   v.active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: faqKey }),
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_knowledge_faq", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: faqKey }),
  });

  // ── Policy mutations ─────────────────────────────────────────────────────────

  const createPolicyMutation = useMutation({
    mutationFn: async (v: CreatePolicyInput) => {
      const { error } = await supabase.rpc("insert_knowledge_policy", {
        p_client_id:       clientId,
        p_organization_id: organizationId,
        p_title:           v.title,
        p_content:         v.content,
        p_policy_type:     v.policy_type ?? "",
        p_active:          v.active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: policyKey }),
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: UpdatePolicyInput }) => {
      const { error } = await supabase.rpc("update_knowledge_policy", {
        p_id:          id,
        p_title:       v.title,
        p_content:     v.content,
        p_policy_type: v.policy_type ?? "",
        p_active:      v.active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: policyKey }),
  });

  const deletePolicyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_knowledge_policy", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: policyKey }),
  });

  // ── Service mutations ────────────────────────────────────────────────────────

  const createServiceMutation = useMutation({
    mutationFn: async (v: CreateServiceInput) => {
      const { error } = await supabase.rpc("insert_knowledge_service", {
        p_client_id:       clientId,
        p_organization_id: organizationId,
        p_name:            v.name,
        p_description:     v.description ?? "",
        p_price_info:      v.price_info ?? "",
        p_duration_info:   v.duration_info ?? "",
        p_category:        v.category ?? "",
        p_keywords:        v.keywords ?? [],
        p_active:          v.active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKey }),
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: UpdateServiceInput }) => {
      const { error } = await supabase.rpc("update_knowledge_service", {
        p_id:           id,
        p_name:         v.name,
        p_description:  v.description ?? "",
        p_price_info:   v.price_info ?? "",
        p_duration_info: v.duration_info ?? "",
        p_category:     v.category ?? "",
        p_keywords:     v.keywords ?? [],
        p_active:       v.active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKey }),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_knowledge_service", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKey }),
  });

  // ── Return ───────────────────────────────────────────────────────────────────

  return {
    // Queries
    faqs,
    policies,
    services,
    isLoading: faqs.isLoading || policies.isLoading || services.isLoading,

    // FAQ
    createFaq:  (v: CreateFaqInput)              => createFaqMutation.mutateAsync(v),
    updateFaq:  (id: string, v: UpdateFaqInput)  => updateFaqMutation.mutateAsync({ id, v }),
    deleteFaq:  (id: string)                     => deleteFaqMutation.mutateAsync(id),

    // Policy
    createPolicy:  (v: CreatePolicyInput)              => createPolicyMutation.mutateAsync(v),
    updatePolicy:  (id: string, v: UpdatePolicyInput)  => updatePolicyMutation.mutateAsync({ id, v }),
    deletePolicy:  (id: string)                        => deletePolicyMutation.mutateAsync(id),

    // Service
    createService:  (v: CreateServiceInput)              => createServiceMutation.mutateAsync(v),
    updateService:  (id: string, v: UpdateServiceInput)  => updateServiceMutation.mutateAsync({ id, v }),
    deleteService:  (id: string)                         => deleteServiceMutation.mutateAsync(id),
  };
}
