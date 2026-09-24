import { useMemo } from "react";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  format, 
  startOfMonth, 
  parseISO, 
  isBefore,
  eachMonthOfInterval,
  subMonths
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, LayoutDashboard, History, TrendingUp } from "lucide-react";
import { fmtKpiValue } from "@/lib/formatters";

interface KPISummaryProps {
  organizationId: string;
  clientId: string;
  contractStartDate: Date | null;
  mode: 'active' | 'history';
}

export function KPISummary({ organizationId, clientId, contractStartDate, mode }: KPISummaryProps) {
  const { data: kpis = [], isLoading: loadingKPIs } = useClientKPIs(organizationId, clientId);
  const { data: history = [], isLoading: loadingHistory } = useClientKPIHistory(organizationId, clientId);

  // Determinar o intervalo de meses para exibir
  // Para 'active', os últimos 6 meses da vigência
  // Para 'history', os últimos 12 meses registrados como histórico
  const displayMonths = useMemo(() => {
    const now = startOfMonth(new Date());
    if (mode === 'active') {
      return Array.from({ length: 6 }).map((_, i) => subMonths(now, i)).reverse();
    } else {
      // Para histórico, vamos pegar os 12 meses anteriores ao contrato (ou os últimos 12 registros se não houver data)
      const baseDate = contractStartDate ? subMonths(contractStartDate, 1) : subMonths(now, 1);
      return Array.from({ length: 12 }).map((_, i) => subMonths(baseDate, i)).reverse();
    }
  }, [mode, contractStartDate]);

  const historyMap = useMemo(() => {
    const map = new Map<string, number>();
    history.forEach(h => {
      const monthKey = format(parseISO(h.month_year), "yyyy-MM");
      map.set(`${h.kpi_id}_${monthKey}`, h.value);
    });
    return map;
  }, [history]);

  if (loadingKPIs || loadingHistory) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (kpis.length === 0) return null;

  return (
    <Card className="border-border shadow-sm overflow-hidden animate-in fade-in duration-500">
      <CardHeader className="py-4 border-b bg-muted/5">
        <div className="flex items-center gap-2">
          {mode === 'active' ? (
            <TrendingUp className="h-4 w-4 text-[#2D8CC7]" />
          ) : (
            <History className="h-4 w-4 text-[#2D8CC7]" />
          )}
          <CardTitle className="text-base">
            {mode === 'active' ? 'Resumo de Performance (Vigência)' : 'Resumo do Histórico Anterior'}
          </CardTitle>
        </div>
        <CardDescription>
          Visão consolidada de todos os indicadores registrados.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="font-black uppercase text-[10px] text-slate-500 sticky left-0 bg-muted/30 min-w-[180px]">
                  Indicador
                </TableHead>
                {displayMonths.map(month => (
                  <TableHead key={month.toISOString()} className="font-black uppercase text-[10px] text-slate-500 text-center min-w-[100px]">
                    {format(month, "MMM/yy", { locale: ptBR })}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {kpis.map(kpi => (
                <TableRow key={kpi.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-bold text-slate-700 text-xs sticky left-0 bg-background border-r">
                    {kpi.name}
                  </TableCell>
                  {displayMonths.map(month => {
                    const monthKey = format(month, "yyyy-MM");
                    const val = historyMap.get(`${kpi.id}_${monthKey}`);
                    const isPreContract = contractStartDate ? isBefore(month, contractStartDate) : true;

                    // No modo active, só destaca se for vigência. No modo history, só se for pré.
                    const isCorrectPeriod = mode === 'active' ? !isPreContract : isPreContract;

                    return (
                      <TableCell key={monthKey} className="text-center text-xs">
                        {val !== undefined ? (
                          <span className={isCorrectPeriod ? "font-bold text-slate-900" : "text-muted-foreground/50 italic"}>
                            {fmtKpiValue(val, kpi.unit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/20">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
