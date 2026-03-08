import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

type TaskStatus = Database["public"]["Enums"]["task_status"];
const VALID_PROJECT_STATUS: TaskStatus[] = ["backlog", "em_andamento", "em_revisao", "concluida", "bloqueada"];
const mapProjectStatus = (s: string | undefined): TaskStatus =>
  (s && VALID_PROJECT_STATUS.includes(s as TaskStatus) ? s : "em_andamento") as TaskStatus;

export interface Project {
  id: string;
  organization_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  assigned_to: string | null;
  team_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  start_date: string;
  end_date: string;
  duration_days: number | null;
  position: number;
  created_at: string;
  updated_at: string;
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
      return ((data ?? []) as Array<{ name?: string; [k: string]: unknown }>).map((r) => ({
        ...r,
        title: r.name ?? "",
      })) as unknown as Project[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<Project> & { title: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { title, status, ...rest } = input;
      const { data, error } = await supabase
        .from("projects")
        .insert({
          ...rest,
          organization_id: organizationId,
          name: title,
          status: mapProjectStatus(status) ?? "em_andamento",
        })
        .select()
        .single();
      if (error) throw error;
      return { ...data, title: (data as { name?: string }).name ?? "" } as unknown as Project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Project> & { id: string }) => {
      const { title, status, ...rest } = input;
      const payload = {
        ...rest,
        ...(title !== undefined && { name: title }),
        ...(status !== undefined && { status: mapProjectStatus(status) }),
      };
      const { data, error } = await supabase.from("projects").update(payload).eq("id", id).select().single();
      if (error) throw error;
      return { ...(data as object), title: (data as { name?: string }).name ?? "" } as unknown as Project;
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

export function useTasks(projectId: string | undefined, organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("start_date");
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<Task> & { project_id: string; title: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { status, priority, ...rest } = input;
      const payload = {
        ...rest,
        organization_id: organizationId,
        ...(status !== undefined && {
          status: VALID_PROJECT_STATUS.includes(status as TaskStatus) ? (status as TaskStatus) : undefined,
        }),
        ...(priority !== undefined && {
          priority: ["baixa", "media", "alta", "urgente"].includes(priority)
            ? (priority as Database["public"]["Enums"]["task_priority"])
            : undefined,
        }),
      };
      const { data, error } = await supabase.from("tasks").insert(payload).select().single();
      if (error) throw error;
      return data as unknown as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", projectId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Task> & { id: string }) => {
      const { status, priority, ...rest } = input;
      const payload = {
        ...rest,
        ...(status !== undefined && {
          status: VALID_PROJECT_STATUS.includes(status as TaskStatus) ? (status as TaskStatus) : undefined,
        }),
        ...(priority !== undefined && {
          priority: ["baixa", "media", "alta", "urgente"].includes(priority)
            ? (priority as Database["public"]["Enums"]["task_priority"])
            : undefined,
        }),
      };
      const { data, error } = await supabase.from("tasks").update(payload).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", projectId] }),
  });

  return { ...query, create, update };
}
