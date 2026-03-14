/* eslint-disable @typescript-eslint/no-explicit-any */
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { useProjects } from "@/hooks/useProjects";
import { usePayments, useSupplierExpenses } from "@/hooks/useFinancial";
import { useEvents } from "@/hooks/useEvents";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useGoals } from "@/hooks/useGoalsCRUD";
import { useContractMetrics } from "@/hooks/useContractMetrics";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermission } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, TrendingDown, DollarSign, Users, Target, 
  Calendar, CheckSquare, Plus, ArrowRight, AlertTriangle,
  Briefcase, Megaphone, Activity, FileCheck, FileX, PauseCircle
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, parseISO, subMonths, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
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
  FunnelChart,
  Funnel,
  LabelList
} from "recharts";

export function DashboardPage() {
  const organizationId = useOrganization();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { canView: canViewFinancial } = useModulePermission("financial");
  const contractMetrics = useContractMetrics(organizationId);

  // Hooks para dados
  // for dashboard metrics we want *all* leads, even those already
  // converted to clients. the kanban hook defaults to hiding them, but the
  // dashboard should still count closed/realized contracts.
  const { leads } = useLeadsKanban(organizationId, { includeConverted: true });
  const { data: clients = [] } = useClients(organizationId);
  const { data: projects = [] } = useProjects(organizationId);
  const { data: goals = [] } = useGoals(organizationId);
  const { campaigns, totals: campTotals } = useCampaigns();
  
  // Dados Financeiros
  const { data: payments = [] } = usePayments(organizationId, { enabled: canViewFinancial });
  const { data: expenses = [] } = useSupplierExpenses(organizationId, { enabled: canViewFinancial });

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
    
    // Taxas
    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
    const lossRate = totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0;

    // Contratos (Mês Atual)
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

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
      activeProjects, lateProjects, avgGoalProgress 
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

      {/* Cards de Topo - KPIs Críticos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Gerados (Mês)</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.leadsCreatedMonth}</div>
            {/* subtitle removed per requirement – only the raw number should show */}
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
            <CardHeader>
              <CardTitle>Funil de Vendas</CardTitle>
              <CardDescription>Conversão de Leads</CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={32}>
                      <LabelList dataKey="value" position="right" fill="#000" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
        </div>
      </div>
    </div>
  );
}
