import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { Input } from "@/components/ui/input";
import { format, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const UNIT_LABELS: Record<string, string> = {
  currency: "R$",
  percentage: "%",
  number: "#",
};

function fmtVal(v: number, unit: string) {
  if (unit === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  if (unit === "percentage") return `${v.toFixed(1)}%`;
  return new Intl.NumberFormat("pt-BR").format(v);
}

interface Props { clientId: string; }

export function KpiHistoryTable({ clientId }: Props) {
  const { data: allKpis = [] } = useClientKPIs(clientId);
  const { data: history = [], upsert } = useClientKPIHistory(clientId);

  const [editingCell, setEditingCell] = useState<{ kpiId: string; month: string } | null>(null);
  const [cellInput, setCellInput] = useState("");

  // Only show active KPIs (not prefixed with [inativo])
  const kpis = allKpis.filter(k => !k.name.startsWith("[inativo] "));

  // Build month columns: from the earliest KPI creation date to now
  const now = new Date();
  const earliestCreated = kpis.length > 0
    ? kpis.reduce((min, k) => k.created_at < min ? k.created_at : min, kpis[0].created_at)
    : now.toISOString();

  const startDate = parseISO(earliestCreated);
  const monthsDiff = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
  const totalMonths = Math.min(Math.max(monthsDiff + 1, 1), 24); // max 24 months

  const months = Array.from({ length: totalMonths }).map((_, i) => {
    const d = subMonths(now, totalMonths - 1 - i);
    return { key: format(d, "yyyy-MM"), label: format(d, "MMM/yy", { locale: ptBR }) };
  });

  const startCell = (kpiId: string, month: string) => {
    const existing = history.find(h => h.kpi_id === kpiId && String(h.month_year).startsWith(month));
    setCellInput(existing?.value?.toString() ?? "");
    setEditingCell({ kpiId, month });
  };

  const saveCell = async () => {
    if (!editingCell) return;
    const v = parseFloat(cellInput.replace(",", "."));
    if (isNaN(v)) { setEditingCell(null); return; }
    try {
      await upsert.mutateAsync({
        kpi_id: editingCell.kpiId,
        month_year: editingCell.month,
        value: v,
        client_id: clientId,
      });
    } catch { toast.error("Erro ao salvar valor"); }
    setEditingCell(null);
  };

  if (kpis.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 text-center">
        <p className="text-slate-500 text-sm font-bold">Nenhum KPI ativo</p>
        <p className="text-slate-600 text-xs mt-1">Cadastre KPIs no bloco acima para registrar resultados aqui</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/40">
            <th className="text-left text-[10px] uppercase font-black tracking-widest text-slate-500 py-3 px-4 sticky left-0 bg-slate-900/90 min-w-[160px]">
              Indicador
            </th>
            <th className="text-center text-[10px] uppercase font-black tracking-widest text-slate-500 py-3 px-3 whitespace-nowrap">
              Meta
            </th>
            {months.map(m => (
              <th key={m.key} className="text-center text-[10px] uppercase font-black tracking-widest text-slate-500 py-3 px-3 whitespace-nowrap min-w-[90px]">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kpis.map(kpi => (
            <tr key={kpi.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
              <td className="py-3 px-4 sticky left-0 bg-[#1E293B]">
                <p className="text-sm font-bold text-white">{kpi.name}</p>
                <p className="text-[10px] text-slate-600 uppercase font-bold">{UNIT_LABELS[kpi.unit]}</p>
              </td>
              <td className="py-3 px-3 text-center">
                <span className="text-xs font-bold text-slate-400">
                  {kpi.target_value !== null ? fmtVal(kpi.target_value, kpi.unit) : <span className="text-slate-700">—</span>}
                </span>
              </td>
              {months.map(({ key }) => {
                const existing = history.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(key));
                const isEditing = editingCell?.kpiId === kpi.id && editingCell?.month === key;

                // Only show cells from the month the KPI was created onwards
                const kpiCreatedMonth = format(parseISO(kpi.created_at), "yyyy-MM");
                const isBeforeCreation = key < kpiCreatedMonth;

                return (
                  <td key={key} className="py-3 px-3 text-center">
                    {isBeforeCreation ? (
                      <span className="text-slate-800 text-xs">—</span>
                    ) : isEditing ? (
                      <div className="flex items-center gap-1 justify-center">
                        <Input
                          value={cellInput}
                          onChange={e => setCellInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveCell(); if (e.key === "Escape") setEditingCell(null); }}
                          className="h-7 w-20 bg-slate-900 border-slate-600 text-white text-xs font-mono text-center"
                          autoFocus
                        />
                        <button onClick={saveCell} className="text-emerald-400 hover:text-emerald-300"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingCell(null)} className="text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startCell(kpi.id, key)}
                        className="text-xs font-bold hover:text-white transition-colors w-full text-center px-1 py-0.5 rounded hover:bg-slate-700/50"
                        style={{ color: existing ? "#e2e8f0" : "#374151" }}
                        title="Clique para editar"
                      >
                        {existing ? fmtVal(existing.value, kpi.unit) : <span className="text-slate-700">—</span>}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-600 p-3">
        Clique em qualquer célula para registrar ou editar o resultado. Enter para salvar, Esc para cancelar.
        Células com "—" cinza escuro indicam meses anteriores ao cadastro do KPI.
      </p>
    </div>
  );
}
