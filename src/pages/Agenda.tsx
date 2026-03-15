import { useMemo, useState, Fragment } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useEvents, type EventRow } from "@/hooks/useEvents";
import { useTeams } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { useModulePermission } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Plus, Calendar, Loader2, ChevronLeft, ChevronRight, Pencil, 
  List, Filter, X, Search, Clock, MapPin, User, Users, Building
} from "lucide-react";
import { 
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, 
  addDays, addWeeks, addMonths, isSameDay, parseISO, 
  isWithinInterval, startOfDay, endOfDay 
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { cn } from "@/lib/utils";

const EVENT_TYPE_LABELS: Record<string, string> = {
  reuniao: "Reunião",
  ligacao: "Ligação",
  entrega: "Entrega",
  lembrete: "Lembrete",
  outro: "Outro",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  reuniao: "bg-blue-100 text-blue-700 border-blue-200",
  ligacao: "bg-green-100 text-green-700 border-green-200",
  entrega: "bg-purple-100 text-purple-700 border-purple-200",
  lembrete: "bg-amber-100 text-amber-700 border-amber-200",
  outro: "bg-gray-100 text-gray-700 border-gray-200",
};

type EventAppliedTo = "agency" | "team" | "collaborator";

export default function Agenda() {
  const orgId = useOrganization();
  const agendaPermission = useModulePermission("agenda");
  const { data: teams = [] } = useTeams(orgId);
  const { data: profiles = [] } = useProfiles(orgId);
  
  // Estados de visualização e filtros
  const [view, setView] = useState<"day" | "week" | "month" | "list">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showFilters, setShowFilters] = useState(false);
  const [grouping, setGrouping] = useState<"none" | "day" | "month" | "responsible" | "type">("none");
  
  // Filtros
  const [filters, setFilters] = useState({
    title: "",
    type: "all",
    responsible: "all",
    startDate: "",
    endDate: "",
  });

  const range = useMemo(() => {
    // Para a visualização em lista, buscamos um intervalo maior por padrão (mês atual)
    // a menos que o usuário defina filtros de data específicos.
    if (view === "list") {
      const start = filters.startDate ? parseISO(filters.startDate) : startOfMonth(currentDate);
      const end = filters.endDate ? parseISO(filters.endDate) : endOfMonth(currentDate);
      return { start, end };
    }

    if (view === "day") {
      const start = startOfDay(currentDate);
      const end = endOfDay(currentDate);
      return { start, end };
    }
    if (view === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      };
    }
    return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }, [view, currentDate, filters.startDate, filters.endDate]);

  const { data: events = [], isLoading, create, update, remove } = useEvents(orgId, range.start, range.end);
  
  // Aplicação dos filtros no lado do cliente (título, tipo, responsável)
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      // Filtro de Título
      if (filters.title && !ev.title.toLowerCase().includes(filters.title.toLowerCase())) {
        return false;
      }
      
      // Filtro de Tipo
      if (filters.type !== "all" && ev.type !== filters.type) {
        return false;
      }
      
      // Filtro de Responsável
      if (filters.responsible !== "all") {
        const [respType, respId] = filters.responsible.split(":");
        if (respType === "agency") {
          if (ev.team_id || ev.assigned_to) return false;
        } else if (respType === "team") {
          if (ev.team_id !== respId) return false;
        } else if (respType === "collaborator") {
          if (ev.assigned_to !== respId) return false;
        }
      }
      
      return true;
    });
  }, [events, filters]);

  // Agrupamento dos eventos para a visualização em lista
  const groupedEvents = useMemo(() => {
    if (view !== "list" || grouping === "none") return { "": filteredEvents };

    const groups: Record<string, EventRow[]> = {};

    filteredEvents.forEach((ev) => {
      let key = "";
      if (grouping === "day") {
        key = format(parseISO(ev.start_at), "dd/MM/yyyy (EEEE)", { locale: ptBR });
      } else if (grouping === "month") {
        key = format(parseISO(ev.start_at), "MMMM yyyy", { locale: ptBR });
      } else if (grouping === "responsible") {
        key = resolveResponsibleLabel(ev);
      } else if (grouping === "type") {
        key = EVENT_TYPE_LABELS[ev.type] || ev.type;
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(ev);
    });

    // Ordenar as chaves se for data
    if (grouping === "day" || grouping === "month") {
      const sortedKeys = Object.keys(groups).sort((a, b) => {
        const dateA = grouping === "day" 
          ? parseISO(groups[a][0].start_at) 
          : startOfMonth(parseISO(groups[a][0].start_at));
        const dateB = grouping === "day" 
          ? parseISO(groups[b][0].start_at) 
          : startOfMonth(parseISO(groups[b][0].start_at));
        return dateA.getTime() - dateB.getTime();
      });
      
      const sortedGroups: Record<string, EventRow[]> = {};
      sortedKeys.forEach(k => sortedGroups[k] = groups[k]);
      return sortedGroups;
    }

    return groups;
  }, [filteredEvents, view, grouping]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "reuniao",
    start_at: "",
    end_at: "",
    location: "",
    applied_to: (agendaPermission.isAdminOrOwner ? "agency" : "team") as EventAppliedTo,
    team_id: "none",
    assigned_to: "none",
  });

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

  const resolveResponsibleLabel = (ev: EventRow) => {
    const assignedTo = (ev as unknown as { assigned_to?: string | null }).assigned_to ?? null;
    const teamId = (ev as unknown as { team_id?: string | null }).team_id ?? null;
    if (assignedTo) return profileNameById.get(assignedTo) ?? "Colaborador";
    if (teamId) return teamNameById.get(teamId) ?? "Equipe";
    return "Agência";
  };

  const resolveResponsibleIcon = (ev: EventRow) => {
    const assignedTo = (ev as unknown as { assigned_to?: string | null }).assigned_to ?? null;
    const teamId = (ev as unknown as { team_id?: string | null }).team_id ?? null;
    if (assignedTo) return <User className="h-3 w-3 mr-1" />;
    if (teamId) return <Users className="h-3 w-3 mr-1" />;
    return <Building className="h-3 w-3 mr-1" />;
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

  const goPrev = () => {
    if (view === "day") setCurrentDate(addDays(currentDate, -1));
    else if (view === "week") setCurrentDate(addWeeks(currentDate, -1));
    else setCurrentDate(addMonths(currentDate, -1));
  };
  const goNext = () => {
    if (view === "day") setCurrentDate(addDays(currentDate, 1));
    else if (view === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };
  const goToday = () => setCurrentDate(new Date());

  const resetFilters = () => {
    setFilters({
      title: "",
      type: "all",
      responsible: "all",
      startDate: "",
      endDate: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const start = form.start_at ? new Date(form.start_at) : new Date();
      const end = form.end_at ? new Date(form.end_at) : new Date(start.getTime() + 3600000);
      applyTargetToFields();
      const delegation = toDelegationPayload();
      if (editingId) {
        await update.mutateAsync({
          id: editingId,
          title: form.title,
          description: form.description || null,
          type: form.type,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          location: form.location || null,
          ...delegation,
        });
      } else {
        await create.mutateAsync({
          title: form.title,
          description: form.description || null,
          type: form.type,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          location: form.location || null,
          ...delegation,
        });
      }
      setModalOpen(false);
      setEditingId(null);
      setForm({
        title: "",
        description: "",
        type: "reuniao",
        start_at: "",
        end_at: "",
        location: "",
        applied_to: agendaPermission.isAdminOrOwner ? "agency" : "team",
        team_id: "none",
        assigned_to: "none",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar evento";
      setSubmitError(msg);
      console.error("[Agenda] handleSubmit:", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (ev: EventRow) => {
    setEditingId(ev.id);
    const assignedTo = (ev as unknown as { assigned_to?: string | null }).assigned_to ?? null;
    const teamId = (ev as unknown as { team_id?: string | null }).team_id ?? null;
    const applied_to: EventAppliedTo = assignedTo ? "collaborator" : teamId ? "team" : "agency";
    setForm({
      title: ev.title,
      description: ev.description ?? "",
      type: ev.type,
      start_at: ev.start_at.slice(0, 16),
      end_at: ev.end_at ? ev.end_at.slice(0, 16) : "",
      location: ev.location ?? "",
      applied_to,
      team_id: teamId ?? "none",
      assigned_to: assignedTo ?? "none",
    });
    setModalOpen(true);
  };

  if (!orgId) {
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
          <h1 className="font-display text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Visualize e gerencie seus eventos e compromissos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className={cn(showFilters && "bg-muted")}>
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button onClick={() => setModalOpen(true)} disabled={!agendaPermission.canCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo evento
          </Button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card className="bg-muted/30">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center">
                <Search className="h-4 w-4 mr-2" />
                Filtrar Eventos
              </h3>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs">
                Limpar Filtros
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Título</Label>
                <Input 
                  placeholder="Buscar por título..." 
                  value={filters.title}
                  onChange={(e) => setFilters(f => ({ ...f, title: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={filters.type} onValueChange={(v) => setFilters(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Responsável</Label>
                <Select value={filters.responsible} onValueChange={(v) => setFilters(f => ({ ...f, responsible: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="agency:all">Agência (Geral)</SelectItem>
                    <SelectContent>
                      <Label className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Equipes</Label>
                      {teams.map(t => (
                        <SelectItem key={t.id} value={`team:${t.id}`}>{t.name}</SelectItem>
                      ))}
                      <Label className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase mt-2">Colaboradores</Label>
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={`collaborator:${p.id}`}>{p.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Inicial</Label>
                <Input 
                  type="date" 
                  value={filters.startDate}
                  onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Final</Label>
                <Input 
                  type="date" 
                  value={filters.endDate}
                  onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar calendário */}
      <Card>
        <CardContent className="flex flex-wrap gap-2 items-center justify-between p-4">
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <>
                <Button variant="ghost" size="icon" onClick={goPrev} aria-label="Anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-[140px] text-sm font-medium">
                  {view === "month" && format(currentDate, "MMMM yyyy", { locale: ptBR })}
                  {view === "week" && `${format(range.start, "dd/MM", { locale: ptBR })} – ${format(range.end, "dd/MM", { locale: ptBR })}`}
                  {view === "day" && format(currentDate, "dd 'de' MMMM yyyy", { locale: ptBR })}
                </div>
                <Button variant="ghost" size="icon" onClick={goNext} aria-label="Próximo">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToday}>Hoje</Button>
              </>
            )}
            {view === "list" && (
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <List className="h-4 w-4 text-primary" />
                  Lista de Eventos
                  <Badge variant="secondary" className="ml-1">
                    {filteredEvents.length} encontrados
                  </Badge>
                </div>
                <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1">Agrupar por:</span>
                  <Button 
                    size="sm" 
                    variant={grouping === "none" ? "secondary" : "ghost"} 
                    className="h-7 text-[11px] px-2"
                    onClick={() => setGrouping("none")}
                  >
                    Nenhum
                  </Button>
                  <Button 
                    size="sm" 
                    variant={grouping === "day" ? "secondary" : "ghost"} 
                    className="h-7 text-[11px] px-2"
                    onClick={() => setGrouping("day")}
                  >
                    Dia
                  </Button>
                  <Button 
                    size="sm" 
                    variant={grouping === "month" ? "secondary" : "ghost"} 
                    className="h-7 text-[11px] px-2"
                    onClick={() => setGrouping("month")}
                  >
                    Mês
                  </Button>
                  <Button 
                    size="sm" 
                    variant={grouping === "responsible" ? "secondary" : "ghost"} 
                    className="h-7 text-[11px] px-2"
                    onClick={() => setGrouping("responsible")}
                  >
                    Responsável
                  </Button>
                  <Button 
                    size="sm" 
                    variant={grouping === "type" ? "secondary" : "ghost"} 
                    className="h-7 text-[11px] px-2"
                    onClick={() => setGrouping("type")}
                  >
                    Tipo
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={view === "day" ? "default" : "outline"} onClick={() => setView("day")}>
              Dia
            </Button>
            <Button size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>
              Semana
            </Button>
            <Button size="sm" variant={view === "month" ? "default" : "outline"} onClick={() => setView("month")}>
              Mês
            </Button>
            <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")} className="gap-2">
              <List className="h-4 w-4" />
              Lista
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando eventos...
        </div>
      ) : (
        <>
          {view === "month" && (
            <Card>
              <CardContent className="p-3">
                <DayPicker
                  locale={ptBR}
                  weekStartsOn={1}
                  month={currentDate}
                  onMonthChange={setCurrentDate}
                  onDayClick={(d) => {
                    setCurrentDate(d);
                    setView("day");
                  }}
                  modifiers={{
                    event: [...new Set(filteredEvents.map((e) => format(new Date(e.start_at), "yyyy-MM-dd")))].map((s) =>
                      parseISO(s)
                    ),
                  }}
                  modifiersClassNames={{
                    event:
                      "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-primary",
                  }}
                />
              </CardContent>
            </Card>
          )}

          {view === "week" && (
            <Card>
              <CardContent className="p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-2">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const day = addDays(range.start, i);
                    const dayEvents = filteredEvents
                      .filter((e) => isSameDay(new Date(e.start_at), day))
                      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
                    return (
                      <div key={i} className="border rounded-md p-2 bg-card flex flex-col min-h-[120px]">
                        <div className={cn(
                          "text-sm font-medium mb-2 pb-1 border-b flex justify-between",
                          isSameDay(day, new Date()) && "text-primary border-primary/30"
                        )}>
                          <span>{format(day, "EEE", { locale: ptBR })}</span>
                          <span>{format(day, "dd/MM", { locale: ptBR })}</span>
                        </div>
                        <div className="space-y-2 flex-1">
                          {dayEvents.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic">Sem eventos</p>
                          ) : (
                            dayEvents.map((ev) => (
                              <div 
                                key={ev.id} 
                                className="rounded border p-2 text-left hover:bg-muted/50 transition-colors cursor-pointer group"
                                onClick={() => openEdit(ev)}
                              >
                                <p className="text-[11px] font-bold truncate group-hover:text-primary transition-colors">{ev.title}</p>
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Clock className="h-2.5 w-2.5" />
                                  {format(new Date(ev.start_at), "HH:mm")}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-4 uppercase", EVENT_TYPE_COLORS[ev.type])}>
                                    {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                                  </Badge>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {view === "day" && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6 pb-2 border-b">
                  <h3 className="text-lg font-bold">
                    {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <Badge variant="outline">{filteredEvents.filter(e => isSameDay(new Date(e.start_at), currentDate)).length} eventos</Badge>
                </div>
                <div className="space-y-4">
                  {filteredEvents
                    .filter((e) => isSameDay(new Date(e.start_at), currentDate))
                    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                    .map((ev) => (
                      <div key={ev.id} className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/50 transition-all bg-card shadow-sm">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className={cn("text-[10px] uppercase font-bold", EVENT_TYPE_COLORS[ev.type])}>
                              {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                            </Badge>
                            <p className="font-bold text-lg">{ev.title}</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-2 text-primary" />
                              {format(new Date(ev.start_at), "HH:mm")}
                              {ev.end_at ? ` – ${format(new Date(ev.end_at), "HH:mm")}` : ""}
                            </div>
                            {ev.location && (
                              <div className="flex items-center">
                                <MapPin className="h-4 w-4 mr-2 text-primary" />
                                {ev.location}
                              </div>
                            )}
                            <div className="flex items-center">
                              <span className="text-primary mr-2">{resolveResponsibleIcon(ev)}</span>
                              {resolveResponsibleLabel(ev)}
                            </div>
                          </div>
                          {ev.description && <p className="text-sm mt-2 p-2 bg-muted/50 rounded border-l-2 border-primary italic">{ev.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 border-t pt-4 sm:border-t-0 sm:pt-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(ev)}
                            disabled={!agendaPermission.canEdit}
                            className="h-9"
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => { if(window.confirm("Deseja excluir este evento?")) remove.mutate(ev.id); }} 
                            disabled={!agendaPermission.canDelete}
                            className="h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            Excluir
                          </Button>
                        </div>
                      </div>
                    ))}
                  {filteredEvents.filter((e) => isSameDay(new Date(e.start_at), currentDate)).length === 0 && (
                    <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
                      <Calendar className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-muted-foreground">Sem eventos para este dia.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {view === "list" && (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[120px]">Data</TableHead>
                      <TableHead className="w-[100px]">Horário</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead className="w-[120px]">Tipo</TableHead>
                      <TableHead className="w-[180px]">Responsável</TableHead>
                      <TableHead className="w-[150px]">Local</TableHead>
                      <TableHead className="text-right w-[150px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          Nenhum evento encontrado para os filtros aplicados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      Object.entries(groupedEvents).map(([groupName, groupEvents]) => (
                        <Fragment key={groupName}>
                          {groupName && (
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={7} className="py-2 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">{groupName}</span>
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">{groupEvents.length}</Badge>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                          {groupEvents
                            .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                            .map((ev) => (
                              <TableRow key={ev.id} className="group hover:bg-muted/30 transition-colors">
                                <TableCell className="font-medium whitespace-nowrap">
                                  {format(new Date(ev.start_at), "dd/MM/yyyy")}
                                </TableCell>
                                <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                                  {format(new Date(ev.start_at), "HH:mm")}
                                  {ev.end_at ? ` – ${format(new Date(ev.end_at), "HH:mm")}` : ""}
                                </TableCell>
                                <TableCell>
                                  <div className="font-bold">{ev.title}</div>
                                  {ev.description && <div className="text-xs text-muted-foreground truncate max-w-[300px]" title={ev.description}>{ev.description}</div>}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn("text-[10px] uppercase", EVENT_TYPE_COLORS[ev.type])}>
                                    {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">
                                  <div className="flex items-center">
                                    {resolveResponsibleIcon(ev)}
                                    {resolveResponsibleLabel(ev)}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">
                                  {ev.location || "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-blue-600"
                                      onClick={() => openEdit(ev)}
                                      disabled={!agendaPermission.canEdit}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => { if(window.confirm("Deseja excluir este evento?")) remove.mutate(ev.id); }}
                                      disabled={!agendaPermission.canDelete}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                        </Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) { setSubmitError(null); setEditingId(null);} }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar evento" : "Novo evento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título do Evento</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Reunião com cliente"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Local (opcional)</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Ex: Sala 1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-2">
                <Label>Aplicado a</Label>
                <Select
                  value={form.applied_to}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, applied_to: v as EventAppliedTo, team_id: "none", assigned_to: "none" }))
                  }
                >
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {agendaPermission.isAdminOrOwner && <SelectItem value="agency">Agência (Geral)</SelectItem>}
                    <SelectItem value="team">Equipe</SelectItem>
                    <SelectItem value="collaborator">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{form.applied_to === "team" ? "Equipe" : form.applied_to === "collaborator" ? "Responsável" : "Atribuição"}</Label>
                <Select
                  disabled={!(form.applied_to === "team" || form.applied_to === "collaborator")}
                  value={form.applied_to === "team" ? form.team_id : form.assigned_to}
                  onValueChange={(v) => setForm((f) => (form.applied_to === "team" ? { ...f, team_id: v } : { ...f, assigned_to: v }))}
                >
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {form.applied_to === "team" &&
                      teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    {form.applied_to === "collaborator" &&
                      profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Detalhes do evento"
              />
            </div>
            <DialogFooter className="pt-4 border-t">
              {submitError && (
                <div className="col-span-full bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2 rounded-md mb-2">
                  {submitError}
                </div>
              )}
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="min-w-[100px]"
                disabled={
                  (editingId ? !agendaPermission.canEdit : !agendaPermission.canCreate) ||
                  submitting ||
                  create.isPending ||
                  update.isPending
                }
              >
                {(submitting || create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Salvar Alterações" : "Criar Evento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
