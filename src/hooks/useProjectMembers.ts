import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import type { ProjectMember } from "@/types/chat";

export function useProjectMembers(projectId: string | undefined) {
  const qc = useQueryClient();
  const organizationId = useOrganization();

  const query = useQuery({
    queryKey: ["project_members", projectId],
    queryFn: async () => {
      if (!projectId) return [];

      const { data: members, error } = await supabase
        .from("project_members")
        .select("id, project_id, profile_id, role")
        .eq("project_id", projectId)
        .order("id", { ascending: true });

      if (error) throw error;
      if (!members || members.length === 0) return [];

      const rows = members as { id: string; project_id: string; profile_id: string; role: string }[];
      const profileIds = rows.map((m) => m.profile_id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .in("id", profileIds);

      const profileMap = new Map(
        (profiles ?? []).map((p) => [(p as { id: string }).id, p])
      );

      return rows.map((m) => ({
        id: m.id,
        project_id: m.project_id,
        profile_id: m.profile_id,
        role: m.role,
        joined_at: new Date().toISOString(),
        profile: (profileMap.get(m.profile_id) as { full_name: string; avatar_url: string | null; role: string } | undefined) ?? null,
      })) as ProjectMember[];
    },
    enabled: !!projectId,
  });

  const addMember = useMutation({
    mutationFn: async ({ profileId, role = "member" }: { profileId: string; role?: string }) => {
      if (!projectId || !organizationId) throw new Error("Sem projeto ou organização");
      const { error } = await supabase
        .from("project_members")
        .upsert(
          { project_id: projectId, profile_id: profileId, role, organization_id: organizationId },
          { onConflict: "project_id,profile_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_members", projectId] }),
  });

  const removeMember = useMutation({
    mutationFn: async (profileId: string) => {
      if (!projectId) throw new Error("Sem projeto");
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .eq("profile_id", profileId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_members", projectId] }),
  });

  return {
    members: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? String(query.error) : null,
    addMember: (profileId: string, role?: string) => addMember.mutateAsync({ profileId, role }),
    removeMember: (profileId: string) => removeMember.mutateAsync(profileId),
    refetch: query.refetch,
  };
}
