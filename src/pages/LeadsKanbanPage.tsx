import { useMemo, useState } from "react";
import { KanbanBoard, LeadDetailsModal, LeadsListView } from "@/components/kanban";
import { NovoLeadDialog } from "@/components/kanban/NovoLeadDialog";
import { useLeadsKanban, type CreateLeadInput, type CreateLeadRow } from "@/hooks/useLeadsKanban";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Flame, CheckCircle2, Plus, Loader2, Upload, LayoutList, Kanban as KanbanIcon, Search } from "lucide-react";
import { fetchAddressByCep } from "@/lib/viacep";
import { parseCsvText } from "@/lib/parseCsv";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { formatPhoneBR } from "@/lib/formatters";
import type { Lead, EtapaKanban, LeadWithResponsavel } from "@/types/database";

export function LeadsKanbanPage() {
  const organizationId = useOrganization();
  const { leads, loading, error, updateEtapaKanban, createLead, updateLead, removeLead, importLeadsMapped } =
    useLeadsKanban(organizationId);
  const { data: profiles = [] } = useProfiles(organizationId);

  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [novoLeadOpen, setNovoLeadOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{ created: number; errors: string[] } | null>(null);
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
    google_ads_level: "" as "" | "sem_anuncios" | "poucos_anuncios" | "muitos_anuncios",
    meta_ads_level: "" as "" | "sem_anuncios" | "poucos_anuncios" | "muitos_anuncios",
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
    value: "",
    prioridade: "media" as "baixa" | "media" | "alta" | "urgente",
    assigned_to: "" as string | undefined,
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
    setCsvImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (!parsed.headers.length) {
        toast.error("CSV vazio ou inválido.");
        setCsvImporting(false);
        e.target.value = "";
        return;
      }
      setCsvHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setCsvMapping(Object.fromEntries(parsed.headers.map((h) => [h, "ignore"])));
      setCsvOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ler CSV.");
    } finally {
      setCsvImporting(false);
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
      value: typeof lead.value === "number" ? String(lead.value) : "",
      prioridade: ((lead.prioridade as "baixa" | "media" | "alta" | "urgente") ?? "media"),
      assigned_to: lead.assigned_to ?? "",
      notes: lead.notes ?? "",
      first_contact_date: lead.first_contact_date ?? "",
      last_contact_date: lead.last_contact_date ?? "",
      product_service: lead.product_service ?? "",
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

      <Tabs defaultValue="leads" className="w-full">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="prequal">Pré-qualificação</TabsTrigger>
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
            />
          ) : (
            <LeadsListView
              leads={leads}
              onDetalhes={handleDetalhes}
              onEdit={(l) => {
                setEditing(l);
                setEditForm({
                  company: l.company ?? "",
                  name: l.name ?? "",
                  email: l.email ?? "",
                  phone: l.phone ?? "",
                  nicho: l.nicho ?? "",
                  source: l.source ?? "",
                  value: String(l.value ?? ""),
                  prioridade: ((l.prioridade as "baixa" | "media" | "alta" | "urgente") ?? "media"),
                  assigned_to: l.assigned_to ?? "",
                });
              }}
              onDelete={(id) => {
                if (window.confirm("Excluir este lead?")) removeLead(id);
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
            <div className="overflow-x-auto">
              <Table className="border-separate border-spacing-0 min-w-[3000px]">
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                  <TableRow className="bg-background hover:bg-background">
                    <TableHead className="sticky left-0 z-20 bg-background border-b border-r w-[250px] shadow-[2px_0_4px_rgba(0,0,0,0.05)]">Empresa / Contato</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Responsável</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Decisor</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Nicho</TableHead>
                    <TableHead className="bg-background border-b w-[100px]">Prioridade</TableHead>
                    <TableHead className="bg-background border-b w-[120px]">Temperatura</TableHead>
                    <TableHead className="bg-background border-b w-[100px]">Cadência</TableHead>
                    <TableHead className="bg-background border-b w-[120px]">Tempo de Vida</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Valor</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Origem</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Cidade</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Produto/Serviço</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">CPF/CNPJ</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Origem Contato</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Status GMN</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Google Ads</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Meta Ads</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Social Media</TableHead>
                    <TableHead className="bg-background border-b w-[150px]">Status Pré-qual</TableHead>
                    <TableHead className="sticky right-0 z-20 bg-background border-b border-l w-[220px] shadow-[-4px_0_4px_rgba(0,0,0,0.05)] text-center">Ações</TableHead>
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
                        <TableRow key={lead.id} className="hover:bg-muted/50 bg-background transition-colors group">
                          <TableCell className="sticky left-0 z-10 bg-background border-r font-medium group-hover:bg-muted/50 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                            <div className="font-medium truncate w-[230px]" title={lead.company || "—"}>{lead.company || "—"}</div>
                            <div className="text-xs text-muted-foreground truncate w-[230px]" title={lead.name}>
                              {lead.name || "—"}{contatoTelefone ? ` • ${contatoTelefone}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm">
                            {(lead as LeadWithResponsavel).responsavel?.full_name || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground bg-background group-hover:bg-transparent">
                            <div className="text-sm truncate w-[130px]" title={decisorNome}>{decisorNome}</div>
                            <div className="text-xs text-muted-foreground">{decisorTelefone || "—"}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground bg-background group-hover:bg-transparent truncate w-[130px]" title={lead.nicho || "—"}>
                            {lead.nicho || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent">
                            <Badge className={getPriorityColor(lead.prioridade)}>
                              {lead.prioridade || "média"}
                            </Badge>
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3].map((i) => (
                                <Flame
                                  key={i}
                                  className={i <= temp ? "h-4 w-4 text-orange-500" : "h-4 w-4 text-muted-foreground"}
                                />
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums bg-background group-hover:bg-transparent text-center">
                            {cadence ? String(cadence) : "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent">
                            <Badge variant="outline" className="text-xs">{getLifecycleDays(lead.created_at)} dias</Badge>
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm font-medium">
                            {typeof lead.value === "number" ? `R$ ${lead.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm truncate w-[130px]" title={lead.source || "—"}>
                            {lead.source || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm truncate w-[130px]" title={cidade}>
                            {cidade}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm capitalize">
                            {lead.product_service || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm">
                            {lead.cpf_cnpj || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm capitalize">
                            {lead.contact_origin?.replace("_", " ") || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm capitalize">
                            {lead.gmn_status?.replace("_", " ") || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm capitalize">
                            {lead.google_ads_level?.replace("_", " ") || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm capitalize">
                            {lead.meta_ads_level?.replace("_", " ") || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent text-sm capitalize">
                            {lead.social_media_status?.replace("_", " ") || "—"}
                          </TableCell>
                          <TableCell className="bg-background group-hover:bg-transparent">
                            {st.concluida ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">Pré-qualificado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                            )}
                          </TableCell>
                          <TableCell className="sticky right-0 z-10 text-right bg-background group-hover:bg-muted/50 border-l shadow-[-4px_0_4px_rgba(0,0,0,0.05)]">
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
      </Tabs>
      
      <LeadDetailsModal
        lead={selectedLead}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onEdit={(l) => {
          setEditing(l);
          setEditForm({
            company: l.company ?? "",
            name: l.name ?? "",
            email: l.email ?? "",
            phone: l.phone ?? "",
            nicho: l.nicho ?? "",
            source: l.source ?? "",
            value: String(l.value ?? ""),
            prioridade: ((l.prioridade as "baixa" | "media" | "alta" | "urgente") ?? "media"),
            assigned_to: l.assigned_to ?? "",
          });
          setModalOpen(false);
        }}
        onDelete={(id) => {
          if (window.confirm("Excluir este lead?")) removeLead(id);
          setModalOpen(false);
        }}
      />

      <NovoLeadDialog
        open={novoLeadOpen}
        onOpenChange={setNovoLeadOpen}
        onSubmit={handleCreateLead}
        profiles={profiles}
      />

      <Dialog open={!!preQualLead} onOpenChange={(o) => { if (!o) setPreQualLead(null); }}>
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
                  await updateLead(leadId, {
                    company: preQualLeadForm.company,
                    name: preQualLeadForm.name,
                    email: preQualLeadForm.email || null,
                    phone: preQualLeadForm.phone || null,
                    nicho: preQualLeadForm.nicho || null,
                    source: preQualLeadForm.source || null,
                    value: preQualLeadForm.value ? Number(preQualLeadForm.value) : null,
                    prioridade: preQualLeadForm.prioridade,
                    assigned_to: preQualLeadForm.assigned_to || null,
                    notes: preQualLeadForm.notes || null,
                    first_contact_date: preQualLeadForm.first_contact_date || null,
                    last_contact_date: preQualLeadForm.last_contact_date || null,
                    product_service: preQualLeadForm.product_service || null,
                    cpf_cnpj: preQualLeadForm.cpf_cnpj ? Number(preQualLeadForm.cpf_cnpj) : null,
                    contact_origin: preQualLeadForm.contact_origin || null,
                    decision_maker: preQualLeadForm.decision_maker,
                    decision_maker_name: preQualLeadForm.decision_maker_name || null,
                    decision_maker_phone: preQualLeadForm.decision_maker_phone ? Number(preQualLeadForm.decision_maker_phone) : null,
                    gbp_url: preQualLeadForm.gbp_url || null,
                    instagram_url: preQualLeadForm.instagram_url || null,
                    website_url: preQualLeadForm.website_url || null,
                    gmn_status: preQualLeadForm.gmn_status || null,
                    google_ads_level: preQualLeadForm.google_ads_level || null,
                    meta_ads_level: preQualLeadForm.meta_ads_level || null,
                    social_media_status: preQualLeadForm.social_media_status || null,
                    lost_reason: preQualLeadForm.lost_reason || null,
                    cadence: preQualLeadForm.cadence || null,
                    temperature: preQualLeadForm.temperature,
                    metadata: {
                      cidade: preQualLeadForm.cidade || null,
                      pre_qualificacao: {
                        concluida: true,
                        resultado: preQualForm.resultado,
                        notas: preQualForm.notas,
                        concluida_em: new Date().toISOString(),
                      },
                    },
                  } as Partial<Lead>);
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
                    <Label>CPF/CNPJ</Label>
                    <Input
                      value={preQualLeadForm.cpf_cnpj}
                      inputMode="numeric"
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, cpf_cnpj: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      value={preQualLeadForm.email}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, email: e.target.value })}
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
                    <Label>Primeiro Contato</Label>
                    <Input
                      type="date"
                      value={preQualLeadForm.first_contact_date}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, first_contact_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Nicho</Label>
                    <Input
                      value={preQualLeadForm.nicho}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, nicho: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Input
                      value={preQualLeadForm.source}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, source: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Último Contato</Label>
                    <Input
                      type="date"
                      value={preQualLeadForm.last_contact_date}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, last_contact_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <div className="relative">
                      <Input
                        placeholder="Pesquisar CEP..."
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.replace(/\D/g, "").length === 8) {
                            handleCepSearch(val);
                          }
                        }}
                      />
                      {searchingCep && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input
                      value={preQualLeadForm.cidade}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, cidade: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      type="number"
                      value={preQualLeadForm.value}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, value: e.target.value })}
                    />
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
                        <SelectItem value="assessoria">Assessoria</SelectItem>
                        <SelectItem value="consultoria">Consultoria</SelectItem>
                        <SelectItem value="gmn">GMN</SelectItem>
                        <SelectItem value="site">Site</SelectItem>
                        <SelectItem value="agente_ia">Agente IA</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
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
                    <Label>Decisor</Label>
                    <div className="flex items-center gap-2 h-10">
                      <Switch
                        checked={preQualLeadForm.decision_maker}
                        onCheckedChange={(checked) =>
                          setPreQualLeadForm({ ...preQualLeadForm, decision_maker: checked })
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        {preQualLeadForm.decision_maker ? "Sim" : "Não"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Nome do Decisor</Label>
                    <Input
                      value={preQualLeadForm.decision_maker_name}
                      onChange={(e) =>
                        setPreQualLeadForm({ ...preQualLeadForm, decision_maker_name: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Telefone do Decisor</Label>
                    <Input
                      value={preQualLeadForm.decision_maker_phone}
                      inputMode="numeric"
                      onChange={(e) =>
                        setPreQualLeadForm({ ...preQualLeadForm, decision_maker_phone: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>GBP</Label>
                    <Input
                      type="url"
                      value={preQualLeadForm.gbp_url}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, gbp_url: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Instagram</Label>
                    <Input
                      type="url"
                      value={preQualLeadForm.instagram_url}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, instagram_url: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input
                      type="url"
                      value={preQualLeadForm.website_url}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, website_url: e.target.value })}
                    />
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
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nao_possui">Não possui</SelectItem>
                        <SelectItem value="desatualizado_desativado">Desatualizado/Desativado</SelectItem>
                        <SelectItem value="desatualizado">Desatualizado</SelectItem>
                        <SelectItem value="incompleto">Imcompleto</SelectItem>
                        <SelectItem value="completo">Completo</SelectItem>
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
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem_anuncios">Sem anúncios</SelectItem>
                        <SelectItem value="poucos_anuncios">Poucos anúncios</SelectItem>
                        <SelectItem value="muitos_anuncios">Muitos anúncios</SelectItem>
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
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem_anuncios">Sem anúncios</SelectItem>
                        <SelectItem value="poucos_anuncios">Poucos anúncios</SelectItem>
                        <SelectItem value="muitos_anuncios">Muitos anúncios</SelectItem>
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
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem_frequencia">Sem frequência</SelectItem>
                        <SelectItem value="parado_inexistente">Parado/Inexistente</SelectItem>
                        <SelectItem value="frequente_sem_estrategia">Frequente/Sem estratégia</SelectItem>
                        <SelectItem value="frequente_estruturado">Frequente/Estruturado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Motivo da Perda</Label>
                    <Select
                      value={preQualLeadForm.lost_reason}
                      onValueChange={(v) =>
                        setPreQualLeadForm({ ...preQualLeadForm, lost_reason: v as typeof preQualLeadForm.lost_reason })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="capacidade_produtiva">Capacidade produtiva</SelectItem>
                        <SelectItem value="orcamento">Orçamento</SelectItem>
                        <SelectItem value="desqualificado">Desqualificado</SelectItem>
                        <SelectItem value="barrado_pelo_sa">Barrado pelo(a) SA</SelectItem>
                        <SelectItem value="sem_contato">Sem contato</SelectItem>
                        <SelectItem value="limite_da_franquia">Limite da franquia</SelectItem>
                        <SelectItem value="concorrencia">Concorrência</SelectItem>
                        <SelectItem value="perda_de_contato">Perda de contato</SelectItem>
                        <SelectItem value="cadencia_excedida">Cadência excedida</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cadência</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const current = Number(preQualLeadForm.cadence || 0);
                          const safe = Number.isFinite(current) ? current : 0;
                          const next = Math.max(0, Math.floor(safe) - 1);
                          setPreQualLeadForm({ ...preQualLeadForm, cadence: String(next) });
                        }}
                        aria-label="Diminuir cadência"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        value={String(Math.max(0, Math.floor(Number(preQualLeadForm.cadence || 0) || 0)))}
                        readOnly
                        className="text-center"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const current = Number(preQualLeadForm.cadence || 0);
                          const safe = Number.isFinite(current) ? current : 0;
                          const next = Math.max(0, Math.floor(safe) + 1);
                          setPreQualLeadForm({ ...preQualLeadForm, cadence: String(next) });
                        }}
                        aria-label="Aumentar cadência"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                    </div>
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
                                ? "h-5 w-5 text-orange-500"
                                : "h-5 w-5 text-muted-foreground"
                            }
                          />
                        </button>
                      ))}
                      <span className="text-sm text-muted-foreground">{preQualLeadForm.temperature}/3</span>
                    </div>
                  </div>

                  <div className="md:col-span-3 space-y-2">
                    <Label>Observações do Lead</Label>
                    <Textarea
                      value={preQualLeadForm.notes}
                      onChange={(e) => setPreQualLeadForm({ ...preQualLeadForm, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
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
                      await updateLead(leadId, {
                        company: preQualLeadForm.company,
                        name: preQualLeadForm.name,
                        email: preQualLeadForm.email || null,
                        phone: preQualLeadForm.phone || null,
                        nicho: preQualLeadForm.nicho || null,
                        source: preQualLeadForm.source || null,
                        value: preQualLeadForm.value ? Number(preQualLeadForm.value) : null,
                        prioridade: preQualLeadForm.prioridade,
                        assigned_to: preQualLeadForm.assigned_to || null,
                        notes: preQualLeadForm.notes || null,
                        first_contact_date: preQualLeadForm.first_contact_date || null,
                        last_contact_date: preQualLeadForm.last_contact_date || null,
                        product_service: preQualLeadForm.product_service || null,
                        cpf_cnpj: preQualLeadForm.cpf_cnpj ? Number(preQualLeadForm.cpf_cnpj) : null,
                        lost_reason: preQualLeadForm.lost_reason || null,
                        cadence: preQualLeadForm.cadence || null,
                        temperature: preQualLeadForm.temperature,
                        contact_origin: preQualLeadForm.contact_origin || null,
                        decision_maker: preQualLeadForm.decision_maker,
                        decision_maker_name: preQualLeadForm.decision_maker_name || null,
                        decision_maker_phone: preQualLeadForm.decision_maker_phone ? Number(preQualLeadForm.decision_maker_phone) : null,
                        gbp_url: preQualLeadForm.gbp_url || null,
                        instagram_url: preQualLeadForm.instagram_url || null,
                        website_url: preQualLeadForm.website_url || null,
                        gmn_status: preQualLeadForm.gmn_status || null,
                        google_ads_level: preQualLeadForm.google_ads_level || null,
                        meta_ads_level: preQualLeadForm.meta_ads_level || null,
                        social_media_status: preQualLeadForm.social_media_status || null,
                        metadata: {
                          cidade: preQualLeadForm.cidade || null,
                          pre_qualificacao: {
                            concluida: true,
                            resultado: preQualForm.resultado,
                            notas: preQualForm.notas,
                            concluida_em: new Date().toISOString(),
                          },
                        },
                      } as Partial<Lead>);
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Lead</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
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
                } as Partial<Lead>);
                setEditing(null);
              }}
              className="space-y-3"
            >
              <div>
                <Label>Empresa</Label>
                <Input value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
              </div>
              <div>
                <Label>Contato/Nome</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>E-mail</Label>
                  <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nicho</Label>
                  <Input value={editForm.nicho} onChange={(e) => setEditForm({ ...editForm, nicho: e.target.value })} />
                </div>
                <div>
                  <Label>Origem</Label>
                  <Input value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor (R$)</Label>
                  <Input type="number" value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} />
                </div>
                <div>
                  <Label>Prioridade</Label>
                  <Select value={editForm.prioridade} onValueChange={(v) => setEditForm({ ...editForm, prioridade: v as "baixa" | "media" | "alta" | "urgente" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={csvOpen}
        onOpenChange={(o) => {
          setCsvOpen(o);
          if (!o) {
            setCsvImportResult(null);
            setCsvRows([]);
            setCsvHeaders([]);
            setCsvMapping({});
          }
        }}
      >
        <DialogContent className="max-w-[80vw] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Leads via CSV</DialogTitle>
          </DialogHeader>

          {csvImportResult ? (
            <div className="space-y-4">
              <p className="text-sm">
                <strong>{csvImportResult.created}</strong> lead(s) importado(s) com sucesso.
              </p>
              {csvImportResult.errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-destructive mb-2">
                    {csvImportResult.errors.length} erro(s):
                  </p>
                  <ul className="text-sm text-muted-foreground max-h-64 overflow-y-auto space-y-1">
                    {csvImportResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={() => setCsvOpen(false)}>Fechar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {csvRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma linha encontrada no CSV.</div>
              ) : (
                <>
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
                    <Button type="button" variant="outline" onClick={() => setCsvOpen(false)}>
                      Cancelar
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
                          return out;
                        });

                        setCsvImporting(true);
                        try {
                          const result = await importLeadsMapped(rowsToInsert, profileByName);
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
    </div>
  );
}
