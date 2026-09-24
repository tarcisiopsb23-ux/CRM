import { useState, useMemo, useEffect } from "react";
import { useClientKPIs, useClientKPIHistory, ClientKPIHistory } from "@/hooks/useClientKPIs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";
import { fmtKpiValue } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  format, 
  startOfMonth, 
  parseISO, 
  getYear, 
  getMonth,
  isBefore
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Save, History, AlertCircle, Calendar as CalendarIcon, Pencil, Trash2 } from "lucide-react";
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
import { KPIImportExport } from "./KPIImportExport";

export function KPIPreviousHistory({ organizationId, clientId, clientName, contractStartDate }: { organizationId: string, clientId: string, clientName?: string, contractStartDate: Date | null }) {
  const { data: kpis = [], isLoading: loadingKPIs } = useClientKPIs(organizationId, clientId);
  const { data: history = [], isLoading: loadingHistory, upsert, update, remove } = useClientKPIHistory(organizationId, clientId);
  
  const [selectedKpiId, setSelectedKpiId] = useState<string>("resumo");
  const [selectedMonth, setSelectedMonth] = useState<string>(String(getMonth(new Date())));
  const [selectedYear, setSelectedYear] = useState<string>(String(getYear(new Date())));
  const [kpiValue, setKpiValue] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado para dialog de edição
  const [editEntry, setEditEntry] = useState<ClientKPIHistory | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editMonthYear, setEditMonthYear] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);

  // Estado para dialog de exclusão
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleOpenEdit = (entry: ClientKPIHistory) => {
    setEditEntry(entry);
    setEditValue(String(entry.value));
    setEditMonthYear(entry.month_year);
  };

  const handleConfirmEdit = async () => {
    if (!editEntry) return;
    const numValue = parseFloat(editValue.replace(",", "."));
    if (isNaN(numValue)) {
      toast.error("Por favor, insira um valor válido.");
      return;
    }
    setIsEditing(true);
    try {
      await update.mutateAsync({ id: editEntry.id, value: numValue, month_year: editMonthYear });
      toast.success("Indicador atualizado com sucesso!");
      setEditEntry(null);
    } catch {
      toast.error("Erro ao atualizar indicador.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteEntryId) return;
    setIsDeleting(true);
    try {
      await remove.mutateAsync(deleteEntryId);
      toast.success("Indicador excluído com sucesso!");
      setDeleteEntryId(null);
    } catch {
      toast.error("Erro ao excluir indicador.");
    } finally {
      setIsDeleting(false);
    }
  };

  const currentKpiHistory = useMemo(() => {    if (!selectedKpiId) return [];
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
    <>
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div className="bg-[#2D8CC7]/10 border border-[#2D8CC7]/20 p-4 rounded-lg flex items-start gap-3 flex-1">
          <AlertCircle className="h-5 w-5 text-[#2D8CC7] mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#1e5a8a]">Histórico Pré-Contrato</p>
            <p className="text-xs text-[#2D8CC7] leading-relaxed">
              Utilize esta área para registrar os resultados do cliente <strong>antes</strong> do início da parceria. 
              Você pode preencher até 12 meses de dados históricos para cada indicador.
            </p>
          </div>
        </div>
        <div className="shrink-0 pt-1">
          <KPIImportExport
            kpis={kpis}
            clientName={clientName ?? ""}
            mode="pre"
            contractStartDate={contractStartDate}
            onUpsert={async (kpiId, monthYear, value) => {
              await upsert.mutateAsync({ kpi_id: kpiId, month_year: monthYear, value, client_id: clientId, organization_id: organizationId });
            }}
          />
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
                    {kpi.unit === 'percentage'
                      ? <PercentInput placeholder="0,00" value={kpiValue} onChange={setKpiValue} className="h-10 bg-muted/20 font-bold" />
                      : <Input placeholder="0,00" value={kpiValue} onChange={(e) => setKpiValue(e.target.value)} className="h-10 bg-muted/20 font-bold" />
                    }
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
                      <TableHead className="font-black uppercase text-[10px] text-slate-500 text-center w-20">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentKpiHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-sm">
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
                              {fmtKpiValue(entry.value, kpi.unit)}
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
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-slate-500 hover:text-[#2D8CC7]"
                                  onClick={() => handleOpenEdit(entry)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-slate-500 hover:text-red-600"
                                  onClick={() => setDeleteEntryId(entry.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
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

    {/* Dialog de Edição */}
    <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Indicador</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground">Mês/Ano (AAAA-MM-DD)</label>
            <Input
              value={editMonthYear}
              onChange={(e) => setEditMonthYear(e.target.value)}
              placeholder="2024-01-01"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground">Valor</label>
            {editEntry && kpis.find(k => k.id === editEntry.kpi_id)?.unit === 'percentage'
              ? <PercentInput value={editValue} onChange={setEditValue} placeholder="0,00" className="h-10 font-bold" />
              : <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="0,00" className="h-10 font-bold" />
            }
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditEntry(null)} disabled={isEditing}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmEdit} disabled={isEditing} className="bg-[#2D8CC7] hover:bg-[#2D8CC7]/90">
            {isEditing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* AlertDialog de Confirmação de Exclusão */}
    <AlertDialog open={!!deleteEntryId} onOpenChange={(open) => { if (!open) setDeleteEntryId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir indicador?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. O registro será removido permanentemente e o faturamento dinâmico será recalculado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
