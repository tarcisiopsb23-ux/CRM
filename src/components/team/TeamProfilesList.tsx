import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ProfileRow } from "@/hooks/useProfiles";
import type { TeamRow } from "@/hooks/useTeams";
import type { TeamMemberRow } from "@/hooks/useTeams";

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Admin",
  manager: "Gestor",
  member: "Membro",
  viewer: "Visualizador",
};

interface Props {
  profiles: ProfileRow[];
  teams: TeamRow[];
  members: TeamMemberRow[];
  loading?: boolean;
}

export function TeamProfilesList({ profiles, teams, members, loading }: Props) {
  const getTeamName = (profileId: string) => {
    const m = members.find((x) => x.profile_id === profileId);
    if (!m) return null;
    return teams.find((t) => t.id === m.team_id)?.name ?? null;
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!profiles.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Nenhum colaborador na organização. Usuários convidados aparecerão aqui.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {profiles.map((p) => (
        <Card key={p.id}>
          <CardContent className="flex items-center gap-4 p-4">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="text-sm">
                {p.full_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{p.full_name}</p>
              <p className="text-sm text-muted-foreground truncate">{p.email}</p>
            </div>
            <Badge variant={p.is_active ? "default" : "secondary"}>
              {ROLE_LABELS[p.role] ?? p.role}
            </Badge>
            {getTeamName(p.id) && (
              <span className="text-sm text-muted-foreground">{getTeamName(p.id)}</span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
