import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamProfilesList } from "@/components/team/TeamProfilesList";
import { TeamListSupabase } from "@/components/team/TeamListSupabase";
import { AddCollaboratorModal } from "@/components/team/AddCollaboratorModal";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Users, DollarSign, UsersRound, UserPlus, ChevronDown } from "lucide-react";
import { StubPage } from "@/components/shared/StubPage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TeamPage() {
  const orgId = useOrganization();
  const { profile } = useAuth();
  const { data: profiles = [], isLoading: profilesLoading, refetch: refetchProfiles } = useProfiles(orgId);
  const { data: teams = [], isLoading: teamsLoading, create, update, remove } = useTeams(orgId);
  const { data: members = [], addMember, removeMember } = useTeamMembers(orgId);
  const [addDirectOpen, setAddDirectOpen] = useState(false);
  const isAdmin = profile?.role === "admin" || profile?.role === "owner";

  const handleCreateTeam = (name: string) => {
    create.mutate({ name });
  };
  const handleUpdateTeam = (id: string, name: string) => {
    update.mutate({ id, name });
  };
  const handleDeleteTeam = (id: string) => {
    remove.mutate(id);
  };
  const handleAddMember = (teamId: string, profileId: string) => {
    addMember.mutate({ teamId, profileId });
  };
  const handleRemoveMember = (teamId: string, profileId: string) => {
    removeMember.mutate({ teamId, profileId });
  };

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Equipe & Colaboradores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Colaboradores e equipes da organização. Convide novos usuários em Configurações.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Adicionar colaborador
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/settings">Enviar convite por e-mail</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">Gerar link manualmente</Link>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => setAddDirectOpen(true)}>
                Cadastrar diretamente (sem token)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <AddCollaboratorModal
          open={addDirectOpen}
          onOpenChange={setAddDirectOpen}
          onSuccess={() => refetchProfiles()}
        />
      </div>

      <Tabs defaultValue="employees" className="w-full">
        <TabsList>
          <TabsTrigger value="employees" className="gap-1.5">
            <Users className="h-4 w-4" /> Colaboradores
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5">
            <UsersRound className="h-4 w-4" /> Equipes
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5">
            <DollarSign className="h-4 w-4" /> Folha de Pagamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <TeamProfilesList
            profiles={profiles}
            teams={teams}
            members={members}
            loading={profilesLoading}
          />
        </TabsContent>

        <TabsContent value="teams">
          <TeamListSupabase
            teams={teams}
            profiles={profiles}
            members={members}
            onCreate={handleCreateTeam}
            onUpdate={handleUpdateTeam}
            onDelete={handleDeleteTeam}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            loading={teamsLoading}
          />
        </TabsContent>

        <TabsContent value="payroll">
          <StubPage
            title="Folha de Pagamento"
            description="Gestão de folha em desenvolvimento."
            icon={DollarSign}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
