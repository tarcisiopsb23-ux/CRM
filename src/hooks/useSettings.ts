import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Json } from "@/types/supabase";
import type { IntegrationType, IntegrationConfig } from "@/types/settings";

interface IntegrationRow {
  id: string;
  organization_id: string;
  integration_type: string;
  config: IntegrationConfig;
  created_at: string;
  updated_at: string;
}

export function useIntegration(
  organizationId: string | undefined,
  integrationType: IntegrationType
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["settings", organizationId, integrationType],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("organization_integrations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("integration_type", integrationType)
        .maybeSingle();
      if (error) throw error;
      return data as IntegrationRow | null;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutos — evita refetch desnecessário ao navegar entre páginas
    gcTime: 10 * 60 * 1000,   // mantém em cache por 10 minutos após desmonte
  });

  const upsert = useMutation({
    mutationFn: async (config: IntegrationConfig) => {
      if (!organizationId) throw new Error("No organization");

      console.log(`[Settings] Salvando configuração '${integrationType}' para a organização: ${organizationId}`);

      const { data, error } = await supabase
        .from("organization_integrations")
        .upsert(
          {
            organization_id: organizationId,
            integration_type: integrationType,
            config: config as Json,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "organization_id,integration_type",
          }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["settings", organizationId, integrationType],
      });
    },
  });

  return { ...query, upsert };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export type DriveFoldersByModule = {
  clients: string | null;
  projects: string | null;
  team: string | null;
  suppliers: string | null;
};

export type DriveApiSettings = {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  googleDeveloperToken: string | null;
};

export function getDriveFoldersFromOrganizationSettings(settings: unknown): DriveFoldersByModule {
  if (!isRecord(settings)) return { clients: null, projects: null, team: null, suppliers: null };
  const drive = isRecord(settings.drive) ? settings.drive : null;
  const folders = drive && isRecord(drive.folders) ? drive.folders : null;
  const clients = folders && typeof folders.clients === "string" ? folders.clients : null;
  const projects = folders && typeof folders.projects === "string" ? folders.projects : null;
  const team = folders && typeof folders.team === "string" ? folders.team : null;
  const suppliers = folders && typeof folders.suppliers === "string" ? folders.suppliers : null;
  return { clients, projects, team, suppliers };
}

export function getDriveApiFromOrganizationSettings(settings: unknown): DriveApiSettings {
  if (!isRecord(settings)) return { clientId: null, clientSecret: null, refreshToken: null, googleDeveloperToken: null };
  const drive = isRecord(settings.drive) ? settings.drive : null;
  const api = drive && isRecord(drive.api) ? drive.api : null;
  const clientId = api && typeof api.clientId === "string" ? api.clientId : null;
  const clientSecret = api && typeof api.clientSecret === "string" ? api.clientSecret : null;
  const refreshToken = api && typeof api.refreshToken === "string" ? api.refreshToken : null;
  const googleDeveloperToken = api && typeof api.googleDeveloperToken === "string" ? api.googleDeveloperToken : null;
  return { clientId, clientSecret, refreshToken, googleDeveloperToken };
}

export function setDriveFoldersInOrganizationSettings(
  settings: unknown,
  next: Partial<DriveFoldersByModule>
): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(settings) ? { ...settings } : {};
  const drive: Record<string, unknown> = isRecord(base.drive) ? { ...(base.drive as Record<string, unknown>) } : {};
  const folders: Record<string, unknown> = isRecord(drive.folders) ? { ...(drive.folders as Record<string, unknown>) } : {};

  if ("clients" in next) folders.clients = next.clients ?? null;
  if ("projects" in next) folders.projects = next.projects ?? null;
  if ("team" in next) folders.team = next.team ?? null;
  if ("suppliers" in next) folders.suppliers = next.suppliers ?? null;

  drive.folders = folders;
  base.drive = drive;
  return base;
}

export function setDriveApiInOrganizationSettings(settings: unknown, next: Partial<DriveApiSettings>): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(settings) ? { ...settings } : {};
  const drive: Record<string, unknown> = isRecord(base.drive) ? { ...(base.drive as Record<string, unknown>) } : {};
  const api: Record<string, unknown> = isRecord(drive.api) ? { ...(drive.api as Record<string, unknown>) } : {};

  if ("clientId" in next) api.clientId = next.clientId ?? null;
  if ("clientSecret" in next) api.clientSecret = next.clientSecret ?? null;
  if ("refreshToken" in next) api.refreshToken = next.refreshToken ?? null;
  if ("googleDeveloperToken" in next) api.googleDeveloperToken = next.googleDeveloperToken ?? null;

  drive.api = api;
  base.drive = drive;
  return base;
}

export function useOrganizationSettings(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["organizations", organizationId, "settings"],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase.from("organizations").select("settings").eq("id", organizationId).single();
      if (error) throw error;
      const row = data as { settings: Json | null };
      return row.settings;
    },
    enabled: !!organizationId,
  });

  const update = useMutation({
    mutationFn: async (settings: Record<string, unknown> | null) => {
      if (!organizationId) throw new Error("Sem organização");
      const payload: Record<string, unknown> = {
        settings: settings ? toJson(settings) : null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("organizations").update(payload).eq("id", organizationId).select("settings").single();
      if (error) throw error;
      return data as { settings: Json | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "settings"] });
    },
  });

  return { ...query, update };
}
