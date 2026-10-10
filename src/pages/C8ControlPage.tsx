import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { parseISO, subDays, startOfDay, format, isAfter, isBefore, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Package, Users, DollarSign, AlertTriangle, TrendingUp,
  ShieldOff, PauseCircle, XCircle, CalendarClock, UserCheck, ClipboardList,
  CheckCircle2, XCircle as XCircleIcon, Search,
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
import { Button } from "@/components/ui/button";
import { useAllClientIntegrations } from "@/hooks/useHubPerformance";
import { useC8AuditLogs } from "@/hooks/useC8AuditLogs";
import { C8TenantList } from "@/components/c8control/C8TenantList";
import { C8PaymentsView } from "@/components/c8control/C8PaymentsView";
import { C8PlansManager } from "@/components/c8control/C8PlansManager";
import { C8SupportTab } from "@/components/c8control/C8SupportTab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { C8Tenant } from "@/hooks/useC8Tenants";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const VALID_TABS = ["dashboard", "tenants", "payments", "plans", "support", "integrations", "audit"] as const;
type TabValue = (typeof VALID_TABS)[number];

const STATUS_BADGE: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  bloqueado: "bg-red-100 text-red-700",
  suspenso: "bg-yellow-100 text-yellow-700",
  cancelado: "bg-slate-100 text-slate-600",
};

// ── Helpers de status de integração ─────────────────────────────────────────

function StatusDot({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null)
    return (
      <span className="flex items-center gap-1 text-xs text-slate-400">
        <span className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />
        {label}
      </span>
    );
  return ok ? (
    <span className="flex items-center gap-1 text-xs text-emerald-600">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-red-500">
      <XCircleIcon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}

// ── Componente: visão geral de integrações por cliente ───────────────────────

type ColFilter = "all" | "connected" | "disconnected";

const COLUMNS = [
  { key: "facebook",     label: "Facebook" },
  { key: "instagram",    label: "Instagram" },
  { key: "whatsapp",     label: "WhatsApp" },
  { key: "meta_ads",     label: "Meta Ads" },
  { key: "google",       label: "Google Ads" },
  { key: "google_calendar", label: "Google Agenda" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

function C8IntegrationsOverview({
  organizationId,
  tenants,
  onSelectTenant,
}: {
  organizationId: string;
  tenants: C8Tenant[];
  onSelectTenant: (clientId: string) => void;
}) {
  const navigate = useNavigate();
  const { data: allIntegrations = [] } = useAllClientIntegrations(organizationId);

  const [search,     setSearch]     = useState("");
  const [colFilters, setColFilters] = useState<Partial<Record<ColKey, ColFilter>>>({});

  // Mapas por plataforma — chave: client_id
  const byPlatform = (platform: string) =>
    new Map(allIntegrations.filter(i => i.platform === platform).map(i => [i.client_id, i]));

  const maps: Record<ColKey, Map<string, unknown>> = {
    facebook:        byPlatform("facebook"),
    instagram:       byPlatform("instagram"),
    whatsapp:        byPlatform("whatsapp"),
    meta_ads:        byPlatform("meta_ads"),
    google:          byPlatform("google"),
    google_calendar: byPlatform("google_calendar"),
  };
  // "meta" legado para Meta Ads
  const metaLegacy = byPlatform("meta");

  const intOk = (
    clientId: string,
    map: Map<string, unknown>,
    legacy?: Map<string, { sync_status?: string | null; is_connected?: boolean }>
  ) => {
    const entry = (map.get(clientId) ?? legacy?.get(clientId)) as
      { sync_status?: string | null; is_connected?: boolean } | undefined;
    if (!entry) return null;
    if (entry.is_connected === false) return false;
    return entry.sync_status !== "error";
  };

  const setColFilter = (col: ColKey, val: ColFilter) =>
    setColFilters(prev => ({ ...prev, [col]: val }));

  const hasColFilters = Object.values(colFilters).some(v => v && v !== "all");

  const rows = [...tenants]
    .sort((a, b) => a.client_name.localeCompare(b.client_name))
    .filter(row => {
      // Filtro por nome
      if (search.trim() && !row.client_name.toLowerCase().includes(search.toLowerCase())) return false;
      // Filtro por coluna
      for (const [col, filter] of Object.entries(colFilters) as [ColKey, ColFilter][]) {
        if (!filter || filter === "all") continue;
        const map = maps[col];
        const legacy = col === "meta_ads" ? metaLegacy : undefined;
        const ok = intOk(row.client_id, map, legacy as any);
        if (filter === "connected"    && ok !== true)  return false;
        if (filter === "disconnected" && ok === true)  return false;
      }
      return true;
    });

  return (
    <div className="space-y-3">
      {/* ── Filtros ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Busca por nome */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="pl-8 h-8 text-xs w-48"
          />
        </div>

        {/* Filtro por coluna */}
        {COLUMNS.map(col => (
          <Select
            key={col.key}
            value={colFilters[col.key] ?? "all"}
            onValueChange={v => setColFilter(col.key, v as ColFilter)}
          >
            <SelectTrigger className={`h-8 text-xs w-auto gap-1 ${colFilters[col.key] && colFilters[col.key] !== "all" ? "border-primary text-primary" : ""}`}>
              <SelectValue placeholder={col.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{col.label}: Todos</SelectItem>
              <SelectItem value="connected">{col.label}: Conectado</SelectItem>
              <SelectItem value="disconnected">{col.label}: Não conectado</SelectItem>
            </SelectContent>
          </Select>
        ))}

        {/* Limpar filtros */}
        {(search || hasColFilters) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => { setSearch(""); setColFilters({}); }}
          >
            <XCircleIcon className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {/* ── Tabela ────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum cliente encontrado com esses filtros.
        </p>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-slate-600 uppercase tracking-wider">Cliente</th>
                <th className="text-center px-4 py-2.5 font-semibold text-xs text-slate-600 uppercase tracking-wider">Status</th>
                {COLUMNS.map(col => (
                  <th key={col.key} className="text-center px-4 py-2.5 font-semibold text-xs text-slate-600 uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {rows.map(row => {
                const statusBadge = STATUS_BADGE[row.subscription_status] ?? "bg-muted text-muted-foreground";
                const statusLabel: Record<string, string> = {
                  ativo: "Ativo", bloqueado: "Bloqueado",
                  suspenso: "Suspenso", cancelado: "Cancelado",
                };
                return (
                  <tr
                    key={row.client_id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => {
                      onSelectTenant(row.client_id);
                      navigate(`/c8control?tab=tenants&client=${row.client_id}&subtab=integracoes`);
                    }}
                    title="Clique para abrir integrações deste cliente"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{row.client_name}</p>
                      <p className="text-xs text-muted-foreground">{row.plan_name}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`text-xs ${statusBadge}`}>
                        {statusLabel[row.subscription_status] ?? row.subscription_status}
                      </Badge>
                    </td>
                    {COLUMNS.map(col => {
                      const ok = intOk(
                        row.client_id,
                        maps[col.key],
                        col.key === "meta_ads" ? metaLegacy as any : undefined
                      );
                      return (
                        <td key={col.key} className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <StatusDot ok={ok} label={ok === true ? "Conectado" : "Não conectado"} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Componente: Audit Log do C8 Control ─────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  create_client:     "Cliente criado",
  update_client:     "Cliente atualizado",
  block_client:      "Cliente bloqueado",
  unblock_client:    "Cliente desbloqueado",
  suspend_client:    "Cliente suspenso",
  cancel_client:     "Cliente cancelado",
  delete_client:     "Cliente removido",
  renew_contract:    "Contrato renovado",
  grant_free_access: "Acesso gratuito liberado",
  revoke_free_access:"Acesso gratuito revogado",
  reset_password:    "Senha redefinida",
};

function C8AuditLogTab({
  organizationId,
  tenants,
}: {
  organizationId: string;
  tenants: C8Tenant[];
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState("");

  // Sessões (sub-seção)
  const [showSessions, setShowSessions] = useState(false);
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
    enabled: !!organizationId && showSessions,
  });

  const { logs, isLoading } = useC8AuditLogs({
    organizationId,
    clientId: clientFilter !== "all" ? clientFilter : undefined,
    action: actionFilter !== "all" ? actionFilter : undefined,
    userSearch: userFilter.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Audit Log — C8 Control
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">De</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Até</label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Cliente</label>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {tenants.map(t => (
                    <SelectItem key={t.client_id} value={t.client_id}>{t.client_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Ação</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Usuário</label>
              <Input
                placeholder="Nome ou e-mail"
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de logs */}
      <div className="rounded-lg border overflow-hidden">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-4 text-center">Carregando logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">
            Nenhum registro encontrado para os filtros aplicados.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Data/Hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Descrição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(parseISO(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium">{log.user_name ?? "—"}</p>
                    {log.user_role && (
                      <p className="text-[10px] text-muted-foreground">{log.user_role}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{log.client_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className="text-xs bg-slate-100 text-slate-700">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {log.description ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Sub-seção: Sessões dos tenants */}
      <div>
        <button
          className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
          onClick={() => setShowSessions(v => !v)}
        >
          {showSessions ? "Ocultar" : "Ver"} sessões de acesso ao C8 Control
        </button>
        {showSessions && (
          <div className="mt-3 rounded-lg border overflow-hidden">
            {sessionsLoading ? (
              <p className="text-sm text-muted-foreground p-4">Carregando sessões...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma sessão registrada.</p>
            ) : (
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
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium text-sm">
                          {s.clients?.name ?? s.client_id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {s.user_id.slice(0, 8)}…
                        </TableCell>
                        <TableCell className="text-xs">
                          {format(parseISO(s.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {format(parseISO(s.last_activity_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {format(parseISO(s.expires_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function C8ControlPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { canView, canCreate, canEdit, canDelete } = useModulePermission("c8control" as any);
  const organizationId = useOrganization();
  const { data: tenants } = useC8Tenants(organizationId);
  const { data: plans = [] } = useC8Plans(organizationId);

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
  const clientParam = searchParams.get("client") ?? undefined; // clientId vindo do cadastro
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

  // Overdue (contract_end passed > 5 days ago) — exclui acesso gratuito e incluído
  const overdueTenants = allTenants.filter((t) => {
    if (t.c8_free_access || t.c8_included || t.plan_value === 0) return false;
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
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
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
                      <div
                        key={t.client_id}
                        className="flex items-center justify-between py-2 text-sm cursor-pointer hover:bg-yellow-50 rounded px-1 transition-colors"
                        onClick={() => navigate(`/clients/${t.client_id}?tab=pagamentos`)}
                        title="Ver pagamentos do cliente"
                      >
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
                    <div
                      key={t.client_id}
                      className="flex items-center justify-between py-2 text-sm cursor-pointer hover:bg-red-100 rounded px-1 transition-colors"
                      onClick={() => { setTab("payments"); }}
                      title="Ver pagamentos do C8 Control"
                    >
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
              initialClientId={clientParam}
              initialTab={searchParams.get("subtab") ? "configuracoes" : undefined}
              initialSubTab={searchParams.get("subtab") ?? undefined}
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

        {/* ── Integrações ── */}
        <TabsContent value="integrations" className="mt-4">
          {organizationId && (
            <C8IntegrationsOverview
              organizationId={organizationId}
              tenants={tenants ?? []}
              onSelectTenant={(clientId) => {
                const next = new URLSearchParams(searchParams);
                next.set("tab", "tenants");
                next.set("client", clientId);
                next.set("subtab", "integracoes");
                setSearchParams(next, { replace: true });
              }}
            />
          )}
        </TabsContent>

        {/* ── Audit Log ── */}
        <TabsContent value="audit" className="mt-4">
          {organizationId && <C8AuditLogTab organizationId={organizationId} tenants={tenants ?? []} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default C8ControlPage;
