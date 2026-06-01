import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import { useTeams } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { usePayments } from "@/hooks/useFinancial";
import { useContractsByClient, useContractsWithC8, useCreateContract, useDeleteContract, useEndContract, useReactivateContract, useSuspendContract, useUpdateContract, useSetDashboardReference } from "@/hooks/useContracts";
import type { ContractRow } from "@/hooks/useContracts";
import { useContractMetrics } from "@/hooks/useContractMetrics";
import { useModulePermission } from "@/hooks/usePermissions";
import { getDriveFoldersFromOrganizationSettings, useOrganizationSettings } from "@/hooks/useSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Pencil, Plus, UserCheck, Loader2, Trash2, PauseCircle, RotateCw, Search, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { fetchAddressByCep } from "@/lib/viacep";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { Client } from "@/types/crm";
import { formatCpfCnpj, formatPhoneBR, formatEntityCode } from "@/lib/formatters";
import { addMonths, endOfMonth, format, isWithinInterval, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DocumentsCard } from "@/components/documents/DocumentsCard";
import { DRIVE_AUTO_FOLDERS } from "@/constants/driveAutoFolders";

import { ClientIntegrationsTab } from "@/components/clients/ClientIntegrationsTab";
import { ClientKPIsTab } from "@/components/clients/ClientKPIsTab";
import { DriveFolderStatusAlert } from "@/components/shared/DriveFolderStatusAlert";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import { DriveFolderButton } from "@/components/shared/DriveFolderButton";
import { useDriveFolder } from "@/hooks/useDriveFolder";
import { ClientPerformanceTab } from "@/components/clients/ClientPerformanceTab";
import { ContractDetailPage } from "@/components/clients/ContractDetailPage";
import useFormPersistence from "@/hooks/useFormPersistence";
import { migrateResponsibleToDecisionMaker } from "@/utils/clientMigration";
import { useDynamicRevenue } from "@/hooks/useDynamicRevenue";
import { NICHO_OPTIONS, ORIGEM_OPTIONS } from "@/constants/crmOptions";

const DEFAULT_REGISTRATION_TYPE = "cliente" as const;
const SERVICE_LABELS: Record<string, string> = {
  assessoria: "Assessoria",
  consultoria: "Consultoria",
  gmn: "GMN",
  site: "Site",
  agente_ia: "Agente IA",
  outros: "Outros",
};

export default function ClientsPage() {
  const organizationId = useOrganization();
  const { pinProps, requirePin } = usePinConfirm();
  const orgSettings = useOrganizationSettings(organizationId);
  const driveFolders = useMemo(() => getDriveFoldersFromOrganizationSettings(orgSettings.data), [orgSettings.data]);
  const { profile } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("clients");
  const { canEdit: canManageContracts } = useModulePermission("financial");
  const { data: clients = [], isLoading, error: fetchError, create, update, remove, deactivate, activate, hardDelete } = useClients(organizationId);
  const { autoCreateFolder } = useDriveFolder(organizationId);
  const { data: teams = [] } = useTeams(organizationId);
  const { data: allProfiles = [] } = useProfiles(organizationId);
  const portfolios = useMemo(() => teams.filter(t => t.is_portfolio && t.type === 'comercial'), [teams]);
  const { leads, updateLead, removeLead } = useLeadsKanban(organizationId);
  const paymentsQuery = usePayments(organizationId);
  const contractMetrics = useContractMetrics(organizationId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [fromLeadId, setFromLeadId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Client | null>(null);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractEditingId, setContractEditingId] = useState<string | null>(null);
  const [contractEndOpen, setContractEndOpen] = useState(false);
  const [contractEndReason, setContractEndReason] = useState("");
  const [contractTargetId, setContractTargetId] = useState<string | null>(null);
  const [contractTargetClientId, setContractTargetClientId] = useState<string | null>(null);
  const [contractSuspendOpen, setContractSuspendOpen] = useState(false);
  const [contractSuspendReason, setContractSuspendReason] = useState("");
  const [leadViewOpen, setLeadViewOpen] = useState(false);

  // Estados para aba de pagamentos do cliente
  const [viewingContractId, setViewingContractId] = useState<string | null>(null);
  const [viewPayment, setViewPayment] = useState<any | null>(null);
  const [editPayment, setEditPayment] = useState<any | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ description: "", value: "", due_date: "", status: "pendente" });
  const [receivePaymentOpen, setReceivePaymentOpen] = useState<any | null>(null);
  const [receiveValue, setReceiveValue] = useState("");
  const [receiveDate, setReceiveDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isReceiving, setIsReceiving] = useState(false);
  const [leadEditOpen, setLeadEditOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDraft, setLeadDraft] = useState<{ name: string; company: string; email: string; phone: string }>({
    name: "",
    company: "",
    email: "",
    phone: "",
  });
  const [delinquentOpen, setDelinquentOpen] = useState(false);
  const [deleteClientTarget, setDeleteClientTarget] = useState<Client | null>(null);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  // IDs de clientes com criação de pasta em andamento — suprime o alerta até o folder_id chegar
  const [folderPendingIds, setFolderPendingIds] = useState<Set<string>>(new Set());

  // Limpa IDs pendentes quando o folder_id chegar via React Query
  useEffect(() => {
    if (folderPendingIds.size === 0) return;
    const resolved = clients.filter(
      (c) => folderPendingIds.has(c.id) && (c.folder_id || c.folder_url)
    );
    if (resolved.length > 0) {
      setFolderPendingIds((prev) => {
        const next = new Set(prev);
        resolved.forEach((c) => next.delete(c.id));
        return next;
      });
    }
  }, [clients, folderPendingIds]);
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterPortfolioId, setFilterPortfolioId] = useState<string>("all");
  const [showInactiveClients, setShowInactiveClients] = useState(false);

  // Chave de persistência dinâmica baseada no cliente sendo editado
  const formPersistKey = editing ? `form_client_${editing.id}` : "form_client_new";
  const INITIAL_FORM: Partial<Client> = {
    name: "",
    company: "",
    document: "",
    email: "",
    phone: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    address_number: "",
    address_complement: "",
    address_neighborhood: "",
    niche: "",
    origin: "",
    registration_type: DEFAULT_REGISTRATION_TYPE,
    decision_maker_name: "",
    decision_maker_phone: "",
    portfolio_team_id: "",
  };
  const [form, setForm, clearForm] = useFormPersistence<Partial<Client>>(formPersistKey, INITIAL_FORM);

  const { dynamicRevenue, isLoading: isDynamicRevenueLoading } = useDynamicRevenue(
    organizationId ?? undefined,
    editing?.id ?? undefined
  );

  const filteredClients = useMemo(() => {
    let list = showInactiveClients
      ? clients.filter((c) => (c as any).is_active === false)
      : clients.filter((c) => (c as any).is_active !== false);
    if (filterPortfolioId !== "all") list = list.filter(c => c.portfolio_team_id === filterPortfolioId);
    return list;
  }, [clients, filterPortfolioId, showInactiveClients]);

  const handleCepSearch = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      setSearchingCep(true);
      try {
        const address = await fetchAddressByCep(cleanCep);
        if (address) {
          setForm((f) => ({
            ...f,
            address_street: address.logradouro || f.address_street,
            address_neighborhood: address.bairro || (f as any).address_neighborhood,
            address_city: address.localidade,
            address_state: address.uf,
            address_zip: address.cep,
          }));
          toast.success("Endereço preenchido pelo CEP!");
        } else {
          toast.error("CEP não encontrado.");
        }
      } catch (error) {
        toast.error("Erro ao buscar CEP.");
      } finally {
        setSearchingCep(false);
      }
    }
  };

  const efetivados = leads.filter((l) => l.etapa_kanban === "efetivados");
  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const listHref = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/clients?${qs}` : "/clients";
  }, [searchParams]);

  const clientHref = useMemo(() => {
    const qs = searchParams.toString();
    return (id: string) => (qs ? `/clients/${id}?${qs}` : `/clients/${id}`);
  }, [searchParams]);

  useEffect(() => {
    const viewId = searchParams.get("view");
    if (!viewId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    setSearchParams(next, { replace: true });
    navigate(clientHref(viewId), { replace: true });
  }, [clientHref, navigate, searchParams, setSearchParams]);

  useEffect(() => {
    if (!clientId) {
      setViewing(null);
      return;
    }
    const found = clients.find((c) => String(c.id) === String(clientId));
    setViewing(found ?? null);
  }, [clientId, clients]);

  const convertedLeadIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients) {
      if (c.lead_id) s.add(String(c.lead_id));
    }
    return s;
  }, [clients]);

  const efetivadosParaConverter = useMemo(
    () => efetivados.filter((l) => !convertedLeadIds.has(String(l.id))),
    [efetivados, convertedLeadIds]
  );

  const contractsAllQuery = useQuery({
    queryKey: ["contracts", organizationId, "all"],
    queryFn: async () => {
      if (!organizationId) return [];
      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { data, error } = await supabaseUntyped
        .from("contracts")
        .select("id, client_id, status, value, duration_months, first_payment_value, first_payment_fees, end_date, ended_at")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    },
    enabled: !!organizationId,
  });

  const contractsByClientTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of contractsAllQuery.data ?? []) {
      const clientId = String(r.client_id ?? "");
      if (!clientId) continue;
      const status = String(r.status ?? "");
      if (status === "cancelado") continue;
      const duration = typeof r.duration_months === "number" ? r.duration_months : (r.duration_months ? Number(r.duration_months) : null);
      const first = typeof r.first_payment_value === "number" ? r.first_payment_value : (r.first_payment_value ? Number(r.first_payment_value) : 0);
      const fees = typeof r.first_payment_fees === "number" ? r.first_payment_fees : (r.first_payment_fees ? Number(r.first_payment_fees) : 0);
      const recurring = typeof r.value === "number" ? r.value : Number(r.value ?? 0);
      const total = duration && duration > 0 ? (Number(first ?? 0) + Number(fees ?? 0)) + recurring * Math.max(0, duration - 1) : recurring;
      map.set(clientId, (map.get(clientId) ?? 0) + total);
    }
    return map;
  }, [contractsAllQuery.data]);

  const clientsWithSuspendedContracts = useMemo(() => {
    const ids = new Set<string>();
    for (const r of contractsAllQuery.data ?? []) {
      const clientId = String(r.client_id ?? "");
      if (!clientId) continue;
      if (String(r.status ?? "") === "suspenso") ids.add(clientId);
    }
    return ids;
  }, [contractsAllQuery.data]);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevMonth = addMonths(now, -1);
  const prevMonthStart = startOfMonth(prevMonth);
  const prevMonthEnd = endOfMonth(prevMonth);

  const totalClients = clients.length;
  const newClientsMonth = clients.filter((c) => {
    if (!c.created_at) return false;
    const d = parseISO(c.created_at);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  }).length;
  const cancellationsMonth = (contractsAllQuery.data ?? []).filter((r) => {
    const status = String(r.status ?? "");
    if (status !== "cancelado" && status !== "encerrado") return false;
    const endDate = (r.ended_at as string | null) ?? (r.end_date as string | null);
    if (!endDate) return false;
    const d = parseISO(endDate);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  }).length;
  const cancellationsPrevMonth = (contractsAllQuery.data ?? []).filter((r) => {
    const status = String(r.status ?? "");
    if (status !== "cancelado" && status !== "encerrado") return false;
    const endDate = (r.ended_at as string | null) ?? (r.end_date as string | null);
    if (!endDate) return false;
    const d = parseISO(endDate);
    return isWithinInterval(d, { start: prevMonthStart, end: prevMonthEnd });
  }).length;
  const cancellationsIndex = cancellationsPrevMonth > 0 ? cancellationsMonth / cancellationsPrevMonth : null;

  const delinquentAll = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const rows = (paymentsQuery.data ?? []).filter((p) => {
      const st = (p.status ?? "pendente") as string;
      return st !== "pago" && st !== "cancelado" && String(p.due_date) < today;
    });
    const byClient = new Map<string, { clientId: string; name: string; total: number; count: number }>();
    for (const p of rows) {
      const clientId = String(p.client_id);
      const clientName =
        (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.company ||
        (p as { clients?: { company?: string | null; name?: string | null } | null }).clients?.name ||
        "Cliente";
      const cur = byClient.get(clientId) ?? { clientId, name: clientName, total: 0, count: 0 };
      cur.total += Number(p.value ?? 0);
      cur.count += 1;
      byClient.set(clientId, cur);
    }
    return Array.from(byClient.values()).sort((a, b) => b.total - a.total);
  }, [paymentsQuery.data]);

  const delinquentTop = useMemo(() => delinquentAll.slice(0, 5), [delinquentAll]);

  const leadEfetivacaoDates = useQuery({
    queryKey: ["lead_efetivacao_dates", organizationId, efetivadosParaConverter.map((l) => l.id).join(",")],
    queryFn: async () => {
      if (!organizationId) return new Map<string, string>();
      const ids = efetivadosParaConverter.map((l) => l.id);
      if (ids.length === 0) return new Map<string, string>();
      const { data, error } = await supabase
        .from("lead_stage_history")
        .select("lead_id, moved_at, to_stage")
        .in("lead_id", ids)
        .eq("to_stage", "efetivados")
        .order("moved_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of (data ?? []) as unknown as Array<{ lead_id: string; moved_at: string }>) {
        const id = String(row.lead_id);
        if (!map.has(id)) map.set(id, row.moved_at);
      }
      return map;
    },
    enabled: !!organizationId && efetivadosParaConverter.length > 0,
  });

  const clientContractsQuery = useContractsWithC8(organizationId, viewing?.id ?? undefined);
  const createContract = useCreateContract(organizationId);
  const updateContract = useUpdateContract(organizationId);
  const endContract = useEndContract(organizationId, profile?.id);
  const deleteContract = useDeleteContract(organizationId);
  const suspendContract = useSuspendContract(organizationId);
  const reactivateContract = useReactivateContract(organizationId);
  const setDashboardReference = useSetDashboardReference(organizationId);

  const viewingContractIds = useMemo(() => {
    const ids = (clientContractsQuery.data ?? [])
      .map((c) => String(c.id))
      .filter((id) => !id.startsWith("c8_")); // exclude virtual C8 contracts
    ids.sort();
    return ids;
  }, [clientContractsQuery.data]);

  const contractPaymentsQuery = useQuery({
    queryKey: ["payments", organizationId, "by_contracts", viewing?.id ?? null, viewingContractIds.join(",")],
    queryFn: async () => {
      if (!organizationId) return [];
      if (!viewing?.id) return [];
      if (viewingContractIds.length === 0) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("contract_id, value, status")
        .eq("organization_id", organizationId)
        .eq("client_id", viewing.id)
        .in("contract_id", viewingContractIds);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ contract_id: string | null; value: number; status: string | null }>;
    },
    enabled: !!organizationId && !!viewing?.id && viewingContractIds.length > 0,
  });

  const contractTotalById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of contractPaymentsQuery.data ?? []) {
      if (!r.contract_id) continue;
      if (String(r.status ?? "") === "cancelado") continue;
      map.set(String(r.contract_id), (map.get(String(r.contract_id)) ?? 0) + Number(r.value ?? 0));
    }
    return map;
  }, [contractPaymentsQuery.data]);

  const activeContractsTotal = useMemo(() => {
    let sum = 0;
    for (const ct of clientContractsQuery.data ?? []) {
      const st = String(ct.status ?? "");
      if (st !== "ativo" && st !== "suspenso") continue;
      // For virtual C8 contracts (no payments in DB), fall back to ct.value
      sum += contractTotalById.get(String(ct.id)) ?? ct.value ?? 0;
    }
    return sum;
  }, [clientContractsQuery.data, contractTotalById]);

  const [contractForm, setContractForm] = useState({
    client_id: "",
    title: "",
    service_contracted: "",
    contract_type: "mensal" as "mensal" | "eventual",
    contract_date: "",
    duration_months: "12",
    first_payment_value: "",
    first_payment_installments: "1",
    first_payment_fees: "",
    first_payment_method: "pix",
    first_payment_due_date: "",
    recurring_due_date: "",
    recurring_value: "",
    recurring_payment_method: "pix",
    notes: "",
  });

  const [suspendedMonthOpen, setSuspendedMonthOpen] = useState(false);
  const suspendedMonthClients = useMemo(() => {
    const ids = new Set(contractMetrics.suspendedClientIdsMonth);
    const list = clients.filter((c) => ids.has(c.id));
    list.sort((a, b) => String(a.company || a.name).localeCompare(String(b.company || b.name)));
    return list;
  }, [clients, contractMetrics.suspendedClientIdsMonth]);

  const openNew = () => {
    setEditing(null);
    setFromLeadId(null);
    clearForm();
    setModalOpen(true);
  };

  const openFromLead = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setFromLeadId(leadId);
    setEditing(null);
    setForm({
      lead_id: leadId,
      name: lead.name,
      company: lead.company ?? undefined,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      decision_maker_name: lead.decision_maker_name ?? undefined,
      decision_maker_phone: lead.decision_maker_phone ? String(lead.decision_maker_phone) : undefined,
      niche: lead.nicho ?? undefined,
      origin: lead.source ?? undefined,
      revenue: lead.value ?? undefined,
      registration_type: DEFAULT_REGISTRATION_TYPE,
    });
    setModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setFromLeadId(null);
    const migrated = migrateResponsibleToDecisionMaker(c);
    setForm({
      name: c.name,
      company: c.company ?? "",
      document: c.document ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address_street: c.address_street ?? "",
      address_city: c.address_city ?? "",
      address_state: c.address_state ?? "",
      address_zip: c.address_zip ?? "",
      address_number: (c as any).address_number ?? "",
      address_complement: (c as any).address_complement ?? "",
      address_neighborhood: (c as any).address_neighborhood ?? "",
      niche: c.niche ?? "",
      origin: c.origin ?? "",
      registration_type: DEFAULT_REGISTRATION_TYPE,
      decision_maker_name: migrated.decision_maker_name ?? "",
      decision_maker_phone: migrated.decision_maker_phone ?? "",
      portfolio_team_id: c.portfolio_team_id ?? "",
    });
    setModalOpen(true);
  };

  const openLeadView = (leadId: string) => {
    setSelectedLeadId(leadId);
    setLeadViewOpen(true);
    setLeadEditOpen(false);
  };

  const openLeadEdit = (leadId: string) => {
    const l = leadsById.get(leadId);
    if (!l) return;
    setSelectedLeadId(leadId);
    setLeadDraft({
      name: l.name ?? "",
      company: l.company ?? "",
      email: l.email ?? "",
      phone: l.phone ?? "",
    });
    setLeadEditOpen(true);
    setLeadViewOpen(false);
  };

  const selectedLead = selectedLeadId ? leadsById.get(selectedLeadId) ?? null : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !form.name?.trim()) return;

    // CPF/CNPJ obrigatório
    const rawDoc = (form.document ?? "").replace(/\D/g, "");
    if (!rawDoc) {
      setSubmitError("CPF / CNPJ é obrigatório.");
      return;
    }

    // Validação de duplicata por CPF/CNPJ (ignora o próprio registro ao editar)
    const duplicate = clients.find(
      (c) =>
        c.id !== editing?.id &&
        c.document &&
        c.document.replace(/\D/g, "") === rawDoc
    );
    if (duplicate) {
      setSubmitError(
        `Já existe um cadastro com este CPF/CNPJ: "${duplicate.company || duplicate.name}". Verifique antes de continuar.`
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Remove campos UUID vazios para evitar erro de sintaxe 22P02
      const cleanedForm = { ...form };
      if (cleanedForm.portfolio_team_id === "") {
        delete cleanedForm.portfolio_team_id;
      }
      if (cleanedForm.lead_id === "") {
        delete cleanedForm.lead_id;
      }

      if (editing) {
        await update.mutateAsync({ ...cleanedForm, id: editing.id } as Partial<Client> & { id: string });
      } else {
        const created = await create.mutateAsync({ ...cleanedForm, name: cleanedForm.name! });
        // Auto-criar pasta no Drive — marca como pendente para suprimir o alerta imediatamente
        autoCreateFolder("client", { id: created.id, name: created.name, company: created.company ?? undefined, code: (created as any).code ?? null }, ["clients", organizationId]);
        setFolderPendingIds((prev) => new Set(prev).add(created.id));
        if (fromLeadId) {
          const l = leadsById.get(fromLeadId);
          await updateLead(fromLeadId, {
            metadata: {
              converted_to_client: true,
              converted_client_id: created.id,
              converted_at: new Date().toISOString(),
            },
          });
          setFromLeadId(null);
          setContractEditingId(null);
          setContractForm({
            client_id: created.id,
            title: (created.company || created.name || "Contrato") as string,
            service_contracted: (l?.product_service ?? "") as string,
            contract_type: "mensal",
            contract_date: format(new Date(), "yyyy-MM-dd"),
            duration_months: "12",
            first_payment_value: l?.value ? String(l.value) : "",
            first_payment_installments: "1",
            first_payment_fees: "",
            first_payment_method: "pix",
            first_payment_due_date: format(new Date(), "yyyy-MM-dd"),
            recurring_due_date: format(new Date(), "yyyy-MM-dd"),
            recurring_value: l?.value ? String(l.value) : "",
            recurring_payment_method: "pix",
            notes: "",
          });
          setContractModalOpen(true);
        }
      }
      clearForm();
      setModalOpen(false);
      setSubmitError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setSubmitError(msg);
      logger.error("Erro no handleSubmit", { 
        error: msg,
        context: 'client_form' 
      }, 'CRM');
    } finally {
      setSubmitting(false);
    }
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada. Faça login novamente.</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-destructive">Erro ao carregar clientes: {fetchError.message || "Erro desconhecido"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{clientId ? "Cliente" : "Clientes"}</h1>
          <p className="text-sm text-muted-foreground">
            {clientId ? "Detalhes do cliente" : "Cadastro manual ou conversão a partir do Kanban (etapa Efetivados)"}
          </p>
        </div>
        {clientId ? (
          <Button variant="outline" onClick={() => navigate(listHref)}>
            Voltar
          </Button>
        ) : (
          <Button onClick={openNew} disabled={!canCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo cliente
          </Button>
        )}
      </div>

      {!clientId && (
        <>
          <DriveFolderStatusAlert
            organizationId={organizationId}
            module="client"
            table="clients"
            queryKey="clients"
            records={clients.map((c) => ({ id: c.id, name: c.company || c.name, folder_id: c.folder_id, folder_url: c.folder_url, metadata: c.metadata, is_active: (c as any).is_active }))}
            pendingIds={folderPendingIds}
            canEdit={canEdit}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground">Total de clientes</p>
                    <p className="text-xl font-semibold">{totalClients}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground">Novos no mês</p>
                    <p className="text-xl font-semibold">{newClientsMonth}</p>
                    <p className="text-xs text-muted-foreground">
                      {totalClients > 0 ? ((newClientsMonth / totalClients) * 100).toFixed(1) : "0,0"}% do total
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground">Cancelamentos no mês</p>
                    <p className="text-xl font-semibold">{cancellationsMonth}</p>
                    <p className="text-xs text-muted-foreground">
                      Índice vs mês anterior: {cancellationsIndex === null ? "—" : `${cancellationsIndex.toFixed(2)}x`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="p-3 rounded-lg border border-border text-left hover:bg-muted/40 transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
                    onClick={() => setSuspendedMonthOpen(true)}
                    disabled={suspendedMonthClients.length === 0}
                  >
                    <p className="text-xs text-muted-foreground">Suspensos no mês</p>
                    <p className="text-xl font-semibold">{contractMetrics.suspendedMonth}</p>
                    {suspendedMonthClients.length > 0 ? (
                      <p className="text-xs text-muted-foreground">Ver lista</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem suspensos</p>
                    )}
                  </button>
                  <div className="p-3 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground">Reativados no mês</p>
                    <p className="text-xl font-semibold">{contractMetrics.reactivatedMonth}</p>
                    <p className="text-xs text-muted-foreground">
                      {contractMetrics.reactivatedVsSuspendedPercent === null
                        ? "Sem suspensos para comparar"
                        : `${contractMetrics.reactivatedVsSuspendedPercent.toFixed(1)}% vs suspensos`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alertas (inadimplentes)</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando...
                  </div>
                ) : delinquentAll.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum cliente inadimplente.</p>
                ) : (
                  <div className="space-y-2">
                    {delinquentTop.map((d) => (
                      <div key={d.clientId} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{d.count} pendências</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-destructive">R$ {d.total.toFixed(2).replace(".", ",")}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(clientHref(String(d.clientId)))}
                            disabled={!clients.some((c) => c.id === d.clientId)}
                          >
                            Ver
                          </Button>
                        </div>
                      </div>
                    ))}
                    {delinquentAll.length > 5 ? (
                      <Button variant="outline" size="sm" onClick={() => setDelinquentOpen(true)}>
                        Ver mais
                      </Button>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Dialog open={delinquentOpen} onOpenChange={setDelinquentOpen}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Inadimplentes</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {delinquentAll.map((d) => (
                  <div key={d.clientId} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.count} pendências</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-destructive">R$ {d.total.toFixed(2).replace(".", ",")}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDelinquentOpen(false);
                          navigate(clientHref(String(d.clientId)));
                        }}
                        disabled={!clients.some((c) => c.id === d.clientId)}
                      >
                        Ver
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDelinquentOpen(false)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={suspendedMonthOpen} onOpenChange={setSuspendedMonthOpen}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Clientes com contrato suspenso (mês)</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {suspendedMonthClients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.company || c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email || "—"}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSuspendedMonthOpen(false);
                        navigate(clientHref(String(c.id)));
                      }}
                    >
                      Ver
                    </Button>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSuspendedMonthOpen(false)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {!clientId && efetivadosParaConverter.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prospecções efetivadas (prontas para conversão)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ao finalizar, abre o cadastro do cliente e depois o cadastro do contrato
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-background overflow-hidden">
              <Table className="border-separate border-spacing-0">
                <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                  <TableRow className="bg-background hover:bg-background">
                    <TableHead className="bg-background border-b font-bold text-foreground">Empresa</TableHead>
                    <TableHead className="bg-background border-b font-bold text-foreground">Efetivação</TableHead>
                    <TableHead className="bg-background border-b font-bold text-foreground">Serviço</TableHead>
                    <TableHead className="text-right bg-background border-b font-bold text-foreground">Valor</TableHead>
                    <TableHead className="text-right bg-background border-b font-bold text-foreground">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-background">
                  {efetivadosParaConverter.map((l) => {
                    const efet = leadEfetivacaoDates.data?.get(String(l.id)) ?? null;
                    const efetLabel = efet ? format(parseISO(efet), "dd/MM/yyyy", { locale: ptBR }) : "—";
                    const serviceId = (l.product_service as string | null) ?? null;
                    const service = serviceId ? (SERVICE_LABELS[serviceId] ?? serviceId) : "—";
                    return (
                      <TableRow key={l.id} className="bg-background hover:bg-muted/30 transition-colors group">
                        <TableCell className="font-medium bg-background group-hover:bg-transparent">{l.company || l.name}</TableCell>
                        <TableCell className="bg-background group-hover:bg-transparent">{efetLabel}</TableCell>
                        <TableCell className="bg-background group-hover:bg-transparent">{service}</TableCell>
                        <TableCell className="text-right bg-background group-hover:bg-transparent">R$ {Number(l.value ?? 0).toFixed(2).replace(".", ",")}</TableCell>
                        <TableCell className="text-right bg-background group-hover:bg-transparent">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" onClick={() => openFromLead(l.id)}>
                              <UserCheck className="h-4 w-4 mr-1" />
                              Finalizar
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => openLeadView(l.id)} aria-label="Visualizar lead" className="bg-background hover:bg-muted">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => openLeadEdit(l.id)} aria-label="Editar lead" className="bg-background hover:bg-muted">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive bg-background hover:bg-muted"
                              onClick={async () => {
                                requirePin(
                                  "Excluir lead",
                                  "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
                                  async () => { await removeLead(l.id); }
                                );
                              }}
                              aria-label="Excluir lead"
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
            </div>
          </CardContent>
        </Card>
      )}

      {!clientId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Lista de clientes</CardTitle>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Button
                variant={showInactiveClients ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setShowInactiveClients((v) => !v)}
              >
                {showInactiveClients ? "Ver ativos" : `Inativos (${clients.filter((c) => (c as any).is_active === false).length})`}
              </Button>
              <Select value={filterPortfolioId} onValueChange={setFilterPortfolioId}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Filtrar por carteira" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as carteiras</SelectItem>
                  {portfolios.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : filteredClients.length === 0 ? (
              <p className="text-muted-foreground">Nenhum cliente encontrado para este filtro.</p>
            ) : (
              <div className="rounded-md border bg-background overflow-hidden">
                <Table className="border-separate border-spacing-0">
                  <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                  <TableRow className="bg-background hover:bg-background">
                    <TableHead className="bg-background border-b font-bold text-foreground w-24">Código</TableHead>
                    <TableHead className="bg-background border-b font-bold text-foreground">Nome</TableHead>
                    <TableHead className="bg-background border-b font-bold text-foreground">Carteira</TableHead>
                    <TableHead className="bg-background border-b font-bold text-foreground">Decisor</TableHead>
                    <TableHead className="bg-background border-b font-bold text-foreground">Tel. decisor</TableHead>
                    <TableHead className="text-right bg-background border-b font-bold text-foreground">Total contratos</TableHead>
                    {profile?.role === "owner" && <TableHead className="bg-background border-b w-10" />}
                  </TableRow>
                </TableHeader>
                  <TableBody className="bg-background">
                    {filteredClients.map((c) => {
                      const decisor = c.decision_maker_name || c.responsible_name || "—";
                      const decisorPhone = c.decision_maker_phone || c.responsible_phone || "—";
                      const total = contractsByClientTotals.get(c.id) ?? 0;
                      const hasSuspended = clientsWithSuspendedContracts.has(c.id);
                      const portfolio = portfolios.find(p => p.id === c.portfolio_team_id);
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer bg-background hover:bg-muted/30 transition-colors group"
                          onClick={() => navigate(clientHref(String(c.id)))}
                        >
                          <TableCell className="bg-background group-hover:bg-transparent">
                            <span className="font-mono text-xs text-muted-foreground">{formatEntityCode("CLI", c.code)}</span>
                          </TableCell>
                          <TableCell className="font-medium bg-background group-hover:bg-transparent">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{c.name}</span>
                              {hasSuspended ? <Badge variant="secondary">Suspenso</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent">
                            {portfolio ? (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {portfolio.name}
                              </Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent">{decisor}</TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent">{decisorPhone !== "—" ? formatPhoneBR(String(decisorPhone)) : "—"}</TableCell>
                          <TableCell className="text-right bg-background group-hover:bg-transparent">R$ {total.toFixed(2).replace(".", ",")}</TableCell>
                          {profile?.role === "owner" && (
                            <TableCell className="bg-background group-hover:bg-transparent" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setDeleteClientTarget(c)}
                                aria-label="Excluir cliente"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!deleteClientTarget} onOpenChange={(open) => { if (!open) setDeleteClientTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir cliente</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir permanentemente <strong>{deleteClientTarget?.name}</strong>?
              <br />
              Contratos e lançamentos pendentes serão removidos. Pagamentos realizados serão preservados no histórico.
              <br /><br />
              <span className="text-destructive font-medium">Esta ação não pode ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteClientTarget(null)} disabled={isDeletingClient}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={isDeletingClient}
              onClick={() => {
                if (!deleteClientTarget) return;
                requirePin(
                  "Excluir cliente permanentemente",
                  `Excluir "${deleteClientTarget.name}"? Esta ação não pode ser desfeita.`,
                  async () => {
                    setIsDeletingClient(true);
                    try {
                      await hardDelete.mutateAsync(deleteClientTarget.id);
                      toast.success(`Cliente "${deleteClientTarget.name}" excluído.`);
                      setDeleteClientTarget(null);
                    } finally {
                      setIsDeletingClient(false);
                    }
                  }
                );
              }}
            >
              {isDeletingClient ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={(open) => {setModalOpen(open); if (!open) setSubmitError(null);}}>
        <DialogContent className="max-w-[75vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar cliente" : fromLeadId ? "Finalizar Conversão" : "Novo cliente"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <Label>Nome de Exibição *</Label>
                <p className="text-[11px] text-muted-foreground mb-1">Nome fantasia ou apelido usado para identificar o cliente no sistema.</p>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Acme, João Silva"
                  required
                />
              </div>
              <div>
                <Label>Empresa (Razão Social / Nome Completo)</Label>
                <p className="text-[11px] text-muted-foreground mb-1">Razão social da empresa ou nome completo da pessoa física.</p>
                <Input
                  value={form.company ?? ""}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Ex: Acme Ltda. / João da Silva Santos"
                />
              </div>
              <div>
                <Label>CPF / CNPJ *</Label>
                <p className="text-[11px] text-muted-foreground mb-1">CPF para pessoa física, CNPJ para pessoa jurídica.</p>
                <Input
                  value={form.document ?? ""}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                  placeholder="CPF ou CNPJ"
                  required
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="E-mail"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Telefone"
                />
              </div>
              <div>
                <Label>Nicho</Label>
                <Select
                  value={form.niche ?? ""}
                  onValueChange={(value) => setForm({ ...form, niche: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o nicho" />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHO_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 w-[40%]">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={form.address_zip ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm({ ...form, address_zip: val });
                      if (val.replace(/\D/g, "").length === 8) {
                        handleCepSearch(val);
                      }
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  {searchingCep && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <Label>Rua / Av.</Label>
                <Input
                  value={form.address_street ?? ""}
                  onChange={(e) => setForm({ ...form, address_street: e.target.value })}
                  placeholder="Nome da rua ou avenida"
                />
              </div>
              <div className="w-[40%]">
                <Label>Número</Label>
                <Input
                  value={(form as any).address_number ?? ""}
                  onChange={(e) => setForm({ ...form, address_number: e.target.value } as any)}
                  placeholder="Nº"
                />
              </div>
              <div>
                <Label>Complemento</Label>
                <Input
                  value={(form as any).address_complement ?? ""}
                  onChange={(e) => setForm({ ...form, address_complement: e.target.value } as any)}
                  placeholder="Apto, sala, bloco..."
                />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input
                  value={(form as any).address_neighborhood ?? ""}
                  onChange={(e) => setForm({ ...form, address_neighborhood: e.target.value } as any)}
                  placeholder="Bairro"
                />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input
                  value={form.address_city ?? ""}
                  onChange={(e) => setForm({ ...form, address_city: e.target.value })}
                  placeholder="Cidade"
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Select
                  value={form.address_state ?? ""}
                  onValueChange={(v) => setForm({ ...form, address_state: v })}
                >
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Decisor</Label>
                <Input
                  value={(form.decision_maker_name as string | undefined) ?? ""}
                  onChange={(e) => setForm({ ...form, decision_maker_name: e.target.value })}
                  placeholder="Nome do decisor"
                />
              </div>
              <div>
                <Label>Tel. decisor</Label>
                <Input
                  value={(form.decision_maker_phone as string | undefined) ?? ""}
                  onChange={(e) => setForm({ ...form, decision_maker_phone: e.target.value })}
                  placeholder="Telefone do decisor"
                />
              </div>
              <div>
                <Label>Origem</Label>
                <Select
                  value={form.origin ?? ""}
                  onValueChange={(value) => setForm({ ...form, origin: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGEM_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {dynamicRevenue !== null ? (
                <div>
                  <Label>Faturamento médio (calculado)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={dynamicRevenue}
                    readOnly
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                  {isDynamicRevenueLoading && (
                    <p className="text-xs text-muted-foreground mt-1">Calculando...</p>
                  )}
                </div>
              ) : (
                <div>
                  <Label>Faturamento (R$)</Label>
                  <CurrencyInput
                    value={form.revenue ?? ""}
                    onChange={(v) => setForm({ ...form, revenue: v ? Number(v) : undefined })}
                  />
                </div>
              )}
              <div>
                <Label>Carteira Responsável</Label>
                <Select
                  value={form.portfolio_team_id || "none"}
                  onValueChange={(v) => {
                    const portfolioId = v === "none" ? null : v;
                    setForm({ 
                      ...form, 
                      portfolio_team_id: portfolioId,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma carteira" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma carteira</SelectItem>
                    {portfolios.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              {submitError && (
                <div className="col-span-full bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2 rounded-md">
                  {submitError}
                </div>
              )}
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || create.isPending || update.isPending}>
                {(submitting || create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {viewing ? (
        <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-foreground truncate">
              {viewing.company || viewing.name || "Cliente"}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {viewing.email || "—"} {viewing.phone ? `• ${formatPhoneBR(viewing.phone)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate(listHref)}>
              Voltar
            </Button>
            <Button type="button" size="sm" onClick={() => openEdit(viewing)} disabled={!canEdit}>
              Alterar
            </Button>
            <DriveFolderButton
              organizationId={organizationId!}
              module="client"
              record={{ id: viewing.id, name: viewing.name, company: viewing.company ?? undefined }}
              folderId={viewing.folder_id ?? (viewing.metadata as Record<string, unknown> | null)?.drive_folder_id as string | null}
              folderUrl={viewing.folder_url ?? (viewing.metadata as Record<string, unknown> | null)?.drive_folder_url as string | null}
              onFolderSaved={async (fId, fUrl) => {
                await update.mutateAsync({ id: viewing.id, folder_id: fId, folder_url: fUrl ?? null });
              }}
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={(viewing as any)?.is_active !== false}
                onCheckedChange={(checked) => {
                  if (!canDelete) {
                    toast.error("Sem permissão para alterar status do cliente");
                    return;
                  }
                  if (checked) {
                    activate.mutate(viewing!.id, {
                      onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao reativar"),
                    });
                  } else {
                    requirePin(
                      "Desativar cliente",
                      `Desativar "${viewing!.company || viewing!.name}"? Lançamentos pendentes serão cancelados.`,
                      async () => {
                        await deactivate.mutateAsync(viewing!.id);
                        toast.success("Cliente desativado");
                        navigate(listHref);
                      }
                    );
                  }
                }}
              />
              <span className="text-sm text-muted-foreground">
                {(viewing as any)?.is_active !== false ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>
        </div>
        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="dados">Dados cadastrais</TabsTrigger>
            <TabsTrigger value="contratos">Contratos</TabsTrigger>
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="integracoes">Integrações</TabsTrigger>
            <TabsTrigger value="kpis">Indicadores (KPIs)</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Dados do cliente</CardTitle>
              <div className="mt-1 text-sm font-medium truncate">{viewing.company || viewing.name}</div>
              <div className="text-sm text-muted-foreground truncate">
                {viewing.email || "—"} {viewing.phone ? `• ${formatPhoneBR(viewing.phone)}` : ""}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Nome</p>
                <p className="font-medium">{viewing.name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Empresa</p>
                <p className="font-medium">{viewing.company || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CPF/CNPJ</p>
                <p className="font-medium">{viewing.document ? formatCpfCnpj(viewing.document) : "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Código</p>
                <p className="font-mono font-medium">{formatEntityCode("CLI", viewing.code)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cidade</p>
                <p className="font-medium">{viewing.address_city || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Endereço</p>
                <p className="font-medium">{viewing.address_street || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">UF</p>
                <p className="font-medium">{viewing.address_state || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CEP</p>
                <p className="font-medium">{viewing.address_zip || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">E-mail</p>
                <p className="font-medium">{viewing.email || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-medium">{viewing.phone ? formatPhoneBR(viewing.phone) : "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Decisor</p>
                <p className="font-medium">{viewing.decision_maker_name || viewing.responsible_name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tel. decisor</p>
                <p className="font-medium">{viewing.decision_maker_phone ? formatPhoneBR(String(viewing.decision_maker_phone)) : (viewing.responsible_phone ? formatPhoneBR(String(viewing.responsible_phone)) : "—")}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nicho</p>
                <p className="font-medium">{viewing.niche || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Origem</p>
                <p className="font-medium">{viewing.origin || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipo de cadastro</p>
                <p className="font-medium">{viewing.registration_type || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data de cadastro</p>
                <p className="font-medium">{viewing.registration_date ? format(parseISO(viewing.registration_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Receita (cadastro)</p>
                <p className="font-medium">{viewing.revenue ? `R$ ${Number(viewing.revenue).toFixed(2).replace(".", ",")}` : "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prioridade</p>
                <p className="font-medium">{viewing.priority || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lead de origem</p>
                <p className="font-medium">{viewing.lead_id || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="contratos" className="space-y-6">
            {viewingContractId ? (
              (() => {
                const ct = (clientContractsQuery.data ?? []).find(c => c.id === viewingContractId);
                if (!ct) return null;
                return (
                  <ContractDetailPage
                    contract={ct}
                    organizationId={organizationId!}
                    clientId={viewing.id}
                    canEdit={canEdit}
                    canManageContracts={canManageContracts}
                    onBack={() => setViewingContractId(null)}
                    onEdit={() => {
                      setContractEditingId(ct.id);
                      setContractForm({
                        client_id: viewing.id,
                        title: ct.title,
                        service_contracted: ct.service_contracted ?? "",
                        contract_type: (ct.metadata as any)?.contract_type ?? "mensal",
                        contract_date: ct.contract_date ?? ct.start_date,
                        duration_months: ct.duration_months ? String(ct.duration_months) : "12",
                        first_payment_value: ct.first_payment_value ? String(ct.first_payment_value) : "",
                        first_payment_installments: ct.first_payment_installments ? String(ct.first_payment_installments) : "1",
                        first_payment_fees: ct.first_payment_fees ? String(ct.first_payment_fees) : "",
                        first_payment_method: ct.first_payment_method ?? "pix",
                        first_payment_due_date: ct.first_payment_due_date ?? "",
                        recurring_due_date: ct.recurring_due_date ?? "",
                        recurring_value: String(ct.value ?? 0),
                        recurring_payment_method: (ct.metadata as any)?.recurring_payment_method ?? "pix",
                        notes: (ct.metadata as any)?.notes ?? "",
                      });
                      setContractModalOpen(true);
                    }}
                    onSuspend={() => {
                      setContractTargetId(ct.id);
                      setContractTargetClientId(viewing.id);
                      setContractSuspendReason("");
                      setContractSuspendOpen(true);
                    }}
                    onReactivate={async () => {
                      requirePin(
                        "Reativar contrato",
                        "Digite seu PIN para confirmar a reativação.",
                        async () => { await reactivateContract.mutateAsync({ id: ct.id, client_id: viewing.id }); }
                      );
                    }}
                    onEnd={() => {
                      setContractTargetId(ct.id);
                      setContractTargetClientId(viewing.id);
                      setContractEndReason("");
                      setContractEndOpen(true);
                    }}
                  />
                );
              })()
            ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Contratos</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setContractEditingId(null);
                setContractForm({
                  client_id: viewing.id,
                  title: viewing.company || viewing.name || "Contrato",
                  service_contracted: "",
                  contract_type: "mensal",
                  contract_date: format(new Date(), "yyyy-MM-dd"),
                  duration_months: "12",
                  first_payment_value: "",
                  first_payment_installments: "1",
                  first_payment_fees: "",
                  first_payment_method: "pix",
                  first_payment_due_date: format(new Date(), "yyyy-MM-dd"),
                  recurring_due_date: format(new Date(), "yyyy-MM-dd"),
                  recurring_value: "",
                  recurring_payment_method: "pix",
                  notes: "",
                });
                setContractModalOpen(true);
              }}
              disabled={!canCreate}
            >
              <Plus className="h-4 w-4 mr-1" />
              Novo contrato
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total contratos ativos</span>
              <span className="font-semibold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(activeContractsTotal)}</span>
            </div>

            {clientContractsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : (clientContractsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contrato.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden bg-background">
                <Table className="border-separate border-spacing-0">
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                    <TableRow className="bg-background hover:bg-background">
                      <TableHead className="bg-background border-b">Serviço</TableHead>
                      <TableHead className="bg-background border-b">Contratação</TableHead>
                      <TableHead className="bg-background border-b">Status</TableHead>
                      <TableHead className="bg-background border-b text-center">Ref. Dashboard</TableHead>
                      <TableHead className="text-right bg-background border-b">Total</TableHead>
                      <TableHead className="text-right bg-background border-b">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="bg-background">
                    {(clientContractsQuery.data ?? []).map((ct) => (
                      <TableRow key={ct.id} className="bg-background hover:bg-muted/30 transition-colors group cursor-pointer" onClick={() => setViewingContractId(ct.id)}>
                        <TableCell className="font-medium bg-background group-hover:bg-transparent">{ct.service_contracted || ct.title}</TableCell>
                        <TableCell className="bg-background group-hover:bg-transparent">{ct.contract_date ? format(parseISO(ct.contract_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                        <TableCell className="bg-background group-hover:bg-transparent">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                            ct.status === "ativo" ? "bg-emerald-100 text-emerald-700" :
                            ct.status === "suspenso" ? "bg-yellow-100 text-yellow-700" :
                            "bg-slate-100 text-slate-600"
                          }`}>{ct.status ?? "—"}</span>
                        </TableCell>
                        <TableCell className="bg-background group-hover:bg-transparent text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-center gap-1">
                            <Switch
                              checked={!!ct.is_dashboard_reference}
                              onCheckedChange={(val) => setDashboardReference.mutate({ contractId: ct.id, clientId: viewing.id, value: val })}
                              disabled={setDashboardReference.isPending}
                            />
                            {ct.is_dashboard_reference && (
                              <span className="text-[9px] font-bold text-[#2D8CC7] uppercase">Ativo</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right bg-background group-hover:bg-transparent">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(contractTotalById.get(String(ct.id)) ?? ct.value ?? 0)}</TableCell>
                        <TableCell className="text-right bg-background group-hover:bg-transparent" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => setViewingContractId(ct.id)} aria-label="Ver detalhes" className="bg-background hover:bg-muted">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon" variant="ghost"
                              onClick={() => {
                                setContractEditingId(ct.id);
                                setContractForm({
                                  client_id: viewing.id,
                                  title: ct.title,
                                  service_contracted: ct.service_contracted ?? "",
                                  contract_type: (ct.metadata as any)?.contract_type ?? "mensal",
                                  contract_date: ct.contract_date ?? ct.start_date,
                                  duration_months: ct.duration_months ? String(ct.duration_months) : "12",
                                  first_payment_value: ct.first_payment_value ? String(ct.first_payment_value) : "",
                                  first_payment_installments: ct.first_payment_installments ? String(ct.first_payment_installments) : "1",
                                  first_payment_fees: ct.first_payment_fees ? String(ct.first_payment_fees) : "",
                                  first_payment_method: ct.first_payment_method ?? "pix",
                                  first_payment_due_date: ct.first_payment_due_date ?? "",
                                  recurring_due_date: ct.recurring_due_date ?? "",
                                  recurring_value: String(ct.value ?? 0),
                                  recurring_payment_method: (ct.metadata as any)?.recurring_payment_method ?? "pix",
                                  notes: (ct.metadata as any)?.notes ?? "",
                                });
                                setContractModalOpen(true);
                              }}
                              disabled={!canManageContracts} aria-label="Alterar" className="bg-background hover:bg-muted"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon" variant="ghost"
                              className="text-destructive bg-background hover:bg-muted"
                              onClick={async () => {
                                requirePin(
                                  "Excluir contrato",
                                  "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
                                  async () => { await deleteContract.mutateAsync({ id: ct.id, client_id: viewing.id }); }
                                );
                              }}
                              disabled={!canManageContracts || !canDelete || deleteContract.isPending}
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
            )}
          </TabsContent>

          <TabsContent value="documentos" className="space-y-6">
        <DocumentsCard
          title="Documentos"
          variant="folders"
          folderId={viewing.folder_id ?? (() => {
            const meta = (viewing.metadata ?? {}) as Record<string, unknown>;
            return String(meta.drive_folder_id ?? meta.drive_folder ?? "").trim() || null;
          })()}
          folderValue={viewing.folder_url ?? (() => {
            const meta = (viewing.metadata ?? {}) as Record<string, unknown>;
            const raw = (meta.drive_folder ?? meta.drive_folder_url ?? meta.folder ?? meta.pasta ?? "") as string;
            const v = String(raw ?? "").trim();
            return v || null;
          })()}
          canEdit={canEdit}
          allowCreateFolder
          autoFolderNames={DRIVE_AUTO_FOLDERS.client}
          createFolderParentValue={driveFolders.clients}
          createFolderName={(viewing.company || viewing.name || "Cliente").trim()}
          onSetFolderValue={
            canEdit
              ? async (next) => {
                  const folderId = next.match(/^[a-zA-Z0-9_-]{10,}$/) && !next.includes("http") ? next : (next.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? next);
                  const folderUrl = next.startsWith("http") ? next : `https://drive.google.com/drive/folders/${folderId}`;
                  await update.mutateAsync({ id: viewing.id, folder_id: folderId, folder_url: folderUrl });
                }
              : undefined
          }
        />
          </TabsContent>

          <TabsContent value="integracoes">
            <ClientIntegrationsTab organizationId={organizationId} clientId={viewing.id} />
          </TabsContent>

          <TabsContent value="kpis">
            <ClientKPIsTab organizationId={organizationId} clientId={viewing.id} clientName={viewing.company || viewing.name} />
          </TabsContent>

          <TabsContent value="performance">
            <ClientPerformanceTab organizationId={organizationId} clientId={viewing.id} />
          </TabsContent>

          <TabsContent value="pagamentos" className="space-y-4">
            {(() => {
              const clientPayments = (paymentsQuery.data ?? [])
                .filter(p => p.client_id === viewing.id)
                .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
              const paid = clientPayments.filter(p => p.status === "pago");
              const pending = clientPayments.filter(p => p.status !== "pago" && p.status !== "cancelado");
              const fmtCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
              const renderTable = (rows: typeof clientPayments, emptyMsg: string) => (
                rows.length === 0
                  ? <p className="text-sm text-muted-foreground py-4 text-center">{emptyMsg}</p>
                  : <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map(p => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.description}</TableCell>
                            <TableCell>{p.due_date ? format(parseISO(p.due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                            <TableCell className="text-right font-semibold">{fmtCurrency(p.value)}</TableCell>
                            <TableCell>
                              <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full ${
                                p.status === "pago" ? "bg-emerald-100 text-emerald-700" :
                                p.status === "pendente" ? "bg-yellow-100 text-yellow-700" :
                                "bg-red-100 text-red-700"
                              }`}>{p.status}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" aria-label="Visualizar" onClick={() => setViewPayment(p)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => {
                                  setEditPayment(p);
                                  setEditPaymentForm({ description: p.description, value: String(p.value), due_date: p.due_date ?? "", status: p.status ?? "pendente" });
                                }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {p.status !== "pago" && (
                                  <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => {
                                    setReceivePaymentOpen(p);
                                    setReceiveValue(String(p.value));
                                    setReceiveDate(p.due_date ? p.due_date.substring(0, 10) : format(new Date(), "yyyy-MM-dd"));
                                  }}>
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                    Receber
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
              );
              return (
                <>
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-yellow-400 inline-block" />Pendentes ({pending.length})</CardTitle></CardHeader>
                    <CardContent className="p-0">{renderTable(pending, "Nenhum pagamento pendente.")}</CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Realizados ({paid.length})</CardTitle></CardHeader>
                    <CardContent className="p-0">{renderTable(paid, "Nenhum pagamento realizado.")}</CardContent>
                  </Card>
                </>
              );
            })()}
          </TabsContent>
        </Tabs>
        </div>
      ) : null}

      <Dialog open={contractModalOpen} onOpenChange={(o) => { setContractModalOpen(o); if (!o) setContractEditingId(null); }}>
        <DialogContent className="max-w-[85vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{contractEditingId ? "Contrato" : "Novo contrato"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!organizationId) return;
              const isEventual = contractForm.contract_type === "eventual";
              const duration = isEventual ? 1 : Number(contractForm.duration_months || 0);
              const contractDate = contractForm.contract_date;
              if (!contractForm.client_id || !contractDate) {
                toast.error("Preencha o cliente e a data do contrato.");
                return;
              }
              if (!isEventual && duration <= 0) {
                toast.error("Informe a duração do contrato em meses.");
                return;
              }
              const end = addMonths(new Date(contractDate), duration);
              const endDisplay = format(end, "yyyy-MM-dd");
              const installments = Math.min(12, Math.max(1, Number(contractForm.first_payment_installments || 1)));
              const fees = installments > 1 ? Math.max(0, Number(contractForm.first_payment_fees || 0)) : 0;
              const extraMeta = {
                contract_type: contractForm.contract_type,
                recurring_payment_method: contractForm.recurring_payment_method,
                notes: contractForm.notes,
              };
              if (contractEditingId) {
                await updateContract.mutateAsync({
                  id: contractEditingId,
                  client_id: contractForm.client_id,
                  title: contractForm.title,
                  service_contracted: contractForm.service_contracted || null,
                  contract_date: contractDate,
                  start_date: contractDate,
                  end_date: endDisplay,
                  duration_months: duration,
                  contract_type: contractForm.contract_type as ContractRow["contract_type"],
                  periodicity: isEventual ? "pagamento_unico" : "mensal",
                  first_payment_value: contractForm.first_payment_value ? Number(contractForm.first_payment_value) : null,
                  first_payment_due_date: contractForm.first_payment_due_date || null,
                  first_payment_method: contractForm.first_payment_method || null,
                  first_payment_installments: installments,
                  first_payment_fees: fees,
                  first_payment_split: false,
                  first_payment_second_due_date: null,
                  recurring_due_date: isEventual ? null : (contractForm.recurring_due_date || null),
                  value: isEventual ? 0 : (contractForm.recurring_value ? Number(contractForm.recurring_value) : 0),
                  metadata: extraMeta,
                });
              } else {
                await createContract.mutateAsync({
                  client_id: contractForm.client_id,
                  title: contractForm.title,
                  service_contracted: contractForm.service_contracted || null,
                  contract_date: contractDate,
                  duration_months: duration,
                  first_payment_value: Number(contractForm.first_payment_value || 0),
                  first_payment_method: contractForm.first_payment_method,
                  first_payment_due_date: contractForm.first_payment_due_date || contractDate,
                  first_payment_installments: installments,
                  first_payment_fees: fees,
                  recurring_value: isEventual ? 0 : Number(contractForm.recurring_value || 0),
                  recurring_due_date: isEventual ? contractDate : (contractForm.recurring_due_date || contractDate),
                  metadata: extraMeta,
                });
              }
              setContractModalOpen(false);
            }}
          >
            {/* Linha 1: Serviço, Tipo, Data, Duração, Encerramento */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Produto/Serviço</Label>
                <Select
                  value={contractForm.service_contracted}
                  onValueChange={(v) => setContractForm({ ...contractForm, service_contracted: v })}
                  disabled={contractEditingId ? !canEdit : !canCreate}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Assessoria">Assessoria</SelectItem>
                    <SelectItem value="Consultoria">Consultoria</SelectItem>
                    <SelectItem value="Google Meu Negócio">Google Meu Negócio</SelectItem>
                    <SelectItem value="Site/Landing Page">Site/Landing Page</SelectItem>
                    <SelectItem value="Automação IA">Automação IA</SelectItem>
                    <SelectItem value="Captação Profissional">Captação Profissional</SelectItem>
                    <SelectItem value="Desenvolvimento e Programação">Desenvolvimento e Programação</SelectItem>
                    <SelectItem value="Identidade Visual">Identidade Visual</SelectItem>
                    <SelectItem value="Lançamento">Lançamento</SelectItem>
                    <SelectItem value="Parceria/Collab">Parceria/Collab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Contrato</Label>
                <Select
                  value={contractForm.contract_type}
                  onValueChange={(v: "mensal" | "eventual") => setContractForm({ ...contractForm, contract_type: v })}
                  disabled={contractEditingId ? !canEdit : !canCreate}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="eventual">Eventual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Título</Label>
                <Input
                  value={contractForm.title}
                  onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
                  disabled={contractEditingId ? !canEdit : !canCreate}
                  required
                />
              </div>
            </div>

            {/* Linha 2: Data contratação, Duração, Encerramento */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Data da contratação</Label>
                <Input
                  type="date"
                  value={contractForm.contract_date}
                  onChange={(e) => setContractForm({ ...contractForm, contract_date: e.target.value })}
                  disabled={contractEditingId ? !canEdit : !canCreate}
                  required
                />
              </div>
              {contractForm.contract_type === "mensal" && (
                <div>
                  <Label>Duração (meses)</Label>
                  <Input
                    type="number"
                    value={contractForm.duration_months}
                    onChange={(e) => setContractForm({ ...contractForm, duration_months: e.target.value })}
                    min={1}
                    disabled={contractEditingId ? !canEdit : !canCreate}
                    required
                  />
                </div>
              )}
              {contractForm.contract_type === "mensal" && (
                <div>
                  <Label>Encerramento (calculado)</Label>
                  <Input
                    value={
                      contractForm.contract_date && Number(contractForm.duration_months || 0) > 0
                        ? format(addMonths(new Date(contractForm.contract_date), Number(contractForm.duration_months)), "dd/MM/yyyy", { locale: ptBR })
                        : "—"
                    }
                    readOnly
                  />
                </div>
              )}
            </div>

            {/* Linha 3: 1º pagamento — 4 colunas */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Valor do 1º pagamento</Label>
                <CurrencyInput
                  value={contractForm.first_payment_value}
                  onChange={(v) => setContractForm({ ...contractForm, first_payment_value: v })}
                  disabled={contractEditingId ? !canEdit : !canCreate}
                />
              </div>
              <div>
                <Label>Parcelas do 1º pagamento</Label>
                <Select
                  value={contractForm.first_payment_installments}
                  onValueChange={(v) => setContractForm({ ...contractForm, first_payment_installments: v })}
                  disabled={contractEditingId ? !canEdit : !canCreate}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Forma do 1º pagamento</Label>
                <Select
                  value={contractForm.first_payment_method}
                  onValueChange={(v) => setContractForm({ ...contractForm, first_payment_method: v })}
                  disabled={contractEditingId ? !canEdit : !canCreate}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data do 1º pagamento</Label>
                <Input
                  type="date"
                  value={contractForm.first_payment_due_date}
                  onChange={(e) => setContractForm({ ...contractForm, first_payment_due_date: e.target.value })}
                  disabled={contractEditingId ? !canEdit : !canCreate}
                />
              </div>
            </div>

            {/* Linha 4: Taxas e Valor por parcela (só se parcelado) */}
            {Number(contractForm.first_payment_installments || 1) > 1 && (
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Taxas (acréscimo)</Label>
                  <CurrencyInput
                    value={contractForm.first_payment_fees}
                    onChange={(v) => setContractForm({ ...contractForm, first_payment_fees: v })}
                    disabled={contractEditingId ? !canEdit : !canCreate}
                  />
                </div>
                <div>
                  <Label>Valor por parcela (com taxas)</Label>
                  <Input readOnly value={(() => {
                    const inst = Math.min(12, Math.max(1, Number(contractForm.first_payment_installments || 1)));
                    const base = Number(contractForm.first_payment_value || 0);
                    const fees = Math.max(0, Number(contractForm.first_payment_fees || 0));
                    return `R$ ${((base + fees) / inst).toFixed(2).replace(".", ",")}`;
                  })()} />
                </div>
                <div /><div />
              </div>
            )}

            {/* Linha 5: Campos mensais (ocultos se eventual) */}
            {contractForm.contract_type === "mensal" && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Valor mensal (demais pagamentos)</Label>
                  <CurrencyInput
                    value={contractForm.recurring_value}
                    onChange={(v) => setContractForm({ ...contractForm, recurring_value: v })}
                    disabled={contractEditingId ? !canEdit : !canCreate}
                  />
                </div>
                <div>
                  <Label>Vencimento dos demais pagamentos</Label>
                  <Input
                    type="date"
                    value={contractForm.recurring_due_date}
                    onChange={(e) => setContractForm({ ...contractForm, recurring_due_date: e.target.value })}
                    disabled={contractEditingId ? !canEdit : !canCreate}
                  />
                </div>
                <div>
                  <Label>Forma de pagamento mensal</Label>
                  <Select
                    value={contractForm.recurring_payment_method}
                    onValueChange={(v) => setContractForm({ ...contractForm, recurring_payment_method: v })}
                    disabled={contractEditingId ? !canEdit : !canCreate}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Observação — linha inteira */}
            <div>
              <Label>Observação</Label>
              <Textarea
                value={contractForm.notes}
                onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
                placeholder="Observações sobre o contrato..."
                disabled={contractEditingId ? !canEdit : !canCreate}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContractModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  contractEditingId
                    ? !canEdit || updateContract.isPending
                    : !canCreate || createContract.isPending
                }
              >
                {(createContract.isPending || updateContract.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={contractEndOpen} onOpenChange={(o) => setContractEndOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Encerrar contrato</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!contractTargetId || !contractTargetClientId) return;
              const reason = contractEndReason.trim();
              if (!reason) return;
              requirePin(
                "Encerrar contrato",
                "Esta ação encerrará o contrato. Digite seu PIN para confirmar.",
                async () => {
                  await endContract.mutateAsync({ id: contractTargetId!, client_id: contractTargetClientId!, reason });
                  setContractEndOpen(false);
                  setContractTargetId(null);
                  setContractTargetClientId(null);
                  setContractEndReason("");
                }
              );
            }}
          >
            <div>
              <Label>Motivo do encerramento</Label>
              <Textarea value={contractEndReason} onChange={(e) => setContractEndReason(e.target.value)} placeholder="Descreva o motivo..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContractEndOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!canEdit || endContract.isPending || !contractEndReason.trim()}>
                {endContract.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Encerrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={contractSuspendOpen} onOpenChange={(o) => setContractSuspendOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Suspender contrato</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!contractTargetId || !contractTargetClientId) return;
              const reason = contractSuspendReason.trim();
              if (!reason) return;
              requirePin(
                "Suspender contrato",
                "Esta ação suspenderá o contrato. Digite seu PIN para confirmar.",
                async () => {
                  await suspendContract.mutateAsync({ id: contractTargetId!, client_id: contractTargetClientId!, reason });
                  setContractSuspendOpen(false);
                  setContractTargetId(null);
                  setContractTargetClientId(null);
                  setContractSuspendReason("");
                }
              );
            }}
          >
            <div>
              <Label>Motivo da suspensão *</Label>
              <Textarea
                value={contractSuspendReason}
                onChange={(e) => setContractSuspendReason(e.target.value)}
                placeholder="Ex: Falta de pagamento"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContractSuspendOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!canEdit || suspendContract.isPending || !contractSuspendReason.trim()}>
                {suspendContract.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Suspender
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={leadViewOpen} onOpenChange={(o) => { setLeadViewOpen(o); if (!o) setSelectedLeadId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lead</DialogTitle>
          </DialogHeader>
          {selectedLead ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Empresa</p>
                <p className="font-medium">{selectedLead.company || selectedLead.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">E-mail</p>
                  <p className="font-medium">{selectedLead.email || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telefone</p>
                  <p className="font-medium">{selectedLead.phone ? formatPhoneBR(selectedLead.phone) : "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Nicho</p>
                  <p className="font-medium">{selectedLead.nicho || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Origem</p>
                  <p className="font-medium">{selectedLead.source || "—"}</p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setLeadViewOpen(false)}>Fechar</Button>
                <Button type="button" onClick={() => { const id = selectedLead.id; setLeadViewOpen(false); openLeadEdit(id); }}>
                  Editar
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={leadEditOpen} onOpenChange={(o) => { setLeadEditOpen(o); if (!o) setSelectedLeadId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar lead</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedLeadId) return;
              await updateLead(selectedLeadId, {
                name: leadDraft.name.trim(),
                company: leadDraft.company.trim() || null,
                email: leadDraft.email.trim() || null,
                phone: leadDraft.phone.trim() || null,
              });
              setLeadEditOpen(false);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Empresa</Label>
                <Input value={leadDraft.company} onChange={(e) => setLeadDraft({ ...leadDraft, company: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Nome</Label>
                <Input value={leadDraft.name} onChange={(e) => setLeadDraft({ ...leadDraft, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>E-mail</Label>
                <Input type="email" value={leadDraft.email} onChange={(e) => setLeadDraft({ ...leadDraft, email: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Telefone</Label>
                <Input value={leadDraft.phone} onChange={(e) => setLeadDraft({ ...leadDraft, phone: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLeadEditOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Visualizar pagamento ── */}
      <Dialog open={!!viewPayment} onOpenChange={(o) => { if (!o) setViewPayment(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Detalhes do Pagamento</DialogTitle></DialogHeader>
          {viewPayment && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Descrição</span><span className="font-semibold">{viewPayment.description}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vencimento</span><span className="font-semibold">{viewPayment.due_date ? format(parseISO(viewPayment.due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><span className="font-bold text-emerald-600">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(viewPayment.value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-semibold capitalize">{viewPayment.status}</span></div>
              {viewPayment.paid_at && <div className="flex justify-between"><span className="text-muted-foreground">Recebido em</span><span className="font-semibold">{format(parseISO(viewPayment.paid_at), "dd/MM/yyyy", { locale: ptBR })}</span></div>}
              {viewPayment.payment_method && <div className="flex justify-between"><span className="text-muted-foreground">Forma</span><span className="font-semibold capitalize">{viewPayment.payment_method}</span></div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewPayment(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar pagamento ── */}
      <Dialog open={!!editPayment} onOpenChange={(o) => { if (!o) setEditPayment(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input value={editPaymentForm.description} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <CurrencyInput value={editPaymentForm.value} onChange={(v) => setEditPaymentForm({ ...editPaymentForm, value: v })} />
            </div>
            <div className="space-y-1">
              <Label>Vencimento</Label>
              <Input type="date" value={editPaymentForm.due_date} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, due_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={editPaymentForm.status} onValueChange={(v) => setEditPaymentForm({ ...editPaymentForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!editPayment) return;
              await paymentsQuery.updatePayment.mutateAsync({
                id: editPayment.id,
                description: editPaymentForm.description,
                value: parseFloat(editPaymentForm.value),
                due_date: editPaymentForm.due_date,
                status: editPaymentForm.status as any,
              });
              toast.success("Pagamento atualizado!");
              setEditPayment(null);
            }} disabled={paymentsQuery.updatePayment?.isPending}>
              {paymentsQuery.updatePayment?.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Receber pagamento (parcial ou total) ── */}
      <Dialog open={!!receivePaymentOpen} onOpenChange={(o) => { if (!o) setReceivePaymentOpen(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            <DialogDescription>
              Valor total: <strong>{receivePaymentOpen ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(receivePaymentOpen.value) : ""}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Valor recebido (R$)</Label>
              <CurrencyInput
                value={receiveValue}
                onChange={(v) => setReceiveValue(v)}
              />
              {receivePaymentOpen && parseFloat(receiveValue) > 0 && parseFloat(receiveValue) < receivePaymentOpen.value && (
                <p className="text-xs text-amber-600 mt-1">
                  Pagamento parcial — saldo de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(receivePaymentOpen.value - parseFloat(receiveValue))} ficará em aberto.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Data do recebimento</Label>
              <Input type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceivePaymentOpen(null)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={async () => {
              if (!receivePaymentOpen) return;
              const received = parseFloat(receiveValue);
              if (isNaN(received) || received <= 0) { toast.error("Informe um valor válido."); return; }
              setIsReceiving(true);
              try {
                const isPartial = received < receivePaymentOpen.value;
                await paymentsQuery.updatePayment.mutateAsync({
                  id: receivePaymentOpen.id,
                  value: received,
                  status: "pago" as any,
                  due_date: receiveDate,
                  paid_at: new Date(receiveDate + "T12:00:00").toISOString(),
                });
                if (isPartial) {
                  await paymentsQuery.create.mutateAsync({
                    client_id: receivePaymentOpen.client_id,
                    contract_id: receivePaymentOpen.contract_id ?? undefined,
                    description: `${receivePaymentOpen.description} (saldo restante)`,
                    value: receivePaymentOpen.value - received,
                    due_date: receiveDate,
                    status: "pendente",
                  });
                  toast.success(`Recebimento parcial registrado. Saldo em aberto criado.`);
                } else {
                  toast.success("Pagamento recebido!");
                }
                setReceivePaymentOpen(null);
              } catch {
                toast.error("Erro ao registrar recebimento.");
              } finally {
                setIsReceiving(false);
              }
            }} disabled={isReceiving}>
              {isReceiving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PinAuthDialog {...pinProps} />
    </div>
  );
}
