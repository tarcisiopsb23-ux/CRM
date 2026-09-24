import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useRef, useEffect } from "react";
import type { N8nConfig } from "@/types/settings";
import { getDriveFoldersFromOrganizationSettings } from "@/hooks/useSettings";
import { useN8nConfig } from "@/hooks/useN8nConfig";

export type DriveFolderModule = "client" | "supplier" | "project" | "employee";
export type DriveFolderAction = "create" | "rename" | "delete" | "create_subfolder" | "share_access" | "revoke_access";

interface DriveFolderPayload {
  action: DriveFolderAction;
  module: DriveFolderModule;
  record?: { id: string; name?: string; company?: string; title?: string; full_name?: string };
  existing_folder_id?: string;
  new_name?: string;
  subfolder?: string;
  /** Email to share/revoke access */
  email?: string;
  /** Permission role for sharing: reader | commenter | writer */
  role?: "reader" | "commenter" | "writer";
}

const MODULE_WEBHOOK_KEY: Record<DriveFolderModule, keyof N8nConfig> = {
  client:   "driveFolderClientWebhookUrl",
  supplier: "driveFolderSupplierWebhookUrl",
  project:  "driveFolderProjectWebhookUrl",
  employee: "driveFolderEmployeeWebhookUrl",
};

/** Maps module to the drive root folder key in organization settings */
const MODULE_ROOT_FOLDER_KEY: Record<DriveFolderModule, "clients" | "suppliers" | "projects" | "team"> = {
  client:   "clients",
  supplier: "suppliers",
  project:  "projects",
  employee: "team",
};

/** Rewrite webhook URL to use local proxy in development to avoid CORS issues */
function resolveWebhookUrl(url: string): string {
  if (import.meta.env.DEV && url.startsWith("http")) {
    try {
      const parsed = new URL(url);
      return `/n8n-proxy${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }
  return url;
}

export function useDriveFolder(organizationId: string | undefined) {
  const { profile } = useAuth();
  const qc = useQueryClient();

  // Only manager/admin/owner can trigger folder actions
  const canManageFolders = ["owner", "admin", "manager"].includes(profile?.role ?? "");

  // Usa useN8nConfig para leitura imediata do localStorage + sync com banco
  const n8nConfig = useN8nConfig(organizationId);

  // Ref sempre atualizada — garante que autoCreateFolder usa o valor mais recente
  // mesmo quando chamado logo após a criação do registro (antes do próximo render)
  const n8nConfigRef = useRef<N8nConfig | null>(n8nConfig);
  useEffect(() => {
    n8nConfigRef.current = n8nConfig;
  }, [n8nConfig]);

  const { data: orgSettings } = useQuery({
    queryKey: ["organizations", organizationId, "settings"],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", organizationId)
        .single();
      return data?.settings ?? null;
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  /** Returns the root folder ID for a given module from organization settings */
  const getRootFolderId = (module: DriveFolderModule): string | null => {
    const folders = getDriveFoldersFromOrganizationSettings(orgSettings);
    return folders[MODULE_ROOT_FOLDER_KEY[module]] ?? null;
  };

  const triggerFolder = useMutation({
    mutationFn: async (payload: DriveFolderPayload) => {
      if (!canManageFolders) throw new Error("Sem permissão para gerenciar pastas");

      // For manual actions use the manual webhook; for auto-create use module-specific
      let webhookUrl: string | undefined;

      if (payload.action === "create" && payload.record) {
        // Auto-create: use module-specific webhook
        const key = MODULE_WEBHOOK_KEY[payload.module];
        webhookUrl = n8nConfig?.[key] as string | undefined;
      } else {
        // Manual actions (rename, delete, create_subfolder): use dedicated manual webhook
        webhookUrl = n8nConfig?.driveFolderManualWebhookUrl;
      }

      if (!webhookUrl) {
        throw new Error(
          `Webhook de pasta não configurado para o módulo ${payload.module}. Configure em Configurações → n8n.`
        );
      }

      // Always include the root folder ID so n8n doesn't need it hardcoded
      const rootFolderId = getRootFolderId(payload.module);

      const res = await fetch(resolveWebhookUrl(webhookUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, root_folder_id: rootFolderId }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(`Erro ao acionar pasta: ${err}`);
      }

      return res.json().catch(() => ({ success: true }));
    },
  });

  /** Fire-and-forget: auto-create folder when a record is created.
   * After firing, polls the query key until folder_id appears (up to ~15s). */
  const autoCreateFolder = (
    module: DriveFolderModule,
    record: { id: string; name?: string; company?: string; title?: string; full_name?: string; code?: number | null },
    pollQueryKey?: unknown[]
  ) => {
    const key = MODULE_WEBHOOK_KEY[module];
    // Usa a ref para garantir o valor mais recente, mesmo em closures antigas
    const config = n8nConfigRef.current ?? n8nConfig;
    const webhookUrl = config?.[key] as string | undefined;

    console.log(`[autoCreateFolder] module=${module} key=${key} webhookUrl=${webhookUrl ?? "VAZIO"} config_keys=${Object.keys(config ?? {}).join(",")}`);

    if (!webhookUrl) {
      console.warn(`[autoCreateFolder] Webhook não configurado para módulo "${module}" (chave: ${key}). Configure em Configurações → n8n.`);
      return;
    }
    const rootFolderId = getRootFolderId(module);
    console.log(`[autoCreateFolder] Disparando webhook para ${module}: ${webhookUrl}`);

    fetch(resolveWebhookUrl(webhookUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", module, record, root_folder_id: rootFolderId }),
    }).catch(() => {});

    // Poll the query to pick up folder_id saved by n8n: 5s, 10s, 15s
    if (pollQueryKey) {
      [5000, 10000, 15000].forEach((delay) => {
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: pollQueryKey });
        }, delay);
      });
    }
  };

  return { triggerFolder, autoCreateFolder, canManageFolders, n8nConfig };
}
