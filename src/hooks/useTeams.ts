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
  type: 'comercial' | 'operacional';
  is_portfolio: boolean;
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
    mutationFn: async (input: { 
      name: string; 
      slug?: string; 
      description?: string; 
      type?: 'comercial' | 'operacional'; 
      is_portfolio?: boolean;
      lead_id?: string | null;
    }) => {
      if (!organizationId) throw new Error("Sem organização");
      const slug = input.slug ?? input.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      
      // 1. Criar a equipe
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({ 
          organization_id: organizationId, 
          name: input.name, 
          slug,
          type: input.type ?? 'operacional',
          is_portfolio: input.is_portfolio ?? (input.type === 'comercial'),
          lead_id: input.lead_id
        })
        .select()
        .single();
      
      if (teamError) throw teamError;

      // 2. Se houver um responsável, adicioná-lo como membro automaticamente
      if (input.lead_id) {
        // Verificar se já está em QUALQUER equipe
        const { data: existing } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("profile_id", input.lead_id)
          .maybeSingle();

        if (existing) {
          const { data: otherTeam } = await supabase.from("teams").select("name").eq("id", existing.team_id).single();
          throw new Error(`Este colaborador já é membro da equipe "${otherTeam?.name || 'outra'}".`);
        }

        const { error: memberError } = await supabase
          .from("team_members")
          .insert({ team_id: team.id, profile_id: input.lead_id });
        
        if (memberError && memberError.code !== '23505') console.error("Erro ao adicionar líder como membro:", memberError);
      }

      return team as TeamRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams", organizationId] });
      qc.invalidateQueries({ queryKey: ["team_members", organizationId] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<TeamRow> & { id: string }) => {
      const { settings, ...rest } = input;
      const payload = { ...rest, ...(settings !== undefined && { settings: toJson(settings) }) };
      
      // 1. Atualizar a equipe
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      
      if (teamError) throw teamError;

      // 2. Se o responsável mudou ou foi definido, garantir que ele seja membro
      if (input.lead_id) {
        // Verificar se já está em OUTRA equipe
        const { data: existing } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("profile_id", input.lead_id)
          .neq("team_id", id)
          .maybeSingle();

        if (existing) {
          const { data: otherTeam } = await supabase.from("teams").select("name").eq("id", existing.team_id).single();
          throw new Error(`Este colaborador já é membro da equipe "${otherTeam?.name || 'outra'}".`);
        }

        const { error: memberError } = await supabase
          .from("team_members")
          .upsert({ team_id: id, profile_id: input.lead_id }, { onConflict: 'team_id,profile_id' });
        
        if (memberError) console.error("Erro ao garantir líder como membro:", memberError);
      }

      return team as TeamRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams", organizationId] });
      qc.invalidateQueries({ queryKey: ["team_members", organizationId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams", organizationId] });
      qc.invalidateQueries({ queryKey: ["team_members", organizationId] });
    },
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
      return (data ?? []) as unknown as TeamMemberRow[];
    },
    enabled: !!organizationId,
  });

  const addMember = useMutation({
    mutationFn: async ({ teamId, profileId }: { teamId: string; profileId: string }) => {
      // 1. Verificar se já está em alguma equipe
      const { data: existing } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("profile_id", profileId)
        .maybeSingle();
      
      if (existing) {
        const { data: team } = await supabase.from("teams").select("name").eq("id", existing.team_id).single();
        throw new Error(`Este colaborador já faz parte da equipe "${team?.name || 'outra'}".`);
      }

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
