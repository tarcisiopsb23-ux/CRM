import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useOrganization } from "@/hooks/useOrganization";
import { usePayments, useSupplierExpenses } from "@/hooks/useFinancial";
import { usePayrollExpenses } from "@/hooks/usePayrollExpenses";
import { useClients } from "@/hooks/useClients";
import { useSuppliers } from "@/hooks/useSuppliers";
import { usePayrolls } from "@/hooks/usePayrolls";
import { useProjects } from "@/hooks/useProjects";
import { useProfiles } from "@/hooks/useProfiles";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSearchParams, Link } from "react-router-dom";
import SuppliersPage from "@/pages/SuppliersPage";
import { SupplierExpensesView } from "@/components/suppliers/SupplierExpensesView";
import { C8ControlFinancialTab } from "@/components/financial/C8ControlFinancialTab";
import FiscalPage from "@/pages/FiscalPage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, Plus, UserPlus, Trash2, Calendar, Eye, Pencil, Info } from "lucide-react";
import { eachDayOfInterval, endOfMonth, format, isWithinInterval, parseISO, startOfMonth, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import {
  PeriodOption,
  PERIOD_LABELS,
  getPeriodDateRange,
} from "@/lib/periodHelpers";
import PeriodSelector from "@/components/filters/PeriodSelector";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Cell, Line, LineChart, Pie, PieChart } from "recharts";

const EXPENSE_CATEGORIES = [
  "Serviços Terceirizados",
  "Material de Escritório",
  "Despesas Prediais",
  "Impostos",
  "Contratos",
  "Eletro/Eletrônicos",
  "Móveis",
  "Tecnologia",
  "Assinaturas",
  "Despesas de Serviço",
  "Materiais Sanitários",
  "Copa",
  "Marketing",
  "Outros",
] as const;

const safeParseDate = (s: string | null | undefined) => {
  if (!s) return new Date(NaN);
  try {
    return parseISO(s);
  } catch {
    return new Date(NaN);
  }
};
const isValidDate = (d: Date) => !Number.isNaN(d.getTime());

const safeFormat = (date: string | Date | null | undefined, formatStr: string, options?: Parameters<typeof format>[2]) => {
  const d = typeof date === "string" ? safeParseDate(date) : date;
  if (!d || !isValidDate(d)) return "—";
  try {
    return format(d, formatStr, options);
  } catch {
    return "—";
  }
};

export default function FinancialPage() {
  const organizationId = useOrganization();
  const { pinProps, requirePin } = usePinConfirm();
  const clientsQuery = useClients(organizationId);
  const suppliersQuery = useSuppliers(organizationId);
  const { data: clients = [] } = clientsQuery;
  const { data: suppliers = [] } = suppliersQuery;
  const [modalReceber, setModalReceber] = useState(false);
  const [modalPagar, setModalPagar] = useState(false);
  const [formReceber, setFormReceber] = useState({ client_id: "", description: "", value: "", due_date: "" });
  const [formPagar, setFormPagar] = useState({ supplier_id: "", description: "", value: "", due_date: "" });
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: "", company: "" });
  const [newSupplierForm, setNewSupplierForm] = useState<{ name: string; service_category: string }>({ name: "", service_category: "Outros" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [isPayroll, setIsPayroll] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const defaultFinancialRange = getPeriodDateRange("mes_atual");
  const [period, setPeriod] = useState<PeriodOption | 'custom'>("mes_atual");
  const [selectedRange, setSelectedRange] = useState(() => defaultFinancialRange);

  const formatRangeLabel = (r: { from: Date; to: Date }) => {
    try {
      return `${format(r.from, 'dd/MM/yyyy')} → ${format(r.to, 'dd/MM/yyyy')}`;
    } catch {
      return 'Período personalizado';
    }
  };

  const validTabs = useMemo(
    () =>
      new Set([
        "dashboard",
        "cashflow",
        "receivables",
        "payables",
        "expenses",
        "payroll",
        "contracts",
        "dre",
        "reports",
        "c8control",
        "nfse",
      ]),
    []
  );

  const sectionParam = searchParams.get("tab");
  const section = (sectionParam && validTabs.has(sectionParam) ? sectionParam : "dashboard") as
    | "dashboard"
    | "cashflow"
    | "receivables"
    | "payables"
    | "expenses"
    | "payroll"
    | "contracts"
    | "dre"
    | "reports"
    | "c8control"
    | "nfse";

  const setSection = (nextSection: typeof section) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextSection);
    setSearchParams(next, { replace: true });
  };

  const scopePermission = usePermissionForScope("financial", section);

  const payments = usePayments(organizationId, { enabled: scopePermission.canView });
  const expenses = useSupplierExpenses(organizationId, { enabled: scopePermission.canView });
  const payrollExpenses = usePayrollExpenses(organizationId, { enabled: scopePermission.canView });

  const receivables = (payments.data ?? []).filter((p) => p.status !== "pago" && p.status !== "cancelado");
  const payables = (expenses.data ?? []).filter((e) => e.status !== "pago" && e.status !== "cancelado");
  const pendingPayroll = (payrollExpenses.data ?? []).filter((pe) => pe.status !== "pago" && pe.status !== "cancelado");

  const payrollsQuery = usePayrolls(organizationId);
  const projectsQuery = useProjects(organizationId);
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  const qc = useQueryClient();
  const profilesQuery = useProfiles(organizationId);
  const teamsQuery = useTeams(organizationId);
  const teamMembersQuery = useTeamMembers(organizationId);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthKey = format(monthStart, "yyyy-MM");
  const [cashflowFrom, setCashflowFrom] = useState(format(defaultFinancialRange.from, "yyyy-MM-dd"));
  const [cashflowTo, setCashflowTo] = useState(format(defaultFinancialRange.to, "yyyy-MM-dd"));
  const [cashflowType, setCashflowType] = useState<"all" | "receita" | "despesa" | "folha">("all");

  useEffect(() => {
    setCashflowFrom(format(selectedRange.from, "yyyy-MM-dd"));
    setCashflowTo(format(selectedRange.to, "yyyy-MM-dd"));
  }, [selectedRange]);

  // Estados para visualizar/editar lançamento do fluxo de caixa
  const [viewRow, setViewRow] = useState<{ id: string; type: "receita" | "despesa" | "folha"; date: string; category: string; description: string; value: number; status?: string } | null>(null);
  const [editRow, setEditRow] = useState<typeof viewRow>(null);
  const [editForm, setEditForm] = useState({ description: "", value: "", due_date: "" });

  // Estados para receber pagamento (parcial ou total)
  const [receivePaymentId, setReceivePaymentId] = useState<string | null>(null);
  const [receivePaymentTotal, setReceivePaymentTotal] = useState<number>(0);
  const [receivePaymentDesc, setReceivePaymentDesc] = useState<string>("");
  const [receivePaymentClientId, setReceivePaymentClientId] = useState<string>("");
  const [receivePaymentContractId, setReceivePaymentContractId] = useState<string | null>(null);
  const [receiveValue, setReceiveValue] = useState<string>("");
  const [receiveDate, setReceiveDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [isReceiving, setIsReceiving] = useState(false);
  const [reportsMonths, setReportsMonths] = useState<3 | 6 | 12 | 24>(6);
  const [reportsClientId, setReportsClientId] = useState("all");
  const [reportsExpenseCategory, setReportsExpenseCategory] = useState<string>("all");
  const [reportsTop, setReportsTop] = useState<5 | 10 | 20>(10);

  // helper to group entries by month/year for the full-list modal
  const groupByMonth = <T extends { due_date: string }>(items: T[]) => {
    const groups: Record<string, T[]> = {};
    items.forEach((r) => {
      const label = safeFormat(r.due_date, "MMMM yyyy", { locale: ptBR });
      groups[label] = groups[label] ?? [];
      groups[label].push(r);
    });
    return groups;
  };

  const marketingSpendMonthQuery = useQuery({
    queryKey: ["campaign_metrics", organizationId, "spend_month", period, format(selectedRange.from, "yyyy-MM-dd"), format(selectedRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!organizationId) return 0;
      const { data, error } = await supabaseUntyped
        .from("campaign_metrics")
        .select("spend")
        .eq("organization_id", organizationId)
        .gte("date", safeFormat(selectedRange.from, "yyyy-MM-dd"))
        .lte("date", safeFormat(selectedRange.to, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []).reduce((acc, r) => acc + Number((r as { spend?: number | null }).spend ?? 0), 0);
    },
    enabled: !!organizationId && scopePermission.canView,
  });

  const marketingDailyQuery = useQuery({
    queryKey: ["campaign_metrics", organizationId, "daily_spend", period, format(selectedRange.from, "yyyy-MM-dd"), format(selectedRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!organizationId) return [] as Array<{ date: string; spend: number }>;
      const { data, error } = await supabaseUntyped
        .from("campaign_metrics")
        .select("date, spend")
        .eq("organization_id", organizationId)
        .gte("date", safeFormat(selectedRange.from, "yyyy-MM-dd"))
        .lte("date", safeFormat(selectedRange.to, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []).map((r) => ({
        date: String((r as { date?: string | null }).date ?? ""),
        spend: Number((r as { spend?: number | null }).spend ?? 0),
      })).filter((r) => r.date);
    },
    enabled: !!organizationId && scopePermission.canView,
  });

  const marketingSpendByMonthQuery = useQuery({
    queryKey: ["campaign_metrics", organizationId, "spend_by_month", period, format(selectedRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!organizationId) return [] as Array<{ date: string; spend: number }>;
      const start = safeFormat(subMonths(startOfMonth(selectedRange.to), 5), "yyyy-MM-dd");
      const end = safeFormat(selectedRange.to, "yyyy-MM-dd");
      const { data, error } = await supabaseUntyped
        .from("campaign_metrics")
        .select("date, spend")
        .eq("organization_id", organizationId)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        date: String((r as { date?: string | null }).date ?? ""),
        spend: Number((r as { spend?: number | null }).spend ?? 0),
      })).filter((r) => r.date);
    },
    enabled: !!organizationId && scopePermission.canView,
  });

  const contractsQuery = useQuery({
    queryKey: ["contracts", organizationId, "financial_page"],
    queryFn: async () => {
      if (!organizationId) return [] as Array<{ id: string; title: string; service_contracted: string | null }>;
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, service_contracted")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; service_contracted: string | null }>;
    },
    enabled: !!organizationId && scopePermission.canView,
  });

  const contractsFullQuery = useQuery({
    queryKey: ["contracts", organizationId, "financial_page_full"],
    queryFn: async () => {
      if (!organizationId) return [] as Array<Record<string, unknown>>;
      const { data, error } = await supabase
        .from("contracts")
        .select("id, client_id, title, service_contracted, status, value, start_date, end_date, clients(name, company)")
        .eq("organization_id", organizationId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: !!organizationId && scopePermission.canView,
  });

  const kpis = useMemo(() => {
    const rows = {
      payments: payments.data ?? [],
      expenses: expenses.data ?? [],
      payroll: payrollExpenses.data ?? [],
    };
    const marketingSpendMonth = marketingSpendMonthQuery.data ?? 0;
    const today = new Date();

    const periodStartDay = new Date(selectedRange.from);
    periodStartDay.setHours(0, 0, 0, 0);

    const receivedMonth = rows.payments
      .filter((p) => p.status === "pago")
      .filter((p) => {
        const d = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
        if (!isValidDate(d)) return false;
        return isWithinInterval(d, { start: selectedRange.from, end: selectedRange.to });
      })
      .reduce((acc, p) => acc + Number(p.value ?? 0), 0);

    const delinquencyReceivedMonth = rows.payments
      .filter((p) => p.status === "pago")
      .filter((p) => {
        const paid = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
        if (!isValidDate(paid)) return false;
        if (!isWithinInterval(paid, { start: selectedRange.from, end: selectedRange.to })) return false;
        const due = safeParseDate(p.due_date);
        if (!isValidDate(due)) return false;
        return due < periodStartDay;
      })
      .reduce((acc, p) => acc + Number(p.value ?? 0), 0);

    const supplierPaidMonth = rows.expenses
      .filter((e) => e.status === "pago")
      .filter((e) => {
        const d = e.paid_at ? safeParseDate(e.paid_at) : safeParseDate(e.due_date);
        if (!isValidDate(d)) return false;
        return isWithinInterval(d, { start: selectedRange.from, end: selectedRange.to });
      })
      .reduce((acc, e) => acc + Number(e.value ?? 0), 0);

    const payrollCostMonth = (payrollsQuery.data ?? [])
      .filter((p) => {
        const d = safeParseDate(p.reference_date ? String(p.reference_date) : null);
        if (!isValidDate(d)) return false;
        return isWithinInterval(d, { start: selectedRange.from, end: selectedRange.to });
      })
      .reduce((acc, p) => acc + Number(p.total_value ?? 0), 0);

    const payrollPaidMonth = rows.payroll
      .filter((pe) => pe.status === "pago")
      .filter((pe) => {
        const d = pe.paid_at ? safeParseDate(pe.paid_at) : safeParseDate(pe.reference_date);
        if (!isValidDate(d)) return false;
        return isWithinInterval(d, { start: selectedRange.from, end: selectedRange.to });
      })
      .reduce((acc, pe) => acc + Number(pe.total_value ?? 0), 0);

    const pendingReceivablesTotal = receivables.reduce((acc, p) => acc + Number(p.value ?? 0), 0);
    const pendingPayablesTotal = payables.reduce((acc, e) => acc + Number(e.value ?? 0), 0);
    const pendingPayrollTotal = pendingPayroll.reduce((acc, pe) => acc + Number(pe.total_value ?? 0), 0);

    const overdueReceivablesTotal = receivables
      .filter((p) => {
        const due = safeParseDate(p.due_date);
        return isValidDate(due) && due < today;
      })
      .reduce((acc, p) => acc + Number(p.value ?? 0), 0);

    const overduePayablesTotal = payables
      .filter((e) => {
        const due = safeParseDate(e.due_date);
        return isValidDate(due) && due < today;
      })
      .reduce((acc, e) => acc + Number(e.value ?? 0), 0);

    const monthExpenses = supplierPaidMonth + payrollPaidMonth + marketingSpendMonth;
    const monthProfit = receivedMonth - monthExpenses;
    const margin = receivedMonth > 0 ? monthProfit / receivedMonth : 0;
    const cashBalance = monthProfit;
    const delinquencyReceivedMonthPercent = overdueReceivablesTotal > 0 ? (delinquencyReceivedMonth / overdueReceivablesTotal) : null;

    return {
      cashBalance,
      receivedMonth,
      supplierPaidMonth,
      payrollPaidMonth,
      payrollCostMonth,
      marketingSpendMonth,
      monthExpenses,
      monthProfit,
      margin,
      pendingReceivablesTotal,
      overdueReceivablesTotal,
      pendingPayablesTotal,
      overduePayablesTotal,
      pendingPayrollTotal,
      delinquencyReceivedMonth,
      delinquencyReceivedMonthPercent,
    };
  }, [
    expenses.data,
    marketingSpendMonthQuery.data,
    payrollExpenses.data,
    payrollsQuery.data,
    payables,
    payments.data,
    pendingPayroll,
    receivables,
    selectedRange,
  ]);

  const monthlySeries = useMemo(() => {
    const rows = {
      payments: payments.data ?? [],
      expenses: expenses.data ?? [],
      payroll: payrollExpenses.data ?? [],
    };

    const now = new Date();
    const start = subMonths(startOfMonth(now), 5);
    const months = Array.from({ length: 6 }, (_, i) => subMonths(startOfMonth(now), 5 - i));
    const monthKey = (d: Date) => format(d, "yyyy-MM");

    const byMonth = new Map<string, { receitas: number; despesas: number; folha: number; marketing: number }>();
    for (const m of months) {
      byMonth.set(monthKey(m), { receitas: 0, despesas: 0, folha: 0, marketing: 0 });
    }

    for (const p of rows.payments) {
      if (p.status !== "pago") continue;
      const d = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
      if (!isValidDate(d)) continue;
      if (d < start) continue;
      const key = monthKey(startOfMonth(d));
      const agg = byMonth.get(key);
      if (!agg) continue;
      agg.receitas += Number(p.value ?? 0);
    }

    for (const e of rows.expenses) {
      if (e.status !== "pago") continue;
      const d = e.paid_at ? safeParseDate(e.paid_at) : safeParseDate(e.due_date);
      if (!isValidDate(d)) continue;
      if (d < start) continue;
      const key = monthKey(startOfMonth(d));
      const agg = byMonth.get(key);
      if (!agg) continue;
      const cat = (e as { suppliers?: { service_category?: string | null } | null }).suppliers?.service_category ?? "Outros";
      const value = Number(e.value ?? 0);
      if (cat === "Marketing") agg.marketing += value;
      else agg.despesas += value;
    }

    for (const pe of rows.payroll) {
      if (pe.status !== "pago") continue;
      const d = pe.paid_at ? safeParseDate(pe.paid_at) : safeParseDate(pe.reference_date);
      if (!isValidDate(d)) continue;
      if (d < start) continue;
      const key = monthKey(startOfMonth(d));
      const agg = byMonth.get(key);
      if (!agg) continue;
      agg.folha += Number(pe.total_value ?? 0);
    }

    for (const r of marketingSpendByMonthQuery.data ?? []) {
      const key = String(r.date).slice(0, 7);
      const agg = byMonth.get(key);
      if (!agg) continue;
      agg.marketing += Number(r.spend ?? 0);
    }

    return months.map((m) => {
      const key = monthKey(m);
      const agg = byMonth.get(key) ?? { receitas: 0, despesas: 0, folha: 0, marketing: 0 };
      const saidas = agg.despesas + agg.folha + agg.marketing;
      return {
        key,
        name: format(m, "MMM/yy", { locale: ptBR }),
        receitas: agg.receitas,
        saidas,
        despesas: agg.despesas,
        folha: agg.folha,
        marketing: agg.marketing,
        resultado: agg.receitas - saidas,
      };
    });
  }, [expenses.data, marketingSpendByMonthQuery.data, payrollExpenses.data, payments.data]);

  const drePivot = useMemo(() => {
    const monthKey = (d: Date) => format(d, "yyyy-MM");

    // Determinar os meses do período
    const months: Array<{ key: string; label: string }> = [];
    let current = startOfMonth(selectedRange.from);
    while (current <= selectedRange.to) {
      months.push({
        key: monthKey(current),
        label: format(current, "MMM/yy", { locale: ptBR }),
      });
      current = addMonths(current, 1);
    }

    const monthKeys = new Set(months.map((m) => m.key));

    const revenue = new Map<string, number>();
    const impostos = new Map<string, number>();
    const supplierOther = new Map<string, number>();
    const supplierMarketing = new Map<string, number>();
    const payroll = new Map<string, number>();
    const spendByMonth = new Map<string, number>();

    // 1. Marketing Spend (campaign_metrics)
    for (const r of marketingSpendByMonthQuery.data ?? []) {
      const key = String(r.date).slice(0, 7);
      if (!monthKeys.has(key)) continue;
      spendByMonth.set(key, (spendByMonth.get(key) ?? 0) + Number(r.spend ?? 0));
    }

    // 2. Receitas (payments)
    for (const p of payments.data ?? []) {
      if (p.status !== "pago") continue;
      const d = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
      if (!isValidDate(d)) continue;
      const key = monthKey(startOfMonth(d));
      if (!monthKeys.has(key)) continue;
      revenue.set(key, (revenue.get(key) ?? 0) + Number(p.value ?? 0));
    }

    // 3. Despesas (expenses)
    for (const e of expenses.data ?? []) {
      if (e.status !== "pago") continue;
      const d = e.paid_at ? safeParseDate(e.paid_at) : safeParseDate(e.due_date);
      if (!isValidDate(d)) continue;
      const key = monthKey(startOfMonth(d));
      if (!monthKeys.has(key)) continue;
      const cat = (e as { suppliers?: { service_category?: string | null } | null }).suppliers?.service_category ?? "Outros";
      const value = Number(e.value ?? 0);
      if (cat === "Impostos") impostos.set(key, (impostos.get(key) ?? 0) + value);
      else if (cat === "Marketing") supplierMarketing.set(key, (supplierMarketing.get(key) ?? 0) + value);
      else supplierOther.set(key, (supplierOther.get(key) ?? 0) + value);
    }

    // 4. Folha (payrollExpenses)
    for (const pe of payrollExpenses.data ?? []) {
      if (pe.status !== "pago") continue;
      const d = pe.paid_at ? safeParseDate(pe.paid_at) : safeParseDate(pe.reference_date);
      if (!isValidDate(d)) continue;
      const key = monthKey(startOfMonth(d));
      if (!monthKeys.has(key)) continue;
      payroll.set(key, (payroll.get(key) ?? 0) + Number(pe.total_value ?? 0));
    }

    const valueByMonth = (m: Map<string, number>) => months.map((x) => m.get(x.key) ?? 0);

    const receitaBruta = valueByMonth(revenue);
    const impostosRow = valueByMonth(impostos);
    const receitaLiquida = months.map((x) => (revenue.get(x.key) ?? 0) - (impostos.get(x.key) ?? 0));

    const despesasFornecedor = valueByMonth(supplierOther);
    const folha = valueByMonth(payroll);
    const marketing = months.map((x) => (spendByMonth.get(x.key) ?? 0) + (supplierMarketing.get(x.key) ?? 0));

    const ebitda = months.map((x) => {
      const rl = (revenue.get(x.key) ?? 0) - (impostos.get(x.key) ?? 0);
      const op = (supplierOther.get(x.key) ?? 0) + (payroll.get(x.key) ?? 0) + (spendByMonth.get(x.key) ?? 0) + (supplierMarketing.get(x.key) ?? 0);
      return rl - op;
    });

    const lucroLiquido = [...ebitda];

    return {
      months,
      rows: [
        { key: "receita_bruta", label: "Receita bruta", values: receitaBruta, tone: "positive" as const, strong: true },
        { key: "impostos", label: "(-) Impostos", values: impostosRow, tone: "negative" as const },
        { key: "receita_liquida", label: "Receita líquida", values: receitaLiquida, tone: "positive" as const, strong: true },
        { key: "fornecedor", label: "(-) Despesas (fornecedores)", values: despesasFornecedor, tone: "negative" as const },
        { key: "folha", label: "(-) Folha de pagamento", values: folha, tone: "negative" as const },
        { key: "marketing", label: "(-) Marketing", values: marketing, tone: "negative" as const },
        { key: "ebitda", label: "EBITDA", values: ebitda, tone: "neutral" as const, strong: true },
        { key: "lucro_liquido", label: "Lucro líquido", values: lucroLiquido, tone: "neutral" as const, strong: true },
      ],
    };
  }, [selectedRange, marketingSpendByMonthQuery.data, payments.data, expenses.data, payrollExpenses.data]);

  const dailySeries = useMemo(() => {
    const days = eachDayOfInterval({ start: selectedRange.from, end: selectedRange.to });
    const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

    const receiptsByDay = new Map<string, number>();
    const expensesByDay = new Map<string, number>();
    const payrollByDay = new Map<string, number>();
    const marketingByDay = new Map<string, number>();

    for (const p of payments.data ?? []) {
      if (p.status !== "pago") continue;
      const d = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
      if (!isValidDate(d)) continue;
      if (d < selectedRange.from || d > selectedRange.to) continue;
      const k = dayKey(d);
      receiptsByDay.set(k, (receiptsByDay.get(k) ?? 0) + Number(p.value ?? 0));
    }

    for (const e of expenses.data ?? []) {
      if (e.status !== "pago") continue;
      const d = e.paid_at ? safeParseDate(e.paid_at) : safeParseDate(e.due_date);
      if (!isValidDate(d)) continue;
      if (d < selectedRange.from || d > selectedRange.to) continue;
      const k = dayKey(d);
      expensesByDay.set(k, (expensesByDay.get(k) ?? 0) + Number(e.value ?? 0));
    }

    for (const pe of payrollExpenses.data ?? []) {
      if (pe.status !== "pago") continue;
      const d = pe.paid_at ? safeParseDate(pe.paid_at) : safeParseDate(pe.reference_date);
      if (!isValidDate(d)) continue;
      if (d < selectedRange.from || d > selectedRange.to) continue;
      const k = dayKey(d);
      payrollByDay.set(k, (payrollByDay.get(k) ?? 0) + Number(pe.total_value ?? 0));
    }

    for (const r of marketingDailyQuery.data ?? []) {
      marketingByDay.set(r.date, (marketingByDay.get(r.date) ?? 0) + Number(r.spend ?? 0));
    }

    return days.map((d) => {
      const k = dayKey(d);
      const receita = receiptsByDay.get(k) ?? 0;
      const despesa = expensesByDay.get(k) ?? 0;
      const folha = payrollByDay.get(k) ?? 0;
      const marketing = marketingByDay.get(k) ?? 0;
      const despesas_total = despesa + folha + marketing;
      const lucro = receita - despesas_total;
      return {
        key: k,
        day: format(d, "dd", { locale: ptBR }),
        receita,
        despesas_total,
        lucro,
      };
    });
  }, [
    expenses.data,
    marketingDailyQuery.data,
    payments.data,
    payrollExpenses.data,
    selectedRange,
  ]);

  const expensesDistributionMonth = useMemo(() => {
    const m: Record<string, number> = {};

    for (const e of expenses.data ?? []) {
      if (e.status !== "pago") continue;
      const d = e.paid_at ? safeParseDate(e.paid_at) : safeParseDate(e.due_date);
      if (!isValidDate(d)) continue;
      if (d < selectedRange.from || d > selectedRange.to) continue;
      const cat = (e as { suppliers?: { service_category?: string | null } | null }).suppliers?.service_category ?? "Outros";
      m[cat] = (m[cat] ?? 0) + Number(e.value ?? 0);
    }

    const folha = (payrollExpenses.data ?? [])
      .filter((pe) => pe.status === "pago")
      .filter((pe) => {
        const d = pe.paid_at ? safeParseDate(pe.paid_at) : safeParseDate(pe.reference_date);
        return isValidDate(d) && d >= selectedRange.from && d <= selectedRange.to;
      })
      .reduce((acc, pe) => acc + Number(pe.total_value ?? 0), 0);
    if (folha > 0) m["Folha"] = (m["Folha"] ?? 0) + folha;

    const marketing = marketingSpendMonthQuery.data ?? 0;
    if (marketing > 0) m["Marketing"] = (m["Marketing"] ?? 0) + marketing;

    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [expenses.data, marketingSpendMonthQuery.data, payrollExpenses.data, selectedRange]);

  const contractLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contractsQuery.data ?? []) {
      map.set(String(c.id), String(c.service_contracted ?? c.title ?? "Contrato"));
    }
    return map;
  }, [contractsQuery.data]);

  const revenueByClient = useMemo(() => {
    const map = new Map<string, { client: string; total: number }>();
    for (const p of payments.data ?? []) {
      if (p.status !== "pago") continue;
      const clientName =
        (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.company
        ?? (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.name
        ?? "Cliente";
      const key = String(p.client_id ?? "");
      const cur = map.get(key) ?? { client: clientName, total: 0 };
      cur.total += Number(p.value ?? 0);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [payments.data]);

  const revenueByProject = useMemo(() => {
    const projects = (projectsQuery.data ?? []) as Array<{ id: string; title?: string; name?: string; client_id?: string | null; start_date?: string | null; end_date?: string | null }>;
    const paymentsPaid = (payments.data ?? []).filter((p) => p.status === "pago");

    return projects
      .map((pr) => {
        const clientId = String(pr.client_id ?? "");
        const start = pr.start_date ? safeParseDate(String(pr.start_date)) : null;
        const end = pr.end_date ? safeParseDate(String(pr.end_date)) : null;
        const title = String(pr.title ?? pr.name ?? "Projeto");

        let total = 0;
        for (const p of paymentsPaid) {
          if (String(p.client_id ?? "") !== clientId) continue;
          const d = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
          if (!isValidDate(d)) continue;
          if (start && isValidDate(start) && d < start) continue;
          if (end && isValidDate(end) && d > end) continue;
          total += Number(p.value ?? 0);
        }

        return { project: title, total };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [payments.data, projectsQuery.data]);

  const reportsInterval = useMemo(() => {
    const end = endOfMonth(new Date());
    const start = subMonths(startOfMonth(end), reportsMonths - 1);
    return { start, end };
  }, [reportsMonths]);

  const reportsMonthlySeries = useMemo(() => {
    const months = Array.from({ length: reportsMonths }, (_, i) =>
      subMonths(startOfMonth(reportsInterval.end), reportsMonths - 1 - i)
    );
    const monthKey = (d: Date) => safeFormat(d, "yyyy-MM");

    const byMonth = new Map<string, { receitas: number; despesas: number; folha: number }>();
    for (const m of months) byMonth.set(monthKey(m), { receitas: 0, despesas: 0, folha: 0 });

    for (const p of payments.data ?? []) {
      if (p.status !== "pago") continue;
      if (reportsClientId !== "all" && String(p.client_id ?? "") !== reportsClientId) continue;
      const d = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
      if (!isValidDate(d)) continue;
      if (d < reportsInterval.start || d > reportsInterval.end) continue;
      const key = monthKey(startOfMonth(d));
      const agg = byMonth.get(key);
      if (!agg) continue;
      agg.receitas += Number(p.value ?? 0);
    }

    for (const e of expenses.data ?? []) {
      if (e.status !== "pago") continue;
      const cat = (e as { suppliers?: { service_category?: string | null } | null }).suppliers?.service_category ?? "Outros";
      if (reportsExpenseCategory !== "all" && cat !== reportsExpenseCategory) continue;
      const d = e.paid_at ? safeParseDate(e.paid_at) : safeParseDate(e.due_date);
      if (!isValidDate(d)) continue;
      if (d < reportsInterval.start || d > reportsInterval.end) continue;
      const key = monthKey(startOfMonth(d));
      const agg = byMonth.get(key);
      if (!agg) continue;
      agg.despesas += Number(e.value ?? 0);
    }

    for (const pe of payrollExpenses.data ?? []) {
      if (pe.status !== "pago") continue;
      const d = pe.paid_at ? safeParseDate(pe.paid_at) : safeParseDate(pe.reference_date);
      if (!isValidDate(d)) continue;
      if (d < reportsInterval.start || d > reportsInterval.end) continue;
      const key = monthKey(startOfMonth(d));
      const agg = byMonth.get(key);
      if (!agg) continue;
      agg.folha += Number(pe.total_value ?? 0);
    }

    return months.map((m) => {
      const key = monthKey(m);
      const agg = byMonth.get(key) ?? { receitas: 0, despesas: 0, folha: 0 };
      const saidas = agg.despesas + agg.folha;
      return {
        key,
        name: safeFormat(m, "MMM/yy", { locale: ptBR }),
        receitas: agg.receitas,
        saidas,
        despesas: agg.despesas,
        folha: agg.folha,
        resultado: agg.receitas - saidas,
      };
    });
  }, [expenses.data, payrollExpenses.data, payments.data, reportsClientId, reportsExpenseCategory, reportsInterval.end, reportsInterval.start, reportsMonths]);

  const reportsExpensesByCategory = useMemo(() => {
    const m: Record<string, number> = {};

    for (const e of expenses.data ?? []) {
      if (e.status !== "pago") continue;
      const d = e.paid_at ? safeParseDate(e.paid_at) : safeParseDate(e.due_date);
      if (!isValidDate(d)) continue;
      if (d < reportsInterval.start || d > reportsInterval.end) continue;
      const cat = (e as { suppliers?: { service_category?: string | null } | null }).suppliers?.service_category ?? "Outros";
      if (reportsExpenseCategory !== "all" && cat !== reportsExpenseCategory) continue;
      m[cat] = (m[cat] ?? 0) + Number(e.value ?? 0);
    }

    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [expenses.data, reportsExpenseCategory, reportsInterval.end, reportsInterval.start]);

  const reportsRevenueByClient = useMemo(() => {
    const map = new Map<string, { client: string; total: number }>();
    for (const p of payments.data ?? []) {
      if (p.status !== "pago") continue;
      if (reportsClientId !== "all" && String(p.client_id ?? "") !== reportsClientId) continue;
      const d = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
      if (!isValidDate(d)) continue;
      if (d < reportsInterval.start || d > reportsInterval.end) continue;
      const clientName =
        (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.company
        ?? (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.name
        ?? "Cliente";
      const key = String(p.client_id ?? "");
      const cur = map.get(key) ?? { client: clientName, total: 0 };
      cur.total += Number(p.value ?? 0);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [payments.data, reportsClientId, reportsInterval.end, reportsInterval.start]);

  const reportsRevenueByProject = useMemo(() => {
    const projects = (projectsQuery.data ?? []) as Array<{ id: string; title?: string; name?: string; client_id?: string | null; start_date?: string | null; end_date?: string | null }>;
    const paymentsPaid = (payments.data ?? []).filter((p) => p.status === "pago");

    return projects
      .filter((pr) => (reportsClientId === "all" ? true : String(pr.client_id ?? "") === reportsClientId))
      .map((pr) => {
        const clientId = String(pr.client_id ?? "");
        const start = pr.start_date ? safeParseDate(String(pr.start_date)) : null;
        const end = pr.end_date ? safeParseDate(String(pr.end_date)) : null;
        const title = String(pr.title ?? pr.name ?? "Projeto");

        let total = 0;
        for (const p of paymentsPaid) {
          if (String(p.client_id ?? "") !== clientId) continue;
          const d = p.paid_at ? safeParseDate(p.paid_at) : safeParseDate(p.due_date);
          if (!isValidDate(d)) continue;
          if (d < reportsInterval.start || d > reportsInterval.end) continue;
          if (start && isValidDate(start) && d < start) continue;
          if (end && isValidDate(end) && d > end) continue;
          total += Number(p.value ?? 0);
        }

        return { project: title, total };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [payments.data, projectsQuery.data, reportsClientId, reportsInterval.end, reportsInterval.start]);

  const cashflowRows = useMemo(() => {
    const from = safeParseDate(cashflowFrom);
    const to = safeParseDate(cashflowTo);

    type Row = { id: string; date: string; type: "receita" | "despesa" | "folha"; category: string; description: string; value: number; status?: string };
    const rows: Row[] = [];

    for (const p of payments.data ?? []) {
      // Para pagamentos recebidos, usa paid_at como data de referência (mês do recebimento)
      // Para pendentes, usa due_date (mês do vencimento)
      const rawDate = p.status === "pago" && p.paid_at ? String(p.paid_at) : String(p.due_date ?? "");
      const d = rawDate.substring(0, 10);
      if (!d) continue;
      const dt = safeParseDate(d);
      if (!isValidDate(dt)) continue;
      if (isValidDate(from) && dt < from) continue;
      if (isValidDate(to) && dt > to) continue;
      rows.push({
        id: p.id,
        date: d,
        type: "receita",
        category: p.contract_id ? "Contrato" : "Receita",
        description: String(p.description ?? ""),
        value: Number(p.value ?? 0),
        status: p.status ?? undefined,
      });
    }

    for (const e of expenses.data ?? []) {
      const d = String(e.due_date ?? "");
      if (!d) continue;
      const dt = safeParseDate(d);
      if (!isValidDate(dt)) continue;
      if (isValidDate(from) && dt < from) continue;
      if (isValidDate(to) && dt > to) continue;
      const cat = (e as { suppliers?: { service_category?: string | null } | null }).suppliers?.service_category ?? "Outros";
      rows.push({
        id: e.id,
        date: d,
        type: "despesa",
        category: cat,
        description: String(e.description ?? ""),
        value: -Math.abs(Number(e.value ?? 0)),
        status: e.status ?? undefined,
      });
    }

    for (const pe of payrollExpenses.data ?? []) {
      const d = String(pe.reference_date ?? "");
      if (!d) continue;
      const dt = safeParseDate(d);
      if (!isValidDate(dt)) continue;
      if (isValidDate(from) && dt < from) continue;
      if (isValidDate(to) && dt > to) continue;
      rows.push({
        id: pe.id,
        date: d,
        type: "folha",
        category: "Folha",
        description: "Folha de pagamento",
        value: -Math.abs(Number(pe.total_value ?? 0)),
      });
    }

    return rows
      .filter((r) => (cashflowType === "all" ? true : r.type === cashflowType))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [cashflowFrom, cashflowTo, cashflowType, expenses.data, payments.data, payrollExpenses.data]);

  const [payrollMonth, setPayrollMonth] = useState(monthKey);
  const [payrollAgencyFilter, setPayrollAgencyFilter] = useState<"current">("current");
  const [payrollTeamFilter, setPayrollTeamFilter] = useState<string>("all");
  const [payrollRoleFilter, setPayrollRoleFilter] = useState<string>("all");

  const payrollPayMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseUntyped
        .from("payrolls")
        .update({ status: "paid", payment_date: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payrolls", organizationId] }),
  });

  const payrollTeamByProfileId = useMemo(() => {
    const teamNameById = new Map<string, string>();
    for (const t of teamsQuery.data ?? []) {
      teamNameById.set(String(t.id), String(t.name));
    }
    const map = new Map<string, { teamId: string; teamName: string }>();
    for (const m of teamMembersQuery.data ?? []) {
      const teamId = String(m.team_id);
      const profileId = String(m.profile_id);
      const teamName = teamNameById.get(teamId) ?? "Equipe";
      if (!map.has(profileId)) map.set(profileId, { teamId, teamName });
    }
    return map;
  }, [teamMembersQuery.data, teamsQuery.data]);

  const payrollRoleByProfileId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profilesQuery.data ?? []) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      const jobTitle = String(meta.job_title ?? meta.cargo ?? "").trim();
      if (jobTitle) map.set(String(p.id), jobTitle);
    }
    return map;
  }, [profilesQuery.data]);

  const payrollTeamOptions = useMemo(() => {
    return (teamsQuery.data ?? []).map((t) => ({ id: String(t.id), name: String(t.name) }));
  }, [teamsQuery.data]);

  const payrollRoleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of payrollRoleByProfileId.values()) set.add(v);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payrollRoleByProfileId]);

  const payrollMonthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of payrollsQuery.data ?? []) {
      const d = String(p.reference_date ?? "");
      if (d.length >= 7) set.add(d.slice(0, 7));
    }
    const arr = Array.from(set).sort().reverse();
    if (arr.length === 0) return [monthKey];
    return arr;
  }, [monthKey, payrollsQuery.data]);

  const payrollMonthRows = useMemo(() => {
    const baseList = (payrollsQuery.data ?? []).filter((p) => String(p.reference_date ?? "").slice(0, 7) === payrollMonth);
    const list = baseList.filter((p) => {
      const profileId = String(p.profile_id ?? "");
      const team = payrollTeamByProfileId.get(profileId);
      const role = payrollRoleByProfileId.get(profileId) ?? "";
      const teamOk = payrollTeamFilter === "all" ? true : team?.teamId === payrollTeamFilter;
      const roleOk = payrollRoleFilter === "all" ? true : role === payrollRoleFilter;
      const agencyOk = payrollAgencyFilter === "current";
      return teamOk && roleOk && agencyOk;
    });

    const sums = list.reduce(
      (acc, p) => {
        acc.base_salary += Number(p.base_salary ?? 0);
        acc.commission += Number(p.commission ?? 0);
        acc.overtime += Number(p.overtime ?? 0);
        acc.bonus += Number(p.bonus ?? 0);
        acc.discounts += Number(p.discounts ?? 0);
        acc.total += Number(p.total_value ?? 0);
        return acc;
      },
      { base_salary: 0, commission: 0, overtime: 0, bonus: 0, discounts: 0, total: 0 }
    );
    const avg = list.length > 0 ? sums.total / list.length : 0;
    return { list, sums, avg };
  }, [payrollAgencyFilter, payrollMonth, payrollRoleByProfileId, payrollRoleFilter, payrollTeamByProfileId, payrollTeamFilter, payrollsQuery.data]);

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const handleCreateReceber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReceber.client_id || !formReceber.description || !formReceber.value || !formReceber.due_date) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await payments.create.mutateAsync({
        client_id: formReceber.client_id,
        description: formReceber.description,
        value: Number(formReceber.value.replace(",", ".")),
        due_date: formReceber.due_date,
      });
      setModalReceber(false);
      setFormReceber({ client_id: "", description: "", value: "", due_date: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao adicionar conta a receber";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = (newClientForm.company || newClientForm.name).trim();
    if (!name) return;
    setCreatingClient(true);
    setClientError(null);
    try {
      const c = await clientsQuery.create.mutateAsync({ 
        name, 
        company: newClientForm.company || newClientForm.name,
        organization_id: organizationId!
      } as any);
      setFormReceber((f) => ({ ...f, client_id: c.id }));
      setShowNewClient(false);
      setNewClientForm({ name: "", company: "" });
      toast.success("Cliente cadastrado!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao cadastrar cliente";
      setClientError(msg);
      toast.error(msg);
    } finally {
      setCreatingClient(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSupplierForm.name.trim();
    if (!name) return;
    setCreatingSupplier(true);
    setSupplierError(null);
    try {
      const service_category = newSupplierForm.service_category.trim();
      const s = await suppliersQuery.create.mutateAsync({ 
        name, 
        service_category,
        organization_id: organizationId!
      } as any);
      setFormPagar((f) => ({ ...f, supplier_id: s.id }));
      setShowNewSupplier(false);
      setNewSupplierForm({ name: "", service_category: "Outros" });
      toast.success("Fornecedor cadastrado!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao cadastrar fornecedor";
      setSupplierError(msg);
      toast.error(msg);
    } finally {
      setCreatingSupplier(false);
    }
  };

  const handleCreatePagar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPagar.supplier_id || !formPagar.description || !formPagar.value || !formPagar.due_date) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await expenses.create.mutateAsync({
        supplier_id: formPagar.supplier_id,
        description: formPagar.description,
        value: Number(formPagar.value.replace(",", ".")),
        due_date: formPagar.due_date,
      });
      setModalPagar(false);
      setFormPagar({ supplier_id: "", description: "", value: "", due_date: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao adicionar conta a pagar";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Contas a pagar e contas a receber. Clique para registrar pagamento ou recebimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector
            initialPreset={period as PeriodOption}
            onChange={(range, preset) => {
              setSelectedRange(range);
              setPeriod(preset as PeriodOption | 'custom');
            }}
          />
          <Button
            variant="outline"
            onClick={() => setModalReceber(true)}
            disabled={!scopePermission.canCreate}
          >
            <Plus className="h-4 w-4 mr-2" /> Conta a receber
          </Button>
          <Button
            variant="outline"
            onClick={() => setModalPagar(true)}
            disabled={!scopePermission.canCreate}
          >
            <Plus className="h-4 w-4 mr-2" /> Conta a pagar
          </Button>
        </div>
      </div>

      <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)} className="space-y-6">
        <TabsList className="w-full flex flex-wrap justify-start">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
          <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
          <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="payroll">Folha de Pagamento</TabsTrigger>
          <TabsTrigger value="contracts">Contratos</TabsTrigger>
          <TabsTrigger value="nfse">NFS-e</TabsTrigger>
          <TabsTrigger value="dre">DRE</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          <TabsTrigger value="c8control">C8 Control</TabsTrigger>
        </TabsList>

        {!scopePermission.canView ? (
          <div className="flex flex-col items-center justify-center min-h-[240px] gap-2 text-center">
            <h2 className="text-lg font-semibold text-foreground">Acesso negado</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta seção.</p>
          </div>
        ) : (
          <>
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Saldo atual em caixa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-semibold ${kpis.cashBalance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {formatCurrency(kpis.cashBalance)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Receita do mês</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold text-emerald-600">{formatCurrency(kpis.receivedMonth)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Despesas do mês</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold text-red-500">{formatCurrency(kpis.monthExpenses)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Lucro do mês</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-semibold ${kpis.monthProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {formatCurrency(kpis.monthProfit)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Contas a receber</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold text-emerald-600">{formatCurrency(kpis.pendingReceivablesTotal)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Contas a pagar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold text-red-500">
                  {formatCurrency(kpis.pendingPayablesTotal + kpis.pendingPayrollTotal)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Margem do mês</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-semibold ${kpis.margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {(kpis.margin * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Folha de Pagamento (mês)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{formatCurrency(kpis.payrollCostMonth)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Custo com despesas (mês)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{formatCurrency(kpis.supplierPaidMonth)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Invest. Marketing (mês)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{formatCurrency(kpis.marketingSpendMonth)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Inadimplência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold text-red-500">{formatCurrency(kpis.overdueReceivablesTotal)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Inadimplência recebida (mês)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold text-emerald-600">{formatCurrency(kpis.delinquencyReceivedMonth)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {kpis.delinquencyReceivedMonthPercent === null ? "—" : `${(kpis.delinquencyReceivedMonthPercent * 100).toFixed(1)}%`} da inadimplência
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fluxo financeiro diário ({period === 'custom' ? formatRangeLabel(selectedRange) : PERIOD_LABELS[period as PeriodOption]})</CardTitle>
              <p className="text-sm text-muted-foreground">Receita e despesas por dia</p>
            </CardHeader>
            <CardContent className="pl-0">
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailySeries} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))
                      }
                    />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend />
                    <Bar dataKey="receita" name="Receita" fill="hsl(152 60% 42%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas_total" name="Despesas" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recebimentos futuros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(receivables
                  .filter((p) => {
                    try { return parseISO(p.due_date) >= new Date(); } catch { return false; }
                  })
                  .slice()
                  .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
                  .slice(0, 5)
                ).map((p) => {
                  const clientName =
                    (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.company
                    ?? (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.name
                    ?? "-";
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-sm p-1.5 rounded-lg cursor-pointer hover:bg-emerald-50 transition-colors"
                      onClick={() => setSection("receivables")}
                      title="Clique para registrar recebimento"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{clientName}</div>
                        <div className="text-xs text-muted-foreground">{format(parseISO(p.due_date), "dd/MM/yyyy", { locale: ptBR })}</div>
                      </div>
                      <div className="font-semibold text-emerald-600">{formatCurrency(p.value)}</div>
                    </div>
                  );
                })}
                <Button variant="link" size="sm" className="px-0" onClick={() => setSection("receivables")}>
                  Ver todos
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pagamentos futuros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  ...payables.map((e) => ({
                    id: e.id,
                    due_date: e.due_date,
                    label: (e as { suppliers?: { name?: string | null } | null }).suppliers?.name ?? "Fornecedor",
                    value: Number(e.value ?? 0),
                    type: "payable" as const,
                  })),
                  ...pendingPayroll.map((pe) => ({
                    id: pe.id,
                    due_date: pe.reference_date,
                    label: "Folha de pagamento",
                    value: Number(pe.total_value ?? 0),
                    type: "payroll" as const,
                  })),
                ]
                  .filter((r) => {
                    try { return parseISO(r.due_date) >= new Date(); } catch { return false; }
                  })
                  .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
                  .slice(0, 5)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between text-sm p-1.5 rounded-lg cursor-pointer hover:bg-red-50 transition-colors"
                      onClick={() => setSection("payables")}
                      title="Clique para registrar pagamento"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.label}</div>
                        <div className="text-xs text-muted-foreground">{format(parseISO(r.due_date), "dd/MM/yyyy", { locale: ptBR })}</div>
                      </div>
                      <div className="font-semibold text-red-500">{formatCurrency(r.value)}</div>
                    </div>
                  ))}
                <Button variant="link" size="sm" className="px-0" onClick={() => setSection("payables")}>
                  Ver todos
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inadimplentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {receivables
                  .filter((p) => {
                    try { return parseISO(p.due_date) < new Date(); } catch { return false; }
                  })
                  .slice()
                  .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
                  .slice(0, 5)
                  .map((p) => {
                    const clientName =
                      (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.company
                      ?? (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.name
                      ?? "-";
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-sm p-1.5 rounded-lg cursor-pointer hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
                        onClick={() => setSection("receivables")}
                        title="Clique para registrar recebimento"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate text-red-700">{clientName}</div>
                          <div className="text-xs text-red-500">{format(parseISO(p.due_date), "dd/MM/yyyy", { locale: ptBR })}</div>
                        </div>
                        <div className="font-semibold text-red-500">{formatCurrency(p.value)}</div>
                      </div>
                    );
                  })}
                <Button variant="link" size="sm" className="px-0" onClick={() => setSection("receivables")}>
                  Ver todos
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita vs Despesa por mês</CardTitle>
              </CardHeader>
              <CardContent className="pl-0">
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlySeries} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))
                        }
                      />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Legend />
                      <Bar dataKey="receitas" name="Receitas" fill="hsl(152 60% 42%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="saidas" name="Despesas" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribuição de despesas (mês)</CardTitle>
              </CardHeader>
              <CardContent>
                {expensesDistributionMonth.length === 0 ? (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground">Sem despesas no período.</div>
                ) : (
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={expensesDistributionMonth} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                          {expensesDistributionMonth.map((_, i) => (
                            <Cell key={i} fill={["hsl(0 84% 60%)", "hsl(0 72% 51%)", "hsl(0 70% 45%)", "hsl(0 62% 40%)", "hsl(0 58% 35%)"][i % 5]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolução do lucro</CardTitle>
            </CardHeader>
            <CardContent className="pl-0">
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlySeries} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))
                      }
                    />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="resultado" name="Lucro/Prejuízo" stroke="hsl(265 62% 46%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cashflow" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>De</Label>
                  <Input value={cashflowFrom} onChange={(e) => setCashflowFrom(e.target.value)} placeholder="YYYY-MM-DD" />
                </div>
                <div>
                  <Label>Até</Label>
                  <Input value={cashflowTo} onChange={(e) => setCashflowTo(e.target.value)} placeholder="YYYY-MM-DD" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={cashflowType} onValueChange={(v) => setCashflowType(v as typeof cashflowType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="folha">Folha de pagamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashflowRows.map((r, idx) => (
                    <TableRow key={`${r.type}-${r.date}-${idx}`}>
                      <TableCell>{format(parseISO(r.date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                      <TableCell className="capitalize">{r.type === "folha" ? "Folha de pagamento" : r.type}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell className={`text-right ${r.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {formatCurrency(r.value)}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full ${
                          r.status === "pago" ? "bg-emerald-100 text-emerald-700" :
                          r.status === "pendente" ? "bg-yellow-100 text-yellow-700" :
                          r.status === "cancelado" ? "bg-red-100 text-red-700" :
                          "bg-muted text-muted-foreground"
                        }`}>{r.status ?? "—"}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" aria-label="Visualizar" onClick={() => setViewRow(r)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {r.type === "receita" && (
                            <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => {
                              setEditRow(r);
                              setEditForm({ description: r.description, value: String(Math.abs(r.value)), due_date: r.date });
                            }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receivables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contas a Receber</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="text-sm text-muted-foreground">Total a receber</div>
                <div className="text-right font-semibold text-emerald-600 md:col-span-2">{formatCurrency(kpis.pendingReceivablesTotal)}</div>
                <div className="text-sm text-muted-foreground">Recebido no mês</div>
                <div className="text-right font-semibold text-emerald-600 md:col-span-2">{formatCurrency(kpis.receivedMonth)}</div>
                <div className="text-sm text-muted-foreground">Valores vencidos</div>
                <div className="text-right font-semibold text-red-500 md:col-span-2">{formatCurrency(kpis.overdueReceivablesTotal)}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivables.map((p) => {
                    const clientName =
                      (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.company
                      ?? (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.name
                      ?? "-";
                    const ct = p.contract_id ? (contractLabelById.get(String(p.contract_id)) ?? "Contrato") : "—";
                    const overdue = (() => {
                      try { return parseISO(p.due_date) < new Date(); } catch { return false; }
                    })();
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{clientName}</TableCell>
                        <TableCell>{ct}</TableCell>
                        <TableCell className={`text-right font-semibold ${overdue ? "text-red-500" : "text-emerald-600"}`}>
                          {formatCurrency(p.value)}
                        </TableCell>
                        <TableCell>{format(parseISO(p.due_date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                        <TableCell className="capitalize">{p.status}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" onClick={() => {
                              setReceivePaymentId(p.id);
                              setReceivePaymentTotal(p.value);
                              setReceivePaymentDesc(p.description);
                              setReceivePaymentClientId(p.client_id);
                              setReceivePaymentContractId(p.contract_id ?? null);
                              setReceiveValue(String(p.value));
                              setReceiveDate(p.due_date ? p.due_date.substring(0, 10) : format(new Date(), "yyyy-MM-dd"));
                            }} disabled={payments.registerPayment.isPending}>
                              <Check className="h-4 w-4 mr-1" />
                              Receber
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => requirePin(
                                "Excluir conta a receber",
                                "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
                                async () => { payments.remove.mutate(p.id); }
                              )}
                              disabled={payments.remove?.isPending}
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contas a Pagar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="text-sm text-muted-foreground">Total a pagar</div>
                <div className="text-right font-semibold text-red-500">{formatCurrency(kpis.pendingPayablesTotal + kpis.pendingPayrollTotal)}</div>
                <div className="text-sm text-muted-foreground">Pagos no mês</div>
                <div className="text-right font-semibold text-red-500">{formatCurrency(kpis.monthExpenses)}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payables.map((e) => {
                    const supplierName = (e as { suppliers?: { name?: string | null } | null }).suppliers?.name ?? "-";
                    const category = (e as { suppliers?: { service_category?: string | null } | null }).suppliers?.service_category ?? "Outros";
                    const overdue = (() => {
                      try { return parseISO(e.due_date) < new Date(); } catch { return false; }
                    })();
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{supplierName}</TableCell>
                        <TableCell>{category}</TableCell>
                        <TableCell className={`text-right font-semibold ${overdue ? "text-red-600" : "text-red-500"}`}>
                          {formatCurrency(e.value)}
                        </TableCell>
                        <TableCell>{format(parseISO(e.due_date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                        <TableCell className="capitalize">{e.status}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="secondary" onClick={() => expenses.registerPayment.mutate(e.id)} disabled={expenses.registerPayment.isPending}>
                              <Check className="h-4 w-4 mr-1" />
                              Pagar
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => requirePin(
                                "Excluir despesa",
                                "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
                                async () => { expenses.remove.mutate(e.id); }
                              )}
                              disabled={expenses.remove?.isPending}
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nfse" className="space-y-6">
          <FiscalPage embedded />
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          {organizationId && <SupplierExpensesView organizationId={organizationId} />}
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Folha de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label>Mês</Label>
                  <Select value={payrollMonth} onValueChange={setPayrollMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {payrollMonthOptions.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Agência</Label>
                  <Select value={payrollAgencyFilter} onValueChange={(v) => setPayrollAgencyFilter(v as typeof payrollAgencyFilter)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Atual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Equipe</Label>
                  <Select value={payrollTeamFilter} onValueChange={setPayrollTeamFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {payrollTeamOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Select value={payrollRoleFilter} onValueChange={setPayrollRoleFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {payrollRoleOptions.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 mt-4 md:grid-cols-3 lg:grid-cols-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Salário base</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-red-500">{formatCurrency(payrollMonthRows.sums.base_salary)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Comissões</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-red-500">{formatCurrency(payrollMonthRows.sums.commission)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Hora extra</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-red-500">{formatCurrency(payrollMonthRows.sums.overtime)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Bônus</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-red-500">{formatCurrency(payrollMonthRows.sums.bonus)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Descontos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-red-500">{formatCurrency(payrollMonthRows.sums.discounts)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-red-500">{formatCurrency(payrollMonthRows.sums.total)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Médio: {formatCurrency(payrollMonthRows.avg)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Equipe</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead className="text-right">Salário base</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead className="text-right">Hora extra</TableHead>
                    <TableHead className="text-right">Bônus</TableHead>
                    <TableHead className="text-right">Descontos</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollMonthRows.list.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.profiles?.full_name ?? "—"}</TableCell>
                      <TableCell>{payrollTeamByProfileId.get(String(p.profile_id ?? ""))?.teamName ?? "—"}</TableCell>
                      <TableCell>{payrollRoleByProfileId.get(String(p.profile_id ?? "")) ?? "—"}</TableCell>
                      <TableCell>{format(parseISO(p.reference_date), "MMM/yy", { locale: ptBR })}</TableCell>
                      <TableCell className="text-right text-red-500">{formatCurrency(Number(p.base_salary ?? 0))}</TableCell>
                      <TableCell className="text-right text-red-500">{formatCurrency(Number(p.commission ?? 0))}</TableCell>
                      <TableCell className="text-right text-red-500">{formatCurrency(Number(p.overtime ?? 0))}</TableCell>
                      <TableCell className="text-right text-red-500">{formatCurrency(Number(p.bonus ?? 0))}</TableCell>
                      <TableCell className="text-right text-red-500">{formatCurrency(Number(p.discounts ?? 0))}</TableCell>
                      <TableCell className="text-right font-semibold text-red-500">{formatCurrency(Number(p.total_value ?? 0))}</TableCell>
                      <TableCell className="capitalize">{p.status}</TableCell>
                      <TableCell className="text-right">
                        {String(p.status) === "pending" ? (
                          <Button
                            size="sm"
                            onClick={() => payrollPayMutation.mutate(String(p.id))}
                            disabled={payrollPayMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Pagar
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contratos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(contractsFullQuery.data ?? []).map((c) => {
                    const client = (c as { clients?: { company?: string | null; name?: string | null } | null }).clients?.company
                      ?? (c as { clients?: { company?: string | null; name?: string | null } | null }).clients?.name
                      ?? "—";
                    const label = String((c as { service_contracted?: string | null; title?: string | null }).service_contracted ?? (c as { title?: string | null }).title ?? "Contrato");
                    const status = String((c as { status?: string | null }).status ?? "");
                    const value = Number((c as { value?: number | null }).value ?? 0);
                    const start = String((c as { start_date?: string | null }).start_date ?? "");
                    const end = String((c as { end_date?: string | null }).end_date ?? "");
                    return (
                      <TableRow key={String((c as { id?: string }).id)}>
                        <TableCell className="font-medium">{client}</TableCell>
                        <TableCell>{label}</TableCell>
                        <TableCell className="capitalize">{status}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatCurrency(value)}</TableCell>
                        <TableCell>{start ? format(parseISO(start), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                        <TableCell>{end ? format(parseISO(end), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dre" className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">DRE</CardTitle>
              <p className="text-sm text-muted-foreground">Receitas, custos, folha de pagamento, marketing e resultado</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      {drePivot.months.map((m) => (
                        <TableHead key={m.key} className="text-right">{m.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drePivot.rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className={row.strong ? "font-semibold" : undefined}>{row.label}</TableCell>
                        {row.values.map((v, idx) => {
                          const tone =
                            row.tone === "positive"
                              ? "text-emerald-600"
                              : row.tone === "negative"
                                ? "text-red-500"
                                : (v >= 0 ? "text-emerald-600" : "text-red-500");
                          return (
                            <TableCell key={`${row.key}_${idx}`} className={`text-right tabular-nums ${tone}`}>
                              {formatCurrency(v)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label>Período</Label>
                  <Select value={String(reportsMonths)} onValueChange={(v) => setReportsMonths(Number(v) as 3 | 6 | 12 | 24)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">Últimos 3 meses</SelectItem>
                      <SelectItem value="6">Últimos 6 meses</SelectItem>
                      <SelectItem value="12">Últimos 12 meses</SelectItem>
                      <SelectItem value="24">Últimos 24 meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cliente</Label>
                  <Select value={reportsClientId} onValueChange={setReportsClientId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={reportsExpenseCategory} onValueChange={setReportsExpenseCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Top</Label>
                  <Select value={String(reportsTop)} onValueChange={(v) => setReportsTop(Number(v) as 5 | 10 | 20)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">DRE Simplificado</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Custos</TableHead>
                    <TableHead className="text-right">Folha</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportsMonthlySeries.slice().reverse().map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="capitalize">{r.name}</TableCell>
                      <TableCell className="text-right text-emerald-600">{formatCurrency(r.receitas)}</TableCell>
                      <TableCell className="text-right text-red-500">{formatCurrency(r.despesas)}</TableCell>
                      <TableCell className="text-right text-red-500">{formatCurrency(r.folha)}</TableCell>
                      <TableCell className={`text-right ${r.resultado >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(r.resultado)}</TableCell>
                    </TableRow>
                  ))}
                  {reportsMonthlySeries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">Sem dados.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ROI de Marketing (últimos 6 meses)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Investimento</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const marketingRow = drePivot.rows.find((r) => r.key === "marketing");
                      const revenueRow = drePivot.rows.find((r) => r.key === "receita_bruta");
                      if (!marketingRow || !revenueRow) return null;

                      return drePivot.months
                        .map((m, idx) => ({ m, idx }))
                        .slice()
                        .reverse()
                        .map(({ m, idx }) => {
                          const invest = Number(marketingRow.values[idx] ?? 0);
                          const revenue = Number(revenueRow.values[idx] ?? 0);
                          return (
                            <TableRow key={m.key}>
                              <TableCell className="capitalize">{m.label}</TableCell>
                              <TableCell className="text-right text-red-500">{formatCurrency(invest)}</TableCell>
                              <TableCell className="text-right text-emerald-600">{formatCurrency(revenue)}</TableCell>
                              <TableCell className="text-right">{invest > 0 ? (revenue / invest).toFixed(2) : "—"}</TableCell>
                            </TableRow>
                          );
                        });
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Despesas por categoria (mês)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportsExpensesByCategory.slice(0, reportsTop).map((r) => (
                      <TableRow key={r.name}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right text-red-500">{formatCurrency(r.value)}</TableCell>
                      </TableRow>
                    ))}
                    {reportsExpensesByCategory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">Sem dados.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita por cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Receita total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportsRevenueByClient.slice(0, reportsTop).map((r) => (
                      <TableRow key={r.client}>
                        <TableCell className="font-medium">{r.client}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatCurrency(r.total)}</TableCell>
                      </TableRow>
                    ))}
                    {reportsRevenueByClient.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">Sem dados.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita por projeto</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projeto</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportsRevenueByProject.slice(0, reportsTop).map((r) => (
                      <TableRow key={r.project}>
                        <TableCell className="font-medium">{r.project}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatCurrency(r.total)}</TableCell>
                      </TableRow>
                    ))}
                    {reportsRevenueByProject.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">Sem dados.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="c8control" className="mt-4">
          {organizationId && <C8ControlFinancialTab organizationId={organizationId} />}
        </TabsContent>
          </>
        )}
      </Tabs>

      <Dialog open={modalReceber} onOpenChange={setModalReceber}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conta a receber</DialogTitle>
            <DialogDescription>
              Preencha os dados do lançamento para registrar uma nova entrada.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateReceber} className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <Label>Cliente *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowNewClient(true)}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  Cadastrar novo
                </Button>
              </div>
              <Select
                value={formReceber.client_id}
                onValueChange={(v) => setFormReceber({ ...formReceber, client_id: v })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Nenhum cliente. Clique em &quot;Cadastrar novo&quot; para criar.
                </p>
              )}
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input
                value={formReceber.description}
                onChange={(e) => setFormReceber({ ...formReceber, description: e.target.value })}
                placeholder="Ex: Mensalidade jan/2025"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <CurrencyInput
                  value={formReceber.value}
                  onChange={(v) => setFormReceber({ ...formReceber, value: v })}
                  required
                />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input
                  type="date"
                  value={formReceber.due_date}
                  onChange={(e) => setFormReceber({ ...formReceber, due_date: e.target.value })}
                  required
                />
              </div>
            </div>
            {submitError && (
              <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-3 rounded">
                {submitError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setModalReceber(false);
                setSubmitError(null);
              }}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  !scopePermission.canCreate ||
                  submitting ||
                  payments.create.isPending ||
                  !formReceber.client_id
                }
              >
                {(submitting || payments.create.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pop-up: Novo Cliente */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
         <DialogContent className="max-w-sm">
           <DialogHeader>
             <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
             <DialogDescription>
               Insira o nome ou empresa para cadastrar um novo cliente rapidamente.
             </DialogDescription>
           </DialogHeader>
          <form onSubmit={handleCreateClient} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-client-name">Nome ou Empresa *</Label>
              <Input
                id="new-client-name"
                placeholder="Ex: Acme Corp"
                value={newClientForm.name || newClientForm.company}
                onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value, company: e.target.value })}
                required
              />
            </div>
            {clientError && (
              <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-2 rounded">
                {clientError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewClient(false)} disabled={creatingClient}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creatingClient || clientsQuery.create.isPending}>
                {(creatingClient || clientsQuery.create.isPending) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Conta a pagar */}
      <Dialog open={modalPagar} onOpenChange={setModalPagar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conta a pagar</DialogTitle>
            <DialogDescription>
              Preencha os dados do lançamento para registrar uma nova despesa.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePagar} className="space-y-4">
            <div>
              <div className="flex flex-col gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="payroll-toggle"
                    checked={isPayroll}
                    onCheckedChange={(c) => {
                      const checked = !!c;
                      setIsPayroll(checked);
                      if (checked) {
                        setFormPagar((f) => ({ ...f, supplier_id: "" }));
                      }
                    }}
                  />
                  <Label htmlFor="payroll-toggle">Folha de pagamento</Label>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Fornecedor {!isPayroll && "*"}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowNewSupplier(true)}
                    disabled={isPayroll}
                  >
                    <UserPlus className="h-3 w-3 mr-1" />
                    Cadastrar novo
                  </Button>
                </div>
              </div>
              <Select
                value={formPagar.supplier_id}
                onValueChange={(v) => setFormPagar({ ...formPagar, supplier_id: v })}
                required={!isPayroll}
                disabled={isPayroll}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suppliers.length === 0 && !isPayroll && (
                <p className="text-xs text-muted-foreground mt-1">
                  Nenhum fornecedor. Clique em &quot;Cadastrar novo&quot; para criar.
                </p>
              )}
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input
                value={formPagar.description}
                onChange={(e) => setFormPagar({ ...formPagar, description: e.target.value })}
                placeholder="Ex: Compra de material"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <CurrencyInput
                  value={formPagar.value}
                  onChange={(v) => setFormPagar({ ...formPagar, value: v })}
                  required
                />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input
                  type="date"
                  value={formPagar.due_date}
                  onChange={(e) => setFormPagar({ ...formPagar, due_date: e.target.value })}
                  required
                />
              </div>
            </div>
            {submitError && (
              <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-3 rounded">
                {submitError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setModalPagar(false);
                setSubmitError(null);
              }}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  !scopePermission.canCreate ||
                  submitting ||
                  expenses.create.isPending ||
                  (!isPayroll && !formPagar.supplier_id)
                }
              >
                {(submitting || expenses.create.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pop-up: Novo Fornecedor */}
      <Dialog open={showNewSupplier} onOpenChange={setShowNewSupplier}>
         <DialogContent className="max-w-sm">
           <DialogHeader>
             <DialogTitle>Cadastrar Novo Fornecedor</DialogTitle>
             <DialogDescription>
               Cadastre um novo fornecedor para o lançamento de despesas.
             </DialogDescription>
           </DialogHeader>
          <form onSubmit={handleCreateSupplier} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-supplier-name">Nome do Fornecedor *</Label>
              <Input
                id="new-supplier-name"
                placeholder="Ex: Fornecedor Ltda"
                value={newSupplierForm.name}
                onChange={(e) => setNewSupplierForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria da Despesa</Label>
              <Select
                value={newSupplierForm.service_category}
                onValueChange={(v) => setNewSupplierForm((f) => ({ ...f, service_category: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {supplierError && (
              <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-2 rounded">
                {supplierError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewSupplier(false)} disabled={creatingSupplier}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creatingSupplier || suppliersQuery.create.isPending}>
                {(creatingSupplier || suppliersQuery.create.isPending) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Visualizar lançamento ── */}
      <Dialog open={!!viewRow} onOpenChange={(o) => { if (!o) setViewRow(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Lançamento</DialogTitle>
          </DialogHeader>
          {viewRow && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span className="font-semibold">{format(parseISO(viewRow.date), "dd/MM/yyyy", { locale: ptBR })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span className="font-semibold capitalize">{viewRow.type === "folha" ? "Folha de pagamento" : viewRow.type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Categoria</span><span className="font-semibold">{viewRow.category}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Descrição</span><span className="font-semibold">{viewRow.description}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><span className={`font-bold ${viewRow.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(viewRow.value)}</span></div>
              {viewRow.status && <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-semibold capitalize">{viewRow.status}</span></div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewRow(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar lançamento de receita ── */}
      <Dialog open={!!editRow} onOpenChange={(o) => { if (!o) setEditRow(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <CurrencyInput value={editForm.value} onChange={(v) => setEditForm({ ...editForm, value: v })} />
            </div>
            <div className="space-y-1">
              <Label>Data de vencimento</Label>
              <Input type="date" value={editForm.due_date} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!editRow) return;
              await payments.updatePayment.mutateAsync({
                id: editRow.id,
                description: editForm.description,
                value: parseFloat(editForm.value),
                due_date: editForm.due_date,
              });
              toast.success("Lançamento atualizado!");
              setEditRow(null);
            }} disabled={payments.updatePayment.isPending}>
              {payments.updatePayment.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Receber pagamento (total ou parcial) ── */}
      <Dialog open={!!receivePaymentId} onOpenChange={(o) => { if (!o) setReceivePaymentId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            <DialogDescription>
              Valor total: <strong>{formatCurrency(receivePaymentTotal)}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Valor recebido (R$)</Label>
              <CurrencyInput
                value={receiveValue}
                onChange={(v) => setReceiveValue(v)}
              />
              {parseFloat(receiveValue) < receivePaymentTotal && parseFloat(receiveValue) > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Pagamento parcial — saldo restante de {formatCurrency(receivePaymentTotal - parseFloat(receiveValue))} ficará em aberto.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Data do recebimento</Label>
              <Input type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceivePaymentId(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!receivePaymentId) return;
              const received = parseFloat(receiveValue);
              if (isNaN(received) || received <= 0) { toast.error("Informe um valor válido."); return; }
              setIsReceiving(true);
              try {
                const isPartial = received < receivePaymentTotal;
                // Marca o pagamento atual como pago com o valor recebido
                await payments.updatePayment.mutateAsync({
                  id: receivePaymentId,
                  value: received,
                  status: "pago",
                  due_date: receiveDate,
                  paid_at: new Date(receiveDate + "T12:00:00").toISOString(),
                });
                // Se parcial, cria novo pagamento com o saldo restante
                if (isPartial) {
                  const remaining = receivePaymentTotal - received;
                  await payments.create.mutateAsync({
                    client_id: receivePaymentClientId,
                    contract_id: receivePaymentContractId ?? undefined,
                    description: `${receivePaymentDesc} (saldo restante)`,
                    value: remaining,
                    due_date: receiveDate,
                    status: "pendente",
                  });
                  toast.success(`Recebimento parcial registrado. Saldo de ${formatCurrency(remaining)} criado em aberto.`);
                } else {
                  toast.success("Pagamento recebido com sucesso!");
                }
                setReceivePaymentId(null);
              } catch {
                toast.error("Erro ao registrar recebimento.");
              } finally {
                setIsReceiving(false);
              }
            }} disabled={isReceiving}>
              {isReceiving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Confirmar Recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PinAuthDialog {...pinProps} />
    </div>
  );
}
