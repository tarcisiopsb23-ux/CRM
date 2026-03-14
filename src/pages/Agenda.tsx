import { useMemo, useState } from "react";
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
import { Plus, Calendar, Loader2, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

const EVENT_TYPE_LABELS: Record<string, string> = {
  reuniao: "Reunião",
  ligacao: "Ligação",
  entrega: "Entrega",
  lembrete: "Lembrete",
  outro: "Outro",
};

type EventAppliedTo = "agency" | "team" | "collaborator";

export default function Agenda() {
  const orgId = useOrganization();
  const agendaPermission = useModulePermission("agenda");
  const { data: teams = [] } = useTeams(orgId);
  const { data: profiles = [] } = useProfiles(orgId);
  const [view, setView] = useState<"day" | "week" | "month">("month");
  const [currentDate, setCurrentDate] = useState(new Date());

  const range = useMemo(() => {
    if (view === "day") {
      const start = new Date(currentDate);
      const end = new Date(currentDate);
      return { start, end };
    }
    if (view === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      };
    }
    return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }, [view, currentDate]);

  const { data: events = [], isLoading, create, update, remove } = useEvents(orgId, range.start, range.end);
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
            Eventos e compromissos. Integração Google Calendar em desenvolvimento.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} disabled={!agendaPermission.canCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo evento
        </Button>
      </div>

      {/* Toolbar calendário */}
      <Card>
        <CardContent className="flex flex-wrap gap-2 items-center justify-between p-4">
          <div className="flex items-center gap-2">
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
                    event: [...new Set(events.map((e) => format(new Date(e.start_at), "yyyy-MM-dd")))].map((s) =>
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
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const day = addDays(range.start, i);
                    const dayEvents = events
                      .filter((e) => isSameDay(new Date(e.start_at), day))
                      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
                    return (
                      <div key={i} className="border rounded-md p-2 bg-card">
                        <div className="text-sm font-medium mb-2">
                          {format(day, "EEE dd/MM", { locale: ptBR })}
                        </div>
                        <div className="space-y-2">
                          {dayEvents.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sem eventos</p>
                          ) : (
                            dayEvents.map((ev) => (
                              <div key={ev.id} className="rounded border p-2">
                                <p className="text-xs font-medium truncate">{ev.title}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {format(new Date(ev.start_at), "HH:mm", { locale: ptBR })}
                                  {ev.end_at ? ` – ${format(new Date(ev.end_at), "HH:mm", { locale: ptBR })}` : ""}
                                </p>
                                <div className="flex items-center justify-between mt-1">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px]">
                                    {resolveResponsibleLabel(ev)}
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
              <CardContent className="p-3">
                <div className="mb-2 text-sm font-medium">
                  {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </div>
                <div className="space-y-2">
                  {events
                    .filter((e) => isSameDay(new Date(e.start_at), currentDate))
                    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                    .map((ev) => (
                      <div key={ev.id} className="rounded border p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{ev.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(ev.start_at), "HH:mm", { locale: ptBR })}
                            {ev.end_at ? ` – ${format(new Date(ev.end_at), "HH:mm", { locale: ptBR })}` : ""}
                          </p>
                          {ev.location && <p className="text-xs text-muted-foreground mt-1">{ev.location}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{resolveResponsibleLabel(ev)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
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
                            }}
                            disabled={!agendaPermission.canEdit}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => remove.mutate(ev.id)} disabled={!agendaPermission.canDelete}>
                            Excluir
                          </Button>
                        </div>
                      </div>
                    ))}
                  {events.filter((e) => isSameDay(new Date(e.start_at), currentDate)).length === 0 && (
                    <div className="text-sm text-muted-foreground">Sem eventos.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) { setSubmitError(null); setEditingId(null);} }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar evento" : "Novo evento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Reunião com cliente"
                required
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                />
              </div>
              <div>
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Aplicada a</Label>
                <Select
                  value={form.applied_to}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, applied_to: v as EventAppliedTo, team_id: "none", assigned_to: "none" }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {agendaPermission.isAdminOrOwner && <SelectItem value="agency">Agência</SelectItem>}
                    <SelectItem value="team">Equipe</SelectItem>
                    <SelectItem value="collaborator">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{form.applied_to === "team" ? "Equipe" : form.applied_to === "collaborator" ? "Responsável" : " "}</Label>
                <Select
                  disabled={!(form.applied_to === "team" || form.applied_to === "collaborator")}
                  value={form.applied_to === "team" ? form.team_id : form.assigned_to}
                  onValueChange={(v) => setForm((f) => (form.applied_to === "team" ? { ...f, team_id: v } : { ...f, assigned_to: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {form.applied_to === "team" &&
                      teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    {form.applied_to === "collaborator" &&
                      profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Local (opcional)</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Ex: Sala 1"
              />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Detalhes do evento"
              />
            </div>
            <DialogFooter>
              {submitError && (
                <div className="col-span-full bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2 rounded-md">
                  {submitError}
                </div>
              )}
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  (editingId ? !agendaPermission.canEdit : !agendaPermission.canCreate) ||
                  submitting ||
                  create.isPending ||
                  update.isPending
                }
              >
                {(submitting || create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
