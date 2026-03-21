import { useMemo, useState } from "react";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Target, TrendingUp, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface KPIGoalsProps {
  organizationId: string;
  clientId: string;
}

export function KPIGoals({ organizationId, clientId }: KPIGoalsProps) {
  const qc = useQueryClient();
  const { data: kpis = [], isLoading: loadingKPIs } = useClientKPIs(organizationId, clientId);
  const { data: history = [], isLoading: loadingHistory } = useClientKPIHistory(organizationId, clientId);

  // growthInput: kpi.id -> string (percentual digitado pelo usuário)
  const [growthInput, setGrowthInput] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Calcula a média histórica de cada KPI (todos os registros)
  const avgByKpi = useMemo(() => {
    const map = new Map<string, number>();
    kpis.forEach(kpi => {
      const entries = history.filter(h => h.kpi_id === kpi.id);
      if (entries.length === 0) return;
      const avg = entries.reduce((acc, h) => acc + h.value, 0) / entries.length;
      map.set(kpi.id, avg);
    });
    return map;
  }, [kpis, history]);

  const fmt = (v: number, unit: string) =>
    unit === "currency"
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
      : unit === "percentage"
        ? `${v.toFixed(2)}%`
        : v % 1 === 0 ? String(v) : v.toFixed(2);

  const handleSave = async (kpiId: string) => {
    const pct = parseFloat(growthInput[kpiId] ?? "");
    const avg = avgByKpi.get(kpiId);
    if (isNaN(pct) || avg === undefined) return;

    const target = avg * (1 + pct / 100);
    setSaving(s => ({ ...s, [kpiId]: true }));
    try {
      const { error } = await supabase
        .from("client_kpis")
        .update({ target_value: target })
        .eq("id", kpiId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["client_kpis_v2", organizationId, clientId] });
      toast.success("Meta salva com sucesso!");
    } catch {
      toast.error("Erro ao salvar meta.");
    } finally {
      setSaving(s => ({ ...s, [kpiId]: false }));
    }
  };

  if (loadingKPIs || loadingHistory) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (kpis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Target className="h-10 w-10 opacity-20" />
        <p className="text-sm">Nenhum KPI configurado. Adicione indicadores na aba Configurações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[#2D8CC7]" />
            <CardTitle className="text-base">Definição de Metas</CardTitle>
          </div>
          <CardDescription>
            A média é calculada automaticamente com base em todos os registros históricos de cada indicador.
            Informe o crescimento esperado (%) para definir a meta.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Indicador", "Registros", "Média Histórica", "Crescimento Esperado (%)", "Meta Calculada", ""].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {kpis.map(kpi => {
                  const avg = avgByKpi.get(kpi.id);
                  const count = history.filter(h => h.kpi_id === kpi.id).length;
                  const pct = parseFloat(growthInput[kpi.id] ?? "");
                  const target = avg !== undefined && !isNaN(pct) ? avg * (1 + pct / 100) : null;
                  const savedTarget = (kpi as any).target_value ?? null;

                  return (
                    <tr key={kpi.id} className="hover:bg-muted/10 transition-colors">
                      {/* Nome */}
                      <td className="px-5 py-4">
                        <p className="text-sm font-bold">{kpi.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">{kpi.category}</p>
                      </td>

                      {/* Qtd registros */}
                      <td className="px-5 py-4 text-sm text-muted-foreground font-semibold">
                        {count > 0 ? `${count} mês${count > 1 ? "es" : ""}` : <span className="text-muted-foreground/40 italic text-xs">Sem dados</span>}
                      </td>

                      {/* Média histórica */}
                      <td className="px-5 py-4 text-sm font-black">
                        {avg !== undefined
                          ? fmt(avg, kpi.unit)
                          : <span className="text-muted-foreground/40 italic text-xs">—</span>}
                      </td>

                      {/* Input de crescimento */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 w-40">
                          <Input
                            type="number"
                            placeholder="Ex: 15"
                            value={growthInput[kpi.id] ?? ""}
                            onChange={e => setGrowthInput(s => ({ ...s, [kpi.id]: e.target.value }))}
                            className="h-8 text-sm bg-muted/20 w-24"
                            disabled={avg === undefined}
                          />
                          <span className="text-sm text-muted-foreground font-bold">%</span>
                        </div>
                      </td>

                      {/* Meta calculada */}
                      <td className="px-5 py-4">
                        {target !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-sm font-black text-emerald-600">{fmt(target, kpi.unit)}</span>
                            </div>
                          </div>
                        ) : savedTarget !== null ? (
                          <div className="flex items-center gap-1.5 bg-muted/30 border border-border rounded-lg px-3 py-1.5">
                            <span className="text-xs text-muted-foreground font-semibold">Meta atual:</span>
                            <span className="text-sm font-black">{fmt(savedTarget, kpi.unit)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs italic">Informe o crescimento</span>
                        )}
                      </td>

                      {/* Botão salvar */}
                      <td className="px-5 py-4">
                        <Button
                          size="sm"
                          className={cn("h-8 gap-1.5 text-xs font-bold", target !== null ? "bg-[#2D8CC7] hover:bg-[#2D8CC7]/90" : "")}
                          disabled={target === null || saving[kpi.id]}
                          onClick={() => handleSave(kpi.id)}
                          variant={target !== null ? "default" : "ghost"}
                        >
                          {saving[kpi.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Salvar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
