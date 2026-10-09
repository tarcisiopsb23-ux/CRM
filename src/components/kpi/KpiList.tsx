import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X, PowerOff, Power } from "lucide-react";
import { useClientKPIs, type ClientKPI } from "@/hooks/useClientKPIs";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UNIT_LABELS: Record<string, string> = {
  currency: "Moeda (R$)",
  percentage: "Percentual (%)",
  number: "Número",
};

interface Props { clientId: string; }

interface KpiForm {
  name: string;
  unit: "currency" | "percentage" | "number";
  target_value: string;
}

const emptyForm = (): KpiForm => ({ name: "", unit: "number", target_value: "" });

export function KpiList({ clientId }: Props) {
  const qc = useQueryClient();
  const { data: kpis = [], create, remove } = useClientKPIs(clientId);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<KpiForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<KpiForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    try {
      await create.mutateAsync({
        name: form.name.trim(),
        category: "Geral",
        unit: form.unit,
        is_predefined: false,
        target_value: (() => { const v = parseFloat(form.target_value.replace(",", ".")); return isNaN(v) ? null : v; })(),
      });
      toast.success("KPI criado");
      setForm(emptyForm());
      setShowAdd(false);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao criar KPI"); }
    finally { setSaving(false); }
  };

  const startEdit = (kpi: ClientKPI) => {
    setEditingId(kpi.id);
    setEditForm({ name: kpi.name, unit: kpi.unit, target_value: kpi.target_value?.toString() ?? "" });
  };

  const saveEdit = async (id: string) => {
    if (!editForm.name.trim()) { toast.error("Nome obrigatório"); return; }
    const target = parseFloat(editForm.target_value.replace(",", "."));
    const { error } = await supabase.from("client_kpis").update({
      name: editForm.name.trim(),
      unit: editForm.unit,
      target_value: isNaN(target) ? null : target,
    }).eq("id", id);
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success("KPI atualizado");
    qc.invalidateQueries({ queryKey: ["client_kpis", clientId] });
    setEditingId(null);
  };

  const toggleActive = async (kpi: ClientKPI) => {
    const newActive = !((kpi as any).active ?? false);
    // We use is_predefined as active flag workaround — or add a real active column
    // For now, we soft-delete by prefixing name with [inativo]
    const isCurrentlyInactive = kpi.name.startsWith("[inativo] ");
    const newName = isCurrentlyInactive
      ? kpi.name.replace("[inativo] ", "")
      : `[inativo] ${kpi.name}`;
    const { error } = await supabase.from("client_kpis").update({ name: newName }).eq("id", kpi.id);
    if (error) { toast.error("Erro ao alterar status"); return; }
    toast.success(isCurrentlyInactive ? "KPI reativado" : "KPI desativado");
    qc.invalidateQueries({ queryKey: ["client_kpis", clientId] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este KPI e todo o histórico de resultados?")) return;
    try {
      await remove.mutateAsync(id);
      toast.success("KPI excluído");
    } catch { toast.error("Erro ao excluir"); }
  };

  return (
    <div className="space-y-3">
      {/* KPI list */}
      {kpis.length === 0 && !showAdd ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-5 text-center">
          <p className="text-slate-500 text-sm font-bold">Nenhum KPI cadastrado</p>
          <p className="text-slate-600 text-xs mt-1">Clique em "Adicionar KPI" para começar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {kpis.map(kpi => {
            const inactive = kpi.name.startsWith("[inativo] ");
            const displayName = inactive ? kpi.name.replace("[inativo] ", "") : kpi.name;
            return (
              <div key={kpi.id} className={`rounded-lg border px-3 py-2.5 flex items-center gap-3 ${inactive ? "border-slate-800 bg-slate-900/20 opacity-60" : "border-slate-700 bg-slate-900/40"}`}>
                {editingId === kpi.id ? (
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="h-8 bg-slate-900 border-slate-600 text-white text-xs" placeholder="Nome" />
                    <Select value={editForm.unit} onValueChange={v => setEditForm(f => ({ ...f, unit: v as any }))}>
                      <SelectTrigger className="h-8 bg-slate-900 border-slate-600 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                        {Object.entries(UNIT_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="focus:bg-slate-800 text-xs">{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={editForm.target_value} onChange={e => setEditForm(f => ({ ...f, target_value: e.target.value }))}
                      className="h-8 bg-slate-900 border-slate-600 text-white text-xs" placeholder="Meta mensal" />
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${inactive ? "text-slate-500 line-through" : "text-white"}`}>{displayName}</p>
                    <p className="text-[10px] text-slate-600 uppercase font-bold">
                      {UNIT_LABELS[kpi.unit]}
                      {kpi.target_value !== null ? <span className="text-slate-500"> · Meta: {kpi.target_value}/mês</span> : <span className="text-slate-700"> · sem meta</span>}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {editingId === kpi.id ? (
                    <>
                      <button onClick={() => saveEdit(kpi.id)} className="p-1 rounded hover:bg-emerald-900/40 text-emerald-400"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-slate-700 text-slate-500"><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(kpi)} title="Editar" className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => toggleActive(kpi)} title={inactive ? "Reativar" : "Desativar"} className={`p-1 rounded ${inactive ? "hover:bg-emerald-900/40 text-slate-600 hover:text-emerald-400" : "hover:bg-amber-900/40 text-slate-500 hover:text-amber-400"}`}>
                        {inactive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => handleDelete(kpi.id)} title="Excluir" className="p-1 rounded hover:bg-red-900/40 text-slate-600 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-2">
          <div className="grid grid-cols-1 gap-2">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nome do indicador" className="h-9 bg-slate-900 border-slate-700 text-white text-sm" autoFocus />
            <div className="grid grid-cols-2 gap-2">
              <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v as any }))}>
                <SelectTrigger className="h-9 bg-slate-900 border-slate-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                  {Object.entries(UNIT_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="focus:bg-slate-800">{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                placeholder="Meta mensal (opcional)" className="h-9 bg-slate-900 border-slate-700 text-white text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="flex-1 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => { setShowAdd(false); setForm(emptyForm()); }}
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setShowAdd(v => !v)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-dashed border-slate-700 hover:border-[#7C3AED] text-slate-500 hover:text-[#7C3AED] text-xs font-bold transition-colors">
        <Plus className="h-3.5 w-3.5" /> Adicionar KPI
      </button>
    </div>
  );
}
