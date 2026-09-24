import { useCallback, useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import { usePayments, useSupplierExpenses } from "@/hooks/useFinancial";
import { useProjects } from "@/hooks/useProjects";
import { useGoals } from "@/hooks/useGoalsCRUD";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { useCampaigns } from "@/hooks/useCampaigns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SalesFunnel } from "@/components/ui/sales-funnel";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import { Download, FileDown, Users, DollarSign, Target, Kanban, FolderKanban, TrendingUp, AlertTriangle, Megaphone } from "lucide-react";
import { startOfDay, subDays, startOfYear, endOfDay, startOfMonth, endOfMonth, isWithinInterval, format, addDays, subMonths, parseISO } from "date-fns";
import { ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from "recharts";
import { useTimeClockState, useRegisterPunch, useRepPRequestOvertime } from "@/hooks/useTimeClock";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type PeriodPreset = "today" | "7d" | "30d" | "month" | "90d" | "ytd" | "custom";
type ReportTemplate = "macro" | "financeiro" | "projetos" | "campanhas" | "crm" | "metas" | "ponto_eletronico";

type RepPDailyRow = {
  organization_id: string;
  user_id: string;
  work_date: string;
  entrada_at: string | null;
  saida_intervalo_at: string | null;
  retorno_intervalo_at: string | null;
  saida_final_at: string | null;
  worked_hours: number;
  break_minutes: number;
  inconsistencies_count: number;
  day_status: string;
  delay_minutes: number;
  overtime_minutes: number;
  overtime_status: "pendente" | "aprovado" | "rejeitado";
  overtime_justification: string | null;
  overtime_authorized_by: string | null;
};

type RepPMonthlyRow = {
  organization_id: string;
  user_id: string;
  month_ref: string;
  days_count: number;
  total_worked_hours: number;
  inconsistencies_count: number;
  total_delay_minutes: number;
  total_approved_overtime_minutes: number;
  total_pending_overtime_minutes: number;
};

type RepPOvertimeRequest = {
  id: string;
  organization_id: string;
  user_id: string;
  user_name: string | null;
  work_date: string;
  minutes_requested: number;
  status: "pendente" | "aprovado" | "rejeitado";
  justification: string;
  created_at: string;
};

type RepPInconsistencyRow = {
  id: string;
  organization_id: string;
  user_id: string;
  user_name: string | null;
  punch_id: string | null;
  type: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type RepPAdminChangeRow = {
  id: string;
  organization_id: string;
  action_type: string;
  punch_id: string | null;
  action_by_name: string | null;
  action_by: string | null;
  action_at: string;
  justification: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  integrity_hash: string;
  target_user_name: string | null;
  target_user_id: string | null;
  punch_occurred_at: string | null;
  punch_type: string | null;
};

type RepPWeeklyRow = {
  organization_id: string;
  user_id: string;
  week_start: string;
  weekly_worked_hours: number;
  weekly_delay_minutes: number;
  weekly_approved_overtime_minutes: number;
  expected_weekly_hours: number;
  weekly_balance_hours: number;
  has_negative_hours: boolean;
};

type RepPCLTComplianceRow = {
  organization_id: string;
  user_id: string;
  user_name: string;
  work_date: string;
  worked_hours: number;
  delay_minutes: number;
  overtime_minutes: number;
  overtime_status: string;
  day_status: string;
  is_short_day: boolean;
};

export default function ReportsPage() {
  const orgId = useOrganization();
  const { profile: me } = useAuth();
  const { pinProps, requirePin } = usePinConfirm();
  const { canView: canViewReports, isAdminOrOwner } = usePermissionForScope("financial", "reports");
  const { canView: canEditTimeclock } = usePermissionForScope("team", "timeclock_edit");
  const { data: teams = [] } = useTeams(orgId);
  const { data: profiles = [] } = useProfiles(orgId);
  const { data: members = [] } = useTeamMembers(orgId);
  const { data: clients = [] } = useClients(orgId);
  const { data: payments = [] } = usePayments(orgId, { enabled: !!orgId && !!me?.id && canViewReports });
  const { data: expenses = [] } = useSupplierExpenses(orgId, { enabled: !!orgId && !!me?.id && canViewReports });
  const { data: projects = [] } = useProjects(orgId);
  const { data: goals = [] } = useGoals(orgId);
  const { leads } = useLeadsKanban(orgId, { includeConverted: true });
  const { campaigns, totals: campTotals, metrics: campMetrics } = useCampaigns();

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [reportTemplate, setReportTemplate] = useState<ReportTemplate>("macro");

  // Funil de Vendas
  const { stages: funnelStages, isLoading: funnelLoading } = useFunnelStages(orgId);

  const requestOvertime = useRepPRequestOvertime();
  const [selectedOvertime, setSelectedOvertime] = useState<{ workDate: string; minutes: number } | null>(null);
  const [justification, setJustification] = useState("");

  const handleRequestOvertime = async () => {
    if (!selectedOvertime || !justification) return;
    try {
      await requestOvertime.mutateAsync({
        workDate: selectedOvertime.workDate,
        minutes: selectedOvertime.minutes,
        justification
      });
      setSelectedOvertime(null);
      setJustification("");
      repPDaily.refetch();
    } catch (err: any) {
      alert("Erro ao solicitar hora extra: " + err.message);
    }
  };

  const resetFilters = useCallback(() => {
    setTeamFilter("all");
    setProfileFilter("all");
    setClientFilter("all");
  }, []);

  const handleTemplateChange = (v: ReportTemplate) => {
    setReportTemplate(v);
    resetFilters();
  };

  const interval = useMemo(() => {
    if (preset === "custom" && from && to) {
      return { start: startOfDay(new Date(from)), end: endOfDay(new Date(to)) };
    }
    const end = endOfDay(new Date());
    if (preset === "today") return { start: startOfDay(new Date()), end };
    if (preset === "7d") return { start: startOfDay(subDays(new Date(), 7)), end };
    if (preset === "month") return { start: startOfMonth(new Date()), end: endOfMonth(new Date()) };
    if (preset === "90d") return { start: startOfDay(subDays(new Date(), 90)), end };
    if (preset === "ytd") return { start: startOfYear(new Date()), end };
    return { start: startOfMonth(new Date()), end: endOfMonth(new Date()) };
  }, [preset, from, to]);

  const repPFrom = interval.start.toISOString().split("T")[0];
  const repPTo = interval.end.toISOString().split("T")[0];

  const repPDaily = useQuery({
    queryKey: ["rep_p", "reports", "daily", orgId, me?.id, reportTemplate, repPFrom, repPTo, isAdminOrOwner, profileFilter],
    queryFn: async () => {
      if (!orgId) return [] as RepPDailyRow[];
      let q = supabase
        .from("rep_p_daily_report" as never)
        .select("*")
        .eq("organization_id", orgId)
        .gte("work_date", repPFrom)
        .lte("work_date", repPTo)
        .order("work_date", { ascending: false });
      
      if (!isAdminOrOwner && me?.id) {
        q = q.eq("user_id", me.id);
      } else if (profileFilter !== "all") {
        q = q.eq("user_id", profileFilter);
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepPDailyRow[];
    },
    enabled: !!orgId && !!me?.id && canEditTimeclock && reportTemplate === "ponto_eletronico",
  });

  const repPWeekly = useQuery({
    queryKey: ["rep_p", "reports", "weekly", orgId, me?.id, reportTemplate, repPFrom, repPTo, isAdminOrOwner, profileFilter],
    queryFn: async () => {
      if (!orgId) return [] as RepPWeeklyRow[];
      let q = supabase
        .from("rep_p_weekly_report" as never)
        .select("*")
        .eq("organization_id", orgId)
        .order("week_start", { ascending: false });
      
      if (!isAdminOrOwner && me?.id) {
        q = q.eq("user_id", me.id);
      } else if (profileFilter !== "all") {
        q = q.eq("user_id", profileFilter);
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepPWeeklyRow[];
    },
    enabled: !!orgId && !!me?.id && canEditTimeclock && reportTemplate === "ponto_eletronico",
  });

  const repPCLTCompliance = useQuery({
    queryKey: ["rep_p", "reports", "clt_compliance", orgId, me?.id, reportTemplate, repPFrom, repPTo, isAdminOrOwner, profileFilter],
    queryFn: async () => {
      if (!orgId) return [] as RepPCLTComplianceRow[];
      let q = supabase
        .from("rep_p_clt_compliance_report" as never)
        .select("*")
        .eq("organization_id", orgId)
        .gte("work_date", repPFrom)
        .lte("work_date", repPTo)
        .order("work_date", { ascending: false });
      
      if (!isAdminOrOwner && me?.id) {
        q = q.eq("user_id", me.id);
      } else if (profileFilter !== "all") {
        q = q.eq("user_id", profileFilter);
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepPCLTComplianceRow[];
    },
    enabled: !!orgId && !!me?.id && canEditTimeclock && reportTemplate === "ponto_eletronico",
  });

  const repPMonthly = useQuery({
    queryKey: ["rep_p", "reports", "monthly", orgId, me?.id, reportTemplate, repPFrom, repPTo, isAdminOrOwner, profileFilter],
    queryFn: async () => {
      if (!orgId) return [] as RepPMonthlyRow[];
      let q = supabase
        .from("rep_p_monthly_report" as never)
        .select("*")
        .eq("organization_id", orgId)
        .order("month_ref", { ascending: false });
      
      if (!isAdminOrOwner && me?.id) {
        q = q.eq("user_id", me.id);
      } else if (profileFilter !== "all") {
        q = q.eq("user_id", profileFilter);
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepPMonthlyRow[];
    },
    enabled: !!orgId && !!me?.id && canEditTimeclock && reportTemplate === "ponto_eletronico",
  });

  const repPInconsistencies = useQuery({
    queryKey: ["rep_p", "reports", "inconsistencies", orgId, me?.id, reportTemplate, interval.start.toISOString(), interval.end.toISOString(), isAdminOrOwner],
    queryFn: async () => {
      if (!orgId) return [] as RepPInconsistencyRow[];
      let q = supabase
        .from("rep_p_inconsistencies_report" as never)
        .select("*")
        .eq("organization_id", orgId)
        .gte("created_at", interval.start.toISOString())
        .lte("created_at", interval.end.toISOString())
        .order("created_at", { ascending: false });
      if (!isAdminOrOwner && me?.id) q = q.eq("user_id", me.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepPInconsistencyRow[];
    },
    enabled: !!orgId && !!me?.id && canEditTimeclock && reportTemplate === "ponto_eletronico",
  });

  const repPAdminChanges = useQuery({
    queryKey: ["rep_p", "reports", "admin_changes", orgId, me?.id, reportTemplate, interval.start.toISOString(), interval.end.toISOString(), isAdminOrOwner],
    queryFn: async () => {
      if (!orgId) return [] as RepPAdminChangeRow[];
      let q = supabase
        .from("rep_p_admin_changes_report" as never)
        .select("*")
        .eq("organization_id", orgId)
        .gte("action_at", interval.start.toISOString())
        .lte("action_at", interval.end.toISOString())
        .order("action_at", { ascending: false });
      if (!isAdminOrOwner && me?.id) q = q.eq("target_user_id", me.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepPAdminChangeRow[];
    },
    enabled: !!orgId && !!me?.id && canEditTimeclock && reportTemplate === "ponto_eletronico",
  });

  const repPOvertimeRequests = useQuery({
    queryKey: ["rep_p", "reports", "overtime_requests", orgId, me?.id, reportTemplate, isAdminOrOwner],
    queryFn: async () => {
      if (!orgId) return [] as RepPOvertimeRequest[];
      let q = supabase
        .from("rep_p_overtime_authorizations" as never)
        .select("*, profiles!inner(full_name)")
        .eq("organization_id", orgId)
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      
      if (!isAdminOrOwner && me?.id) q = q.eq("user_id", me.id);
      
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        user_name: r.profiles?.full_name ?? null
      })) as RepPOvertimeRequest[];
    },
    enabled: !!orgId && !!me?.id && canEditTimeclock && reportTemplate === "ponto_eletronico",
  });

  const authorizeOvertime = (id: string, status: "aprovado" | "rejeitado") => {
    const label = status === "aprovado" ? "Autorizar hora extra" : "Rejeitar hora extra";
    const desc = status === "aprovado"
      ? "Confirme com seu PIN para autorizar a hora extra."
      : "Confirme com seu PIN para rejeitar a solicitação.";
    requirePin(label, desc, async () => {
      const { error } = await supabase
        .from("rep_p_overtime_authorizations")
        .update({ status, authorized_at: new Date().toISOString(), authorized_by: me?.id })
        .eq("id", id);
      if (error) { alert("Erro ao atualizar autorização: " + error.message); return; }
      repPOvertimeRequests.refetch();
      repPDaily.refetch();
    });
  };

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      try {
        const d = new Date(p.due_date);
        return isWithinInterval(d, interval);
      } catch {
        return false;
      }
    });
  }, [payments, interval]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      try {
        const d = new Date(e.due_date);
        return isWithinInterval(d, interval);
      } catch {
        return false;
      }
    });
  }, [expenses, interval]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (teamFilter !== "all" && p.responsible_type === "team" && p.responsible_id !== teamFilter) return false;
      if (profileFilter !== "all" && p.responsible_type === "profile" && p.responsible_id !== profileFilter) return false;
      return true;
    });
  }, [projects, teamFilter, profileFilter]);

  const kpis = useMemo(() => {
    const activeClients = clients.length;
    const revenueMonth = filteredPayments.filter((p) => p.paid_at).reduce((s, r) => s + Number(r.value ?? 0), 0);
    const toReceive = filteredPayments.filter((p) => !p.paid_at).reduce((s, r) => s + Number(r.value ?? 0), 0);
    const toPay = filteredExpenses.filter((e) => !e.paid_at).reduce((s, r) => s + Number(r.value ?? 0), 0);
    const activeProjects = projects.filter((p) => p.status !== "concluida").length;
    const leadsEsteira = leads.filter((l) => l.etapa_kanban !== "efetivados" && l.etapa_kanban !== "desqualificado" && l.etapa_kanban !== "reuniao_sem_sucesso").length;
    const closed = leads.filter((l) => l.etapa_kanban === "efetivados").length;
    const conv = leads.length > 0 ? (closed / leads.length) * 100 : 0;
    const overdue = projects.filter((p) => p.status !== "concluida" && p.end_date && new Date(p.end_date) < new Date()).length;
    const nearDue = projects.filter((p) => {
      if (p.status === "concluida" || !p.end_date) return false;
      const d = new Date(p.end_date);
      const diff = (d.getTime() - new Date().getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 7;
    }).length;

    return { activeClients, revenueMonth, received: revenueMonth, toReceive, toPay, activeProjects, leadsEsteira, conv, overdue, nearDue };
  }, [clients, filteredPayments, filteredExpenses, projects, leads]);

  const projectsByPhase = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    });
    return Object.entries(counts).map(([fase, quantidade]) => ({ fase, quantidade }));
  }, [projects]);

  const projectsByTeam = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      if (p.responsible_type === "team" && p.responsible_id) {
        const teamName = teams.find((t) => t.id === p.responsible_id)?.name ?? "Sem equipe";
        counts[teamName] = (counts[teamName] ?? 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [projects, teams]);

  const expensePie = useMemo(() => {
    const cat: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      const c = e.category || "Outros";
      cat[c] = (cat[c] ?? 0) + Number(e.value ?? 0);
    });
    return Object.entries(cat).map(([name, value]) => ({ name, value }));
  }, [filteredExpenses]);

  const cashflowLine = useMemo(() => {
    const days: Record<string, { entradas: number; saidas: number }> = {};
    filteredPayments.forEach((p) => {
      const d = p.due_date;
      if (!days[d]) days[d] = { entradas: 0, saidas: 0 };
      days[d].entradas += Number(p.value ?? 0);
    });
    filteredExpenses.forEach((e) => {
      const d = e.due_date;
      if (!days[d]) days[d] = { entradas: 0, saidas: 0 };
      days[d].saidas += Number(e.value ?? 0);
    });
    return Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: format(new Date(date), "dd/MM"), ...vals }));
  }, [filteredPayments, filteredExpenses]);

  const goalsByTeam = useMemo(() => {
    return teams.map((t) => {
      const teamGoals = (goals as any[]).filter((g) => g.responsible_type === "team" && g.responsible_id === t.id);
      const target = teamGoals.reduce((s, g) => s + Number(g.target_value || 0), 0);
      const current = teamGoals.reduce((s, g) => s + Number(g.current_value || 0), 0);
      return { name: t.name, percent: target > 0 ? (current / target) * 100 : 0 };
    }).filter(t => t.percent > 0);
  }, [teams, goals]);

  const goalsByResponsible = useMemo(() => {
    const respMap: Record<string, { target: number; current: number }> = {};
    (goals as any[]).forEach((g) => {
      if ((g.responsible_type === "profile" || g.responsible_type === "individual") && g.responsible_id) {
        const name = profiles.find((p) => p.id === g.responsible_id)?.full_name ?? "Desconhecido";
        if (!respMap[name]) respMap[name] = { target: 0, current: 0 };
        respMap[name].target += Number(g.target_value || 0);
        respMap[name].current += Number(g.current_value || 0);
      }
    });
    return Object.entries(respMap).map(([name, vals]) => ({
      name,
      percent: vals.target > 0 ? (vals.current / vals.target) * 100 : 0,
    })).filter(r => r.percent > 0);
  }, [goals, profiles]);

  const funnelData = useMemo(() => {
    const stages = [
      { id: "leads", label: "Leads", fill: "#94a3b8" },
      { id: "primeiro_contato", label: "Contato", fill: "#60a5fa" },
      { id: "reuniao_agendada", label: "Agendado", fill: "#818cf8" },
      { id: "proposta_enviada", label: "Proposta", fill: "#a78bfa" },
      { id: "negociacao", label: "Negociação", fill: "#c084fc" },
      { id: "efetivados", label: "Fechado", fill: "#22c55e" },
    ];
    return stages.map((s) => ({
      stage: s.label,
      count: leads.filter((l) => l.etapa_kanban === s.id).length,
      fill: s.fill,
    }));
  }, [leads]);

  const campaignData = useMemo(() => {
    return (campaigns as any[]).map((c) => ({
      name: c.name,
      status: c.status,
      budget: Number(c.budget || 0),
      spent: Number(c.spend || 0),
      leads: leads.filter((l: any) => l.campaign_id === c.id).length,
      cpl: leads.filter((l: any) => l.campaign_id === c.id).length > 0 ? Number(c.spend || 0) / leads.filter((l: any) => l.campaign_id === c.id).length : 0,
    }));
  }, [campaigns, leads]);

  const insightsList = useMemo(() => {
    const list: { text: string; type: "info" | "warning" | "danger" }[] = [];
    if (kpis.overdue > 0) list.push({ text: `${kpis.overdue} projetos estão com o prazo vencido.`, type: "danger" });
    if (kpis.nearDue > 0) list.push({ text: `${kpis.nearDue} projetos vencem nos próximos 7 dias.`, type: "warning" });
    const overduePayments = filteredPayments.filter((p) => !p.paid_at && new Date(p.due_date) < new Date());
    if (overduePayments.length > 0) list.push({ text: `${overduePayments.length} títulos a receber estão em atraso.`, type: "danger" });
    const lowConv = kpis.conv < 10 && leads.length > 20;
    if (lowConv) list.push({ text: `Taxa de conversão está baixa (${kpis.conv.toFixed(1)}%). Verifique o funil.`, type: "warning" });
    if (list.length === 0) list.push({ text: "Todos os indicadores estão dentro da normalidade.", type: "info" });
    return list;
  }, [kpis, filteredPayments, leads]);

  const handleExportCSV = () => {
    const periodLabel = preset === "custom" ? `${from} a ${to}` : preset;
    const lines = [`Relatório CRM - ${new Date().toLocaleDateString()}`];

    if (reportTemplate === "financeiro") {
      const paid = filteredPayments.filter((p) => p.paid_at);
      const pending = filteredPayments.filter((p) => !p.paid_at);
      const overdue = pending.filter((p) => {
        try { return new Date(p.due_date) < new Date(); } catch { return false; }
      });
      const paidTotal = paid.reduce((s, r) => s + Number(r.value ?? 0), 0);
      const pendingTotal = pending.reduce((s, r) => s + Number(r.value ?? 0), 0);
      const overdueTotal = overdue.reduce((s, r) => s + Number(r.value ?? 0), 0);
      const payablesTotal = filteredExpenses.filter((e) => !e.paid_at).reduce((s, r) => s + Number(r.value ?? 0), 0);

      lines.push("Relatório,Financeiro");
      lines.push(`Período,${periodLabel}`);
      lines.push("");
      lines.push("Indicador,Valor");
      lines.push(`Recebido,${paidTotal}`);
      lines.push(`A Receber,${pendingTotal}`);
      lines.push(`Inadimplência,${overdueTotal}`);
      lines.push(`A Pagar,${payablesTotal}`);
      lines.push("");
      lines.push("Contas a Receber (Top),Cliente,Valor,Vencimento,Status");
      pending
        .slice()
        .sort((a, b) => Number(b.value) - Number(a.value))
        .slice(0, 20)
        .forEach((p) => lines.push(`Receber,${p.clients?.name ?? "-"},${Number(p.value)},${p.due_date},${p.status}`));
      lines.push("");
      lines.push("Contas a Pagar (Top),Fornecedor,Valor,Vencimento,Status");
      filteredExpenses
        .filter((e) => !e.paid_at)
        .slice()
        .sort((a, b) => Number(b.value) - Number(a.value))
        .slice(0, 20)
        .forEach((e) => lines.push(`Pagar,${e.suppliers?.name ?? "-"},${Number(e.value)},${e.due_date},${e.status}`));
    } else if (reportTemplate === "ponto_eletronico") {
      lines.push("Relatório,Ponto Eletrônico");
      lines.push(`Período,${periodLabel}`);
      lines.push("");
      lines.push("Resumo Semanal (Meta: 44h),Colaborador,Semana,Trabalhadas,Meta,Saldo,Status");
      (repPWeekly.data ?? []).forEach((w) => {
        const name = profiles.find(p => p.id === w.user_id)?.full_name ?? w.user_id;
        lines.push(`Semanal,${name},${w.week_start},${w.weekly_worked_hours},${w.expected_weekly_hours},${w.weekly_balance_hours},${w.has_negative_hours ? "Negativo" : "Ok"}`);
      });
      lines.push("");
      lines.push("Jornada Diária,Colaborador,Data,Entrada,Saída intervalo,Retorno intervalo,Saída final,Horas,Intervalo (min),Atraso (Intervalo),Status");
      (repPDaily.data ?? []).forEach((d) => {
        const name = profiles.find((p) => p.id === d.user_id)?.full_name ?? d.user_id;
        const fmtIso = (s: string | null) => (s ? format(new Date(s), "HH:mm:ss") : "");
        lines.push(
          `Diário,${name},${d.work_date},${fmtIso(d.entrada_at)},${fmtIso(d.saida_intervalo_at)},${fmtIso(d.retorno_intervalo_at)},${fmtIso(d.saida_final_at)},${d.worked_hours},${d.break_minutes},${d.delay_minutes},${d.day_status}`
        );
      });
      lines.push("");
      lines.push("Conformidade CLT,Colaborador,Data,Trabalhadas,Atraso (Intervalo),Ocorrência");
      (repPCLTCompliance.data ?? []).forEach((c) => {
        const occurrence = c.is_short_day ? "Jornada incompleta" : c.day_status === 'incompleto' ? "Sem registro de saída" : "Conforme";
        lines.push(`CLT,${c.user_name},${c.work_date},${c.worked_hours},${c.delay_minutes},${occurrence}`);
      });
      lines.push("");
      lines.push("Inconsistências,Colaborador,Data/Hora,Tipo,Detalhes");
      (repPInconsistencies.data ?? []).forEach((i) => {
        const name = i.user_name ?? profiles.find((p) => p.id === i.user_id)?.full_name ?? i.user_id;
        lines.push(`Inconsistência,${name},${i.created_at},${i.type},${JSON.stringify(i.details ?? {})}`);
      });
      lines.push("");
      lines.push("Alterações Admin,Tipo,Data,Autor,Alvo,Registro,Justificativa,Hash");
      (repPAdminChanges.data ?? []).forEach((a) => {
        const target = a.target_user_name ?? a.target_user_id ?? "-";
        const mark = a.punch_occurred_at ? `${a.punch_type ?? ""} ${a.punch_occurred_at}` : "";
        lines.push(`Admin,${a.action_type},${a.action_at},${a.action_by_name ?? a.action_by ?? ""},${target},${mark},${a.justification},${a.integrity_hash}`);
      });
    } else if (reportTemplate === "projetos") {
      lines.push("Relatório,Projetos");
      lines.push(`Período,${periodLabel}`);
      lines.push("");
      lines.push("Indicador,Valor");
      lines.push(`Total,${projects.length}`);
      lines.push(`Ativos,${projects.filter((p) => p.status !== "concluida").length}`);
      lines.push(`Atrasados,${kpis.overdue}`);
      lines.push("");
      lines.push("Projeto,Responsável,Status,Data Limite");
      filteredProjects.forEach((p) => {
        const resp = p.responsible_type === "team" ? teams.find((t) => t.id === p.responsible_id)?.name : profiles.find((pr) => pr.id === p.responsible_id)?.full_name;
        lines.push(`Projeto,${p.title},${resp ?? "-"},${p.status},${p.end_date ?? "-"}`);
      });
    } else if (reportTemplate === "crm") {
      lines.push("Relatório,CRM (Leads)");
      lines.push(`Período,${periodLabel}`);
      lines.push("");
      lines.push("Etapa,Quantidade");
      funnelData.forEach((f) => lines.push(`${f.stage},${f.count}`));
      lines.push("");
      lines.push("Lead,Empresa,Fase,Origem,Data");
      leads.forEach((l) => lines.push(`Lead,${l.name},${l.company ?? "-"},${l.etapa_kanban},${l.source ?? "-"},${l.created_at}`));
    } else if (reportTemplate === "metas") {
      lines.push("Relatório,Metas");
      lines.push(`Período,${periodLabel}`);
      lines.push("");
      lines.push("Meta,Responsável,Alvo,Realizado,Progresso");
      goals.forEach((g) => {
        const resp = g.responsible_type === "team" ? teams.find((t) => t.id === g.responsible_id)?.name : profiles.find((pr) => pr.id === g.responsible_id)?.full_name;
        lines.push(`${g.title},${resp ?? "-"},${g.target_value},${g.current_value},${(g.target_value ? (g.current_value / g.target_value) * 100 : 0).toFixed(1)}%`);
      });
    } else if (reportTemplate === "campanhas") {
      lines.push("Relatório,Campanhas");
      lines.push("");
      lines.push("Campanha,Status,Orçamento,Gasto,Leads,CPL");
      campaignData.forEach((c) => lines.push(`${c.name},${c.status},${c.budget},${c.spent},${c.leads},${c.cpl}`));
    } else {
      lines.push("Relatório,Visão Macro");
      lines.push("");
      lines.push("KPI,Valor");
      lines.push(`Clientes Ativos,${kpis.activeClients}`);
      lines.push(`Receita Período,${kpis.revenueMonth}`);
      lines.push(`Projetos Ativos,${kpis.activeProjects}`);
      lines.push(`Conversão Leads,${kpis.conv.toFixed(1)}%`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_${reportTemplate}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const titleMap: Record<ReportTemplate, string> = {
      macro: "Relatório - Visão Macro",
      financeiro: "Relatório - Financeiro",
      projetos: "Relatório - Projetos",
      campanhas: "Relatório - Campanhas",
      crm: "Relatório - CRM",
      metas: "Relatório - Metas",
      ponto_eletronico: "Relatório - Ponto Eletrônico",
    };
    const title = titleMap[reportTemplate];
    const periodLabel = preset === "custom" ? `${from} a ${to}` : preset;

    let html = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            h1 { color: #1a1a1a; margin-bottom: 5px; }
            .meta { color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { text-align: left; background: #f8f9fa; padding: 10px; border: 1px solid #dee2e6; font-size: 12px; }
            td { padding: 10px; border: 1px solid #dee2e6; font-size: 12px; }
            .kpi-grid { display: grid; grid-template-cols: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
            .kpi-card { border: 1px solid #eee; padding: 15px; border-radius: 8px; }
            .kpi-label { font-size: 10px; color: #666; text-transform: uppercase; }
            .kpi-value { font-size: 18px; font-weight: bold; margin-top: 5px; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">Gerado em: ${new Date().toLocaleString()} | Período: ${periodLabel}</div>
    `;

    const rowsToTable = (headers: string[], rows: string[][]) => `
      <table>
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    `;

    if (reportTemplate === "macro") {
      html += `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Clientes Ativos</div><div class="kpi-value">${kpis.activeClients}</div></div>
          <div class="kpi-card"><div class="kpi-label">Receita</div><div class="kpi-value">${fmt(kpis.revenueMonth)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Projetos Ativos</div><div class="kpi-value">${kpis.activeProjects}</div></div>
          <div class="kpi-card"><div class="kpi-label">Conversão</div><div class="kpi-value">${kpis.conv.toFixed(1)}%</div></div>
        </div>
      `;
    } else if (reportTemplate === "financeiro") {
      html += `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Recebido</div><div class="kpi-value">${fmt(kpis.revenueMonth)}</div></div>
          <div class="kpi-card"><div class="kpi-label">A Receber</div><div class="kpi-value">${fmt(kpis.toReceive)}</div></div>
          <div class="kpi-card"><div class="kpi-label">A Pagar</div><div class="kpi-value">${fmt(kpis.toPay)}</div></div>
        </div>
      `;
    } else if (reportTemplate === "crm") {
      html += rowsToTable(
        ["Etapa", "Quantidade"],
        funnelData.map((f) => [f.stage, String(f.count)])
      );
    } else if (reportTemplate === "metas") {
      html += rowsToTable(
        ["Meta", "Realizado", "Progresso"],
        goals.map((g) => [g.title, String(g.current_value), `${(g.target_value ? (g.current_value / g.target_value) * 100 : 0).toFixed(1)}%`])
      );
    } else if (reportTemplate === "ponto_eletronico") {
      html += "<h2>Resumo Mensal</h2>";
      html += rowsToTable(
        ["Colaborador", "Mês", "Dias", "Horas", "Inconsistências"],
        (repPMonthly.data ?? []).map((m) => [
          String(profiles.find((p) => p.id === m.user_id)?.full_name ?? m.user_id),
          String(m.month_ref),
          String(m.days_count),
          String(m.total_worked_hours),
          String(m.inconsistencies_count),
        ])
      );
      html += "<h2>Jornada Diária</h2>";
      html += rowsToTable(
        ["Colaborador", "Data", "Horas", "Status", "Atraso (Int.)"],
        (repPDaily.data ?? []).map((d) => [
          String(profiles.find((p) => p.id === d.user_id)?.full_name ?? d.user_id),
          String(d.work_date),
          String(d.worked_hours),
          String(d.day_status),
          String(d.delay_minutes),
        ])
      );
      html += "<h2>Resumo Semanal (Meta: 44h)</h2>";
      html += rowsToTable(
        ["Semana", "Colaborador", "Trabalhadas", "Meta", "Saldo"],
        (repPWeekly.data ?? []).map((w) => [
          format(parseISO(w.week_start), "dd/MM/yyyy"),
          profiles.find(p => p.id === w.user_id)?.full_name ?? w.user_id,
          `${w.weekly_worked_hours}h`,
          `${w.expected_weekly_hours}h`,
          `${w.weekly_balance_hours}h`,
        ])
      );
      html += "<h2>Conformidade CLT</h2>";
      html += rowsToTable(
        ["Data", "Colaborador", "Horas", "Atraso", "Ocorrência"],
        (repPCLTCompliance.data ?? []).map((c) => [
          format(parseISO(c.work_date), "dd/MM"),
          c.user_name,
          `${c.worked_hours}h`,
          `${c.delay_minutes}m`,
          c.is_short_day ? "Incompleta" : c.day_status === 'incompleto' ? "Sem saída" : "Conforme",
        ])
      );
    } else {
      html += "<h2>Detalhamento do Período</h2>";
      html += "<p>Relatório simplificado para visualização macro.</p>";
    }

    html += "</body></html>";
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Relatórios & Insights</h1>
          <p className="text-sm text-muted-foreground">Análise detalhada de performance, finanças e operacional.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrintPDF}>
            <FileDown className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs text-muted-foreground mb-1">Tipo de Relatório</label>
            <Select value={reportTemplate} onValueChange={handleTemplateChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="macro">Visão Macro</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="projetos">Projetos</SelectItem>
                <SelectItem value="campanhas">Campanhas</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="metas">Metas</SelectItem>
                <SelectItem value="ponto_eletronico">Ponto Eletrônico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Período</label>
            <Select value={preset} onValueChange={(v: PeriodPreset) => setPreset(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="ytd">Este ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Início</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Fim</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Equipe</label>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Responsável</label>
            <Select value={profileFilter} onValueChange={setProfileFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Cliente</label>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Section title="Insights automáticos" currentTemplate={reportTemplate}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {insightsList.map((insight, idx) => (
            <Card key={idx} className={insight.type === 'danger' ? 'border-red-200 bg-red-50 dark:bg-red-900/20' : insight.type === 'warning' ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/20' : ''}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`p-2 rounded-full ${insight.type === 'danger' ? 'bg-red-100 text-red-600' : insight.type === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                  {insight.type === 'danger' ? <AlertTriangle className="h-4 w-4" /> : insight.type === 'warning' ? <AlertTriangle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                </div>
                <p className="text-sm font-medium pt-1">{insight.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(reportTemplate === "macro" || reportTemplate === "financeiro") && (
          <>
            <KPI icon={Users} label="Clientes ativos" value={String(kpis.activeClients)} accent="text-primary" />
            <KPI icon={DollarSign} label="Receita do período" value={fmt(kpis.revenueMonth)} accent="text-emerald-600" />
            <KPI icon={DollarSign} label="A receber" value={fmt(kpis.toReceive)} accent="text-blue-600" />
            <KPI icon={DollarSign} label="A pagar" value={fmt(kpis.toPay)} accent="text-destructive" />
          </>
        )}
        {(reportTemplate === "macro" || reportTemplate === "projetos") && (
          <KPI icon={FolderKanban} label="Projetos ativos" value={String(kpis.activeProjects)} accent="text-indigo-600" />
        )}
        {(reportTemplate === "macro" || reportTemplate === "crm") && (
          <>
            <KPI icon={Kanban} label="Leads na esteira" value={String(kpis.leadsEsteira)} accent="text-purple-600" />
            <KPI icon={TrendingUp} label="Taxa de conversão" value={`${kpis.conv.toFixed(1)}%`} accent="text-emerald-600" />
          </>
        )}
        {(reportTemplate === "macro" || reportTemplate === "metas") && (
          <KPI icon={Target} label="Metas cadastradas" value={String(goals.length)} accent="text-primary" />
        )}
      </div>

      <Section title="Ponto Eletrônico" id="ponto_eletronico" currentTemplate={reportTemplate}>
        {isAdminOrOwner && repPOvertimeRequests.data && repPOvertimeRequests.data.length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-semibold">Horas Extras Pendentes de Autorização</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Minutos</TableHead>
                    <TableHead>Justificativa</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repPOvertimeRequests.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.user_name}</TableCell>
                      <TableCell>{format(parseISO(r.work_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right">{r.minutes_requested} min</TableCell>
                      <TableCell className="max-w-[300px] truncate">{r.justification}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => authorizeOvertime(r.id, "rejeitado")}>Rejeitar</Button>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => authorizeOvertime(r.id, "aprovado")}>Autorizar</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          {(profileFilter !== "all" || !isAdminOrOwner) && (
            <>
              <Stat 
                label="Total Horas Trabalhadas" 
                value={`${(repPWeekly.data ?? []).reduce((s, w) => s + Number(w.weekly_worked_hours), 0).toFixed(1)}h`} 
              />
              <Stat 
                label="Saldo Total de Horas" 
                value={`${(repPWeekly.data ?? []).reduce((s, w) => s + Number(w.weekly_balance_hours), 0).toFixed(1)}h`} 
                accent={(repPWeekly.data ?? []).reduce((s, w) => s + Number(w.weekly_balance_hours), 0) < 0 ? "text-destructive" : "text-emerald-600"}
              />
            </>
          )}
          <Stat 
            label="Total Atrasos (Intervalo)" 
            value={`${(repPWeekly.data ?? []).reduce((s, w) => s + Number(w.weekly_delay_minutes), 0)} min`} 
            accent="text-destructive"
          />
          <Stat 
            label="Extras Aprovadas" 
            value={`${((repPMonthly.data ?? []).reduce((s, m) => s + Number(m.total_approved_overtime_minutes), 0) / 60).toFixed(1)}h`} 
            accent="text-primary"
          />
          <Stat 
            label="Horas Negativas" 
            value={`${(repPWeekly.data ?? []).filter(w => w.weekly_balance_hours < 0).reduce((s, w) => s + Math.abs(Number(w.weekly_balance_hours)), 0).toFixed(1)}h`} 
            accent="text-destructive"
          />
        </div>

        {repPWeekly.data?.some(w => w.has_negative_hours) && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção: Horas Negativas Detectadas</AlertTitle>
            <AlertDescription>
              Existem semanas onde a carga horária de 44h não foi atingida. Verifique os detalhes abaixo.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-3">Jornada Diária e Ocorrências</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                      <TableHead className="text-right">Atraso</TableHead>
                      <TableHead className="text-right">Extra</TableHead>
                      <TableHead>Status Extra</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(repPDaily.data ?? []).slice(0, 15).map((r) => (
                      <TableRow key={`${r.user_id}_${r.work_date}`}>
                        <TableCell>{format(parseISO(r.work_date), "dd/MM")}</TableCell>
                        <TableCell className="font-medium">{profiles.find((p) => p.id === r.user_id)?.full_name ?? r.user_id}</TableCell>
                        <TableCell className="text-right font-mono">{Number(r.worked_hours ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-destructive">
                          {r.delay_minutes > 0 ? `${r.delay_minutes}m` : "-"}
                        </TableCell>
                        <TableCell className="text-right text-primary">
                          {r.overtime_minutes > 0 ? `${r.overtime_minutes}m` : "-"}
                        </TableCell>
                        <TableCell>
                          {r.overtime_minutes > 0 ? (
                            <div className="flex items-center gap-2">
                              <Badge variant={r.overtime_status === 'aprovado' ? 'default' : r.overtime_status === 'rejeitado' ? 'destructive' : 'outline'}>
                                {r.overtime_status === 'aprovado' ? 'Aprovada' : r.overtime_status === 'rejeitado' ? 'Rejeitada' : 'Pendente'}
                              </Badge>
                              {!isAdminOrOwner && r.user_id === me?.id && r.overtime_status === 'pendente' && !r.overtime_justification && (
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setSelectedOvertime({ workDate: r.work_date, minutes: r.overtime_minutes })}>
                                  Solicitar
                                </Button>
                              )}
                            </div>
                          ) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium mb-3">Resumo Semanal (Meta: 44h)</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Semana</TableHead>
                        <TableHead className="text-right">Trabalhadas</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(repPWeekly.data ?? []).slice(0, 5).map((w, idx) => (
                        <TableRow key={`${w.user_id}_${w.week_start}_${idx}`}>
                          <TableCell className="text-xs">{format(parseISO(w.week_start), "dd/MM")}</TableCell>
                          <TableCell className="text-right">{Number(w.weekly_worked_hours).toFixed(1)}h</TableCell>
                          <TableCell className={`text-right font-bold ${w.weekly_balance_hours < 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {w.weekly_balance_hours > 0 ? `+${w.weekly_balance_hours}` : w.weekly_balance_hours}h
                          </TableCell>
                          <TableCell>
                            <Badge variant={w.weekly_balance_hours < 0 ? "destructive" : "default"} className="text-[10px]">
                              {w.weekly_balance_hours < 0 ? "Negativo" : "Ok"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium mb-3">Conformidade CLT</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Ocorrência</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(repPCLTCompliance.data ?? []).slice(0, 8).map((c, idx) => (
                        <TableRow key={`${c.user_id}_${c.work_date}_${idx}`}>
                          <TableCell className="text-xs">{format(parseISO(c.work_date), "dd/MM")}</TableCell>
                          <TableCell className="font-medium text-xs">{c.user_name}</TableCell>
                          <TableCell>
                            {c.is_short_day && <Badge variant="outline" className="text-amber-600 border-amber-200 text-[10px]">Jornada incompleta</Badge>}
                            {c.day_status === 'incompleto' && <Badge variant="destructive" className="text-[10px]">Sem registro de saída</Badge>}
                            {!c.is_short_day && c.day_status === 'fechado' && <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-[10px]">Conforme</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Clientes" id="financeiro" currentTemplate={reportTemplate}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Total" value={String(clients.length)} />
          <Stat label="Ativos" value={String(clients.length)} />
          <Stat label="Inadimplentes" value={String(filteredPayments.filter((p) => !p.paid_at && new Date(p.due_date) < new Date()).length)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Top 5 maiores títulos a receber</h3>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Venc.</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments
                    .slice()
                    .sort((a, b) => Number(b.value) - Number(a.value))
                    .slice(0, 5)
                    .map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.clients?.name ?? "-"}</TableCell>
                        <TableCell className="text-right">{fmt(Number(p.value))}</TableCell>
                        <TableCell>{format(new Date(p.due_date), "dd/MM")}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Clientes inadimplentes</h3>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Dias atraso</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments
                    .filter((p) => !p.paid_at && new Date(p.due_date) < new Date())
                    .map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.clients?.name ?? "-"}</TableCell>
                        <TableCell className="text-right">{fmt(Number(p.value))}</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Financeiro" id="financeiro" currentTemplate={reportTemplate}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Stat label="A receber" value={fmt(kpis.toReceive)} />
          <Stat label="Recebidos" value={fmt(kpis.received)} />
          <Stat label="A pagar" value={fmt(kpis.toPay)} />
          <Stat label="Receita total" value={fmt(kpis.revenueMonth)} />
          <Stat label="Valor vencido" value={fmt(filteredPayments.filter((p) => !p.paid_at && new Date(p.due_date) < new Date()).reduce((s, r) => s + Number(r.value), 0))} />
          <Stat label="Inadimplência" value="—" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Contas a pagar por categoria</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={expensePie} cx="50%" cy="50%" innerRadius={45} outerRadius={85} dataKey="value"
                    label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {expensePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Fluxo de Caixa (Entradas vs Saídas)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={cashflowLine}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="entradas" name="Entradas" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="saidas" name="Saídas" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Projetos" id="projetos" currentTemplate={reportTemplate}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Stat label="Total" value={String(projects.length)} />
          <Stat label="Ativos" value={String(projects.filter((p) => p.status !== "concluida").length)} />
          <Stat label="Concluídos" value={String(projects.filter((p) => p.status === "concluida").length)} />
          <Stat label="Atrasados" value={String(kpis.overdue)} />
          <Stat label="Próximos do prazo (7d)" value={String(kpis.nearDue)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Projetos por fase</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={projectsByPhase}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fase" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="quantidade" name="Quantidade" fill="#6A2DBD" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Projetos por equipe</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={projectsByTeam} cx="50%" cy="50%" innerRadius={45} outerRadius={85} dataKey="value"
                    label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {projectsByTeam.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        <Card className="mt-4">
          <CardContent className="p-4">
            <h3 className="font-medium mb-3">Projetos por colaborador</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="text-right">Projetos ativos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(
                  filteredProjects
                    .filter((p) => p.status !== "concluida" && p.responsible_type === "profile" && p.responsible_id)
                    .reduce((acc: Record<string, number>, p) => {
                      const name = profiles.find((pr) => pr.id === p.responsible_id)?.full_name ?? "—";
                      acc[name] = (acc[name] ?? 0) + 1;
                      return acc;
                    }, {})
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-right">{count}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-3">Projetos próximos do vencimento</h3>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Projeto</TableHead><TableHead>Responsável</TableHead><TableHead>Data limite</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects
                  .filter((p) => p.end_date)
                  .slice()
                  .sort((a, b) => new Date(a.end_date || "").getTime() - new Date(b.end_date || "").getTime())
                  .slice(0, 10)
                  .map((p) => {
                    const name =
                      p.responsible_type === "team"
                        ? teams.find((t) => t.id === p.responsible_id)?.name
                        : p.responsible_type === "profile"
                        ? profiles.find((pr) => pr.id === p.responsible_id)?.full_name
                        : null;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.title}</TableCell>
                        <TableCell>{name ?? "-"}</TableCell>
                        <TableCell>{p.end_date ? format(new Date(p.end_date), "dd/MM") : "-"}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Section>

      <Section title="Metas" id="metas" currentTemplate={reportTemplate}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <Stat label="Meta total (período)" value={fmt(goals.reduce((s, g) => s + Number(g.target_value || 0), 0))} />
          <Stat label="Realizado" value={fmt(goals.reduce((s, g) => s + Number(g.current_value || 0), 0))} />
          <Stat label="Restante" value={fmt(Math.max(0, goals.reduce((s, g) => s + Number(g.target_value || 0) - Number(g.current_value || 0), 0)))} />
          <Stat label="Progresso Geral" value={`${(goals.reduce((s, g) => s + Number(g.current_value || 0), 0) / Math.max(1, goals.reduce((s, g) => s + Number(g.target_value || 0), 0)) * 100).toFixed(1)}%`} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Metas por Equipe</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Equipe</TableHead><TableHead className="text-right">Progresso</TableHead></TableRow></TableHeader>
                <TableBody>{goalsByTeam.length > 0 ? goalsByTeam.map(g => (
                  <TableRow key={g.name}><TableCell>{g.name}</TableCell><TableCell className="text-right">{g.percent.toFixed(1)}%</TableCell></TableRow>
                )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Sem metas de equipe</TableCell></TableRow>}</TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Metas por Responsável</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Responsável</TableHead><TableHead className="text-right">Progresso</TableHead></TableRow></TableHeader>
                <TableBody>{goalsByResponsible.length > 0 ? goalsByResponsible.map(g => (
                  <TableRow key={g.name}><TableCell>{g.name}</TableCell><TableCell className="text-right">{g.percent.toFixed(1)}%</TableCell></TableRow>
                )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Sem metas individuais</TableCell></TableRow>}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="CRM" id="crm" currentTemplate={reportTemplate}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Stat label="Leads totais" value={String(leads.length)} />
          <Stat label="Na esteira" value={String(leads.filter((l) => l.etapa_kanban !== "efetivados" && l.etapa_kanban !== "desqualificado" && l.etapa_kanban !== "reuniao_sem_sucesso").length)} />
          <Stat label="Fechados" value={String(leads.filter((l) => l.etapa_kanban === "efetivados").length)} />
          <Stat label="Perdidos" value={String(leads.filter((l) => l.etapa_kanban === "desqualificado" || l.etapa_kanban === "reuniao_sem_sucesso").length)} />
          <Stat label="Conversão" value={`${kpis.conv.toFixed(1)}%`} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Leads na esteira</h3>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Lead</TableHead><TableHead>Fase</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {leads
                    .filter((l) => l.etapa_kanban !== "efetivados" && l.etapa_kanban !== "desqualificado" && l.etapa_kanban !== "reuniao_sem_sucesso")
                    .slice(0, 5)
                    .map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.company || l.name}</TableCell>
                        <TableCell><Badge variant="secondary">{l.etapa_kanban}</Badge></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Campanhas" id="campanhas" currentTemplate={reportTemplate}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <KPI icon={Megaphone} label="Campanhas Ativas" value={String(campTotals.active)} accent="text-pink-600" />
          <Stat label="Investimento Total" value={fmt(campTotals.spend)} />
          <Stat label="Total Leads" value={String(campTotals.leads)} />
          <Stat label="Custo por Lead (Médio)" value={fmt(campMetrics.cpl)} />
        </div>
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-3">Desempenho de Campanhas</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignData.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "ativa" ? "default" : c.status === "concluida" ? "secondary" : "outline"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmt(c.budget)}</TableCell>
                    <TableCell className="text-right">{fmt(c.spent)}</TableCell>
                    <TableCell className="text-right">{c.leads}</TableCell>
                    <TableCell className="text-right">{fmt(c.cpl)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Section>

      <Dialog open={!!selectedOvertime} onOpenChange={(open) => !open && setSelectedOvertime(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Autorização de Hora Extra</DialogTitle>
            <DialogDescription>
              Você trabalhou {selectedOvertime?.minutes} minutos extras no dia {selectedOvertime?.workDate && format(parseISO(selectedOvertime.workDate), "dd/MM/yyyy")}.
              Por favor, forneça uma justificativa para a aprovação.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Justificativa</label>
            <textarea
              className="w-full min-h-[100px] p-2 border rounded-md text-sm bg-background"
              placeholder="Descreva o motivo das horas extras..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOvertime(null)}>Cancelar</Button>
            <Button onClick={handleRequestOvertime} disabled={!justification || requestOvertime.isPending}>
              {requestOvertime.isPending ? "Enviando..." : "Enviar Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PinAuthDialog {...pinProps} />
    </div>
  );
}

function KPI({ icon: Icon, label, value, accent }: { icon: ComponentType<{ className?: string }>; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center ${accent ?? ""}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children, id, currentTemplate }: { title: string; children: React.ReactNode; id?: string; currentTemplate: ReportTemplate }) {
  if (id && currentTemplate !== "macro" && currentTemplate !== id) return null;
  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLORS = ["#6A2DBD", "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];
