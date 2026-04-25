import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { parseISO, subDays, startOfDay, format, isAfter, isBefore, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Package, Users, DollarSign, AlertTriangle, TrendingUp,
  ShieldOff, PauseCircle, XCircle, CalendarClock, UserCheck, ClipboardList,
} from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useModulePermission } from "@/hooks/usePermissions";
import { useC8Tenants } from "@/hooks/useC8Tenants";
import { useC8Payments } from "@/hooks/useC8Payments";
import { useC8Plans } from "@/hooks/useC8Plans";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { C8TenantList } from "@/components/c8control/C8TenantList";
import { C8PaymentsView } from "@/components/c8control/C8PaymentsView";
import { C8PlansManager } from "@/components/c8control/C8PlansManager";
import { C8SupportTab } from "@/components/c8control/C8SupportTab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const VALID_TABS = ["dashboard", "tenants", "payments", "plans", "support", "audit"] as const;
type TabValue = (typeof VALID_TABS)[number];

const STATUS_BADGE: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  bloqueado: "bg-red-100 text-red-700",
  suspenso: "bg-yellow-100 text-yellow-700",
  cancelado: "bg-slate-100 text-slate-600",
};

export function C8ControlPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { canView, canCreate, canEdit, canDelete } = useModulePermission("c8control" as any);
  const organizationId = useOrganization();
  const { data: tenants } = useC8Tenants(organizationId);
  const { data: plans = [] } = useC8Plans(organizationId);

  // Audit log — sessões dos tenants (últimas 200)
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["crm_sessions_audit", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data } = await supabase
        .from("crm_sessions")
        .select("id, client_id, user_id, created_at, last_activity_at, expires_at, revoked, clients(name)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as unknown as Array<{
        id: string; client_id: string; user_id: string;
        created_at: string; last_activity_at: string; expires_at: string;
        revoked: boolean; clients: { name: string } | null;
      }>;
    },
    enabled: !!organizationId,
  });

  // Payments for the current month
  const now = new Date();
  const monthStart = format(startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), "yyyy-MM-dd");
  const monthEnd = format(startOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)), "yyyy-MM-dd");
  const { payments, legacyPayments } = useC8Payments({
    organizationId,
    periodStart: monthStart,
    periodEnd: monthEnd,
    limit: 500,
  });

  useEffect(() => {
    if (!canView) navigate("/", { replace: true });
  }, [canView, navigate]);

  const tabParam = searchParams.get("tab") as TabValue | null;
  const activeTab: TabValue =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : "dashboard";

  const setTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  if (!canView) return null;

  const today = startOfDay(now);
  const overdueThreshold = subDays(today, 5);
  const expiringThreshold = addDays(today, 30);

  const allTenants = tenants ?? [];

  // Status breakdown
  const activeTenants    = allTenants.filter((t) => t.subscription_status === "ativo");
  const suspendedTenants = allTenants.filter((t) => t.subscription_status === "suspenso");
  const blockedTenants   = allTenants.filter((t) => t.subscription_status === "bloqueado");
  const cancelledTenants = allTenants.filter((t) => t.subscription_status === "cancelado");

  // Revenue
  const expectedMonthly = activeTenants.reduce((sum, t) => sum + t.plan_value, 0);
  const allMonthPayments = [...payments, ...legacyPayments];
  const receivedThisMonth = allMonthPayments
    .filter((p) => p.status === "pago")
    .reduce((sum, p) => sum + p.value, 0);
  const pendingThisMonth = allMonthPayments
    .filter((p) => p.status === "pendente" || p.status === "atrasado")
    .reduce((sum, p) => sum + p.value, 0);

  // Overdue (contract_end passed > 5 days ago)
  const overdueTenants = allTenants.filter((t) => {
    if (!t.contract_end) return false;
    return isBefore(parseISO(t.contract_end), overdueThreshold);
  });

  // Expiring soon (contract_end within next 30 days)
  const expiringTenants = allTenants.filter((t) => {
    if (!t.contract_end) return false;
    const end = parseISO(t.contract_end);
    return isAfter(end, today) && isBefore(end, expiringThreshold);
  });

  // Users utilization
  const totalMaxUsers    = allTenants.reduce((s, t) => s + t.max_users, 0);
  const totalActiveUsers = allTenants.reduce((s, t) => s + t.active_users_count, 0);
  const utilizationPct   = totalMaxUsers > 0 ? Math.round((totalActiveUsers / totalMaxUsers) * 100) : 0;

  // Plans breakdown — clients per plan and revenue per plan
  const planStats = plans
    .filter(p => p.is_active)
    .map(plan => {
      const clientsOnPlan = activeTenants.filter(t => t.plan_name === plan.name);
      return {
        name: plan.name,
        count: clientsOnPlan.length,
        revenue: clientsOnPlan.reduce((s, t) => s + t.plan_value, 0),
        max_users: plan.max_users,
        billing_cycle: plan.billing_cycle,
      };
    })
    .filter(p => p.count > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // Clients with no matching plan (custom/legacy)
  const knownPlanNames = new Set(plans.map(p => p.name));
  const customPlanClients = activeTenants.filter(t => !knownPlanNames.has(t.plan_name));

  // Top clients by value
  const topClients = [...activeTenants]
    .sort((a, b) => b.plan_value - a.plan_value)
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">C8 Control</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="tenants">Clientes</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="support">Suporte</TabsTrigger>
          <TabsTrigger value="audit">
            <ClipboardList className="h-3.5 w-3.5 mr-1" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* ── Dashboard ── */}
        <TabsContent value="dashboard" className="space-y-6 mt-4">

          {/* Row 1 — KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Clientes Ativos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{activeTenants.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{allTenants.length} total</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Receita Mensal</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600">{fmtCurrency(expectedMonthly)}</p>
                <p className="text-xs text-muted-foreground mt-1">esperada este mês</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Recebido no Mês</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">{fmtCurrency(receivedThisMonth)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtCurrency(pendingThisMonth)} a receber
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Inadimplentes</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">{overdueTenants.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtCurrency(overdueTenants.reduce((s, t) => s + t.plan_value, 0))} em risco
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Row 2 — Status breakdown + Users utilization */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Status breakdown */}
            <Card className="sm:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Distribuição por Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Ativos",     count: activeTenants.length,    color: "text-emerald-600", bg: "bg-emerald-50", icon: <UserCheck className="h-4 w-4 text-emerald-600" /> },
                    { label: "Suspensos",  count: suspendedTenants.length, color: "text-yellow-600",  bg: "bg-yellow-50",  icon: <PauseCircle className="h-4 w-4 text-yellow-600" /> },
                    { label: "Bloqueados", count: blockedTenants.length,   color: "text-red-600",     bg: "bg-red-50",     icon: <ShieldOff className="h-4 w-4 text-red-600" /> },
                    { label: "Cancelados", count: cancelledTenants.length, color: "text-slate-500",   bg: "bg-slate-50",   icon: <XCircle className="h-4 w-4 text-slate-500" /> },
                  ].map((s) => (
                    <div key={s.label} className={`flex items-center gap-3 rounded-lg p-3 ${s.bg}`}>
                      {s.icon}
                      <div>
                        <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Users utilization */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Utilização de Usuários</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-bold">{utilizationPct}%</p>
                  <p className="text-sm text-muted-foreground">{totalActiveUsers}/{totalMaxUsers}</p>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, utilizationPct)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalMaxUsers - totalActiveUsers} vagas disponíveis
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Row 2.5 — Plans breakdown */}
          {planStats.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Distribuição por Plano
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {planStats.map((p) => {
                    const pct = activeTenants.length > 0
                      ? Math.round((p.count / activeTenants.length) * 100)
                      : 0;
                    return (
                      <div key={p.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.name}</span>
                            <Badge className="bg-slate-100 text-slate-600 text-xs">
                              {p.count} cliente{p.count !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-right">
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                            <span className="font-semibold text-emerald-700 text-sm">
                              {fmtCurrency(p.revenue)}/mês
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {customPlanClients.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-muted-foreground">Planos customizados</span>
                          <Badge className="bg-slate-100 text-slate-500 text-xs">
                            {customPlanClients.length} cliente{customPlanClients.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <span className="font-semibold text-slate-600 text-sm">
                          {fmtCurrency(customPlanClients.reduce((s, t) => s + t.plan_value, 0))}/mês
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="bg-slate-400 h-1.5 rounded-full"
                          style={{ width: `${activeTenants.length > 0 ? Math.round((customPlanClients.length / activeTenants.length) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Row 3 — Expiring soon + Top clients */}          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Expiring contracts */}
            <Card className={expiringTenants.length > 0 ? "border-yellow-200" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-yellow-600" />
                  Contratos Vencendo em 30 dias
                  {expiringTenants.length > 0 && (
                    <Badge className="bg-yellow-100 text-yellow-700 ml-auto">{expiringTenants.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {expiringTenants.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Nenhum contrato vencendo em breve.</p>
                ) : (
                  <div className="divide-y">
                    {expiringTenants.map((t) => (
                      <div key={t.client_id} className="flex items-center justify-between py-2 text-sm">
                        <span className="font-medium truncate max-w-[140px]">{t.client_name}</span>
                        <div className="flex items-center gap-2 text-right">
                          <span className="text-xs text-muted-foreground">{fmtDate(t.contract_end)}</span>
                          <span className="text-xs font-medium text-yellow-700">{fmtCurrency(t.plan_value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top clients by MRR */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Top Clientes por Receita
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {topClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Nenhum cliente ativo.</p>
                ) : (
                  <div className="divide-y">
                    {topClients.map((t, i) => (
                      <div key={t.client_id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                        <span className="flex-1 font-medium truncate">{t.client_name}</span>
                        <Badge className={STATUS_BADGE[t.subscription_status] ?? "bg-muted text-muted-foreground"}>
                          {t.plan_name}
                        </Badge>
                        <span className="font-semibold text-emerald-700">{fmtCurrency(t.plan_value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 4 — Overdue list (only if any) */}
          {overdueTenants.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  Inadimplentes ({overdueTenants.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-red-100">
                  {overdueTenants.map((t) => (
                    <div key={t.client_id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-medium text-red-900">{t.client_name}</span>
                        <p className="text-xs text-red-500">{t.plan_name}</p>
                      </div>
                      <div className="flex items-center gap-4 text-red-700">
                        <span className="font-semibold">{fmtCurrency(t.plan_value)}</span>
                        <span className="text-xs">Venc. {fmtDate(t.contract_end)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        </TabsContent>

        {/* ── Clientes ── */}
        <TabsContent value="tenants" className="mt-4">
          {organizationId && (
            <C8TenantList
              organizationId={organizationId}
              canCreate={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          )}
        </TabsContent>

        {/* ── Pagamentos ── */}
        <TabsContent value="payments" className="mt-4">
          {organizationId && (
            <C8PaymentsView
              organizationId={organizationId}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          )}
        </TabsContent>

        {/* ── Planos ── */}
        <TabsContent value="plans" className="mt-4">
          {organizationId && (
            <C8PlansManager organizationId={organizationId} canEdit={canEdit} />
          )}
        </TabsContent>

        {/* ── Suporte ── */}
        <TabsContent value="support" className="mt-4">
          {organizationId && (
            <C8SupportTab organizationId={organizationId} canEdit={canEdit} />
          )}
        </TabsContent>

        {/* ── Audit Log ── */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Sessões dos Tenants (últimas 200)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sessionsLoading ? (
                <p className="text-sm text-muted-foreground p-4">Carregando...</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma sessão registrada.</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Usuário ID</TableHead>
                        <TableHead>Início</TableHead>
                        <TableHead>Última atividade</TableHead>
                        <TableHead>Expira em</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((s) => {
                        const isExpired = new Date(s.expires_at) < new Date();
                        const isActive = !s.revoked && !isExpired;
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.clients?.name ?? s.client_id.slice(0, 8)}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{s.user_id.slice(0, 8)}…</TableCell>
                            <TableCell className="text-xs">{format(parseISO(s.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                            <TableCell className="text-xs">{format(parseISO(s.last_activity_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                            <TableCell className="text-xs">{format(parseISO(s.expires_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                            <TableCell>
                              {s.revoked ? (
                                <Badge className="bg-red-100 text-red-700 text-xs">Revogada</Badge>
                              ) : isExpired ? (
                                <Badge className="bg-slate-100 text-slate-500 text-xs">Expirada</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-700 text-xs">Ativa</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default C8ControlPage;
