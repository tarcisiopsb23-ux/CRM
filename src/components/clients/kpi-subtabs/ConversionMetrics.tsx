import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, Save, Settings2, Plus, Pencil, Trash2,
  Users, ShoppingCart, Info, X, Tag,
} from "lucide-react";
import { format, startOfMonth, parseISO, getMonth, getYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useConversionMetricsConfig,
  useConversionMetricsEntries,
  type ConversionMetricsConfig,
  type ConversionMetricsEntry,
} from "@/hooks/useConversionMetrics";
import {
  useDistinctCampaignEventTypes,
  FIXED_CAMPAIGN_FIELDS,
} from "@/hooks/useDistinctCampaignEventTypes";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

// ─── Multi-select de campos de conversão ─────────────────────────────────────

interface FieldMultiSelectProps {
  label: string;
  icon: React.ReactNode;
  selectedFields: string[];
  onChange: (fields: string[]) => void;
  fixedOptions: typeof FIXED_CAMPAIGN_FIELDS;
  dynamicOptions: { label: string; platform: string | null }[];
  isLoadingDynamic: boolean;
  colorClass: string;
}

function FieldMultiSelect({
  label, icon, selectedFields, onChange,
  fixedOptions, dynamicOptions, isLoadingDynamic, colorClass,
}: FieldMultiSelectProps) {
  const toggle = (value: string) => {
    if (selectedFields.includes(value)) {
      onChange(selectedFields.filter(f => f !== value));
    } else {
      onChange([...selectedFields, value]);
    }
  };
  const clearAll = () => onChange([]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          {icon}{label}
        </label>
        {selectedFields.length > 0 && (
          <button onClick={clearAll}
            className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5 transition-colors">
            <X className="h-3 w-3" />Limpar
          </button>
        )}
      </div>

      {/* Selecionados */}
      {selectedFields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedFields.map(f => {
            const fixed = fixedOptions.find(o => o.value === f);
            const dynamic = dynamicOptions.find(o => o.label === f);
            const displayLabel = fixed?.label ?? dynamic?.label ?? f;
            return (
              <Badge key={f} variant="secondary"
                className={cn("text-[10px] font-bold gap-1 cursor-pointer", colorClass)}
                onClick={() => toggle(f)}>
                {displayLabel}
                <X className="h-2.5 w-2.5" />
              </Badge>
            );
          })}
        </div>
      )}

      {/* Opções fixas */}
      <div className="border rounded-lg overflow-hidden divide-y bg-muted/10">
        <p className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 bg-muted/30">
          Campos da Plataforma
        </p>
        {fixedOptions.map(opt => (
          <label key={opt.value}
            className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors">
            <Checkbox
              checked={selectedFields.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
              className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">{opt.label}</p>
              <p className="text-[11px] text-muted-foreground">{opt.description}</p>
            </div>
          </label>
        ))}

        {/* Opções dinâmicas */}
        {isLoadingDynamic ? (
          <div className="px-3 py-3 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando eventos do Pixel...
          </div>
        ) : dynamicOptions.length > 0 && (
          <>
            <p className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 bg-muted/30">
              Eventos do Pixel / Google Tag (dados reais)
            </p>
            {dynamicOptions.map(opt => (
              <label key={opt.label}
                className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors">
                <Checkbox
                  checked={selectedFields.includes(opt.label)}
                  onCheckedChange={() => toggle(opt.label)}
                  className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{opt.label}</p>
                    {opt.platform && (
                      <Badge variant="outline" className="text-[9px] uppercase shrink-0">
                        {opt.platform}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Evento registrado via {opt.platform ?? "campanha"}</p>
                </div>
              </label>
            ))}
          </>
        )}
      </div>

      {selectedFields.length === 0 && (
        <p className="text-[11px] text-muted-foreground flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
          Nenhum campo selecionado — esta métrica não aparecerá no funil do dashboard.
        </p>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

interface ConversionMetricsProps {
  organizationId: string;
  clientId: string;
}

export function ConversionMetrics({ organizationId, clientId }: ConversionMetricsProps) {
  const { data: config, isLoading: loadingConfig, save } = useConversionMetricsConfig(organizationId, clientId);
  const { entries, isLoading: loadingEntries, upsertEntry, removeEntry } = useConversionMetricsEntries(organizationId, clientId);
  const { data: eventTypes = [], isLoading: loadingEvents } = useDistinctCampaignEventTypes(clientId, organizationId);

  // Config local
  const [leadFields, setLeadFields] = useState<string[] | null>(null);
  const [saleFields, setSaleFields] = useState<string[] | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Registro manual
  const currentYear = getYear(new Date());
  const [regMonth, setRegMonth] = useState(String(getMonth(new Date())));
  const [regYear,  setRegYear]  = useState(String(currentYear));
  const [regLeads, setRegLeads] = useState("");
  const [regSales, setRegSales] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edição
  const [editEntry, setEditEntry] = useState<ConversionMetricsEntry | null>(null);
  const [editLeads, setEditLeads] = useState("");
  const [editSales, setEditSales] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Exclusão
  const [deleteMonth, setDeleteMonth] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const years = useMemo(() =>
    Array.from({ length: 5 }).map((_, i) => String(currentYear - 2 + i)), [currentYear]);

  // Usa estado local se já interagiu, senão usa config salva
  const resolvedLeadFields = leadFields ?? (config?.lead_fields ?? ["leads"]);
  const resolvedSaleFields  = saleFields  ?? (config?.sale_fields  ?? ["sales"]);

  // Opções dinâmicas sem os fixos (evita duplicação)
  const fixedValues = FIXED_CAMPAIGN_FIELDS.map(f => f.value);
  const dynamicOptions = eventTypes.filter(e => !fixedValues.includes(e.label as any));

  const hasManualLead = resolvedLeadFields.includes("manual");
  const hasManualSale = resolvedSaleFields.includes("manual");
  const showManualSection = hasManualLead || hasManualSale;

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const cfg: ConversionMetricsConfig = {
        lead_fields: resolvedLeadFields,
        sale_fields: resolvedSaleFields,
      };
      await save.mutateAsync(cfg);
      toast.success("Configuração salva com sucesso!");
    } catch {
      toast.error("Erro ao salvar configuração.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const leadsNum = regLeads ? parseFloat(regLeads) : null;
    const salesNum = regSales ? parseFloat(regSales) : null;
    if (hasManualLead && leadsNum === null) { toast.error("Informe o valor de leads."); return; }
    if (hasManualSale && salesNum === null) { toast.error("Informe o valor de vendas."); return; }
    const refDate = format(startOfMonth(new Date(Number(regYear), Number(regMonth), 1)), "yyyy-MM-dd");
    setIsSubmitting(true);
    try {
      await upsertEntry.mutateAsync({
        monthYear: refDate,
        leadsManual: hasManualLead ? leadsNum : null,
        salesManual: hasManualSale ? salesNum : null,
      });
      toast.success("Registro salvo!");
      setRegLeads(""); setRegSales("");
    } catch { toast.error("Erro ao salvar registro."); }
    finally { setIsSubmitting(false); }
  };

  const openEdit = (entry: ConversionMetricsEntry) => {
    setEditEntry(entry);
    setEditLeads(entry.leads_manual !== null ? String(entry.leads_manual) : "");
    setEditSales(entry.sales_manual !== null ? String(entry.sales_manual) : "");
  };

  const handleEdit = async () => {
    if (!editEntry) return;
    setIsEditing(true);
    try {
      await upsertEntry.mutateAsync({
        monthYear: editEntry.month_year,
        leadsManual: editLeads ? parseFloat(editLeads) : null,
        salesManual: editSales ? parseFloat(editSales) : null,
      });
      toast.success("Registro atualizado!");
      setEditEntry(null);
    } catch { toast.error("Erro ao atualizar registro."); }
    finally { setIsEditing(false); }
  };

  const handleDelete = async () => {
    if (!deleteMonth) return;
    setIsDeleting(true);
    try {
      await removeEntry.mutateAsync(deleteMonth);
      toast.success("Registro excluído.");
      setDeleteMonth(null);
    } catch { toast.error("Erro ao excluir registro."); }
    finally { setIsDeleting(false); }
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#2D8CC7]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── 1. CONFIGURAÇÃO DE MAPEAMENTO ── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/5">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-[#2D8CC7]" />
            <CardTitle className="text-base">Mapeamento de Métricas</CardTitle>
          </div>
          <CardDescription>
            Selecione quais campos ou eventos do Pixel/Google Tag representam Lead e Venda para este cliente.
            Pode selecionar múltiplos. Deixar em branco remove a métrica do funil.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FieldMultiSelect
              label="O que conta como Lead?"
              icon={<Users className="h-3.5 w-3.5 text-blue-500" />}
              selectedFields={resolvedLeadFields}
              onChange={setLeadFields}
              fixedOptions={[...FIXED_CAMPAIGN_FIELDS]}
              dynamicOptions={dynamicOptions}
              isLoadingDynamic={loadingEvents}
              colorClass="bg-blue-50 text-blue-700 border-blue-200"
            />
            <FieldMultiSelect
              label="O que conta como Venda / Compra?"
              icon={<ShoppingCart className="h-3.5 w-3.5 text-emerald-500" />}
              selectedFields={resolvedSaleFields}
              onChange={setSaleFields}
              fixedOptions={[...FIXED_CAMPAIGN_FIELDS]}
              dynamicOptions={dynamicOptions}
              isLoadingDynamic={loadingEvents}
              colorClass="bg-emerald-50 text-emerald-700 border-emerald-200"
            />
          </div>

          {loadingEvents && eventTypes.length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 shrink-0" />
              Os eventos reais do Pixel aparecerão após a primeira sincronização das campanhas.
            </div>
          )}

          <Button onClick={handleSaveConfig} disabled={isSavingConfig} className="bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 font-bold">
            {isSavingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Configuração
          </Button>
        </CardContent>
      </Card>

      {/* ── 2. REGISTRO MANUAL ── */}
      {showManualSection && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/5">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#2D8CC7]" />
              <CardTitle className="text-base">Registrar Valores Mensais</CardTitle>
            </div>
            <CardDescription>
              Preencha os valores do mês de referência. Salvar novamente sobrescreve o registro existente.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleAddEntry} className="flex flex-wrap items-end gap-4">
              <div className="space-y-2 min-w-[150px]">
                <label className="text-[10px] font-black uppercase text-muted-foreground">Mês</label>
                <Select value={regMonth} onValueChange={setRegMonth}>
                  <SelectTrigger className="h-10 bg-muted/20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-[100px]">
                <label className="text-[10px] font-black uppercase text-muted-foreground">Ano</label>
                <Select value={regYear} onValueChange={setRegYear}>
                  <SelectTrigger className="h-10 bg-muted/20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hasManualLead && (
                <div className="space-y-2 min-w-[140px]">
                  <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3 text-blue-500" />Leads
                  </label>
                  <Input placeholder="0" value={regLeads} onChange={e => setRegLeads(e.target.value)}
                    className="h-10 bg-muted/20 font-bold" type="number" min="0" />
                </div>
              )}
              {hasManualSale && (
                <div className="space-y-2 min-w-[140px]">
                  <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3 text-emerald-500" />Vendas / Compras
                  </label>
                  <Input placeholder="0" value={regSales} onChange={e => setRegSales(e.target.value)}
                    className="h-10 bg-muted/20 font-bold" type="number" min="0" />
                </div>
              )}
              <Button type="submit" disabled={isSubmitting} className="h-10 bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 font-bold px-6">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Registrar
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── 3. TABELA DE REGISTROS ── */}
      <Card className="border-border shadow-sm overflow-hidden">
        <CardHeader className="py-4 border-b bg-muted/5">
          <CardTitle className="text-base">Histórico de Registros Manuais</CardTitle>
          <CardDescription>Valores informados manualmente por mês de referência.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingEntries ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <ShoppingCart className="h-8 w-8 opacity-20" />
              <p className="text-sm text-center">
                {showManualSection
                  ? "Nenhum registro manual ainda. Use o formulário acima para adicionar."
                  : "Selecione 'Informar Manualmente' para registrar valores mensais."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500">Mês</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">
                    <span className="flex items-center justify-center gap-1"><Users className="h-3 w-3 text-blue-400" />Leads</span>
                  </TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">
                    <span className="flex items-center justify-center gap-1"><ShoppingCart className="h-3 w-3 text-emerald-400" />Vendas</span>
                  </TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">Taxa Conv.</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => {
                  const leads = entry.leads_manual;
                  const sales = entry.sales_manual;
                  const convRate = leads && leads > 0 && sales !== null
                    ? ((sales / leads) * 100).toFixed(1) + "%" : "—";
                  return (
                    <TableRow key={entry.month_year} className="hover:bg-muted/10 transition-colors">
                      <TableCell className="font-bold text-slate-700">
                        {format(parseISO(entry.month_year), "MMMM yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-center font-black text-slate-900">
                        {leads !== null ? leads.toLocaleString("pt-BR") : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center font-black text-slate-900">
                        {sales !== null ? sales.toLocaleString("pt-BR") : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn("font-bold text-sm", convRate !== "—" ? "text-emerald-600" : "text-slate-300")}>
                          {convRate}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-[#2D8CC7]"
                            onClick={() => openEdit(entry)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteMonth(entry.month_year)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog de Edição ── */}
      <Dialog open={!!editEntry} onOpenChange={open => { if (!open) setEditEntry(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Registro</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {editEntry && (
              <p className="text-sm font-bold text-slate-700">
                {format(parseISO(editEntry.month_year), "MMMM yyyy", { locale: ptBR })}
              </p>
            )}
            {hasManualLead && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3 text-blue-500" />Leads
                </label>
                <Input value={editLeads} onChange={e => setEditLeads(e.target.value)}
                  className="h-10 bg-muted/20 font-bold" type="number" min="0" />
              </div>
            )}
            {hasManualSale && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3 text-emerald-500" />Vendas / Compras
                </label>
                <Input value={editSales} onChange={e => setEditSales(e.target.value)}
                  className="h-10 bg-muted/20 font-bold" type="number" min="0" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancelar</Button>
            <Button className="bg-[#2D8CC7] hover:bg-[#2D8CC7]/90" onClick={handleEdit} disabled={isEditing}>
              {isEditing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog de Exclusão ── */}
      <AlertDialog open={!!deleteMonth} onOpenChange={open => { if (!open) setDeleteMonth(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Registro</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMonth && `Deseja excluir o registro de ${format(parseISO(deleteMonth), "MMMM yyyy", { locale: ptBR })}? Esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
