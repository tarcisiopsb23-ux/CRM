/**
 * BookingPage - Pagina publica de agendamento /booking/:slug
 *
 * Wizard dinamico - as fases dependem das configuracoes do estabelecimento:
 *   show_services=true      -> fase "service"
 *   show_professionals=true -> fase "professional"
 *   sempre                  -> "date" -> "slot" -> "form" -> "success"
 *
 * Sem autenticacao. Consome a Edge Function agenda-booking.
 */import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTrackingPixel, trackServerSide } from "@/hooks/useTrackingPixel";
import {
  CalendarDays, Clock, ChevronLeft, ChevronRight,
  CheckCircle2, Loader2, User, Phone, Mail, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { cn }     from "@/lib/utils";
import { applyMask } from "@/lib/masks";

// --- Tipos --------------------------------------------------------------------

interface Service      { id: string; name: string; duration_min: number; price: number; color: string; }
interface Professional { id: string; name: string; role: string | null; bio: string | null; avatar_url: string | null; color: string; }
interface Slot         { start_at: string; end_at: string; available: boolean; }
interface ClientInfo {
  name: string;
  logo_url: string | null;
  display_name: string | null;
  description: string | null;
  primary_color: string | null;
}
interface DisplayConfig { show_services: boolean; show_professionals: boolean; }

type Phase = "service" | "professional" | "date" | "slot" | "form" | "success";

// --- URL da Edge Function -----------------------------------------------------

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agenda-booking`;

function formatTime(iso: string) { return format(parseISO(iso), "HH:mm"); }
function fmtCurrency(v: number)  { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); }

// --- MonthCalendar ------------------------------------------------------------

interface DayStatus {
  date:      string;  // yyyy-MM-dd
  status:    "available" | "past" | "no_schedule" | "full" | "loading";
  hasSlots?: boolean;
}

interface MonthCalendarProps {
  selected:        string | null;
  onSelect:        (d: string) => void;
  slug:            string;
  serviceId?:      string | null;
  professionalId?: string | null;
  primaryColor?:   string | null;
}

function MonthCalendar({ selected, onSelect, slug, serviceId, professionalId, primaryColor }: MonthCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [dayStatuses, setDayStatuses] = useState<Record<string, DayStatus["status"]>>({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  // Gera todas as semanas do ms (comeando no domingo)
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const monthEnd   = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

  // Primeiro dia da grade: domingo da semana do dia 1
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay()); // weekStartsOn: 0 (domingo)

  // último dia da grade: sbado da semana do último dia
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const allDays: Date[] = [];
  let cur = new Date(gridStart);
  while (cur <= gridEnd) {
    allDays.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // Carrega disponibilidade de todos os dias do ms de uma vez
  useEffect(() => {
    if (!slug) return;
    setLoadingMonth(true);
    setDayStatuses({});

    // Busca apenas os dias do ms atual (não os de preenchimento da grade)
    const daysInMonth: Date[] = [];
    let d = new Date(monthStart);
    while (d <= monthEnd) {
      daysInMonth.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    // Busca slots de cada dia em paralelo (max 31 requisies)
    Promise.all(
      daysInMonth.map(async (day) => {
        const ds = format(day, "yyyy-MM-dd");
        try {
          const params = new URLSearchParams({ slug, date: ds });
          if (serviceId)      params.set("service_id",      serviceId);
          if (professionalId) params.set("professional_id", professionalId);
          const res  = await fetch(`${EDGE_URL}?${params}`);
          const data = await res.json();
          const available = (data.slots ?? []).filter((s: Slot) => s.available).length;
          return { ds, status: (available > 0 ? "available" : "full") as DayStatus["status"] };
        } catch {
          return { ds, status: "no_schedule" as DayStatus["status"] };
        }
      })
    ).then((results) => {
      const map: Record<string, DayStatus["status"]> = {};
      for (const r of results) map[r.ds] = r.status;
      setDayStatuses(map);
      setLoadingMonth(false);
    });
  }, [slug, currentMonth, serviceId, professionalId]);

  const prevMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const canGoPrev = currentMonth > new Date(today.getFullYear(), today.getMonth(), 1);

  const accent = primaryColor ?? "#6366f1";

  return (
    <div className="space-y-3">
      {/* Cabealho do ms */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} disabled={!canGoPrev}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </span>
          {loadingMonth && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <button onClick={nextMonth}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Dias da semana  comea no domingo */}
      <div className="grid grid-cols-7 gap-1">
        {["Dom","Seg","Ter","Qua","Qui","Sex","Sb"].map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Dias */}
      <div className="grid grid-cols-7 gap-1">
        {allDays.map((date) => {
          const ds          = format(date, "yyyy-MM-dd");
          const isThisMonth = date.getMonth() === currentMonth.getMonth();
          const isPast      = date < today;
          const isToday     = ds === format(today, "yyyy-MM-dd");
          const isSel       = ds === selected;
          const status      = dayStatuses[ds];
          const isAvailable = isThisMonth && !isPast && status === "available";
          const isLoading   = isThisMonth && !isPast && !status && loadingMonth;

          // Dias fora do ms  espao em branco
          if (!isThisMonth) {
            return <div key={ds} className="h-12" />;
          }

          // Dias passados
          if (isPast) {
            return (
              <div key={ds}
                className="flex flex-col items-center justify-center h-12 rounded-lg text-sm opacity-25 select-none cursor-not-allowed">
                {isToday && <span className="text-[9px] uppercase font-bold leading-none mb-0.5">Hoje</span>}
                <span className="text-sm line-through text-muted-foreground leading-none">{format(date, "d")}</span>
              </div>
            );
          }

          // Carregando
          if (isLoading) {
            return (
              <div key={ds} className="flex flex-col items-center justify-center h-12 rounded-lg border border-border/30 bg-muted/10 animate-pulse">
                <span className="text-sm text-muted-foreground/30 leading-none">{format(date, "d")}</span>
              </div>
            );
          }

          // Sem agenda / lotado / sem horrio
          if (!isAvailable) {
            return (
              <div key={ds}
                className="flex flex-col items-center justify-center h-12 rounded-lg text-sm opacity-40 cursor-not-allowed select-none"
                title="Sem horrios disponveis">
                {isToday && <span className="text-[9px] uppercase font-bold text-muted-foreground leading-none mb-0.5">Hoje</span>}
                <span className="text-sm text-muted-foreground leading-none">{format(date, "d")}</span>
              </div>
            );
          }

          // disponível
          return (
            <button
              key={ds}
              onClick={() => onSelect(ds)}
              className={cn(
                "flex flex-col items-center justify-center h-12 rounded-lg text-sm font-semibold transition-all border-2",
                isSel
                  ? "text-white shadow-md scale-105 border-transparent"
                  : isToday
                    ? "scale-105 border-transparent hover:scale-110 hover:shadow-md text-white"
                    : "border-transparent hover:scale-105 hover:shadow-sm text-foreground"
              )}
              style={isSel
                ? { backgroundColor: accent, boxShadow: `0 4px 14px ${accent}55` }
                : isToday
                  ? { backgroundColor: accent, boxShadow: `0 2px 10px ${accent}44`, opacity: 0.85 }
                  : { backgroundColor: `${accent}18`, borderColor: `${accent}40` }
              }
            >
              {isToday && (
                <span className="text-[9px] uppercase font-black tracking-wide leading-none mb-0.5"
                  style={{ color: "white" }}>
                  Hoje
                </span>
              )}
              <span className="leading-none">{format(date, "d")}</span>
              {/* Ponto indicador */}
              <span className="mt-1 h-1 w-1 rounded-full"
                style={{ backgroundColor: isSel || isToday ? "white" : accent }} />
            </button>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 pt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm border-2" style={{ backgroundColor: `${accent}18`, borderColor: `${accent}40` }} />
          disponível
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted/40 opacity-40" />
          Indisponível
        </span>
      </div>
    </div>
  );
}

// --- BookingPage --------------------------------------------------------------

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();

  // -- Pixel de rastreamento (injeta Meta Pixel / GTM / GA4 dinamicamente) -
  // Usa client_id resolvido via clientInfo.client_id aps carregamento inicial
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  useTrackingPixel(clientId, slug);

  // -- Config da página ----------------------------------------------------
  const [displayConfig,       setDisplayConfig]       = useState<DisplayConfig>({ show_services: true, show_professionals: false });
  const [clientInfo,          setClientInfo]          = useState<ClientInfo | null>(null);
  const [services,            setServices]            = useState<Service[]>([]);
  const [professionals,       setProfessionals]       = useState<Professional[]>([]);

  // -- Selees do wizard --------------------------------------------------
  const [selectedService,     setSelectedService]     = useState<Service      | null>(null);
  const [selectedProfessional,setSelectedProfessional]= useState<Professional | null>(null);
  const [selectedDate,        setSelectedDate]        = useState<string | null>(null);
  const [slots,               setSlots]               = useState<Slot[]>([]);
  const [selectedSlot,        setSelectedSlot]        = useState<Slot | null>(null);

  // -- formulário ---------------------------------------------------------
  const [name,      setName]      = useState("");
  const [phone,     setPhone]     = useState("");
  const [email,     setEmail]     = useState("");
  const [notes,     setNotes]     = useState("");

  // -- UI state ------------------------------------------------------------
  const [phase,       setPhase]       = useState<Phase>("service");
  const [initLoading, setInitLoading] = useState(true);
  const [slotsLoading,setSlotsLoading]= useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // -- Fase inicial calculada a partir da config --------------------------
  function firstPhase(cfg: DisplayConfig, svcs: Service[], profs: Professional[]): Phase {
    if (cfg.show_services && svcs.length > 0)           return "service";
    if (cfg.show_professionals && profs.length > 0)     return "professional";
    return "date";
  }

  // Fase "anterior" para botão voltar
  function prevPhase(current: Phase): Phase {
    switch (current) {
      case "professional": return displayConfig.show_services && services.length > 0 ? "service" : "date";
      case "date":
        if (displayConfig.show_professionals && professionals.length > 0) return "professional";
        if (displayConfig.show_services && services.length > 0)           return "service";
        return "date";
      case "slot":   return "date";
      case "form":   return "slot";
      default:       return "date";
    }
  }

  // Fase "prxima" aps servio/profissional
  function afterService(): Phase {
    if (displayConfig.show_professionals && professionals.length > 0) return "professional";
    return "date";
  }

  // -- Carregamento inicial -----------------------------------------------
  useEffect(() => {
    if (!slug) return;
    const today = format(new Date(), "yyyy-MM-dd");
    fetch(`${EDGE_URL}?slug=${slug}&date=${today}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        const cfg: DisplayConfig = {
          show_services:      data.display_config?.show_services      ?? (data.services?.length > 0),
          show_professionals: data.display_config?.show_professionals ?? false,
        };
        setDisplayConfig(cfg);
        setClientInfo(data.client);
        // Aplica cor primria da marca como CSS var
        if (data.client?.primary_color) {
          document.documentElement.style.setProperty("--booking-primary", data.client.primary_color);
        }
        // Captura client_id para injeção do pixel de rastreamento
        if (data.client?.id) setClientId(data.client.id);
        const svcs  = (data.services       ?? []) as Service[];
        const profs = (data.professionals  ?? []) as Professional[];
        setServices(svcs);
        setProfessionals(profs);
        setPhase(firstPhase(cfg, svcs, profs));
      })
      .catch(() => setError("não foi possvel carregar a agenda."))
      .finally(() => setInitLoading(false));
  }, [slug]);

  // -- Carrega slots ------------------------------------------------------
  useEffect(() => {
    if (!selectedDate || !slug) return;
    setSlotsLoading(true);
    const params = new URLSearchParams({ slug, date: selectedDate });
    if (selectedService?.id)      params.set("service_id",     selectedService.id);
    if (selectedProfessional?.id) params.set("professional_id", selectedProfessional.id);
    fetch(`${EDGE_URL}?${params}`)
      .then((r) => r.json())
      .then((data) => { setSlots(data.slots ?? []); setSelectedSlot(null); })
      .catch(() => console.warn("Erro ao buscar horrios."))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, selectedService, selectedProfessional, slug]);

  // -- Submit -------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !selectedSlot) return;
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Informe um WhatsApp vlido com DDD.");
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          customer_name:    name.trim(),
          customer_phone:   phone.replace(/\D/g, "") || null,
          customer_email:   email.trim()             || null,
          service_id:       selectedService?.id      ?? null,
          service_name:     selectedService?.name    ?? "Agendamento",
          professional_id:  selectedProfessional?.id   ?? null,
          professional_name: selectedProfessional?.name ?? null,
          start_at:         selectedSlot.start_at,
          end_at:           selectedSlot.end_at,
          notes:            notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Erro ao agendar.");
      // Dispara evento de rastreamento Schedule (browser-side + server-side)
      if (slug) {
        trackServerSide(slug, "Schedule", {
          email:      email.trim() || undefined,
          phone:      phone.replace(/\D/g, "") || undefined,
          first_name: name.trim().split(" ")[0] || undefined,
          last_name:  name.trim().split(" ").slice(1).join(" ") || undefined,
          custom_data: { service_name: selectedService?.name ?? "Agendamento" },
        });
      }
      setPhase("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao agendar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  // -- Reset completo -----------------------------------------------------
  const reset = () => {
    setSelectedService(null); setSelectedProfessional(null);
    setSelectedDate(null);    setSelectedSlot(null);
    setName(""); setPhone(""); setEmail(""); setNotes(""); setError(null);
    setPhase(firstPhase(displayConfig, services, professionals));
  };

  // -- Loading / Erro inicial ---------------------------------------------
  if (initLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error && phase !== "success") return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <CalendarDays className="h-12 w-12 text-muted-foreground/40 mx-auto" />
        <p className="text-foreground font-semibold">{error}</p>
        <p className="text-sm text-muted-foreground">Verifique o link ou entre em contato.</p>
      </div>
    </div>
  );

  // -- Render -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 px-4 py-4 flex items-center gap-3">
        {clientInfo?.logo_url && (
          <img src={clientInfo.logo_url} alt={clientInfo.display_name ?? clientInfo.name}
            className="h-10 w-10 rounded-lg object-contain" />
        )}
        <div>
          <p className="text-sm font-semibold text-foreground">
            {clientInfo?.display_name || clientInfo?.name}
          </p>
          {clientInfo?.description
            ? <p className="text-xs text-muted-foreground">{clientInfo.description}</p>
            : <p className="text-xs text-muted-foreground">Agendamento online</p>
          }
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8 space-y-6">

        {/* -- Sucesso -- */}
        {phase === "success" && (
          <div className="text-center space-y-4 py-10">
            <div className="h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Agendamento confirmado!</h1>
            <div className="text-sm text-muted-foreground space-y-1">
              {selectedService && <p>Servio: <strong className="text-foreground">{selectedService.name}</strong></p>}
              {selectedProfessional && <p>Profissional: <strong className="text-foreground">{selectedProfessional.name}</strong></p>}
              {selectedSlot && (
                <p>
                  <strong className="text-foreground">{formatTime(selectedSlot.start_at)}</strong>
                  {" "}do dia{" "}
                  <strong className="text-foreground">
                    {selectedDate && format(new Date(selectedDate + "T12:00:00"), "dd/MM/yyyy")}
                  </strong>
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Aguarde a confirmao. Em caso de dvidas, entre em contato diretamente.</p>
            <Button variant="outline" className="border-border mt-4" onClick={reset}>
              Fazer outro agendamento
            </Button>
          </div>
        )}

        {/* -- Selecionar servio -- */}
        {phase === "service" && (
          <div className="space-y-4">
            <h1 className="text-lg font-bold text-foreground">Qual servio?</h1>
            <div className="space-y-2">
              {services.map((s) => (
                <button key={s.id}
                  onClick={() => { setSelectedService(s); setPhase(afterService()); }}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-border text-left hover:border-primary/40 hover:bg-primary/5 transition-colors">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.duration_min}min{s.price > 0 ? `  ${fmtCurrency(s.price)}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* -- Selecionar profissional -- */}
        {phase === "professional" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {prevPhase("professional") !== "professional" && (
                <button onClick={() => setPhase(prevPhase("professional"))}
                  className="p-1 text-muted-foreground hover:text-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <h1 className="text-lg font-bold text-foreground">Com quem?</h1>
            </div>

            {/* Chip do servio selecionado */}
            {selectedService && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedService.color }} />
                <span className="text-foreground font-medium">{selectedService.name}</span>
              </div>
            )}

            <div className="space-y-2">
              {/* Opo "Qualquer profissional" */}
              <button
                onClick={() => { setSelectedProfessional(null); setPhase("date"); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border text-left hover:border-primary/40 hover:bg-primary/5 transition-colors">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">Qualquer profissional</p>
                  <p className="text-xs text-muted-foreground">Primeiro horrio disponível</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>

              {professionals.map((p) => (
                <button key={p.id}
                  onClick={() => { setSelectedProfessional(p); setPhase("date"); }}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-border text-left hover:border-primary/40 hover:bg-primary/5 transition-colors">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.name}
                      className="h-9 w-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: p.color }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                    {p.role && <p className="text-xs text-muted-foreground">{p.role}</p>}
                    {p.bio  && <p className="text-xs text-muted-foreground truncate">{p.bio}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* -- Selecionar data -- */}
        {phase === "date" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setPhase(prevPhase("date"))}
                className="p-1 text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h1 className="text-lg font-bold text-foreground">Qual data?</h1>
            </div>

            {/* Chips de resumo */}
            <div className="flex flex-wrap gap-2">
              {selectedService && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selectedService.color }} />
                  <span className="text-foreground font-medium">{selectedService.name}</span>
                </div>
              )}
              {selectedProfessional && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selectedProfessional.color }} />
                  <span className="text-foreground font-medium">{selectedProfessional.name}</span>
                </div>
              )}
            </div>

            <MonthCalendar
              selected={selectedDate}
              onSelect={(d) => { setSelectedDate(d); setPhase("slot"); }}
              slug={slug ?? ""}
              serviceId={selectedService?.id ?? null}
              professionalId={selectedProfessional?.id ?? null}
              primaryColor={clientInfo?.primary_color ?? null}
            />
          </div>
        )}

        {/* -- Selecionar horrio -- */}
        {phase === "slot" && selectedDate && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setPhase("date")}
                className="p-1 text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-foreground">Qual horrio?</h1>
                <p className="text-xs text-muted-foreground capitalize">
                  {format(new Date(selectedDate + "T12:00:00"), "EEEE, d 'de' MMMM", { locale: ptBR })}
                </p>
              </div>
            </div>

            {slotsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : slots.filter((s) => s.available).length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">Nenhum horrio disponível neste dia.</p>
                <Button variant="outline" size="sm" onClick={() => setPhase("date")}>Escolher outra data</Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.filter((s) => s.available).map((s) => (
                  <button key={s.start_at}
                    onClick={() => { setSelectedSlot(s); setPhase("form"); }}
                    className="py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    {formatTime(s.start_at)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* -- formulário de dados -- */}
        {phase === "form" && selectedSlot && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setPhase("slot")}
                className="p-1 text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h1 className="text-lg font-bold text-foreground">Seus dados</h1>
            </div>

            {/* Resumo do agendamento */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-1.5">
              {selectedService && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedService.color }} />
                  <span className="font-medium text-foreground">{selectedService.name}</span>
                </div>
              )}
              {selectedProfessional && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedProfessional.color }} />
                  <span>{selectedProfessional.name}</span>
                  {selectedProfessional.role && <span className="text-xs"> {selectedProfessional.role}</span>}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {selectedDate && format(new Date(selectedDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(selectedSlot.start_at)}  {formatTime(selectedSlot.end_at)}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome completo <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome" className="pl-9" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">WhatsApp <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={phone} onChange={(e) => setPhone(applyMask(e.target.value, "phone"))}
                    placeholder="(00) 00000-0000" maxLength={15} className="pl-9" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com" className="pl-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Observaes (opcional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informaes adicionais..." />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={submitting || !name.trim() || !phone.trim()}
                className="w-full h-11 font-bold"
                style={{ backgroundColor: clientInfo?.primary_color ?? undefined }}>
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Agendando...</>
                  : "Confirmar Agendamento"
                }
              </Button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
