/**
 * useClientBranding — Gerencia os campos de marca do cliente.
 *
 * Lê/escreve em client_ai_settings:
 *   display_name  — nome de exibição público
 *   logo_url      — URL do logotipo
 *   primary_color — cor primária hex
 *   description   — slogan ou descrição curta
 *
 * Fonte única de verdade para /booking/:slug e dashboard público.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";

export interface ClientBranding {
  display_name:  string;
  logo_url:      string;
  primary_color: string;
  description:   string;
}

const DEFAULTS: ClientBranding = {
  display_name:  "",
  logo_url:      "",
  primary_color: "#6366f1",
  description:   "",
};

export function useClientBranding() {
  const { auth } = useClientAuth();
  const dc       = useDynamicClient();   // cliente com JWT do usuário injetado
  const clientId = auth?.id;
  const orgId    = auth?.organization_id;
  const qc       = useQueryClient();
  const qk       = ["client_branding", clientId];

  const query = useQuery<ClientBranding>({
    queryKey: qk,
    queryFn: async () => {
      if (!clientId || !dc) return DEFAULTS;
      const { data, error } = await dc
        .from("client_ai_settings")
        .select("display_name, logo_url, primary_color, description")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return {
        display_name:  data?.display_name  ?? "",
        logo_url:      data?.logo_url      ?? "",
        primary_color: data?.primary_color ?? "#6366f1",
        description:   data?.description   ?? "",
      };
    },
    enabled:   !!clientId && !!dc,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (branding: ClientBranding) => {
      if (!clientId || !dc) throw new Error("Sem client_id ou sessão");

      // Verifica se já existe registro
      const { data: existing } = await dc
        .from("client_ai_settings")
        .select("id")
        .eq("client_id", clientId)
        .maybeSingle();

      const payload = {
        display_name:  branding.display_name.trim()  || null,
        logo_url:      branding.logo_url.trim()      || null,
        primary_color: branding.primary_color.trim() || "#6366f1",
        description:   branding.description.trim()   || null,
      };

      if (existing?.id) {
        const { error } = await dc
          .from("client_ai_settings")
          .update(payload)
          .eq("client_id", clientId);
        if (error) throw error;
      } else {
        const { error } = await dc
          .from("client_ai_settings")
          .insert({ client_id: clientId, organization_id: orgId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  // Upload de logo via Edge Function (usa service_role para bypassar RLS do Storage)
  const uploadLogo = async (file: File): Promise<string> => {
    if (!clientId) throw new Error("Sem client_id");

    // Token da sessão vem do contexto — não precisa de supabase.auth.getSession()
    const accessToken = auth?.session?.access_token;
    if (!accessToken) throw new Error("Sem sessão ativa");

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const form = new FormData();
    form.append("file",      file);
    form.append("client_id", clientId);

    const res = await fetch(`${supabaseUrl}/functions/v1/upload-branding-logo`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body:    form,
    });

    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error ?? "Erro ao fazer upload.");
    return data.url as string;
  };

  return {
    branding:    query.data ?? DEFAULTS,
    isLoading:   query.isLoading,
    save,
    uploadLogo,
  };
}
