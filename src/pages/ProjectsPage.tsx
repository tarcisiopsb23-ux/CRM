import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { useProjects, useTasks } from "@/hooks/useProjects";
import { useTeams } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { useModulePermission } from "@/hooks/usePermissions";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useIntegration } from "@/hooks/useSettings";
import { useClickupSync } from "@/hooks/useClickupSync";
import { SupplierSelect } from "@/components/shared/SupplierSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, FolderKanban, LayoutList, CalendarDays, Columns3, ArrowLeft, ArrowRight, RefreshCcw } from "lucide-react";
import { FreelancerBadge } from "@/components/shared/FreelancerBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { useDriveFolder } from "@/hooks/useDriveFolder";
import { DriveFolderStatusAlert } from "@/components/shared/DriveFolderStatusAlert";
import { addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek, format, formatDistanceToNow, isSameMonth, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatEntityCode } from "@/lib/formatters";
import type { N8nConfig } from "@/types/settings";

type ProjectAppliedTo = "agency" | "team" | "collaborator";
type ProjectsViewMode = "list" | "calendar" | "kanban";

const clampProgress = (v: number) => Math.max(0, Math.min(100, v));
const computeTasksProgress = (tasks: Array<{ status?: string | null; progress?: number | null }>) => {
  if (tasks.length === 0) return 0;
  const sum = tasks.reduce((acc, t) => {
    if (t.status === "concluida") return acc + 100;
    const p = typeof t.progress === "number" ? t.progress : 0;
    return acc + clampProgress(p);
  }, 0);
  return Math.round(sum / tasks.length);
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const organizationId = useOrganization();
  const { data: projects = [], isLoading, create } = useProjects(organizationId);
  const { autoCreateFolder } = useDriveFolder(organizationId);
  const projectsPermission = useModulePermission("projects");
  const teamsQuery = useTeams(organizationId);
  const profilesQuery = useProfiles(organizationId);
  const { data: suppliers = [], create: createSupplierMutation } = useSuppliers(organizationId);
  const { data: n8nIntegration } = useIntegration(organizationId, "n8n");
  const clickupSyncWebhookUrl = (n8nIntegration as { config?: N8nConfig } | null)?.config?.clickupSyncWebhookUrl ?? null;
  const clickupWebhookUrl = (n8nIntegration as { config?: N8nConfig } | null)?.config?.clickupWebhookUrl ?? null;
  const [viewMode, setViewMode] = useState<ProjectsViewMode>("list");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "em_andamento",
    start_date: "",
    end_date: "",
    applied_to: (projectsPermission.canCreate ? "agency" : "team") as ProjectAppliedTo,
    team_id: "none",
    assigned_to: "none",
    is_freelancer: false,
    supplier_id: null as string | null,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({ name: "", service_category: "Serviços Terceirizados" });
  const [creatingSupplier, setCreatingSupplier] = useState(false);

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

  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) m.set(s.id, s.name);
    return m;
  }, [suppliers]);

  const resolveResponsibleLabel = (p: (typeof projects)[number]) => {
    const assignedTo = (p as unknown as { assigned_to?: string | null }).assigned_to ?? null;
    const teamId = (p as unknown as { team_id?: string | null }).team_id ?? null;
    if (assignedTo) return profileNameById.get(assignedTo) ?? "Colaborador";
    if (teamId) return teamNameById.get(teamId) ?? "Equipe";
    return "Agência";
  };

  const normalizeProjectStatus = (status: string) => {
    if (status === "ativo") return "em_andamento";
    if (status === "parado") return "parada";
    if (status === "concluido") return "concluida";
    return status;
  };

  const projectStatusLabel = (status: string) => {
    const s = normalizeProjectStatus(status);
    const labels: Record<string, string> = {
      backlog: "Não iniciado",
      em_andamento: "Em andamento",
      em_revisao: "Em revisão",
      bloqueada: "Parado",
      parada: "Parado",
      concluida: "Concluído",
    };
    return labels[s] ?? status;
  };

  const todayStart = useMemo(() => startOfDay(new Date()), []);

  const alerts = useMemo(() => {
    const overdue: Array<{ id: string; title: string; end: Date; status: string }> = [];
    const dueSoon: Array<{ id: string; title: string; end: Date; status: string; diff: number }> = [];

    for (const p of projects) {
      const endRaw = (p as unknown as { end_date?: string | null }).end_date ?? null;
      if (!endRaw) continue;
      const end = new Date(endRaw);
      if (Number.isNaN(end.getTime())) continue;

      const rawStatus = String((p as unknown as { status?: string | null }).status ?? "em_andamento");
      const normalized = normalizeProjectStatus(rawStatus);
      if (normalized === "concluida") continue;

      const diff = differenceInCalendarDays(end, todayStart);
      if (diff < 0) {
        overdue.push({ id: String((p as { id?: string }).id ?? ""), title: String(p.title ?? "Projeto"), end, status: normalized });
      } else if (diff <= 7) {
        dueSoon.push({ id: String((p as { id?: string }).id ?? ""), title: String(p.title ?? "Projeto"), end, status: normalized, diff });
      }
    }

    overdue.sort((a, b) => a.end.getTime() - b.end.getTime());
    dueSoon.sort((a, b) => a.end.getTime() - b.end.getTime());

    return { overdue, dueSoon };
  }, [projects, todayStart]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const projectsByEndDate = useMemo(() => {
    const map = new Map<string, Array<(typeof projects)[number]>>();
    for (const p of projects) {
      const end = (p as unknown as { end_date?: string | null }).end_date ?? null;
      if (!end) continue;
      const key = String(end).slice(0, 10);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")));
    }
    return map;
  }, [projects]);

  const kanbanColumns = useMemo(() => {
    const cols: Array<{ key: string; label: string; items: Array<(typeof projects)[number]> }> = [
      { key: "backlog", label: "Não iniciado", items: [] },
      { key: "em_andamento", label: "Em andamento", items: [] },
      { key: "em_revisao", label: "Em revisão", items: [] },
      { key: "parada", label: "Parado", items: [] },
      { key: "concluida", label: "Concluído", items: [] },
    ];
    const byKey = new Map(cols.map((c) => [c.key, c]));
    for (const p of projects) {
      const raw = String((p as unknown as { status?: string | null }).status ?? "em_andamento");
      const normalized = normalizeProjectStatus(raw);
      const col = byKey.get(normalized) ?? byKey.get("em_andamento");
      col?.items.push(p);
    }
    for (const c of cols) {
      c.items.sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")));
    }
    return cols;
  }, [projects]);

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

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      status: "em_andamento",
      start_date: "",
      end_date: "",
      applied_to: projectsPermission.isAdminOrOwner ? "agency" : "team",
      team_id: "none",
      assigned_to: "none",
      is_freelancer: false,
      supplier_id: null,
    });
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierForm.name.trim()) return;
    setCreatingSupplier(true);
    try {
      await createSupplierMutation.mutateAsync({
        name: newSupplierForm.name,
        service_category: newSupplierForm.service_category,
      });
      toast.success("Fornecedor cadastrado com sucesso!");
      setShowNewSupplier(false);
      setNewSupplierForm({ name: "", service_category: "Serviços Terceirizados" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar fornecedor");
    } finally {
      setCreatingSupplier(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Validação de responsável obrigatório
      if (form.applied_to === "team" && (!form.team_id || form.team_id === "none")) {
        setSubmitError("Selecione uma equipe responsável.");
        return;
      }
      if (form.applied_to === "collaborator" && (!form.assigned_to || form.assigned_to === "none")) {
        setSubmitError("Selecione um colaborador responsável.");
        return;
      }
      applyTargetToFields();
      const created = await create.mutateAsync({
        title: form.title,
        description: form.description || null,
        start_date: form.start_date || new Date().toISOString().slice(0, 10),
        end_date: form.end_date || (normalizeProjectStatus(form.status) === "concluida" ? new Date().toISOString().slice(0, 10) : null),
        status: normalizeProjectStatus(form.status),
        is_freelancer: form.is_freelancer,
        supplier_id: form.is_freelancer ? form.supplier_id : null,
        ...toDelegationPayload(),
      });
      // Auto-criar pasta no Drive (fire-and-forget via webhook)
      autoCreateFolder("project", { id: created.id, title: created.title, name: created.title, code: created.code ?? null }, ["projects", organizationId]);
      setModalOpen(false);
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar projeto";
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Controle de projetos e tarefas (Gantt em evolução)
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} disabled={!projectsPermission.canCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo projeto
        </Button>
      </div>

      <DriveFolderStatusAlert
        organizationId={organizationId}
        module="project"
        table="projects"
        queryKey="projects"
        records={projects.map((p) => ({ id: p.id, name: p.title, title: p.title, folder_id: p.folder_id, metadata: (p as any).metadata }))}
        canEdit={projectsPermission.canEdit}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-base">Próximos a vencer</CardTitle>
          </CardHeader>
          <CardContent className="h-full flex flex-col">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : alerts.dueSoon.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum projeto próximo a vencer.</div>
            ) : (
              <>
                <div className="space-y-2 flex-1">
                  {alerts.dueSoon.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50"
                    >
                      <div className="font-medium truncate">{p.title}</div>
                      <div className="text-xs text-muted-foreground">
                        Vence em {p.diff} dia(s) • {format(p.end, "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                    </button>
                  ))}
                </div>
                {alerts.dueSoon.length > 6 ? (
                  <div className="pt-3">
                    <Button variant="outline" size="sm" onClick={() => setViewMode("calendar")}>
                      Ver todos no calendário
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-base">Vencidos</CardTitle>
          </CardHeader>
          <CardContent className="h-full flex flex-col">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : alerts.overdue.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum projeto vencido.</div>
            ) : (
              <>
                <div className="space-y-2 flex-1">
                  {alerts.overdue.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50"
                    >
                      <div className="font-medium truncate text-red-600">{p.title}</div>
                      <div className="text-xs text-muted-foreground">
                        Venceu em {format(p.end, "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                    </button>
                  ))}
                </div>
                {alerts.overdue.length > 6 ? (
                  <div className="pt-3">
                    <Button variant="outline" size="sm" onClick={() => setViewMode("calendar")}>
                      Ver todos no calendário
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ProjectsViewMode)}>
        <TabsList>
          <TabsTrigger value="list" className="gap-2">
            <LayoutList className="h-4 w-4" />
            Em linha
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendário
          </TabsTrigger>
          <TabsTrigger value="kanban" className="gap-2">
            <Columns3 className="h-4 w-4" />
            Kanban
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lista de projetos</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando...
                </div>
              ) : projects.length === 0 ? (
                <p className="text-muted-foreground">Nenhum projeto cadastrado. Crie um novo projeto para começar.</p>
              ) : (
                <div className="space-y-2">
                  {projects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      projectId={p.id}
                      title={p.title}
                      code={p.code}
                      startDate={(p as unknown as { start_date?: string | null }).start_date ?? ""}
                      endDate={(p as unknown as { end_date?: string | null }).end_date ?? null}
                      status={projectStatusLabel(String((p as unknown as { status?: string | null }).status ?? ""))}
                      responsible={resolveResponsibleLabel(p)}
                      isFreelancer={(p as unknown as { is_freelancer?: boolean }).is_freelancer ?? false}
                      supplierName={p.supplier_id ? supplierNameById.get(p.supplier_id) : undefined}
                      clickupSyncedAt={(p as unknown as { clickup_synced_at?: string | null }).clickup_synced_at ?? null}
                      clickupTaskId={(p as unknown as { clickup_task_id?: string | null }).clickup_task_id ?? null}
                      clickupListId={(p as unknown as { clickup_list_id?: string | null }).clickup_list_id ?? null}
                      syncWebhookUrl={(p as unknown as { is_freelancer?: boolean }).is_freelancer ? clickupSyncWebhookUrl : null}
                      createWebhookUrl={(p as unknown as { is_freelancer?: boolean }).is_freelancer ? clickupWebhookUrl : null}
                      projectData={p as unknown as Record<string, unknown>}
                      onOpen={() => navigate(`/projects/${p.id}`)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Calendário de projetos</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCalendarMonth((d) => subMonths(d, 1))}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium w-[160px] text-center">
                  {format(calendarMonth, "MMMM yyyy", { locale: ptBR })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCalendarMonth((d) => addMonths(d, 1))}
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground mb-2">
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                  <div key={d} className="text-center">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const items = projectsByEndDate.get(key) ?? [];
                  const muted = !isSameMonth(day, calendarMonth);
                  const isPastDay = day < todayStart;
                  return (
                    <div
                      key={key}
                      className={`min-h-[120px] rounded-lg border border-border p-2 ${muted ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium">{format(day, "d")}</div>
                        <div className="text-[10px] text-muted-foreground">{items.length > 0 ? `${items.length}` : ""}</div>
                      </div>
                      <div className="mt-2 space-y-2">
                        {items.slice(0, 3).map((p) => (
                          (() => {
                            const rawStatus = String((p as unknown as { status?: string | null }).status ?? "em_andamento");
                            const normalized = normalizeProjectStatus(rawStatus);
                            const overdue = isPastDay && normalized !== "concluida";
                            return (
                          <ProjectMiniCard
                            key={p.id}
                            projectId={p.id}
                            title={p.title}
                            overdue={overdue}
                            onOpen={() => navigate(`/projects/${p.id}`)}
                          />
                            );
                          })()
                        ))}
                        {items.length > 3 ? (
                          <div className="text-[10px] text-muted-foreground">+{items.length - 3}...</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kanban">
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-[900px]">
              {kanbanColumns.map((col) => (
                <div key={col.key} className="w-[320px] shrink-0">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        {col.label} <span className="text-xs text-muted-foreground">({col.items.length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {col.items.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                          Sem projetos
                        </div>
                      ) : (
                        col.items.map((p) => (
                          <ProjectKanbanCard
                            key={p.id}
                            projectId={p.id}
                            title={p.title}
                            endDate={(p as unknown as { end_date?: string | null }).end_date ?? null}
                            onOpen={() => navigate(`/projects/${p.id}`)}
                          />
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Nome do projeto"
                required
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descrição"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Não iniciado</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="parada">Parado</SelectItem>
                  <SelectItem value="concluida" disabled={!projectsPermission.isAdminOrOwner}>Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data início</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Data fim</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Aplicada a</Label>
              <Select
                value={form.applied_to}
                onValueChange={(v) => setForm((p) => ({ ...p, applied_to: v as ProjectAppliedTo }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectsPermission.isAdminOrOwner && <SelectItem value="agency">Agência</SelectItem>}
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="collaborator">Colaborador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.applied_to === "team" && (
              <div>
                <Label>Equipe *</Label>
                <Select value={form.team_id} onValueChange={(v) => setForm((p) => ({ ...p, team_id: v }))}>
                  <SelectTrigger className={form.team_id === "none" ? "border-destructive" : ""}>
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
                <Label>Responsável *</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to: v }))}>
                  <SelectTrigger className={form.assigned_to === "none" ? "border-destructive" : ""}>
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
            {submitError && (
              <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-3 rounded">
                {submitError}
              </div>
            )}
            {/* Freelancer checkbox */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-md border px-3 py-2.5">
                <Checkbox
                  id="is_freelancer"
                  checked={form.is_freelancer}
                  onCheckedChange={(v) => setForm(p => ({ ...p, is_freelancer: !!v, supplier_id: !!v ? p.supplier_id : null }))}
                />
                <label htmlFor="is_freelancer" className="text-sm cursor-pointer flex items-center gap-2">
                  Atribuído a terceirizado
                  {form.is_freelancer && <FreelancerBadge />}
                </label>
              </div>
              {form.is_freelancer && organizationId && (
                <div>
                  <Label>Fornecedor</Label>
                  <SupplierSelect
                    organizationId={organizationId}
                    value={form.supplier_id}
                    onChange={(v) => setForm(p => ({ ...p, supplier_id: v }))}
                    onAddNew={() => setShowNewSupplier(true)}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setModalOpen(false);
                setSubmitError(null);
                resetForm();
              }}>Cancelar</Button>
              <Button type="submit" disabled={!projectsPermission.canCreate || submitting || create.isPending}>
                {(submitting || create.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Novo Fornecedor */}
      <Dialog open={showNewSupplier} onOpenChange={setShowNewSupplier}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Fornecedor</DialogTitle>
            <DialogDescription>
              Cadastre um novo fornecedor para atribuir ao projeto.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSupplier} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-supplier-name">Nome do Fornecedor *</Label>
              <Input
                id="new-supplier-name"
                placeholder="Ex: Fornecedor Ltda"
                value={newSupplierForm.name}
                onChange={(e) => setNewSupplierForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria de Serviço</Label>
              <Select
                value={newSupplierForm.service_category}
                onValueChange={(v) => setNewSupplierForm((f) => ({ ...f, service_category: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Serviços Terceirizados">Serviços Terceirizados</SelectItem>
                  <SelectItem value="Eletro/Eletrônicos">Eletro/Eletrônicos</SelectItem>
                  <SelectItem value="Tecnologia">Tecnologia</SelectItem>
                  <SelectItem value="Assinaturas">Assinaturas</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setShowNewSupplier(false);
                setNewSupplierForm({ name: "", service_category: "Serviços Terceirizados" });
              }} disabled={creatingSupplier}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creatingSupplier || createSupplierMutation.isPending || !newSupplierForm.name.trim()}>
                {(creatingSupplier || createSupplierMutation.isPending) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectRow({
  projectId,
  title,
  code,
  startDate,
  endDate,
  status,
  responsible,
  isFreelancer = false,
  supplierName,
  clickupSyncedAt,
  clickupTaskId,
  clickupListId,
  syncWebhookUrl,
  createWebhookUrl,
  projectData,
  onOpen,
}: {
  projectId: string;
  title: string;
  code?: number | null;
  startDate: string;
  endDate: string | null;
  status: string;
  responsible: string;
  isFreelancer?: boolean;
  supplierName?: string;
  clickupSyncedAt?: string | null;
  clickupTaskId?: string | null;
  clickupListId?: string | null;
  syncWebhookUrl?: string | null;
  createWebhookUrl?: string | null;
  projectData?: Record<string, unknown>;
  onOpen: () => void;
}) {
  const { data: tasks = [] } = useTasks(projectId);
  const progress = useMemo(() => computeTasksProgress(tasks), [tasks]);
  const startOk = startDate ? new Date(startDate) : null;
  const endOk = endDate ? new Date(endDate) : null;
  const { syncItem, syncing } = useClickupSync();
  const isSyncing = syncing === projectId;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 text-left"
    >
      <div className="flex items-center gap-3">
        <FolderKanban className="h-5 w-5 text-muted-foreground" />
        <div>
          <div className="flex items-center gap-2">
            {code != null && (
              <span className="font-mono text-xs text-muted-foreground">{formatEntityCode("PRJ", code)}</span>
            )}
            <p className="font-medium">{title}</p>
            {isFreelancer && <FreelancerBadge supplierName={supplierName} />}
            {isFreelancer && clickupSyncedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9"/><polyline points="21 3 21 9 15 9"/></svg>
                ClickUp · {formatDistanceToNow(new Date(clickupSyncedAt), { addSuffix: true, locale: ptBR })}
              </span>
            )}
            {isFreelancer && !clickupSyncedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                ClickUp · Não sincronizado
              </span>
            )}
            {/* Botão Criar no ClickUp — só se terceirizado E sem clickup_task_id */}
            {isFreelancer && !clickupTaskId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!createWebhookUrl) { toast.error("Configure o Webhook ClickUp nas Configurações → n8n → ClickUp."); return; }
                  if (!projectData) return;
                  syncItem({
                    webhookUrl: createWebhookUrl,
                    table: "projects",
                    item: { ...projectData, id: projectId, title, clickup_task_id: null } as any,
                  });
                }}
                disabled={isSyncing}
                className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 rounded px-1.5 py-0.5 transition-colors"
                title={createWebhookUrl ? "Criar no ClickUp" : "Webhook não configurado"}
              >
                <RefreshCcw className={`h-2.5 w-2.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Criando..." : "Criar no ClickUp"}
              </button>
            )}
            {/* Botão Sincronizar — só se já tem clickup_task_id */}
            {isFreelancer && clickupTaskId && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!syncWebhookUrl) { toast.error("Configure o Webhook de Sync ClickUp nas Configurações → n8n → ClickUp."); return; }
                  try {
                    await fetch(syncWebhookUrl, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ trigger: "manual", project_id: projectId }),
                    });
                    toast.success("Sincronização iniciada!");
                  } catch { toast.error("Erro ao sincronizar."); }
                }}
                disabled={isSyncing}
                className="inline-flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-400 rounded px-1.5 py-0.5 transition-colors"
                title={syncWebhookUrl ? "Sincronizar com ClickUp" : "Webhook não configurado"}
              >
                <RefreshCcw className={`h-2.5 w-2.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Sincronizando..." : "Sync ClickUp"}
              </button>
            )}
            {/* Link direto para a Lista no ClickUp */}
            {isFreelancer && (clickupListId || clickupTaskId) && (
              <a
                href={`https://app.clickup.com/90171128896/v/l/li/${clickupListId || clickupTaskId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-400 rounded px-1.5 py-0.5 transition-colors"
                title="Abrir no ClickUp"
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Ver no ClickUp
              </a>
            )}          </div>
          <p className="text-sm text-muted-foreground">
            {startOk && !Number.isNaN(startOk.getTime()) ? format(startOk, "dd/MM/yyyy", { locale: ptBR }) : "—"}
            {endOk && !Number.isNaN(endOk.getTime()) ? ` – ${format(endOk, "dd/MM/yyyy", { locale: ptBR })}` : ""}
            {" • "}{responsible}{" • "}{tasks.length} tarefa(s)
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="w-[160px]">
              <Progress value={progress} className="h-2" />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">{progress}%</div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>
    </button>
  );
}

function ProjectMiniCard({
  projectId,
  title,
  overdue,
  onOpen,
}: {
  projectId: string;
  title: string;
  overdue: boolean;
  onOpen: () => void;
}) {
  const { data: tasks = [] } = useTasks(projectId);
  const progress = useMemo(() => computeTasksProgress(tasks), [tasks]);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded border border-border bg-muted/20 hover:bg-muted/40 p-2"
    >
      <div className={`text-xs font-medium truncate ${overdue ? "text-red-600" : ""}`}>{title}</div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1">
          <Progress value={progress} className="h-1.5" />
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">{progress}%</div>
      </div>
    </button>
  );
}

function ProjectKanbanCard({
  projectId,
  title,
  endDate,
  onOpen,
}: {
  projectId: string;
  title: string;
  endDate: string | null;
  onOpen: () => void;
}) {
  const { data: tasks = [] } = useTasks(projectId);
  const progress = useMemo(() => computeTasksProgress(tasks), [tasks]);
  const endOk = endDate ? new Date(endDate) : null;
  const endLabel = endOk && !Number.isNaN(endOk.getTime()) ? format(endOk, "dd/MM", { locale: ptBR }) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50"
    >
      <div className="font-medium text-sm truncate">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {endLabel ? `Fim: ${endLabel}` : "Sem prazo"}
        {" • "}{tasks.length} tarefa(s)
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex-1">
          <Progress value={progress} className="h-2" />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">{progress}%</div>
      </div>
    </button>
  );
}
