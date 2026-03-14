import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamProfilesList } from "@/components/team/TeamProfilesList";
import { TeamListSupabase } from "@/components/team/TeamListSupabase";
import { AddCollaboratorModal } from "@/components/team/AddCollaboratorModal";
import { TimeClockControl } from "@/components/team/TimeClockControl";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Clock, Users, UsersRound, UserPlus, ChevronDown, Calculator } from "lucide-react";
import { PayrollManager } from "@/components/team/PayrollManager";
import { Button } from "@/components/ui/button";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TeamPage() {
  const orgId = useOrganization();
  const { profile } = useAuth();
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { data: profiles = [], isLoading: profilesLoading, refetch: refetchProfiles } = useProfiles(orgId);
  const { data: teams = [], isLoading: teamsLoading, create, update, remove } = useTeams(orgId);
  const { data: members = [], addMember, removeMember } = useTeamMembers(orgId);
  const [addDirectOpen, setAddDirectOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"email" | "link">("email");
  const isAdmin = profile?.role === "admin" || profile?.role === "owner";
  const [tab, setTab] = useState<"employees" | "teams" | "payroll" | "timeclock">("employees");
  const employeesPermission = usePermissionForScope("team", "employees");
  const teamsPermission = usePermissionForScope("team", "teams");
  const payrollPermission = usePermissionForScope("team", "payroll");
  const timeclockPermission = usePermissionForScope("team", "timeclock");

  const scopePermission =
    tab === "employees"
      ? employeesPermission
      : tab === "teams"
        ? teamsPermission
        : tab === "payroll"
          ? payrollPermission
          : timeclockPermission;

  useEffect(() => {
    if (profileId) setTab("employees");
  }, [profileId]);

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

  if (profileId) {
    const selected = profiles.find((p) => String(p.id) === String(profileId));
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-foreground truncate">
              {selected?.full_name || "Colaborador"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Detalhes do colaborador</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/team")}>
            Voltar
          </Button>
        </div>

        {!employeesPermission.canView ? (
          <div className="flex flex-col items-center justify-center min-h-[240px] gap-2 text-center">
            <h2 className="text-lg font-semibold text-foreground">Acesso negado</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta seção.</p>
          </div>
        ) : (
          <TeamProfilesList
            profiles={profiles}
            teams={teams}
            members={members}
            loading={profilesLoading}
            selectedProfileId={profileId}
          />
        )}
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
            <Button variant="outline" className="flex items-center gap-2" disabled={!employeesPermission.canCreate}>
              <UserPlus className="h-4 w-4" />
              Adicionar colaborador
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => { setInviteMode("email"); setInviteOpen(true); }}
              disabled={!employeesPermission.canCreate}
            >
              Enviar convite por e-mail
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => { setInviteMode("link"); setInviteOpen(true); }}
              disabled={!employeesPermission.canCreate}
            >
              Gerar link manualmente
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => setAddDirectOpen(true)} disabled={!employeesPermission.canCreate}>
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
        <InviteMemberDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          initialMode={inviteMode}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList>
          <TabsTrigger value="employees" className="gap-1.5">
            <Users className="h-4 w-4" /> Colaboradores
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5">
            <UsersRound className="h-4 w-4" /> Equipes
          </TabsTrigger>
          {payrollPermission.canView && (isAdmin || profile?.role === "manager") && (
            <TabsTrigger value="payroll" className="gap-1.5">
              <Calculator className="h-4 w-4" /> Folha de Pagamento
            </TabsTrigger>
          )}
          <TabsTrigger value="timeclock" className="gap-1.5">
            <Clock className="h-4 w-4" /> Controle de Ponto
          </TabsTrigger>
        </TabsList>

        {!scopePermission.canView ? (
          <div className="flex flex-col items-center justify-center min-h-[240px] gap-2 text-center">
            <h2 className="text-lg font-semibold text-foreground">Acesso negado</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta seção.</p>
          </div>
        ) : (
          <>
            <TabsContent value="employees">
              <TeamProfilesList profiles={profiles} teams={teams} members={members} loading={profilesLoading} />
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
                canCreate={teamsPermission.canCreate}
                canEdit={teamsPermission.canEdit}
                canDelete={teamsPermission.canDelete}
                canManageMembers={teamsPermission.canEdit}
              />
            </TabsContent>

            {(isAdmin || profile?.role === "manager") && payrollPermission.canView && (
              <TabsContent value="payroll">
                <PayrollManager />
              </TabsContent>
            )}

            <TabsContent value="timeclock">
              <TimeClockControl />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
