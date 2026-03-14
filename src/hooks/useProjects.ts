/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

type TaskStatus = "backlog" | "em_andamento" | "em_revisao" | "concluida" | "bloqueada";
type TaskPriority = "baixa" | "media" | "alta" | "urgente";

export interface Project {
  id: string;
  organization_id: string;
  client_id: string | null;
  team_id?: string | null;
  assigned_to?: string | null;
  title: string;
  description: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
  progress?: number | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown> | null;
  priority?: Database["public"]["Enums"]["task_priority"] | null;
  responsible_type?: "team" | "profile" | null;
  responsible_id?: string | null;
  color?: string | null;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  metadata?: unknown;
  estimated_hours?: number | null;
  progress?: number | null;
}

export function useProjects(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["projects", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("organization_id", organizationId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<{ name?: string; metadata?: unknown; [k: string]: unknown }>).map((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return {
          ...r,
          title: r.name ?? "",
          priority: (meta.priority as Database["public"]["Enums"]["task_priority"]) ?? null,
          responsible_type: (meta.responsible_type as "team" | "profile") ?? null,
          responsible_id: (meta.responsible_id as string) ?? null,
          color: (meta.color as string) ?? null,
        };
      }) as unknown as Project[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<Project> & { title: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { title, status, priority, responsible_type, responsible_id, color, metadata, ...rest } = input;
      const incomingMeta =
        typeof metadata === "object" && metadata
          ? (metadata as Record<string, unknown>)
          : {};
      const { data, error } = await supabase
        .from("projects")
        .insert({
          ...rest,
          organization_id: organizationId,
          name: title,
          status: (status ?? "em_andamento") as Database["public"]["Enums"]["task_status"],
          metadata: {
            ...incomingMeta,
            ...(priority ? { priority } : {}),
            ...(responsible_type ? { responsible_type } : {}),
            ...(responsible_id ? { responsible_id } : {}),
            ...(color ? { color } : {}),
          },
        })
        .select()
        .single();
      if (error) throw error;
      const meta = ((data as unknown as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
      return {
        ...data,
        title: (data as { name?: string }).name ?? "",
        priority: (meta.priority as Database["public"]["Enums"]["task_priority"]) ?? null,
        responsible_type: (meta.responsible_type as "team" | "profile") ?? null,
        responsible_id: (meta.responsible_id as string) ?? null,
        color: (meta.color as string) ?? null,
      } as unknown as Project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Project> & { id: string }) => {
      // Obter o projeto atual para preservar metadados existentes
      const { data: currentProject } = await supabase.from("projects").select("metadata").eq("id", id).single();
      const currentMeta = (currentProject?.metadata ?? {}) as Record<string, unknown>;

      const { title, status, priority, responsible_type, responsible_id, color, metadata, ...rest } = input;
      const incomingMeta =
        typeof metadata === "object" && metadata
          ? (metadata as Record<string, unknown>)
          : {};
      const payload = {
        ...rest,
        ...(title !== undefined && { name: title }),
        ...(status !== undefined && { status: status as Database["public"]["Enums"]["task_status"] }),
        metadata: {
          ...currentMeta,
          ...incomingMeta,
          ...(priority !== undefined ? { priority } : {}),
          ...(responsible_type !== undefined ? { responsible_type } : {}),
          ...(responsible_id !== undefined ? { responsible_id } : {}),
          ...(color !== undefined ? { color } : {}),
        },
      };
      const { data, error } = await supabase.from("projects").update(payload).eq("id", id).select().single();
      if (error) throw error;
      const meta = ((data as unknown as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
      return {
        ...(data as object),
        title: (data as { name?: string }).name ?? "",
        priority: (meta.priority as Database["public"]["Enums"]["task_priority"]) ?? null,
        responsible_type: (meta.responsible_type as "team" | "profile") ?? null,
        responsible_id: (meta.responsible_id as string) ?? null,
        color: (meta.color as string) ?? null,
      } as unknown as Project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", organizationId] }),
  });

  return { ...query, create, update, remove };
}

export function useTasks(projectId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      // Usar a tabela real 'tasks' criada na migração 002
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("end_date", { ascending: true });
      
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<Task> & { project_id: string; title: string }) => {
      // Garantir que organization_id seja passado
      // Se não vier no input, buscamos do projeto
      let orgId = (input as any).organization_id;
      if (!orgId) {
        const { data: proj } = await supabase.from("projects").select("organization_id").eq("id", input.project_id).single();
        orgId = proj?.organization_id;
      }
      
      const payload = { ...input, organization_id: orgId };
      const { data, error } = await supabase.from("tasks").insert(payload as any).select().single();
      if (error) throw error;
      return data as unknown as Task;
    },
    onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Task> & { id: string }) => {
      const { data, error } = await supabase.from("tasks").update(input as any).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as Task;
    },
    onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  return { ...query, create, update, remove };
}

export interface TaskReportRow {
  status: string | null;
  created_at: string | null;
}

export function useTasksReport(organizationId: string | undefined, fromIso?: string, toIso?: string) {
  return useQuery({
    queryKey: ["tasks", "report", organizationId, fromIso, toIso],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from("tasks")
        .select("status, created_at")
        .eq("organization_id", organizationId);
      if (fromIso) q = q.gte("created_at", fromIso);
      if (toIso) q = q.lte("created_at", toIso);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaskReportRow[];
    },
    enabled: !!organizationId,
  });
}
