import { useState, useEffect, useRef } from "react";
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { fireConversionEvents } from "@/lib/conversionEvents";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseCsvFile } from "@/lib/csvParser";
import { toast } from "sonner";
import { Plus, Clock, Users, CheckCircle2, DollarSign, MessageCircle, Upload, FileText, AlertTriangle, Loader2, XCircle } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Lead, LeadStatus } from "./types";
import { COLUMNS } from "./types";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";
import { LeadForm } from "./LeadForm";

const CRM_FIELDS = [
  { value: "name",            label: "Nome (name)" },
  { value: "phone",           label: "Telefone (phone)" },
  { value: "email",           label: "E-mail (email)" },
  { value: "address",         label: "Endereço (address)" },
  { value: "company",         label: "Empresa (company)" },
  { value: "origin",          label: "Origem (origin)" },
  { value: "notes",           label: "Observações (notes)" },
  { value: "proposal_value",  label: "Valor Proposta (proposal_value)" },
  { value: "potential_value", label: "Valor Potencial (potential_value)" },
  { value: "temperature",     label: "Temperatura (temperature)" },
  { value: "status",          label: "Status (status)" },
];
const IGNORE_VALUE = "__ignore__";
type CsvStep = "upload" | "mapping" | "importing" | "done";
type ImportReport = { total: number; success: number; skipped: { row: number; reason: string }[] };

interface CrmSectionProps {
  clientId: string;
  clientMetadata?: { gtm_id?: string | null; meta_pixel_id?: string | null; whatsapp_webhook_url?: string | null };
}

interface CrmStats {
  waPendentes: number;
  leadsAtivos: number;
  atendidosMes: number;
  fechadosMes: number;
  valorFechadosMes: number;
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
      <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 uppercase font-black tracking-widest truncate">{label}</p>
        <p className="text-2xl font-black text-white leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function CrmSection({ clientId: _clientId, clientMetadata }: CrmSectionProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [stats, setStats] = useState<CrmStats>({ waPendentes: 0, leadsAtivos: 0, atendidosMes: 0, fechadosMes: 0, valorFechadosMes: 0 });

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvStep, setCsvStep] = useState<CsvStep>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvReport, setCsvReport] = useState<ImportReport | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from("crm_leads").select("*").order("created_at", { ascending: false });
    if (error) { toast.error("Erro ao carregar leads"); return; }
    const all: Lead[] = data || [];
    setLeads(all);
    setLoading(false);

    // Calcular métricas do CRM
    const now = new Date();
    const mesInicio = format(startOfMonth(now), "yyyy-MM-dd");
    const mesFim = format(endOfMonth(now), "yyyy-MM-dd");

    const ativos = all.filter(l => !["fechado", "perdido"].includes(l.status)).length;
    const fechadosMes = all.filter(l =>
      l.status === "fechado" &&
      (l.updated_at ?? l.created_at) >= mesInicio &&
      (l.updated_at ?? l.created_at) <= mesFim + "T23:59:59"
    );
    const atendidosMes = all.filter(l =>
      l.last_contact_at && l.last_contact_at >= mesInicio
    ).length;
    const valorMes = fechadosMes.reduce((acc, l) => acc + (l.proposal_value ?? 0), 0);

    setStats(s => ({ ...s, leadsAtivos: ativos, atendidosMes, fechadosMes: fechadosMes.length, valorFechadosMes: valorMes }));
  };

  // Busca pendentes do WhatsApp
  useEffect(() => {
    const webhookUrl = clientMetadata?.whatsapp_webhook_url;
    if (!webhookUrl) return;
    fetch(`${webhookUrl.replace(/\/$/, "")}/api/contatos?status=pendente`)
      .then(r => r.json())
      .then((data: any[]) => setStats(s => ({ ...s, waPendentes: data.length })))
      .catch(() => {});
  }, [clientMetadata?.whatsapp_webhook_url]);

  useEffect(() => { fetchLeads(); }, []);

  const handleSave = async (form: Omit<Lead, "id" | "created_at">) => {
    if (editing) {
      const { error } = await supabase.from("crm_leads").update(form).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Lead atualizado");
      if (form.status === "fechado" && clientMetadata) fireConversionEvents(clientMetadata);
    } else {
      const { error } = await supabase.from("crm_leads").insert(form);
      if (error) { toast.error("Erro ao criar lead"); return; }
      toast.success("Lead criado");
      if (form.status === "fechado" && clientMetadata) fireConversionEvents(clientMetadata);
    }
    setDialogOpen(false);
    setEditing(null);
    fetchLeads();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lead?")) return;
    const { error } = await supabase.from("crm_leads").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Lead excluído");
    fetchLeads();
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveLead(leads.find((l) => l.id === e.active.id) ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = COLUMNS.find((c) => c.id === over.id)?.id;
    if (!newStatus || newStatus === leads.find((l) => l.id === active.id)?.status) return;
    setLeads((prev) => prev.map((l) => l.id === active.id ? { ...l, status: newStatus } : l));
    const { error } = await supabase.from("crm_leads").update({ status: newStatus }).eq("id", String(active.id));
    if (!error && newStatus === "fechado" && clientMetadata) fireConversionEvents(clientMetadata);
    // Rebusca para atualizar stats com updated_at correto do banco
    fetchLeads();
  };

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.id] = leads.filter((l) => l.status === c.id);
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const mesAtual = format(new Date(), "MMMM", { locale: ptBR });

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
    setCsvStep("importing");
    const skipped: ImportReport["skipped"] = [];
    let successCount = 0;
    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const record: Record<string, string | number | null> = {};
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">CRM</h2>
          <p className="text-slate-400 text-sm">{leads.length} leads no total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { resetCsv(); setCsvOpen(true); }}
            variant="outline" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white gap-2">
            <Upload className="h-4 w-4" /> Importar CSV
          </Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2">
            <Plus className="h-4 w-4" /> Novo Lead
          </Button>
        </div>
      </div>

      {/* Mini Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon={<Clock className="h-5 w-5 text-yellow-400" />}
          label="Pendentes WhatsApp"
          value={stats.waPendentes}
          sub="aguardando classificação"
        />
        <StatCard
          icon={<Users className="h-5 w-5 text-[#7C3AED]" />}
          label="Leads Ativos"
          value={stats.leadsAtivos}
          sub="em andamento no CRM"
        />
        <StatCard
          icon={<MessageCircle className="h-5 w-5 text-blue-400" />}
          label="Atendidos no Mês"
          value={stats.atendidosMes}
          sub={`contatos em ${mesAtual}`}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          label="Fechados no Mês"
          value={stats.fechadosMes}
          sub={`negócios em ${mesAtual}`}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-emerald-400" />}
          label="Valor Gerado"
          value={fmtCurrency(stats.valorFechadosMes)}
          sub={`fechamentos em ${mesAtual}`}
        />
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <KanbanColumn key={col.id} col={col} leads={grouped[col.id] ?? []}
                onEdit={(l) => { setEditing(l); setDialogOpen(true); }}
                onDelete={handleDelete}
              />
            ))}
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

      {/* CSV Import Dialog */}
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
      <Dialog open={csvOpen} onOpenChange={open => { if (!open) closeCsv(); }}>
        <DialogContent className="bg-[#1E293B] border-slate-700 text-slate-100 w-[80vw] max-w-[80vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Upload className="h-5 w-5 text-[#7C3AED]" /> Importar Leads via CSV
            </DialogTitle>
          </DialogHeader>

          {csvStep === "upload" && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-[#7C3AED] transition-colors"
                onClick={() => fileInputRef.current?.click()}>
                <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-300 font-bold">Clique para selecionar o arquivo CSV</p>
                <p className="text-slate-500 text-xs mt-1">Separadores: vírgula ou ponto-e-vírgula. Máx: 5 MB.</p>
              </div>
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
                      {csvHeaders.map(h => <th key={h} className="text-left py-2 px-3 text-slate-400 font-black uppercase tracking-wider whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {csvPreview.map((row, i) => (
                      <tr key={i}>
                        {csvHeaders.map(h => <td key={h} className="py-2 px-3 text-slate-300 whitespace-nowrap max-w-[150px] truncate">{row[h] || <span className="text-slate-600 italic">vazio</span>}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-slate-500 text-xs">Total: <span className="text-slate-300 font-bold">{csvRows.length}</span> linhas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {csvHeaders.map(header => (
                  <div key={header} className="space-y-1">
                    <Label className="text-slate-300 text-xs font-bold uppercase tracking-wide">{header}</Label>
                    <Select value={csvMapping[header] ?? IGNORE_VALUE} onValueChange={val => setCsvMapping(prev => ({ ...prev, [header]: val }))}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-200 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                        <SelectItem value={IGNORE_VALUE} className="text-slate-500 focus:bg-slate-800">— Ignorar —</SelectItem>
                        {CRM_FIELDS.map(f => <SelectItem key={f.value} value={f.value} className="focus:bg-slate-800">{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={resetCsv}>Voltar</Button>
                <Button className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold flex-1" onClick={handleCsvImport}>Importar</Button>
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
                <Button variant="outline" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={resetCsv}>Nova Importação</Button>
                <Button className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold flex-1" onClick={closeCsv}>Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LeadForm
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing ? {
          name: editing.name, phone: editing.phone, email: editing.email,
          company: editing.company, address: editing.address, origin: editing.origin,
          temperature: editing.temperature, proposal_value: editing.proposal_value,
          potential_value: editing.potential_value, product_id: editing.product_id,
          product_name: editing.product_name, whatsapp_link: editing.whatsapp_link,
          last_contact_at: editing.last_contact_at, next_followup_at: editing.next_followup_at,
          lost_reason: editing.lost_reason, tags: editing.tags, notes: editing.notes,
          status: editing.status,
        } : null}
        onSave={handleSave}
      />
    </div>
  );
}
