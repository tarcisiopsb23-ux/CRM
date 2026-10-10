/**
 * ConversionsTab — Aba "Conversões C8" no CampaignReports e no LeadsKanbanPage
 *
 * Exibe dados de client_tracking_events agrupados por organização.
 * Para o CampaignReports: visão da agência — todos os clientes.
 * Para o LeadsKanbanPage: visão de um cliente específico.
 *
 * Props:
 *   organizationId — filtra por organization_id (todos os clientes da agência)
 *   clientId?      — se passado, filtra por client_id (visão de um cliente)
 *   range?         — período de análise { from, to }
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2, XCircle, Clock, Zap, TrendingUp, Users,
  ArrowRight, Activity,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TrackingEvent {
  id:             string;
  client_id:      string;
  event_name:     string;
  meta_status:    string;
  google_status:  string;
  utm_campaign:   string | null;
  utm_source:     string | null;
  device:         string | null;
  city:           string | null;
  created_at:     string;
}

interface PeriodRange { from: string; to: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  Lead:                 "#10b981",
  Contact:              "#6366f1",
  Schedule:             "#f59e0b",
  Purchase:             "#ec4899",
  CompleteRegistration: "#06b6d4",
  PageView:             "#94a3b8",
  ViewContent:          "#8b5cf6",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
          <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "skipped") return <span className="text-muted-foreground text-xs">—</span>;
  if (status === "sent")    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />OK</Badge>;
  if (status === "pending") return <Badge variant="outline" className="text-amber-500 border-amber-400/30 text-[10px]"><Clock className="h-2.5 w-2.5 mr-1" />Pend.</Badge>;
  return <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]"><XCircle className="h-2.5 w-2.5 mr-1" />Erro</Badge>;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ConversionsTab({
  organizationId,
  clientId,
  range,
}: {
  organizationId: string;
  clientId?:      string;
  range?:         PeriodRange;
}) {
  const from = range?.from ?? format(startOfMonth(new Date()), "yyyy-MM-dd");
  const to   = range?.to   ?? format(endOfMonth(new Date()),   "yyyy-MM-dd");

  const { data: events, isLoading } = useQuery({
    queryKey: ["client_tracking_events_agency", organizationId, clientId, from, to],
    queryFn: async () => {
      let q = supabase
        .from("client_tracking_events")
        .select(
          "id, client_id, event_name, meta_status, google_status, " +
          "utm_campaign, utm_source, device, city, created_at"
        )
        .eq("organization_id", organizationId)
        .gte("created_at", from + "T00:00:00Z")
        .lte("created_at", to   + "T23:59:59Z")
        .order("created_at", { ascending: false })
        .limit(500);

      if (clientId) q = q.eq("client_id", clientId);

      const { data, error } = await q;
      if (error) return [] as TrackingEvent[];
      return (data ?? []) as TrackingEvent[];
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  // ── Agregações ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = events ?? [];

    const totalEvents = all.length;
    const leadEvents  = all.filter((e) => e.event_name === "Lead").length;
    const metaSent    = all.filter((e) => e.meta_status   === "sent").length;
    const googleSent  = all.filter((e) => e.google_status === "sent").length;
    const metaErrors  = all.filter((e) => e.meta_status   === "error").length;
    const googleErrors = all.filter((e) => e.google_status === "error").length;
    const metaRate    = totalEvents > 0 ? ((metaSent / totalEvents) * 100).toFixed(0) : "0";
    const googleRate  = totalEvents > 0 ? ((googleSent / totalEvents) * 100).toFixed(0) : "0";

    // Por evento
    const byEvent: Record<string, number> = {};
    for (const e of all) byEvent[e.event_name] = (byEvent[e.event_name] ?? 0) + 1;

    // Por dia
    const byDay: Record<string, Record<string, number>> = {};
    for (const e of all) {
      const d = e.created_at.slice(0, 10);
      if (!byDay[d]) byDay[d] = {};
      byDay[d][e.event_name] = (byDay[d][e.event_name] ?? 0) + 1;
    }
    const trendData = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date: format(parseISO(date), "dd/MM", { locale: ptBR }),
        ...counts,
      }));

    // Por campanha (utm_campaign)
    const byCampaign: Record<string, number> = {};
    for (const e of all) {
      if (e.utm_campaign) byCampaign[e.utm_campaign] = (byCampaign[e.utm_campaign] ?? 0) + 1;
    }
    const topCampaigns = Object.entries(byCampaign)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    // Por dispositivo
    const byDevice: Record<string, number> = {};
    for (const e of all) {
      const d = e.device ?? "unknown";
      byDevice[d] = (byDevice[d] ?? 0) + 1;
    }

    return {
      totalEvents, leadEvents, metaSent, googleSent,
      metaErrors, googleErrors, metaRate, googleRate,
      byEvent, trendData, topCampaigns, byDevice,
    };
  }, [events]);

  const recentEvents = (events ?? []).slice(0, 20);
  const eventNames   = Object.keys(stats.byEvent);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Activity className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Carregando eventos...</span>
      </div>
    );
  }

  if ((events ?? []).length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Activity className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-base font-semibold text-foreground">Nenhuma conversão registrada</p>
        <p className="text-sm text-muted-foreground">
          Configure o pixel no C8 Control e aguarde os primeiros eventos chegarem.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Zap}       label="Total de Eventos"      value={stats.totalEvents} />
        <KpiCard icon={Users}     label="Leads Capturados"      value={stats.leadEvents}  color="text-emerald-500" />
        <KpiCard
          icon={TrendingUp}
          label="Taxa Entrega Meta"
          value={`${stats.metaRate}%`}
          sub={`${stats.metaErrors > 0 ? stats.metaErrors + " erros" : "sem erros"}`}
          color={stats.metaErrors > 0 ? "text-amber-500" : "text-emerald-500"}
        />
        <KpiCard
          icon={Activity}
          label="Taxa Entrega Google"
          value={`${stats.googleRate}%`}
          sub={`${stats.googleErrors > 0 ? stats.googleErrors + " erros" : "sem erros"}`}
          color={stats.googleErrors > 0 ? "text-amber-500" : "text-emerald-500"}
        />
      </div>

      {/* ── Gráficos ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Tendência por dia */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Eventos por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={stats.trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                {eventNames.map((name) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={EVENT_COLORS[name] ?? "#94a3b8"}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição por evento */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição por tipo de evento</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={Object.entries(stats.byEvent).map(([name, count]) => ({ name, count }))}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {Object.entries(stats.byEvent).map(([name]) => (
                    <rect key={name} fill={EVENT_COLORS[name] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Top campanhas ── */}
      {stats.topCampaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top campanhas por conversões C8</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topCampaigns.map(([campaign, count], idx) => {
                const max = stats.topCampaigns[0][1];
                return (
                  <div key={campaign} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{idx + 1}</span>
                    <span className="text-sm text-foreground flex-1 truncate">{campaign}</span>
                    <div className="w-32 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-foreground w-6 text-right shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Log de eventos recentes ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Eventos recentes
            <Badge variant="outline" className="text-[10px] ml-1">últimos 20</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40">
                  <TableHead className="text-xs">Evento</TableHead>
                  <TableHead className="text-xs">Meta</TableHead>
                  <TableHead className="text-xs">Google</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Campanha</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Fonte</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Dispositivo</TableHead>
                  <TableHead className="text-xs text-right">Data/hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.map((ev) => (
                  <TableRow
                    key={ev.id}
                    className={`border-border/40 text-xs ${
                      ev.meta_status === "error" || ev.google_status === "error"
                        ? "bg-destructive/5"
                        : ""
                    }`}
                  >
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: EVENT_COLORS[ev.event_name] ?? "#94a3b8" }}
                        />
                        <span className="font-mono font-medium text-foreground">{ev.event_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2"><StatusBadge status={ev.meta_status} /></TableCell>
                    <TableCell className="py-2"><StatusBadge status={ev.google_status} /></TableCell>
                    <TableCell className="py-2 hidden md:table-cell text-muted-foreground truncate max-w-[140px]">
                      {ev.utm_campaign ?? "—"}
                    </TableCell>
                    <TableCell className="py-2 hidden lg:table-cell text-muted-foreground">
                      {ev.utm_source ?? "—"}
                    </TableCell>
                    <TableCell className="py-2 hidden lg:table-cell text-muted-foreground">
                      {[ev.device, ev.city].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="py-2 text-right text-muted-foreground tabular-nums">
                      {format(parseISO(ev.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
