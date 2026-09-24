import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamProfilesList } from "@/components/team/TeamProfilesList";
import { TeamListSupabase } from "@/components/team/TeamListSupabase";
import { AddCollaboratorModal } from "@/components/team/AddCollaboratorModal";
import { TimeClockControl } from "@/components/team/TimeClockControl";
import { HRDashboard } from "@/components/team/HRDashboard";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Clock, Users, UsersRound, UserPlus, ChevronDown, Calculator, ShieldCheck, Timer, Star, KeyRound, BriefcaseBusiness } from "lucide-react";
import { PayrollManager } from "@/components/team/PayrollManager";
import { Button } from "@/components/ui/button";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";
import { useCiclos, useCloseCiclo } from "@/hooks/useAvaliacao360";
import { CiclosList } from "@/components/avaliacao360/CiclosList";
import { CicloForm } from "@/components/avaliacao360/CicloForm";
import { CicloDetail } from "@/components/avaliacao360/CicloDetail";
import type { CicloAvaliacao } from "@/types/avaliacao360";
import { toast } from "sonner";
import { ManagerPinAdminDialog } from "@/components/profile/ManagerPinAdminDialog";
import { DriveFolderButton } from "@/components/shared/DriveFolderButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RecruitmentPage from "@/pages/recruitment/RecruitmentPage";

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
  const [tab, setTab] = useState<"dashboard" | "employees" | "teams" | "payroll" | "timeclock" | "avaliacao360" | "recruitment">(
    (profile?.role === "admin" || profile?.role === "owner") ? "dashboard" : "employees"
  );

  const isAdminOrOwner = profile?.role === "admin" || profile?.role === "owner";

  // Estados dos dialogs de ponto — elevados para renderizar botões no header
  const [limitOpen, setLimitOpen] = useState(false);
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [manualPunchOpen, setManualPunchOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);

  // Avaliação 360
  const { data: ciclos = [], isLoading: ciclosLoading } = useCiclos(isAdminOrOwner ? orgId : undefined);
  const closeCiclo = useCloseCiclo();
  const [cicloFormOpen, setCicloFormOpen] = useState(false);
  const [selectedCiclo, setSelectedCiclo] = useState<CicloAvaliacao | null>(null);

  const handleCloseCiclo = async (ciclo: CicloAvaliacao) => {
    if (!confirm(`Encerrar o ciclo "${ciclo.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await closeCiclo.mutateAsync({ cicloId: ciclo.id, organizationId: orgId });
      toast.success("Ciclo encerrado e resultados consolidados");
      if (selectedCiclo?.id === ciclo.id) setSelectedCiclo(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao encerrar ciclo");
    }
  };

  const employeesPermission = usePermissionForScope("team", "employees");
  const teamsPermission = usePermissionForScope("team", "teams");
  const payrollPermission = usePermissionForScope("team", "payroll");
  const timeclockPermission = usePermissionForScope("team", "timeclock");
  const { isAdminOrOwner: canEditTimeclock } = usePermissionForScope("team", "timeclock_edit");

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

  const handleCreateTeam = (input: { name: string; type: 'comercial' | 'operacional'; is_portfolio: boolean }) => {
    create.mutate(input);
  };
  const handleUpdateTeam = (id: string, input: { name: string; type: 'comercial' | 'operacional'; is_portfolio: boolean }) => {
    update.mutate({ id, ...input });
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
    const selectedIsExempt = selected?.role === "owner" || selected?.role === "admin";
    const selectedCanHavePin = ["owner", "admin", "manager"].includes(selected?.role ?? "");
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-foreground truncate">
              {selected?.full_name || "Colaborador"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Detalhes do colaborador</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {canEditTimeclock && !selectedIsExempt && (
              <>
                <Button size="sm" variant="outline" onClick={() => setLimitOpen(true)}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Autorizar entrada/saída
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOvertimeOpen(true)}>
                  <Timer className="h-3.5 w-3.5 mr-1" /> Hora extra
                </Button>
                <Button size="sm" variant="outline" onClick={() => setManualPunchOpen(true)}>
                  <Clock className="h-3.5 w-3.5 mr-1" /> Registrar ponto
                </Button>
              </>
            )}
            {isAdminOrOwner && selectedCanHavePin && (
              <Button size="sm" variant="outline" onClick={() => setPinDialogOpen(true)}>
                <KeyRound className="h-3.5 w-3.5 mr-1" /> PIN Gerencial
              </Button>
            )}
            {selected && (
              <DriveFolderButton
                organizationId={orgId!}
                module="employee"
                record={{ id: selected.id, full_name: selected.full_name }}
                folderId={(selected.metadata as Record<string, unknown> | null)?.drive_folder_id as string | null}
                folderUrl={(selected.metadata as Record<string, unknown> | null)?.drive_folder_url as string | null}
              />
            )}
            <Button variant="outline" onClick={() => navigate("/team")}>
              Voltar
            </Button>
          </div>
        </div>

        {isAdminOrOwner && selectedCanHavePin && selected && (
          <ManagerPinAdminDialog
            open={pinDialogOpen}
            onOpenChange={setPinDialogOpen}
            targetUserId={selected.id}
            targetName={selected.full_name}
            targetRole={selected.role ?? ""}
          />
        )}

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
            externalLimitOpen={limitOpen}
            onExternalLimitOpenChange={setLimitOpen}
            externalOvertimeOpen={overtimeOpen}
            onExternalOvertimeOpenChange={setOvertimeOpen}
            externalManualPunchOpen={manualPunchOpen}
            onExternalManualPunchOpenChange={setManualPunchOpen}
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
            {employeesPermission.canCreate && (
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
        <InviteMemberDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          initialMode={inviteMode}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList>
          {isAdminOrOwner && (
            <TabsTrigger value="dashboard" className="gap-1.5">
              Dashboard Gestão de Pessoas
            </TabsTrigger>
          )}
          <TabsTrigger value="employees" className="gap-1.5">
            <Users className="h-4 w-4" /> Colaboradores
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5">
            <UsersRound className="h-4 w-4" /> Equipes
          </TabsTrigger>
          {payrollPermission.canView && (
            <TabsTrigger value="payroll" className="gap-1.5">
              <Calculator className="h-4 w-4" /> Folha de Pagamento
            </TabsTrigger>
          )}
          <TabsTrigger value="timeclock" className="gap-1.5">
            <Clock className="h-4 w-4" /> Controle de Ponto
          </TabsTrigger>
          {isAdminOrOwner && (
            <TabsTrigger value="avaliacao360" className="gap-1.5">
              <Star className="h-4 w-4" /> Avaliação 360°
            </TabsTrigger>
          )}
          {isAdminOrOwner && (
            <TabsTrigger value="recruitment" className="gap-1.5">
              <BriefcaseBusiness className="h-4 w-4" /> Recrutamento
            </TabsTrigger>
          )}
        </TabsList>

        {!scopePermission.canView ? (
          <div className="flex flex-col items-center justify-center min-h-[240px] gap-2 text-center">
            <h2 className="text-lg font-semibold text-foreground">Acesso negado</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta seção.</p>
          </div>
        ) : (
          <>
            {isAdminOrOwner && (
              <TabsContent value="dashboard">
                <HRDashboard organizationId={orgId} />
              </TabsContent>
            )}
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

            {payrollPermission.canView && (
              <TabsContent value="payroll">
                <PayrollManager />
              </TabsContent>
            )}

            <TabsContent value="timeclock">
              <TimeClockControl />
            </TabsContent>

            {isAdminOrOwner && (
              <TabsContent value="avaliacao360">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Gerencie ciclos de avaliação e acompanhe os resultados do time.
                    </p>
                    {!selectedCiclo && (
                      <Button size="sm" onClick={() => setCicloFormOpen(true)}>
                        <Star className="h-4 w-4 mr-2" /> Novo Ciclo
                      </Button>
                    )}
                  </div>
                  {selectedCiclo ? (
                    <CicloDetail
                      ciclo={selectedCiclo}
                      onBack={() => setSelectedCiclo(null)}
                      currentProfileId={profile!.id}
                      canManage={isAdminOrOwner}
                    />
                  ) : (
                    <CiclosList
                      ciclos={ciclos}
                      isLoading={ciclosLoading}
                      onSelect={setSelectedCiclo}
                      onClose={handleCloseCiclo}
                      canManage={isAdminOrOwner}
                    />
                  )}
                  <CicloForm
                    open={cicloFormOpen}
                    onOpenChange={setCicloFormOpen}
                    organizationId={orgId}
                  />
                </div>
              </TabsContent>
            )}
            {isAdminOrOwner && (
              <TabsContent value="recruitment">
                <RecruitmentPage embedded />
              </TabsContent>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
