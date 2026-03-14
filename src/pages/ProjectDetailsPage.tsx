/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { useProjects, useTasks } from "@/hooks/useProjects";
import { useProfiles } from "@/hooks/useProfiles";
import { useClients } from "@/hooks/useClients";
import { useModulePermission } from "@/hooks/usePermissions";
import { getDriveFoldersFromOrganizationSettings, useOrganizationSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Trash2, Calendar, CheckSquare, Plus, Users, LayoutList, CalendarDays, GanttChart, Pencil, FileText, ExternalLink, Download, PauseCircle } from "lucide-react";
import { format, parseISO, isSameDay, isSameMonth, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isWithinInterval, differenceInCalendarDays, isAfter, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/types/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DocumentsCard } from "@/components/documents/DocumentsCard";

export function ProjectDetailsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const organizationId = useOrganization();
  const orgSettings = useOrganizationSettings(organizationId);
  const driveFolders = useMemo(() => getDriveFoldersFromOrganizationSettings(orgSettings.data), [orgSettings.data]);
  const { data: projects = [], remove, update } = useProjects(organizationId);
  const { data: profiles = [] } = useProfiles(organizationId);
  const { data: clients = [] } = useClients(organizationId);
  const { data: tasks = [], create: createTask, update: updateTask, remove: removeTask } = useTasks(projectId);
  const projectsPermission = useModulePermission("projects");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    notes: "",
    start_date: "",
    end_date: "",
    responsible_id: "",
    priority: "",
    status: "",
  });
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskStatusFilter, setTaskStatusFilter] = useState<"all" | Database["public"]["Enums"]["task_status"]>("all");
  const [taskSearch, setTaskSearch] = useState("");

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const { data: client } = useQuery({
    queryKey: ["client", project?.client_id],
    queryFn: async () => {
      if (!project?.client_id) return null;
      const { data, error } = await supabase.from("clients").select("*").eq("id", project.client_id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!project?.client_id,
  });

  const [newTask, setNewTask] = useState({
    title: "",
    priority: "media" as Database["public"]["Enums"]["task_priority"],
    assigned_to: "" as string | null,
    status: "backlog" as Database["public"]["Enums"]["task_status"],
    description: "",
    notes: "",
    start_date: "",
    end_date: "",
    estimated_hours: "",
    progress: "0",
  });

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    return tasks.filter((t) => {
      if (taskStatusFilter !== "all" && t.status !== taskStatusFilter) return false;
      if (!q) return true;
      const title = String(t.title ?? "").toLowerCase();
      const desc = String(t.description ?? "").toLowerCase();
      const notes = String(((t.metadata ?? {}) as any)?.notes ?? "").toLowerCase();
      return title.includes(q) || desc.includes(q) || notes.includes(q);
    });
  }, [taskSearch, taskStatusFilter, tasks]);

  const projectProgress = useMemo(() => {
    if (tasks.length === 0) return 0;
    const sum = tasks.reduce((acc, t) => {
      if (t.status === "concluida") return acc + 100;
      const p = typeof t.progress === "number" ? t.progress : 0;
      const clamped = Math.max(0, Math.min(100, p));
      return acc + clamped;
    }, 0);
    return Math.round(sum / tasks.length);
  }, [tasks]);

  useEffect(() => {
    if (!project) return;
    if (!projectsPermission.canEdit) return;
    if (update.isPending) return;
    const current = (project as unknown as { progress?: number | null }).progress;
    const cur = typeof current === "number" ? Math.round(current) : null;
    if (cur === projectProgress) return;
    update.mutate({ id: project.id, progress: projectProgress });
  }, [project, projectProgress, projectsPermission.canEdit, update]);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Projeto não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/projects")}>
          Voltar para Projetos
        </Button>
      </div>
    );
  }

  const handleSaveDetails = () => {
    update.mutate({
      id: project.id,
      title: editForm.title,
      description: editForm.description,
      start_date: editForm.start_date,
      end_date: editForm.end_date || null,
      status: editForm.status as any,
      priority: editForm.priority as any,
      responsible_id: editForm.responsible_id === "unassigned" ? null : editForm.responsible_id,
      client_id: (editForm as any).client_id === "none" ? null : (editForm as any).client_id,
      metadata: { ...((project as any).metadata || {}), notes: editForm.notes },
    });
    setIsEditing(false);
  };

  const startEditing = () => {
    setEditForm({
      title: project.title,
      description: project.description || "",
      notes: (project as any).metadata?.notes || (project as any).notes || "",
      start_date: project.start_date ? format(parseISO(project.start_date), "yyyy-MM-dd") : "",
      end_date: project.end_date ? format(parseISO(project.end_date), "yyyy-MM-dd") : "",
      responsible_id: project.responsible_id || "unassigned",
      client_id: project.client_id || "none",
      priority: project.priority || "media",
      status: project.status,
    } as any);
    setIsEditing(true);
  };

  const responsibleName = project.responsible_type === "team"
    ? "Equipe"
    : project.responsible_id
    ? profiles.find((p) => p.id === project.responsible_id)?.full_name
    : null;

  const STATUS_LABELS: Record<string, string> = {
    backlog: "Não iniciado",
    em_andamento: "Em andamento",
    em_revisao: "Em revisão",
    bloqueada: "Parado",
    concluida: "Concluído",
  };

  const openTaskModal = (task?: any) => {
    if (task) {
        setEditingTask(task);
        setNewTask({
            title: task.title,
            priority: task.priority,
            assigned_to: task.assigned_to,
            status: task.status,
            description: task.description || "",
            notes: (task.metadata as any)?.notes || "",
            start_date: task.start_date || "",
            end_date: task.end_date || "",
            estimated_hours: task.estimated_hours ? String(task.estimated_hours) : "",
            progress: task.progress ? String(task.progress) : "0",
        });
    } else {
        setEditingTask(null);
        setNewTask({
            title: "",
            priority: "media",
            assigned_to: "",
            status: "backlog",
            description: "",
            notes: "",
            start_date: "",
            end_date: "",
            estimated_hours: "",
            progress: "0",
        });
    }
    setIsTaskModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {((project as any).color || (project as any).metadata?.color) && (
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: (project as any).color || (project as any).metadata?.color }}
              />
            )}
            {isEditing ? (
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="text-2xl font-bold tracking-tight h-10 w-full"
              />
            ) : (
              <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1">
              <Progress value={projectProgress} className="h-2" />
            </div>
            <div className="text-sm font-medium tabular-nums">{projectProgress}%</div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <Badge variant="outline">{STATUS_LABELS[project.status] || project.status}</Badge>
            {client && (
              <span className="flex items-center gap-1 font-medium text-foreground">
                • {client.company || client.name}
              </span>
            )}
            {project.end_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(parseISO(project.end_date), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            )}
            {responsibleName && <span>• Resp: {responsibleName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
           {!isEditing ? (
             <Button variant="outline" size="sm" onClick={startEditing} disabled={!projectsPermission.canEdit}>
               Editar Detalhes
             </Button>
           ) : (
             <>
               <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancelar</Button>
               <Button size="sm" onClick={handleSaveDetails} disabled={!projectsPermission.canEdit}>Salvar</Button>
             </>
           )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm("Tem certeza que deseja excluir este projeto?")) {
                remove.mutate(project.id);
                navigate("/projects");
              }
            }}
            disabled={!projectsPermission.canDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="h-full md:col-span-2 lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalhes e status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="backlog">Não Iniciado</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="bloqueada">Parado</SelectItem>
                        <SelectItem value="concluida" disabled={!projectsPermission.isAdminOrOwner}>
                          Concluído
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Select value={editForm.responsible_id} onValueChange={(v) => setEditForm({ ...editForm, responsible_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Sem responsável</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    <Select value={(editForm as any).client_id} onValueChange={(v) => setEditForm({ ...editForm, client_id: v } as any)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem cliente</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.company || c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Início</Label>
                    <Input type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label>Fim</Label>
                    <Input type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={5} />
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground mb-2 block">Status</Label>
                    <Select
                      value={project.status}
                      onValueChange={(v) => {
                        if (v === "concluida" && !projectsPermission.isAdminOrOwner) return;
                        if (v === "bloqueada") {
                          const reason = window.prompt(
                            "Motivo do projeto estar parado (opcional):",
                            String((project as any).metadata?.pause_reason ?? "")
                          );
                          update.mutate({ id: project.id, status: v, metadata: { ...((project as any).metadata || {}), pause_reason: reason || null } });
                          return;
                        }
                        if (v === "em_andamento") {
                          update.mutate({ id: project.id, status: v, metadata: { ...((project as any).metadata || {}), pause_reason: null } });
                          return;
                        }
                        if (v === "concluida") {
                          update.mutate({ id: project.id, status: v, end_date: project.end_date ?? new Date().toISOString().slice(0, 10) });
                          return;
                        }
                        update.mutate({ id: project.id, status: v });
                      }}
                      disabled={!projectsPermission.canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="backlog">Não Iniciado</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="bloqueada">Parado</SelectItem>
                        <SelectItem value="concluida" disabled={!projectsPermission.isAdminOrOwner}>
                          Concluído
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground mb-2 block">Prioridade</Label>
                    <Select value={project.priority || "media"} onValueChange={(v) => update.mutate({ id: project.id, priority: v as any })} disabled={!projectsPermission.canEdit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">Responsável</div>
                    <div className="text-sm font-medium mt-1">{responsibleName || "—"}</div>
                  </div>

                  <div className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">Cliente</div>
                    <div className="text-sm font-medium mt-1">{client?.company || client?.name || "—"}</div>
                  </div>

                  <div className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">Início</div>
                    <div className="text-sm font-medium mt-1">
                      {(project as any).start_date ? format(parseISO((project as any).start_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                    </div>
                  </div>

                  <div className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">Fim</div>
                    <div className="text-sm font-medium mt-1">{project.end_date ? format(parseISO(project.end_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</div>
                  </div>
                </div>

                {project.status === "bloqueada" && ((project as any).metadata?.pause_reason || (project as any).pause_reason) ? (
                  <div className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">Motivo</div>
                    <div className="text-sm mt-1 whitespace-pre-wrap">{String((project as any).metadata?.pause_reason || (project as any).pause_reason)}</div>
                  </div>
                ) : null}

                <div className="grid gap-4">
                  <div>
                    <Label className="text-muted-foreground">Descrição</Label>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{project.description || "Sem descrição."}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Observações</Label>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{(project as any).metadata?.notes || (project as any).notes || "Nenhuma observação."}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <DocumentsCard
          title="Documentos"
          folderValue={(() => {
            const meta = ((project as any).metadata ?? {}) as Record<string, unknown>;
            const raw = (meta.drive_folder ?? meta.drive_folder_url ?? meta.folder ?? meta.pasta ?? "") as string;
            const v = String(raw ?? "").trim();
            return v || driveFolders.projects || null;
          })()}
          canEdit={projectsPermission.canEdit}
          actionsDisplay="icons"
          limit={5}
        />
      </div>
      
      {/* Lista de Tarefas - Ocupa largura total abaixo */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="h-5 w-5" /> Tarefas
            </CardTitle>
            <Button size="sm" onClick={() => openTaskModal()} disabled={!projectsPermission.canCreate}>
                <Plus className="h-4 w-4 mr-1" /> Nova Tarefa
            </Button>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="list" className="w-full">
            <TabsList className="mb-4">
                <TabsTrigger value="list" className="gap-2"><LayoutList className="h-4 w-4"/> Lista</TabsTrigger>
                <TabsTrigger value="calendar" className="gap-2"><CalendarDays className="h-4 w-4"/> Calendário</TabsTrigger>
                <TabsTrigger value="gantt" className="gap-2"><GanttChart className="h-4 w-4"/> Gantt</TabsTrigger>
            </TabsList>
            
            <TabsContent value="list" className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={taskStatusFilter === "all" ? "secondary" : "outline"}
                      onClick={() => setTaskStatusFilter("all")}
                    >
                      Todas
                    </Button>
                    <Button
                      size="sm"
                      variant={taskStatusFilter === "backlog" ? "secondary" : "outline"}
                      onClick={() => setTaskStatusFilter("backlog")}
                    >
                      Não iniciado
                    </Button>
                    <Button
                      size="sm"
                      variant={taskStatusFilter === "em_andamento" ? "secondary" : "outline"}
                      onClick={() => setTaskStatusFilter("em_andamento")}
                    >
                      Em andamento
                    </Button>
                    <Button
                      size="sm"
                      variant={taskStatusFilter === "em_revisao" ? "secondary" : "outline"}
                      onClick={() => setTaskStatusFilter("em_revisao")}
                    >
                      Em revisão
                    </Button>
                    <Button
                      size="sm"
                      variant={taskStatusFilter === "bloqueada" ? "secondary" : "outline"}
                      onClick={() => setTaskStatusFilter("bloqueada")}
                    >
                      Parado
                    </Button>
                    <Button
                      size="sm"
                      variant={taskStatusFilter === "concluida" ? "secondary" : "outline"}
                      onClick={() => setTaskStatusFilter("concluida")}
                    >
                      Concluído
                    </Button>
                  </div>
                  <div className="w-full md:w-[320px]">
                    <Input
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder="Buscar tarefa..."
                    />
                  </div>
                </div>

                {tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>Nenhuma tarefa cadastrada.</p>
                    <Button variant="link" onClick={() => openTaskModal()} disabled={!projectsPermission.canCreate}>Criar primeira tarefa</Button>
                </div>
                ) : filteredTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <p>Nenhuma tarefa encontrada.</p>
                  <Button variant="link" onClick={() => { setTaskStatusFilter("all"); setTaskSearch(""); }}>
                    Limpar filtros
                  </Button>
                </div>
                ) : (
                <div className="space-y-2">
                    {filteredTasks.map((task) => (
                    <div
                        key={task.id}
                        className="flex flex-col p-3 border rounded-lg hover:bg-muted/50 transition-colors gap-2"
                    >
                        <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <input
                            type="checkbox"
                            checked={task.status === "concluida"}
                            onChange={(e) =>
                                updateTask.mutate({
                                id: task.id,
                                status: e.target.checked ? "concluida" : "em_andamento",
                                })
                            }
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mt-1"
                            disabled={!projectsPermission.canEdit}
                            />
                            <div className={task.status === "concluida" ? "line-through text-muted-foreground" : ""}>
                            <p
                              className={projectsPermission.canEdit ? "font-medium text-sm cursor-pointer hover:underline" : "font-medium text-sm"}
                              onClick={projectsPermission.canEdit ? () => openTaskModal(task) : undefined}
                            >
                              {task.title}
                            </p>
                            {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                            {(task.metadata as any)?.notes && <p className="text-xs text-amber-600 mt-0.5 italic">Obs: {(task.metadata as any).notes}</p>}
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => updateTask.mutate({ id: task.id, status: "bloqueada" })}
                              disabled={!projectsPermission.canEdit || task.status === "bloqueada" || task.status === "concluida"}
                              aria-label="Interromper tarefa"
                            >
                              <PauseCircle className="h-4 w-4" />
                            </Button>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                onClick={() => openTaskModal(task)}
                                disabled={!projectsPermission.canEdit}
                                aria-label="Alterar tarefa"
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  if (window.confirm("Cancelar esta tarefa?")) {
                                    removeTask.mutate(task.id);
                                  }
                                }}
                                disabled={!projectsPermission.canDelete}
                                aria-label="Cancelar tarefa"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pl-7 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5 capitalize">
                            {task.priority}
                        </Badge>
                        {task.assigned_to && (
                            <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {profiles.find((p) => p.id === task.assigned_to)?.full_name}
                            </span>
                        )}
                        {(task.start_date || task.end_date) && (
                            <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {task.start_date ? format(parseISO(task.start_date), "dd/MM") : "?"} 
                            {" - "}
                            {task.end_date ? format(parseISO(task.end_date), "dd/MM") : "?"}
                            </span>
                        )}
                        {task.estimated_hours && (
                            <span className="flex items-center gap-1">
                            <CheckSquare className="h-3 w-3" />
                            {task.estimated_hours}h est.
                            </span>
                        )}
                        {task.progress > 0 && (
                             <span className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{task.progress}%</span>
                                <Progress value={task.progress} className="h-1.5 w-16" />
                             </span>
                        )}
                        </div>
                    </div>
                    ))}
                </div>
                )}
            </TabsContent>

            <TabsContent value="calendar">
                <TaskCalendar tasks={tasks} />
            </TabsContent>

            <TabsContent value="gantt">
                <TaskGantt tasks={tasks} projectColor={project.color || (project as any).metadata?.color} />
            </TabsContent>
            </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
        <DialogContent className="max-w-[60vw] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Título *</Label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="O que precisa ser feito?"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                <Label>Responsável</Label>
                <Select
                  value={newTask.assigned_to || "unassigned"}
                  onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v === "unassigned" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Sem responsável</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select
                  value={newTask.priority}
                  onValueChange={(v) => setNewTask({ ...newTask, priority: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Início</Label>
                <Input 
                  type="date" 
                  value={newTask.start_date} 
                  onChange={(e) => setNewTask({ ...newTask, start_date: e.target.value })} 
                />
              </div>
              <div>
                <Label>Fim</Label>
                <Input 
                  type="date" 
                  value={newTask.end_date} 
                  onChange={(e) => setNewTask({ ...newTask, end_date: e.target.value })} 
                />
              </div>
              <div>
                 <Label>Estimativa (horas)</Label>
                 <Input 
                   type="number"
                   value={newTask.estimated_hours} 
                   onChange={(e) => setNewTask({ ...newTask, estimated_hours: e.target.value })} 
                 />
              </div>
               <div>
                 <Label>Status</Label>
                <Select
                  value={newTask.status}
                  onValueChange={(v) => setNewTask({ ...newTask, status: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="em_revisao">Em Revisão</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="bloqueada">Bloqueada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

               <div className="col-span-2">
                 <Label>Progresso (%)</Label>
                 <div className="flex items-center gap-4">
                     <div className="flex-1">
                         <Input
                           type="range"
                           min="0"
                           max="100"
                           step="5"
                           value={newTask.progress}
                           onChange={(e) => setNewTask({ ...newTask, progress: e.target.value })}
                           className="h-8"
                         />
                     </div>
                     <span className="w-12 text-center text-sm font-medium">{newTask.progress}%</span>
                 </div>
               </div>

               <div className="col-span-2">
                <Label>Descrição</Label>
                <Textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Detalhes da tarefa"
                  rows={4}
                />
              </div>

              <div className="col-span-2">
                 <Label>Observação</Label>
                 <Textarea
                   value={newTask.notes}
                   onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                   placeholder="Observações internas..."
                   rows={3}
                 />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTaskModalOpen(false)} disabled={createTask.isPending || updateTask.isPending}>Cancelar</Button>
            <Button 
              disabled={
                createTask.isPending ||
                updateTask.isPending ||
                (editingTask ? !projectsPermission.canEdit : !projectsPermission.canCreate)
              }
              onClick={() => {
                if (!newTask.title.trim()) return;
                
                const taskData = {
                  project_id: project.id,
                  organization_id: organizationId,
                  title: newTask.title,
                  description: newTask.description,
                  priority: newTask.priority,
                  assigned_to: newTask.assigned_to,
                  status: newTask.status,
                  start_date: newTask.start_date || null,
                  end_date: newTask.end_date || null,
                  estimated_hours: newTask.estimated_hours ? Number(newTask.estimated_hours) : null,
                  progress: newTask.progress ? Number(newTask.progress) : 0,
                  metadata: { notes: newTask.notes },
                };

                if (editingTask) {
                    updateTask.mutate({ id: editingTask.id, ...taskData }, {
                        onSuccess: () => {
                             setIsTaskModalOpen(false);
                             setEditingTask(null);
                        }
                    });
                } else {
                    createTask.mutate(taskData, {
                      onSuccess: () => {
                        setNewTask({ 
                          title: "", 
                          priority: "media", 
                          assigned_to: "", 
                          status: "backlog", 
                          description: "",
                          notes: "",
                          start_date: "",
                          end_date: "",
                          estimated_hours: "",
                          progress: "0",
                        });
                        setIsTaskModalOpen(false);
                      }
                    });
                }
            }}>
               {createTask.isPending || updateTask.isPending ? "Salvando..." : (editingTask ? "Atualizar Tarefa" : "Salvar Tarefa")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskCalendar({ tasks }: { tasks: any[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  
  const getDays = () => {
    switch (view) {
        case "month":
            return eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }) });
        case "week":
            return eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) });
        case "day":
            return [currentDate];
    }
  };

  const days = getDays();

  const handlePrev = () => {
      switch (view) {
          case "month": setCurrentDate(subMonths(currentDate, 1)); break;
          case "week": setCurrentDate(subWeeks(currentDate, 1)); break;
          case "day": setCurrentDate(subDays(currentDate, 1)); break;
      }
  };

  const handleNext = () => {
      switch (view) {
          case "month": setCurrentDate(addMonths(currentDate, 1)); break;
          case "week": setCurrentDate(addWeeks(currentDate, 1)); break;
          case "day": setCurrentDate(addDays(currentDate, 1)); break;
      }
  };

  const getTitle = () => {
      switch (view) {
          case "month": return format(currentDate, 'MMMM yyyy', { locale: ptBR });
          case "week": {
            const start = startOfWeek(currentDate, { locale: ptBR });
            const end = endOfWeek(currentDate, { locale: ptBR });
            return `${format(start, 'dd/MM')} - ${format(end, 'dd/MM/yyyy')}`;
          }
          case "day": return format(currentDate, "dd 'de' MMMM yyyy", { locale: ptBR });
      }
  };

  const tasksByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    tasks.forEach(task => {
        if (!task.end_date) return;
        let dateKey = "";
        try {
          dateKey = format(parseISO(task.end_date), "yyyy-MM-dd");
        } catch {
          dateKey = "";
        }
        if (!dateKey) return;
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey)?.push(task);
    });
    return map;
  }, [tasks]);

  return (
    <div className="space-y-4">
        <div className="flex items-center justify-between">
            <h3 className="font-medium capitalize">{getTitle()}</h3>
            <div className="flex gap-2 items-center">
                <Select value={view} onValueChange={(v) => setView(v as any)}>
                    <SelectTrigger className="w-[120px] h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="month">Mês</SelectItem>
                        <SelectItem value="week">Semana</SelectItem>
                        <SelectItem value="day">Dia</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={handlePrev} className="h-8 w-8 p-0"><ArrowLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={handleNext} className="h-8 w-8 p-0"><ArrowRight className="h-4 w-4" /></Button>
                </div>
            </div>
        </div>
        
        {view !== "day" && (
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
                <div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div><div>Dom</div>
            </div>
        )}

        <div className={`grid gap-1 ${view === "day" ? "grid-cols-1" : "grid-cols-7"}`}>
            {days.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayTasks = tasksByDay.get(dateKey) || [];
                const isToday = isSameDay(day, new Date());
                const muted = view === "month" && !isSameMonth(day, currentDate);
                
                return (
                    <div 
                        key={day.toString()} 
                        className={`border rounded p-2 text-xs ${view === "day" ? "min-h-[200px]" : "min-h-[100px]"} ${isToday ? "bg-accent/20 border-accent" : ""} ${muted ? "opacity-50" : ""}`}
                    >
                        <div className="font-medium mb-2 flex justify-between items-center">
                            <span>{format(day, 'd')} {view === "day" && format(day, 'EEEE', { locale: ptBR })}</span>
                            {dayTasks.length > 0 && <Badge variant="secondary" className="text-[10px] h-4">{dayTasks.length}</Badge>}
                        </div>
                        <div className="space-y-1">
                            {dayTasks.map(t => (
                                (() => {
                                  let due: Date | null = null;
                                  try {
                                    due = t.end_date ? parseISO(t.end_date) : null;
                                  } catch {
                                    due = null;
                                  }
                                  const overdue = !!due && due < todayStart && String(t.status ?? "") !== "concluida";
                                  return (
                                    <div
                                      key={t.id}
                                      className={`rounded px-2 py-1 truncate text-xs border flex items-center justify-between ${
                                        overdue
                                          ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-900/40"
                                          : "bg-primary/10 text-primary border-primary/20"
                                      }`}
                                      title={t.title}
                                    >
                                      <span className="truncate">{t.title}</span>
                                    </div>
                                  );
                                })()
                            ))}
                            {dayTasks.length === 0 && view === "day" && (
                                <p className="text-muted-foreground italic text-center mt-4">Nenhuma tarefa para este dia.</p>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    </div>
  );
}

function TaskGantt({ tasks, projectColor }: { tasks: any[], projectColor?: string }) {
    const validTasks = useMemo(() => tasks.filter(t => t.start_date && t.end_date).sort((a,b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()), [tasks]);

    if (validTasks.length === 0) return <p className="text-center py-8 text-muted-foreground">Adicione datas de início e fim às tarefas para visualizar o Gantt.</p>;

    const minDate = new Date(validTasks[0].start_date);
    const maxDate = new Date(validTasks.reduce((acc, t) => {
        const end = new Date(t.end_date);
        return end > acc ? end : acc;
    }, new Date(validTasks[0].end_date)));
    
    // Add buffer
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 5);

    const totalDays = differenceInCalendarDays(maxDate, minDate) + 1;
    
    return (
        <div className="overflow-x-auto border rounded-lg">
            <div className="min-w-[600px] p-4 space-y-2">
                <div className="flex text-xs text-muted-foreground border-b pb-2 mb-2">
                    <div className="w-48 shrink-0 font-medium">Tarefa</div>
                    <div className="flex-1 relative h-6">
                        <span className="absolute left-0">{format(minDate, 'dd/MM')}</span>
                        <span className="absolute right-0">{format(maxDate, 'dd/MM')}</span>
                    </div>
                </div>
                {validTasks.map(task => {
                    const start = new Date(task.start_date);
                    const end = new Date(task.end_date);
                    const offset = differenceInCalendarDays(start, minDate);
                    const duration = differenceInCalendarDays(end, start) + 1;
                    
                    const leftPct = (offset / totalDays) * 100;
                    const widthPct = (duration / totalDays) * 100;

                    return (
                        <div key={task.id} className="flex items-center text-sm gap-4">
                            <div className="w-48 shrink-0 truncate font-medium" title={task.title}>{task.title}</div>
                            <div className="flex-1 relative h-6 bg-muted/30 rounded">
                                <div 
                                    className="absolute h-full rounded border border-white/20 text-[10px] flex items-center px-2 text-white overflow-hidden whitespace-nowrap"
                                    style={{ 
                                        left: `${leftPct}%`, 
                                        width: `${widthPct}%`,
                                        backgroundColor: projectColor || "var(--primary)"
                                    }}
                                >
                                    {task.title}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
