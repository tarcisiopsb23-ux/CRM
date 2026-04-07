import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, X, Target } from "lucide-react";
import { useClientKPIs, useClientKPIHistory, type ClientKPI } from "@/hooks/useClientKPIs";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const UNIT_LABELS: Record<string, string> = {
  currency: "Moeda (R$)",
  percentage: "Percentual (%)",
  number: "Número",
};

const MONTHS_BACK = 6;

function fmtVal(v: number, unit: string) {
  if (unit === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  if (unit === "percentage") return `${v.toFixed(1)}%`;
  return new Intl.NumberFormat("pt-BR").format(v);
}

interface KpiRowProps {
  kpi: ClientKPI;
  history: { month_year: string; value: number; id: string }[];
  onDelete: (id: string) => void;
  onUpsertHistory: (kpiId: string, monthYear: string, value: number) => void;
  onUpdateTarget: (kpiId: string, target: number | null) => void;
}

function KpiRow({ kpi, history, onDelete, onUpsertHistory, onUpdateTarget }: KpiRowProps) {
  const months = Array.from({ length: MONTHS_BACK }).map((_, i) => {
    const d = subMonths(new Date(), MONTHS_BACK - 1 - i);
    return { key: format(d, "yyyy-MM"), label: format(d, "MMM/yy", { locale: ptBR }) };
  });

  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(kpi.target_value?.toString() ?? "");
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [cellInput, setCellInput] = useState("");

  const saveTarget = () => {
    const v = parseFloat(targetInput.replace(",", "."));
    onUpdateTarget(kpi.id, isNaN(v) ? null : v);
    setEditingTarget(false);
  };

  const startCell = (monthKey: string) => {
    const existing = history.find(h => String(h.month_year).startsWith(monthKey));
    setCellInput(existing?.value?.toString() ?? "");
    setEditingCell(monthKey);
  };

  const saveCell = (monthKey: string) => {
    const v = parseFloat(cellInput.replace(",", "."));
    if (!isNaN(v)) onUpsertHistory(kpi.id, monthKey, v);
    setEditingCell(null);
  };

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
      <td className="py-3 px-3">
        <div>
          <p className="text-sm font-bold text-white">{kpi.name}</p>
          <p className="text-[10px] text-slate-500 uppercase font-bold">{UNIT_LABELS[kpi.unit]}</p>
        </div>
      </td>
      {/* Meta */}
      <td className="py-3 px-2 text-center">
        {editingTarget ? (
          <div className="flex items-center gap-1">
            <Input value={targetInput} onChange={e => setTargetInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveTarget(); if (e.key === "Escape") setEditingTarget(false); }}
              className="h-7 w-24 bg-slate-900 border-slate-600 text-white text-xs font-mono" autoFocus />
            <button onClick={saveTarget} className="text-emerald-400 hover:text-emerald-300"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditingTarget(false)} className="text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => { setTargetInput(kpi.target_value?.toString() ?? ""); setEditingTarget(true); }}
            className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 mx-auto">
            <Target className="h-3 w-3" />
            {kpi.target_value !== null ? fmtVal(kpi.target_value, kpi.unit) : <span className="text-slate-600 italic">definir</span>}
          </button>
        )}
      </td>
      {/* Monthly values */}
      {months.map(({ key }) => {
        const existing = history.find(h => String(h.month_year).startsWith(key));
        return (
          <td key={key} className="py-3 px-2 text-center">
            {editingCell === key ? (
              <div className="flex items-center gap-1">
                <Input value={cellInput} onChange={e => setCellInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveCell(key); if (e.key === "Escape") setEditingCell(null); }}
                  className="h-7 w-20 bg-slate-900 border-slate-600 text-white text-xs font-mono" autoFocus />
                <button onClick={() => saveCell(key)} className="text-emerald-400 hover:text-emerald-300"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => setEditingCell(null)} className="text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <button onClick={() => startCell(key)}
                className="text-xs font-bold hover:text-white transition-colors w-full text-center"
                style={{ color: existing ? "#e2e8f0" : "#475569" }}>
                {existing ? fmtVal(existing.value, kpi.unit) : <span className="text-slate-700">—</span>}
              </button>
            )}
          </td>
        );
      })}
      <td className="py-3 px-2 text-center">
        <button onClick={() => onDelete(kpi.id)}
          className="p-1 rounded hover:bg-red-900/40 text-slate-600 hover:text-red-400 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

interface Props { clientId: string; }

export function KpiManager({ clientId }: Props) {
  const qc = useQueryClient();
  const { data: kpis = [], create, remove } = useClientKPIs(clientId);
  const { data: history = [], upsert } = useClientKPIHistory(clientId);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<"currency" | "percentage" | "number">("number");
  const [saving, setSaving] = useState(false);

  const months = Array.from({ length: MONTHS_BACK }).map((_, i) => {
    const d = subMonths(new Date(), MONTHS_BACK - 1 - i);
    return { key: format(d, "yyyy-MM"), label: format(d, "MMM/yy", { locale: ptBR }) };
  });

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    try {
      await create.mutateAsync({ name: newName.trim(), category: "Geral", unit: newUnit, is_predefined: false });
      toast.success("KPI criado");
      setNewName(""); setShowForm(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar KPI");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este KPI e todo o histórico?")) return;
    try {
      await remove.mutateAsync(id);
      toast.success("KPI excluído");
    } catch { toast.error("Erro ao excluir"); }
  };

  const handleUpsertHistory = async (kpiId: string, monthYear: string, value: number) => {
    try {
      await upsert.mutateAsync({ kpi_id: kpiId, month_year: monthYear, value, client_id: clientId });
    } catch { toast.error("Erro ao salvar valor"); }
  };

  const handleUpdateTarget = async (kpiId: string, target: number | null) => {
    const { error } = await supabase.from("client_kpis").update({ target_value: target }).eq("id", kpiId);
    if (error) { toast.error("Erro ao salvar meta"); return; }
    toast.success("Meta atualizada");
    qc.invalidateQueries({ queryKey: ["client_kpis", clientId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Cadastre KPIs, defina metas e registre valores mensais. Alimentam os blocos de performance do dashboard.</p>
        <button onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold transition-colors shrink-0">
          <Plus className="h-3.5 w-3.5" /> Novo KPI
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Novo Indicador</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Nome</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="ex: Taxa de Conversão"
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Unidade</Label>
              <Select value={newUnit} onValueChange={v => setNewUnit(v as any)}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                  {Object.entries(UNIT_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v} className="focus:bg-slate-800">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50">
              {saving ? "Salvando..." : "Criar KPI"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {kpis.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 text-center">
          <p className="text-slate-500 text-sm font-bold">Nenhum KPI cadastrado</p>
          <p className="text-slate-600 text-xs mt-1">Clique em "Novo KPI" para começar</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40">
                <th className="text-left text-[10px] uppercase font-black tracking-widest text-slate-500 py-3 px-3">Indicador</th>
                <th className="text-center text-[10px] uppercase font-black tracking-widest text-slate-500 py-3 px-2">Meta</th>
                {months.map(m => (
                  <th key={m.key} className="text-center text-[10px] uppercase font-black tracking-widest text-slate-500 py-3 px-2 whitespace-nowrap">
                    {m.label}
                  </th>
                ))}
                <th className="py-3 px-2" />
              </tr>
            </thead>
            <tbody>
              {kpis.map(kpi => (
                <KpiRow key={kpi.id} kpi={kpi}
                  history={history.filter(h => h.kpi_id === kpi.id) as any}
                  onDelete={handleDelete}
                  onUpsertHistory={handleUpsertHistory}
                  onUpdateTarget={handleUpdateTarget}
                />
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-600 p-3">Clique em qualquer célula para editar. Enter para salvar, Esc para cancelar.</p>
        </div>
      )}
    </div>
  );
}
