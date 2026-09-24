import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Pencil, PauseCircle, RotateCw, UserCheck, Check, Loader2, FileText, Receipt, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { ContractRow } from "@/hooks/useContracts";
import { usePayments } from "@/hooks/useFinancial";
import { useSetDashboardReference } from "@/hooks/useContracts";
import { useInvoices } from "@/hooks/useInvoices";
import { useModulePermission } from "@/hooks/usePermissions";
import { InvoiceStatusBadge } from "@/components/fiscal/InvoiceStatusBadge";
import { InvoiceEmitModal } from "@/components/fiscal/InvoiceEmitModal";
import { InvoiceViewModal } from "@/components/fiscal/InvoiceViewModal";
import type { Invoice } from "@/types/fiscal";
import { ComercialClientTab } from "@/components/clients/ComercialClientTab";
import { GenerateContractButton } from "@/components/contracts/GenerateContractButton";
import { VariableResultsPanel } from "@/components/contracts/VariableResultsPanel";
import React from "react";
import {
  useContractAmendments,
  type AmendmentType,
} from "@/hooks/useContractAmendments";
import { useAmendmentAssembly } from "@/hooks/useAmendmentAssembly";
import { AmendmentReviewModal } from "@/components/contracts/AmendmentReviewModal";
import {
  RefreshCw, TrendingUp, Clock, MoreHorizontal,
  ChevronDown, ChevronUp, Plus,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

// ── Histórico de aditivos ─────────────────────────────────────────────────────

const AMENDMENT_TYPE_LABEL: Record<AmendmentType, string> = {
  renovacao: "Renovação",
  reajuste:  "Reajuste de valor",
  prazo:     "Extensão de prazo",
  escopo:    "Alteração de escopo",
  outro:     "Outro",
};

const AMENDMENT_STATUS_BADGE: Record<string, string> = {
  rascunho:              "bg-slate-100 text-slate-600",
  pendente_assinatura:   "bg-amber-100 text-amber-700",
  assinado:              "bg-emerald-100 text-emerald-700",
  cancelado:             "bg-red-100 text-red-600",
};

const AMENDMENT_STATUS_LABEL: Record<string, string> = {
  rascunho:              "Rascunho",
  pendente_assinatura:   "Aguardando assinatura",
  assinado:              "Assinado",
  cancelado:             "Cancelado",
};

const AMENDMENT_ICONS: Record<AmendmentType, React.ReactNode> = {
  renovacao: <RefreshCw className="h-3.5 w-3.5 text-violet-500" />,
  reajuste:  <TrendingUp className="h-3.5 w-3.5 text-blue-500" />,
  prazo:     <Clock className="h-3.5 w-3.5 text-amber-500" />,
  escopo:    <FileText className="h-3.5 w-3.5 text-slate-500" />,
  outro:     <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />,
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return iso; }
}

function AmendmentsHistory({
  contract,
  organizationId,
  onNewAmendment,
  canEdit,
}: {
  contract: ContractRow;
  organizationId: string;
  onNewAmendment: () => void;
  canEdit: boolean;
}) {
  const { data: amendments = [], isLoading } = useContractAmendments(contract.id);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  // Aditivo selecionado para gerar documento
  const [generatingAmendment, setGeneratingAmendment] = React.useState<ReturnType<typeof useContractAmendments>["data"][number] | null>(null);

  const {
    isReviewOpen, setIsReviewOpen,
    assembledHtml, isAssembling, isConfirming,
    openReview, confirmGenerate,
  } = useAmendmentAssembly(generatingAmendment ?? null, contract as ContractRow);

  if (isLoading) return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando aditivos…
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Histórico de Aditivos</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Toda alteração feita após a assinatura do contrato é registrada aqui.
          </p>
        </div>
        {contract.is_signed && canEdit && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={onNewAmendment}>
            <Plus className="h-3 w-3" /> Novo aditivo
          </Button>
        )}
      </div>

      {amendments.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center">
          <FileSignature className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum aditivo registrado.</p>
          {!contract.is_signed && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Aditivos só podem ser criados após a assinatura do contrato.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {amendments.map((a) => {
            const isExp = expanded === a.id;
            return (
              <div key={a.id} className="rounded-lg border bg-background overflow-hidden">
                {/* Linha principal */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="shrink-0">{AMENDMENT_ICONS[a.amendment_type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {a.amendment_number}º Aditivo — {AMENDMENT_TYPE_LABEL[a.amendment_type]}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize ${AMENDMENT_STATUS_BADGE[a.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {AMENDMENT_STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{a.reason}</p>
                  </div>
                  <div className="text-[11px] text-muted-foreground shrink-0 text-right">
                    {fmtDate(a.created_at)}
                  </div>
                  {/* Botão gerar documento — exibido se não tem documento ou para regenerar */}
                  {canEdit && a.status !== "cancelado" && (
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1 shrink-0 text-violet-700 border-violet-200 hover:bg-violet-50"
                      disabled={isAssembling && generatingAmendment?.id === a.id}
                      onClick={async () => {
                        setGeneratingAmendment(a);
                        await openReview(a);
                      }}
                      title={a.document_content ? "Regenerar documento" : "Gerar documento"}
                    >
                      {isAssembling && generatingAmendment?.id === a.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <FileSignature className="h-3 w-3" />
                      }
                      {a.document_content ? "Regenerar" : "Gerar doc."}
                    </Button>
                  )}
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                    onClick={() => setExpanded(isExp ? null : a.id)}
                  >
                    {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {/* Detalhe expandido */}
                {isExp && (
                  <div className="border-t px-3 py-2.5 space-y-2 bg-muted/20">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                      {a.additional_months && (
                        <div>
                          <p className="text-muted-foreground">Meses adicionais</p>
                          <p className="font-medium">+{a.additional_months} meses</p>
                        </div>
                      )}
                      {a.new_end_date && (
                        <div>
                          <p className="text-muted-foreground">Novo encerramento</p>
                          <p className="font-medium">{fmtDate(a.new_end_date)}</p>
                        </div>
                      )}
                      {a.new_duration_months && (
                        <div>
                          <p className="text-muted-foreground">Nova duração total</p>
                          <p className="font-medium">{a.new_duration_months} meses</p>
                        </div>
                      )}
                      {a.previous_value !== null && a.new_value !== null && (
                        <>
                          <div>
                            <p className="text-muted-foreground">Valor anterior</p>
                            <p className="font-medium line-through text-muted-foreground">
                              {fmtCurrency(a.previous_value ?? 0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Novo valor</p>
                            <p className="font-medium text-emerald-700">{fmtCurrency(a.new_value ?? 0)}</p>
                          </div>
                        </>
                      )}
                      {a.value_effective_date && (
                        <div>
                          <p className="text-muted-foreground">Vigência do valor</p>
                          <p className="font-medium">{fmtDate(a.value_effective_date)}</p>
                        </div>
                      )}
                      {a.signed_at && (
                        <div>
                          <p className="text-muted-foreground">Assinado em</p>
                          <p className="font-medium">{fmtDate(a.signed_at)}</p>
                        </div>
                      )}
                    </div>
                    {/* Snapshot anterior */}
                    {a.previous_snapshot && Object.keys(a.previous_snapshot).length > 0 && (
                      <>
                        <Separator />
                        <details>
                          <summary className="text-[11px] text-muted-foreground cursor-pointer hover:underline">
                            Ver snapshot do contrato antes do aditivo
                          </summary>
                          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px]">
                            {(a.previous_snapshot.value !== undefined) && (
                              <div>
                                <span className="text-muted-foreground">Valor: </span>
                                <span className="font-medium">{fmtCurrency(Number(a.previous_snapshot.value))}</span>
                              </div>
                            )}
                            {(a.previous_snapshot.duration_months !== undefined) && (
                              <div>
                                <span className="text-muted-foreground">Duração: </span>
                                <span className="font-medium">{String(a.previous_snapshot.duration_months)} meses</span>
                              </div>
                            )}
                            {(a.previous_snapshot.end_date !== undefined) && (
                              <div>
                                <span className="text-muted-foreground">Encerramento: </span>
                                <span className="font-medium">{fmtDate(String(a.previous_snapshot.end_date))}</span>
                              </div>
                            )}
                          </div>
                        </details>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de revisão do documento do aditivo */}
      <AmendmentReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        html={assembledHtml}
        isConfirming={isConfirming || isAssembling}
        onConfirm={confirmGenerate}
        title={generatingAmendment
          ? `${generatingAmendment.amendment_number}º Aditivo — ${contract.service_contracted || contract.title}`
          : "Revisão do Aditivo"
        }
      />
    </div>
  );
}

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
  onAmendment: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onEnd: () => void;
}

export function ContractDetailPage({
  contract, organizationId, clientId, canEdit, canManageContracts,
  onBack, onEdit, onAmendment, onSuspend, onReactivate, onEnd,
}: Props) {
  const paymentsQuery = usePayments(organizationId);
  const setDashboardRef = useSetDashboardReference(organizationId);

  // ── Fiscal permissions ────────────────────────────────────────────────────
  const fiscalPerms = useModulePermission("fiscal" as any);

  // ── Invoices for this contract ────────────────────────────────────────────
  const invoicesQuery = useInvoices(
    fiscalPerms.canView ? organizationId : undefined,
    fiscalPerms.canView ? { contract_id: contract.id } : undefined
  );
  const contractInvoices = invoicesQuery.data ?? [];

  // ── Fiscal modal state ────────────────────────────────────────────────────
  const [emitModalOpen, setEmitModalOpen] = useState(false);
  const [emitDefaultPaymentId, setEmitDefaultPaymentId] = useState<string | undefined>(undefined);
  const [viewModalInvoice, setViewModalInvoice] = useState<Invoice | null>(null);

  /** Opens the emit modal pre-filled for a specific payment */
  const openEmitForPayment = (paymentId: string) => {
    setEmitDefaultPaymentId(paymentId);
    setEmitModalOpen(true);
  };

  /** Opens the emit modal pre-filled for the contract (no specific payment) */
  const openEmitForContract = () => {
    setEmitDefaultPaymentId(undefined);
    setEmitModalOpen(true);
  };

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
          {/* Toggle referência dashboard */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30">
            <Switch
              checked={!!contract.is_dashboard_reference}
              onCheckedChange={(val) => setDashboardRef.mutate({ contractId: contract.id, clientId, value: val })}
              disabled={setDashboardRef.isPending}
              id="dashboard-ref-toggle"
            />
            <Label htmlFor="dashboard-ref-toggle" className="text-xs font-bold cursor-pointer select-none">
              Ref. Dashboard
            </Label>
          </div>
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
          <GenerateContractButton contractId={contract.id} organizationId={organizationId} />
          {contract.is_signed ? (
            <Button size="sm" onClick={onAmendment} disabled={!canEdit} variant="outline" className="gap-1.5 text-violet-700 border-violet-300 hover:bg-violet-50">
              <FileSignature className="h-4 w-4" /> Aditivo
            </Button>
          ) : (
            <Button size="sm" onClick={onEdit} disabled={!canEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="contrato">
        <TabsList>
          <TabsTrigger value="contrato">Contrato</TabsTrigger>
          {fiscalPerms.canView && (
            <TabsTrigger value="notas-fiscais">Notas Fiscais</TabsTrigger>
          )}
          <TabsTrigger value="aditivos">Aditivos</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
        </TabsList>

        <TabsContent value="contrato" className="space-y-6 mt-4">
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
                    {contractPayments.map(p => {
                      // Busca qualquer invoice vinculado (não só autorizada)
                      const linkedInvoice = fiscalPerms.canView
                        ? contractInvoices.find(inv => inv.payment_id === p.id) ?? null
                        : null;
                      const isAutorizada = linkedInvoice?.status === "emitida";
                      const isPendente   = linkedInvoice?.status === "pendente";
                      const isProcessando = linkedInvoice?.status === "processando";

                      return (
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
                            <div className="flex items-center justify-end gap-1">
                              {fiscalPerms.canView && (
                                <>
                                  {/* Nota autorizada — botão visualizar */}
                                  {isAutorizada && (
                                    <Button
                                      size="sm" variant="ghost"
                                      title="Ver NFS-e autorizada"
                                      className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                      onClick={() => setViewModalInvoice(linkedInvoice)}
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {/* Nota em processamento — badge de status */}
                                  {isProcessando && (
                                    <Button size="sm" variant="ghost" title="Nota em processamento" className="text-blue-500 cursor-default" disabled>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    </Button>
                                  )}
                                  {/* Nota pendente — botão enviar */}
                                  {isPendente && fiscalPerms.canCreate && (
                                    <Button
                                      size="sm" variant="ghost"
                                      title="Enviar NFS-e para emissão"
                                      className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                      onClick={() => openEmitForPayment(p.id)}
                                    >
                                      <Receipt className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {/* Sem invoice — botão emitir */}
                                  {!linkedInvoice && fiscalPerms.canCreate && (
                                    <Button
                                      size="sm" variant="ghost"
                                      title="Emitir NFS-e para este lançamento"
                                      className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                      onClick={() => openEmitForPayment(p.id)}
                                    >
                                      <Receipt className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </>
                              )}
                              {p.status !== "pago" && (
                                <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => {
                                  setReceiveOpen(p);
                                  setReceiveValue(String(p.value));
                                  setReceiveDate(p.due_date ? String(p.due_date).substring(0, 10) : format(new Date(), "yyyy-MM-dd"));
                                }}>
                                  <Check className="h-3.5 w-3.5 mr-1" /> Receber
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Painel de resultados variáveis — exibido apenas para contratos do tipo 'variavel' */}
          {contractType === "variavel" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resultados Variáveis</CardTitle>
              </CardHeader>
              <CardContent>
                <VariableResultsPanel
                  contractId={contract.id}
                  clientId={clientId}
                  commissionPct={meta.variable_commission_pct ?? 0}
                  resultType={meta.variable_result_type ?? "contrato_individual"}
                  recurringDueDate={contract.recurring_due_date ?? undefined}
                />
              </CardContent>
            </Card>
          )}

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
        </TabsContent>

        {/* ── Notas Fiscais tab (req 5.1, 5.2, 5.3, 5.4) ── */}
        {fiscalPerms.canView && (
          <TabsContent value="notas-fiscais" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Notas Fiscais do Contrato</h3>
              {fiscalPerms.canCreate && (
                <Button size="sm" onClick={openEmitForContract}>
                  <Receipt className="h-4 w-4 mr-1" /> Emitir NFS-e
                </Button>
              )}
            </div>

            {invoicesQuery.isLoading ? (
              <div className="flex items-center gap-2 p-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando notas fiscais...
              </div>
            ) : contractInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                Nenhuma nota fiscal emitida para este contrato.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Nota</TableHead>
                      <TableHead>Competência</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contractInvoices.map(inv => {
                      const competencia = inv.competencia
                        ? (() => { const [y, m] = inv.competencia!.split("-"); return `${m}/${y}`; })()
                        : "—";
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-sm">
                            {inv.numero ? (
                              <span className="flex items-center gap-1">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                {inv.numero}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{competencia}</TableCell>
                          <TableCell className="text-right font-medium">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(inv.valor_servico)}
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge status={inv.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            {inv.status === "emitida" && inv.pdf_url ? (
                              <Button variant="ghost" size="sm" asChild title="Baixar PDF">
                                <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                                  <FileText className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}
        <TabsContent value="aditivos" className="space-y-4 mt-4">
          <AmendmentsHistory contract={contract} organizationId={organizationId} onNewAmendment={onAmendment} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="comercial" className="mt-4">
          <ComercialClientTab clientId={clientId} organizationId={organizationId} />
        </TabsContent>
      </Tabs>

      {/* ── Fiscal modals ── */}
      {fiscalPerms.canView && (
        <>
          {/* Emit modal: pre-filled with contract_id and client data */}
          <InvoiceEmitModal
            open={emitModalOpen}
            onOpenChange={(open) => {
              setEmitModalOpen(open);
              if (!open) setEmitDefaultPaymentId(undefined);
            }}
            organizationId={organizationId}
            defaultClientId={clientId}
            defaultContractId={contract.id}
            defaultPaymentId={emitDefaultPaymentId}
          />

          {/* View modal: shows invoice details */}
          <InvoiceViewModal
            open={!!viewModalInvoice}
            onOpenChange={(open) => { if (!open) setViewModalInvoice(null); }}
            invoice={viewModalInvoice}
          />
        </>
      )}
    </div>
  );
}
