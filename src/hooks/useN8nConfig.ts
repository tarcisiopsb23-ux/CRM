/**
 * useN8nConfig
 *
 * Hook que retorna o N8nConfig de forma confiável:
 * 1. Lê imediatamente do localStorage (sem esperar fetch)
 * 2. Sincroniza com o banco em background via React Query
 * 3. Nunca retorna undefined se o localStorage tiver dados
 *
 * Isso evita o problema de campos vazios / "webhook não configurado"
 * que ocorria quando o React Query ainda não havia completado o fetch.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { N8nConfig } from "@/types/settings";

const CACHE_PREFIX = "n8n_cfg_";

function localKey(orgId: string) {
  return `${CACHE_PREFIX}${orgId}`;
}

function readLocal(orgId: string): N8nConfig | null {
  try {
    const raw = localStorage.getItem(localKey(orgId));
    if (!raw) return null;
    return JSON.parse(raw) as N8nConfig;
  } catch {
    return null;
  }
}

function writeLocal(orgId: string, config: N8nConfig) {
  try {
    localStorage.setItem(localKey(orgId), JSON.stringify(config));
  } catch { /* ignore */ }
}

export function useN8nConfig(organizationId: string | undefined): N8nConfig | null {
  // Inicializa imediatamente do localStorage — sem esperar fetch
  const [config, setConfig] = useState<N8nConfig | null>(() =>
    organizationId ? readLocal(organizationId) : null
  );

  // Quando orgId muda, recarrega do localStorage da nova org
  useEffect(() => {
    if (!organizationId) return;
    setConfig(readLocal(organizationId));
  }, [organizationId]);

  // Busca do banco em background — atualiza o estado e o localStorage
  const { data } = useQuery({
    queryKey: ["settings", organizationId, "n8n"],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("organization_integrations")
        .select("config")
        .eq("organization_id", organizationId)
        .eq("integration_type", "n8n")
        .maybeSingle();
      if (error) throw error;
      return (data?.config ?? null) as N8nConfig | null;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Quando os dados do banco chegam, atualiza o estado e o localStorage
  useEffect(() => {
    if (!organizationId || !data) return;
    writeLocal(organizationId, data);
    setConfig(data);
  }, [data, organizationId]);

  return config;
}
