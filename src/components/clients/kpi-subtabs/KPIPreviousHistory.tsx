import { useState, useMemo, useEffect } from "react";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  format, 
  startOfMonth, 
  parseISO, 
  getYear, 
  getMonth,
  isBefore
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Save, History, AlertCircle, Calendar as CalendarIcon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { KPISummary } from "./KPISummary";

export function KPIPreviousHistory({ organizationId, clientId, contractStartDate }: { organizationId: string, clientId: string, contractStartDate: Date | null }) {
  const { data: kpis = [], isLoading: loadingKPIs } = useClientKPIs(organizationId, clientId);
  const { data: history = [], isLoading: loadingHistory, upsert } = useClientKPIHistory(organizationId, clientId);
  
  const [selectedKpiId, setSelectedKpiId] = useState<string>("resumo");
  const [selectedMonth, setSelectedMonth] = useState<string>(String(getMonth(new Date())));
  const [selectedYear, setSelectedYear] = useState<string>(String(getYear(new Date())));
  const [kpiValue, setKpiValue] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Definir KPI selecionado inicial se não for resumo e houver KPIs
  useEffect(() => {
    if (kpis.length > 0 && selectedKpiId !== "resumo" && !kpis.find(k => k.id === selectedKpiId)) {
      setSelectedKpiId("resumo");
    }
  }, [kpis, selectedKpiId]);

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const years = useMemo(() => {
    const currentYear = getYear(new Date());
    return Array.from({ length: 10 }).map((_, i) => String(currentYear - 5 + i));
  }, []);

  const handleAddRegistry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKpiId) return;

    const refDate = startOfMonth(new Date(Number(selectedYear), Number(selectedMonth), 1));
    const refDateKey = format(refDate, "yyyy-MM-dd");

    // REGRA: No histórico anterior, só permitimos datas ANTERIORES ao contrato
    if (contractStartDate && !isBefore(refDate, contractStartDate)) {
      toast.error("Este registro deve ser feito na aba 'Indicadores', pois a data é igual ou posterior ao início do contrato.", {
        description: `O contrato iniciou em ${format(contractStartDate, "MMMM yyyy", { locale: ptBR })}.`
      });
      return;
    }

    const cleanValue = kpiValue.replace(/[^\d.,]/g, "").replace(",", ".");
    const numValue = parseFloat(cleanValue);

    if (isNaN(numValue)) {
      toast.error("Por favor, insira um valor válido.");
      return;
    }

    setIsSubmitting(true);
    try {
      await upsert.mutateAsync({
        kpi_id: selectedKpiId,
        month_year: refDateKey,
        value: numValue
      });
      toast.success("Histórico registrado com sucesso!");
      setKpiValue("");
    } catch (err) {
      toast.error("Erro ao salvar histórico.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentKpiHistory = useMemo(() => {
    if (!selectedKpiId) return [];
    return history
      .filter(h => h.kpi_id === selectedKpiId)
      .sort((a, b) => parseISO(b.month_year).getTime() - parseISO(a.month_year).getTime());
  }, [history, selectedKpiId]);

  if (loadingKPIs || loadingHistory) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-[#2D8CC7]" />
        <p className="text-sm text-muted-foreground font-medium">Carregando histórico anterior...</p>
      </div>
    );
  }

  if (kpis.length === 0) {
    return (
      <Card className="bg-muted/20 border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <History className="h-12 w-12 text-muted-foreground opacity-20" />
          <div className="text-center space-y-1">
            <h3 className="font-bold text-lg text-slate-700">Nenhum Indicador Ativado</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Ative os indicadores em <strong>Configurações</strong> para registrar o histórico.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-[#2D8CC7]/10 border border-[#2D8CC7]/20 p-4 rounded-lg flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-[#2D8CC7] mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-[#1e5a8a]">Histórico Pré-Contrato</p>
          <p className="text-xs text-[#2D8CC7] leading-relaxed">
            Utilize esta área para registrar os resultados do cliente <strong>antes</strong> do início da parceria. 
            Você pode preencher até 12 meses de dados históricos para cada indicador.
          </p>
        </div>
      </div>

      <Tabs value={selectedKpiId} onValueChange={setSelectedKpiId} className="w-full">
        <div className="flex overflow-x-auto pb-2 scrollbar-none">
          <TabsList className="bg-muted/50 p-1 h-auto flex-nowrap">
            <TabsTrigger 
              value="resumo"
              className="px-4 py-2 text-xs font-bold uppercase tracking-tight data-[state=active]:bg-[#2D8CC7] data-[state=active]:text-white transition-all whitespace-nowrap"
            >
              Resumo Geral
            </TabsTrigger>
            {kpis.map(kpi => (
              <TabsTrigger 
                key={kpi.id} 
                value={kpi.id}
                className="px-4 py-2 text-xs font-bold uppercase tracking-tight data-[state=active]:bg-[#2D8CC7] data-[state=active]:text-white transition-all whitespace-nowrap"
              >
                {kpi.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="resumo" className="mt-6">
          <KPISummary 
            organizationId={organizationId} 
            clientId={clientId} 
            contractStartDate={contractStartDate}
            mode="history"
          />
        </TabsContent>

        {kpis.map(kpi => (
          <TabsContent key={kpi.id} value={kpi.id} className="mt-6 space-y-6">
            {/* Form de Registro Histórico */}
            <Card className="border-border shadow-sm">
              <CardHeader className="py-4 border-b bg-muted/5">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-[#2D8CC7]" />
                  Novo Registro de Histórico: {kpi.name}
                </CardTitle>
                <CardDescription>Registre dados históricos anteriores ao contrato.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleAddRegistry} className="flex flex-wrap items-end gap-4">
                  <div className="space-y-2 min-w-[150px]">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">Mês</label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="h-10 bg-muted/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((m, i) => (
                          <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 min-w-[100px]">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">Ano</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="h-10 bg-muted/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map(y => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 flex-1 min-w-[150px]">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">
                      Valor ({kpi.unit === 'currency' ? 'R$' : kpi.unit === 'percentage' ? '%' : 'Nº'})
                    </label>
                    <Input 
                      placeholder="0,00"
                      value={kpiValue}
                      onChange={(e) => setKpiValue(e.target.value)}
                      className="h-10 bg-muted/20 font-bold"
                    />
                  </div>

                  <Button type="submit" className="h-10 bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 px-6 font-bold" disabled={isSubmitting || !kpiValue}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Registrar Histórico
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Relatório de Histórico */}
            <Card className="border-border shadow-sm overflow-hidden">
              <CardHeader className="py-4 border-b bg-muted/5">
                <CardTitle className="text-base">Relatório de Histórico</CardTitle>
                <CardDescription>Todos os registros vinculados a este indicador.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="font-black uppercase text-[10px] text-slate-500">Mês de Referência</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Resultado</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-slate-500 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentKpiHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground text-sm">
                          Nenhum registro encontrado para este KPI.
                        </TableCell>
                      </TableRow>
                    ) : (
                      currentKpiHistory.map((entry) => {
                        const date = parseISO(entry.month_year);
                        const isPreContract = contractStartDate ? isBefore(date, contractStartDate) : false;
                        
                        return (
                          <TableRow key={entry.id} className="hover:bg-muted/10 transition-colors">
                            <TableCell className="font-bold text-slate-700">
                              {format(date, "MMMM yyyy", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="text-right font-black text-slate-900">
                              {kpi.unit === 'currency' 
                                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entry.value)
                                : kpi.unit === 'percentage'
                                  ? `${entry.value.toLocaleString('pt-BR')}%`
                                  : entry.value.toLocaleString('pt-BR')
                              }
                            </TableCell>
                            <TableCell className="text-center">
                              {isPreContract ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-700">
                                  Histórico Pré
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-700">
                                  Vigência
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
