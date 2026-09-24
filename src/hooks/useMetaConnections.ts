/**
 * useMetaConnections
 *
 * Hook React Query para gerenciar conexões Meta (meta_connections_safe view).
 * Nunca expõe o access_token — usa a view segura que omite esse campo.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type MetaProvider = "facebook" | "instagram" | "whatsapp" | "meta_multi";
export type ConnectionMethod = "oauth" | "manual" | "embedded_signup";
export type ConnectionStatus =
  | "active"
  | "inactive"
  | "expired"
  | "error"
  | "revoked"
  | "needs_reauthentication"
  | "disconnected";
export type HealthStatus = "healthy" | "warning" | "failed" | "unknown";
export type ConnectionEnvironment = "production" | "development" | "review";

export interface MetaConnectionSafe {
  id: string;
  organization_id: string;
  created_by: string | null;
  provider: MetaProvider;
  connection_method: ConnectionMethod;
  connection_environment: ConnectionEnvironment;
  status: ConnectionStatus;
  display_name: string | null;
  meta_user_id: string | null;
  business_id: string | null;
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  instagram_account_id: string | null;
  instagram_username: string | null;
  waba_id: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_display_phone_number: string | null;
  ad_account_id: string | null;
  catalog_id: string | null;
  token_is_set: boolean;
  token_preview: string | null;
  token_type: string | null;
  token_expires_at: string | null;
  token_last_validated_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  health_status: HealthStatus;
  health_details: Record<string, unknown>;
  last_health_check_at: string | null;
  previous_connection_method: string | null;
  migration_at: string | null;
  migration_by: string | null;
  oauth_token_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaFeatureFlags {
  oauth_enabled: boolean;
  manual_enabled: boolean;
  manual_visible_to_members: boolean;
  embedded_signup_enabled: boolean;
  allow_development_env: boolean;
  allow_review_env: boolean;
}

// ── Validação (tipo de retorno da Edge Function meta-manual-validate) ──────────

export interface ValidationResult {
  token: {
    valid: boolean;
    user_id?: string;
    app_id?: string;
    expires_at?: string;
    permissions?: string[];
  };
  facebook_page?: {
    id: string;
    name?: string;
    category?: string;
    verified?: boolean;
    accessible: boolean;
    error?: string;
  };
  instagram?: {
    id: string;
    username?: string;
    name?: string;
    account_type?: string;
    accessible: boolean;
    error?: string;
  };
  whatsapp_waba?: { id: string; name?: string; accessible: boolean; error?: string };
  whatsapp_phone?: {
    id: string;
    display_number?: string;
    verified_name?: string;
    quality_rating?: string;
    accessible: boolean;
    error?: string;
  };
  business?: { id: string; name?: string; accessible: boolean; error?: string };
  ad_account?: { id: string; name?: string; status?: number; accessible: boolean; error?: string };
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

async function callEdgeFunction<T>(
  fnName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Não autenticado");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey":        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.message ?? json.error ?? "Erro desconhecido") as string;
    throw new Error(msg);
  }
  return json as T;
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useMetaConnections(externalOrganizationId?: string) {
  const hookOrganizationId = useOrganization();
  const organizationId = externalOrganizationId ?? hookOrganizationId;
  const qc = useQueryClient();

  // ── Lista de conexões (view segura) ──────────────────────────────────────
  const query = useQuery<MetaConnectionSafe[]>({
    queryKey: ["meta_connections", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("meta_connections_safe")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MetaConnectionSafe[];
    },
    enabled: !!organizationId,
  });

  // ── Feature flags ─────────────────────────────────────────────────────────
  const flagsQuery = useQuery<MetaFeatureFlags>({
    queryKey: ["meta_feature_flags", organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return {
          oauth_enabled: true,
          manual_enabled: true,
          manual_visible_to_members: false,
          embedded_signup_enabled: false,
          allow_development_env: true,
          allow_review_env: true,
        };
      }
      const { data, error } = await supabase
        .rpc("get_meta_feature_flags", { p_organization_id: organizationId });
      if (error) throw error;
      return (data?.[0] ?? {
        oauth_enabled: true,
        manual_enabled: true,
        manual_visible_to_members: false,
        embedded_signup_enabled: false,
        allow_development_env: true,
        allow_review_env: true,
      }) as MetaFeatureFlags;
    },
    enabled: !!organizationId,
  });

  // ── Validar token + ativos (não persiste) ─────────────────────────────────
  const validate = useMutation<
    ValidationResult,
    Error,
    {
      access_token: string;
      provider: MetaProvider;
      facebook_page_id?: string;
      instagram_account_id?: string;
      waba_id?: string;
      phone_number_id?: string;
      business_id?: string;
      ad_account_id?: string;
    }
  >({
    mutationFn: async (params) => {
      if (!organizationId) throw new Error("organization_id não disponível");
      return callEdgeFunction<ValidationResult>("meta-manual-validate", {
        organization_id: organizationId,
        ...params,
      });
    },
  });

  // ── Criar conexão manual ──────────────────────────────────────────────────
  const create = useMutation<
    { success: boolean; connection_id: string },
    Error,
    {
      provider: MetaProvider;
      connection_environment?: ConnectionEnvironment;
      display_name?: string;
      access_token: string;
      meta_user_id?: string;
      business_id?: string;
      facebook_page_id?: string;
      facebook_page_name?: string;
      instagram_account_id?: string;
      instagram_username?: string;
      waba_id?: string;
      whatsapp_phone_number_id?: string;
      whatsapp_display_phone_number?: string;
      ad_account_id?: string;
      catalog_id?: string;
      token_type?: string;
      token_expires_at?: string;
      force_update_existing_id?: string;
    }
  >({
    mutationFn: async (params) => {
      if (!organizationId) throw new Error("organization_id não disponível");
      return callEdgeFunction("meta-manual-connect", {
        action: "create",
        organization_id: organizationId,
        ...params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta_connections", organizationId] });
    },
  });

  // ── Substituir token ──────────────────────────────────────────────────────
  const replaceToken = useMutation<
    { success: boolean; connection_id: string },
    Error,
    { connection_id: string; access_token: string; token_expires_at?: string }
  >({
    mutationFn: async (params) => {
      if (!organizationId) throw new Error("organization_id não disponível");
      return callEdgeFunction("meta-manual-connect", {
        action: "replace_token",
        organization_id: organizationId,
        ...params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta_connections", organizationId] });
    },
  });

  // ── Desconectar ───────────────────────────────────────────────────────────
  const disconnect = useMutation<
    { success: boolean },
    Error,
    { connection_id: string; mode: "deactivate" | "remove_credentials" }
  >({
    mutationFn: async (params) => {
      if (!organizationId) throw new Error("organization_id não disponível");
      return callEdgeFunction("meta-manual-connect", {
        action: "disconnect",
        organization_id: organizationId,
        ...params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta_connections", organizationId] });
    },
  });

  // ── Migrar manual → OAuth ─────────────────────────────────────────────────
  const migrateToOAuth = useMutation<
    { success: boolean },
    Error,
    { connection_id: string; oauth_token_id: string }
  >({
    mutationFn: async (params) => {
      if (!organizationId) throw new Error("organization_id não disponível");
      return callEdgeFunction("meta-manual-connect", {
        action: "migrate_to_oauth",
        organization_id: organizationId,
        ...params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta_connections", organizationId] });
    },
  });

  // ── Checar duplicidade ────────────────────────────────────────────────────
  const checkDuplicate = async (params: {
    facebook_page_id?: string;
    instagram_account_id?: string;
    whatsapp_phone_number_id?: string;
    waba_id?: string;
  }) => {
    if (!organizationId) return [];
    const { data } = await supabase.rpc("check_meta_asset_duplicate", {
      p_organization_id:          organizationId,
      p_facebook_page_id:         params.facebook_page_id         ?? null,
      p_instagram_account_id:     params.instagram_account_id     ?? null,
      p_whatsapp_phone_number_id: params.whatsapp_phone_number_id ?? null,
      p_waba_id:                  params.waba_id                  ?? null,
    });
    return (data ?? []) as Array<{
      connection_id: string;
      display_name: string | null;
      provider: string;
      connection_method: string;
      status: string;
      created_at: string;
    }>;
  };

  return {
    connections:     query.data ?? [],
    isLoading:       query.isLoading,
    error:           query.error,
    flags:           flagsQuery.data,
    flagsLoading:    flagsQuery.isLoading,
    validate,
    create,
    replaceToken,
    disconnect,
    migrateToOAuth,
    checkDuplicate,
    refetch:         query.refetch,
  };
}
