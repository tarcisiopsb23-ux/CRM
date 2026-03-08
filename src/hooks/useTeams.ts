import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";

export interface TeamRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  lead_id: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow {
  id: string;
  team_id: string;
  profile_id: string;
  role: string;
  joined_at: string;
  profiles?: { full_name: string; email: string };
}

export function useTeams(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["teams", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: { name: string; slug?: string; description?: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const slug = input.slug ?? input.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const { data, error } = await supabase
        .from("teams")
        .insert({ organization_id: organizationId, name: input.name, slug })
        .select()
        .single();
      if (error) throw error;
      return data as TeamRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<TeamRow> & { id: string }) => {
      const { settings, ...rest } = input;
      const payload = { ...rest, ...(settings !== undefined && { settings: toJson(settings) }) };
      const { data, error } = await supabase
        .from("teams")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as TeamRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams", organizationId] }),
  });

  return { ...query, create, update, remove };
}

export function useTeamMembers(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["team_members", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("id, team_id, profile_id, role, joined_at, profiles(full_name, email)")
        .order("joined_at");
      if (error) throw error;
      return (data ?? []) as TeamMemberRow[];
    },
    enabled: !!organizationId,
  });

  const addMember = useMutation({
    mutationFn: async ({ teamId, profileId }: { teamId: string; profileId: string }) => {
      const { data, error } = await supabase
        .from("team_members")
        .insert({ team_id: teamId, profile_id: profileId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members", organizationId] }),
  });

  const removeMember = useMutation({
    mutationFn: async ({ teamId, profileId }: { teamId: string; profileId: string }) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("profile_id", profileId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members", organizationId] }),
  });

  return { ...query, addMember, removeMember };
}
