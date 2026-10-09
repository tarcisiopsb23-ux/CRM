/**
 * ContractV2DetailPage
 *
 * Tela de detalhe para contratos do novo sistema (contracts_v2).
 * Exibida quando o usuário clica em "Ver" num contrato v2 no ClientContractsTab.
 *
 * Tabs:
 *   - Contrato    : informações, resumo financeiro, lançamentos, receber pagamento
 *   - Cronograma  : tabela de linhas do payment_schedule
 *   - Comissão*   : painel de resultados variáveis (apenas se commission_enabled)
 *   - Notas Fiscais* : NFS-e vinculadas (se fiscal habilitado)
 */
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft, Check, Loader2, FileText, Receipt, TrendingUp, Calendar, Pencil,
  RotateCcw, PenLine, Hash, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { ContractV2 } from "@/hooks/useContracts";
import { usePayments } from "@/hooks/useFinancial";
import { useInvoices } from "@/hooks/useInvoices";
import { useModulePermission } from "@/hooks/usePermissions";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import { useContractSecurity } from "@/hooks/useContractSecurity";
import { InvoiceStatusBadge } from "@/components/fiscal/InvoiceStatusBadge";
import { InvoiceEmitModal } from "@/components/fiscal/InvoiceEmitModal";
import { InvoiceViewModal } from "@/components/fiscal/InvoiceViewModal";
import type { Invoice } from "@/types/fiscal";
import { VariableResultsPanel } from "@/components/contracts/VariableResultsPanel";
import { GenerateContractButton } from "@/components/contracts/GenerateContractButton";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null | undefined) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const STATUS_BADGE: Record<string, string> = {
  rascunho:  "bg-slate-100 text-slate-600",
  emitido:   "bg-blue-100 text-blue-700",
  assinado:  "bg-emerald-100 text-emerald-700",
  cancelado: "bg-red-100 text-red-700",
  encerrado: "bg-gray-100 text-gray-600",
};

const LINE_TYPE_LABEL: Record<string, string> = {
  setup:        "Setup",
  mensalidade:  "Mensalidade",
  unico:        "Pagamento único",
  entrada:      "Entrada",
  "setup+mensalidade": "Setup + Mensalidade",
  conclusao:    "Saldo na entrega",
  outro:        "Outro",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  contract: ContractV2;
  organizationId: string;
  clientId: string;
  onBack: () => void;
  onViewPdf: () => void;
  /** Chamado quando o usuário clica "Editar Rascunho" */
  onEdit?: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ContractV2DetailPage({
  contract, organizationId, clientId, onBack, onViewPdf, onEdit,
}: Props) {
  const paymentsQuery = usePayments(organizationId);
  const fiscalPerms   = useModulePermission("fiscal" as never);
  const { services: catalogServices = [] } = useServiceCatalog(organizationId);
  const { revertToDraft, registerSignature, confirmSignature } = useContractSecurity();

  // ── Cancelar emissão ──────────────────────────────────────────────────────
  const [isReverting, setIsReverting] = useState(false);

  const handleRevertToDraft = async () => {
    if (!window.confirm(
      "Tem certeza? O número atual será marcado como cancelado e um novo número será gerado. O PDF precisará ser regenerado."
    )) return;
    setIsReverting(true);
    try {
      const result = await revertToDraft(contract.id, clientId);
      if (result.success) {
        toast.success(`Emissão cancelada. Novo número: ${result.contract_number ?? ""}`);
      } else {
        toast.error(result.error ?? "Erro ao cancelar emissão.");
      }
    } catch {
      toast.error("Erro inesperado ao cancelar emissão.");
    } finally {
      setIsReverting(false);
    }
  };

  // ── Registrar Assinatura ──────────────────────────────────────────────────
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureDate, setSignatureDate]           = useState(format(new Date(), "yyyy-MM-dd"));
  const [signatureContractNumber, setSignatureContractNumber] = useState(contract.signed_contract_number ?? contract.contract_number ?? "");
  const [isSigning, setIsSigning] = useState(false);

  const handleRegisterSignature = async () => {
    if (!signatureDate) { toast.error("Informe a data de assinatura."); return; }
    setIsSigning(true);
    try {
      const result = await registerSignature(contract.id, clientId, signatureDate, signatureContractNumber || undefined);
      if (result.success) {
        const msg = result.awaiting_confirmation
          ? "Dados de assinatura salvos. Solicite a confirmação de um gestor para concluir."
          : "Assinatura registrada!";
        toast.success(msg, { duration: result.awaiting_confirmation ? 8000 : 4000 });
        setSignatureModalOpen(false);
      } else {
        toast.error(result.error ?? "Erro ao registrar assinatura.");
      }
    } catch {
      toast.error("Erro inesperado.");
    } finally {
      setIsSigning(false);
    }
  };

  // ── Confirmar Assinatura (quatro olhos) ──────────────────────────────────
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirmSignature = async () => {
    setIsConfirming(true);
    try {
      const result = await confirmSignature(contract.id, clientId, contract.signed_date ?? undefined);
      if (result.success) {
        toast.success("Assinatura confirmada! Lançamentos ativados.");
      } else {
        toast.error(result.error ?? "Erro ao confirmar assinatura.");
      }
    } catch {
      toast.error("Erro inesperado.");
    } finally {
      setIsConfirming(false);
    }
  };

  const invoicesQuery = useInvoices(
    fiscalPerms.canView ? organizationId : undefined,
    fiscalPerms.canView ? { contract_id: contract.id } : undefined,
  );
  const contractInvoices = invoicesQuery.data ?? [];

  // ── Lançamentos vinculados ────────────────────────────────────────────────
  // Rascunhos/emitidos: lançamentos "previstos" — sem cruzar com payments.
  // Assinados: cruzam com payments para status real; schedule.status como fallback.
  const isDraft = contract.status === "rascunho" || contract.status === "emitido";

  const scheduleLines = useMemo(() => contract.payment_schedule ?? [], [contract.payment_schedule]);
  const contractPayments = useMemo(() =>
    isDraft
      ? [] // rascunho não tem payments reais
      : (paymentsQuery.data ?? [])
          .filter(p => p.contract_id === contract.id)
          .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))),
    [paymentsQuery.data, contract.id, isDraft],
  );

  // Lançamentos unificados: schedule como base, enriquecido com dados do payments quando existir
  const lancamentos = useMemo(() => {
    if (scheduleLines.length > 0) {
      return scheduleLines
        .slice()
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
        .map(line => {
          if (isDraft) {
            // Rascunho/emitido: lançamento previsto — sem cruzamento financeiro
            // Usa status do banco se disponível (pendente após assinatura via RPC)
            const schedStatus = (line as { status?: string }).status;
            return {
              id:             `schedule-${line.id ?? line.line_order ?? Math.random()}`,
              isFromSchedule: true,
              paymentId:      null as string | null,
              description:    line.period_label ?? (LINE_TYPE_LABEL[line.line_type] ?? line.line_type),
              due_date:       line.due_date,
              value:          line.amount,
              status:         schedStatus ?? "previsto",
              paid_at:        null as string | null,
            };
          }
          // Contrato ativo: cruza com payments para status real
          const match = contractPayments.find(p =>
            p.due_date && line.due_date &&
            String(p.due_date).slice(0, 10) === String(line.due_date).slice(0, 10) &&
            Math.abs(p.value - line.amount) < 0.01
          );
          return {
            id:             match?.id ?? `schedule-${line.id ?? line.line_order ?? Math.random()}`,
            isFromSchedule: !match,
            paymentId:      match?.id ?? null as string | null,
            description:    line.period_label ?? (LINE_TYPE_LABEL[line.line_type] ?? line.line_type),
            due_date:       line.due_date,
            value:          line.amount,
            status:         match?.status ?? "pendente",
            paid_at:        match?.paid_at ?? null as string | null,
          };
        });
    }
    // Fallback: payments da tabela quando não há schedule
    return contractPayments.map(p => ({
      id:             p.id,
      isFromSchedule: false,
      paymentId:      p.id,
      description:    p.description,
      due_date:       p.due_date,
      value:          p.value,
      status:         p.status ?? "pendente",
      paid_at:        p.paid_at ?? null as string | null,
    }));
  }, [scheduleLines, contractPayments, isDraft]);

  // Totais
  const totalPaid    = isDraft ? 0 : lancamentos.filter(p => p.status === "pago").reduce((s, p) => s + p.value, 0);
  const totalPending = isDraft
    ? lancamentos.reduce((s, p) => s + p.value, 0) // total previsto
    : lancamentos.filter(p => p.status !== "pago").reduce((s, p) => s + p.value, 0);

  // ── Receber pagamento ─────────────────────────────────────────────────────
  const [receiveOpen, setReceiveOpen]   = useState<(typeof lancamentos)[0] | null>(null);
  const [receiveValue, setReceiveValue] = useState("");
  const [receiveDate, setReceiveDate]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [isReceiving, setIsReceiving]   = useState(false);

  const handleReceive = async () => {
    if (!receiveOpen) return;
    const received = parseFloat(receiveValue);
    if (isNaN(received) || received <= 0) { toast.error("Informe um valor válido."); return; }
    setIsReceiving(true);
    try {
      const isPartial = received < receiveOpen.value;

      if (receiveOpen.isFromSchedule || !receiveOpen.paymentId) {
        // Lançamento vindo do schedule sem payment na tabela — cria um novo
        await paymentsQuery.create.mutateAsync({
          client_id:   clientId,
          contract_id: contract.id,
          description: receiveOpen.description,
          value:       received,
          due_date:    receiveOpen.due_date ? String(receiveOpen.due_date).slice(0, 10) : receiveDate,
          status:      "pago" as never,
          paid_at:     new Date(receiveDate + "T12:00:00").toISOString(),
          metadata:    { paid_at: new Date(receiveDate + "T12:00:00").toISOString() },
        });
        if (isPartial) {
          await paymentsQuery.create.mutateAsync({
            client_id:   clientId,
            contract_id: contract.id,
            description: `${receiveOpen.description} (saldo restante)`,
            value:       receiveOpen.value - received,
            due_date:    receiveOpen.due_date ? String(receiveOpen.due_date).slice(0, 10) : receiveDate,
            status:      "pendente",
          });
          toast.success(`Recebimento parcial registrado. Saldo de ${fmtCurrency(receiveOpen.value - received)} em aberto.`);
        } else {
          toast.success("Pagamento recebido!");
        }
      } else {
        // Payment já existe na tabela — atualiza
        await paymentsQuery.updatePayment.mutateAsync({
          id:       receiveOpen.paymentId,
          value:    received,
          status:   "pago" as never,
          due_date: receiveDate,
          paid_at:  new Date(receiveDate + "T12:00:00").toISOString(),
        });
        if (isPartial) {
          await paymentsQuery.create.mutateAsync({
            client_id:   clientId,
            contract_id: contract.id,
            description: `${receiveOpen.description} (saldo restante)`,
            value:       receiveOpen.value - received,
            due_date:    receiveDate,
            status:      "pendente",
          });
          toast.success(`Recebimento parcial registrado. Saldo de ${fmtCurrency(receiveOpen.value - received)} em aberto.`);
        } else {
          toast.success("Pagamento recebido!");
        }
      }
      setReceiveOpen(null);
    } catch {
      toast.error("Erro ao registrar recebimento.");
    } finally {
      setIsReceiving(false);
    }
  };

  // ── NFS-e modals ──────────────────────────────────────────────────────────
  const [emitModalOpen, setEmitModalOpen]       = useState(false);
  const [emitDefaultPaymentId, setEmitDefaultPaymentId] = useState<string | undefined>(undefined);
  const [viewModalInvoice, setViewModalInvoice] = useState<Invoice | null>(null);

  const openEmitForPayment = (paymentId: string) => {
    setEmitDefaultPaymentId(paymentId);
    setEmitModalOpen(true);
  };

  // ── Metadata helpers ──────────────────────────────────────────────────────
  const meta               = (contract as Record<string, unknown>).metadata as Record<string, unknown> ?? {};
  const contractTypeLabel  = (() => {
    const t = String(meta.contract_type ?? "mensal");
    return t === "mensal" ? "Recorrente (Mensal)" : t === "eventual" ? "Eventual" : t === "evolutivo" ? "Evolutivo" : t;
  })();
  const commissionEnabled     = Boolean(meta.commission_enabled);
  const commissionType        = String(meta.commission_type ?? "percent_value") as "percent_value" | "fixed_per_unit";
  const commissionRate        = Number(meta.commission_rate ?? 0);
  const commissionDescription = String(meta.commission_description ?? "");

  // ── Cronograma ────────────────────────────────────────────────────────────
  const schedule = contract.payment_schedule ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold">{contract.title}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[contract.status] ?? "bg-muted text-muted-foreground"}`}>
                {contract.status}
              </span>
            </div>
            {/* Número do contrato em destaque */}
            {(contract.signed_contract_number || contract.contract_number) && (
              <div className="flex items-center gap-1.5 mt-1">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-mono font-semibold text-foreground">
                  {contract.signed_contract_number ?? contract.contract_number}
                </span>
                {contract.signed_contract_number && contract.signed_contract_number !== contract.contract_number && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    (interno: {contract.contract_number})
                  </span>
                )}
              </div>
            )}
            {/* Alerta: aguardando confirmação de assinatura */}
            {contract.status === "emitido" && contract.signed_at && !contract.signed_confirmed_at && (
              <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                ⏳ Aguardando confirmação de assinatura por segundo usuário
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Detalhes do contrato</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Cancelar Emissão — para contratos emitidos */}
          {contract.status === "emitido" && (
            <Button
              size="sm" variant="outline"
              onClick={handleRevertToDraft}
              disabled={isReverting}
              className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
            >
              {isReverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Cancelar Emissão
            </Button>
          )}
          {/* Registrar Assinatura — para contratos emitidos (passo 1) */}
          {contract.status === "emitido" && !contract.signed_confirmed_at && (
            <Button
              size="sm"
              onClick={() => setSignatureModalOpen(true)}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              <PenLine className="h-4 w-4" />
              {contract.signed_at ? "Reeditar Dados" : "Registrar Assinatura"}
            </Button>
          )}
          {/* Confirmar Assinatura — quatro olhos (passo 2, aparece após passo 1) */}
          {contract.status === "emitido" && contract.signed_at && !contract.signed_confirmed_at && (
            <Button
              size="sm"
              onClick={handleConfirmSignature}
              disabled={isConfirming}
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
            >
              {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar Assinatura
            </Button>
          )}
          {/* Editar Rascunho */}
          {contract.status === "rascunho" && onEdit && (
            <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-4 w-4" />
              Editar Rascunho
            </Button>
          )}
          {/* Gerar Contrato — só para rascunhos */}
          {contract.status === "rascunho" && (
            <GenerateContractButton
              contractId={contract.id}
              organizationId={organizationId}
              onGenerated={onViewPdf}
            />
          )}
          <Button size="sm" variant="outline" onClick={onViewPdf} className="gap-1.5">
            <FileText className="h-4 w-4" /> Ver PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="configuracoes">
        <TabsList>
          <TabsTrigger value="configuracoes" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Configurações
          </TabsTrigger>
          <TabsTrigger value="contrato">Contrato</TabsTrigger>
          <TabsTrigger value="cronograma" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Cronograma
          </TabsTrigger>
          {commissionEnabled && (
            <TabsTrigger value="comissao" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Comissão
            </TabsTrigger>
          )}
          {fiscalPerms.canView && (
            <TabsTrigger value="notas-fiscais">Notas Fiscais</TabsTrigger>
          )}
        </TabsList>

        {/* ── Aba Configurações ─────────────────────────────────────────────── */}
        <TabsContent value="configuracoes" className="space-y-4 mt-4">

          {/* Serviços contratados */}
          {(meta.services as unknown[] | undefined)?.length ? (
            <Card>
              <CardHeader><CardTitle className="text-sm">Serviços Contratados</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(meta.services as Array<{ service_id: string; service_name: string; selected_deliverables?: Array<{ deliverable_id: string; included: boolean; number_value?: number | null; period?: string | null }> }>).map(svc => (
                  <div key={svc.service_id} className="border rounded-md p-3 space-y-2">
                    <p className="text-sm font-semibold">{svc.service_name}</p>
                    {svc.selected_deliverables && svc.selected_deliverables.filter(d => d.included !== false).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Entregáveis incluídos:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {svc.selected_deliverables.filter(d => d.included !== false).map(d => {
                            // Resolve nome do entregável pelo catálogo
                            const catalogItem = catalogServices.find(s => s.slug === svc.service_id || s.id === svc.service_id);
                            const deliverable = catalogItem?.deliverables?.find(del => del.id === d.deliverable_id);
                            const label = deliverable?.name ?? d.deliverable_id.slice(0, 8) + "…";
                            return (
                              <li key={d.deliverable_id} className="text-xs text-muted-foreground">
                                {label}
                                {d.number_value ? ` — ${d.number_value}${deliverable?.unit ? ` ${deliverable.unit}` : ""}` : ""}
                                {d.period ? ` / ${d.period}` : ""}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* Financeiro */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Financeiro</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <p className="font-semibold">{contractTypeLabel}</p>
                </div>
                {contract.total_monthly != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Mensalidade</p>
                    <p className="font-semibold">{fmtCurrency(contract.total_monthly)}</p>
                  </div>
                )}
                {contract.due_day != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vencimento</p>
                    <p className="font-semibold">Todo dia {contract.due_day}</p>
                  </div>
                )}
                {contract.total_setup != null && contract.total_setup > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Setup / Implantação</p>
                    <p className="font-semibold">{fmtCurrency(contract.total_setup)}</p>
                  </div>
                )}
                {meta.setup_installments ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Parcelas do setup</p>
                    <p className="font-semibold">{String(meta.setup_installments)}× de {meta.setup_parcel_value ? fmtCurrency(Number(meta.setup_parcel_value)) : "—"}</p>
                  </div>
                ) : null}
                {meta.setup_first_due_date ? (
                  <div>
                    <p className="text-xs text-muted-foreground">1º vencimento setup</p>
                    <p className="font-semibold">{fmtDate(String(meta.setup_first_due_date))}</p>
                  </div>
                ) : null}
                {contract.recurring_payment_method && (
                  <div>
                    <p className="text-xs text-muted-foreground">Forma de pagamento</p>
                    <p className="font-semibold capitalize">{contract.recurring_payment_method}</p>
                  </div>
                )}
                {contract.chave_pix && (
                  <div className="col-span-full">
                    <p className="text-xs text-muted-foreground">Chave PIX selecionada</p>
                    <p className="font-semibold font-mono text-xs">{contract.chave_pix}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Vigência */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Vigência e Prazos</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {contract.start_date && (
                  <div>
                    <p className="text-xs text-muted-foreground">Início</p>
                    <p className="font-semibold">{fmtDate(contract.start_date)}</p>
                  </div>
                )}
                {contract.end_date && (
                  <div>
                    <p className="text-xs text-muted-foreground">Encerramento</p>
                    <p className="font-semibold">{fmtDate(contract.end_date)}</p>
                  </div>
                )}
                {contract.prazo_minimo_meses != null && contract.prazo_minimo_meses > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Prazo mínimo</p>
                    <p className="font-semibold">{contract.prazo_minimo_meses} meses</p>
                  </div>
                )}
                {contract.vigencia_inicio && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vigência diferida</p>
                    <p className="font-semibold">{fmtDate(contract.vigencia_inicio)}</p>
                  </div>
                )}
                {contract.grace_period_months != null && contract.grace_period_months > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Carência</p>
                    <p className="font-semibold">{contract.grace_period_months} mês(es)</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comissão variável (resumo) */}
          {commissionEnabled && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Comissão Variável</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="font-semibold">{commissionType === "percent_value" ? "Percentual sobre valor" : "Valor fixo por unidade"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {commissionType === "percent_value" ? "Percentual" : "Valor por resultado"}
                    </p>
                    <p className="font-semibold">
                      {commissionType === "percent_value" ? `${commissionRate}%` : fmtCurrency(commissionRate)}
                    </p>
                  </div>
                  {commissionDescription && (
                    <div className="col-span-full">
                      <p className="text-xs text-muted-foreground">O que é um resultado</p>
                      <p className="font-semibold">{commissionDescription}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notas */}
          {contract.notes && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{contract.notes}</CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Aba Contrato ─────────────────────────────────────────────────── */}
        <TabsContent value="contrato" className="space-y-6 mt-4">
          {/* Dados do contrato */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações do Contrato</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Tipo</p>
                  <p className="font-semibold">{contractTypeLabel}</p>
                </div>
                {contract.service_slugs?.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs">Serviços</p>
                    <p className="font-semibold">
                      {contract.service_slugs
                        .map(slug => catalogServices.find(s => s.slug === slug)?.name ?? slug)
                        .join(", ")}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">Data de início</p>
                  <p className="font-semibold">{fmtDate(contract.start_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Encerramento</p>
                  <p className="font-semibold">{fmtDate(contract.end_date)}</p>
                </div>
                {contract.total_monthly != null && (
                  <div>
                    <p className="text-muted-foreground text-xs">Valor mensal</p>
                    <p className="font-semibold">{fmtCurrency(contract.total_monthly)}</p>
                  </div>
                )}
                {contract.total_setup != null && contract.total_setup > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs">Setup</p>
                    <p className="font-semibold">{fmtCurrency(contract.total_setup)}</p>
                  </div>
                )}
                {contract.due_day != null && (
                  <div>
                    <p className="text-muted-foreground text-xs">Vencimento</p>
                    <p className="font-semibold">Todo dia {contract.due_day}</p>
                  </div>
                )}
                {contract.signed_at && (
                  <div>
                    <p className="text-muted-foreground text-xs">Assinado em</p>
                    <p className="font-semibold text-emerald-700">{fmtDate(contract.signed_at)}</p>
                  </div>
                )}
                {(contract as ContractV2 & { signed_contract_number?: string | null }).signed_contract_number && (
                  <div>
                    <p className="text-muted-foreground text-xs">Nº contrato assinado</p>
                    <p className="font-semibold font-mono">
                      {(contract as ContractV2 & { signed_contract_number?: string | null }).signed_contract_number}
                    </p>
                  </div>
                )}
                {commissionEnabled && (
                  <div className="col-span-full">
                    <p className="text-muted-foreground text-xs">Comissão variável</p>
                    <p className="font-semibold text-violet-700">
                      {commissionType === "percent_value"
                        ? `${commissionRate}% sobre ${commissionDescription || "resultados"}`
                        : `${fmtCurrency(commissionRate)} por ${commissionDescription || "resultado"}`}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Resumo financeiro */}
          <div className="grid grid-cols-3 gap-4">
            {isDraft ? (
              <>
                <Card className="col-span-2">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total previsto (projeção)</p>
                    <p className="text-xl font-bold text-slate-600">{fmtCurrency(totalPending)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Parcelas previstas</p>
                    <p className="text-xl font-bold">{lancamentos.length}</p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total recebido</p>
                    <p className="text-xl font-bold text-emerald-600">{fmtCurrency(totalPaid)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total pendente</p>
                    <p className="text-xl font-bold text-yellow-600">{fmtCurrency(totalPending)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total lançamentos</p>
                    <p className="text-xl font-bold">{lancamentos.length}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Lançamentos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isDraft ? "Projeção de Pagamentos" : "Lançamentos do Contrato"}
              </CardTitle>
              {isDraft && (
                <p className="text-xs text-muted-foreground -mt-1">
                  {contract.status === "emitido"
                    ? "Valores previstos — confirme a assinatura para ativar os lançamentos."
                    : "Valores previstos — os lançamentos serão confirmados após a assinatura do contrato."}
                </p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {(!isDraft && paymentsQuery.isLoading) ? (
                <div className="flex items-center gap-2 p-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : lancamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">Nenhum lançamento encontrado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento previsto</TableHead>
                      {!isDraft && <TableHead>Recebido em</TableHead>}
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      {!isDraft && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lancamentos.map(p => {
                      const linkedInvoice = fiscalPerms.canView && p.paymentId
                        ? contractInvoices.find(inv => inv.payment_id === p.paymentId) ?? null
                        : null;
                      const isAutorizada   = linkedInvoice?.status === "emitida";
                      const isPendente     = linkedInvoice?.status === "pendente";
                      const isProcessando  = linkedInvoice?.status === "processando";

                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.description}</TableCell>
                          <TableCell>{fmtDate(p.due_date ?? null)}</TableCell>
                          {!isDraft && <TableCell>{p.paid_at ? fmtDate(p.paid_at) : "—"}</TableCell>}
                          <TableCell className="text-right font-semibold">{fmtCurrency(p.value)}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                              p.status === "pago"    ? "bg-emerald-100 text-emerald-700" :
                              p.status === "previsto"? "bg-slate-100 text-slate-600" :
                              p.status === "pendente"? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {p.status === "previsto" ? "Previsto" : (p.status ?? "—")}
                            </span>
                          </TableCell>
                          {!isDraft && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* NFS-e e Receber — apenas para contratos já assinados/emitidos */}
                              {!isDraft && (
                                <>
                                  {fiscalPerms.canView && p.paymentId && (
                                    <>
                                      {isAutorizada && (
                                        <Button size="sm" variant="ghost" title="Ver NFS-e"
                                          className="text-emerald-600 hover:bg-emerald-50"
                                          onClick={() => setViewModalInvoice(linkedInvoice)}>
                                          <FileText className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      {isProcessando && (
                                        <Button size="sm" variant="ghost" disabled className="text-blue-500 cursor-default">
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        </Button>
                                      )}
                                      {(isPendente || !linkedInvoice) && fiscalPerms.canCreate && (
                                        <Button size="sm" variant="ghost" title="Emitir NFS-e"
                                          className="text-violet-600 hover:bg-violet-50"
                                          onClick={() => openEmitForPayment(p.paymentId!)}>
                                          <Receipt className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  {p.status !== "pago" && (
                                    <Button size="sm" variant="outline"
                                      className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                      onClick={() => {
                                        setReceiveOpen(p);
                                        setReceiveValue(String(p.value));
                                        setReceiveDate(p.due_date ? String(p.due_date).slice(0, 10) : format(new Date(), "yyyy-MM-dd"));
                                      }}>
                                      <Check className="h-3.5 w-3.5 mr-1" /> Receber
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                          )}
                        </TableRow>                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Dialog receber */}
          <Dialog open={!!receiveOpen} onOpenChange={o => { if (!o) setReceiveOpen(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar Recebimento</DialogTitle>
                <DialogDescription>
                  Valor total: <strong>{receiveOpen ? fmtCurrency(receiveOpen.value) : ""}</strong>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label>Valor recebido (R$)</Label>
                  <Input type="number" step="0.01" min="0.01"
                    value={receiveValue}
                    onChange={e => setReceiveValue(e.target.value)} />
                  {receiveOpen && parseFloat(receiveValue) > 0 && parseFloat(receiveValue) < receiveOpen.value && (
                    <p className="text-xs text-amber-600 mt-1">
                      Pagamento parcial — saldo de {fmtCurrency(receiveOpen.value - parseFloat(receiveValue))} ficará em aberto.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Data do recebimento</Label>
                  <Input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} />
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

        {/* ── Aba Cronograma ────────────────────────────────────────────────── */}
        <TabsContent value="cronograma" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-violet-500" />
                Cronograma de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  Cronograma não configurado para este contrato.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Pagamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.map((line, i) => (
                      <TableRow key={line.id ?? i} className={line.line_type === "setup" ? "bg-amber-50/40" : ""}>
                        <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${
                            line.line_type === "setup"        ? "border-amber-300 text-amber-700"   :
                            line.line_type === "mensalidade"  ? "border-violet-300 text-violet-700" :
                            line.line_type === "unico"        ? "border-blue-300 text-blue-700"     :
                            "border-muted-foreground/40 text-muted-foreground"
                          }`}>
                            {LINE_TYPE_LABEL[line.line_type] ?? line.line_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{fmtDate(line.due_date)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {fmtCurrency(line.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs uppercase">
                          {line.payment_method ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba Comissão ──────────────────────────────────────────────────── */}
        {commissionEnabled && (
          <TabsContent value="comissao" className="mt-4 space-y-4">
            <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-700">
              <TrendingUp className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Comissão sobre Resultados</p>
                <p className="mt-0.5">
                  {commissionType === "percent_value"
                    ? `Taxa de ${commissionRate}% sobre o valor de cada resultado.`
                    : `${fmtCurrency(commissionRate)} por resultado registrado.`}
                  {commissionDescription && ` Resultado: ${commissionDescription}.`}
                </p>
              </div>
            </div>
            <VariableResultsPanel
              contractId={contract.id}
              contractV2Id={contract.id}
              clientId={clientId}
              commissionPct={commissionType === "percent_value" ? commissionRate : 0}
              commissionType={commissionType}
              commissionRateFixed={commissionType === "fixed_per_unit" ? commissionRate : undefined}
              commissionDescription={commissionDescription}
              resultType="contrato_individual"
              recurringDueDate={contract.first_payment_date ?? undefined}
            />
          </TabsContent>
        )}

        {/* ── Aba Notas Fiscais ─────────────────────────────────────────────── */}
        {fiscalPerms.canView && (
          <TabsContent value="notas-fiscais" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Notas Fiscais do Contrato</h3>
              {fiscalPerms.canCreate && (
                <Button size="sm" onClick={() => { setEmitDefaultPaymentId(undefined); setEmitModalOpen(true); }}>
                  <Receipt className="h-4 w-4 mr-1" /> Emitir NFS-e
                </Button>
              )}
            </div>
            {invoicesQuery.isLoading ? (
              <div className="flex items-center gap-2 p-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando notas fiscais…
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
                            {inv.numero
                              ? <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{inv.numero}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>{competencia}</TableCell>
                          <TableCell className="text-right font-medium">{fmtCurrency(inv.valor_servico)}</TableCell>
                          <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
                          <TableCell className="text-right">
                            {inv.status === "emitida" && inv.pdf_url ? (
                              <Button variant="ghost" size="sm" asChild>
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
      </Tabs>

      {/* ── Modais fiscais ────────────────────────────────────────────────────── */}
      {fiscalPerms.canView && (
        <>
          <InvoiceEmitModal
            open={emitModalOpen}
            onOpenChange={open => { setEmitModalOpen(open); if (!open) setEmitDefaultPaymentId(undefined); }}
            organizationId={organizationId}
            defaultClientId={clientId}
            defaultContractId={contract.id}
            defaultPaymentId={emitDefaultPaymentId}
          />
          <InvoiceViewModal
            open={!!viewModalInvoice}
            onOpenChange={open => { if (!open) setViewModalInvoice(null); }}
            invoice={viewModalInvoice}
          />
        </>
      )}

      {/* ── Modal Registrar Assinatura ───────────────────────────────────── */}
      <Dialog open={signatureModalOpen} onOpenChange={o => { if (!isSigning) setSignatureModalOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Assinatura do Contrato</DialogTitle>
            <DialogDescription>
              Informe a data em que o contrato foi assinado e o número do contrato físico.
              Os lançamentos serão ativados automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Data da assinatura *</Label>
              <Input
                type="date"
                value={signatureDate}
                onChange={e => setSignatureDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Número do contrato assinado</Label>
              <Input
                value={signatureContractNumber}
                onChange={e => setSignatureContractNumber(e.target.value)}
                placeholder={contract.contract_number ?? "Ex: 8000023/2026"}
              />
              <p className="text-[11px] text-muted-foreground">
                Número que aparece no documento físico assinado. Se vazio, usa o número interno.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureModalOpen(false)} disabled={isSigning}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleRegisterSignature}
              disabled={isSigning || !signatureDate}
            >
              {isSigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PenLine className="h-4 w-4 mr-2" />}
              Confirmar Assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
