import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Target } from "lucide-react";
import { useClientKPIs } from "@/hooks/useClientKPIs";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";

function fmtVal(v: number, unit: string) {
  if (unit === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  if (unit === "percentage") return `${v.toFixed(1)}%`;
  return new Intl.NumberFormat("pt-BR").format(v);
}

interface Props { clientId: string; }

export function KpiTargets({ clientId }: Props) {
  const qc = useQueryClient();
  const { data: allKpis = [] } = useClientKPIs(clientId);
  const kpis = allKpis.filter(k => !k.name.startsWith("[inativo] "));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const startEdit = (id: string, current: number | null) => {
    setEditingId(id);
    setInput(current?.toString() ?? "");
  };

  const save = async (id: string) => {
    const v = parseFloat(input.replace(",", "."));
    const { error } = await supabase.from("client_kpis")
      .update({ target_value: isNaN(v) ? null : v })
      .eq("id", id);
    if (error) { toast.error("Erro ao salvar meta"); return; }
    toast.success("Meta atualizada");
    qc.invalidateQueries({ queryKey: ["client_kpis", clientId] });
    setEditingId(null);
  };

  if (kpis.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 text-center">
        <p className="text-slate-600 text-xs">Cadastre KPIs no bloco acima para definir metas</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {kpis.map(kpi => (
        <div key={kpi.id} className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{kpi.name}</p>
          </div>
          {editingId === kpi.id ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") save(kpi.id); if (e.key === "Escape") setEditingId(null); }}
                className="h-7 w-28 bg-slate-900 border-slate-600 text-white text-xs font-mono"
                placeholder="Valor da meta"
                autoFocus
              />
              <button onClick={() => save(kpi.id)} className="text-emerald-400 hover:text-emerald-300"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <button
              onClick={() => startEdit(kpi.id, kpi.target_value)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <Target className="h-3.5 w-3.5 text-[#7C3AED]" />
              {kpi.target_value !== null
                ? fmtVal(kpi.target_value, kpi.unit)
                : <span className="text-slate-600 italic">Definir meta</span>
              }
            </button>
          )}
        </div>
      ))}
      <p className="text-[10px] text-slate-600">Clique no valor da meta para editar. Enter para salvar.</p>
    </div>
  );
}
