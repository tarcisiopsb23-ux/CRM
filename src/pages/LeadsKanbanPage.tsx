import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { KanbanBoard, LeadDetailsModal, LeadsListView } from "@/components/kanban";
import { NovoLeadDialog } from "@/components/kanban/NovoLeadDialog";
import { LeadStatusBadge } from "@/components/kanban/LeadStatusBadge";
import { useLeadsKanban, type CreateLeadInput, type CreateLeadRow } from "@/hooks/useLeadsKanban";
import { useListasManager } from "@/hooks/useListasManager";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useTabCounts } from "@/hooks/useTabCounts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import { Switch } from "@/components/ui/switch";
import { Check, ChevronDown, ChevronUp, ExternalLink, Flame, CheckCircle2, Plus, Loader2, Upload, LayoutList, Kanban as KanbanIcon, Search, ListChecks } from "lucide-react";
import { fetchAddressByCep } from "@/lib/viacep";
import { parseCsvText } from "@/lib/parseCsv";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { formatPhoneBR } from "@/lib/formatters";
import { NICHO_OPTIONS, ORIGEM_OPTIONS } from "@/constants/crmOptions";
import type { Lead, EtapaKanban, LeadWithResponsavel } from "@/types/database";
import { PRODUCT_SERVICE_OPTIONS } from "@/types/database";
import { ListasPage } from "@/pages/ListasPage";
import { LeadsPendingPage } from "@/pages/LeadsPendingPage";
import { ClosersPerformancePage } from "@/pages/ClosersPerformancePage";
import { FormLeadsTab } from "@/components/kanban/FormLeadsTab";
import { useProposals } from "@/hooks/useProposals";
import type { Proposal } from "@/types/proposals";

export function LeadsKanbanPage() {
  const organizationId = useOrganization();
  const { pinProps, requirePin } = usePinConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const { leads, loading, error, updateEtapaKanban, createLead, updateLead, removeLead, importLeadsMapped, refetch } =
    useLeadsKanban(organizationId);
  const { data: profiles = [] } = useProfiles(organizationId);
  const { proposals } = useProposals(organizationId);
  const { listas, fetchListas, createLista, getLista } = useListasManager(organizationId);

  const tabCounts = useTabCounts({ organizationId, leads, listas });

  // Aba ativa controlada via query param para permitir navegação direta
  const activeTab = searchParams.get("tab") ?? "leads";
  const setTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Mantém selectedLead sincronizado com o array de leads após qualquer refetch,
  // para que a modal de detalhes reflita alterações sem precisar fechar/reabrir.
  useEffect(() => {
    if (selectedLead) {
      const fresh = leads.find((l) => l.id === selectedLead.id);
      // Só atualiza se o objeto for diferente (evita re-renders desnecessários)
      if (fresh && fresh !== selectedLead) setSelectedLead(fresh);
    }
    // Só reage quando leads muda — não incluir selectedLead para evitar loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads]);
  const [novoLeadOpen, setNovoLeadOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvStep, setCsvStep] = useState<"lista" | "mapping">("lista");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{ created: number; errors: string[] } | null>(null);
  // lista step state
  const [csvListaMode, setCsvListaMode] = useState<"new" | "existing" | "none">("none");
  const [csvListaId, setCsvListaId] = useState<string | null>(null);
  const [csvListaCreating, setCsvListaCreating] = useState(false);
  const [csvListaForm, setCsvListaForm] = useState({
    nome: "",
    cidade: "",
    estado: "",
    nicho: "",
  });
  const [editing, setEditing] = useState<Lead | null>(null);
  const [preQualLead, setPreQualLead] = useState<Lead | null>(null);
  const [searchingCep, setSearchingCep] = useState(false);
  const [preQualForm, setPreQualForm] = useState({
    resultado: "apto" as "apto" | "inapto",
    notas: "",
  });
  const [preQualLeadForm, setPreQualLeadForm] = useState({
    company: "",
    name: "",
    email: "",
    phone: "",
    nicho: "",
    source: "",
    cidade: "",
    estado: "",
    value: "",
    prioridade: "media" as "baixa" | "media" | "alta" | "urgente",
    assigned_to: "" as string | undefined,
    notes: "",
    first_contact_date: "",
    last_contact_date: "",
    product_service: "" as
      | ""
      | "assessoria"
      | "consultoria"
      | "gmn"
      | "site"
      | "agente_ia"
      | "outros",
    outros_servicos: [] as string[],
    cpf_cnpj: "",
    contact_origin: "" as
      | ""
      | "indicacao"
      | "prospeccao"
      | "campanha_google"
      | "campanha_meta"
      | "organico"
      | "outras",
    decision_maker: false,
    decision_maker_name: "",
    decision_maker_phone: "",
    gbp_url: "",
    instagram_url: "",
    website_url: "",
    gmn_status: "" as
      | ""
      | "nao_possui"
      | "desatualizado_desativado"
      | "desatualizado"
      | "incompleto"
      | "completo",
    google_ads_level: "" as "" | "sem_anuncios" | "poucos_anuncios" | "muitos_anuncios" | "conta_nao_encontrada",
    meta_ads_level: "" as "" | "sem_anuncios" | "poucos_anuncios" | "muitos_anuncios" | "conta_nao_encontrada",
    social_media_status: "" as
      | ""
      | "sem_frequencia"
      | "parado_inexistente"
      | "frequente_sem_estrategia"
      | "frequente_estruturado",
    lost_reason: "" as
      | ""
      | "capacidade_produtiva"
      | "orcamento"
      | "desqualificado"
      | "barrado_pelo_sa"
      | "sem_contato"
      | "limite_da_franquia"
      | "concorrencia"
      | "perda_de_contato"
      | "cadencia_excedida"
      | "outros",
    cadence: "",
    temperature: 0,
  });

  const handleCepSearch = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      setSearchingCep(true);
      try {
        const address = await fetchAddressByCep(cleanCep);
        if (address) {
          setPreQualLeadForm((f) => ({
            ...f,
            cidade: address.localidade,
            estado: address.uf,
          }));
          toast.success("Cidade preenchida pelo CEP!");
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

  const [editForm, setEditForm] = useState({
    company: "",
    name: "",
    email: "",
    phone: "",
    nicho: "",
    source: "",
    cidade: "",
    estado: "",
    value: "",
    prioridade: "media" as "baixa" | "media" | "alta" | "urgente",
    assigned_to: "" as string | undefined,
    notes: "",
    first_contact_date: "",
    last_contact_date: "",
    cpf_cnpj: "",
    contact_origin: "" as "" | "indicacao" | "prospeccao" | "campanha_google" | "campanha_meta" | "organico" | "outras",
    decision_maker: false,
    decision_maker_name: "",
    decision_maker_phone: "",
    gbp_url: "",
    instagram_url: "",
    website_url: "",
    gmn_status: "" as "" | "nao_possui" | "desatualizado_desativado" | "desatualizado" | "incompleto" | "completo",
    google_ads_level: "" as "" | "conta_nao_encontrada" | "sem_anuncios" | "poucos_anuncios" | "muitos_anuncios",
    meta_ads_level: "" as "" | "conta_nao_encontrada" | "sem_anuncios" | "poucos_anuncios" | "muitos_anuncios",
    social_media_status: "" as "" | "sem_frequencia" | "parado_inexistente" | "frequente_sem_estrategia" | "frequente_estruturado",
    product_service: "" as "" | "assessoria" | "consultoria" | "gmn" | "site" | "agente_ia" | "outros",
    lost_reason: "" as "" | "capacidade_produtiva" | "orcamento" | "desqualificado" | "barrado_pelo_sa" | "sem_contato" | "limite_da_franquia" | "concorrencia" | "perda_de_contato" | "cadencia_excedida" | "outros",
    cadence: "",
    temperature: 0,
  });

  const handleDetalhes = (lead: Lead) => {
    setSelectedLead(lead);
    setModalOpen(true);
  };

  const handleEtapaChange = async (leadId: string, etapa: EtapaKanban) => {
    try {
      await updateEtapaKanban(leadId, etapa);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível atualizar a etapa.";
      toast.error(msg);
    }
  };

  const handleCreateLead = async (form: CreateLeadInput) => {
    await createLead(form);
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Arquivo deve ser .csv");
      e.target.value = "";
      return;
    }

    setCsvImportResult(null);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (!parsed.headers.length) {
        toast.error("CSV vazio ou inválido.");
        e.target.value = "";
        return;
      }
      setCsvHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setCsvMapping(Object.fromEntries(parsed.headers.map((h) => [h, "ignore"])));
      // Reset lista step
      setCsvStep("lista");
      setCsvListaMode("none");
      setCsvListaId(null);
      setCsvListaForm({ nome: "", cidade: "", estado: "", nicho: "" });
      // Load existing listas for the selector
      fetchListas({ status: "ativa" });
      setCsvOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ler CSV.");
    } finally {
      e.target.value = "";
    }
  };

  const getPreQualStatus = (lead: Lead) => {
    const meta = (lead.metadata ?? {}) as Record<string, unknown>;
    const pre = (meta.pre_qualificacao ?? null) as Record<string, unknown> | null;
    const concluida = pre?.concluida === true;
    const resultado = (pre?.resultado as "apto" | "inapto" | undefined) ?? undefined;
    const notas = (pre?.notas as string | undefined) ?? "";
    return { concluida, resultado, notas };
  };

  const activeProposalsPerEtapa = useMemo(() => {
    const activeProposals = proposals.filter(p => p.status === "enviada" || p.status === "visualizada");
    const counts: Record<string, number> = {};
    for (const lead of leads) {
      const etapa = lead.etapa_kanban ?? "leads_recebidos";
      const countForLead = activeProposals.filter(p => p.lead_id === lead.id).length;
      counts[etapa] = (counts[etapa] ?? 0) + countForLead;
    }
    return counts;
  }, [leads, proposals]);

  const leadsRecebidos = useMemo(() => {
    return leads.filter((l) => (l.etapa_kanban ?? "leads_recebidos") === "leads_recebidos");
  }, [leads]);

  const getLifecycleDays = (createdAt: string) => {
    const created = parseISO(createdAt);
    const today = new Date();
    const days = differenceInCalendarDays(today, created) + 1;
    return Math.max(1, days);
  };

  const getPriorityColor = (p?: string | null) => {
    switch (p) {
      case "urgente": return "bg-red-500 hover:bg-red-600";
      case "alta": return "bg-orange-500 hover:bg-orange-600";
      case "media": return "bg-yellow-500 hover:bg-yellow-600";
      case "baixa": return "bg-green-500 hover:bg-green-600";
      default: return "bg-slate-500 hover:bg-slate-600";
    }
  };

  const openPreQual = (lead: Lead) => {
    const st = getPreQualStatus(lead);
    const meta = (lead.metadata ?? {}) as Record<string, unknown>;
    const cidade = typeof meta.cidade === "string" ? meta.cidade : "";
    const listaEstado = lead.lista_id ? (listas.find((l) => l.id === lead.lista_id)?.estado ?? "") : "";
    const estado = typeof meta.estado === "string" && meta.estado ? meta.estado : listaEstado;
    setPreQualLead(lead);
    setPreQualForm({
      resultado: st.resultado ?? "apto",
      notas: st.notas,
    });
    setPreQualLeadForm({
      company: lead.company ?? "",
      name: lead.name ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      nicho: lead.nicho ?? "",
      source: lead.source ?? "",
      cidade,
      estado,
      value: typeof lead.value === "number" ? String(lead.value) : "",
      prioridade: ((lead.prioridade as "baixa" | "media" | "alta" | "urgente") ?? "media"),
      assigned_to: lead.assigned_to ?? "",
      notes: lead.notes ?? "",
      first_contact_date: lead.first_contact_date ?? "",
      last_contact_date: lead.last_contact_date ?? "",
      product_service: (lead.product_service ?? "") as "" | "assessoria" | "consultoria" | "gmn" | "site" | "agente_ia" | "outros",
      outros_servicos: Array.isArray((lead.metadata as Record<string, unknown>)?.outros_servicos)
        ? (lead.metadata as Record<string, unknown>).outros_servicos as string[]
        : [],
      cpf_cnpj: lead.cpf_cnpj !== null && lead.cpf_cnpj !== undefined ? String(lead.cpf_cnpj) : "",
      contact_origin: lead.contact_origin ?? "",
      decision_maker: !!(typeof lead.decision_maker === "boolean" ? lead.decision_maker : lead.decision_maker === "true"),
      decision_maker_name: lead.decision_maker_name ?? "",
      decision_maker_phone:
        lead.decision_maker_phone !== null && lead.decision_maker_phone !== undefined
          ? String(lead.decision_maker_phone)
          : "",
      gbp_url: lead.gbp_url ?? "",
      instagram_url: lead.instagram_url ?? "",
      website_url: lead.website_url ?? "",
      gmn_status: lead.gmn_status ?? "",
      google_ads_level: lead.google_ads_level ?? "",
      meta_ads_level: lead.meta_ads_level ?? "",
      social_media_status: lead.social_media_status ?? "",
      lost_reason: lead.lost_reason ?? "",
      cadence: lead.cadence !== null && lead.cadence !== undefined ? String(lead.cadence) : "",
      temperature: typeof lead.temperature === "number" ? lead.temperature : 0,
    });
  };

  // Salva os dados do formulário sem alterar o status de qualificação.
  // Chamado tanto pelo botão "Salvar" quanto automaticamente ao fechar o dialog.
  const handleSavePreQual = async (
    leadId: string,
    form: typeof preQualLeadForm,
    qualForm: typeof preQualForm,
    concluida: boolean
  ) => {
    await updateLead(leadId, {
      company: form.company,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      nicho: form.nicho || null,
      source: form.source || null,
      value: form.value ? Number(form.value) : null,
      prioridade: form.prioridade,
      assigned_to: form.assigned_to || null,
      notes: form.notes || null,
      first_contact_date: form.first_contact_date || null,
      last_contact_date: form.last_contact_date || null,
      product_service: form.product_service || null,
      cpf_cnpj: form.cpf_cnpj ? Number(form.cpf_cnpj) : null,
      contact_origin: form.contact_origin || null,
      decision_maker: form.decision_maker,
      decision_maker_name: form.decision_maker_name || null,
      decision_maker_phone: form.decision_maker_phone ? Number(form.decision_maker_phone) : null,
      gbp_url: form.gbp_url || null,
      instagram_url: form.instagram_url || null,
      website_url: form.website_url || null,
      gmn_status: form.gmn_status || null,
      google_ads_level: form.google_ads_level || null,
      meta_ads_level: form.meta_ads_level || null,
      social_media_status: form.social_media_status || null,
      lost_reason: form.lost_reason || null,
      cadence: form.cadence || null,
      temperature: form.temperature,
      metadata: {
        cidade: form.cidade || null,
        estado: form.estado || null,
        outros_servicos: form.outros_servicos.length > 0 ? form.outros_servicos : null,
        pre_qualificacao: {
          concluida,
          resultado: concluida ? qualForm.resultado : undefined,
          notas: qualForm.notas,
          concluida_em: concluida ? new Date().toISOString() : undefined,
        },
      },
    } as Partial<Lead>);
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Carregando leads...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-destructive">Erro ao carregar: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">CRM</h1>
        <p className="text-sm text-muted-foreground">
          Leads (Lista/Kanban) e Pré-qualificação obrigatória antes de qualificar.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <TabsList>
          <TabsTrigger value="leads" className="flex items-center gap-1.5">
            Leads
            {tabCounts.leads > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold min-w-[18px] h-[18px] px-1 leading-none">
                {tabCounts.leads}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="prequal" className="flex items-center gap-1.5">
            Pré-qualificação
            {tabCounts.preQual > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-orange-500/15 text-orange-500 text-[10px] font-semibold min-w-[18px] h-[18px] px-1 leading-none">
                {tabCounts.preQual}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="formulario" className="flex items-center gap-1.5">
            Recebidos do Formulário
            {tabCounts.formulario > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-blue-500/15 text-blue-500 text-[10px] font-semibold min-w-[18px] h-[18px] px-1 leading-none">
                {tabCounts.formulario}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="listas" className="flex items-center gap-1.5">
            Listas
            {tabCounts.listas > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold min-w-[18px] h-[18px] px-1 leading-none">
                {tabCounts.listas}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pendentes" className="flex items-center gap-1.5">
            Leads Pendentes
            {tabCounts.pendentes > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-yellow-500/15 text-yellow-600 text-[10px] font-semibold min-w-[18px] h-[18px] px-1 leading-none">
                {tabCounts.pendentes}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="performance">Performance Closers</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-muted p-1 rounded-md">
                <Button
                  variant={viewMode === "kanban" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setViewMode("kanban")}
                  title="Visualização Kanban"
                >
                  <KanbanIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setViewMode("list")}
                  title="Visualização em Lista"
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <label className="cursor-pointer flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Importar CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleImportCsv}
                  />
                </label>
              </Button>
              <Button onClick={() => setNovoLeadOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Lead
              </Button>
            </div>
          </div>

          {viewMode === "kanban" ? (
            <KanbanBoard
              leads={leads}
              onDetalhes={handleDetalhes}
              onEtapaChange={handleEtapaChange}
              activeProposalsPerEtapa={activeProposalsPerEtapa}
            />
          ) : (
            <LeadsListView
              leads={leads}
              onDetalhes={handleDetalhes}
              onEdit={(l) => {
                setEditing(l);
                const meta = (l.metadata ?? {}) as Record<string, unknown>;
                setEditForm({
                  company: l.company ?? "",
                  name: l.name ?? "",
                  email: l.email ?? "",
                  phone: l.phone ?? "",
                  nicho: l.nicho ?? "",
                  source: l.source ?? "",
                  cidade: (meta.cidade as string) ?? "",
                  estado: (meta.estado as string) ?? "",
                  value: String(l.value ?? ""),
                  prioridade: ((l.prioridade as "baixa" | "media" | "alta" | "urgente") ?? "media"),
                  assigned_to: l.assigned_to ?? "",
                  notes: l.notes ?? "",
                  first_contact_date: l.first_contact_date ?? "",
                  last_contact_date: l.last_contact_date ?? "",
                  cpf_cnpj: l.cpf_cnpj != null ? String(l.cpf_cnpj) : "",
                  contact_origin: (l.contact_origin ?? "") as typeof editForm.contact_origin,
                  decision_maker: !!(typeof l.decision_maker === "boolean" ? l.decision_maker : l.decision_maker === "true"),
                  decision_maker_name: l.decision_maker_name ?? "",
                  decision_maker_phone: l.decision_maker_phone != null ? String(l.decision_maker_phone) : "",
                  gbp_url: l.gbp_url ?? "",
                  instagram_url: l.instagram_url ?? "",
                  website_url: l.website_url ?? "",
                  gmn_status: (l.gmn_status ?? "") as typeof editForm.gmn_status,
                  google_ads_level: (l.google_ads_level ?? "") as typeof editForm.google_ads_level,
                  meta_ads_level: (l.meta_ads_level ?? "") as typeof editForm.meta_ads_level,
                  social_media_status: (l.social_media_status ?? "") as typeof editForm.social_media_status,
                  product_service: (l.product_service ?? "") as typeof editForm.product_service,
                  lost_reason: (l.lost_reason ?? "") as typeof editForm.lost_reason,
                  cadence: l.cadence != null ? String(l.cadence) : "",
                  temperature: typeof l.temperature === "number" ? l.temperature : 0,
                });
              }}
              onDelete={(id) => {
                requirePin(
                  "Excluir lead",
                  "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
                  async () => { removeLead(id); }
                );
              }}
              onEtapaChange={handleEtapaChange}
            />
          )}
        </TabsContent>

        <TabsContent value="prequal" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Pré-qualificação (Leads Recebidos)</h2>
              <p className="text-sm text-muted-foreground">
                Conclua a pré-qualificação para liberar a etapa Qualificados.
              </p>
            </div>
            <Badge variant="secondary">
              {leadsRecebidos.filter((l) => getPreQualStatus(l).concluida).length}/{leadsRecebidos.length} concluídos
            </Badge>
          </div>

          <div className="rounded-md border bg-background overflow-hidden">
            <div className="table-scroll-container">
              <Table className="border-separate border-spacing-0 min-w-[3000px]">
                <TableHeader className="sticky top-0 z-30 bg-background shadow-sm">
                  <TableRow className="bg-background hover:bg-background">
                    <TableHead className="sticky left-0 z-40 bg-background border-b border-r w-[250px] shadow-[2px_0_4px_rgba(0,0,0,0.05)] font-bold text-foreground">Empresa / Contato</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Responsável</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Decisor</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Nicho</TableHead>
                    <TableHead className="bg-background border-b w-[100px] font-bold text-foreground">Prioridade</TableHead>
                    <TableHead className="bg-background border-b w-[120px] font-bold text-foreground">Temperatura</TableHead>
                    <TableHead className="bg-background border-b w-[100px] font-bold text-foreground">Cadência</TableHead>
                    <TableHead className="bg-background border-b w-[120px] font-bold text-foreground">Tempo de Vida</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Valor</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Origem</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Cidade</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Produto/Serviço</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">CPF/CNPJ</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Origem Contato</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Status GMN</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Google Ads</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Meta Ads</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Social Media</TableHead>
                    <TableHead className="bg-background border-b w-[150px] font-bold text-foreground">Status Pré-qual</TableHead>
                    <TableHead className="sticky right-0 z-40 bg-background border-b border-l w-[220px] shadow-[-4px_0_4px_rgba(0,0,0,0.05)] text-center font-bold text-foreground">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-background">
                  {leadsRecebidos.length === 0 ? (
                    <TableRow className="bg-background">
                      <TableCell colSpan={20} className="h-24 text-center bg-background">
                        Nenhum lead recebido.
                      </TableCell>
                    </TableRow>
                  ) : (
                    leadsRecebidos.map((lead) => {
                      const st = getPreQualStatus(lead);
                      const canQualify = st.concluida && st.resultado === "apto";
                      const temp = typeof lead.temperature === "number" ? lead.temperature : 0;
                      const cadence = lead.cadence ?? "";
                      const decisorNome = lead.decision_maker ? (lead.decision_maker_name || "—") : (lead.name || "—");
                      const decisorTelefoneRaw = lead.decision_maker ? lead.decision_maker_phone : lead.phone;
                      const decisorTelefone = decisorTelefoneRaw ? formatPhoneBR(decisorTelefoneRaw) : null;
                      const contatoTelefone = lead.phone ? formatPhoneBR(lead.phone) : null;
                      const cidade = (lead.metadata as { cidade?: string })?.cidade || "—";
                      
                      return (
                        <TableRow key={lead.id} className="hover:bg-muted bg-background transition-colors group">
                          <TableCell className="sticky left-0 z-10 bg-background border-r font-medium group-hover:bg-muted shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                            <div className="font-medium truncate w-[230px]" title={lead.company || "—"}>{lead.company || "—"}</div>
                            <div className="text-xs text-muted-foreground truncate w-[230px]" title={lead.name}>
                              {lead.name || "—"}{contatoTelefone ? ` • ${contatoTelefone}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted text-sm">
                            {(lead as LeadWithResponsavel).responsavel?.full_name || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground bg-background group-hover:bg-muted">
                            <div className="text-sm truncate w-[130px]" title={decisorNome}>{decisorNome}</div>
                            <div className="text-xs text-muted-foreground">{decisorTelefone || "—"}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground bg-background group-hover:bg-muted truncate w-[130px]" title={lead.nicho || "—"}>
                            {lead.nicho || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted">
                            <Badge className={getPriorityColor(lead.prioridade)}>
                              {lead.prioridade || "média"}
                            </Badge>
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3].map((i) => (
                                <Flame
                                  key={i}
                                  className={i <= temp ? "h-4 w-4 text-orange-500" : "h-4 w-4 text-muted-foreground"}
                                />
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums bg-background group-hover:bg-muted text-center">
                            {cadence ? String(cadence) : "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted">
                            <Badge variant="outline" className="text-xs">{getLifecycleDays(lead.created_at)} dias</Badge>
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted text-sm font-medium">
                            {typeof lead.value === "number" ? `R$ ${lead.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted text-sm truncate w-[130px]" title={lead.source || "—"}>
                            {lead.source || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted text-sm truncate w-[130px]" title={cidade}>
                            {cidade}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted text-sm capitalize">
                            {lead.product_service?.replace(/_/g, " ") || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted text-sm">
                            {lead.cpf_cnpj || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted text-sm capitalize">
                            {lead.contact_origin?.replace("_", " ") || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted">
                            <LeadStatusBadge field="gmn" value={lead.gmn_status} />
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted">
                            <LeadStatusBadge field="ads" value={lead.google_ads_level} />
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted">
                            <LeadStatusBadge field="ads" value={lead.meta_ads_level} />
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted">
                            <LeadStatusBadge field="social" value={lead.social_media_status} />
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-muted">
                            {st.concluida ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">Pré-qualificado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                            )}
                          </TableCell>
                          <TableCell className="sticky right-0 z-10 text-right bg-background group-hover:bg-muted border-l shadow-[-4px_0_4px_rgba(0,0,0,0.05)]">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openPreQual(lead)} className="bg-background h-8 text-xs">
                                {st.concluida ? "Editar" : "Pré-qualificar"}
                              </Button>
                              <Button
                                size="sm"
                                className="gap-2 h-8 text-xs"
                                disabled={!canQualify}
                                onClick={() => handleEtapaChange(lead.id, "qualificados")}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Qualificar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── Listas ── */}
        <TabsContent value="listas">
          <ListasPage />
        </TabsContent>

        {/* ── Leads Pendentes ── */}
        <TabsContent value="pendentes">
          <LeadsPendingPage />
        </TabsContent>

        {/* ── Performance Closers ── */}
        <TabsContent value="performance">
          <ClosersPerformancePage />
        </TabsContent>

        {/* ── Recebidos do Formulário ── */}
        <TabsContent value="formulario">
          <FormLeadsTab />
        </TabsContent>

      </Tabs>

      <LeadDetailsModal
        lead={selectedLead}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onLeadUpdated={async () => {
          await refetch();
        }}
        onEdit={(l) => {
          setEditing(l);
          const meta = (l.metadata ?? {}) as Record<string, unknown>;
          setEditForm({
            company: l.company ?? "",
            name: l.name ?? "",
            email: l.email ?? "",
            phone: l.phone ?? "",
            nicho: l.nicho ?? "",
            source: l.source ?? "",
            cidade: (meta.cidade as string) ?? "",
            estado: (meta.estado as string) ?? "",
            value: String(l.value ?? ""),
            prioridade: ((l.prioridade as "baixa" | "media" | "alta" | "urgente") ?? "media"),
            assigned_to: l.assigned_to ?? "",
            notes: l.notes ?? "",
            first_contact_date: l.first_contact_date ?? "",
            last_contact_date: l.last_contact_date ?? "",
            cpf_cnpj: l.cpf_cnpj != null ? String(l.cpf_cnpj) : "",
            contact_origin: (l.contact_origin ?? "") as typeof editForm.contact_origin,
            decision_maker: !!(typeof l.decision_maker === "boolean" ? l.decision_maker : l.decision_maker === "true"),
            decision_maker_name: l.decision_maker_name ?? "",
            decision_maker_phone: l.decision_maker_phone != null ? String(l.decision_maker_phone) : "",
            gbp_url: l.gbp_url ?? "",
            instagram_url: l.instagram_url ?? "",
            website_url: l.website_url ?? "",
            gmn_status: (l.gmn_status ?? "") as typeof editForm.gmn_status,
            google_ads_level: (l.google_ads_level ?? "") as typeof editForm.google_ads_level,
            meta_ads_level: (l.meta_ads_level ?? "") as typeof editForm.meta_ads_level,
            social_media_status: (l.social_media_status ?? "") as typeof editForm.social_media_status,
            product_service: (l.product_service ?? "") as typeof editForm.product_service,
            lost_reason: (l.lost_reason ?? "") as typeof editForm.lost_reason,
            cadence: l.cadence != null ? String(l.cadence) : "",
            temperature: typeof l.temperature === "number" ? l.temperature : 0,
          });
          setModalOpen(false);
        }}
        onDelete={(id) => {
          requirePin(
            "Excluir lead",
            "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
            async () => { removeLead(id); setModalOpen(false); }
          );
        }}
      />

      <NovoLeadDialog
        open={novoLeadOpen}
        onOpenChange={setNovoLeadOpen}
        onSubmit={handleCreateLead}
        profiles={profiles}
      />

      <Dialog open={!!preQualLead} onOpenChange={async (o) => {
          if (!o && preQualLead) {
            // Salva silenciosamente ao fechar (signout, ESC, clique fora, Cancelar)
            // preserva o estado concluida atual do lead — não regride qualificações já feitas
            const jaQualificado = !!(preQualLead.metadata as Record<string, unknown> | null)
              ?.pre_qualificacao
              ? ((preQualLead.metadata as Record<string, unknown>).pre_qualificacao as Record<string, unknown>)?.concluida === true
              : false;
            try {
              await handleSavePreQual(preQualLead.id, preQualLeadForm, preQualForm, jaQualificado);
            } catch {
              // falha silenciosa — não bloquear o fechamento
            }
            setPreQualLead(null);
          }
        }}>
        <DialogContent className="max-w-[80vw] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-qualificação</DialogTitle>
          </DialogHeader>
          {preQualLead && (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const leadId = preQualLead.id;
                try {
                  await handleSavePreQual(leadId, preQualLeadForm, preQualForm, true);
                  toast.success("Pré-qualificação salva.");
                  setPreQualLead(null);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Erro ao salvar pré-qualificação.";
                  toast.error(msg);
                }
              }}
            >
              <div className="rounded-md border p-3 bg-muted/20 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{preQualLead.company || "Sem empresa"}</div>
                    <div className="text-sm text-muted-foreground truncate">{preQualLead.name || "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{preQualLead.etapa_kanban || "leads_recebidos"}</Badge>
                    <Badge variant="outline">
                      {getLifecycleDays(preQualLead.created_at)} dias
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Empresa</Label>
                    <Input
                      value={preQualLeadForm.company}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, company: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contato/Nome</Label>
                    <Input
                      value={preQualLeadForm.name}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={preQualLeadForm.phone}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, phone: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Nicho</Label>
                    <Select
                      value={preQualLeadForm.nicho}
                      onValueChange={(v) => setPreQualLeadForm({ ...preQualLeadForm, nicho: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {NICHO_OPTIONS.map((n) => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input
                      value={preQualLeadForm.cidade}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, cidade: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Select
                      value={preQualLeadForm.estado}
                      onValueChange={(v) => setPreQualLeadForm({ ...preQualLeadForm, estado: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Produto/Serviço</Label>
                    <Select
                      value={preQualLeadForm.product_service}
                      onValueChange={(v) =>
                        setPreQualLeadForm({
                          ...preQualLeadForm,
                          product_service: v as typeof preQualLeadForm.product_service,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_SERVICE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select
                      value={preQualLeadForm.prioridade}
                      onValueChange={(v) =>
                        setPreQualLeadForm({
                          ...preQualLeadForm,
                          prioridade: v as "baixa" | "media" | "alta" | "urgente",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Select
                      value={preQualLeadForm.assigned_to || "unassigned"}
                      onValueChange={(v) =>
                        setPreQualLeadForm({ ...preQualLeadForm, assigned_to: v === "unassigned" ? "" : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Sem responsável</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Origem do Contato</Label>
                    <Select
                      value={preQualLeadForm.contact_origin}
                      onValueChange={(v) =>
                        setPreQualLeadForm({
                          ...preQualLeadForm,
                          contact_origin: v as typeof preQualLeadForm.contact_origin,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="indicacao">Indicação</SelectItem>
                        <SelectItem value="prospeccao">Prospecção</SelectItem>
                        <SelectItem value="campanha_google">Campanha Google</SelectItem>
                        <SelectItem value="campanha_meta">Campanha Meta</SelectItem>
                        <SelectItem value="organico">Orgânico</SelectItem>
                        <SelectItem value="outras">Outras</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>GBP</Label>
                    <div className="relative">
                      <Input
                        type="url"
                        value={preQualLeadForm.gbp_url}
                        onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, gbp_url: e.target.value })}
                        className={preQualLeadForm.gbp_url ? "pr-9" : ""}
                      />
                      {preQualLeadForm.gbp_url && (
                        <a href={preQualLeadForm.gbp_url} target="_blank" rel="noopener noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary" tabIndex={-1}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Instagram</Label>
                    <div className="relative">
                      <Input
                        type="url"
                        value={preQualLeadForm.instagram_url}
                        onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, instagram_url: e.target.value })}
                        className={preQualLeadForm.instagram_url ? "pr-9" : ""}
                      />
                      {preQualLeadForm.instagram_url && (
                        <a href={preQualLeadForm.instagram_url} target="_blank" rel="noopener noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary" tabIndex={-1}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <div className="relative">
                      <Input
                        type="url"
                        value={preQualLeadForm.website_url}
                        onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, website_url: e.target.value })}
                        className={preQualLeadForm.website_url ? "pr-9" : ""}
                      />
                      {preQualLeadForm.website_url && (
                        <a href={preQualLeadForm.website_url} target="_blank" rel="noopener noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary" tabIndex={-1}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>GMN</Label>
                    <Select
                      value={preQualLeadForm.gmn_status}
                      onValueChange={(v) =>
                        setPreQualLeadForm({ ...preQualLeadForm, gmn_status: v as typeof preQualLeadForm.gmn_status })
                      }
                    >
                      <SelectTrigger>
                        {preQualLeadForm.gmn_status
                          ? <LeadStatusBadge field="gmn" value={preQualLeadForm.gmn_status} />
                          : <span className="text-muted-foreground text-sm">Selecione...</span>}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nao_possui"><LeadStatusBadge field="gmn" value="nao_possui" /></SelectItem>
                        <SelectItem value="desatualizado_desativado"><LeadStatusBadge field="gmn" value="desatualizado_desativado" /></SelectItem>
                        <SelectItem value="desatualizado"><LeadStatusBadge field="gmn" value="desatualizado" /></SelectItem>
                        <SelectItem value="incompleto"><LeadStatusBadge field="gmn" value="incompleto" /></SelectItem>
                        <SelectItem value="completo"><LeadStatusBadge field="gmn" value="completo" /></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Google Ads</Label>
                    <Select
                      value={preQualLeadForm.google_ads_level}
                      onValueChange={(v) =>
                        setPreQualLeadForm({
                          ...preQualLeadForm,
                          google_ads_level: v as typeof preQualLeadForm.google_ads_level,
                        })
                      }
                    >
                      <SelectTrigger>
                        {preQualLeadForm.google_ads_level
                          ? <LeadStatusBadge field="ads" value={preQualLeadForm.google_ads_level} />
                          : <span className="text-muted-foreground text-sm">Selecione...</span>}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conta_nao_encontrada"><LeadStatusBadge field="ads" value="conta_nao_encontrada" /></SelectItem>
                        <SelectItem value="sem_anuncios"><LeadStatusBadge field="ads" value="sem_anuncios" /></SelectItem>
                        <SelectItem value="poucos_anuncios"><LeadStatusBadge field="ads" value="poucos_anuncios" /></SelectItem>
                        <SelectItem value="muitos_anuncios"><LeadStatusBadge field="ads" value="muitos_anuncios" /></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Meta Ads</Label>
                    <Select
                      value={preQualLeadForm.meta_ads_level}
                      onValueChange={(v) =>
                        setPreQualLeadForm({
                          ...preQualLeadForm,
                          meta_ads_level: v as typeof preQualLeadForm.meta_ads_level,
                        })
                      }
                    >
                      <SelectTrigger>
                        {preQualLeadForm.meta_ads_level
                          ? <LeadStatusBadge field="ads" value={preQualLeadForm.meta_ads_level} />
                          : <span className="text-muted-foreground text-sm">Selecione...</span>}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conta_nao_encontrada"><LeadStatusBadge field="ads" value="conta_nao_encontrada" /></SelectItem>
                        <SelectItem value="sem_anuncios"><LeadStatusBadge field="ads" value="sem_anuncios" /></SelectItem>
                        <SelectItem value="poucos_anuncios"><LeadStatusBadge field="ads" value="poucos_anuncios" /></SelectItem>
                        <SelectItem value="muitos_anuncios"><LeadStatusBadge field="ads" value="muitos_anuncios" /></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Social Media</Label>
                    <Select
                      value={preQualLeadForm.social_media_status}
                      onValueChange={(v) =>
                        setPreQualLeadForm({
                          ...preQualLeadForm,
                          social_media_status: v as typeof preQualLeadForm.social_media_status,
                        })
                      }
                    >
                      <SelectTrigger>
                        {preQualLeadForm.social_media_status
                          ? <LeadStatusBadge field="social" value={preQualLeadForm.social_media_status} />
                          : <span className="text-muted-foreground text-sm">Selecione...</span>}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem_frequencia"><LeadStatusBadge field="social" value="sem_frequencia" /></SelectItem>
                        <SelectItem value="parado_inexistente"><LeadStatusBadge field="social" value="parado_inexistente" /></SelectItem>
                        <SelectItem value="frequente_sem_estrategia"><LeadStatusBadge field="social" value="frequente_sem_estrategia" /></SelectItem>
                        <SelectItem value="frequente_estruturado"><LeadStatusBadge field="social" value="frequente_estruturado" /></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Temperatura</Label>
                    <div className="flex items-center gap-2 h-10">
                      {[1, 2, 3].map((i) => (
                        <button
                          key={i}
                          type="button"
                          className="p-1"
                          onClick={() => setPreQualLeadForm({ ...preQualLeadForm, temperature: i })}
                        >
                          <Flame
                            className={
                              i <= preQualLeadForm.temperature
                                ? "h-5 w-5 text-orange-500 fill-orange-500"
                                : "h-5 w-5 text-muted-foreground/30"
                            }
                          />
                        </button>
                      ))}
                      <span className="text-sm text-muted-foreground">{preQualLeadForm.temperature}/3</span>
                    </div>
                  </div>

                </div>
              </div>

              <div className="space-y-2">
                <Label>Outros Serviços Compatíveis</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1 rounded-md border p-2 bg-background">
                  {PRODUCT_SERVICE_OPTIONS.filter((opt) => opt.value !== preQualLeadForm.product_service).map((opt) => {
                    const selected = preQualLeadForm.outros_servicos.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-muted select-none">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary shrink-0"
                          checked={selected}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...preQualLeadForm.outros_servicos, opt.value]
                              : preQualLeadForm.outros_servicos.filter((v) => v !== opt.value);
                            setPreQualLeadForm({ ...preQualLeadForm, outros_servicos: updated });
                          }}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    );
                  })}
                  {PRODUCT_SERVICE_OPTIONS.filter((opt) => opt.value !== preQualLeadForm.product_service).length === 0 && (
                    <p className="text-xs text-muted-foreground col-span-full px-1">Todos os serviços já estão selecionados.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Resultado</Label>
                  <Select
                    value={preQualForm.resultado}
                    onValueChange={(v) => setPreQualForm({ ...preQualForm, resultado: v as "apto" | "inapto" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apto">Apto (pode qualificar)</SelectItem>
                      <SelectItem value="inapto">Inapto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={preQualForm.notas}
                    onChange={(e) => setPreQualForm({ ...preQualForm, notas: e.target.value })}
                    rows={5}
                    placeholder="Informações coletadas na pré-qualificação..."
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPreQualLead(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={preQualForm.resultado !== "apto"}
                  onClick={async () => {
                    if (!preQualLead) return;
                    const leadId = preQualLead.id;
                    try {
                      await handleSavePreQual(leadId, preQualLeadForm, preQualForm, true);
                      await handleEtapaChange(leadId, "qualificados");
                      setPreQualLead(null);
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Erro ao qualificar.";
                      toast.error(msg);
                    }
                  }}
                >
                  Salvar e qualificar
                </Button>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent
          className="flex flex-col gap-0 p-0 overflow-hidden"
          style={{ width: "75vw", maxWidth: "75vw", height: "90vh", maxHeight: "90vh" }}
        >
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>Editar Lead</DialogTitle>
          </DialogHeader>

          {editing && (
            <form
              id="edit-lead-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editing) return;
                await updateLead(editing.id, {
                  company: editForm.company,
                  name: editForm.name,
                  email: editForm.email || null,
                  phone: editForm.phone || null,
                  nicho: editForm.nicho || null,
                  source: editForm.source || null,
                  value: editForm.value ? Number(editForm.value) : null,
                  prioridade: editForm.prioridade,
                  assigned_to: editForm.assigned_to || null,
                  notes: editForm.notes || null,
                  first_contact_date: editForm.first_contact_date || null,
                  last_contact_date: editForm.last_contact_date || null,
                  cpf_cnpj: editForm.cpf_cnpj ? Number(editForm.cpf_cnpj) : null,
                  contact_origin: editForm.contact_origin || null,
                  decision_maker: editForm.decision_maker,
                  decision_maker_name: editForm.decision_maker_name || null,
                  decision_maker_phone: editForm.decision_maker_phone ? Number(editForm.decision_maker_phone) : null,
                  gbp_url: editForm.gbp_url || null,
                  instagram_url: editForm.instagram_url || null,
                  website_url: editForm.website_url || null,
                  gmn_status: editForm.gmn_status || null,
                  google_ads_level: editForm.google_ads_level || null,
                  meta_ads_level: editForm.meta_ads_level || null,
                  social_media_status: editForm.social_media_status || null,
                  product_service: editForm.product_service || null,
                  lost_reason: editForm.lost_reason || null,
                  cadence: editForm.cadence || null,
                  temperature: editForm.temperature,
                  metadata: {
                    ...((editing.metadata ?? {}) as Record<string, unknown>),
                    cidade: editForm.cidade || null,
                    estado: editForm.estado || null,
                  },
                } as Partial<Lead>);
                setEditing(null);
              }}
              className="flex-1 overflow-y-auto px-6 py-5"
            >
              <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">

                {/* ── Identificação ── */}
                <div className="col-span-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1 mb-3">Identificação</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Empresa</Label>
                  <Input value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contato / Nome</Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telefone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CPF / CNPJ</Label>
                  <Input value={editForm.cpf_cnpj} onChange={(e) => setEditForm({ ...editForm, cpf_cnpj: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cidade</Label>
                  <Input value={editForm.cidade} onChange={(e) => setEditForm({ ...editForm, cidade: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Input value={editForm.estado} onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Primeiro Contato</Label>
                  <Input type="date" value={editForm.first_contact_date} onChange={(e) => setEditForm({ ...editForm, first_contact_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Último Contato</Label>
                  <Input type="date" value={editForm.last_contact_date} onChange={(e) => setEditForm({ ...editForm, last_contact_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$)</Label>
                  <CurrencyInput value={editForm.value} onChange={(v) => setEditForm({ ...editForm, value: v })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cadência</Label>
                  <Input value={editForm.cadence} onChange={(e) => setEditForm({ ...editForm, cadence: e.target.value })} />
                </div>

                {/* ── Qualificação ── */}
                <div className="col-span-3 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1 mb-3">Qualificação</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prioridade</Label>
                  <Select value={editForm.prioridade} onValueChange={(v) => setEditForm({ ...editForm, prioridade: v as typeof editForm.prioridade })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nicho</Label>
                  <Select value={editForm.nicho || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, nicho: v === "__none__" ? "" : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {NICHO_OPTIONS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Origem</Label>
                  <Select value={editForm.source || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, source: v === "__none__" ? "" : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {ORIGEM_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Origem do Contato</Label>
                  <Select value={editForm.contact_origin || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, contact_origin: v === "__none__" ? "" : v as typeof editForm.contact_origin })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="indicacao">Indicação</SelectItem>
                      <SelectItem value="prospeccao">Prospecção</SelectItem>
                      <SelectItem value="campanha_google">Campanha Google</SelectItem>
                      <SelectItem value="campanha_meta">Campanha Meta</SelectItem>
                      <SelectItem value="organico">Orgânico</SelectItem>
                      <SelectItem value="outras">Outras</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Produto / Serviço</Label>
                  <Select value={editForm.product_service || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, product_service: v === "__none__" ? "" : v as typeof editForm.product_service })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {PRODUCT_SERVICE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Responsável</Label>
                  <Select value={editForm.assigned_to || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, assigned_to: v === "__none__" ? "" : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem responsável</SelectItem>
                      {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="edit_decision_maker"
                    checked={editForm.decision_maker}
                    onChange={(e) => setEditForm({ ...editForm, decision_maker: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="edit_decision_maker" className="text-xs cursor-pointer">Decisor presente</Label>
                </div>
                {editForm.decision_maker && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do Decisor</Label>
                      <Input value={editForm.decision_maker_name} onChange={(e) => setEditForm({ ...editForm, decision_maker_name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Telefone do Decisor</Label>
                      <Input value={editForm.decision_maker_phone} onChange={(e) => setEditForm({ ...editForm, decision_maker_phone: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Motivo da Perda</Label>
                  <Select value={editForm.lost_reason || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, lost_reason: v === "__none__" ? "" : v as typeof editForm.lost_reason })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="capacidade_produtiva">Capacidade produtiva</SelectItem>
                      <SelectItem value="orcamento">Orçamento</SelectItem>
                      <SelectItem value="desqualificado">Desqualificado</SelectItem>
                      <SelectItem value="barrado_pelo_sa">Barrado pelo SA</SelectItem>
                      <SelectItem value="sem_contato">Sem contato</SelectItem>
                      <SelectItem value="limite_da_franquia">Limite da franquia</SelectItem>
                      <SelectItem value="concorrencia">Concorrência</SelectItem>
                      <SelectItem value="perda_de_contato">Perda de contato</SelectItem>
                      <SelectItem value="cadencia_excedida">Cadência excedida</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* ── Presença Digital ── */}
                <div className="col-span-3 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1 mb-3">Presença Digital</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">GMN</Label>
                  <Select value={editForm.gmn_status || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, gmn_status: v === "__none__" ? "" : v as typeof editForm.gmn_status })}>
                    <SelectTrigger className="h-8 text-xs">
                      {editForm.gmn_status
                        ? <LeadStatusBadge field="gmn" value={editForm.gmn_status} />
                        : <span className="text-muted-foreground text-xs">Selecione...</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="nao_possui"><LeadStatusBadge field="gmn" value="nao_possui" /></SelectItem>
                      <SelectItem value="desatualizado_desativado"><LeadStatusBadge field="gmn" value="desatualizado_desativado" /></SelectItem>
                      <SelectItem value="desatualizado"><LeadStatusBadge field="gmn" value="desatualizado" /></SelectItem>
                      <SelectItem value="incompleto"><LeadStatusBadge field="gmn" value="incompleto" /></SelectItem>
                      <SelectItem value="completo"><LeadStatusBadge field="gmn" value="completo" /></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Google Ads</Label>
                  <Select value={editForm.google_ads_level || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, google_ads_level: v === "__none__" ? "" : v as typeof editForm.google_ads_level })}>
                    <SelectTrigger className="h-8 text-xs">
                      {editForm.google_ads_level
                        ? <LeadStatusBadge field="ads" value={editForm.google_ads_level} />
                        : <span className="text-muted-foreground text-xs">Selecione...</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="conta_nao_encontrada"><LeadStatusBadge field="ads" value="conta_nao_encontrada" /></SelectItem>
                      <SelectItem value="sem_anuncios"><LeadStatusBadge field="ads" value="sem_anuncios" /></SelectItem>
                      <SelectItem value="poucos_anuncios"><LeadStatusBadge field="ads" value="poucos_anuncios" /></SelectItem>
                      <SelectItem value="muitos_anuncios"><LeadStatusBadge field="ads" value="muitos_anuncios" /></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Meta Ads</Label>
                  <Select value={editForm.meta_ads_level || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, meta_ads_level: v === "__none__" ? "" : v as typeof editForm.meta_ads_level })}>
                    <SelectTrigger className="h-8 text-xs">
                      {editForm.meta_ads_level
                        ? <LeadStatusBadge field="ads" value={editForm.meta_ads_level} />
                        : <span className="text-muted-foreground text-xs">Selecione...</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="conta_nao_encontrada"><LeadStatusBadge field="ads" value="conta_nao_encontrada" /></SelectItem>
                      <SelectItem value="sem_anuncios"><LeadStatusBadge field="ads" value="sem_anuncios" /></SelectItem>
                      <SelectItem value="poucos_anuncios"><LeadStatusBadge field="ads" value="poucos_anuncios" /></SelectItem>
                      <SelectItem value="muitos_anuncios"><LeadStatusBadge field="ads" value="muitos_anuncios" /></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Social Media</Label>
                  <Select value={editForm.social_media_status || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, social_media_status: v === "__none__" ? "" : v as typeof editForm.social_media_status })}>
                    <SelectTrigger className="h-8 text-xs">
                      {editForm.social_media_status
                        ? <LeadStatusBadge field="social" value={editForm.social_media_status} />
                        : <span className="text-muted-foreground text-xs">Selecione...</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="sem_frequencia"><LeadStatusBadge field="social" value="sem_frequencia" /></SelectItem>
                      <SelectItem value="parado_inexistente"><LeadStatusBadge field="social" value="parado_inexistente" /></SelectItem>
                      <SelectItem value="frequente_sem_estrategia"><LeadStatusBadge field="social" value="frequente_sem_estrategia" /></SelectItem>
                      <SelectItem value="frequente_estruturado"><LeadStatusBadge field="social" value="frequente_estruturado" /></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">GBP (URL)</Label>
                  <Input type="url" value={editForm.gbp_url} onChange={(e) => setEditForm({ ...editForm, gbp_url: e.target.value })} placeholder="https://..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Instagram (URL)</Label>
                  <Input type="url" value={editForm.instagram_url} onChange={(e) => setEditForm({ ...editForm, instagram_url: e.target.value })} placeholder="https://..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Website (URL)</Label>
                  <Input type="url" value={editForm.website_url} onChange={(e) => setEditForm({ ...editForm, website_url: e.target.value })} placeholder="https://..." />
                </div>

                {/* ── Observações — largura total ── */}
                <div className="col-span-3 space-y-1 mt-2">
                  <Label className="text-xs">Observações</Label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                    placeholder="Observações sobre o lead..."
                  />
                </div>

              </div>
            </form>
          )}

          <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" form="edit-lead-form">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={csvOpen}
        onOpenChange={(o) => {
          if (csvImporting) return; // block close while importing
          setCsvOpen(o);
          if (!o) {
            setCsvImportResult(null);
            setCsvRows([]);
            setCsvHeaders([]);
            setCsvMapping({});
            setCsvStep("lista");
            setCsvListaMode("none");
            setCsvListaId(null);
            setCsvListaForm({ nome: "", cidade: "", estado: "", nicho: "" });
          }
        }}
      >
        <DialogContent className="max-w-[80vw] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Leads via CSV</DialogTitle>
          </DialogHeader>

          {csvImporting ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">Importando leads...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Isso pode levar alguns segundos. Não feche esta janela.
                </p>
              </div>
            </div>
          ) : csvImportResult ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
                <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                <p className="text-sm">
                  <strong>{csvImportResult.created}</strong> lead(s) importado(s) com sucesso.
                  {csvListaId && (
                    <span className="text-muted-foreground"> Vinculados à lista selecionada.</span>
                  )}
                </p>
              </div>
              {csvImportResult.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 p-4">
                  <p className="text-sm font-medium text-destructive mb-2">
                    {csvImportResult.errors.length} erro(s):
                  </p>
                  <ul className="text-sm text-muted-foreground max-h-64 overflow-y-auto space-y-1">
                    {csvImportResult.errors.map((e, i) => (
                      <li key={i} className="font-mono text-xs">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={() => setCsvOpen(false)}>Fechar</Button>
              </div>
            </div>
          ) : csvStep === "lista" ? (
            /* ── PASSO 1: CONFIGURAR LISTA ─────────────────────────────── */
            <div className="space-y-5">
              {/* indicador de passos */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground font-medium text-[11px]">1</span>
                <span className="font-medium text-foreground">Configurar lista</span>
                <span className="mx-1">›</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-medium text-[11px]">2</span>
                <span>Mapear colunas</span>
              </div>

              <p className="text-sm text-muted-foreground">
                {csvRows.length} linha(s) detectada(s). Deseja vincular estes leads a uma lista?
              </p>

              <RadioGroup
                value={csvListaMode}
                onValueChange={(v) => {
                  setCsvListaMode(v as "new" | "existing" | "none");
                  setCsvListaId(null);
                }}
                className="space-y-3"
              >
                <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/30 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 transition-colors">
                  <RadioGroupItem value="none" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Não vincular a nenhuma lista</p>
                    <p className="text-xs text-muted-foreground">Os leads serão importados sem associação a lista.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/30 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 transition-colors">
                  <RadioGroupItem value="existing" className="mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm font-medium">Usar lista existente</p>
                      <p className="text-xs text-muted-foreground">Selecione uma lista ativa para vincular os leads.</p>
                    </div>
                    {csvListaMode === "existing" && (
                      <Select value={csvListaId ?? ""} onValueChange={setCsvListaId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma lista..." />
                        </SelectTrigger>
                        <SelectContent>
                          {listas.length === 0 ? (
                            <SelectItem value="__none__" disabled>Nenhuma lista ativa encontrada</SelectItem>
                          ) : (
                            listas.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.nome} — {l.cidade}{l.estado ? ` (${l.estado})` : ""} · {l.nicho} · {new Date(l.created_at).toLocaleDateString('pt-BR')}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/30 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 transition-colors">
                  <RadioGroupItem value="new" className="mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm font-medium">Criar nova lista</p>
                      <p className="text-xs text-muted-foreground">Preencha os dados abaixo para criar e vincular.</p>
                    </div>
                    {csvListaMode === "new" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Nome da lista <span className="text-destructive">*</span></Label>
                          <Input
                            placeholder="Ex.: Clínicas BH Junho/25"
                            value={csvListaForm.nome}
                            onChange={(e) => setCsvListaForm(f => ({ ...f, nome: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cidade <span className="text-destructive">*</span></Label>
                          <Input
                            placeholder="Ex.: Belo Horizonte"
                            value={csvListaForm.cidade}
                            onChange={(e) => setCsvListaForm(f => ({ ...f, cidade: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Estado <span className="text-destructive">*</span></Label>
                          <Select
                            value={csvListaForm.estado}
                            onValueChange={(v) => setCsvListaForm(f => ({ ...f, estado: v }))}
                          >
                            <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                            <SelectContent>
                              {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => (
                                <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Nicho <span className="text-destructive">*</span></Label>
                          <Select
                            value={csvListaForm.nicho}
                            onValueChange={(v) => setCsvListaForm(f => ({ ...f, nicho: v }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione o nicho..." /></SelectTrigger>
                            <SelectContent>
                              {NICHO_OPTIONS.map((n) => (
                                <SelectItem key={n} value={n}>{n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </RadioGroup>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCsvOpen(false)}>Cancelar</Button>
                <Button
                  disabled={
                    csvListaCreating ||
                    (csvListaMode === "existing" && !csvListaId) ||
                    (csvListaMode === "new" && (!csvListaForm.nome.trim() || !csvListaForm.cidade.trim() || !csvListaForm.estado || !csvListaForm.nicho))
                  }
                  onClick={async () => {
                    if (csvListaMode === "new") {
                      setCsvListaCreating(true);
                      try {
                        // Check for existing lista with same cidade+nicho
                        const existing = await getLista(csvListaForm.cidade, csvListaForm.nicho);
                        if (existing) {
                          toast.error(`Já existe a lista "${existing.nome}" para ${csvListaForm.cidade} / ${csvListaForm.nicho}. Selecione-a na opção "Usar lista existente".`);
                          return;
                        }
                        const lista = await createLista(csvListaForm);
                        setCsvListaId(lista.id);
                        toast.success(`Lista "${lista.nome}" criada!`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Erro ao criar lista.");
                        return;
                      } finally {
                        setCsvListaCreating(false);
                      }
                    }
                    setCsvStep("mapping");
                  }}
                >
                  {csvListaCreating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando lista...</>
                  ) : (
                    <>Próximo: Mapear colunas</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {csvRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma linha encontrada no CSV.</div>
              ) : (
                <>
                  {/* indicador de passos */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-medium text-[11px]">1</span>
                    <span>Configurar lista</span>
                    <span className="mx-1">›</span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground font-medium text-[11px]">2</span>
                    <span className="font-medium text-foreground">Mapear colunas</span>
                    {csvListaId && (
                      <span className="ml-auto flex items-center gap-1 text-green-600">
                        <ListChecks className="h-3.5 w-3.5" />
                        {listas.find(l => l.id === csvListaId)?.nome ?? "Lista selecionada"}
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {csvRows.length} linha(s) detectada(s). Faça o mapeamento das colunas.
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Coluna CSV</TableHead>
                          <TableHead>Exemplo</TableHead>
                          <TableHead>Campo destino</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvHeaders.map((h) => {
                          const sample = csvRows[0]?.[h] ?? "";
                          return (
                            <TableRow key={h}>
                              <TableCell className="font-medium">{h}</TableCell>
                              <TableCell className="text-muted-foreground text-sm truncate max-w-[280px]">
                                {sample || "—"}
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={csvMapping[h] ?? "ignore"}
                                  onValueChange={(v) => setCsvMapping({ ...csvMapping, [h]: v })}
                                >
                                  <SelectTrigger className="w-[260px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="ignore">Ignorar</SelectItem>
                                    <SelectItem value="company">Empresa</SelectItem>
                                    <SelectItem value="name">Nome</SelectItem>
                                    <SelectItem value="email">E-mail</SelectItem>
                                    <SelectItem value="phone">Telefone</SelectItem>
                                    <SelectItem value="nicho">Nicho</SelectItem>
                                    <SelectItem value="source">Origem</SelectItem>
                                    <SelectItem value="cidade">Cidade</SelectItem>
                                    <SelectItem value="value">Valor da Proposta</SelectItem>
                                    <SelectItem value="prioridade">Prioridade</SelectItem>
                                    <SelectItem value="assigned_to">Responsável</SelectItem>
                                    <SelectItem value="notes">Observações do Lead</SelectItem>
                                    <SelectItem value="first_contact_date">Primeiro Contato</SelectItem>
                                    <SelectItem value="last_contact_date">Último Contato</SelectItem>
                                    <SelectItem value="product_service">Produto/Serviço</SelectItem>
                                    <SelectItem value="cpf_cnpj">CPF/CNPJ</SelectItem>
                                    <SelectItem value="contact_origin">Origem do Contato</SelectItem>
                                    <SelectItem value="decision_maker">Decisor (Sim/Não)</SelectItem>
                                    <SelectItem value="decision_maker_name">Nome do Decisor</SelectItem>
                                    <SelectItem value="decision_maker_phone">Telefone do Decisor</SelectItem>
                                    <SelectItem value="gbp_url">GBP</SelectItem>
                                    <SelectItem value="instagram_url">Instagram</SelectItem>
                                    <SelectItem value="website_url">Website</SelectItem>
                                    <SelectItem value="gmn_status">GMN</SelectItem>
                                    <SelectItem value="google_ads_level">Google Ads</SelectItem>
                                    <SelectItem value="meta_ads_level">Meta Ads</SelectItem>
                                    <SelectItem value="social_media_status">Social Media</SelectItem>
                                    <SelectItem value="lost_reason">Motivo da Perda</SelectItem>
                                    <SelectItem value="cadence">Cadência</SelectItem>
                                    <SelectItem value="temperature">Temperatura (0-3)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCsvStep("lista")}>
                      Voltar
                    </Button>
                    <Button
                      type="button"
                      disabled={csvImporting}
                      onClick={async () => {
                        const normalize = (v: string) =>
                          v
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "")
                            .trim()
                            .toLowerCase();

                        const toNum = (v: string) => {
                          const s = v.replace(/[^\d,.-]/g, "").replace(",", ".");
                          const n = parseFloat(s);
                          return Number.isNaN(n) ? null : n;
                        };

                        const toDate = (v: string) => {
                          const s = v.trim();
                          if (!s) return null;
                          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
                          const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                          if (m) return `${m[3]}-${m[2]}-${m[1]}`;
                          return null;
                        };

                        const toBool = (v: string) => {
                          const s = normalize(v);
                          if (!s) return null;
                          if (["1", "true", "sim", "s", "yes"].includes(s)) return true;
                          if (["0", "false", "nao", "não", "n", "no"].includes(s)) return false;
                          return null;
                        };

                        const mapEnum = (v: string, mapping: Record<string, string>) => {
                          const key = normalize(v);
                          if (!key) return null;
                          return mapping[key] ?? (mapping[key.replace(/\s+/g, "_")] ?? null);
                        };

                        const productServiceMap: Record<string, string> = {
                          assessoria: "assessoria",
                          consultoria: "consultoria",
                          gmn: "gmn",
                          site: "site",
                          "agente ia": "agente_ia",
                          agente_ia: "agente_ia",
                          outros: "outros",
                        };

                        const contactOriginMap: Record<string, string> = {
                          indicacao: "indicacao",
                          "indicação": "indicacao",
                          prospeccao: "prospeccao",
                          "campanha google": "campanha_google",
                          campanha_google: "campanha_google",
                          "campanha meta": "campanha_meta",
                          campanha_meta: "campanha_meta",
                          organico: "organico",
                          "orgânico": "organico",
                          outras: "outras",
                        };

                        const gmnStatusMap: Record<string, string> = {
                          "nao possui": "nao_possui",
                          nao_possui: "nao_possui",
                          "desatualizado/desativado": "desatualizado_desativado",
                          desatualizado_desativado: "desatualizado_desativado",
                          desatualizado: "desatualizado",
                          incompleto: "incompleto",
                          "imcompleto": "incompleto",
                          completo: "completo",
                        };

                        const adsLevelMap: Record<string, string> = {
                          "sem anuncios": "sem_anuncios",
                          sem_anuncios: "sem_anuncios",
                          "poucos anuncios": "poucos_anuncios",
                          poucos_anuncios: "poucos_anuncios",
                          "muitos anuncios": "muitos_anuncios",
                          muitos_anuncios: "muitos_anuncios",
                        };

                        const socialMediaMap: Record<string, string> = {
                          "sem frequencia": "sem_frequencia",
                          sem_frequencia: "sem_frequencia",
                          "parado/inexistente": "parado_inexistente",
                          parado_inexistente: "parado_inexistente",
                          "frequente/sem estrategia": "frequente_sem_estrategia",
                          frequente_sem_estrategia: "frequente_sem_estrategia",
                          "frequente/estruturado": "frequente_estruturado",
                          frequente_estruturado: "frequente_estruturado",
                        };

                        const lostReasonMap: Record<string, string> = {
                          "capacidade produtiva": "capacidade_produtiva",
                          capacidade_produtiva: "capacidade_produtiva",
                          orcamento: "orcamento",
                          orçamento: "orcamento",
                          desqualificado: "desqualificado",
                          "barrado pelo(a) sa": "barrado_pelo_sa",
                          barrado_pelo_sa: "barrado_pelo_sa",
                          "sem contato": "sem_contato",
                          sem_contato: "sem_contato",
                          "limite da franquia": "limite_da_franquia",
                          limite_da_franquia: "limite_da_franquia",
                          concorrencia: "concorrencia",
                          concorrência: "concorrencia",
                          "perda de contato": "perda_de_contato",
                          perda_de_contato: "perda_de_contato",
                          "cadencia excedida": "cadencia_excedida",
                          cadencia_excedida: "cadencia_excedida",
                          outros: "outros",
                        };

                        const toPrioridade = (v: string) => {
                          const s = normalize(v);
                          if (!s) return null;
                          if (s.includes("urgente")) return "urgente";
                          if (s.includes("alta")) return "alta";
                          if (s.includes("media") || s.includes("média")) return "media";
                          if (s.includes("baixa")) return "baixa";
                          return null;
                        };

                        const profileByName = (name: string) => {
                          const n = name.trim().toLowerCase();
                          const p = profiles.find(
                            (x) => x.full_name?.toLowerCase() === n || x.full_name?.toLowerCase().includes(n)
                          );
                          return p?.id ?? null;
                        };

                        const rowsToInsert: CreateLeadRow[] = csvRows.map((r) => {
                          const out: CreateLeadRow = {};
                          const meta: Record<string, unknown> = {};
                          for (const h of csvHeaders) {
                            const dest = csvMapping[h] ?? "ignore";
                            if (dest === "ignore") continue;
                            const raw = (r[h] ?? "").toString().trim();
                            if (!raw) continue;

                            switch (dest) {
                              case "cidade":
                                meta.cidade = raw;
                                break;
                              case "value":
                                out.value = toNum(raw);
                                break;
                              case "prioridade":
                                out.prioridade = toPrioridade(raw);
                                break;
                              case "first_contact_date":
                                out.first_contact_date = toDate(raw);
                                break;
                              case "last_contact_date":
                                out.last_contact_date = toDate(raw);
                                break;
                              case "product_service":
                                out.product_service = mapEnum(raw, productServiceMap);
                                break;
                              case "contact_origin":
                                out.contact_origin = mapEnum(raw, contactOriginMap);
                                break;
                              case "gmn_status":
                                out.gmn_status = mapEnum(raw, gmnStatusMap);
                                break;
                              case "google_ads_level":
                                out.google_ads_level = mapEnum(raw, adsLevelMap);
                                break;
                              case "meta_ads_level":
                                out.meta_ads_level = mapEnum(raw, adsLevelMap);
                                break;
                              case "social_media_status":
                                out.social_media_status = mapEnum(raw, socialMediaMap);
                                break;
                              case "lost_reason":
                                out.lost_reason = mapEnum(raw, lostReasonMap);
                                break;
                              case "temperature": {
                                const n = parseInt(raw, 10);
                                out.temperature = Number.isNaN(n) ? 0 : Math.max(0, Math.min(3, n));
                                break;
                              }
                              case "cadence": {
                                const n = parseInt(raw.replace(/[^\d-]/g, ""), 10);
                                out.cadence = Number.isNaN(n) ? raw : String(Math.max(0, n));
                                break;
                              }
                              case "cpf_cnpj":
                                out.cpf_cnpj = raw.replace(/[^\d]/g, "");
                                break;
                              case "decision_maker":
                                out.decision_maker = toBool(raw);
                                break;
                              case "decision_maker_phone":
                                out.decision_maker_phone = raw.replace(/[^\d]/g, "");
                                break;
                              case "phone":
                                out.phone = raw.replace(/[^\d]/g, "") || raw;
                                break;
                              default:
                                (out as Record<string, unknown>)[dest] = raw;
                                break;
                            }
                          }
                          if (Object.keys(meta).length > 0) out.metadata = meta;
                          // Inject lista's estado into metadata if not already set from CSV
                          const listaForImport = csvListaId ? listas.find((l) => l.id === csvListaId) : null;
                          if (listaForImport?.estado && !meta.estado) {
                            out.metadata = { ...((out.metadata as Record<string, unknown>) ?? {}), estado: listaForImport.estado };
                          }
                          return out;
                        });

                        setCsvImporting(true);
                        try {
                          const result = await importLeadsMapped(rowsToInsert, profileByName, csvListaId ?? undefined);
                          setCsvImportResult(result);
                        } catch (err) {
                          setCsvImportResult({
                            created: 0,
                            errors: [err instanceof Error ? err.message : "Erro ao importar CSV."],
                          });
                        } finally {
                          setCsvImporting(false);
                        }
                      }}
                    >
                      {csvImporting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importando...
                        </>
                      ) : (
                        "Importar"
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <PinAuthDialog {...pinProps} />
    </div>
  );
}
