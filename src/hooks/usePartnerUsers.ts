/**
 * usePartnerUsers
 *
 * CRUD de parceiros/terceirizados (partner_users) para o Maestr.IA.
 * Inclui:
 *   - Listagem de parceiros da organização
 *   - Criação/convite via Edge Function partner-invite
 *   - Atualização de dados (nome, especialidade, ativo)
 *   - Desativação (soft delete via active=false)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

const INVITE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/partner-invite`;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type PartnerSpecialty =
  | "designer" | "videomaker" | "copywriter"
  | "fotografo" | "social_media" | "outro";

export interface PartnerUser {
  id:              string;
  organization_id: string;
  login_key:       string;
  real_email:      string;
  partner_slug:    string;
  full_name:       string | null;
  specialty:       PartnerSpecialty | null;
  avatar_url:      string | null;
  phone:           string | null;
  active:          boolean;
  last_seen_at:    string | null;
  created_at:      string;
  updated_at:      string;
}

export interface PartnerInviteInput {
  email:       string;
  full_name:   string;
  specialty?:  PartnerSpecialty;
  phone?:      string;
  /** Slug identificador do parceiro — gerado automaticamente se não fornecido */
  partner_slug?: string;
  /** Senha inicial — se não fornecida, o parceiro recebe link de definição */
  password?:   string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePartnerUsers() {
  const qc             = useQueryClient();
  const organizationId = useOrganization();

  const query = useQuery({
    queryKey: ["partner-users", organizationId],
    enabled:  !!organizationId,
    queryFn:  async (): Promise<PartnerUser[]> => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("partner_users")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PartnerUser[];
    },
  });

  // ── Convidar novo parceiro ─────────────────────────────────────────────────
  const invite = useMutation({
    mutationFn: async (input: PartnerInviteInput) => {
      // Usa a sessão atual do Maestr.IA para autorizar a criação
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");

      const res = await fetch(INVITE_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ...input, organization_id: organizationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao convidar parceiro");
      return data as { partner_user_id: string; partner_slug: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-users", organizationId] }),
  });

  // ── Atualizar dados do parceiro ────────────────────────────────────────────
  const update = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<Pick<PartnerUser, "full_name" | "specialty" | "phone" | "active">> & { id: string }) => {
      const { data, error } = await supabase
        .from("partner_users")
        .update(patch)
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .select()
        .single();
      if (error) throw error;
      return data as PartnerUser;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-users", organizationId] }),
  });

  // ── Desativar parceiro ─────────────────────────────────────────────────────
  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("partner_users")
        .update({ active: false })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-users", organizationId] }),
  });

  // ── Reativar parceiro ──────────────────────────────────────────────────────
  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("partner_users")
        .update({ active: true })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-users", organizationId] }),
  });

  return {
    partners:    query.data ?? [],
    loading:     query.isLoading,
    error:       query.error,
    invite:      invite.mutateAsync,
    update:      update.mutateAsync,
    deactivate:  deactivate.mutateAsync,
    reactivate:  reactivate.mutateAsync,
    isInviting:  invite.isPending,
    isUpdating:  update.isPending,
  };
}
