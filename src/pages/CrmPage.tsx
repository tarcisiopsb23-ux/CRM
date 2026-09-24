import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Plus, Upload, FileText, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Settings2, Columns3,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseCsvFile } from "@/lib/csvParser";
import type { Lead, CrmData, CrmPipeline, CrmStage, CrmCustomField } from "@/components/crm/types";
import { KanbanColumn } from "@/components/crm/KanbanColumn";
import { LeadCard } from "@/components/crm/LeadCard";
import { LeadForm } from "@/components/crm/LeadForm";
import { PipelineSettingsModal } from "@/components/crm/PipelineSettingsModal";
import { CustomFieldsSettingsModal } from "@/components/crm/CustomFieldsSettingsModal";

// ─── CSV Import ───────────────────────────────────────────────────────────────
const CRM_FIELDS = [
  { value: "name",            label: "Nome" },
  { value: "phone",           label: "Telefone" },
  { value: "email",           label: "E-mail" },
  { value: "address",         label: "Endereço" },
  { value: "company",         label: "Empresa" },
  { value: "origin",          label: "Origem" },
  { value: "notes",           label: "Observações" },
  { value: "proposal_value",  label: "Valor Proposta" },
  { value: "potential_value", label: "Valor Potencial" },
  { value: "temperature",     label: "Temperatura" },
];
const IGNORE_VALUE = "__ignore__";
type CsvStep = "upload" | "mapping" | "importing" | "done";
type ImportReport = { total: number; success: number; skipped: { row: number; reason: string }[] };

// ─── helpers ──────────────────────────────────────────────────────────────────
function getSession() {
  try { return JSON.parse(localStorage.getItem("client_auth") ?? "{}"); } catch { return {}; }
}

// Converte a cor hex da stage em classe Tailwind de borda superior
function stageColorToBorder(hex: string): string {
  const map: Record<string, string> = {
    "#6366f1": "border-t-indigo-500",
    "#3b82f6": "border-t-blue-500",
    "#06b6d4": "border-t-cyan-500",
    "#f59e0b": "border-t-amber-500",
    "#f97316": "border-t-orange-500",
    "#ec4899": "border-t-pink-500",
    "#10b981": "border-t-emerald-500",
    "#ef4444": "border-t-red-500",
    "#64748b": "border-t-slate-500",
    "#84cc16": "border-t-lime-500",
  };
  return map[hex] ?? "border-t-indigo-500";
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function CrmPage() {
  const navigate = useNavigate();

  // ── Estado de dados ──
  const [leads, setLeads]           = useState<Lead[]>([]);
  const [crmData, setCrmData]       = useState<CrmData>({ pipelines: [], stages: [], custom_fields: [] });
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [crmLoading, setCrmLoading] = useState(true);

  // ── Estado de UI ──
  const [dialogOpen, setDialogOpen]               = useState(false);
  const [editing, setEditing]                     = useState<Lead | null>(null);
  const [activeLead, setActiveLead]               = useState<Lead | null>(null);
  const [pipelineSettingsOpen, setPipelineSettingsOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen]   = useState(false);

  // ── Estado CSV ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvOpen, setCsvOpen]       = useState(false);
  const [csvStep, setCsvStep]       = useState<CsvStep>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvRows, setCsvRows]       = useState<Record<string, string>[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvReport, setCsvReport]   = useState<ImportReport | null>(null);
  const [csvError, setCsvError]     = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ── Pipeline ativo (stages filtradas) ──
  const activeStages: CrmStage[] = activePipelineId
    ? crmData.stages.filter(s => s.pipeline_id === activePipelineId).sort((a, b) => a.order - b.order)
    : [];

  const activePipeline: CrmPipeline | undefined =
    crmData.pipelines.find(p => p.id === activePipelineId);

  // ── Carrega estrutura do CRM (pipelines, stages, custom fields) ──
  const fetchCrmData = useCallback(async () => {
    const session = getSession();
    if (!session?.client_id) return;
    setCrmLoading(true);
    const { data, error } = await supabase.rpc("get_crm_data", { p_client_id: session.client_id });
    if (error) {
      toast.error("Erro ao carregar configuração do pipeline");
      setCrmLoading(false);
      return;
    }
    const result = data as CrmData;
    setCrmData(result);
    // Seleciona o pipeline padrão (ou o primeiro disponível)
    const def = result.pipelines.find(p => p.is_default) ?? result.pipelines[0];
    if (def) setActivePipelineId(def.id);
    setCrmLoading(false);
  }, []);

  // ── Carrega leads ──
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error("Erro ao carregar leads"); setLoading(false); return; }
    setLeads(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCrmData();
    fetchLeads();
  }, [fetchCrmData, fetchLeads]);

  // ── Salvar lead ──
  const handleSave = async (form: Omit<Lead, "id" | "created_at">) => {
    const session = getSession();
    if (!session?.client_id) { navigate("/login"); return; }

    const customValues = (form.custom_values ?? []).map(cv => ({
      field_id: cv.field_id,
      value: cv.value ?? null,
    }));

    const { data, error } = await supabase.rpc("save_crm_lead", {
      p_client_id:        session.client_id,
      p_lead_id:          editing?.id ?? null,
      p_name:             form.name,
      p_phone:            form.phone,
      p_email:            form.email,
      p_company:          form.company,
      p_address:          form.address,
      p_origin:           form.origin,
      p_temperature:      form.temperature,
      p_tags:             form.tags,
      p_pipeline_id:      form.pipeline_id ?? activePipelineId,
      p_stage_id:         form.stage_id ?? activeStages[0]?.id ?? null,
      p_status:           form.status ?? "novo",
      p_proposal_value:   form.proposal_value,
      p_potential_value:  form.potential_value,
      p_product_id:       form.product_id,
      p_product_name:     form.product_name,
      p_whatsapp_link:    form.whatsapp_link,
      p_last_contact_at:  form.last_contact_at,
      p_next_followup_at: form.next_followup_at,
      p_lost_reason:      form.lost_reason,
      p_notes:            form.notes,
      p_custom_values:    customValues,
    });

    if (error || !data?.success) {
      toast.error(data?.error ?? "Erro ao salvar lead");
      return;
    }

    toast.success(editing ? "Lead atualizado" : "Lead criado");
    setDialogOpen(false);
    setEditing(null);
    fetchLeads();
  };

  // ── Excluir lead ──
  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lead?")) return;
    const { error } = await supabase.from("crm_leads").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir lead"); return; }
    toast.success("Lead excluído");
    setLeads(prev => prev.filter(l => l.id !== id));
  };

  // ── Drag & Drop ──
  const handleDragStart = (e: DragStartEvent) => {
    setActiveLead(leads.find(l => l.id === e.active.id) ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = e;
    if (!over) return;
    const targetStageId = String(over.id);
    const lead = leads.find(l => l.id === active.id);
    if (!lead || lead.stage_id === targetStageId) return;

    // Atualiza localmente primeiro (UX otimista)
    setLeads(prev => prev.map(l =>
      l.id === lead.id ? { ...l, stage_id: targetStageId } : l
    ));

    const session = getSession();
    const { data, error } = await supabase.rpc("move_crm_lead", {
      p_client_id: session.client_id,
      p_lead_id:   lead.id,
      p_stage_id:  targetStageId,
    });

    if (error || !data?.success) {
      toast.error("Erro ao mover lead");
      // Reverte
      setLeads(prev => prev.map(l =>
        l.id === lead.id ? { ...l, stage_id: lead.stage_id } : l
      ));
    }
  };

  // ── Agrupar leads por stage ──
  const grouped = activeStages.reduce((acc, stage) => {
    acc[stage.id] = leads.filter(l =>
      l.pipeline_id === activePipelineId && l.stage_id === stage.id
    );
    return acc;
  }, {} as Record<string, Lead[]>);

  // Leads sem stage (ou de outros pipelines) ficam numa coluna "Sem etapa"
  const unstagedLeads = leads.filter(l =>
    l.pipeline_id === activePipelineId && !activeStages.find(s => s.id === l.stage_id)
  );

  // ── CSV helpers ──
  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    const result = await parseCsvFile(file);
    if (result.error || result.headers.length === 0) {
      setCsvError(result.error ?? "Arquivo vazio ou sem cabeçalhos.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setCsvHeaders(result.headers);
    setCsvPreview(result.rows.slice(0, 5));
    setCsvRows(result.rows);
    const autoMap: Record<string, string> = {};
    result.headers.forEach(h => {
      const match = CRM_FIELDS.find(f => f.value.toLowerCase() === h.toLowerCase());
      autoMap[h] = match ? match.value : IGNORE_VALUE;
    });
    setCsvMapping(autoMap);
    setCsvStep("mapping");
  };

  const handleCsvImport = async () => {
    const session = getSession();
    if (!session?.client_id) { navigate("/login"); return; }
    setCsvStep("importing");
    const skipped: ImportReport["skipped"] = [];
    let successCount = 0;
    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const record: Record<string, string | number | null> = {
        client_id:   session.client_id,
        pipeline_id: activePipelineId,
        stage_id:    activeStages[0]?.id ?? null,
        status:      "novo",
      };
      Object.entries(csvMapping).forEach(([col, field]) => {
        if (field === IGNORE_VALUE) return;
        const val = row[col]?.trim() ?? "";
        if (!val) return;
        if (field === "proposal_value" || field === "potential_value") {
          const n = parseFloat(val.replace(",", "."));
          record[field] = isNaN(n) ? null : n;
        } else { record[field] = val; }
      });
      if (!record["name"]) { skipped.push({ row: i + 2, reason: "Campo 'name' vazio" }); continue; }
      const { error } = await supabase.from("crm_leads").insert(record);
      if (error) skipped.push({ row: i + 2, reason: error.message });
      else successCount++;
    }
    setCsvReport({ total: csvRows.length, success: successCount, skipped });
    setCsvStep("done");
    toast.success(`${successCount} leads importados.`);
    fetchLeads();
  };

  const resetCsv = () => {
    setCsvStep("upload"); setCsvHeaders([]); setCsvPreview([]); setCsvRows([]);
    setCsvMapping({}); setCsvReport(null); setCsvError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeCsv = () => { resetCsv(); setCsvOpen(false); };

  // ── Render ──
  const isReady = !crmLoading;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-6">
      <div className="max-w-[1800px] mx-auto space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">CRM</h1>
            <p className="text-slate-400 text-sm">{leads.length} leads no total</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              onClick={() => setCustomFieldsOpen(true)}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white gap-2"
            >
              <Settings2 className="h-4 w-4" /> Campos
            </Button>
            <Button
              onClick={() => setPipelineSettingsOpen(true)}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white gap-2"
            >
              <Columns3 className="h-4 w-4" /> Pipeline
            </Button>
            <Button
              onClick={() => { resetCsv(); setCsvOpen(true); }}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white gap-2"
            >
              <Upload className="h-4 w-4" /> Importar CSV
            </Button>
            <Button
              onClick={() => { setEditing(null); setDialogOpen(true); }}
              className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2"
              disabled={!isReady || activeStages.length === 0}
            >
              <Plus className="h-4 w-4" /> Novo Lead
            </Button>
          </div>
        </div>

        {/* ── Seletor de Pipeline ── */}
        {isReady && crmData.pipelines.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">Funil:</span>
            <div className="flex gap-1 flex-wrap">
              {crmData.pipelines.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePipelineId(p.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                    activePipelineId === p.id
                      ? "bg-[#7C3AED] text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {p.name}
                  {p.is_default && <span className="ml-1 opacity-60">★</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Kanban ── */}
        {crmLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
          </div>
        ) : activeStages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Columns3 className="h-12 w-12 text-slate-700" />
            <p className="text-slate-400 font-bold">Nenhuma etapa configurada</p>
            <p className="text-slate-500 text-sm">Configure o pipeline para começar a usar o CRM.</p>
            <Button onClick={() => setPipelineSettingsOpen(true)} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2">
              <Settings2 className="h-4 w-4" /> Configurar Pipeline
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {activeStages.map(stage => (
                <KanbanColumn
                  key={stage.id}
                  col={{ id: stage.id, label: stage.name, color: stageColorToBorder(stage.color) }}
                  leads={grouped[stage.id] ?? []}
                  onEdit={l => { setEditing(l); setDialogOpen(true); }}
                  onDelete={handleDelete}
                />
              ))}
              {/* Coluna "Sem etapa" — leads órfãos que existiam antes do pipeline dinâmico */}
              {unstagedLeads.length > 0 && (
                <KanbanColumn
                  col={{ id: "__unstaged__", label: "Sem etapa", color: "border-t-slate-600" }}
                  leads={unstagedLeads}
                  onEdit={l => { setEditing(l); setDialogOpen(true); }}
                  onDelete={handleDelete}
                />
              )}
            </div>
            <DragOverlay>
              {activeLead && (
                <div className="opacity-90 rotate-1 scale-105 pointer-events-none">
                  <LeadCard lead={activeLead} onEdit={() => {}} onDelete={() => {}} isDragging />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* ── CSV Import Dialog ── */}
      <Dialog open={csvOpen} onOpenChange={open => { if (!open) closeCsv(); }}>
        <DialogContent className="bg-[#1E293B] border-slate-700 text-slate-100 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Upload className="h-5 w-5 text-[#7C3AED]" /> Importar Leads via CSV
            </DialogTitle>
          </DialogHeader>

          {csvStep === "upload" && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-[#7C3AED] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-300 font-bold">Clique para selecionar o arquivo CSV</p>
                <p className="text-slate-500 text-xs mt-1">Separadores: vírgula ou ponto-e-vírgula. Máx: 5 MB.</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
              {csvError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                  <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-400">{csvError}</p>
                </div>
              )}
            </div>
          )}

          {csvStep === "mapping" && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900/40">
                      {csvHeaders.map(h => (
                        <th key={h} className="text-left py-2 px-3 text-slate-400 font-black uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {csvPreview.map((row, i) => (
                      <tr key={i}>
                        {csvHeaders.map(h => (
                          <td key={h} className="py-2 px-3 text-slate-300 whitespace-nowrap max-w-[150px] truncate">
                            {row[h] || <span className="text-slate-600 italic">vazio</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-slate-500 text-xs">
                Total: <span className="text-slate-300 font-bold">{csvRows.length}</span> linhas
                {activePipeline && (
                  <span className="ml-2">→ importados para <span className="text-[#7C3AED] font-bold">{activePipeline.name}</span> / etapa <span className="text-[#7C3AED] font-bold">{activeStages[0]?.name}</span></span>
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {csvHeaders.map(header => (
                  <div key={header} className="space-y-1">
                    <Label className="text-slate-300 text-xs font-bold uppercase tracking-wide">{header}</Label>
                    <Select
                      value={csvMapping[header] ?? IGNORE_VALUE}
                      onValueChange={val => setCsvMapping(prev => ({ ...prev, [header]: val }))}
                    >
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-200 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                        <SelectItem value={IGNORE_VALUE} className="text-slate-500 focus:bg-slate-800">— Ignorar —</SelectItem>
                        {CRM_FIELDS.map(f => (
                          <SelectItem key={f.value} value={f.value} className="focus:bg-slate-800">{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={resetCsv}>
                  Voltar
                </Button>
                <Button className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold flex-1" onClick={handleCsvImport}>
                  Importar
                </Button>
              </div>
            </div>
          )}

          {csvStep === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-[#7C3AED]" />
              <p className="text-white font-bold">Importando leads...</p>
            </div>
          )}

          {csvStep === "done" && csvReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-900/50 border border-slate-700 p-4 text-center">
                  <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mb-1">Total</p>
                  <p className="text-3xl font-black text-white">{csvReport.total}</p>
                </div>
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                  <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mb-1">Importados</p>
                  <p className="text-3xl font-black text-emerald-400">{csvReport.success}</p>
                </div>
                <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-4 text-center">
                  <XCircle className="h-5 w-5 text-orange-400 mx-auto mb-1" />
                  <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mb-1">Ignorados</p>
                  <p className="text-3xl font-black text-orange-400">{csvReport.skipped.length}</p>
                </div>
              </div>
              {csvReport.skipped.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-800">
                  {csvReport.skipped.map((s, i) => (
                    <div key={i} className="flex gap-3 text-xs py-2 px-3">
                      <span className="text-slate-500 font-mono shrink-0">Linha {s.row}</span>
                      <span className="text-orange-300">{s.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={resetCsv}>
                  Nova Importação
                </Button>
                <Button className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold flex-1" onClick={closeCsv}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Lead Form ── */}
      <LeadForm
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing ?? null}
        stages={activeStages}
        customFields={crmData.custom_fields}
        defaultStageId={activeStages[0]?.id ?? null}
        defaultPipelineId={activePipelineId}
        onSave={handleSave}
      />

      {/* ── Pipeline Settings ── */}
      <PipelineSettingsModal
        open={pipelineSettingsOpen}
        onClose={() => setPipelineSettingsOpen(false)}
        crmData={crmData}
        onRefresh={fetchCrmData}
      />

      {/* ── Custom Fields Settings ── */}
      <CustomFieldsSettingsModal
        open={customFieldsOpen}
        onClose={() => setCustomFieldsOpen(false)}
        customFields={crmData.custom_fields}
        onRefresh={fetchCrmData}
      />
    </div>
  );
}
