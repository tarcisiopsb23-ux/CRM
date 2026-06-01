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
  isBefore, 
  parseISO, 
  getYear,
  getMonth
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Plus, Calendar, TrendingUp, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { KPISummary } from "./KPISummary";
import { KPIImportExport } from "./KPIImportExport";

export function KPIActiveMonitoring({ organizationId, clientId, clientName, contractStartDate }: { organizationId: string, clientId: string, clientName?: string, contractStartDate: Date | null }) {
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
    return Array.from({ length: 5 }).map((_, i) => String(currentYear - 2 + i));
  }, []);

  const handleAddRegistry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKpiId) return;

    const refDate = startOfMonth(new Date(Number(selectedYear), Number(selectedMonth), 1));
    const refDateKey = format(refDate, "yyyy-MM-dd");

    if (contractStartDate && isBefore(refDate, contractStartDate)) {
      toast.error("Não é permitido registrar indicadores para meses anteriores ao início do contrato.", {
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
      await upsert.mutateAsync({ kpi_id: selectedKpiId, month_year: refDateKey, value: numValue });
      toast.success("Registro adicionado com sucesso!");
      setKpiValue("");
    } catch {
      toast.error("Erro ao salvar registro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (entry: ClientKPIHistory) => {
    setEditEntry(entry);
    setEditValue(String(entry.value));
    setEditMonthYear(entry.month_year);
  };

  const handleEdit = async () => {
    if (!editEntry) return;
    const cleanValue = editValue.replace(/[^\d.,]/g, "").replace(",", ".");
    const numValue = parseFloat(cleanValue);
    if (isNaN(numValue)) { toast.error("Valor inválido."); return; }
    setIsEditing(true);
    try {
      await update.mutateAsync({ id: editEntry.id, value: numValue, month_year: editMonthYear });
      toast.success("Registro atualizado!");
      setEditEntry(null);
    } catch {
      toast.error("Erro ao atualizar registro.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntryId) return;
    setIsDeleting(true);
    try {
      await remove.mutateAsync(deleteEntryId);
      toast.success("Registro excluído.");
      setDeleteEntryId(null);
    } catch {
      toast.error("Erro ao excluir registro.");
    } finally {
      setIsDeleting(false);
    }
  };

  const currentKpiHistory = useMemo(() => {
    if (!selectedKpiId) return [];
    return history
      .filter(h => h.kpi_id === selectedKpiId)
      .sort((a, b) => parseISO(b.month_year).getTime() - parseISO(a.month_year).getTime());
  }, [history, selectedKpiId]);

  const activeKpi = useMemo(() => kpis.find(k => k.id === selectedKpiId), [kpis, selectedKpiId]);

  const fmtValue = (value: number, unit: string) => fmtKpiValue(value, unit);

  if (loadingKPIs || loadingHistory) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-[#2D8CC7]" />
        <p className="text-sm text-muted-foreground font-medium">Carregando indicadores...</p>
      </div>
    );
  }

  if (kpis.length === 0) {
    return (
      <Card className="bg-muted/20 border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20" />
          <div className="text-center space-y-1">
            <h3 className="font-bold text-lg text-slate-700">Nenhum Indicador para Monitorar</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Selecione os indicadores na aba <strong>Configurações</strong> para começar o acompanhamento mensal.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Botões de importação/exportação */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Registros a partir de {contractStartDate ? format(contractStartDate, "MMMM/yyyy", { locale: ptBR }) : "início do contrato"}
        </p>
        <KPIImportExport
          kpis={kpis}
          clientName={clientName ?? ""}
          mode="post"
          contractStartDate={contractStartDate}
          onUpsert={async (kpiId, monthYear, value) => {
            await upsert.mutateAsync({ kpi_id: kpiId, month_year: monthYear, value, client_id: clientId, organization_id: organizationId });
          }}
        />
      </div>

      <Tabs value={selectedKpiId} onValueChange={setSelectedKpiId} className="w-full">
        <div className="flex overflow-x-auto pb-2 scrollbar-none">
          <TabsList className="bg-muted/50 p-1 h-auto flex-nowrap">
            <TabsTrigger value="resumo" className="px-4 py-2 text-xs font-bold uppercase tracking-tight data-[state=active]:bg-[#2D8CC7] data-[state=active]:text-white transition-all whitespace-nowrap">
              Resumo Geral
            </TabsTrigger>
            {kpis.map(kpi => (
              <TabsTrigger key={kpi.id} value={kpi.id} className="px-4 py-2 text-xs font-bold uppercase tracking-tight data-[state=active]:bg-[#2D8CC7] data-[state=active]:text-white transition-all whitespace-nowrap">
                {kpi.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="resumo" className="mt-6">
          <KPISummary organizationId={organizationId} clientId={clientId} contractStartDate={contractStartDate} mode="active" />
        </TabsContent>

        {kpis.map(kpi => (
          <TabsContent key={kpi.id} value={kpi.id} className="mt-6 space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader className="py-4 border-b bg-muted/5">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#2D8CC7]" />
                  Novo Registro: {kpi.name}
                </CardTitle>
                <CardDescription>Registre o resultado alcançado neste indicador para o mês selecionado.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleAddRegistry} className="flex flex-wrap items-end gap-4">
                  <div className="space-y-2 min-w-[150px]">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">Mês</label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="h-10 bg-muted/20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 min-w-[100px]">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">Ano</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="h-10 bg-muted/20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
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
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Registrar
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm overflow-hidden">
              <CardHeader className="py-4 border-b bg-muted/5">
                <CardTitle className="text-base">Relatório de Evolução</CardTitle>
                <CardDescription>Todos os resultados registrados para este indicador.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="font-black uppercase text-[10px] text-slate-500">Mês de Referência</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Resultado</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-slate-500 text-center">Status</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-slate-500 text-right">Ações</TableHead>
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
                              {fmtValue(entry.value, kpi.unit)}
                            </TableCell>
                            <TableCell className="text-center">
                              {isPreContract ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-700">Histórico Pré</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-700">Vigência</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-[#2D8CC7]" onClick={() => openEdit(entry)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteEntryId(entry.id)}>
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

      {/* Dialog de Edição */}
      <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Registro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Mês de Referência</label>
              <Select value={editMonthYear ? String(getMonth(parseISO(editMonthYear))) : ""} onValueChange={(m) => {
                if (!editMonthYear) return;
                const y = getYear(parseISO(editMonthYear));
                setEditMonthYear(format(startOfMonth(new Date(y, Number(m), 1)), "yyyy-MM-dd"));
              }}>
                <SelectTrigger className="h-10 bg-muted/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Ano</label>
              <Select value={editMonthYear ? String(getYear(parseISO(editMonthYear))) : ""} onValueChange={(y) => {
                if (!editMonthYear) return;
                const m = getMonth(parseISO(editMonthYear));
                setEditMonthYear(format(startOfMonth(new Date(Number(y), m, 1)), "yyyy-MM-dd"));
              }}>
                <SelectTrigger className="h-10 bg-muted/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Valor</label>
              {editEntry && kpis.find(k => k.id === editEntry.kpi_id)?.unit === 'percentage'
                ? <PercentInput value={editValue} onChange={setEditValue} className="h-10 bg-muted/20 font-bold" placeholder="0,00" />
                : <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-10 bg-muted/20 font-bold" placeholder="0,00" />
              }
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancelar</Button>
            <Button className="bg-[#2D8CC7] hover:bg-[#2D8CC7]/90" onClick={handleEdit} disabled={isEditing}>
              {isEditing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de Exclusão */}
      <AlertDialog open={!!deleteEntryId} onOpenChange={(open) => { if (!open) setDeleteEntryId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Registro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
