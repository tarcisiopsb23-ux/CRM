/**
 * usePartnerUsers
 *
 * CRUD de parceiros/terceirizados (partner_users) para o Maestr.IA.
 *
 * Dois tipos de parceiro:
 *   'agency' → vinculado a um fornecedor existente (supplier_id), pode ser
 *              atribuído a qualquer cliente da organização.
 *   'client' → vinculado a um cliente específico (client_id), cadastrado
 *              diretamente pelo cliente sem vínculo financeiro com a agência.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

const INVITE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/partner-invite`;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type PartnerSpecialty =
  | "designer" | "videomaker" | "copywriter"
  | "fotografo" | "social_media" | "outro";

export type PartnerType = "agency" | "client";

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
  partner_type:    PartnerType;
  supplier_id:     string | null;   // type = agency
  client_id:       string | null;   // type = client
  last_seen_at:    string | null;
  created_at:      string;
  updated_at:      string;
  // joins opcionais
  supplier_name?:  string | null;
  client_name?:    string | null;
}

export interface PartnerInviteInput {
  email:           string;
  full_name:       string;
  partner_type:    PartnerType;
  supplier_id?:    string;   // obrigatório se agency
  client_id?:      string;   // obrigatório se client
  specialty?:      PartnerSpecialty;
  phone?:          string;
  partner_slug?:   string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePartnerUsers(filterClientId?: string) {
  const qc             = useQueryClient();
  const organizationId = useOrganization();

  // ── Listagem ───────────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey: ["partner-users", organizationId, filterClientId],
    enabled:  !!organizationId,
    queryFn:  async (): Promise<PartnerUser[]> => {
      if (!organizationId) return [];

      let q = supabase
        .from("partner_users")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      // Filtro opcional por cliente (para listar parceiros de um cliente específico)
      if (filterClientId) {
        q = q.or(`partner_type.eq.agency,client_id.eq.${filterClientId}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PartnerUser[];
    },
  });

  // ── Convidar novo parceiro ─────────────────────────────────────────────────
  const invite = useMutation({
    mutationFn: async (input: PartnerInviteInput) => {
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
      return data as {
        success:         boolean;
        partner_user_id: string;
        partner_slug:    string;
        login_key:       string;
        email_sent:      boolean;
        partner_type:    PartnerType;
        temp_password?:  string;
        message:         string;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users", organizationId] });
    },
  });

  // ── Reenviar convite ───────────────────────────────────────────────────────
  const resendInvite = useMutation({
    mutationFn: async (partnerId: string) => {
      const partner = query.data?.find(p => p.id === partnerId);
      if (!partner) throw new Error("Parceiro não encontrado");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");

      // Cria novo token de convite
      const { data: tokenData, error: tokenErr } = await supabase
        .from("partner_invite_tokens")
        .insert({ partner_id: partnerId })
        .select("token")
        .single();
      if (tokenErr) throw tokenErr;

      return { token: tokenData.token, partner };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users", organizationId] });
    },
  });

  // ── Atualizar dados ────────────────────────────────────────────────────────
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users", organizationId] });
    },
  });

  // ── Desativar ──────────────────────────────────────────────────────────────
  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("partner_users")
        .update({ active: false })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users", organizationId] });
    },
  });

  // ── Reativar ───────────────────────────────────────────────────────────────
  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("partner_users")
        .update({ active: true })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-users", organizationId] });
    },
  });

  return {
    partners:     query.data ?? [],
    agencyPartners: (query.data ?? []).filter(p => p.partner_type === "agency"),
    clientPartners: (query.data ?? []).filter(p => p.partner_type === "client"),
    loading:      query.isLoading,
    error:        query.error,
    invite:       invite.mutateAsync,
    resendInvite: resendInvite.mutateAsync,
    update:       update.mutateAsync,
    deactivate:   deactivate.mutateAsync,
    reactivate:   reactivate.mutateAsync,
    isInviting:   invite.isPending,
  };
}
