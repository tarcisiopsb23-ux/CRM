import { useMemo, useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useGoals, type GoalIndicator, type GoalPeriod } from "@/hooks/useGoalsCRUD";
import { usePayments } from "@/hooks/useFinancial";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { useClients } from "@/hooks/useClients";
import { useProjects } from "@/hooks/useProjects";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useTeams } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { useModulePermission } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Target, Trash2, Eye, Pencil, LayoutList, Kanban, Calendar as CalendarIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";

type GoalCategory = "crm" | "clientes" | "financeiro" | "projetos" | "campanhas" | "rh";
type IndicatorOption = {
  label: string;
  indicator: GoalIndicator;
  unit: "R$" | "Qtd";
  metadata?: Record<string, unknown>;
};

const INDICATORS_BY_CATEGORY: Record<GoalCategory, IndicatorOption[]> = {
  crm: [
    { label: "Número de contatos (Leads)", indicator: "numero_contatos", unit: "Qtd" },
    { label: "Efetivações de contrato", indicator: "efetivacoes", unit: "Qtd" },
  ],
  clientes: [
    { label: "Novos clientes", indicator: "outro", unit: "Qtd", metadata: { indicator_key: "clientes_novos" } },
  ],
  financeiro: [
    { label: "Faturamento (recebido)", indicator: "faturamento", unit: "R$" },
    { label: "Inadimplência (vencidos)", indicator: "inadimplencia", unit: "R$" },
  ],
  projetos: [
    { label: "Projetos iniciados", indicator: "outro", unit: "Qtd", metadata: { indicator_key: "projetos_iniciados" } },
    { label: "Projetos concluídos", indicator: "outro", unit: "Qtd", metadata: { indicator_key: "projetos_concluidos" } },
  ],
  campanhas: [
    { label: "Investimento em campanhas (gasto)", indicator: "outro", unit: "R$", metadata: { indicator_key: "marketing_gasto" } },
  ],
  rh: [
    { label: "Treinamentos concluídos", indicator: "outro", unit: "Qtd", metadata: { indicator_key: "treinamentos_concluidos" } },
    { label: "Presença (%)", indicator: "outro", unit: "Qtd", metadata: { indicator_key: "presenca_pct" } },
    { label: "Meta atingida (%)", indicator: "outro", unit: "Qtd", metadata: { indicator_key: "meta_atingida_pct" } },
  ],
};

type GoalAppliedTo = "agency" | "team" | "collaborator";
type ViewType = "list" | "calendar" | "kanban";

export default function GoalsPage() {
  const organizationId = useOrganization();
  const { data: goals = [], isLoading, create, update, remove } = useGoals(organizationId);
  const { pinProps, requirePin } = usePinConfirm();
  const goalsPermission = useModulePermission("goals");
  const { canView: canViewFinancial } = useModulePermission("financial");
  const payments = usePayments(organizationId, { enabled: canViewFinancial });
  const { leads } = useLeadsKanban(organizationId, { includeConverted: true });
  const { data: clients = [] } = useClients(organizationId);
  const { data: projects = [] } = useProjects(organizationId);
  const { totals: campaignTotals } = useCampaigns();
  const teamsQuery = useTeams(organizationId);
  const profilesQuery = useProfiles(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<(typeof goals)[number] | null>(null);
  const [category, setCategory] = useState<GoalCategory>("financeiro");
  const [view, setView] = useState<ViewType>("list");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [form, setForm] = useState({
    title: "",
    indicator: "faturamento" as GoalIndicator,
    period: "mensal" as GoalPeriod,
    target_value: "",
    period_start: "",
    period_end: "",
    unit: "R$" as "R$" | "Qtd",
    applied_to: (goalsPermission.isAdminOrOwner ? "agency" : "team") as GoalAppliedTo,
    team_id: "none",
    assigned_to: "none",
    metadata: {} as Record<string, unknown>,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterAppliedTo, setFilterAppliedTo] = useState<GoalAppliedTo | "all">("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterProfile, setFilterProfile] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<GoalCategory | "all">("all");

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);

  const teamNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.name);
    return m;
  }, [teams]);

  const profileNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.id, p.full_name);
    return m;
  }, [profiles]);

  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      if (filterAppliedTo !== "all") {
        const actualApplied: GoalAppliedTo = g.assigned_to ? "collaborator" : g.team_id ? "team" : "agency";
        if (actualApplied !== filterAppliedTo) return false;
      }
      if (filterTeam !== "all" && g.team_id !== filterTeam) return false;
      if (filterProfile !== "all" && g.assigned_to !== filterProfile) return false;
      if (filterCategory !== "all") {
        const meta = ((g as unknown as { metadata?: unknown }).metadata ?? null) as Record<string, unknown> | null;
        if (meta?.category !== filterCategory) return false;
      }
      return true;
    });
  }, [goals, filterAppliedTo, filterTeam, filterProfile, filterCategory]);

  const resolveResponsibleLabel = (goal: (typeof goals)[number]) => {
    if (goal.assigned_to) return profileNameById.get(goal.assigned_to) ?? "Colaborador";
    if (goal.team_id) return teamNameById.get(goal.team_id) ?? "Equipe";
    return "Agência";
  };

  const computeDynamicValue = (g: (typeof goals)[number]) => {
    let dynValue = Number(g.current_value ?? 0);
    try {
      const start = g.period_start ? new Date(g.period_start) : null;
      const end = g.period_end ? new Date(g.period_end) : null;
      const inRange = (d: Date) => {
        if (!start || !end) return false;
        return d >= start && d <= end;
      };
      const meta = ((g as unknown as { metadata?: unknown }).metadata ?? null) as Record<string, unknown> | null;
      const indicatorKey = typeof meta?.indicator_key === "string" ? meta.indicator_key : null;

      switch (indicatorKey ?? g.indicator) {
        case "faturamento":
          if (canViewFinancial && start && end) {
            dynValue = (payments.data ?? [])
              .filter((p) => p.paid_at && inRange(new Date(p.paid_at)))
              .reduce((s, r) => s + Number(r.value ?? 0), 0);
          }
          break;
        case "efetivacoes":
          if (start && end) {
            dynValue = (leads ?? []).filter(
              (l) => l.etapa_kanban === "efetivados" && l.created_at && inRange(new Date(l.created_at))
            ).length;
          }
          break;
        case "inadimplencia":
          if (canViewFinancial && start && end) {
            dynValue = (payments.data ?? [])
              .filter((p) => !p.paid_at && p.due_date && inRange(new Date(p.due_date)) && new Date(p.due_date) < new Date())
              .reduce((s, r) => s + Number(r.value ?? 0), 0);
          }
          break;
        case "numero_contatos":
          if (start && end) {
            dynValue = (leads ?? []).filter((l) => l.created_at && inRange(new Date(l.created_at))).length;
          }
          break;
        case "clientes_novos":
          if (start && end) {
            dynValue = clients.filter((c) => c.created_at && inRange(new Date(c.created_at))).length;
          }
          break;
        case "projetos_iniciados":
          if (start && end) {
            dynValue = projects.filter((p) => p.start_date && inRange(new Date(p.start_date))).length;
          }
          break;
        case "projetos_concluidos":
          if (start && end) {
            dynValue = projects.filter((p) => p.status === "concluida" && p.end_date && inRange(new Date(p.end_date))).length;
          }
          break;
        case "marketing_gasto":
          dynValue = Number(campaignTotals.spend ?? 0);
          break;
        case "treinamentos_concluidos":
        case "presenca_pct":
        case "meta_atingida_pct":
          // Esses indicadores são atualizados manualmente via current_value
          dynValue = Number(g.current_value ?? 0);
          break;
      }
    } catch {
      //
    }
    return dynValue;
  };

  const resetCreateForm = () => {
    setCategory("financeiro");
    setForm({
      title: "",
      indicator: "faturamento",
      period: "mensal",
      target_value: "",
      period_start: "",
      period_end: "",
      unit: "R$",
      applied_to: goalsPermission.isAdminOrOwner ? "agency" : "team",
      team_id: "none",
      assigned_to: "none",
      metadata: {},
    });
  };

  const applyTargetToFields = () => {
    if (form.applied_to === "agency") {
      setForm((p) => ({ ...p, team_id: "none", assigned_to: "none" }));
    } else if (form.applied_to === "team") {
      setForm((p) => ({ ...p, assigned_to: "none" }));
    } else if (form.applied_to === "collaborator") {
      setForm((p) => ({ ...p, team_id: "none" }));
    }
  };

  const toDelegationPayload = () => {
    if (form.applied_to === "team") {
      return { team_id: form.team_id === "none" ? null : form.team_id, assigned_to: null };
    }
    if (form.applied_to === "collaborator") {
      return { team_id: null, assigned_to: form.assigned_to === "none" ? null : form.assigned_to };
    }
    return { team_id: null, assigned_to: null };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = form.period_start || new Date().toISOString().slice(0, 10);
    const end = form.period_end || start;
    setSubmitting(true);
    setSubmitError(null);
    try {
      applyTargetToFields();
      await create.mutateAsync({
        title: form.title,
        indicator: form.indicator,
        period: form.period,
        target_value: Number(form.target_value) || 0,
        period_start: start,
        period_end: end,
        current_value: 0,
        unit: form.unit,
        ...toDelegationPayload(),
        metadata: { ...(form.metadata ?? {}), category },
      });
      setModalOpen(false);
      resetCreateForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar meta";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openView = (g: (typeof goals)[number]) => {
    setSelectedGoal(g);
    setViewOpen(true);
  };

  const openEdit = (g: (typeof goals)[number]) => {
    setSelectedGoal(g);
    const applied_to: GoalAppliedTo = g.assigned_to ? "collaborator" : g.team_id ? "team" : "agency";
    const meta = ((g as unknown as { metadata?: unknown }).metadata ?? null) as Record<string, unknown> | null;
    const nextCategory = ((meta?.category as GoalCategory | undefined) ?? "financeiro") as GoalCategory;
    setCategory(nextCategory);
    setForm({
      title: g.title ?? "",
      indicator: (g.indicator ?? "outro") as GoalIndicator,
      period: (g.period ?? "mensal") as GoalPeriod,
      target_value: String(g.target_value ?? ""),
      period_start: g.period_start ?? "",
      period_end: g.period_end ?? "",
      unit: (g.unit === "Qtd" ? "Qtd" : "R$") as "R$" | "Qtd",
      applied_to,
      team_id: g.team_id ?? "none",
      assigned_to: g.assigned_to ?? "none",
      metadata: meta ?? {},
    });
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal) return;
    const start = form.period_start || new Date().toISOString().slice(0, 10);
    const end = form.period_end || start;
    setSubmitting(true);
    setSubmitError(null);
    try {
      applyTargetToFields();
      await update.mutateAsync({
        id: selectedGoal.id,
        title: form.title,
        indicator: form.indicator,
        period: form.period,
        target_value: Number(form.target_value) || 0,
        period_start: start,
        period_end: end,
        unit: form.unit,
        ...toDelegationPayload(),
        metadata: { ...(form.metadata ?? {}), category },
      });
      setEditOpen(false);
      setSelectedGoal(null);
      resetCreateForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar meta";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  const getIndicatorLabel = (goal: (typeof goals)[number]) => {
    const meta = ((goal as unknown as { metadata?: unknown }).metadata ?? null) as Record<string, unknown> | null;
    const label = typeof meta?.indicator_label === "string" ? meta.indicator_label : null;
    if (label) return label;
    const v = goal.indicator;
    if (v === "inadimplencia") return "Inadimplência";
    if (v === "efetivacoes") return "Efetivações de contrato";
    if (v === "faturamento") return "Faturamento";
    if (v === "numero_contatos") return "Número de contatos";
    if (v === "outro") return "Outro";
    return v;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Metas</h1>
          <p className="text-sm text-muted-foreground">
            Metas individuais, por equipe e da agência. Indicadores: inadimplência, efetivações, faturamento, contatos.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} disabled={!goalsPermission.canCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova meta
        </Button>
      </div>

      <Card className="no-print mb-6">
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div className="w-full sm:w-40">
            <Label className="text-xs">Aplicado a</Label>
            <Select value={filterAppliedTo} onValueChange={(v) => setFilterAppliedTo(v as GoalAppliedTo | "all")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="agency">Agência</SelectItem>
                <SelectItem value="team">Equipe</SelectItem>
                <SelectItem value="collaborator">Colaborador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filterAppliedTo === "team" && (
            <div className="w-full sm:w-48">
              <Label className="text-xs">Equipe</Label>
              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {filterAppliedTo === "collaborator" && (
            <div className="w-full sm:w-48">
              <Label className="text-xs">Colaborador</Label>
              <Select value={filterProfile} onValueChange={setFilterProfile}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="w-full sm:w-40">
            <Label className="text-xs">Categoria</Label>
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as GoalCategory | "all")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="clientes">Clientes</SelectItem>
                <SelectItem value="projetos">Projetos</SelectItem>
                <SelectItem value="campanhas">Campanhas</SelectItem>
                <SelectItem value="rh">Gestão de Pessoas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="ghost" className="h-10" onClick={() => {
            setFilterAppliedTo("all");
            setFilterTeam("all");
            setFilterProfile("all");
            setFilterCategory("all");
          }}>
            Limpar filtros
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Visualização de metas</CardTitle>
          <Tabs value={view} onValueChange={(v) => setView(v as ViewType)} className="w-auto">
            <TabsList>
              <TabsTrigger value="list">
                <LayoutList className="h-4 w-4 mr-2" />
                Lista
              </TabsTrigger>
              <TabsTrigger value="calendar">
                <CalendarIcon className="h-4 w-4 mr-2" />
                Calendário
              </TabsTrigger>
              <TabsTrigger value="kanban">
                <Kanban className="h-4 w-4 mr-2" />
                Kanban
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : filteredGoals.length === 0 ? (
            <p className="text-muted-foreground py-8">Nenhuma meta encontrada com os filtros atuais.</p>
          ) : (
            <>
              {view === "list" && (
                <div className="space-y-2">
                  {filteredGoals.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Target className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{g.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {getIndicatorLabel(g)} • {resolveResponsibleLabel(g)} • {format(new Date(g.period_start), "dd/MM/yyyy", { locale: ptBR })} – {format(new Date(g.period_end), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {(() => {
                            const dynValue = computeDynamicValue(g);
                            const pct = g.target_value
                              ? Math.round((dynValue / g.target_value) * 100)
                              : 0;
                            return (
                              <>
                                <p className="font-medium">
                                  {dynValue} / {g.target_value} {g.unit ?? ""}
                                </p>
                                <div className="flex flex-col gap-1 items-end">
                                  <Progress value={Math.max(0, Math.min(100, pct))} className="h-2 w-40" />
                                  <p className="text-xs text-muted-foreground">{pct}%</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => openView(g)} aria-label="Visualizar">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(g)}
                          aria-label="Alterar"
                          disabled={!goalsPermission.canEdit}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            requirePin(
                              "Excluir meta",
                              "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
                              async () => { remove.mutate(g.id); }
                            );
                          }}
                          aria-label="Excluir"
                          disabled={!goalsPermission.canDelete}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {view === "kanban" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Colunas Kanban */}
                  {["Em andamento", "Concluída", "Em atraso"].map((status) => {
                    const statusGoals = filteredGoals.filter((g) => {
                      const dynValue = computeDynamicValue(g);
                      const isConcluida = dynValue >= (g.target_value || 0);
                      const isEmAtraso = !isConcluida && g.period_end && new Date(g.period_end) < startOfDay(new Date());
                      if (status === "Concluída") return isConcluida;
                      if (status === "Em atraso") return isEmAtraso;
                      return !isConcluida && !isEmAtraso;
                    });

                    return (
                      <div key={status} className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                          <h3 className="font-semibold text-sm flex items-center gap-2">
                            <span className={cn(
                              "h-2 w-2 rounded-full",
                              status === "Concluída" ? "bg-green-500" :
                              status === "Em atraso" ? "bg-red-500" : "bg-blue-500"
                            )} />
                            {status}
                            <span className="text-xs text-muted-foreground font-normal">
                              ({statusGoals.length})
                            </span>
                          </h3>
                        </div>
                        <div className="flex flex-col gap-3 min-h-[200px] p-2 bg-muted/30 rounded-lg border border-dashed">
                          {statusGoals.map((g) => {
                            const dynValue = computeDynamicValue(g);
                            const pct = g.target_value ? Math.round((dynValue / g.target_value) * 100) : 0;
                            return (
                              <Card key={g.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openView(g)}>
                                <CardContent className="p-3 space-y-3">
                                  <div>
                                    <p className="text-sm font-medium leading-none mb-1">{g.title}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {resolveResponsibleLabel(g)}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span>{dynValue} / {g.target_value}</span>
                                      <span>{pct}%</span>
                                    </div>
                                    <Progress value={Math.max(0, Math.min(100, pct))} className="h-1" />
                                  </div>
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <CalendarIcon className="h-3 w-3" />
                                    {g.period_end ? format(new Date(g.period_end), "dd/MM/yyyy") : "--/--/----"}
                                  </p>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {view === "calendar" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="flex justify-center border rounded-lg p-4 bg-white shadow-sm">
                    <Calendar
                      mode="single"
                      selected={currentDate}
                      onSelect={(d) => d && setCurrentDate(d)}
                      locale={ptBR}
                      className="rounded-md border-none"
                      modifiers={{
                        hasGoal: (date) => filteredGoals.some(g => g.period_end && isSameDay(new Date(g.period_end), date))
                      }}
                      modifiersStyles={{
                        hasGoal: { fontWeight: 'bold', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', borderRadius: '50%' }
                      }}
                    />
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm">
                      Metas para {format(currentDate, "dd 'de' MMMM", { locale: ptBR })}
                    </h3>
                    <div className="space-y-3">
                      {filteredGoals
                        .filter(g => g.period_end && isSameDay(new Date(g.period_end), currentDate))
                        .map(g => {
                          const dynValue = computeDynamicValue(g);
                          const pct = g.target_value ? Math.round((dynValue / g.target_value) * 100) : 0;
                          return (
                            <div key={g.id} className="p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer" onClick={() => openView(g)}>
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-medium text-sm">{g.title}</p>
                                  <p className="text-xs text-muted-foreground">{getIndicatorLabel(g)}</p>
                                </div>
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                  {pct}%
                                </span>
                              </div>
                              <Progress value={Math.max(0, Math.min(100, pct))} className="h-1.5" />
                              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                                <span>Resp: {resolveResponsibleLabel(g)}</span>
                                <div className="flex flex-col items-end gap-0.5">
                                  <span>{dynValue} / {g.target_value} {g.unit}</span>
                                  {g.period_end && (
                                    <span className="flex items-center gap-1 text-[9px] font-medium text-blue-600">
                                      <CalendarIcon className="h-2.5 w-2.5" />
                                      Prazo: {format(new Date(g.period_end), "dd/MM/yyyy")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      {filteredGoals.filter(g => g.period_end && isSameDay(new Date(g.period_end), currentDate)).length === 0 && (
                        <p className="text-sm text-muted-foreground italic">Nenhuma meta vencendo nesta data.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova meta</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Meta de faturamento"
                required
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Tabs value={category} onValueChange={(v) => setCategory(v as GoalCategory)} className="w-full">
                <TabsList className="w-full flex flex-wrap justify-start">
                  <TabsTrigger value="crm">CRM</TabsTrigger>
                  <TabsTrigger value="clientes">Clientes</TabsTrigger>
                  <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
                  <TabsTrigger value="projetos">Projetos</TabsTrigger>
                  <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
                </TabsList>
                {(["crm", "clientes", "financeiro", "projetos", "campanhas"] as GoalCategory[]).map((cat) => (
                  <TabsContent key={cat} value={cat} className="mt-3">
                    <Label>Indicador</Label>
                    <Select
                      value={String(form.metadata.indicator_key ?? form.indicator)}
                      onValueChange={(v) => {
                        const opt = INDICATORS_BY_CATEGORY[cat].find(
                          (o) => (o.metadata?.indicator_key ? String(o.metadata.indicator_key) : o.indicator) === v
                        );
                        if (!opt) return;
                        setForm({
                          ...form,
                          indicator: opt.indicator,
                          unit: opt.unit,
                          metadata: {
                            ...(opt.metadata ?? {}),
                            indicator_label: opt.label,
                          },
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar indicador" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDICATORS_BY_CATEGORY[cat].map((o) => {
                          const val = o.metadata?.indicator_key ? String(o.metadata.indicator_key) : o.indicator;
                          return (
                            <SelectItem key={val} value={val}>{o.label}</SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
            <div>
              <Label>Aplicada a</Label>
              <Select
                value={form.applied_to}
                onValueChange={(v) => {
                  const applied = v as GoalAppliedTo;
                  setForm((p) => ({ ...p, applied_to: applied }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {goalsPermission.isAdminOrOwner && <SelectItem value="agency">Agência</SelectItem>}
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="collaborator">Colaborador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.applied_to === "team" && (
              <div>
                <Label>Equipe</Label>
                <Select value={form.team_id} onValueChange={(v) => setForm((p) => ({ ...p, team_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.applied_to === "collaborator" && (
              <div>
                <Label>Responsável</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Valor meta *</Label>
              {form.unit === "R$" ? (
                <CurrencyInput
                  value={form.target_value}
                  onChange={(v) => setForm({ ...form, target_value: v })}
                  required
                />
              ) : (
                <Input
                  type="number"
                  step="1"
                  value={form.target_value}
                  onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                  placeholder="0"
                  required
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data início</Label>
                <Input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                />
              </div>
              <div>
                <Label>Data fim</Label>
                <Input
                  type="date"
                  value={form.period_end}
                  onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                />
              </div>
            </div>
            {submitError && (
              <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-3 rounded">
                {submitError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setModalOpen(false);
                setSubmitError(null);
              }}>Cancelar</Button>
              <Button type="submit" disabled={!goalsPermission.canCreate || submitting || create.isPending}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meta</DialogTitle>
          </DialogHeader>
          {selectedGoal ? (
            <div className="space-y-3">
              <div>
                <div className="text-sm text-muted-foreground">Título</div>
                <div className="font-medium">{selectedGoal.title}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">Indicador</div>
                  <div className="font-medium">{getIndicatorLabel(selectedGoal)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Aplicada a</div>
                  <div className="font-medium">{resolveResponsibleLabel(selectedGoal)}</div>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Período</div>
                <div className="font-medium">
                  {format(new Date(selectedGoal.period_start), "dd/MM/yyyy", { locale: ptBR })} –{" "}
                  {format(new Date(selectedGoal.period_end), "dd/MM/yyyy", { locale: ptBR })}
                </div>
              </div>
              <div>
                {(() => {
                  const dynValue = computeDynamicValue(selectedGoal);
                  const pct = selectedGoal.target_value ? (dynValue / selectedGoal.target_value) * 100 : 0;
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">
                          {dynValue} / {selectedGoal.target_value} {selectedGoal.unit ?? ""}
                        </span>
                      </div>
                      <Progress value={Math.max(0, Math.min(100, pct))} className="h-3" />
                    </div>
                  );
                })()}
              </div>
          </div>
          ) : null}
          <DialogFooter>
            {selectedGoal ? (
              <Button
                variant="outline"
                onClick={() => { openEdit(selectedGoal); setViewOpen(false); }}
                disabled={!goalsPermission.canEdit}
              >
                Alterar
              </Button>
            ) : null}
            <Button onClick={() => setViewOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar meta</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Aplicada a</Label>
              <Select
                value={form.applied_to}
                onValueChange={(v) => {
                  const applied = v as GoalAppliedTo;
                  setForm((p) => ({ ...p, applied_to: applied }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {goalsPermission.isAdminOrOwner && <SelectItem value="agency">Agência</SelectItem>}
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="collaborator">Colaborador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.applied_to === "team" && (
              <div>
                <Label>Equipe</Label>
                <Select value={form.team_id} onValueChange={(v) => setForm((p) => ({ ...p, team_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.applied_to === "collaborator" && (
              <div>
                <Label>Responsável</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Indicador</Label>
              <div className="text-sm text-muted-foreground">{selectedGoal ? getIndicatorLabel(selectedGoal) : "—"}</div>
            </div>
            <div>
              <Label>Valor meta *</Label>
              {form.unit === "R$" ? (
                <CurrencyInput
                  value={form.target_value}
                  onChange={(v) => setForm({ ...form, target_value: v })}
                  required
                />
              ) : (
                <Input
                  type="number"
                  step="1"
                  value={form.target_value}
                  onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                  required
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data início</Label>
                <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
              </div>
              <div>
                <Label>Data fim</Label>
                <Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
              </div>
            </div>
            {submitError && (
              <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-3 rounded">
                {submitError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setEditOpen(false); setSubmitError(null); }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!goalsPermission.canEdit || submitting || update.isPending}>
                {(submitting || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <PinAuthDialog {...pinProps} />
    </div>
  );
}
