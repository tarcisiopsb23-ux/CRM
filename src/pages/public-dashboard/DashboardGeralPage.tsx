import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  BarChart3, Users, DollarSign, TrendingUp, Tag,
  UtensilsCrossed, CalendarDays, Megaphone, AlertCircle, Activity, Clock,
} from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useClientReports } from "@/hooks/useHubPerformance";
import { cn } from "@/lib/utils";

export function DashboardGeralPage() {
  const { auth } = useClientAuth();
  const dc = useDynamicClient();
  const [searchParams] = useSearchParams();

  const dateRange = {
    from: searchParams.get("from") ?? format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to: searchParams.get("to") ?? format(endOfMonth(new Date()), "yyyy-MM-dd"),
  };

  // ── Dados de campanhas (CRM Supabase) ──────────────────────────────────────
  const { campaignDataQuery } = useClientReports(
    auth?.organization_id,
    auth?.id,
    useMemo(() => dateRange, [dateRange.from, dateRange.to]),
    true
  );

  const { totalLeads, totalSpend, totalRevenue, activeCampaigns, weeklyData } = useMemo(() => {
    const rows = (campaignDataQuery.data ?? []) as any[];
    const campaignSet = new Set<string>();
    const byDate: Record<string, { date: string; leads: number; spend: number }> = {};
    let totalLeads = 0, totalSpend = 0, totalRevenue = 0;

    for (const r of rows) {
      if (r.campaign_name) campaignSet.add(`${r.platform}||${r.campaign_name}`);
      totalLeads += Number(r.leads ?? 0);
      totalSpend += Number(r.spend ?? 0);
      totalRevenue += Number(r.revenue ?? 0);
      const d = r.date;
      if (d) {
        if (!byDate[d]) byDate[d] = { date: d, leads: 0, spend: 0 };
        byDate[d].leads += Number(r.leads ?? 0);
        byDate[d].spend += Number(r.spend ?? 0);
      }
    }

    const last7 = Array.from({ length: 7 }, (_, i) => {
      const day = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
      const label = format(subDays(new Date(), 6 - i), "EEE", { locale: ptBR });
      return { date: label, leads: byDate[day]?.leads ?? 0, spend: byDate[day]?.spend ?? 0 };
    });

    return { totalLeads, totalSpend, totalRevenue, activeCampaigns: campaignSet.size, weeklyData: last7 };
  }, [campaignDataQuery.data]);

  const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : "0.0";

  // ── KPIs do CRM ───────────────────────────────────────────────────────────
  const { data: kpisRaw } = useQuery({
    queryKey: ["public_client_kpis", auth?.id],
    queryFn: async () => {
      if (!auth?.id) return [];
      const { data: rpcData, error } = await supabase.rpc("get_client_kpis_public", { p_client_id: auth.id });
      if (!error && rpcData?.length) return rpcData;
      const { data } = await supabase.from("client_kpis").select("*").eq("client_id", auth.id);
      return data ?? [];
    },
    enabled: !!auth?.id,
  });
  const kpis = (kpisRaw ?? []) as any[];
  const faturamentoKpi = kpis.find((k: any) => /faturamento/i.test(k.name));

  // ── Contagens IA (Dynamic_Client) ─────────────────────────────────────────
  const iaCounts = useQueries({
    queries: dc && auth?.show_ia_content ? [
      { queryKey: ["ia_count", "ai_promotions"],  queryFn: async () => { const { count } = await dc.from("ai_promotions").select("id", { count: "exact", head: true }).eq("status", "active"); return count ?? 0; }, staleTime: 60_000 },
      { queryKey: ["ia_count", "ai_suggestions"], queryFn: async () => { const { count } = await dc.from("ai_suggestions").select("id", { count: "exact", head: true }).eq("status", "active"); return count ?? 0; }, staleTime: 60_000 },
      { queryKey: ["ia_count", "ai_events"],      queryFn: async () => { const { count } = await dc.from("ai_events").select("id", { count: "exact", head: true }); return count ?? 0; }, staleTime: 60_000 },
      { queryKey: ["ia_count", "ai_notices"],     queryFn: async () => { const { count } = await dc.from("ai_notices").select("id", { count: "exact", head: true }).eq("status", "active"); return count ?? 0; }, staleTime: 60_000 },
    ] : [],
  });

  // ── Próximo evento (ai_events) ────────────────────────────────────────────
  const { data: nextEvent } = useQuery({
    queryKey: ["ia_next_event"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await dc!
        .from("ai_events")
        .select("*")
        .eq("status", "active")
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data as { id: string; title: string; description: string | null; date: string; time: string | null; type: string | null } | null;
    },
    enabled: !!dc && !!auth?.show_ia_content,
    staleTime: 60_000,
  });

  // ── Avisos alta prioridade ─────────────────────────────────────────────────
  const { data: highPriorityNotices } = useQuery({
    queryKey: ["ia_high_notices"],
    queryFn: async () => {
      const { data } = await dc!.from("ai_notices").select("*").eq("status", "active").eq("priority", "alta").limit(5);
      return data ?? [];
    },
    enabled: !!dc && !!auth?.show_ia_content,
    staleTime: 60_000,
  });

  const iaCountLabels = [
    { label: "Eventos",   icon: CalendarDays, color: "text-emerald-400" },
    { label: "Promoções", icon: Tag,           color: "text-violet-400" },
    { label: "Sugestões", icon: UtensilsCrossed, color: "text-amber-400" },
    { label: "Avisos",    icon: Megaphone,     color: "text-red-400" },
  ];

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Campanhas Ativas" value={activeCampaigns} icon={<BarChart3 className="h-5 w-5 text-[#2D8CC7]" />} />
        <SummaryCard label="Total de Leads" value={totalLeads.toLocaleString("pt-BR")} icon={<Users className="h-5 w-5 text-blue-400" />} />
        <SummaryCard label="Faturamento Est." value={`R$ ${totalRevenue.toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5 text-emerald-400" />} highlight />
        <SummaryCard label="ROAS" value={`${roas}x`} icon={<DollarSign className="h-5 w-5 text-orange-400" />} />
      </div>

      {/* ── Cards IA (condicional) ── */}
      {auth?.show_ia_content && dc && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {iaCountLabels.map((item, i) => {
            const count = iaCounts[i]?.data ?? 0;
            const Icon = item.icon;
            return (
              <Card key={item.label} className="bg-card border-border">
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Icon className={cn("h-5 w-5", item.color)} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-foreground">{count}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{item.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Gráfico semanal + Próximo evento ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card border-border shadow-2xl">
          <CardHeader>
            <CardTitle className="text-foreground text-lg font-bold">Atividade Semanal</CardTitle>
            <p className="text-muted-foreground text-sm">Leads e investimento — últimos 7 dias</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px" }} itemStyle={{ fontSize: "12px" }} />
                <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spend" name="Investimento (R$)" fill="#2D8CC7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Próximo evento */}
        <Card className="bg-card border-border shadow-2xl">
          <CardHeader>
            <CardTitle className="text-foreground text-lg font-bold flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#2D8CC7]" />
              Próximo Evento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!auth?.show_ia_content || !dc ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <CalendarDays className="h-8 w-8 opacity-20" />
                <p className="text-sm text-center">Habilite o Conteúdo IA para ver o próximo evento.</p>
              </div>
            ) : nextEvent ? (
              <div className="space-y-3">
                <p className="text-xl font-black text-foreground">{nextEvent.title}</p>
                {nextEvent.description && (
                  <p className="text-muted-foreground text-sm">{nextEvent.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {format(new Date(nextEvent.date + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                  {nextEvent.time && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {nextEvent.time}
                    </span>
                  )}
                </div>
                {nextEvent.type && (
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
                    nextEvent.type === "musica_ao_vivo"
                      ? "bg-primary/10 text-primary ring-primary/20"
                      : "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                  )}>
                    {nextEvent.type === "musica_ao_vivo" ? "Música ao Vivo" : "Dia Especial"}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <CalendarDays className="h-8 w-8 opacity-20" />
                <p className="text-sm">Nenhum evento futuro cadastrado.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Avisos de alta prioridade ── */}
      {auth?.show_ia_content && dc && highPriorityNotices && highPriorityNotices.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-foreground font-bold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-400" />
            Avisos de Alta Prioridade
          </h3>
          {(highPriorityNotices as any[]).map((notice: any) => (
            <div key={notice.id} className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-200 font-medium">{notice.message}</p>
                {notice.validity && <p className="text-xs text-red-400/70 mt-1">Validade: {notice.validity}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Feed de atividade recente ── */}
      <Card className="bg-card border-border shadow-2xl">
        <CardHeader>
          <CardTitle className="text-foreground text-lg font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeCampaigns === 0 && totalLeads === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
              <Activity className="h-8 w-8 opacity-20" />
              <p className="text-sm">Nenhuma atividade registrada no período selecionado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {totalLeads > 0 && (
                <FeedItem color="bg-blue-400" text={`${totalLeads.toLocaleString("pt-BR")} leads gerados no período`} time="período selecionado" />
              )}
              {activeCampaigns > 0 && (
                <FeedItem color="bg-[#2D8CC7]" text={`${activeCampaigns} campanhas ativas monitoradas`} time="período selecionado" />
              )}
              {Number(roas) > 0 && (
                <FeedItem color="bg-emerald-400" text={`ROAS de ${roas}x — R$ ${totalRevenue.toLocaleString("pt-BR")} em faturamento estimado`} time="período selecionado" />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon, highlight = false }: { label: string; value: string | number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={cn("border-border shadow-lg", highlight ? "bg-primary/20 border-emerald-500/30" : "bg-card")}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="p-2 rounded-lg bg-secondary">{icon}</div>
        </div>
        <div>
          <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">{label}</p>
          <p className="text-2xl font-black text-foreground mt-1">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FeedItem({ color, text, time }: { color: string; text: string; time: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", color)} />
      <div className="flex-1">
        <p className="text-sm text-foreground/90">{text}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
    </div>
  );
}