import { useMemo, useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { useEvents, type EventRow } from "@/hooks/useEvents";
import { useTeams } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { useModulePermission } from "@/hooks/usePermissions";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { 
  Plus, Calendar, Loader2, ChevronLeft, ChevronRight, Pencil, Trash2,
  List, Filter, X, Search, Clock, MapPin, User, Users, Building, Info, CalendarSearch
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import { useN8nConfig } from "@/hooks/useN8nConfig";
import { 
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, 
  addDays, addWeeks, addMonths, isSameDay, parseISO, 
  isWithinInterval, startOfDay, endOfDay, getDay
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
  captacao: "Captação",
  reuniao_integracao: "Reunião de Integração",
  reuniao_planejamento: "Reunião de Planejamento",
  reuniao_periodica: "Reunião Periódica",
  apresentacao_proposta: "Apresentação de Proposta",
  outro: "Outro",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  reuniao: "bg-blue-100 text-blue-700 border-blue-200",
  ligacao: "bg-green-100 text-green-700 border-green-200",
  entrega: "bg-purple-100 text-purple-700 border-purple-200",
  lembrete: "bg-amber-100 text-amber-700 border-amber-200",
  captacao: "bg-emerald-100 text-emerald-700 border-emerald-200",
  reuniao_integracao: "bg-cyan-100 text-cyan-700 border-cyan-200",
  reuniao_planejamento: "bg-indigo-100 text-indigo-700 border-indigo-200",
  reuniao_periodica: "bg-violet-100 text-violet-700 border-violet-200",
  apresentacao_proposta: "bg-rose-100 text-rose-700 border-rose-200",
  outro: "bg-gray-100 text-gray-700 border-gray-200",
};

const EVENT_CARD_COLORS: Record<string, string> = {
  reuniao: "bg-blue-50 border-blue-200 hover:bg-blue-100/60",
  ligacao: "bg-green-50 border-green-200 hover:bg-green-100/60",
  entrega: "bg-purple-50 border-purple-200 hover:bg-purple-100/60",
  lembrete: "bg-amber-50 border-amber-200 hover:bg-amber-100/60",
  captacao: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100/60",
  reuniao_integracao: "bg-cyan-50 border-cyan-200 hover:bg-cyan-100/60",
  reuniao_planejamento: "bg-indigo-50 border-indigo-200 hover:bg-indigo-100/60",
  reuniao_periodica: "bg-violet-50 border-violet-200 hover:bg-violet-100/60",
  apresentacao_proposta: "bg-rose-50 border-rose-200 hover:bg-rose-100/60",
  outro: "bg-gray-50 border-gray-200 hover:bg-gray-100/60",
};

// Cores hex para envio ao webhook (Google Calendar / ClickUp)
const EVENT_TYPE_HEX: Record<string, string> = {
  reuniao:              "#3b82f6", // blue-500
  ligacao:              "#22c55e", // green-500
  entrega:              "#a855f7", // purple-500
  lembrete:             "#f59e0b", // amber-500
  captacao:             "#10b981", // emerald-500
  reuniao_integracao:   "#06b6d4", // cyan-500
  reuniao_planejamento: "#6366f1", // indigo-500
  reuniao_periodica:    "#8b5cf6", // violet-500
  apresentacao_proposta:"#f43f5e", // rose-500
  outro:                "#6b7280", // gray-500
};

type EventAppliedTo = "agency" | "team" | "collaborator";

export default function Agenda() {
  const orgId = useOrganization();
  const { pinProps, requirePin } = usePinConfirm();
  const agendaPermission = useModulePermission("agenda");
  const { data: teams = [] } = useTeams(orgId);
  const { data: profiles = [] } = useProfiles(orgId);
  const qc = useQueryClient();
  const n8nConfig = useN8nConfig(orgId);

  // Dispara webhook do Google Calendar diretamente com escopo de série
  const fireCalendarWebhookDirect = (
    _orgId: string | undefined,
    action: "create" | "update" | "delete",
    event: EventRow,
    gcalScope: "this_only" | "this_and_following" | "all",
    parentGcalEventId?: string | null
  ) => {
    const url = n8nConfig?.calendarWebhookUrl?.trim();
    if (!url) return;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        event: { ...event, gcal_event_id: event.gcal_event_id ?? parentGcalEventId },
        gcal_scope: gcalScope,
      }),
    }).catch(() => {});
  };

  // Estados de visualização e filtros
  const [view, setView] = useState<"day" | "week" | "month" | "year" | "list">("month");
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
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      };
    }
    if (view === "year") {
      return {
        start: new Date(currentDate.getFullYear(), 0, 1),
        end: new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59),
      };
    }
    return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }, [view, currentDate, filters.startDate, filters.endDate]);

  const { data: events = [], isLoading, create, update, remove, removeWithScope, updateWithScope } = useEvents(orgId, range.start, range.end);
  
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
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [findTimeOpen, setFindTimeOpen] = useState(false);
  const [findTimeView, setFindTimeView] = useState<"day" | "week">("day");
  const [findTimeDate, setFindTimeDate] = useState(new Date());
  const [recurrenceDialogOpen, setRecurrenceDialogOpen] = useState(false);

  // Dialogs de série recorrente
  const [editSeriesDialog, setEditSeriesDialog] = useState<{ open: boolean; event: EventRow | null }>({ open: false, event: null });
  const [deleteSeriesDialog, setDeleteSeriesDialog] = useState<{ open: boolean; event: EventRow | null }>({ open: false, event: null });
  // Payload pendente para quando o usuário escolhe "este / todos" ao salvar
  const [pendingEditPayload, setPendingEditPayload] = useState<Record<string, unknown> | null>(null);
  const [customRecurrence, setCustomRecurrence] = useState({
    interval: 1,
    unit: "weekly" as "daily" | "weekly" | "monthly" | "yearly",
    weekDays: [1] as number[], // 0=Dom,1=Seg,...,6=Sab
    endType: "never" as "never" | "date" | "count",
    endDate: "",
    endCount: 13,
  });

  const EMPTY_FORM = {
    title: "",
    description: "",
    type: "reuniao",
    start_at: "",
    end_at: "",
    all_day: false,
    location: "",
    meeting_url: "",
    recurrence: "none" as string,
    attendees: "" as string, // e-mails separados por vírgula
    applied_to: (agendaPermission.isAdminOrOwner ? "agency" : "team") as EventAppliedTo,
    team_id: "none",
    assigned_to: "none",
  };
  const [form, setForm] = useState(EMPTY_FORM);

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

  // ── Gera RRULE para o Google Calendar ────────────────────────────────────────
  const buildRRule = (
    recurrence: string,
    custom: typeof customRecurrence,
    baseStart: Date
  ): string[] | null => {
    const BYDAY_MAP = ["SU","MO","TU","WE","TH","FR","SA"];

    const applyEnd = (base: string): string => {
      if (custom.endType === "count" && custom.endCount > 0) return `${base};COUNT=${custom.endCount}`;
      if (custom.endType === "date" && custom.endDate) {
        const until = custom.endDate.replace(/-/g, "") + "T235959Z";
        return `${base};UNTIL=${until}`;
      }
      return base;
    };

    if (recurrence === "daily")    return [`RRULE:FREQ=DAILY`];
    if (recurrence === "weekdays") return [`RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`];
    if (recurrence.startsWith("weekly_")) return [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY_MAP[baseStart.getDay()]}`];
    if (recurrence === "monthly_weekday") {
      const weekNum = Math.floor((baseStart.getDate() - 1) / 7) + 1;
      return [`RRULE:FREQ=MONTHLY;BYDAY=${weekNum}${BYDAY_MAP[baseStart.getDay()]}`];
    }
    if (recurrence.startsWith("yearly_")) return [`RRULE:FREQ=YEARLY`];

    if (recurrence === "custom") {
      const freqMap: Record<string, string> = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
      const freq = freqMap[custom.unit] ?? "WEEKLY";
      let base = `RRULE:FREQ=${freq};INTERVAL=${custom.interval}`;
      if (custom.unit === "weekly" && custom.weekDays.length > 0) {
        base += `;BYDAY=${custom.weekDays.map(d => BYDAY_MAP[d]).join(",")}`;
      }
      return [applyEnd(base)];
    }
    return null;
  };

  // ── Geração de ocorrências recorrentes ──────────────────────────────────────
  const generateOccurrences = (
    baseStart: Date,
    baseEnd: Date,
    recurrence: string | { type: string; interval: number; unit: string; weekDays: number[]; endType: string; endDate: string; endCount: number }
  ): Array<{ start: Date; end: Date }> => {
    const duration = baseEnd.getTime() - baseStart.getTime();
    const occurrences: Array<{ start: Date; end: Date }> = [];
    const MAX = 365; // limite de segurança

    const addOccurrence = (start: Date) => {
      occurrences.push({ start: new Date(start), end: new Date(start.getTime() + duration) });
    };

    if (typeof recurrence === "string") {
      // Recorrências pré-definidas — gera 1 ano de ocorrências
      const endLimit = new Date(baseStart);
      endLimit.setFullYear(endLimit.getFullYear() + 1);

      if (recurrence === "daily") {
        const cur = new Date(baseStart);
        cur.setDate(cur.getDate() + 1);
        while (cur <= endLimit && occurrences.length < MAX) { addOccurrence(cur); cur.setDate(cur.getDate() + 1); }
      } else if (recurrence === "weekdays") {
        const cur = new Date(baseStart);
        cur.setDate(cur.getDate() + 1);
        while (cur <= endLimit && occurrences.length < MAX) {
          const d = cur.getDay();
          if (d >= 1 && d <= 5) addOccurrence(cur);
          cur.setDate(cur.getDate() + 1);
        }
      } else if (recurrence.startsWith("weekly_")) {
        const cur = new Date(baseStart);
        cur.setDate(cur.getDate() + 7);
        while (cur <= endLimit && occurrences.length < MAX) { addOccurrence(cur); cur.setDate(cur.getDate() + 7); }
      } else if (recurrence === "monthly_weekday") {
        // Mesmo dia da semana do mês (ex: 2ª segunda-feira)
        const weekDay = baseStart.getDay();
        const weekNum = Math.floor((baseStart.getDate() - 1) / 7);
        const cur = new Date(baseStart);
        for (let m = 1; m <= 12 && occurrences.length < MAX; m++) {
          cur.setMonth(cur.getMonth() + 1, 1);
          let count = 0;
          while (cur.getDay() !== weekDay) cur.setDate(cur.getDate() + 1);
          for (let w = 0; w < weekNum; w++) { cur.setDate(cur.getDate() + 7); }
          if (cur <= endLimit) addOccurrence(new Date(cur));
        }
      } else if (recurrence.startsWith("yearly_")) {
        const cur = new Date(baseStart);
        for (let y = 1; y <= 3 && occurrences.length < MAX; y++) {
          cur.setFullYear(cur.getFullYear() + 1);
          if (cur <= endLimit) addOccurrence(new Date(cur));
        }
      }
    } else {
      // Recorrência personalizada
      const { interval, unit, weekDays, endType, endDate, endCount } = recurrence;
      const endDateLimit = endType === "date" && endDate ? new Date(endDate + "T23:59:59") : null;
      const absoluteLimit = new Date(baseStart);
      absoluteLimit.setFullYear(absoluteLimit.getFullYear() + 5);

      // Se o pai está fora do intervalo de dias, não conta como ocorrência — usa endCount completo
      const parentIsInInterval = unit === "weekly" && weekDays.length > 0
        ? weekDays.includes(baseStart.getDay())
        : true; // para daily/monthly/yearly o pai sempre conta
      const maxCount = endType === "count"
        ? (parentIsInInterval ? endCount - 1 : endCount)
        : MAX;

      if (unit === "weekly" && weekDays.length > 0) {
        // Semanal com dias específicos
        const cur = new Date(baseStart);
        cur.setDate(cur.getDate() + 1);
        while (occurrences.length < maxCount) {
          if (endDateLimit && cur > endDateLimit) break;
          if (cur > absoluteLimit) break;
          if (weekDays.includes(cur.getDay())) addOccurrence(new Date(cur));
          cur.setDate(cur.getDate() + 1);
          // Pula para próxima semana se passou todos os dias desta
          if (cur.getDay() === 0 && interval > 1) cur.setDate(cur.getDate() + (interval - 1) * 7);
        }
      } else {
        const cur = new Date(baseStart);
        while (occurrences.length < maxCount) {
          if (unit === "daily") cur.setDate(cur.getDate() + interval);
          else if (unit === "weekly") cur.setDate(cur.getDate() + interval * 7);
          else if (unit === "monthly") cur.setMonth(cur.getMonth() + interval);
          else if (unit === "yearly") cur.setFullYear(cur.getFullYear() + interval);
          if (endDateLimit && cur > endDateLimit) break;
          if (cur > absoluteLimit) break;
          addOccurrence(new Date(cur));
        }
      }
    }

    return occurrences;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Constrói as datas tratando o input datetime-local como horário de São Paulo (UTC-3)
      // Isso evita que o offset do browser do usuário interfira na conversão
      const toUTCFromSaoPaulo = (localStr: string): Date => {
        // localStr = "2024-01-15T18:00" — interpreta como São Paulo (UTC-3)
        return new Date(localStr + "-03:00");
      };

      const start = form.start_at ? toUTCFromSaoPaulo(form.start_at) : new Date();
      let end = form.end_at ? toUTCFromSaoPaulo(form.end_at) : new Date(start.getTime() + 3600000);

      // Dia inteiro: fim às 18h do mesmo dia (São Paulo)
      if (form.all_day) {
        const startLocal = form.start_at || format(start, "yyyy-MM-dd'T'HH:mm");
        const dateOnly = startLocal.slice(0, 10);
        end = toUTCFromSaoPaulo(`${dateOnly}T18:00`);
      }

      const startISO = start.toISOString();
      const endISO = end.toISOString();

      // Descrição sem info de visibilidade (visibilidade fica só no metadata)
      const descriptionWithVisibility = form.description || null;

      // Monta metadata com recorrência e visibilidade
      const metadata: Record<string, unknown> = {
        color: EVENT_TYPE_HEX[form.type] ?? EVENT_TYPE_HEX.outro,
        all_day: form.all_day,
        visibility: form.applied_to === "agency"
          ? "agency"
          : form.applied_to === "team"
            ? { type: "team", id: form.team_id, name: teams.find(t => t.id === form.team_id)?.name }
            : { type: "collaborator", id: form.assigned_to, name: profiles.find(p => p.id === form.assigned_to)?.full_name },
      };

      // Normaliza unit para o padrão novo (daily/weekly/monthly/yearly) — fora do if para ficar no escopo
      const normalizeUnit = (u: string) =>
        ({ day: "daily", week: "weekly", month: "monthly", year: "yearly" }[u] ?? u);
      const normalizedCustom = { ...customRecurrence, unit: normalizeUnit(customRecurrence.unit) };

      if (form.recurrence !== "none") {
        metadata.recurrence = form.recurrence === "custom"
          ? { type: "custom", ...normalizedCustom }
          : form.recurrence;

        // Gera RRULE para o Google Calendar
        metadata.rrule = buildRRule(form.recurrence, normalizedCustom as typeof customRecurrence, start);
      }

      // Convidados: lista de e-mails
      const attendeeList = form.attendees
        .split(/[,;\s]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e.includes("@"));
      if (attendeeList.length > 0) {
        metadata.attendees = attendeeList;
      }

      applyTargetToFields();
      const delegation = toDelegationPayload();
      const basePayload = {
        title: form.title,
        description: descriptionWithVisibility,
        type: form.type,
        all_day: form.all_day,
        location: form.location || null,
        meeting_url: form.meeting_url || null,
        is_freelancer: false,
        supplier_id: null,
        metadata,
        ...delegation,
      };

      if (editingId) {
        // Se é evento de série, pergunta se edita só este ou todos
        const isInSeries = !!(editingEvent?.recurrence_group_id || (editingEvent?.metadata as any)?.is_recurrence_child || (editingEvent?.metadata as any)?.recurrence);
        if (isInSeries) {
          // Guarda o payload e abre o dialog de escolha
          setPendingEditPayload({ id: editingId, ...basePayload, start_at: startISO, end_at: endISO });
          setEditSeriesDialog({ open: true, event: editingEvent });
          setSubmitting(false);
          return;
        }
        await update.mutateAsync({ id: editingId, ...basePayload, start_at: startISO, end_at: endISO });
      } else {
        // Criação: salva o evento principal (sem disparar webhook ainda)
        const recurrenceConfig = form.recurrence !== "none"
          ? (form.recurrence === "custom" ? { type: "custom", ...normalizedCustom } : form.recurrence)
          : null;

        const parentEvent = await create.mutateAsync({ ...basePayload, start_at: startISO, end_at: endISO });

        // Se tem recorrência, preenche recurrence_group_id do pai com o próprio id
        if (recurrenceConfig && parentEvent?.id) {
          await supabase.from("events").update({ recurrence_group_id: parentEvent.id }).eq("id", parentEvent.id);
        }
        logger.debug("Parent event criado", { 
          parentEventId: parentEvent?.id,
          hasRecurrenceConfig: !!recurrenceConfig 
        }, 'AGENDA');

        // Gera e salva as ocorrências recorrentes via insert batch direto (sem webhook)
        if (recurrenceConfig && orgId && parentEvent?.id) {
          const occurrences = generateOccurrences(start, end, recurrenceConfig as Parameters<typeof generateOccurrences>[2]);
          logger.debug("Ocorrências geradas", { 
            count: occurrences.length,
            hasRecurrence: !!recurrenceConfig 
          }, 'AGENDA');
          if (occurrences.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            const occurrenceMeta = { ...metadata, is_recurrence_child: true };
            const del = toDelegationPayload();
            const occurrencePayloads = occurrences.map(({ start: s, end: e }) => ({
              organization_id: orgId,
              created_by: user?.id ?? null,
              title: basePayload.title,
              description: basePayload.description,
              event_type: basePayload.type,
              start_at: s.toISOString(),
              end_at: e.toISOString(),
              all_day: basePayload.all_day,
              location: basePayload.location,
              meeting_url: basePayload.meeting_url,
              team_id: (del as Record<string, unknown>).team_id ?? null,
              assigned_to: (del as Record<string, unknown>).assigned_to ?? null,
              metadata: occurrenceMeta,
              recurrence_group_id: parentEvent.id, // vincula ao pai
            }));
            for (let i = 0; i < occurrencePayloads.length; i += 50) {
              const batch = occurrencePayloads.slice(i, i + 50);
              const { error: batchErr } = await supabase
                .from("events")
                .insert(batch as never[]);
              if (batchErr) logger.error("Erro ao inserir ocorrências batch", { 
                batchIndex: i,
                error: batchErr.message 
              }, 'AGENDA');
            }
            // Invalida cache após inserção em batch
            qc.invalidateQueries({ queryKey: ["events", orgId] });
            // Webhook disparado apenas 1x para o evento pai (Google Calendar usa RRULE)
            // O webhook já foi disparado pelo create.mutateAsync acima via useEvents
          }
        }
      }
      setModalOpen(false);
      setEditingId(null);
      setEditingEvent(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar evento";
      setSubmitError(msg);
      logger.error("Erro no handleSubmit", { 
        error: msg,
        context: 'submit_event' 
      }, 'AGENDA');
    } finally {
      setSubmitting(false);
    }
  };

  // Converte string UTC do banco para formato datetime-local (horário local do browser)
  const toLocalInputValue = (utcStr: string) => {
    const d = new Date(utcStr);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  };

  const openEdit = (ev: EventRow) => {
    // Abre direto o form — o dialog de série aparece só ao salvar
    _openEditForm(ev);
  };

  const _openEditForm = (ev: EventRow) => {
    setEditingId(ev.id);
    setEditingEvent(ev);
    const assignedTo = (ev as unknown as { assigned_to?: string | null }).assigned_to ?? null;
    const teamId = (ev as unknown as { team_id?: string | null }).team_id ?? null;
    const applied_to: EventAppliedTo = assignedTo ? "collaborator" : teamId ? "team" : "agency";
    const savedRecurrence = (ev.metadata as any)?.recurrence;
    // Se recorrência salva é objeto custom, restaura customRecurrence e usa "custom" no select
    let recurrenceValue = "none";
    if (savedRecurrence) {
      if (typeof savedRecurrence === "object" && savedRecurrence.type === "custom") {
        recurrenceValue = "custom";
        const normalizeUnit = (u: string) =>
          ({ day: "daily", week: "weekly", month: "monthly", year: "yearly" }[u] ?? u);
        setCustomRecurrence({
          interval: savedRecurrence.interval ?? 1,
          unit: normalizeUnit(savedRecurrence.unit ?? "weekly") as "daily" | "weekly" | "monthly" | "yearly",
          weekDays: savedRecurrence.weekDays ?? [1],
          endType: savedRecurrence.endType ?? "never",
          endDate: savedRecurrence.endDate ?? "",
          endCount: savedRecurrence.endCount ?? 13,
        });
      } else if (typeof savedRecurrence === "string") {
        recurrenceValue = savedRecurrence;
      }
    }
    setForm({
      title: ev.title,
      description: ev.description ?? "",
      type: ev.type,
      start_at: toLocalInputValue(ev.start_at),
      end_at: ev.end_at ? toLocalInputValue(ev.end_at) : "",
      all_day: (ev as any).all_day ?? false,
      location: ev.location ?? "",
      meeting_url: (ev as any).meeting_url ?? "",
      recurrence: recurrenceValue,
      attendees: (ev.metadata as any)?.attendees?.join(", ") ?? "",
      applied_to,
      team_id: teamId ?? "none",
      assigned_to: assignedTo ?? "none",
    });
    setModalOpen(true);
  };

  // ── Handlers de série recorrente ──────────────────────────────────────────

  const handleEditThisOnly = async (ev: EventRow) => {
    setEditSeriesDialog({ open: false, event: null });
    if (!pendingEditPayload) return;
    const parentGcalEventId = ev.recurrence_group_id
      ? events.find(e => e.id === ev.recurrence_group_id)?.gcal_event_id
      : ev.gcal_event_id;
    await updateWithScope(
      pendingEditPayload as Parameters<typeof update.mutateAsync>[0],
      "this_only",
      parentGcalEventId
    );
    setPendingEditPayload(null);
    setModalOpen(false);
    setEditingId(null);
    setEditingEvent(null);
    setForm(EMPTY_FORM);
  };

  const handleEditAllSeries = async (ev: EventRow) => {
    setEditSeriesDialog({ open: false, event: null });
    if (!pendingEditPayload) return;
    const groupId = ev.recurrence_group_id ?? ev.id;

    // Busca dados do pai diretamente do banco
    const { data: parentRow } = await supabase
      .from("events")
      .select("id, start_at, end_at, gcal_event_id")
      .eq("id", groupId)
      .single();

    const parentGcalEventId = parentRow?.gcal_event_id ?? ev.gcal_event_id ?? null;
    const parentStart = new Date(parentRow?.start_at ?? (pendingEditPayload as Record<string, unknown>).start_at as string);
    const parentEnd = new Date(parentRow?.end_at ?? (pendingEditPayload as Record<string, unknown>).end_at as string);

    // Atualiza o pai no banco com id=groupId mas mantém start_at/end_at originais do pai
    // Para o webhook do Google, usa start_at/end_at do PAI para não deslocar a série
    const payloadForBank = {
      ...(pendingEditPayload as Record<string, unknown>),
      id: groupId,
      start_at: parentRow?.start_at ?? (pendingEditPayload as Record<string, unknown>).start_at,
      end_at: parentRow?.end_at ?? (pendingEditPayload as Record<string, unknown>).end_at,
    };
    await updateWithScope(
      payloadForBank as Parameters<typeof update.mutateAsync>[0],
      "all",
      parentGcalEventId
    );

    // Deleta todos os filhos existentes (não o pai)
    await supabase.from("events").delete()
      .eq("recurrence_group_id", groupId)
      .neq("id", groupId);

    // Recria filhos com a nova recorrência a partir da data do PAI
    const newMetadata = (pendingEditPayload as Record<string, unknown>).metadata as Record<string, unknown> | undefined;
    const newRecurrence = newMetadata?.recurrence ?? null;

    if (newRecurrence && orgId) {
      const normalizeUnit = (u: string) =>
        ({ day: "daily", week: "weekly", month: "monthly", year: "yearly" }[u] ?? u);

      let recurrenceConfig: Parameters<typeof generateOccurrences>[2] | null = null;
      if (typeof newRecurrence === "object" && (newRecurrence as Record<string, unknown>).type === "custom") {
        const r = newRecurrence as Record<string, unknown>;
        recurrenceConfig = {
          type: "custom",
          interval: r.interval as number,
          unit: normalizeUnit(r.unit as string) as "daily" | "weekly" | "monthly" | "yearly",
          weekDays: r.weekDays as number[],
          endType: r.endType as string,
          endDate: r.endDate as string,
          endCount: r.endCount as number,
        };
      } else if (typeof newRecurrence === "string") {
        recurrenceConfig = newRecurrence;
      }

      if (recurrenceConfig) {
        const occurrences = generateOccurrences(parentStart, parentEnd, recurrenceConfig);

        if (occurrences.length > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          const del = toDelegationPayload();
          const occurrencePayloads = occurrences.map(({ start: s, end: e }) => ({
            organization_id: orgId,
            created_by: user?.id ?? null,
            title: (pendingEditPayload as Record<string, unknown>).title as string,
            description: (pendingEditPayload as Record<string, unknown>).description as string ?? null,
            event_type: (pendingEditPayload as Record<string, unknown>).type as string,
            start_at: s.toISOString(),
            end_at: e.toISOString(),
            all_day: (pendingEditPayload as Record<string, unknown>).all_day as boolean,
            location: (pendingEditPayload as Record<string, unknown>).location as string ?? null,
            meeting_url: (pendingEditPayload as Record<string, unknown>).meeting_url as string ?? null,
            team_id: (del as Record<string, unknown>).team_id ?? null,
            assigned_to: (del as Record<string, unknown>).assigned_to ?? null,
            metadata: { ...newMetadata, is_recurrence_child: true },
            recurrence_group_id: groupId,
            gcal_event_id: parentGcalEventId ?? null,
          }));

          for (let i = 0; i < occurrencePayloads.length; i += 50) {
            const { error } = await supabase.from("events").insert(occurrencePayloads.slice(i, i + 50) as never[]);
            if (error) logger.error("Erro ao recriar ocorrências", { error: error.message }, 'AGENDA');
          }
        }
      }
    }

    qc.invalidateQueries({ queryKey: ["events", orgId] });
    setPendingEditPayload(null);
    setModalOpen(false);
    setEditingId(null);
    setEditingEvent(null);
    setForm(EMPTY_FORM);
  };

  // Helper: busca gcal_event_id do pai do grupo, com fallback ao banco
  const getParentGcalEventId = async (groupId: string, fallback?: string | null): Promise<string | null> => {
    const fromMemory = events.find(e => e.id === groupId)?.gcal_event_id;
    if (fromMemory) return fromMemory;
    if (fallback) return fallback;
    const { data } = await supabase.from("events").select("gcal_event_id").eq("id", groupId).single();
    return data?.gcal_event_id ?? null;
  };

  // Resolve o groupId real de um evento — busca no banco se necessário
  const resolveGroupId = async (ev: EventRow): Promise<string> => {
    if (ev.recurrence_group_id) return ev.recurrence_group_id;

    // Busca todos os eventos com mesmo título e organização
    const { data: candidates } = await supabase
      .from("events")
      .select("id, start_at, recurrence_group_id, metadata")
      .eq("organization_id", ev.organization_id)
      .eq("title", ev.title)
      .order("start_at", { ascending: true });

    logger.debug("Resolvendo group ID", { 
      eventId: ev.id,
      candidatesCount: candidates?.length,
      firstCandidateId: candidates?.[0]?.id 
    }, 'AGENDA');

    if (!candidates || candidates.length === 0) return ev.id;

    // Verifica se algum já tem recurrence_group_id preenchido
    const withGroup = candidates.find(c => c.recurrence_group_id);
    if (withGroup) {
      const groupId = withGroup.recurrence_group_id;
      // Atualiza todos sem o campo
      const withoutGroup = candidates.filter(c => !c.recurrence_group_id).map(c => c.id);
      if (withoutGroup.length > 0) {
        await supabase.from("events").update({ recurrence_group_id: groupId }).in("id", withoutGroup);
      }
      return groupId;
    }

    // Nenhum tem — pai é o mais antigo (primeiro da lista)
    const parentId = candidates[0].id;
    const allIds = candidates.map(c => c.id);
    logger.debug("Atualizando todos com parent ID", { 
      parentId,
      allIds 
    }, 'AGENDA');
    const { error: updateErr } = await supabase.from("events").update({ recurrence_group_id: parentId }).in("id", allIds);
    logger.debug("Update result", { 
      error: updateErr?.message 
    }, 'AGENDA');
    return parentId;
  };

  const handleDeleteThisOnly = async (ev: EventRow) => {
    setDeleteSeriesDialog({ open: false, event: null });
    const groupId = await resolveGroupId(ev);
    const parentGcalEventId = await getParentGcalEventId(groupId, ev.gcal_event_id);
    await removeWithScope(ev.id, ev.gcal_event_id, "this_only", parentGcalEventId, ev.start_at);
  };

  const handleDeleteThisAndFollowing = async (ev: EventRow) => {
    const startAt = ev.start_at;
    setDeleteSeriesDialog({ open: false, event: null });
    const groupId = await resolveGroupId(ev);
    const parentGcalEventId = await getParentGcalEventId(groupId, ev.gcal_event_id);
    void fireCalendarWebhookDirect(orgId, "delete", ev, "this_and_following", parentGcalEventId);
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("recurrence_group_id", groupId)
      .gte("start_at", startAt);
    if (error) logger.error("Erro ao excluir seguintes", { error: error.message }, 'AGENDA');
    qc.invalidateQueries({ queryKey: ["events", orgId] });
  };

  const handleDeleteAllSeries = async (ev: EventRow) => {
    setDeleteSeriesDialog({ open: false, event: null });
    const groupId = await resolveGroupId(ev);
    logger.debug("Delete all series", { 
      eventId: ev.id,
      groupId,
      isSameGroup: groupId === ev.id 
    }, 'AGENDA');
    const parentGcalEventId = await getParentGcalEventId(groupId, ev.gcal_event_id);

    // 1. Deleta todos os filhos (recurrence_group_id = groupId)
    const { error: deleteErr, count } = await supabase
      .from("events")
      .delete()
      .eq("recurrence_group_id", groupId);
    logger.debug("Delete result", { 
      error: deleteErr?.message,
      count,
      groupId 
    }, 'AGENDA');

    // 2. Dispara webhook para o Google Calendar
    await removeWithScope(groupId, parentGcalEventId, "all", parentGcalEventId);

    qc.invalidateQueries({ queryKey: ["events", orgId] });
  };

  const openDelete = (ev: EventRow) => {
    const isInSeries = !!(ev.recurrence_group_id || (ev.metadata as any)?.is_recurrence_child || (ev.metadata as any)?.recurrence);
    logger.debug("Abrir delete", { 
      eventId: ev.id,
      recurrenceGroupId: ev.recurrence_group_id,
      isRecurrenceChild: !!(ev.metadata as any)?.is_recurrence_child,
      hasRecurrence: !!(ev.metadata as any)?.recurrence,
      isInSeries 
    }, 'AGENDA');
    if (isInSeries) {
      setDeleteSeriesDialog({ open: true, event: ev });
    } else {
      remove.mutate(ev.id);
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
            Visualize e gerencie seus eventos e compromissos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="p-3 max-w-xs">
                <p className="text-xs font-semibold mb-2">Legenda de tipos de evento</p>
                <div className="space-y-1">
                  {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className={cn("inline-block w-2.5 h-2.5 rounded-full border", EVENT_TYPE_COLORS[key])} />
                      <span className="text-xs">{label}</span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className={cn(showFilters && "bg-muted")}>
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button onClick={() => { setEditingId(null); setEditingEvent(null); setForm(EMPTY_FORM); setSubmitError(null); setModalOpen(true); }} disabled={!agendaPermission.canCreate}>
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
            <Button size="sm" variant={view === "year" ? "default" : "outline"} onClick={() => setView("year")}>
              Ano
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
              <CardContent className="p-4">
                {/* Cabeçalho de navegação */}
                <div className="flex items-center justify-between mb-4">
                  <Button size="sm" variant="ghost" onClick={() => setCurrentDate(d => addMonths(d, -1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-base font-semibold capitalize">
                    {format(currentDate, "MMMM yyyy", { locale: ptBR })}
                  </h2>
                  <Button size="sm" variant="ghost" onClick={() => setCurrentDate(d => addMonths(d, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {/* Grid de dias da semana */}
                <div className="grid grid-cols-7 mb-1">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>
                {/* Grid de dias do mês */}
                {(() => {
                  const monthStart = startOfMonth(currentDate);
                  const monthEnd = endOfMonth(currentDate);
                  // Ajusta para semana começar no domingo (0=dom → offset 0)
                  const startOffset = getDay(monthStart);
                  const totalDays = monthEnd.getDate();
                  const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;
                  const eventDates = new Set(filteredEvents.map(e => format(new Date(e.start_at), "yyyy-MM-dd")));

                  return (
                    <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                      {Array.from({ length: totalCells }).map((_, i) => {
                        const dayNum = i - startOffset + 1;
                        const isValid = dayNum >= 1 && dayNum <= totalDays;
                        const date = isValid ? new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum) : null;
                        const dateStr = date ? format(date, "yyyy-MM-dd") : null;
                        const hasEvent = dateStr ? eventDates.has(dateStr) : false;
                        const isToday = date ? isSameDay(date, new Date()) : false;
                        const dayEvents = date ? filteredEvents.filter(e => isSameDay(new Date(e.start_at), date)).slice(0, 3) : [];

                        return (
                          <div
                            key={i}
                            className={cn(
                              "bg-background min-h-[80px] p-1.5 flex flex-col",
                              isValid && "cursor-pointer hover:bg-muted/50 transition-colors",
                              !isValid && "bg-muted/20"
                            )}
                            onClick={() => { if (date) { setCurrentDate(date); setView("day"); } }}
                          >
                            {isValid && (
                              <>
                                <span className={cn(
                                  "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1",
                                  isToday && "bg-primary text-primary-foreground"
                                )}>
                                  {dayNum}
                                </span>
                                <div className="space-y-0.5 flex-1">
                                  {dayEvents.map(ev => (
                                    <div
                                      key={ev.id}
                                      className={cn("text-[10px] px-1 py-0.5 rounded truncate", EVENT_CARD_COLORS[ev.type] ?? EVENT_CARD_COLORS.outro)}
                                      onClick={e => { e.stopPropagation(); openEdit(ev); }}
                                    >
                                      {ev.title}
                                    </div>
                                  ))}
                                  {filteredEvents.filter(e => isSameDay(new Date(e.start_at), date!)).length > 3 && (
                                    <div className="text-[10px] text-muted-foreground px-1">
                                      +{filteredEvents.filter(e => isSameDay(new Date(e.start_at), date!)).length - 3} mais
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {view === "year" && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <Button size="sm" variant="ghost" onClick={() => setCurrentDate(d => new Date(d.getFullYear() - 1, d.getMonth(), 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-base font-semibold">{currentDate.getFullYear()}</h2>
                  <Button size="sm" variant="ghost" onClick={() => setCurrentDate(d => new Date(d.getFullYear() + 1, d.getMonth(), 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: 12 }).map((_, monthIdx) => {
                    const monthDate = new Date(currentDate.getFullYear(), monthIdx, 1);
                    const monthStart = startOfMonth(monthDate);
                    const monthEnd = endOfMonth(monthDate);
                    const startOffset = getDay(monthStart);
                    const totalDays = monthEnd.getDate();
                    const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;
                    const eventDates = new Set(
                      filteredEvents
                        .filter(e => {
                          const d = new Date(e.start_at);
                          return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === monthIdx;
                        })
                        .map(e => format(new Date(e.start_at), "yyyy-MM-dd"))
                    );

                    return (
                      <div key={monthIdx} className="border rounded-lg p-2">
                        <h3
                          className="text-xs font-semibold text-center mb-2 capitalize cursor-pointer hover:text-primary"
                          onClick={() => { setCurrentDate(monthDate); setView("month"); }}
                        >
                          {format(monthDate, "MMMM", { locale: ptBR })}
                        </h3>
                        <div className="grid grid-cols-7 mb-0.5">
                          {["D","S","T","Q","Q","S","S"].map((d, i) => (
                            <div key={i} className="text-center text-[9px] text-muted-foreground">{d}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-px">
                          {Array.from({ length: totalCells }).map((_, i) => {
                            const dayNum = i - startOffset + 1;
                            const isValid = dayNum >= 1 && dayNum <= totalDays;
                            const date = isValid ? new Date(currentDate.getFullYear(), monthIdx, dayNum) : null;
                            const dateStr = date ? format(date, "yyyy-MM-dd") : null;
                            const hasEvent = dateStr ? eventDates.has(dateStr) : false;
                            const isToday = date ? isSameDay(date, new Date()) : false;

                            return (
                              <div
                                key={i}
                                className={cn(
                                  "text-[10px] h-5 flex items-center justify-center rounded relative",
                                  isValid && "cursor-pointer hover:bg-muted",
                                  isToday && "bg-primary text-primary-foreground rounded-full",
                                  !isValid && "opacity-0"
                                )}
                                onClick={() => { if (date) { setCurrentDate(date); setView("day"); } }}
                              >
                                {isValid && dayNum}
                                {hasEvent && !isToday && (
                                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                                className={cn("rounded border p-2 text-left transition-colors cursor-pointer group", EVENT_CARD_COLORS[ev.type] ?? EVENT_CARD_COLORS.outro)}
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
                      <div key={ev.id} className={cn("rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-sm", EVENT_CARD_COLORS[ev.type] ?? EVENT_CARD_COLORS.outro)}>
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
                            {(ev as any).meeting_url && (
                              <div className="flex items-center">
                                <a
                                  href={(ev as any).meeting_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline text-sm flex items-center gap-1 hover:opacity-80"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <CalendarSearch className="h-4 w-4" />
                                  Entrar na reunião
                                </a>
                              </div>
                            )}
                            <div className="flex items-center">
                              <span className="text-primary mr-2">{resolveResponsibleIcon(ev)}</span>
                              {resolveResponsibleLabel(ev)}
                            </div>
                          </div>
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
                            onClick={() => openDelete(ev)} 
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
                              <TableRow key={ev.id} className={cn("group transition-colors", EVENT_CARD_COLORS[ev.type] ?? EVENT_CARD_COLORS.outro)}>
                                <TableCell className="font-medium whitespace-nowrap">
                                  {format(new Date(ev.start_at), "dd/MM/yyyy")}
                                </TableCell>
                                <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                                  {format(new Date(ev.start_at), "HH:mm")}
                                  {ev.end_at ? ` – ${format(new Date(ev.end_at), "HH:mm")}` : ""}
                                </TableCell>
                                <TableCell>
                                  <div className="font-bold flex items-center gap-2">
                                    {ev.title}
                                  </div>
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
                                      onClick={() => openDelete(ev)}
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

      <Dialog open={modalOpen} onOpenChange={(open) => {
        setModalOpen(open);
        if (!open) {
          setSubmitError(null);
          setEditingId(null);
          setEditingEvent(null);
          setForm(EMPTY_FORM);
        }
      }}>
        <DialogContent className="w-[75vw] max-w-[75vw] max-h-[90vh] overflow-y-auto text-[13px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar evento" : "Novo evento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Título */}
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Adicionar título"
              required
              className="text-lg font-medium border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
            />

            {/* Tipo (select estilizado) */}
            <div className="flex items-center gap-3">
              <select
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              {/* Cor invisível — apenas para referência no webhook */}
              <span className={cn("inline-block w-3 h-3 rounded-full border", EVENT_TYPE_COLORS[form.type])} title="Cor do tipo" />
            </div>

            {/* Data início / fim + Dia inteiro */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 flex-1 min-w-[180px]">
                <Label className="text-xs text-muted-foreground">Início</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => {
                    const val = e.target.value;
                    setForm((f) => {
                      // Auto-preenche fim com +1h se não preenchido
                      const autoEnd = !f.end_at && val
                        ? new Date(new Date(val).getTime() + 3600000).toISOString().slice(0, 16)
                        : f.end_at;
                      return { ...f, start_at: val, end_at: autoEnd };
                    });
                  }}
                  required
                  disabled={form.all_day}
                />
              </div>
              <div className="space-y-1 flex-1 min-w-[180px]">
                <Label className="text-xs text-muted-foreground">Fim</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                  disabled={form.all_day}
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch
                  id="all_day"
                  checked={form.all_day}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, all_day: v }))}
                />
                <Label htmlFor="all_day" className="text-sm cursor-pointer">Dia inteiro</Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 pb-1 self-end"
                onClick={() => { setFindTimeDate(form.start_at ? new Date(form.start_at) : new Date()); setFindTimeOpen(true); }}
              >
                <CalendarSearch className="h-4 w-4" />
                Encontrar horário
              </Button>
            </div>

            {/* Repetição + Local na mesma linha */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Repetição</Label>
                <div className="flex gap-1.5">
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={form.recurrence}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") { setRecurrenceDialogOpen(true); }
                      setForm((f) => ({ ...f, recurrence: val }));
                    }}
                  >
                    <option value="none">Não se repete</option>
                    <option value="daily">Todos os dias</option>
                    <option value={`weekly_${["dom","seg","ter","qua","qui","sex","sab"][getDay(form.start_at ? new Date(form.start_at) : new Date())]}`}>
                      Semanal: cada {format(form.start_at ? new Date(form.start_at) : new Date(), "EEEE", { locale: ptBR })}
                    </option>
                    <option value="monthly_weekday">
                      Mensal no(a) {form.start_at ? format(new Date(form.start_at), "EEEE", { locale: ptBR }) : "mesmo dia da semana"}
                    </option>
                    <option value={`yearly_${form.start_at ? format(new Date(form.start_at), "MM-dd") : ""}`}>
                      Anual em {form.start_at ? format(new Date(form.start_at), "d 'de' MMMM", { locale: ptBR }) : "—"}
                    </option>
                    <option value="weekdays">Todos os dias da semana (segunda a sexta-feira)</option>
                    <option value="custom">Personalizar...</option>
                  </select>
                  {form.recurrence === "custom" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-2 shrink-0"
                      onClick={() => setRecurrenceDialogOpen(true)}
                      title="Editar personalização"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Local</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Adicionar local"
                />
              </div>
            </div>

            {/* Link da reunião */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>Link da reunião</span>
                <span className="text-[10px] text-muted-foreground/60">(Google Meet, Zoom, Teams...)</span>
              </Label>
              <Input
                type="url"
                value={form.meeting_url}
                onChange={(e) => setForm((f) => ({ ...f, meeting_url: e.target.value }))}
                placeholder="https://meet.google.com/... ou https://zoom.us/j/..."
              />
            </div>

            {/* Convidados */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>Convidados</span>
                <span className="text-[10px] text-muted-foreground/60">(e-mails separados por vírgula)</span>
              </Label>
              <Input
                type="text"
                value={form.attendees}
                onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                placeholder="email@exemplo.com, outro@exemplo.com"
              />
              {form.attendees && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {form.attendees.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes("@")).map((email, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                      {email}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Aplicado a */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg border">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Aplicado a</Label>
                <Select
                  value={form.applied_to}
                  onValueChange={(v) => setForm((f) => ({ ...f, applied_to: v as EventAppliedTo, team_id: "none", assigned_to: "none" }))}
                >
                  <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {agendaPermission.isAdminOrOwner && <SelectItem value="agency">Agência (Geral)</SelectItem>}
                    <SelectItem value="team">Equipe</SelectItem>
                    <SelectItem value="collaborator">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {form.applied_to === "team" ? "Equipe" : form.applied_to === "collaborator" ? "Responsável" : "Atribuição"}
                </Label>
                <Select
                  disabled={!(form.applied_to === "team" || form.applied_to === "collaborator")}
                  value={form.applied_to === "team" ? form.team_id : form.assigned_to}
                  onValueChange={(v) => setForm((f) => (form.applied_to === "team" ? { ...f, team_id: v } : { ...f, assigned_to: v }))}
                >
                  <SelectTrigger className="bg-background h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {form.applied_to === "team" && teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    {form.applied_to === "collaborator" && profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Adicionar descrição"
                rows={3}
                className="resize-none"
              />
            </div>

            <DialogFooter className="pt-4 border-t">
              {/* Linha única: botões */}
              <div className="flex items-end gap-2 w-full flex-wrap">

                {/* Erro + botões */}
                <div className="flex items-center gap-2 ml-auto">
                  {submitError && (
                    <span className="text-destructive text-xs">{submitError}</span>
                  )}
                  {/* Botão excluir — só aparece no modo edição */}
                  {editingId && editingEvent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      disabled={!agendaPermission.canDelete || remove.isPending || submitting}
                      onClick={() => {
                        setModalOpen(false);
                        openDelete(editingEvent);
                      }}
                    >
                      {remove.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Excluir
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="min-w-[140px]"
                    disabled={
                      (editingId ? !agendaPermission.canEdit : !agendaPermission.canCreate) ||
                      submitting || create.isPending || update.isPending
                    }
                  >
                    {(submitting || create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingId ? "Salvar Alterações" : "Criar Evento"}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Encontrar Horário ── */}
      <Dialog open={findTimeOpen} onOpenChange={setFindTimeOpen}>
        <DialogContent className="w-[90vw] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Encontrar um horário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Navegação */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setFindTimeDate(new Date())}>Hoje</Button>
                <Button variant="ghost" size="icon" onClick={() => setFindTimeDate(d => findTimeView === "day" ? addDays(d, -1) : addWeeks(d, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setFindTimeDate(d => findTimeView === "day" ? addDays(d, 1) : addWeeks(d, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  {findTimeView === "day"
                    ? format(findTimeDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
                    : `${format(startOfWeek(findTimeDate, { weekStartsOn: 0 }), "d MMM", { locale: ptBR })} – ${format(endOfWeek(findTimeDate, { weekStartsOn: 0 }), "d MMM yyyy", { locale: ptBR })}`}
                </span>
              </div>
              <div className="flex items-center gap-1 border rounded-full p-0.5">
                <Button size="sm" variant={findTimeView === "day" ? "default" : "ghost"} className="rounded-full h-7 px-3 text-xs" onClick={() => setFindTimeView("day")}>Dia</Button>
                <Button size="sm" variant={findTimeView === "week" ? "default" : "ghost"} className="rounded-full h-7 px-3 text-xs" onClick={() => setFindTimeView("week")}>Semana</Button>
              </div>
            </div>

            {/* Grade de horários */}
            <div className="border rounded-lg overflow-auto max-h-[400px]">
              <div className={cn("grid", findTimeView === "week" ? "grid-cols-[2.5rem_repeat(7,1fr)]" : "grid-cols-[2.5rem_1fr]")}>
                {/* Cabeçalho */}
                <div className="border-b border-r px-1 py-2 text-[10px] text-muted-foreground sticky top-0 bg-background text-center">Hora</div>
                {findTimeView === "day" ? (
                  <div className="border-b p-2 text-center sticky top-0 bg-background">
                    <div className="text-xs text-primary font-bold uppercase">{format(findTimeDate, "EEE", { locale: ptBR })}</div>
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center mx-auto text-sm font-bold", isSameDay(findTimeDate, new Date()) ? "bg-primary text-white" : "")}>
                      {format(findTimeDate, "d")}
                    </div>
                  </div>
                ) : (
                  Array.from({ length: 7 }).map((_, i) => {
                    const d = addDays(startOfWeek(findTimeDate, { weekStartsOn: 0 }), i);
                    return (
                      <div key={i} className="border-b border-r p-2 text-center sticky top-0 bg-background">
                        <div className="text-xs text-muted-foreground uppercase">{format(d, "EEE", { locale: ptBR })}</div>
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center mx-auto text-xs font-bold", isSameDay(d, new Date()) ? "bg-primary text-white" : "")}>
                          {format(d, "d")}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Linhas de hora */}
                {Array.from({ length: 24 }).map((_, hour) => (
                  <Fragment key={hour}>
                    <div className="border-r border-b px-1 py-1 text-[10px] text-muted-foreground text-center">{String(hour).padStart(2, "0")}:00</div>
                    {findTimeView === "day" ? (
                      <div
                        className="border-b h-8 cursor-pointer hover:bg-primary/10 transition-colors relative"
                        onClick={() => {
                          const d = new Date(findTimeDate);
                          d.setHours(hour, 0, 0, 0);
                          const localStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                          const endD = new Date(d.getTime() + 3600000);
                          const endStr = new Date(endD.getTime() - endD.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                          setForm(f => ({ ...f, start_at: localStr, end_at: endStr }));
                          setFindTimeOpen(false);
                        }}
                      >
                        {/* Linha de hora atual */}
                        {isSameDay(findTimeDate, new Date()) && new Date().getHours() === hour && (
                          <div className="absolute left-0 right-0 border-t-2 border-red-500" style={{ top: `${(new Date().getMinutes() / 60) * 100}%` }}>
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -mt-1.5 -ml-1" />
                          </div>
                        )}
                        {/* Eventos existentes */}
                        {filteredEvents.filter(ev => isSameDay(new Date(ev.start_at), findTimeDate) && new Date(ev.start_at).getHours() === hour).map(ev => (
                          <div key={ev.id} className={cn("absolute left-0 right-0 mx-1 rounded text-[9px] px-1 truncate", EVENT_TYPE_COLORS[ev.type])}>
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    ) : (
                      Array.from({ length: 7 }).map((_, i) => {
                        const d = addDays(startOfWeek(findTimeDate, { weekStartsOn: 0 }), i);
                        return (
                          <div
                            key={i}
                            className="border-b border-r h-8 cursor-pointer hover:bg-primary/10 transition-colors relative"
                            onClick={() => {
                              const sel = new Date(d);
                              sel.setHours(hour, 0, 0, 0);
                              const localStr = new Date(sel.getTime() - sel.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              const endD = new Date(sel.getTime() + 3600000);
                              const endStr = new Date(endD.getTime() - endD.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              setForm(f => ({ ...f, start_at: localStr, end_at: endStr }));
                              setFindTimeOpen(false);
                            }}
                          >
                            {isSameDay(d, new Date()) && new Date().getHours() === hour && (
                              <div className="absolute left-0 right-0 border-t-2 border-red-500" style={{ top: `${(new Date().getMinutes() / 60) * 100}%` }} />
                            )}
                            {filteredEvents.filter(ev => isSameDay(new Date(ev.start_at), d) && new Date(ev.start_at).getHours() === hour).map(ev => (
                              <div key={ev.id} className={cn("absolute left-0 right-0 mx-0.5 rounded text-[8px] px-0.5 truncate", EVENT_TYPE_COLORS[ev.type])}>
                                {ev.title}
                              </div>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Clique em um horário para selecioná-lo.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Recorrência Personalizada ── */}
      <Dialog open={recurrenceDialogOpen} onOpenChange={(open) => { if (!open) setRecurrenceDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Recorrência personalizada</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Repetir a cada */}
            <div className="flex items-center gap-3">
              <span className="text-sm">Repetir a cada:</span>
              <Input
                type="number"
                min={1}
                className="w-16 h-8 text-center"
                value={customRecurrence.interval}
                onChange={(e) => setCustomRecurrence(r => ({ ...r, interval: Math.max(1, Number(e.target.value)) }))}
              />
              <select
                className="flex h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={customRecurrence.unit}
                onChange={(e) => setCustomRecurrence(r => ({ ...r, unit: e.target.value as any }))}
              >
                <option value="daily">dia</option>
                <option value="weekly">semana</option>
                <option value="monthly">mês</option>
                <option value="yearly">ano</option>
              </select>
            </div>

            {/* Dias da semana (só para semana) */}
            {customRecurrence.unit === "weekly" && (
              <div className="space-y-2">
                <span className="text-sm">Repetir:</span>
                <div className="flex gap-1.5">
                  {["D","S","T","Q","Q","S","S"].map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCustomRecurrence(r => ({
                        ...r,
                        weekDays: r.weekDays.includes(i)
                          ? r.weekDays.filter(d => d !== i)
                          : [...r.weekDays, i]
                      }))}
                      className={cn(
                        "w-8 h-8 rounded-full text-xs font-bold border transition-colors",
                        customRecurrence.weekDays.includes(i)
                          ? "bg-primary text-white border-primary"
                          : "bg-background text-muted-foreground border-input hover:border-primary"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Termina em */}
            <div className="space-y-2">
              <span className="text-sm">Termina em</span>
              <div className="space-y-2">
                {(["never","date","count"] as const).map((type) => (
                  <label key={type} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="endType"
                      checked={customRecurrence.endType === type}
                      onChange={() => setCustomRecurrence(r => ({ ...r, endType: type }))}
                      className="accent-primary"
                    />
                    {type === "never" && <span className="text-sm">Nunca</span>}
                    {type === "date" && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Em</span>
                        <Input
                          type="date"
                          className="h-8 w-36"
                          value={customRecurrence.endDate}
                          disabled={customRecurrence.endType !== "date"}
                          onChange={(e) => setCustomRecurrence(r => ({ ...r, endDate: e.target.value }))}
                        />
                      </div>
                    )}
                    {type === "count" && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Após</span>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-16 text-center"
                          value={customRecurrence.endCount}
                          disabled={customRecurrence.endType !== "count"}
                          onChange={(e) => setCustomRecurrence(r => ({ ...r, endCount: Math.max(1, Number(e.target.value)) }))}
                        />
                        <span className="text-sm">ocorrências</span>
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRecurrenceDialogOpen(false); setForm(f => ({ ...f, recurrence: "none" })); }}>
              Cancelar
            </Button>
            <Button onClick={() => setRecurrenceDialogOpen(false)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PinAuthDialog {...pinProps} />

      {/* Dialog: Editar evento da série */}
      <Dialog open={editSeriesDialog.open} onOpenChange={(o) => !o && setEditSeriesDialog({ open: false, event: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar evento recorrente</DialogTitle>
            <DialogDescription>Este evento faz parte de uma série recorrente. O que deseja editar?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button variant="outline" className="justify-start" onClick={() => editSeriesDialog.event && handleEditThisOnly(editSeriesDialog.event)}>
              Apenas este evento
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => editSeriesDialog.event && handleEditAllSeries(editSeriesDialog.event)}>
              Todos os eventos da série
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditSeriesDialog({ open: false, event: null })}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Excluir evento da série */}
      <Dialog open={deleteSeriesDialog.open} onOpenChange={(o) => !o && setDeleteSeriesDialog({ open: false, event: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir evento recorrente</DialogTitle>
            <DialogDescription>Este evento faz parte de uma série recorrente. O que deseja excluir?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button variant="outline" className="justify-start" onClick={() => deleteSeriesDialog.event && handleDeleteThisOnly(deleteSeriesDialog.event)}>
              Apenas este evento
            </Button>
            <Button variant="outline" className="justify-start text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => deleteSeriesDialog.event && handleDeleteThisAndFollowing(deleteSeriesDialog.event)}>
              Este e os seguintes
            </Button>
            <Button variant="outline" className="justify-start text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => deleteSeriesDialog.event && handleDeleteAllSeries(deleteSeriesDialog.event)}>
              Todos os eventos da série
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteSeriesDialog({ open: false, event: null })}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

