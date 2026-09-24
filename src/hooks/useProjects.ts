/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fireN8nWebhook } from "@/lib/n8nWebhook";
import type { Database } from "@/types/supabase";

type TaskStatus = "backlog" | "em_andamento" | "em_revisao" | "concluida" | "parada" | "bloqueada";
type TaskPriority = "baixa" | "media" | "alta" | "urgente";

export interface Project {
  id: string;
  organization_id: string;
  code?: number | null;
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
  is_freelancer?: boolean;
  supplier_id?: string | null;
  clickup_task_id?: string | null;
  clickup_list_id?: string | null;
  clickup_synced_at?: string | null;
  folder_id?: string | null;
  folder_url?: string | null;
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
  is_freelancer?: boolean;
  supplier_id?: string | null;
  clickup_task_id?: string | null;
  clickup_list_id?: string | null;
  clickup_synced_at?: string | null;
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
        .order("code", { ascending: true, nullsFirst: false });
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
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects", organizationId] });
      if (organizationId) {
        void fireN8nWebhook(organizationId, "projects", "create", project as unknown as Record<string, unknown>);
      }
      // Nota: o disparo para o ClickUp na criação é feito pelo ProjectsPage via autoCreateFolder
      // e pelo ProjectDetailsPage quando is_freelancer é marcado.
    },
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
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects", organizationId] });
      if (organizationId) {
        void fireN8nWebhook(organizationId, "projects", "update", project as unknown as Record<string, unknown>);
      }
      // Nota: o disparo para o ClickUp é feito pelo handleSaveDetails no ProjectDetailsPage
      // apenas quando is_freelancer muda de false → true, para evitar disparos duplicados.
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Busca o projeto antes de deletar para ter os dados para o webhook
      const { data: project } = await supabase.from("projects").select("*").eq("id", id).single();
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
      return project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects", organizationId] });
      if (organizationId && project) {
        void fireN8nWebhook(organizationId, "projects", "delete", project as unknown as Record<string, unknown>);
      }
      // Fire ClickUp webhook for freelancer projects on delete
      if ((project as any)?.is_freelancer) {
        const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_CLICKUP;
        if (webhookUrl) {
          fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", table: "projects", item: project }),
          }).catch(() => {});
        }
      }
    },
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
      let orgId = (input as any).organization_id;
      if (!orgId) {
        const { data: proj } = await supabase.from("projects").select("organization_id").eq("id", input.project_id).single();
        orgId = proj?.organization_id;
      }
      const payload = { ...input, organization_id: orgId };
      const { data, error } = await supabase.from("tasks").insert(payload as any).select().single();
      if (error) throw error;
      return { task: data as unknown as Task, orgId: orgId as string | undefined };
    },
    onSuccess: ({ task, orgId }) => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      // Disparo para o ClickUp é feito pelo ProjectDetailsPage via fireClickupWebhook,
      // que inclui parent_project com o clickup_list_id necessário para criar a task na lista correta.
      // Não disparar aqui para evitar duplicidade.
      if (orgId && !(task as any).is_freelancer) {
        void fireN8nWebhook(orgId, "tasks", "create", task as unknown as Record<string, unknown>);
      }
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Task> & { id: string }) => {
      const { data, error } = await supabase.from("tasks").update(input as any).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as Task;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      // Disparo para o ClickUp é feito pelo ProjectDetailsPage via fireClickupWebhook para tarefas terceirizadas.
      // Aqui só dispara para tarefas não-terceirizadas (outros webhooks de notificação).
      const projId = (data as any)?.project_id;
      if (projId && !(data as any).is_freelancer) {
        supabase.from("projects").select("organization_id").eq("id", projId).single().then(({ data: proj }) => {
          if (proj?.organization_id) void fireN8nWebhook(proj.organization_id, "tasks", "update", data as unknown as Record<string, unknown>);
        });
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: task } = await supabase.from("tasks").select("*").eq("id", id).single();
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
      return task as unknown as Task | null;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      const projId = (task as any)?.project_id;
      if (projId) {
        supabase.from("projects").select("organization_id").eq("id", projId).single().then(({ data: proj }) => {
          if (proj?.organization_id && task) void fireN8nWebhook(proj.organization_id, "tasks", "delete", task as unknown as Record<string, unknown>);
        });
      }
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
