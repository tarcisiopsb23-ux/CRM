/**
 * InvoiceList.tsx
 * Tabela paginada de NFS-e com filtros, ações de PDF e cancelamento.
 * Requisitos: 4.1, 4.2, 4.3, 4.4, 4.9
 */

import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  Download,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useInvoices } from "@/hooks/useInvoices";
import { useIntegration } from "@/hooks/useSettings";
import { useModulePermission } from "@/hooks/usePermissions";
import { InvoiceStatusBadge } from "@/components/fiscal/InvoiceStatusBadge";
import type { Invoice, InvoiceStatus, NotaasConfig } from "@/types/fiscal";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
};

const fmtCompetencia = (competencia: string | null) => {
  if (!competencia) return "—";
  // YYYY-MM → MM/YYYY
  const [year, month] = competencia.split("-");
  if (!year || !month) return competencia;
  return `${month}/${year}`;
};

// Limpa mensagens de erro técnicas, expondo apenas o motivo legível
const cleanErrorMessage = (raw: string | null): string => {
  if (!raw) return "Sem detalhes disponíveis.";

  let msg = raw;

  // Remove prefixos de sistema como "Supabase PATCH 409: ..." ou "n8n respondeu 500: ..."
  msg = msg.replace(/^(supabase\s+\w+\s+\d{3}:\s*|n8n respondeu\s+\d{3}:\s*)/i, "");

  // Tenta extrair campo "message" ou "error" de JSON embutido
  try {
    const parsed = JSON.parse(msg);
    const candidate =
      parsed?.message || parsed?.error || parsed?.msg ||
      parsed?.details || parsed?.hint || parsed?.description;
    if (candidate && typeof candidate === "string") msg = candidate;
  } catch {
    // não é JSON — continua com o texto
  }

  // Remove stack traces (linhas com "at " ou caminhos de arquivo)
  msg = msg
    .split("\n")
    .filter((line) => !/^\s*(at\s+\S|\s*\/\S+\.\w+:\d+)/.test(line))
    .join(" ")
    .trim();

  // Remove códigos HTTP soltos no início: "422 Unprocessable Entity — "
  msg = msg.replace(/^\d{3}\s+[\w\s]+[—\-:]\s*/i, "");

  // Trunca se ainda for muito longo
  if (msg.length > 200) msg = msg.slice(0, 197) + "…";

  return msg || "Erro desconhecido na emissão.";
};

const PAGE_SIZE = 15;

const STATUS_OPTIONS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all",         label: "Todos os status" },
  { value: "pendente",    label: "Pendente" },
  { value: "processando", label: "Processando" },
  { value: "aguardando",  label: "Aguardando Emissão" },
  { value: "emitida",     label: "Emitida" },
  { value: "rejeitada",   label: "Rejeitada" },
  { value: "cancelada",   label: "Cancelada" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface InvoiceListProps {
  organizationId: string;
  contractId?: string;
  clientId?: string;
  initialStatus?: InvoiceStatus | "all";
  /** Filtro adicional aplicado client-side após os filtros padrão */
  extraFilter?: (inv: Invoice) => boolean;
  /** Filtro de período — null = todos */
  periodInterval?: { start: Date; end: Date } | null;
  /** Callback para solicitar geração de PDF de uma nota emitida sem pdf_url */
  onRequestPdf?: (invoice: Invoice) => void;
  /** ID da nota cujo PDF está sendo solicitado (para mostrar loading) */
  requestingPdfId?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoiceList({ organizationId, contractId, clientId, initialStatus, extraFilter, periodInterval, onRequestPdf, requestingPdfId }: InvoiceListProps) {
  // Permissions
  const { canDelete } = useModulePermission("fiscal" as any);
  const { pinProps, requirePin } = usePinConfirm();

  // Integration config for cancel mutation
  const integrationQuery = useIntegration(organizationId, "notaas");
  const notaasConfig = (integrationQuery.data?.config ?? {}) as NotaasConfig;

  // Filters state
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">(initialStatus ?? "all");
  const [competenciaFilter, setCompetenciaFilter] = useState("");
  const [clientNameFilter, setClientNameFilter] = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  // Expanded rows (for rejeitada error message)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Cancel dialog state (autorizada)
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Cancel dialog state (processando)
  const [cancelProcessandoTarget, setCancelProcessandoTarget] = useState<Invoice | null>(null);
  const [cancelProcessandoMotivo, setCancelProcessandoMotivo] = useState("");
  const [isCancellingProcessando, setIsCancellingProcessando] = useState(false);

  // Build server-side filters (status + contextual + período por due_date)
  const serverFilters = useMemo(() => ({
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(contractId ? { contract_id: contractId } : {}),
    ...(clientId ? { client_id: clientId } : {}),
    ...(periodInterval ? { due_date_from: format(periodInterval.start, "yyyy-MM-dd") } : {}),
    ...(periodInterval ? { due_date_to:   format(periodInterval.end,   "yyyy-MM-dd") } : {}),
  }), [statusFilter, contractId, clientId, periodInterval]);

  const { data: invoices = [], isLoading, error, cancel, resetToPending, syncStatus, cancelProcessando } = useInvoices(organizationId, serverFilters);

  // Client-side filtering by competencia, client name and extraFilter
  const filtered = useMemo(() => {
    let result = invoices;

    if (extraFilter) {
      result = result.filter(extraFilter);
    }

    if (competenciaFilter.trim()) {
      // Accept partial match: "2024" or "2024-01" or "01/2024"
      const normalized = competenciaFilter.trim().replace("/", "-");
      result = result.filter((inv) =>
        inv.competencia?.includes(normalized) ||
        (inv.competencia && fmtCompetencia(inv.competencia).includes(competenciaFilter.trim()))
      );
    }

    if (clientNameFilter.trim()) {
      const lower = clientNameFilter.trim().toLowerCase();
      result = result.filter((inv) =>
        inv.tomador_nome?.toLowerCase().includes(lower)
      );
    }

    return result;
  }, [invoices, competenciaFilter, clientNameFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when filters change
  const handleStatusChange = (val: string) => {
    setStatusFilter(val as InvoiceStatus | "all");
    setPage(1);
  };
  const handleCompetenciaChange = (val: string) => {
    setCompetenciaFilter(val);
    setPage(1);
  };
  const handleClientNameChange = (val: string) => {
    setClientNameFilter(val);
    setPage(1);
  };

  // Row expansion toggle
  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Processing row action states
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleResetToPending = async (invoice: Invoice) => {
    setResettingId(invoice.id);
    try {
      await resetToPending.mutateAsync(invoice.id);
      toast.success("Invoice voltou para pendente. Você pode emitir novamente.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao resetar invoice.");
    } finally {
      setResettingId(null);
    }
  };

  const handleSyncStatus = async (invoice: Invoice) => {
    setSyncingId(invoice.id);
    try {
      await syncStatus.mutateAsync({ invoice, notaasConfig });
      toast.success("Verificação disparada. A lista será atualizada em instantes.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao verificar status.");
    } finally {
      setSyncingId(null);
    }
  };

  const handleCancelProcessandoConfirm = async () => {
    if (!cancelProcessandoTarget) return;
    if (!cancelProcessandoMotivo.trim()) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    requirePin(
      "Cancelar nota em processamento",
      "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
      async () => {
        setIsCancellingProcessando(true);
        try {
          await cancelProcessando.mutateAsync({
            invoice: cancelProcessandoTarget!,
            motivo: cancelProcessandoMotivo.trim(),
            notaasConfig,
          });
          toast.success("Nota cancelada com sucesso.");
          setCancelProcessandoTarget(null);
          setCancelProcessandoMotivo("");
        } finally {
          setIsCancellingProcessando(false);
        }
      }
    );
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    if (!cancelMotivo.trim()) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    requirePin(
      "Cancelar NFS-e",
      "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
      async () => {
        setIsCancelling(true);
        try {
          await cancel.mutateAsync({
            invoice: cancelTarget!,
            motivo: cancelMotivo.trim(),
            notaasConfig,
          });
          toast.success("NFS-e cancelada com sucesso.");
          setCancelTarget(null);
          setCancelMotivo("");
        } finally {
          setIsCancelling(false);
        }
      }
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 p-4">
        <AlertCircle className="h-4 w-4" />
        <span>Erro ao carregar notas fiscais.</span>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Competência (ex: 01/2024)"
          value={competenciaFilter}
          onChange={(e) => handleCompetenciaChange(e.target.value)}
          className="w-52"
        />

        <Input
          placeholder="Nome do cliente"
          value={clientNameFilter}
          onChange={(e) => handleClientNameChange(e.target.value)}
          className="w-56"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Nº Nota</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhuma nota fiscal encontrada.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((invoice) => {
                const isExpanded = expandedRows.has(invoice.id);
                const isRejeitada = invoice.status === "rejeitada";
                const isProcessando = invoice.status === "processando";
                const isAguardando = invoice.status === "aguardando";
                const isEmitida = invoice.status === "emitida";
                const hasPdf = isEmitida && !!invoice.pdf_url;
                const pdfPendente = isEmitida && !invoice.pdf_url;
                const hasN8nUrl = !!notaasConfig.n8n_webhook_url?.trim();
                const hasPdfWebhook = !!notaasConfig.pdf_webhook_url?.trim();
                const meta = (invoice.metadata ?? {}) as Record<string, unknown>;
                const pdfError = pdfPendente ? (meta.pdf_error as string | null) ?? null : null;

                return (
                  <tbody key={invoice.id} className="contents">
                    <TableRow
                      className={(isRejeitada || (isProcessando && !!invoice.erro_mensagem)) ? "cursor-pointer hover:bg-muted/50" : undefined}
                      onClick={(isRejeitada || (isProcessando && !!invoice.erro_mensagem)) ? () => toggleRow(invoice.id) : undefined}
                    >
                      {/* Expand toggle for rejeitada or processando with error */}
                      <TableCell className="w-8 px-2">
                        {(isRejeitada || (isProcessando && !!invoice.erro_mensagem)) ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )
                        ) : null}
                      </TableCell>

                      {/* Número da nota */}
                      <TableCell className="font-mono text-sm">
                        {invoice.numero ? (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            {invoice.numero}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Cliente */}
                      <TableCell className="max-w-[180px] truncate" title={invoice.tomador_nome ?? undefined}>
                        {invoice.tomador_nome ?? "—"}
                      </TableCell>

                      {/* Competência */}
                      <TableCell>{fmtCompetencia(invoice.competencia)}</TableCell>

                      {/* Valor */}
                      <TableCell className="text-right font-medium">
                        {fmtCurrency(invoice.valor_servico)}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>

                      {/* Data de emissão */}
                      <TableCell>{fmtDate(invoice.emitida_em)}</TableCell>

                      {/* Ações */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* PDF download/view — ativo quando tem pdf_url */}
                          {isEmitida && (
                            hasPdf ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                title="Visualizar / baixar PDF"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <a href={invoice.pdf_url!} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : (
                              <>
                                {/* Download desativado — PDF pendente */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled
                                  title="PDF ainda não gerado"
                                  className="opacity-30 cursor-not-allowed"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                {/* Botão de gerar PDF — laranja se erro, normal se pendente */}
                                {onRequestPdf && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title={
                                      !hasPdfWebhook
                                        ? "Webhook PDF não configurado"
                                        : pdfError
                                          ? `Erro anterior: ${pdfError.slice(0, 120)}`
                                          : "Gerar PDF"
                                    }
                                    disabled={!hasPdfWebhook || requestingPdfId === invoice.id}
                                    className={pdfError
                                      ? "text-red-500 hover:text-red-600 hover:bg-red-50"
                                      : "text-orange-600 hover:text-orange-700 hover:bg-orange-50"}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRequestPdf(invoice);
                                    }}
                                  >
                                    {requestingPdfId === invoice.id
                                      ? <Loader2 className="h-4 w-4 animate-spin" />
                                      : <FileText className="h-4 w-4" />}
                                  </Button>
                                )}
                              </>
                            )
                          )}

                          {/* Processando: verificar/emitir via n8n */}
                          {(isProcessando || isAguardando) && hasN8nUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Verificar na Notaas / reemitir se necessário"
                              disabled={syncingId === invoice.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSyncStatus(invoice);
                              }}
                            >
                              {syncingId === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          )}

                          {/* Processando/Aguardando: voltar para pendente */}
                          {(isProcessando || isAguardando) && canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Voltar para pendente"
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              disabled={resettingId === invoice.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResetToPending(invoice);
                              }}
                            >
                              {resettingId === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>
                          )}

                          {/* Processando/Aguardando: cancelar */}
                          {(isProcessando || isAguardando) && canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={invoice.notaas_id ? "Cancelar na Notaas" : "Cancelar pedido"}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelProcessandoTarget(invoice);
                                setCancelProcessandoMotivo("");
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Rejeitada: resetar para pendente */}
                          {isRejeitada && canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Resetar para pendente"
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              disabled={resettingId === invoice.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResetToPending(invoice);
                              }}
                            >
                              {resettingId === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>
                          )}

                          {/* Cancel button — emitida */}
                          {isEmitida && canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Cancelar NFS-e"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelTarget(invoice);
                                setCancelMotivo("");
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded error row for rejeitada or processando with error */}
                    {(isRejeitada || (isProcessando && !!invoice.erro_mensagem)) && isExpanded && (
                      <TableRow className={isRejeitada ? "bg-red-50/60" : "bg-amber-50/60"}>
                        <TableCell />
                        <TableCell colSpan={7} className="py-2 pb-3">
                          <p className={`text-sm ${isRejeitada ? "text-red-700" : "text-amber-700"}`}>
                            {cleanErrorMessage(invoice.erro_mensagem)}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </tbody>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filtered.length} nota{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Cancel confirmation dialog — processando */}
      <Dialog
        open={!!cancelProcessandoTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelProcessandoTarget(null);
            setCancelProcessandoMotivo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar nota em processamento</DialogTitle>
            <DialogDescription>
              {cancelProcessandoTarget?.notaas_id
                ? "Esta nota já foi enviada à Notaas. O cancelamento será solicitado lá e o registro será marcado como cancelado."
                : "Esta nota ainda não chegou à Notaas. O pedido de emissão será descartado."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor="cancel-processando-motivo" className="text-sm font-medium">
              Motivo <span className="text-red-500">*</span>
            </label>
            <Input
              id="cancel-processando-motivo"
              placeholder="Ex: Dados incorretos, emissão duplicada"
              value={cancelProcessandoMotivo}
              onChange={(e) => setCancelProcessandoMotivo(e.target.value)}
              disabled={isCancellingProcessando}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelProcessandoTarget(null);
                setCancelProcessandoMotivo("");
              }}
              disabled={isCancellingProcessando}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelProcessandoConfirm}
              disabled={isCancellingProcessando || !cancelProcessandoMotivo.trim()}
            >
              {isCancellingProcessando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Cancelando…
                </>
              ) : (
                "Confirmar cancelamento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation dialog — autorizada */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelMotivo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar NFS-e</DialogTitle>
            <DialogDescription>
              Informe o motivo do cancelamento da nota fiscal
              {cancelTarget?.numero ? ` nº ${cancelTarget.numero}` : ""}.
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor="cancel-motivo" className="text-sm font-medium">
              Motivo do cancelamento <span className="text-red-500">*</span>
            </label>
            <Input
              id="cancel-motivo"
              placeholder="Ex: Erro nos dados do tomador"
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              disabled={isCancelling}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelTarget(null);
                setCancelMotivo("");
              }}
              disabled={isCancelling}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelConfirm}
              disabled={isCancelling || !cancelMotivo.trim()}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Cancelando…
                </>
              ) : (
                "Confirmar cancelamento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <PinAuthDialog {...pinProps} />
    </>
  );
}
