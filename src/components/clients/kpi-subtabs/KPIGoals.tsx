import { useMemo, useState } from "react";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { useContractsByClient } from "@/hooks/useContracts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Target, TrendingUp, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { parseISO, startOfMonth } from "date-fns";
import { fmtKpiValue } from "@/lib/formatters";

interface KPIGoalsProps {
  organizationId: string;
  clientId: string;
}

export function KPIGoals({ organizationId, clientId }: KPIGoalsProps) {
  const qc = useQueryClient();
  const { data: kpis = [], isLoading: loadingKPIs } = useClientKPIs(organizationId, clientId);
  const { data: history = [], isLoading: loadingHistory } = useClientKPIHistory(organizationId, clientId);
  const { data: contracts = [] } = useContractsByClient(organizationId, clientId);

  // growthInput: kpi.id -> string (percentual digitado pelo usuário)
  const [growthInput, setGrowthInput] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [monthsRef, setMonthsRef] = useState<number>(12);

  // Data de início do contrato de referência
  const contractStartDate = useMemo(() => {
    const ref = contracts.find(c => (c as any).is_dashboard_reference) ?? contracts[0] ?? null;
    if (!ref) return null;
    const raw = String(ref.contract_date ?? ref.start_date).substring(0, 10);
    return startOfMonth(parseISO(raw));
  }, [contracts]);

  // Média de referência: últimos N meses apenas do histórico ANTERIOR ao contrato
  // Se não houver histórico anterior, usa todos os registros disponíveis como fallback
  const avgByKpi = useMemo(() => {
    const map = new Map<string, { avg: number; count: number; isPreContract: boolean }>();
    kpis.forEach(kpi => {
      const allEntries = history
        .filter(h => h.kpi_id === kpi.id)
        .sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));

      if (allEntries.length === 0) return;

      // Filtra apenas histórico anterior ao contrato
      const preEntries = contractStartDate
        ? allEntries.filter(h => {
            const d = startOfMonth(parseISO(String(h.month_year).substring(0, 10)));
            return d < contractStartDate;
          })
        : [];

      // Usa pré-contrato se disponível, senão usa todos
      const source = preEntries.length > 0 ? preEntries : allEntries;
      const isPreContract = preEntries.length > 0;

      const sliced = source.slice(0, monthsRef);
      const avg = sliced.reduce((acc, h) => acc + Number(h.value), 0) / sliced.length;
      map.set(kpi.id, { avg, count: sliced.length, isPreContract });
    });
    return map;
  }, [kpis, history, monthsRef, contractStartDate]);

  const fmt = (v: number, unit: string) => fmtKpiValue(v, unit);

  const handleSave = async (kpiId: string) => {
    const pct = parseFloat(growthInput[kpiId] ?? "");
    const entry = avgByKpi.get(kpiId);
    if (isNaN(pct) || entry === undefined) return;

    const target = entry.avg * (1 + pct / 100);
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
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[#2D8CC7]" />
              <CardTitle className="text-base">Definição de Metas</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold whitespace-nowrap">Referência:</span>
              <Select value={String(monthsRef)} onValueChange={(v) => setMonthsRef(Number(v))}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Último mês</SelectItem>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                  <SelectItem value="6">Últimos 6 meses</SelectItem>
                  <SelectItem value="12">Últimos 12 meses</SelectItem>
                  <SelectItem value="24">Últimos 24 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <CardDescription>
            Média calculada com base {monthsRef === 1 ? "no último mês" : `nos últimos ${monthsRef} meses`} do histórico completo do indicador.
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
                  const entry = avgByKpi.get(kpi.id);
                  const avg = entry?.avg;
                  const count = entry?.count ?? 0;
                  const isPreContract = entry?.isPreContract;
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
                        {count > 0
                          ? <div>
                              <span>{count} mês{count > 1 ? "es" : ""}</span>
                              {contractStartDate && <p className="text-[9px] uppercase font-bold mt-0.5 text-muted-foreground/60">{isPreContract ? "pré-contrato" : "todos"}</p>}
                            </div>
                          : <span className="text-muted-foreground/40 italic text-xs">Sem dados</span>}
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
                          <PercentInput
                            placeholder="Ex: 15"
                            value={growthInput[kpi.id] ?? ""}
                            onChange={v => setGrowthInput(s => ({ ...s, [kpi.id]: v }))}
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
