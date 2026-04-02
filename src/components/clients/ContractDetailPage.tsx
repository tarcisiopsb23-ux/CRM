import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Pencil, PauseCircle, RotateCw, UserCheck, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ContractRow } from "@/hooks/useContracts";
import { usePayments } from "@/hooks/useFinancial";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const STATUS_BADGE: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  suspenso: "bg-yellow-100 text-yellow-700",
  cancelado: "bg-red-100 text-red-700",
  encerrado: "bg-slate-100 text-slate-600",
  pago: "bg-emerald-100 text-emerald-700",
  pendente: "bg-yellow-100 text-yellow-700",
};

interface Props {
  contract: ContractRow;
  organizationId: string;
  clientId: string;
  canEdit: boolean;
  canManageContracts: boolean;
  onBack: () => void;
  onEdit: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onEnd: () => void;
}

export function ContractDetailPage({
  contract, organizationId, clientId, canEdit, canManageContracts,
  onBack, onEdit, onSuspend, onReactivate, onEnd,
}: Props) {
  const paymentsQuery = usePayments(organizationId);

  const contractPayments = useMemo(() =>
    (paymentsQuery.data ?? [])
      .filter(p => p.contract_id === contract.id)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))),
    [paymentsQuery.data, contract.id]
  );

  // Receber pagamento
  const [receiveOpen, setReceiveOpen] = useState<any | null>(null);
  const [receiveValue, setReceiveValue] = useState("");
  const [receiveDate, setReceiveDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isReceiving, setIsReceiving] = useState(false);

  const handleReceive = async () => {
    if (!receiveOpen) return;
    const received = parseFloat(receiveValue);
    if (isNaN(received) || received <= 0) { toast.error("Informe um valor válido."); return; }
    setIsReceiving(true);
    try {
      const isPartial = received < receiveOpen.value;
      await paymentsQuery.updatePayment.mutateAsync({
        id: receiveOpen.id,
        value: received,
        status: "pago" as any,
        due_date: receiveDate,
        paid_at: new Date(receiveDate + "T12:00:00").toISOString(),
      });
      if (isPartial) {
        await paymentsQuery.create.mutateAsync({
          client_id: clientId,
          contract_id: contract.id,
          description: `${receiveOpen.description} (saldo restante)`,
          value: receiveOpen.value - received,
          due_date: receiveDate,
          status: "pendente",
        });
        toast.success(`Recebimento parcial registrado. Saldo de ${fmtCurrency(receiveOpen.value - received)} em aberto.`);
      } else {
        toast.success("Pagamento recebido!");
      }
      setReceiveOpen(null);
    } catch {
      toast.error("Erro ao registrar recebimento.");
    } finally {
      setIsReceiving(false);
    }
  };

  const meta = (contract.metadata ?? {}) as Record<string, any>;
  const contractType = meta.contract_type ?? "mensal";
  const notes = meta.notes ?? "";
  const recurringMethod = meta.recurring_payment_method ?? "";

  const totalPaid = contractPayments.filter(p => p.status === "pago").reduce((s, p) => s + p.value, 0);
  const totalPending = contractPayments.filter(p => p.status === "pendente").reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-bold">{contract.service_contracted || contract.title}</h2>
            <p className="text-sm text-muted-foreground">Detalhes do contrato</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {String(contract.status ?? "") === "ativo" && (
            <Button size="sm" variant="outline" onClick={onSuspend} disabled={!canManageContracts}>
              <PauseCircle className="h-4 w-4 mr-1" /> Suspender
            </Button>
          )}
          {String(contract.status ?? "") === "suspenso" && (
            <Button size="sm" variant="outline" onClick={onReactivate} disabled={!canManageContracts}>
              <RotateCw className="h-4 w-4 mr-1" /> Reativar
            </Button>
          )}
          {String(contract.status ?? "") !== "encerrado" && String(contract.status ?? "") !== "cancelado" && (
            <Button size="sm" variant="outline" onClick={onEnd} disabled={!canManageContracts}>
              <UserCheck className="h-4 w-4 mr-1" /> Encerrar
            </Button>
          )}
          <Button size="sm" onClick={onEdit} disabled={!canEdit}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        </div>
      </div>

      {/* Dados do contrato */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-3">
            Informações do Contrato
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[String(contract.status ?? "")] ?? "bg-muted text-muted-foreground"}`}>
              {contract.status ?? "—"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><p className="text-muted-foreground">Serviço</p><p className="font-semibold">{contract.service_contracted || "—"}</p></div>
            <div><p className="text-muted-foreground">Tipo</p><p className="font-semibold capitalize">{contractType}</p></div>
            <div><p className="text-muted-foreground">Título</p><p className="font-semibold">{contract.title}</p></div>
            <div><p className="text-muted-foreground">Data contratação</p><p className="font-semibold">{contract.contract_date ? format(parseISO(contract.contract_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</p></div>
            <div><p className="text-muted-foreground">Duração</p><p className="font-semibold">{contract.duration_months ? `${contract.duration_months} meses` : "—"}</p></div>
            <div><p className="text-muted-foreground">Encerramento</p><p className="font-semibold">{contract.end_date ? format(parseISO(contract.end_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</p></div>
            <div><p className="text-muted-foreground">1º pagamento</p><p className="font-semibold">{contract.first_payment_value ? fmtCurrency(contract.first_payment_value) : "—"}</p></div>
            <div><p className="text-muted-foreground">Data 1º pagamento</p><p className="font-semibold">{contract.first_payment_due_date ? format(parseISO(contract.first_payment_due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</p></div>
            <div><p className="text-muted-foreground">Forma 1º pagamento</p><p className="font-semibold capitalize">{contract.first_payment_method ?? "—"}</p></div>
            {contractType === "mensal" && <>
              <div><p className="text-muted-foreground">Valor mensal</p><p className="font-semibold">{contract.value ? fmtCurrency(contract.value) : "—"}</p></div>
              <div><p className="text-muted-foreground">Vencimento mensal</p><p className="font-semibold">{contract.recurring_due_date ? format(parseISO(contract.recurring_due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</p></div>
              <div><p className="text-muted-foreground">Forma mensal</p><p className="font-semibold capitalize">{recurringMethod || "—"}</p></div>
            </>}
            {notes && <div className="col-span-full"><p className="text-muted-foreground">Observação</p><p className="font-semibold">{notes}</p></div>}
          </div>
        </CardContent>
      </Card>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total recebido</p><p className="text-xl font-bold text-emerald-600">{fmtCurrency(totalPaid)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total pendente</p><p className="text-xl font-bold text-yellow-600">{fmtCurrency(totalPending)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total lançamentos</p><p className="text-xl font-bold">{contractPayments.length}</p></CardContent></Card>
      </div>

      {/* Lançamentos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Lançamentos do Contrato</CardTitle></CardHeader>
        <CardContent className="p-0">
          {paymentsQuery.isLoading ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
          ) : contractPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Nenhum lançamento encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Recebido em</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractPayments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.description}</TableCell>
                    <TableCell>{p.due_date ? format(parseISO(p.due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                    <TableCell>{p.paid_at ? format(parseISO(p.paid_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{fmtCurrency(p.value)}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[p.status ?? ""] ?? "bg-muted text-muted-foreground"}`}>
                        {p.status ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status !== "pago" && (
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => {
                          setReceiveOpen(p);
                          setReceiveValue(String(p.value));
                          setReceiveDate(p.due_date ? String(p.due_date).substring(0, 10) : format(new Date(), "yyyy-MM-dd"));
                        }}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Receber
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog receber */}
      <Dialog open={!!receiveOpen} onOpenChange={(o) => { if (!o) setReceiveOpen(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            <DialogDescription>Valor total: <strong>{receiveOpen ? fmtCurrency(receiveOpen.value) : ""}</strong></DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Valor recebido (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={receiveValue} onChange={(e) => setReceiveValue(e.target.value)} />
              {receiveOpen && parseFloat(receiveValue) > 0 && parseFloat(receiveValue) < receiveOpen.value && (
                <p className="text-xs text-amber-600 mt-1">
                  Pagamento parcial — saldo de {fmtCurrency(receiveOpen.value - parseFloat(receiveValue))} ficará em aberto.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Data do recebimento</Label>
              <Input type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(null)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleReceive} disabled={isReceiving}>
              {isReceiving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
