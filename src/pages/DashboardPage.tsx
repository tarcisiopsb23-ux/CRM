/* eslint-disable @typescript-eslint/no-explicit-any */
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { useProjects } from "@/hooks/useProjects";
import { useTeams } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { usePayments, useSupplierExpenses } from "@/hooks/useFinancial";
import { useEvents } from "@/hooks/useEvents";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useGoals } from "@/hooks/useGoalsCRUD";
import { useContractMetrics } from "@/hooks/useContractMetrics";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermission } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SalesFunnel } from "@/components/ui/sales-funnel";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { 
  TrendingUp, TrendingDown, DollarSign, Users, Target, 
  Calendar, CheckSquare, Plus, ArrowRight, AlertTriangle,
  Briefcase, Megaphone, Activity, FileCheck, FileX, PauseCircle,
  ExternalLink, BarChart3, Award, Trophy, BriefcaseIcon, LayoutList,
  Medal, ChevronRight
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, parseISO, subMonths, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  LabelList,
  AreaChart,
  Area
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { DailyMetrics } from "@/types/hub_performance";
import { PendingAuthorizationsWidget } from "@/components/dashboard/PendingAuthorizationsWidget";
import AuthorizationsPage from "@/pages/AuthorizationsPage";
import { usePendingAuthorizations } from "@/hooks/usePendingAuthorizations";

interface RankingItem {
  name: string;
  value: number;
  subValue?: string;
  secondaryLabel?: string;
}

function MedalIcon({ position, className }: { position: number; className?: string }) {
  if (position === 1)
    return (
      <div className={`relative flex items-center justify-center ${className ?? ""}`}>
        <Medal className="h-6 w-6 text-amber-400 fill-amber-400" />
        <span className="absolute text-[10px] font-bold text-amber-900 mt-0.5">1</span>
      </div>
    );
  if (position === 2)
    return (
      <div className={`relative flex items-center justify-center ${className ?? ""}`}>
        <Medal className="h-6 w-6 text-slate-300 fill-slate-300" />
        <span className="absolute text-[10px] font-bold text-slate-700 mt-0.5">2</span>
      </div>
    );
  if (position === 3)
    return (
      <div className={`relative flex items-center justify-center ${className ?? ""}`}>
        <Medal className="h-6 w-6 text-amber-600 fill-amber-600" />
        <span className="absolute text-[10px] font-bold text-amber-950 mt-0.5">3</span>
      </div>
    );
  return <span className={`text-xs font-bold text-slate-400 ${className ?? ""}`}>{position}°</span>;
}

function RankingBlock({ 
  title, 
  description, 
  icon: Icon, 
  data, 
  valuePrefix = "", 
  valueSuffix = "",
  isCurrency = false
}: { 
  title: string; 
  description: string; 
  icon: any; 
  data: RankingItem[]; 
  valuePrefix?: string;
  valueSuffix?: string;
  isCurrency?: boolean;
}) {
  const top3 = data.slice(0, 3);
  const others = data.slice(3, 6);
  const hasMore = data.length > 6;

  const formatVal = (v: number) => {
    if (isCurrency) return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `${valuePrefix}${v.toLocaleString('pt-BR')}${valueSuffix}`;
  };

  return (
    <Card className="border-none shadow-sm ring-1 ring-slate-200 flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider">{title}</CardTitle>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 px-2">
                Ver Tudo <ChevronRight className="h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  Ranking Completo: {title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-1 mt-4 max-h-[60vh] overflow-y-auto pr-2">
                {data.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border-b last:border-0">
                    <div className="flex items-center gap-4">
                      <MedalIcon position={idx + 1} className="w-8" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold text-slate-800">{item.name}</p>
                        {item.secondaryLabel && <p className="text-[10px] text-slate-500 uppercase font-medium">{item.secondaryLabel}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{formatVal(item.value)}</p>
                      {item.subValue && <p className="text-[10px] text-slate-400">{item.subValue}</p>}
                    </div>
                  </div>
                ))}
                {data.length === 0 && <p className="text-center py-8 text-slate-400 text-sm italic">Nenhum dado disponível.</p>}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription className="text-[10px]">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        {/* Gráfico Top 3 */}
        <div className="h-[160px] flex items-end justify-around pt-4 px-2">
          {top3.length > 0 ? (
            <>
              {/* 2nd Place */}
              {top3[1] && (
                <div className="flex flex-col items-center gap-2 w-1/3 group">
                  <div className="relative w-full flex flex-col items-center">
                    <div className="text-[10px] font-bold text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{formatVal(top3[1].value)}</div>
                    <div className="w-full bg-slate-100 rounded-t-lg transition-all duration-500" style={{ height: '60px' }}>
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <MedalIcon position={2} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 text-center line-clamp-1 w-full px-1">{top3[1].name.split(' ')[0]}</p>
                </div>
              )}
              
              {/* 1st Place */}
              {top3[0] && (
                <div className="flex flex-col items-center gap-2 w-1/3 group">
                  <div className="relative w-full flex flex-col items-center">
                    <div className="text-[10px] font-bold text-primary mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{formatVal(top3[0].value)}</div>
                    <div className="w-full bg-primary/10 ring-1 ring-primary/20 rounded-t-lg transition-all duration-500" style={{ height: '90px' }}>
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <MedalIcon position={1} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] font-black text-slate-900 text-center line-clamp-1 w-full px-1">{top3[0].name.split(' ')[0]}</p>
                </div>
              )}

              {/* 3rd Place */}
              {top3[2] && (
                <div className="flex flex-col items-center gap-2 w-1/3 group">
                  <div className="relative w-full flex flex-col items-center">
                    <div className="text-[10px] font-bold text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{formatVal(top3[2].value)}</div>
                    <div className="w-full bg-orange-50 rounded-t-lg transition-all duration-500" style={{ height: '40px' }}>
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <MedalIcon position={3} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 text-center line-clamp-1 w-full px-1">{top3[2].name.split(' ')[0]}</p>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 italic text-xs">Sem dados</div>
          )}
        </div>

        {/* Lista de Próximos */}
        <div className="space-y-2 border-t pt-4">
          {others.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between group py-1">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 w-4">{idx + 4}°</span>
                <p className="text-[11px] font-medium text-slate-700 group-hover:text-primary transition-colors">{item.name}</p>
              </div>
              <span className="text-[11px] font-bold text-slate-900">{formatVal(item.value)}</span>
            </div>
          ))}
          {hasMore && (
            <div className="pt-2 text-center">
              <p className="text-[10px] text-slate-400 font-medium italic">+ {data.length - 6} outros no ranking</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const organizationId = useOrganization();
  const { pending: pendingAuths } = usePendingAuthorizations();
  const pendingCount = pendingAuths.length;
  const navigate = useNavigate();

  // Funil de Vendas
  const { stages: funnelStages, isLoading: funnelLoading } = useFunnelStages(organizationId);
  
  const { profile } = useAuth();
  const { canView: canViewFinancial } = useModulePermission("financial");
  const { canView: canViewPerformance } = useModulePermission("performance");
  const contractMetrics = useContractMetrics(organizationId);

  // Dados Financeiros
  const { data: payments = [] } = usePayments(organizationId, { enabled: canViewFinancial });
  const { data: expenses = [] } = useSupplierExpenses(organizationId, { enabled: canViewFinancial });

  // Performance Data
  const performanceQuery = useQuery({
    queryKey: ["all_clients_performance", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("campaign_data")
        .select(`
          client_id, date, spend, impressions, reach, clicks, leads, sales, revenue,
          clients ( name, company, dashboard_slug )
        `)
        .eq("organization_id", organizationId)
        .order("date", { ascending: true });
      if (error) {
        console.warn("[Dashboard] Erro ao buscar campaign_data:", error.message);
        return [];
      }
      // Normaliza para o mesmo formato que daily_metrics usava
      return (data || []).map((r: any) => ({
        ...r,
        total_spend:       Number(r.spend       ?? 0),
        total_leads:       Number(r.leads       ?? 0),
        total_sales:       Number(r.sales       ?? 0),
        total_revenue:     Number(r.revenue     ?? 0),
        total_impressions: Number(r.impressions ?? 0),
        total_clicks:      Number(r.clicks      ?? 0),
      }));
    },
    enabled: !!organizationId && canViewPerformance,
  });

  const performanceMetrics = performanceQuery.data || [];

  const performanceEvolutionData = useMemo(() => {
    // Group by date to show overall evolution
    const daily = performanceMetrics.reduce((acc: any, curr: any) => {
      const date = curr.date;
      if (!acc[date]) {
        acc[date] = { date, spend: 0, leads: 0, sales: 0, revenue: 0 };
      }
      acc[date].spend += Number(curr.total_spend) || 0;
      acc[date].leads += Number(curr.total_leads) || 0;
      acc[date].sales += Number(curr.total_sales) || 0;
      acc[date].revenue += Number(curr.total_revenue) || 0;
      return acc;
    }, {});
    return Object.values(daily).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [performanceMetrics]);

  const perfTotals = useMemo(() => {
    return performanceMetrics.reduce((acc, curr) => ({
      spend: acc.spend + (Number(curr.total_spend) || 0),
      leads: acc.leads + (Number(curr.total_leads) || 0),
      sales: acc.sales + (Number(curr.total_sales) || 0),
      revenue: acc.revenue + (Number(curr.total_revenue) || 0),
      impressions: acc.impressions + (Number(curr.total_impressions) || 0),
      clicks: acc.clicks + (Number(curr.total_clicks) || 0),
    }), { spend: 0, leads: 0, sales: 0, revenue: 0, impressions: 0, clicks: 0 });
  }, [performanceMetrics]);

  const { campaigns, totals: campTotals } = useCampaigns();

  const funnelDataPerf = useMemo(() => {
    // Impressões e cliques vêm das campanhas; leads e vendas do daily_metrics
    const impressions = campTotals.impressions || perfTotals.impressions;
    const clicks      = campTotals.clicks      || perfTotals.clicks;
    const leads       = campTotals.leads       || perfTotals.leads;
    const sales       = perfTotals.sales;
    return [
      { name: "Impressões", value: impressions, fill: "#64748b" },
      { name: "Cliques",    value: clicks,      fill: "#3b82f6" },
      { name: "Leads",      value: leads,       fill: "#8b5cf6" },
      { name: "Vendas",     value: sales,       fill: "#10b981" },
    ];
  }, [campTotals, perfTotals]);

  const clientRanking = useMemo(() => {
    const perClient = performanceMetrics.reduce((acc: any, curr: any) => {
      const clientId = curr.client_id;
      const clientInfo = Array.isArray(curr.clients) ? curr.clients[0] : curr.clients;
      
      if (!acc[clientId]) {
        acc[clientId] = { 
          name: clientInfo?.company || clientInfo?.name || "Desconhecido", 
          spend: 0, leads: 0, sales: 0, 
          slug: clientInfo?.dashboard_slug 
        };
      }
      acc[clientId].spend += Number(curr.total_spend) || 0;
      acc[clientId].leads += Number(curr.total_leads) || 0;
      acc[clientId].sales += Number(curr.total_sales) || 0;
      return acc;
    }, {});
    return Object.values(perClient).sort((a: any, b: any) => b.spend - a.spend);
  }, [performanceMetrics]);

  // Hooks para dados
  // for dashboard metrics we want *all* leads, even those already
  // converted to clients. the kanban hook defaults to hiding them, but the
  // dashboard should still count closed/realized contracts.
  const { leads } = useLeadsKanban(organizationId, { includeConverted: true });
  const { data: clients = [] } = useClients(organizationId);
  const { data: teams = [] } = useTeams(organizationId);
  const { data: projects = [] } = useProjects(organizationId);
  const { data: goals = [] } = useGoals(organizationId);
  // 1. Fetch lead history for qualification tracking
  const historyQuery = useQuery({
    queryKey: ["lead_stage_history_dashboard", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("lead_stage_history")
        .select(`
          lead_id, 
          to_stage, 
          moved_by,
          moved_at
        `)
        .order("moved_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!organizationId,
  });

  const leadHistory = historyQuery.data || [];

  const { data: allProfiles = [] } = useProfiles(organizationId);

  // Rankings and Stats
  const sellerRanking = useMemo(() => {
    const sellers: Record<string, { name: string, contracts: number, revenue: number }> = {};
    
    // Logic: First payment received per seller (assigned_to of the lead)
    // 1. Map leads to their assigned seller
    const leadSellerMap: Record<string, { id: string, name: string }> = {};
    leads.forEach(l => {
      if (l.assigned_to) {
        leadSellerMap[l.id] = { id: l.assigned_to, name: l.assigned_to_name || "Sem nome" };
      }
    });

    // 2. Identify first payments for each client
    // Group payments by client, find the earliest one tied to a contract
    const clientFirstPayments: Record<string, number> = {};
    const clientPayments = (payments as any[]).reduce((acc: any, p) => {
      if (!p.client_id || p.status !== 'pago') return acc;
      if (!acc[p.client_id]) acc[p.client_id] = [];
      acc[p.client_id].push(p);
      return acc;
    }, {});

    Object.entries(clientPayments).forEach(([clientId, pays]: [string, any]) => {
      // Sort by due_date or paid_at to find the first one
      const sorted = pays.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
      const first = sorted[0];
      if (first) {
        // Find the lead for this client to know the seller
        const client = clients.find(c => c.id === clientId);
        if (client?.lead_id && leadSellerMap[client.lead_id]) {
          const seller = leadSellerMap[client.lead_id];
          if (!sellers[seller.id]) {
            sellers[seller.id] = { name: seller.name, contracts: 0, revenue: 0 };
          }
          sellers[seller.id].contracts += 1;
          sellers[seller.id].revenue += Number(first.value || 0);
        }
      }
    });

    return Object.values(sellers).sort((a, b) => b.revenue - a.revenue);
  }, [clients, leads, payments]);

  const portfolioRanking = useMemo(() => {
    const portfolios: Record<string, { name: string, revenue: number, spend: number, leads: number, sales: number, roas: number, clientCount: number }> = {};
    
    // Group metrics by client first
    const clientMetrics = performanceMetrics.reduce((acc: any, curr: any) => {
      const clientId = curr.client_id;
      if (!acc[clientId]) acc[clientId] = { revenue: 0, spend: 0 };
      acc[clientId].revenue += Number(curr.total_revenue || 0);
      acc[clientId].spend += Number(curr.total_spend || 0);
      return acc;
    }, {});

    // Map clients to portfolios
    clients.forEach((client: any) => {
      if (client.portfolio_team_id) {
        const team = teams.find(t => t.id === client.portfolio_team_id);
        if (team) {
          if (!portfolios[team.id]) {
            portfolios[team.id] = { name: team.name, revenue: 0, spend: 0, leads: 0, sales: 0, roas: 0, clientCount: 0 };
          }
          const m = clientMetrics[client.id] || { revenue: 0, spend: 0 };
          portfolios[team.id].revenue += m.revenue;
          portfolios[team.id].spend += m.spend;
          portfolios[team.id].clientCount += 1;
          
          // ROAS individual do cliente para média posterior
          const clientRoas = m.spend > 0 ? m.revenue / m.spend : 0;
          portfolios[team.id].roas += clientRoas;
        }
      }
    });

    return Object.values(portfolios)
      .map(p => ({
        ...p,
        // Média do ROAS dos clientes da carteira
        roas: p.clientCount > 0 ? p.roas / p.clientCount : 0
      }))
      .sort((a, b) => b.roas - a.roas);
  }, [performanceMetrics, clients, teams]);

  const projectsStats = useMemo(() => {
    const teamStats: Record<string, { name: string, completed: number }> = {};
    
    projects.forEach((p: any) => {
      if (p.status === 'concluida') {
        let teamName = "Sem Equipe";
        let teamId = "none";

        if (p.responsible_type === 'team' && p.responsible_id) {
          const team = teams.find(t => t.id === p.responsible_id);
          if (team) {
            teamName = team.name;
            teamId = team.id;
          }
        }

        if (!teamStats[teamId]) teamStats[teamId] = { name: teamName, completed: 0 };
        teamStats[teamId].completed += 1;
      }
    });

    return Object.values(teamStats).sort((a, b) => b.completed - a.completed);
  }, [projects, teams]);

  const qualificationRanking = useMemo(() => {
    const qualifiers: Record<string, { name: string, qualified: number, converted: number }> = {};
    
    // 1. Identify who qualified each lead
    const leadQualifiersMap: Record<string, string> = {}; // lead_id -> user_id (who moved to 'qualificados')
    
    leadHistory.forEach((h: any) => {
      if (h.to_stage === 'qualificados' && h.moved_by) {
        // Keep the first person who qualified it (or last, depending on business logic, but usually first is the qualifier)
        if (!leadQualifiersMap[h.lead_id]) {
          leadQualifiersMap[h.lead_id] = h.moved_by;
        }
      }
    });

    // 2. Track leads that reached 'efetivados'
    const convertedLeads = new Set(
      leadHistory
        .filter((h: any) => h.to_stage === 'efetivados')
        .map((h: any) => h.lead_id)
    );

    // 3. Aggregate data per qualifier
    Object.entries(leadQualifiersMap).forEach(([leadId, userId]) => {
      const profile = allProfiles.find(p => p.id === userId);
      const name = profile?.full_name || "Desconhecido";
      
      if (!qualifiers[userId]) {
        qualifiers[userId] = { name, qualified: 0, converted: 0 };
      }
      
      qualifiers[userId].qualified += 1;
      if (convertedLeads.has(leadId)) {
        qualifiers[userId].converted += 1;
      }
    });

    return Object.values(qualifiers).sort((a, b) => b.converted - a.converted);
  }, [leadHistory, allProfiles]);
  
  // Agenda (Hoje)
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const todayEnd = useMemo(() => endOfDay(new Date()), []);
  const { data: events = [] } = useEvents(organizationId, todayStart, todayEnd);

  // Cálculos rápidos para o Dashboard
  const kpis = useMemo(() => {
    const totalLeads = leads.length;
    const leadsHot = leads.filter(l => l.prioridade === 'alta' || l.prioridade === 'urgente').length;
    const leadsNew = leads.filter(l => l.etapa_kanban === 'leads_recebidos').length;
    const wonLeads = leads.filter(l => l.etapa_kanban === 'efetivados').length;
    const lostLeads = leads.filter(l => l.etapa_kanban === 'desqualificado' || l.etapa_kanban === 'reuniao_sem_sucesso').length;
    
    // Taxas (baseadas no total histórico de leads da organização)
    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
    const lossRate = totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0;

    // Contratos (Mês Atual)
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // wonLeadsMonth: leads que foram marcados como efetivados este mês
    // Note: DashboardPage uses the raw leads list, so we approximate this 
    // by checking leads in 'efetivados' stage that were created this month
    // OR we could use useSalesAnalytics here too. But for simplicity and
    // to match existing DashboardPage patterns:
    const wonLeadsMonth = leads.filter(l => 
      l.etapa_kanban === 'efetivados' && 
      l.created_at && 
      isWithinInterval(parseISO(l.created_at), { start: monthStart, end: monthEnd })
    ).length;

    const leadsCreatedMonth = leads.filter((l) => {
      if (!l.created_at) return false;
      const d = parseISO(l.created_at);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    }).length;
    
    const contractsClosedMonth = (clients as any[]).filter(c => 
      c.contract_status === 'ativo' && 
      c.contract_start && 
      isWithinInterval(parseISO(c.contract_start), { start: monthStart, end: monthEnd })
    ).length;

    const contractsCancelledMonth = (clients as any[]).filter(c => 
      c.contract_status === 'cancelado' && 
      c.contract_end && 
      isWithinInterval(parseISO(c.contract_end), { start: monthStart, end: monthEnd })
    ).length;
    
    // Projetos
    const activeProjects = projects.filter(p => p.status === 'em_andamento').length;
    const lateProjects = projects.filter(p => {
      if (!p.end_date) return false;
      return new Date(p.end_date) < new Date() && p.status !== 'concluida';
    }).length;

    // Progresso de Metas (Média)
    const activeGoals = goals.filter(g => {
        const now = new Date();
        return new Date(g.period_start) <= now && new Date(g.period_end) >= now;
    });
    const avgGoalProgress = activeGoals.length > 0 
        ? activeGoals.reduce((acc, g) => acc + (Math.min(100, (g.current_value / Math.max(1, g.target_value)) * 100)), 0) / activeGoals.length 
        : 0;

    return { 
      totalLeads, leadsHot, leadsNew, wonLeads, 
      conversionRate, lossRate, 
      leadsCreatedMonth,
      contractsClosedMonth, contractsCancelledMonth,
      activeProjects, lateProjects, avgGoalProgress,
      wonLeadsMonth
    };
  }, [leads, projects, goals, clients]);

  const financialSummary = useMemo(() => {
    if (!canViewFinancial) {
      return {
        revenue: 0,
        expense: 0,
        profit: 0,
        pendingReceive: 0,
        pendingPay: 0,
      };
    }
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    // Receita Mensal (Pagamentos recebidos no mês atual)
    const revenueMonth = payments
      .filter(p => p.status === 'pago' && p.paid_at && isWithinInterval(parseISO(p.paid_at), { start: monthStart, end: monthEnd }))
      .reduce((acc, p) => acc + Number(p.value), 0);
    
    // Despesa Mensal
    const expenseMonth = expenses
      .filter(e => e.status === 'pago' && e.paid_at && isWithinInterval(parseISO(e.paid_at), { start: monthStart, end: monthEnd }))
      .reduce((acc, e) => acc + Number(e.value), 0);

    // A Receber (Semana) - Pendentes com vencimento na semana
    const pendingReceive = payments
      .filter(p => p.status !== 'pago' && p.due_date && isWithinInterval(parseISO(p.due_date), { start: weekStart, end: weekEnd }))
      .reduce((acc, p) => acc + Number(p.value), 0);

    // A Pagar (Semana)
    const pendingPay = expenses
      .filter(e => e.status !== 'pago' && e.due_date && isWithinInterval(parseISO(e.due_date), { start: weekStart, end: weekEnd }))
      .reduce((acc, e) => acc + Number(e.value), 0);

    return {
        revenue: revenueMonth,
        expense: expenseMonth,
        profit: revenueMonth - expenseMonth,
        pendingReceive,
        pendingPay
    };
  }, [canViewFinancial, payments, expenses]);

  const chartData = useMemo(() => {
    if (!canViewFinancial) return [];
    const data = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const date = subMonths(now, i);
        const start = startOfMonth(date);
        const end = endOfMonth(date);
        const label = format(date, "MMM", { locale: ptBR });
        
        const rec = payments
            .filter(p => p.status === 'pago' && p.paid_at && isWithinInterval(parseISO(p.paid_at), { start, end }))
            .reduce((acc, p) => acc + Number(p.value), 0);
            
        const desp = expenses
            .filter(e => e.status === 'pago' && e.paid_at && isWithinInterval(parseISO(e.paid_at), { start, end }))
            .reduce((acc, e) => acc + Number(e.value), 0);
            
        data.push({ name: label.charAt(0).toUpperCase() + label.slice(1), rec, desp });
    }
    return data;
  }, [canViewFinancial, payments, expenses]);

  const nextTasks = useMemo(() => {
      // Ordenar eventos por hora
      return events
        .sort((a: any, b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
        .slice(0, 5)
        .map((e: any) => ({
            id: e.id,
            title: e.title,
            time: format(parseISO(e.start_at), "HH:mm"),
            type: e.type || 'outro'
        }));
  }, [events]);

  const funnelData = useMemo(() => {
    const counts = {
      leads_recebidos: leads.filter(l => String(l.etapa_kanban) === 'leads_recebidos').length,
      em_conversa: leads.filter(l => String(l.etapa_kanban) === 'em_conversa').length,
      reuniao_agendada: leads.filter(l => String(l.etapa_kanban) === 'reuniao_agendada').length,
      reuniao_realizada: leads.filter(l => String(l.etapa_kanban) === 'reuniao_realizada').length,
      proposta_enviada: leads.filter(l => String(l.etapa_kanban) === 'proposta_enviada').length,
      follow_up: leads.filter(l => String(l.etapa_kanban) === 'follow_up').length,
      contrato_enviado: leads.filter(l => String(l.etapa_kanban) === 'contrato_enviado').length,
      efetivados: leads.filter(l => String(l.etapa_kanban) === 'efetivados').length,
    };

    return [
      { value: counts.leads_recebidos, name: 'Recebidos', fill: '#94a3b8' },
      { value: counts.em_conversa, name: 'Em Conversa', fill: '#64748b' },
      { value: counts.reuniao_agendada, name: 'Reunião Agend.', fill: '#3b82f6' },
      { value: counts.reuniao_realizada, name: 'Reunião Real.', fill: '#2563eb' },
      { value: counts.proposta_enviada, name: 'Proposta', fill: '#8b5cf6' },
      { value: counts.follow_up, name: 'Follow-up', fill: '#d946ef' },
      { value: counts.contrato_enviado, name: 'Contrato', fill: '#f59e0b' },
      { value: counts.efetivados, name: 'Fechados', fill: '#10b981' },
    ];
  }, [leads]);

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Carregando organização...</p>
      </div>
    );
  }

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Cabeçalho e Ações Rápidas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Olá, {profile?.full_name?.split(' ')[0] || "Visitante"}!</h1>
          <p className="text-muted-foreground">Aqui está o resumo operacional da sua empresa hoje.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/kanban")} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Lead
          </Button>
          <Button variant="outline" onClick={() => navigate("/projects")} className="gap-2">
            <CheckSquare className="h-4 w-4" /> Nova Tarefa
          </Button>
          {canViewFinancial && (
            <Button variant="secondary" onClick={() => navigate("/financial")} className="gap-2">
              <DollarSign className="h-4 w-4" /> Novo Lançamento
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList>
          <TabsTrigger value="dashboard">Visão Geral</TabsTrigger>
          <TabsTrigger value="ranking">Rankings & Performance</TabsTrigger>
          <TabsTrigger value="authorizations" className="relative">
            Autorizações
            {pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 outline-none">
          {/* Cards de Topo - KPIs Críticos Operacionais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leads Gerados (Mês)</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpis.leadsCreatedMonth}</div>
                <Progress
                  value={
                    Math.min(
                      100,
                      (kpis.leadsHot / Math.max(1, kpis.leadsCreatedMonth)) * 100
                    )
                  }
                  className="h-1 mt-2 bg-primary/10"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Contratos Fechados (Mês)</CardTitle>
                <FileCheck className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpis.contractsClosedMonth}</div>
                <p className="text-xs text-muted-foreground">
                  Taxa de Conversão: {kpis.conversionRate.toFixed(1)}%
                </p>
                <Progress value={kpis.conversionRate} className="h-1 mt-2 bg-emerald-100" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Contratos Cancelados (Mês)</CardTitle>
                <FileX className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpis.contractsCancelledMonth}</div>
                <p className="text-xs text-muted-foreground">
                  Taxa de Perda (Leads): {kpis.lossRate.toFixed(1)}%
                </p>
                <Progress value={kpis.lossRate} className="h-1 mt-2 bg-red-100" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projetos Ativos</CardTitle>
                <Briefcase className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpis.activeProjects}</div>
                <p className="text-xs text-muted-foreground">
                  {kpis.lateProjects > 0 ? (
                    <span className="text-red-500 font-medium">{kpis.lateProjects} atrasados</span>
                  ) : (
                    "Todos no prazo"
                  )}
                </p>
                <Progress value={60} className="h-1 mt-2 bg-indigo-100" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Metas (Geral)</CardTitle>
                <Target className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.round(kpis.avgGoalProgress)}%</div>
                <p className="text-xs text-muted-foreground">
                  Progresso geral da agência
                </p>
                <Progress value={kpis.avgGoalProgress} className="h-1 mt-2 bg-amber-100" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Contratos Suspensos</CardTitle>
                <PauseCircle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{contractMetrics.suspendedTotal}</div>
                <p className="text-xs text-muted-foreground">
                  Reativados (mês): {contractMetrics.reactivatedMonth}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* NOVO BLOCO: Performance de Marketing (Soma de todos os clientes) */}
          {canViewPerformance && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold tracking-tight">Desempenho de Marketing (Consolidado)</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-slate-50 dark:bg-slate-900/50 border-none shadow-sm ring-1 ring-slate-200">
                  <CardContent className="pt-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Investimento</p>
                      <DollarSign className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="text-xl font-bold text-slate-900">R$ {perfTotals.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <p className="text-[10px] text-slate-400 mt-1">Total investido em anúncios</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-50 dark:bg-slate-900/50 border-none shadow-sm ring-1 ring-slate-200">
                  <CardContent className="pt-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Leads Marketing</p>
                      <Users className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="text-xl font-bold text-slate-900">{perfTotals.leads.toLocaleString('pt-BR')}</div>
                    <p className="text-[10px] text-slate-400 mt-1">Contatos gerados via campanhas</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-50 dark:bg-slate-900/50 border-none shadow-sm ring-1 ring-slate-200">
                  <CardContent className="pt-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vendas Marketing</p>
                      <Target className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-xl font-bold text-slate-900">{perfTotals.sales.toLocaleString('pt-BR')}</div>
                    <p className="text-[10px] text-slate-400 mt-1">Conversões diretas das campanhas</p>
                  </CardContent>
                </Card>
                <Card className="gradient-primary border-none shadow-sm ring-1 ring-primary/20 text-primary-foreground">
                  <CardContent className="pt-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <p className="text-xs font-bold text-primary-foreground/80 uppercase tracking-wider">ROAS Geral</p>
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="text-xl font-bold">
                      {perfTotals.spend > 0 ? (perfTotals.revenue / perfTotals.spend).toFixed(2) : "0.00"}x
                    </div>
                    <p className="text-[10px] text-primary-foreground/70 mt-1">Retorno sobre investimento</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-none shadow-sm ring-1 ring-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold">Evolução da Performance</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={performanceEvolutionData}>
                        <defs>
                          <linearGradient id="colorSpendOp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorRevenueOp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10}}
                          tickFormatter={(val) => format(parseISO(val), 'dd/MM')}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                          formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR')}`, '']}
                        />
                        <Area type="monotone" dataKey="spend" name="Investimento" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSpendOp)" strokeWidth={2} />
                        <Area type="monotone" dataKey="revenue" name="Faturamento" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenueOp)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm ring-1 ring-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold">Funil de Conversão Consolidado</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center pt-4">
                    <SalesFunnel
                      steps={funnelDataPerf.map((item, idx) => ({
                        label: item.name,
                        value: item.value,
                        rateLabel: idx === 0 ? "CTR" : idx === 1 ? "TX. LEAD" : idx === 2 ? "TX. VENDA" : undefined,
                      }))}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

      <div className="grid grid-cols-1 md:grid-cols-7 gap-6">
        {/* Coluna Principal (Esquerda/Centro) */}
        <div className="md:col-span-4 space-y-6">
          {/* Gráfico de Desempenho Rápido */}
          <Card>
            <CardHeader>
              <CardTitle>Desempenho Financeiro</CardTitle>
              <CardDescription>Receitas vs Despesas nos últimos 6 meses</CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v/1000}k`} />
                    <Tooltip 
                      formatter={(value: number) => fmt(value)}
                      cursor={{fill: 'transparent'}}
                    />
                    <Bar dataKey="rec" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="desp" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Funil de Vendas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Funil de Vendas</CardTitle>
              <CardDescription>Leads que passaram por cada etapa no período</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {funnelLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
              ) : (
                <SalesFunnel
                  steps={funnelStages.map(s => ({ label: s.label, value: s.value, rateLabel: "Conv." }))}
                />
              )}
            </CardContent>
          </Card>

          {/* Projetos Recentes / Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Projetos em Destaque</CardTitle>
                <CardDescription>Acompanhamento de prazos e entregas</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>Ver todos <ArrowRight className="ml-1 h-3 w-3" /></Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {projects.slice(0, 4).map((project) => (
                  <div key={project.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{project.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={project.status === 'concluida' ? 'default' : 'secondary'} className="text-[10px] h-5">
                          {project.status === 'backlog' ? 'Não iniciado' : project.status === 'em_andamento' ? 'Em andamento' : project.status === 'concluida' ? 'Concluído' : 'Bloqueado'}
                        </Badge>
                        {project.end_date && (
                          <span className={`text-xs ${new Date(project.end_date) < new Date() && project.status !== 'concluida' ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                            Prazo: {format(new Date(project.end_date), "dd/MM", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Placeholder de progresso, já que não temos % real no banco ainda */}
                    <div className="w-24 hidden sm:block">
                      <Progress value={project.status === 'concluida' ? 100 : project.status === 'em_andamento' ? 50 : 0} className="h-2" />
                    </div>
                  </div>
                ))}
                {projects.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum projeto ativo.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Lateral (Direita) */}
        <div className="md:col-span-3 space-y-6">
          {/* Agenda / Tarefas do Dia */}
          <Card className="bg-slate-50 dark:bg-slate-900/50 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Agenda do Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {nextTasks.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 bg-background p-3 rounded-lg border shadow-sm">
                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded bg-muted text-muted-foreground shrink-0">
                      <span className="text-xs font-bold">{item.time}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <Badge variant="outline" className="text-[10px] h-5 mt-1">
                        {item.type === 'meeting' ? 'Reunião' : 'Tarefa'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="link" className="w-full mt-2" size="sm" onClick={() => navigate("/agenda")}>
                Ver agenda completa
              </Button>
            </CardContent>
          </Card>

          {canViewFinancial && (
            <Card>
              <CardHeader>
                <CardTitle>Fluxo Imediato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-900/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                      <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">A Receber (Semana)</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">{fmt(financialSummary.pendingReceive)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                      <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">A Pagar (Semana)</p>
                      <p className="text-lg font-bold text-red-700 dark:text-red-400">{fmt(financialSummary.pendingPay)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Campanhas Ativas */}
          <Card>
            <CardHeader>
              <CardTitle>Campanhas Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {campaigns.slice(0, 3).filter(c => c.status === 'Ativa').map((camp) => (
                  <div key={camp.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{camp.name}</span>
                      <span className="text-muted-foreground">{camp.leads} leads</span>
                    </div>
                    <Progress value={70} className="h-1.5" />
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate("/campaign-reports")}>
                  Ver todas as campanhas
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Ranking de Clientes (Performance) */}
          {canViewPerformance && clientRanking.length > 0 && (
            <Card className="border-none shadow-sm ring-1 ring-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Ranking de Performance</CardTitle>
                <CardDescription className="text-[10px]">Por investimento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {clientRanking.slice(0, 5).map((client: any, idx) => (
                  <div key={idx} className="flex items-center justify-between group">
                    <div className="space-y-0.5 truncate pr-2">
                      <p className="font-bold text-[11px] text-slate-800 truncate" title={client.name}>{client.name}</p>
                      <p className="text-[10px] text-slate-500">R$ {client.spend.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-emerald-600">{client.sales} V</p>
                      </div>
                      {client.slug && (
                        <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                          <a href={`/public/dashboard/${client.slug}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TabsContent>

    <TabsContent value="ranking" className="space-y-6 outline-none">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingBlock 
          title="Top Vendedores"
          description="Soma do primeiro pagamento recebido"
          icon={Trophy}
          data={sellerRanking.map(s => ({ 
            name: s.name, 
            value: s.revenue, 
            subValue: `${s.contracts} contratos` 
          }))}
          isCurrency
        />

        <RankingBlock 
          title="Performance de Carteiras"
          description="Média do ROAS dos clientes"
          icon={Award}
          data={portfolioRanking.map(p => ({ 
            name: p.name, 
            value: p.roas, 
            valueSuffix: "x",
            subValue: `Faturamento: ${fmt(p.revenue)}`,
            secondaryLabel: "Equipe Comercial"
          }))}
          valueSuffix="x"
        />

        <RankingBlock 
          title="Execução Operacional"
          description="Projetos concluídos por equipe"
          icon={BriefcaseIcon}
          data={projectsStats.map(p => ({ 
            name: p.name, 
            value: p.completed,
            valueSuffix: " Proj.",
            secondaryLabel: "Equipe"
          }))}
        />

        <RankingBlock 
          title="Qualificação de Clientes"
          description="Leads qualificados que viraram clientes"
          icon={LayoutList}
          data={qualificationRanking.map(q => ({ 
            name: q.name, 
            value: q.converted,
            valueSuffix: " Clientes",
            subValue: `Taxa: ${q.qualified > 0 ? ((q.converted / q.qualified) * 100).toFixed(1) : 0}%`,
            secondaryLabel: "Qualificador"
          }))}
        />
      </div>
    </TabsContent>

    <TabsContent value="authorizations" className="outline-none">
      <AuthorizationsPage embedded />
    </TabsContent>
  </Tabs>
</div>
);
}
