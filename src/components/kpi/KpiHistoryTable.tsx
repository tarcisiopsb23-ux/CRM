import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Pencil, Trash2, Plus } from "lucide-react";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const MONTHS_LIST = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: format(new Date(2024, i, 1), "MMMM", { locale: ptBR }),
}));

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - i));

function fmtVal(v: number, unit: string) {
  if (unit === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  if (unit === "percentage") return `${v.toFixed(1)}%`;
  return new Intl.NumberFormat("pt-BR").format(v);
}

const UNIT_LABELS: Record<string, string> = { currency: "R$", percentage: "%", number: "#" };

interface Props { clientId: string; }

export function KpiHistoryTable({ clientId }: Props) {
  const qc = useQueryClient();
  const { data: allKpis = [] } = useClientKPIs(clientId);
  const { data: history = [], upsert } = useClientKPIHistory(clientId);

  const kpis = allKpis.filter(k => !k.name.startsWith("[inativo] "));

  // Form state
  const [fKpiId, setFKpiId] = useState("");
  const [fMonth, setFMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [fYear, setFYear] = useState(String(CURRENT_YEAR));
  const [fValue, setFValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const selectedKpi = kpis.find(k => k.id === fKpiId);
  const monthYear = `${fYear}-${fMonth}`;
  const existingForForm = history.find(h => h.kpi_id === fKpiId && String(h.month_year).startsWith(monthYear));

  const handleAdd = async () => {
    if (!fKpiId) { toast.error("Selecione um indicador"); return; }
    const v = parseFloat(fValue.replace(",", "."));
    if (isNaN(v)) { toast.error("Valor inválido"); return; }
    setSaving(true);
    try {
      await upsert.mutateAsync({ kpi_id: fKpiId, month_year: monthYear, value: v, client_id: clientId });
      toast.success("Resultado registrado!");
      setFValue("");
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };

  const startEdit = (id: string, value: number) => {
    setEditingId(id);
    setEditValue(value.toString());
  };

  const saveEdit = async (id: string) => {
    const v = parseFloat(editValue.replace(",", "."));
    if (isNaN(v)) { setEditingId(null); return; }
    const { error } = await supabase.from("client_kpi_history").update({ value: v }).eq("id", id);
    if (error) { toast.error("Erro ao salvar"); return; }
    qc.invalidateQueries({ queryKey: ["client_kpi_history", clientId] });
    toast.success("Atualizado");
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    const { error } = await supabase.from("client_kpi_history").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    qc.invalidateQueries({ queryKey: ["client_kpi_history", clientId] });
    toast.success("Registro excluído");
  };

  // Build month columns from earliest KPI creation
  const now = new Date();
  const earliestCreated = kpis.length > 0
    ? kpis.reduce((min, k) => k.created_at < min ? k.created_at : min, kpis[0].created_at)
    : now.toISOString();
  const startDate = parseISO(earliestCreated);
  const monthsDiff = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
  const totalMonths = Math.min(Math.max(monthsDiff + 1, 1), 24);
  const months = Array.from({ length: totalMonths }, (_, i) => {
    const idx = totalMonths - 1 - i;
    const d = new Date(now.getFullYear(), now.getMonth() - idx, 1);
    return { key: format(d, "yyyy-MM"), label: format(d, "MMM/yy", { locale: ptBR }) };
  });

  if (kpis.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 text-center">
        <p className="text-slate-500 text-sm font-bold">Nenhum KPI ativo</p>
        <p className="text-slate-600 text-xs mt-1">Cadastre KPIs no bloco acima para registrar resultados aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Formulário de inclusão ── */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 space-y-3">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Incluir Resultado</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1 md:col-span-1">
            <Label className="text-slate-400 text-xs">Indicador</Label>
            <Select value={fKpiId} onValueChange={setFKpiId}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-9 text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                {kpis.map(k => <SelectItem key={k.id} value={k.id} className="focus:bg-slate-800">{k.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">Mês</Label>
            <Select value={fMonth} onValueChange={setFMonth}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                {MONTHS_LIST.map(m => <SelectItem key={m.value} value={m.value} className="focus:bg-slate-800 capitalize">{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">Ano</Label>
            <Select value={fYear} onValueChange={setFYear}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                {YEARS.map(y => <SelectItem key={y} value={y} className="focus:bg-slate-800">{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">
              Resultado {selectedKpi && <span className="text-slate-600">({UNIT_LABELS[selectedKpi.unit]})</span>}
            </Label>
            <Input value={fValue} onChange={e => setFValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              placeholder="0" className="bg-slate-900 border-slate-700 text-white h-9 text-sm font-mono" />
          </div>
        </div>
        {existingForForm && (
          <p className="text-[10px] text-amber-400">
            Já existe registro para este período: {fmtVal(existingForForm.value, selectedKpi?.unit ?? "number")}. Salvar irá substituir.
          </p>
        )}
        <button onClick={handleAdd} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold disabled:opacity-50 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          {saving ? "Salvando..." : "Incluir Resultado"}
        </button>
      </div>

      {/* ── Tabela ── */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/40">
              <th className="text-left text-[10px] uppercase font-black tracking-widest text-slate-500 py-3 px-4 sticky left-0 bg-slate-900/90 min-w-[160px]">Indicador</th>
              {months.map(m => (
                <th key={m.key} className="text-center text-[10px] uppercase font-black tracking-widest text-slate-500 py-3 px-3 whitespace-nowrap min-w-[110px]">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpis.map(kpi => {
              const kpiCreatedMonth = format(parseISO(kpi.created_at), "yyyy-MM");
              return (
                <tr key={kpi.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                  <td className="py-3 px-4 sticky left-0 bg-[#1E293B]">
                    <p className="text-sm font-bold text-white">{kpi.name}</p>
                    <p className="text-[10px] text-slate-600 uppercase font-bold">{UNIT_LABELS[kpi.unit]}</p>
                  </td>
                  {months.map(({ key }) => {
                    const rec = history.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(key));
                    const isBeforeCreation = key < kpiCreatedMonth;
                    const isEditing = editingId === rec?.id;

                    if (isBeforeCreation) return <td key={key} className="py-3 px-3 text-center"><span className="text-slate-800 text-xs">—</span></td>;

                    return (
                      <td key={key} className="py-3 px-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center gap-1 justify-center">
                            <Input value={editValue} onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveEdit(rec!.id); if (e.key === "Escape") setEditingId(null); }}
                              className="h-7 w-20 bg-slate-900 border-slate-600 text-white text-xs font-mono text-center" autoFocus />
                            <button onClick={() => saveEdit(rec!.id)} className="text-emerald-400 hover:text-emerald-300"><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : rec ? (
                          <div className="flex items-center justify-center gap-1 group">
                            <span className="text-xs font-bold text-slate-200">{fmtVal(rec.value, kpi.unit)}</span>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEdit(rec.id, rec.value)} className="p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white"><Pencil className="h-3 w-3" /></button>
                              <button onClick={() => handleDelete(rec.id)} className="p-0.5 rounded hover:bg-red-900/40 text-slate-600 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-600 p-3">Passe o mouse sobre um valor para editar ou excluir o registro.</p>
      </div>
    </div>
  );
}
