import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, Plus } from "lucide-react";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
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

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
}

export function KpiResultDialog({ open, onClose, clientId }: Props) {
  const { data: allKpis = [] } = useClientKPIs(clientId);
  const { data: history = [], upsert } = useClientKPIHistory(clientId);

  const kpis = allKpis.filter(k => !k.name.startsWith("[inativo] "));

  const [kpiId, setKpiId] = useState("");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedKpi = kpis.find(k => k.id === kpiId);
  const monthYear = `${year}-${month}`;
  const existing = history.find(h => h.kpi_id === kpiId && String(h.month_year).startsWith(monthYear));

  const handleSave = async () => {
    if (!kpiId) { toast.error("Selecione um indicador"); return; }
    const v = parseFloat(value.replace(",", "."));
    if (isNaN(v)) { toast.error("Valor inválido"); return; }
    setSaving(true);
    try {
      await upsert.mutateAsync({ kpi_id: kpiId, month_year: monthYear, value: v, client_id: clientId });
      toast.success("Resultado registrado!");
      setValue("");
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#1E293B] border-slate-700 text-slate-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#7C3AED]" />
            Registrar Resultado de KPI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Indicador */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Indicador</Label>
            <Select value={kpiId} onValueChange={setKpiId}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-10">
                <SelectValue placeholder="Selecione o KPI..." />
              </SelectTrigger>
              <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                {kpis.map(k => (
                  <SelectItem key={k.id} value={k.id} className="focus:bg-slate-800">{k.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mês e Ano */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Mês</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                  {MONTHS.map(m => (
                    <SelectItem key={m.value} value={m.value} className="focus:bg-slate-800 capitalize">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Ano</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                  {YEARS.map(y => (
                    <SelectItem key={y} value={y} className="focus:bg-slate-800">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">
              Resultado
              {selectedKpi && <span className="text-slate-500 ml-1">({selectedKpi.unit === "currency" ? "R$" : selectedKpi.unit === "percentage" ? "%" : "#"})</span>}
            </Label>
            <Input
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              placeholder={existing ? `Atual: ${fmtVal(existing.value, selectedKpi?.unit ?? "number")}` : "0"}
              className="bg-slate-900 border-slate-700 text-white h-10 font-mono"
              autoFocus
            />
            {existing && (
              <p className="text-[10px] text-amber-400">
                Já existe um registro para este período: {fmtVal(existing.value, selectedKpi?.unit ?? "number")}. Salvar irá substituir.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold disabled:opacity-50 transition-colors">
              <Plus className="h-4 w-4" />
              {saving ? "Salvando..." : "Registrar"}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold transition-colors">
              Fechar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
