// src/hooks/useServiceCatalog.ts
// Requirements: 1.2, 1.6, 1.7, 1.8, 10.2

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceCatalogItem, ServiceDeliverable } from "@/types/contracts";

const sb = () => supabase as unknown as SupabaseClient;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateServiceInput {
  name: string;
  category: string;
  modality?: 'Consultiva' | 'Executiva' | 'Híbrida (consultiva e executiva)' | null;
  description_text?: string | null;
  scope?: string | null;
  deliverables?: ServiceDeliverable[];
}

export interface UpdateServiceInput {
  id: string;
  name?: string;
  category?: string;
  modality?: 'Consultiva' | 'Executiva' | 'Híbrida (consultiva e executiva)' | null;
  description_text?: string | null;
  scope?: string | null;
  deliverables?: ServiceDeliverable[];
}

/** Gera slug a partir do nome: lowercase, sem acentos, underscores */
function generateSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove diacríticos (acentos)
    .toLowerCase()                     // converte APÓS normalização
    .replace(/[^a-z0-9]+/g, "_")      // substitui não-alfanuméricos por _
    .replace(/^_|_$/g, "");           // remove _ inicial/final
}

/**
 * Result returned by deleteService when there are active contracts referencing
 * the service. The caller should display a blocking dialog with these titles.
 */
export interface DeleteServiceBlocked {
  blocked: true;
  affectedContracts: string[];
}

export interface DeleteServiceSuccess {
  blocked: false;
}

export type DeleteServiceResult = DeleteServiceBlocked | DeleteServiceSuccess;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useServiceCatalog
 *
 * Provides CRUD + reorder operations for the `service_catalog` table, scoped
 * to a single organization. Services are returned both as a flat list and
 * grouped by category.
 *
 * Requirements: 1.2, 1.6, 1.7, 1.8, 10.2
 */
export function useServiceCatalog(organizationId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["service_catalog", organizationId];

  // ── Query ──────────────────────────────────────────────────────────────────

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ServiceCatalogItem[]> => {
      if (!organizationId) return [];
      const { data, error } = await sb()
        .from("service_catalog")
        .select("*")
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        organization_id: String(r.organization_id),
        name: String(r.name ?? ""),
        slug: String(r.slug ?? ""),
        category: String(r.category ?? ""),
        modality: (r.modality as 'Consultiva' | 'Executiva' | 'Híbrida (consultiva e executiva)' | null) ?? null,
        description_text: (r.description_text as string | null) ?? null,
        scope: (r.scope as string | null) ?? null,
        deliverables: (r.deliverables as ServiceDeliverable[]) ?? [],
        sub_services: [],
        display_order: Number(r.display_order ?? 0),
        created_at: String(r.created_at ?? ""),
        updated_at: String(r.updated_at ?? ""),
      })) as ServiceCatalogItem[];
    },
    enabled: !!organizationId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  // ── Derived: grouped by category ──────────────────────────────────────────

  const services = query.data ?? [];

  const servicesByCategory = services.reduce<Record<string, ServiceCatalogItem[]>>(
    (acc, svc) => {
      const key = svc.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(svc);
      return acc;
    },
    {}
  );

  // ── createService ──────────────────────────────────────────────────────────

  const createService = useMutation({
    mutationFn: async (input: CreateServiceInput): Promise<ServiceCatalogItem> => {
      if (!organizationId) throw new Error("Sem organização");

      // Determine next display_order (max + 1)
      const existing = query.data ?? [];
      const maxOrder = existing.reduce((m, s) => Math.max(m, s.display_order), -1);

      const payload = {
        organization_id: organizationId,
        name: input.name,
        slug: generateSlug(input.name),
        category: input.category,
        modality: input.modality ?? null,
        description_text: input.description_text ?? null,
        scope: input.scope ?? null,
        deliverables: input.deliverables ?? [],
        display_order: maxOrder + 1,
      };

      const { data, error } = await sb()
        .from("service_catalog")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        // Unique constraint violation on (organization_id, name)
        if (
          error.code === "23505" ||
          (error.message ?? "").toLowerCase().includes("unique")
        ) {
          toast.error("Já existe um serviço com esse nome nesta organização.");
        }
        throw error;
      }

      return data as unknown as ServiceCatalogItem;
    },
    onSuccess: invalidate,
  });

  // ── updateService ──────────────────────────────────────────────────────────

  const updateService = useMutation({
    mutationFn: async (input: UpdateServiceInput): Promise<ServiceCatalogItem> => {
      const { id, ...rest } = input;

      const payload: Record<string, unknown> = {};
      if (rest.name !== undefined) { payload.name = rest.name; payload.slug = generateSlug(rest.name); }
      if (rest.category !== undefined) payload.category = rest.category;
      if (rest.modality !== undefined) payload.modality = rest.modality;
      if (rest.description_text !== undefined) payload.description_text = rest.description_text;
      if (rest.scope !== undefined) payload.scope = rest.scope;
      if (rest.deliverables !== undefined) payload.deliverables = rest.deliverables;

      const { data, error } = await sb()
        .from("service_catalog")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return data as unknown as ServiceCatalogItem;
    },
    onSuccess: invalidate,
  });

  // ── deleteService ──────────────────────────────────────────────────────────
  //
  // Before deleting, check contracts where:
  //   - status = 'ativo'
  //   - metadata->>'services' contains the service_id (JSONB array of objects)
  //
  // If any exist, return the list of affected contract titles instead of
  // deleting (the UI should show a blocking dialog).

  const deleteService = useMutation({
    mutationFn: async (serviceId: string): Promise<DeleteServiceResult> => {
      // Query active contracts that reference this service via metadata JSONB.
      // We use a text-search approach: cast metadata to text and look for the id.
      // This is a pragmatic approach since Supabase JS client doesn't expose
      // `@>` operators easily for nested JSONB arrays. The RLS policy ensures
      // we only see our organization's contracts.
      const { data: contractData, error: contractError } = await sb()
        .from("contracts")
        .select("id, title, metadata")
        .eq("status", "ativo");

      if (contractError) throw contractError;

      const affectedContracts: string[] = [];
      const rows = (contractData ?? []) as unknown as Array<{
        id: string;
        title: string;
        metadata: Record<string, unknown> | null;
      }>;

      for (const row of rows) {
        const meta = row.metadata;
        if (!meta) continue;
        const servicesArr = meta.services;
        if (!Array.isArray(servicesArr)) continue;
        const references = servicesArr.some(
          (s: unknown) =>
            s !== null &&
            typeof s === "object" &&
            (s as Record<string, unknown>).service_id === serviceId
        );
        if (references) {
          affectedContracts.push(row.title ?? row.id);
        }
      }

      if (affectedContracts.length > 0) {
        return { blocked: true, affectedContracts };
      }

      // Safe to delete
      const { error: deleteError } = await sb()
        .from("service_catalog")
        .delete()
        .eq("id", serviceId);

      if (deleteError) throw deleteError;

      return { blocked: false };
    },
    onSuccess: (result) => {
      // Only invalidate if the delete actually happened
      if (!result.blocked) {
        invalidate();
      }
    },
  });

  // ── reorderServices ────────────────────────────────────────────────────────
  //
  // Receives an ordered array of service IDs; each ID's new display_order
  // is its index in the array. Uses Promise.all with individual updates.

  const reorderServices = useMutation({
    mutationFn: async (serviceIds: string[]): Promise<void> => {
      await Promise.all(
        serviceIds.map((id, index) =>
          sb()
            .from("service_catalog")
            .update({ display_order: index })
            .eq("id", id)
        )
      );
    },
    onSuccess: invalidate,
  });

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    services,
    servicesByCategory,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    createService,
    updateService,
    deleteService,
    reorderServices,
  };
}
