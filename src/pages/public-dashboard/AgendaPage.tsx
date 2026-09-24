/**
 * AgendaPage — Página principal do módulo Agenda no C8 Control.
 *
 * Exibe calendário mensal + lista de agendamentos do dia selecionado.
 * Permite criar, confirmar, cancelar e marcar como concluído.
 */

import { useState, useMemo } from "react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths, parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, Loader2, CalendarDays,
  Clock, User, Phone, CheckCircle2, XCircle, AlertCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useAppointments, useAvailableSlots, type Appointment, type AppointmentInput } from "@/hooks/useAppointments";
import { useScheduleConfig } from "@/hooks/useScheduleConfig";
import { useScheduleProfessionals } from "@/hooks/useScheduleProfessionals";
import { PageHeader } from "./components/PageHeader";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:   { label: "Pendente",   className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  confirmed: { label: "Confirmado", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "Cancelado",  className: "bg-red-500/15 text-red-400 border-red-500/30" },
  completed: { label: "Concluído",  className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  no_show:   { label: "Não veio",   className: "bg-muted/40 text-muted-foreground border-border" },
} as const;

function formatTime(iso: string) {
  return format(parseISO(iso), "HH:mm");
}

// ─── Formulário de novo agendamento ──────────────────────────────────────────

interface AppointmentFormProps {
  clientId: string;
  initialDate: Date;
  services: ReturnType<typeof useScheduleConfig>["services"];
  onSave: (input: AppointmentInput) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function AppointmentForm({ clientId, initialDate, services, onSave, onCancel, saving }: AppointmentFormProps) {
  const [name,           setName]           = useState("");
  const [phone,          setPhone]          = useState("");
  const [email,          setEmail]          = useState("");
  const [serviceId,      setServiceId]      = useState(services[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState("");
  const [date,           setDate]           = useState(format(initialDate, "yyyy-MM-dd"));
  const [slotStart,      setSlotStart]      = useState("");
  const [notes,          setNotes]          = useState("");

  const { professionals } = useScheduleProfessionals();

  const selectedService = services.find((s) => s.id === serviceId);
  const { data: slotsData, isLoading: slotsLoading } = useAvailableSlots(
    clientId,
    date ? new Date(date + "T12:00:00") : null,
    serviceId || null
  );

  const availableSlots = (slotsData?.slots ?? []).filter((s) => s.available);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slotStart) {
      toast.error("Preencha nome e horário.");
      return;
    }
    const slot = slotsData?.slots.find((s) => s.start_at === slotStart);
    if (!slot) { toast.error("Horário inválido."); return; }

    await onSave({
      customer_name:    name.trim(),
      customer_phone:   phone.trim() || null,
      customer_email:   email.trim() || null,
      service_id:       serviceId || null,
      service_name:     selectedService?.name ?? "Consulta",
      professional_id:  professionalId || null,
      professional_name: professionals.find(p => p.id === professionalId)?.name ?? null,
      start_at:         slot.start_at,
      end_at:           slot.end_at,
      notes:            notes.trim() || null,
      source:           "manual",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="grid gap-2">
        <Label>Nome do cliente <span className="text-destructive">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>Telefone/WhatsApp</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
        </div>
        <div className="grid gap-2">
          <Label>E-mail</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
        </div>
      </div>
      {services.length > 0 && (
        <div className="grid gap-2">
          <Label>Serviço</Label>
          <Select value={serviceId} onValueChange={setServiceId}>
            <SelectTrigger><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {s.duration_min}min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {professionals.length > 0 && (
        <div className="grid gap-2">
          <Label>Profissional <span className="text-xs text-muted-foreground">(opcional)</span></Label>
          <Select value={professionalId} onValueChange={setProfessionalId}>
            <SelectTrigger><SelectValue placeholder="Qualquer profissional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Qualquer profissional</SelectItem>
              {professionals.filter(p => p.active).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.role ? ` — ${p.role}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>Data <span className="text-destructive">*</span></Label>
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlotStart(""); }} />
        </div>
        <div className="grid gap-2">
          <Label>Horário <span className="text-destructive">*</span></Label>
          {slotsLoading ? (
            <div className="flex items-center gap-2 h-9 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : availableSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">Sem horários disponíveis neste dia.</p>
          ) : (
            <Select value={slotStart} onValueChange={setSlotStart}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {availableSlots.map((s) => (
                  <SelectItem key={s.start_at} value={s.start_at}>
                    {formatTime(s.start_at)} – {formatTime(s.end_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Observações</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Informações adicionais..." />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving || !slotStart} className="bg-gradient-ember text-primary-foreground shadow-glow">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Agendar
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Calendário ───────────────────────────────────────────────────────────────

function MonthCalendar({
  currentMonth,
  selectedDate,
  appointments,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  currentMonth: Date;
  selectedDate: Date;
  appointments: Appointment[];
  onSelectDate: (d: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
  const end   = endOfWeek(endOfMonth(currentMonth),     { weekStartsOn: 0 });
  const days: Date[] = [];
  let cur = start;
  while (cur <= end) { days.push(cur); cur = addDays(cur, 1); }

  const countByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of appointments) {
      if (a.status === "cancelled") continue;
      const key = format(parseISO(a.start_at), "yyyy-MM-dd");
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [appointments]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={onPrevMonth} className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </p>
        <button onClick={onNextMonth} className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Dias da semana */}
      <div className="grid grid-cols-7 border-b border-border">
        {["D","S","T","Q","Q","S","S"].map((d, i) => (
          <div key={i} className="py-2 text-center text-[10px] font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Dias */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key     = format(day, "yyyy-MM-dd");
          const count   = countByDay[key] ?? 0;
          const inMonth = isSameMonth(day, currentMonth);
          const sel     = isSameDay(day, selectedDate);
          const today   = isToday(day);

          return (
            <button
              key={i}
              onClick={() => onSelectDate(day)}
              className={cn(
                "relative flex flex-col items-center justify-center py-2 text-sm transition-colors",
                "hover:bg-muted/50",
                !inMonth && "opacity-30",
                sel   && "bg-primary/15 font-bold text-primary",
                today && !sel && "font-bold text-primary"
              )}
            >
              <span>{format(day, "d")}</span>
              {count > 0 && (
                <span className={cn(
                  "mt-0.5 h-1.5 w-1.5 rounded-full",
                  sel ? "bg-primary" : "bg-emerald-500"
                )} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card de agendamento ──────────────────────────────────────────────────────

function AppointmentCard({
  appt, canEdit,
  onConfirm, onComplete, onCancel,
}: {
  appt: Appointment;
  canEdit: boolean;
  onConfirm: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (appt: Appointment) => void;
}) {
  const cfg = STATUS_CONFIG[appt.status];

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold text-foreground">
              {formatTime(appt.start_at)} – {formatTime(appt.end_at)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm text-foreground truncate">{appt.customer_name}</span>
          </div>
          {appt.customer_phone && (
            <div className="flex items-center gap-2 mt-0.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{appt.customer_phone}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs text-muted-foreground">{appt.service_name}</p>
            {appt.professional_name && (
              <span className="text-xs text-muted-foreground">· {appt.professional_name}</span>
            )}
          </div>
        </div>
        <Badge variant="outline" className={cn("text-[11px] shrink-0", cfg.className)}>
          {cfg.label}
        </Badge>
      </div>

      {canEdit && appt.status !== "cancelled" && appt.status !== "completed" && (
        <div className="flex gap-1.5 pt-1">
          {appt.status === "pending" && (
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => onConfirm(appt.id)}>
              <CheckCircle2 className="h-3 w-3" /> Confirmar
            </Button>
          )}
          {(appt.status === "confirmed" || appt.status === "pending") && (
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
              onClick={() => onComplete(appt.id)}>
              Concluir
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive"
            onClick={() => onCancel(appt)}>
            <XCircle className="h-3 w-3 mr-1" /> Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function AgendaPage() {
  const { auth } = useClientAuth();
  const clientId = auth?.id ?? "";
  const userRole = auth?.user?.role ?? "viewer";
  const canEdit  = ["owner","admin","manager","member"].includes(userRole);

  const [currentMonth,  setCurrentMonth]  = useState(new Date());
  const [selectedDate,  setSelectedDate]  = useState(new Date());
  const [newOpen,       setNewOpen]       = useState(false);
  const [cancelTarget,  setCancelTarget]  = useState<Appointment | null>(null);
  const [cancelReason,  setCancelReason]  = useState("");

  const dateFrom = startOfMonth(subMonths(currentMonth, 0));
  const dateTo   = endOfMonth(addMonths(currentMonth, 1));

  const { appointments, isLoading, refetch, upsert, cancel, confirm, complete } =
    useAppointments({ dateFrom, dateTo });
  const { services } = useScheduleConfig();

  // Filtra agendamentos do dia selecionado
  const dayAppointments = useMemo(() => {
    const key = format(selectedDate, "yyyy-MM-dd");
    return appointments
      .filter((a) => format(parseISO(a.start_at), "yyyy-MM-dd") === key)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  }, [appointments, selectedDate]);

  const handleSave = async (input: AppointmentInput) => {
    try {
      await upsert.mutateAsync(input);
      toast.success("Agendamento criado!");
      setNewOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar agendamento.");
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancel.mutateAsync({ id: cancelTarget.id, reason: cancelReason || undefined });
      toast.success("Agendamento cancelado.");
      setCancelTarget(null);
      setCancelReason("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar.");
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Agenda"
        description={`${appointments.filter((a) => a.status !== "cancelled").length} agendamento(s) no período`}
        action={canEdit ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="border-border gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button onClick={() => setNewOpen(true)} className="bg-gradient-ember text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4 mr-1" /> Novo Agendamento
            </Button>
          </div>
        ) : undefined}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Calendário */}
          <div className="space-y-4">
            <MonthCalendar
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              appointments={appointments}
              onSelectDate={setSelectedDate}
              onPrevMonth={() => setCurrentMonth((m) => subMonths(m, 1))}
              onNextMonth={() => setCurrentMonth((m) => addMonths(m, 1))}
            />
            <p className="text-xs text-muted-foreground text-center">
              ● = agendamentos no dia
            </p>
          </div>

          {/* Lista do dia */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold capitalize">
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </h2>
              <Badge variant="secondary" className="text-xs">{dayAppointments.length}</Badge>
            </div>

            {dayAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center rounded-xl border border-dashed border-border">
                <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nenhum agendamento neste dia.</p>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Agendar
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {dayAppointments.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appt={a}
                    canEdit={canEdit}
                    onConfirm={(id) => confirm.mutate(id)}
                    onComplete={(id) => complete.mutate(id)}
                    onCancel={setCancelTarget}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog: novo agendamento */}
      <Dialog open={newOpen} onOpenChange={(o) => { if (!o) setNewOpen(false); }}>
        <DialogContent className="border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Novo Agendamento</DialogTitle>
          </DialogHeader>
          <AppointmentForm
            clientId={clientId}
            initialDate={selectedDate}
            services={services}
            onSave={handleSave}
            onCancel={() => setNewOpen(false)}
            saving={upsert.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog: cancelar */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(""); } }}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Cancelar agendamento de <strong className="text-foreground">{cancelTarget?.customer_name}</strong> às{" "}
              {cancelTarget && formatTime(cancelTarget.start_at)}?
            </p>
            <div className="grid gap-2">
              <Label>Motivo (opcional)</Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Cliente solicitou remarcação"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelTarget(null); setCancelReason(""); }}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancel.isPending}>
              {cancel.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancelar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
