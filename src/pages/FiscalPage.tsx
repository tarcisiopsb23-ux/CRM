/**
 * FiscalPage.tsx — Módulo Fiscal NFS-e
 *
 * Abas: Pendentes | Processando | Autorizadas | Rejeitadas
 * Cards: Pendentes / Processando / Autorizadas / Rejeitadas
 * Filtro de período aplicado a cards e listas
 */

import { useState, useMemo, useEffect } from "react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, AlertTriangle, Settings, FileText, CheckCircle2,
  XCircle, Clock, Receipt, Loader2, FileCheck, Pencil, Trash2, Download, RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import PeriodSelector, { DateRange, getDateRangeFromPreset } from "@/components/filters/PeriodSelector";
import { InvoiceList } from "@/components/fiscal/InvoiceList";
import { InvoiceEmitModal } from "@/components/fiscal/InvoiceEmitModal";
import { InvoiceStatusBadge } from "@/components/fiscal/InvoiceStatusBadge";
import { CancellationTab } from "@/components/fiscal/CancellationTab";
import { useOrganization } from "@/hooks/useOrganization";
import { useModulePermission } from "@/hooks/usePermissions";
import { useIntegration } from "@/hooks/useSettings";
import { useInvoices } from "@/hooks/useInvoices";
import { toast } from "sonner";
import type { Invoice, NotaasConfig } from "@/types/fiscal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return "—"; }
};

const fmtCompetencia = (c: string | null) => {
  if (!c) return "—";
  const [y, m] = c.split("-");
  return y && m ? `${m}/${y}` : c;
};

// ── Período options ───────────────────────────────────────────────────────────

type PeriodKey = "current" | "last1" | "last3" | "last6" | "all" | "custom";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "current", label: "Mês atual" },
  { value: "last1",   label: "Último mês" },
  { value: "last3",   label: "Últimos 3 meses" },
  { value: "last6",   label: "Últimos 6 meses" },
  { value: "all",     label: "Todos" },
  { value: "custom",  label: "Período personalizado" },
];

function invoiceInPeriod(inv: Invoice, interval: { from: Date; to: Date }) {
  const ref = inv.created_at || inv.emitida_em;
  if (!ref) return true;
  try {
    const d = parseISO(ref);
    return d >= interval.from && d <= interval.to;
  } catch { return true; }
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color, onClick,
}: {
  label: string; value: string | number; sub?: string;
  icon: typeof FileText; color: string; onClick?: () => void;
}) {
  return (
    <Card
      className={onClick ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}
      onClick={onClick}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/60">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── CheckStatus indicator ─────────────────────────────────────────────────────

function CheckStatusBadge({
  lastCheckAt,
  lastCheckStatus,
  lastCheckResults,
  onTrigger,
  triggering,
}: {
  lastCheckAt?: string | null;
  lastCheckStatus?: string | null;
  lastCheckResults?: Record<string, unknown> | null;
  onTrigger?: () => void;
  triggering?: boolean;
}) {
  const ago = lastCheckAt
    ? formatDistanceToNow(parseISO(lastCheckAt), { locale: ptBR, addSuffix: true })
    : null;

  const results = lastCheckResults as { checked?: number; autorizada?: number; rejeitada?: number } | null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {lastCheckStatus === "success" ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : lastCheckStatus === "error" ? (
        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
      ) : (
        <Clock className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>
        {ago
          ? <>Última verificação {ago}{results?.checked != null ? ` · ${results.checked} nota${results.checked !== 1 ? "s" : ""}` : ""}{results?.autorizada ? ` · ${results.autorizada} autorizada${results.autorizada !== 1 ? "s" : ""}` : ""}{results?.rejeitada ? ` · ${results.rejeitada} rejeitada${results.rejeitada !== 1 ? "s" : ""}` : ""}</>
          : "Nenhuma verificação registrada"}
      </span>
      {onTrigger && (
        <button
          onClick={onTrigger}
          disabled={triggering}
          className="ml-1 p-0.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
          title="Verificar agora"
        >
          <RefreshCw className={`h-3 w-3 ${triggering ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}

export default function FiscalPage({ embedded = false }: { embedded?: boolean }) {
  const organizationId = useOrganization();
  const { canCreate, canDelete } = useModulePermission("fiscal" as any);
  const { pinProps, requirePin } = usePinConfirm();

  const integrationQuery = useIntegration(organizationId, "notaas");
  const notaasConfig = (integrationQuery.data?.config ?? {}) as NotaasConfig;
  const isApiKeyMissing = !notaasConfig.api_key;

  // Dados da última checagem automática (gravados pelo workflow nfse_check via RPC)
  const integrationData = integrationQuery.data as any;
  const lastCheckAt      = integrationData?.last_check_at      ?? null;
  const lastCheckStatus  = integrationData?.last_check_status  ?? null;
  const lastCheckResults = integrationData?.last_check_results ?? null;

  const [triggeringCheck, setTriggeringCheck] = useState(false);

  const handleTriggerCheck = async () => {
    const checkUrl = notaasConfig.check_webhook_url?.trim();
    if (!checkUrl) {
      toast.error("URL do webhook de verificação não configurada em Configurações → Fiscal.");
      return;
    }
    setTriggeringCheck(true);
    try {
      await fetch(checkUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: organizationId }) });
      toast.success("Verificação disparada. Os resultados aparecerão em instantes.");
      setTimeout(() => integrationQuery.refetch?.(), 5000);
    } catch {
      toast.error("Erro ao acionar o webhook de verificação.");
    } finally {
      setTriggeringCheck(false);
    }
  };

  const [activeTab, setActiveTab] = useState("pendentes");
  const [period, setPeriod] = useState<PeriodKey>("current");
  const [selectedRange, setSelectedRange] = useState<DateRange>(() => getDateRangeFromPreset("current"));

  const interval = selectedRange;
  // Adapta DateRange { from, to } → { start, end } esperado pelo InvoiceList
  const invoiceInterval = interval
    ? { start: interval.from, end: interval.to }
    : null;

  // Filtros de data para a query do Supabase (por due_date do pagamento)
  const dateFilters = useMemo(() => {
    if (!interval) return {};
    const fmt = (d: Date) => format(d, "yyyy-MM-dd");
    return {
      due_date_from: fmt(interval.from),
      due_date_to:   fmt(interval.to),
    };
  }, [interval]);

  const { data: allInvoices = [], isLoading: loadingInvoices, refetch: refetchInvoices, sendInvoice, deleteInvoice, resetToPending, syncStatus } = useInvoices(organizationId, dateFilters);
  const [emitModalOpen, setEmitModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Invoice | null>(null);

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Send confirm state
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [requestingPdfId, setRequestingPdfId] = useState<string | null>(null);

  // Notas emitidas sem PDF (já filtradas pelo período via query)
  const noPdfInvoices = useMemo(() =>
    allInvoices.filter((i) => i.status === "emitida" && !i.pdf_url),
    [allInvoices]
  );

  // ── Stats (já filtrados pelo período via query) ───────────────────────────
  const stats = useMemo(() => {
    const pendentes   = allInvoices.filter((i) => i.status === "pendente");
    const processando = allInvoices.filter((i) => i.status === "processando" || i.status === "aguardando");
    const emitidas    = allInvoices.filter((i) => i.status === "emitida");
    const rejeitadas  = allInvoices.filter((i) => i.status === "rejeitada" && !!i.notaas_id);
    return {
      pendentes:    pendentes.length,
      processando:  processando.length,
      autorizadas:  emitidas.length,
      rejeitadas:   rejeitadas.length,
      totalEmitido: emitidas.reduce((s, i) => s + i.valor_servico, 0),
    };
  }, [allInvoices]);

  // ── Pendentes (já filtrados pelo período via query) ───────────────────────
  const pendingInvoices = useMemo(() =>
    allInvoices.filter((i) => i.status === "pendente"),
    [allInvoices]
  );

  const handleSend = async (invoice: Invoice) => {
    setSendingId(invoice.id);
    try {
      await sendInvoice.mutateAsync({ invoice, notaasConfig });
      toast.success("Nota enviada para processamento.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar nota.");
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    requirePin(
      "Excluir nota fiscal",
      "Esta ação não pode ser desfeita. Digite seu PIN para confirmar.",
      async () => {
        setIsDeleting(true);
        try {
          await deleteInvoice.mutateAsync(deleteTarget!.id);
          toast.success("Nota excluída.");
          setDeleteTarget(null);
        } finally {
          setIsDeleting(false);
        }
      }
    );
  };

  const handleResetToPending = async (invoice: Invoice) => {
    setResettingId(invoice.id);
    try {
      await resetToPending.mutateAsync(invoice.id);
      toast.success("Nota voltou para pendente.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao resetar nota.");
    } finally {
      setResettingId(null);
    }
  };

  const handleSync = async (invoice: Invoice) => {
    setSyncingId(invoice.id);
    try {
      await syncStatus.mutateAsync({ invoice, notaasConfig });
      toast.success("Verificação disparada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao verificar.");
    } finally {
      setSyncingId(null);
    }
  };

  const handleRequestPdf = async (invoice: Invoice) => {
    const pdfWebhookUrl = notaasConfig.pdf_webhook_url?.trim();
    if (!pdfWebhookUrl) {
      toast.error("URL do webhook PDF não configurada. Configure em Configurações → Notaas.");
      return;
    }
    setRequestingPdfId(invoice.id);
    try {
      const res = await fetch(pdfWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id:        invoice.id,
          organization_id:   organizationId,
          notaas_id:         invoice.notaas_id,
          numero:            invoice.numero,
          client_id:         invoice.client_id,
          payment_id:        invoice.payment_id,
          contract_id:       invoice.contract_id,
          competencia:       invoice.competencia,
          valor_servico:     invoice.valor_servico,
          aliquota_iss:      invoice.aliquota_iss,
          codigo_servico:    invoice.codigo_servico,
          descricao_servico: invoice.descricao_servico,
          tomador_nome:      invoice.tomador_nome,
          tomador_cnpj_cpf:  invoice.tomador_cnpj_cpf,
          emitida_em:        invoice.emitida_em,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Webhook respondeu ${res.status}: ${text.slice(0, 100)}`);
      }
      toast.success("Solicitação de PDF enviada. O arquivo será arquivado em instantes.");
      // Aguarda o workflow processar e refaz a query para remover da lista
      setTimeout(() => refetchInvoices(), 5_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao solicitar PDF.");
    } finally {
      setRequestingPdfId(null);
    }
  };

  // Auto-disparo a cada 1h para notas emitidas sem pdf_url
  useEffect(() => {
    if (!notaasConfig.pdf_webhook_url?.trim()) return;

    const triggerPendingPdfs = async () => {
      const pending = allInvoices.filter((i) => i.status === "emitida" && !i.pdf_url);
      for (const inv of pending) {
        try {
          await fetch(notaasConfig.pdf_webhook_url!.trim(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invoice_id:        inv.id,
              organization_id:   organizationId,
              notaas_id:         inv.notaas_id,
              numero:            inv.numero,
              client_id:         inv.client_id,
              payment_id:        inv.payment_id,
              contract_id:       inv.contract_id,
              competencia:       inv.competencia,
              valor_servico:     inv.valor_servico,
              aliquota_iss:      inv.aliquota_iss,
              codigo_servico:    inv.codigo_servico,
              descricao_servico: inv.descricao_servico,
              tomador_nome:      inv.tomador_nome,
              tomador_cnpj_cpf:  inv.tomador_cnpj_cpf,
              emitida_em:        inv.emitida_em,
            }),
            signal: AbortSignal.timeout(15_000),
          });
        } catch {
          // best-effort — falha silenciosa por nota
        }
      }
    };

    const interval = setInterval(triggerPendingPdfs, 60 * 60 * 1000); // 1h
    return () => clearInterval(interval);
  }, [allInvoices, notaasConfig.pdf_webhook_url, organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho — oculto quando embutido no Financeiro */}
      {!embedded && (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Fiscal / NFS-e</h1>
          <p className="text-sm text-muted-foreground">Emissão e gerenciamento de Notas Fiscais de Serviços Eletrônicas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtro de período */}
          <PeriodSelector
            initialPreset={period}
            options={PERIOD_OPTIONS}
            onChange={(range, preset) => {
              setSelectedRange(range);
              setPeriod(preset as PeriodKey);
            }}
          />
          {canCreate && (
            <Button onClick={() => setEmitModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Emitir NFS-e
            </Button>
          )}
        </div>
      </div>
      )}

      {/* Controles quando embutido */}
      {embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PeriodSelector
              initialPreset={period}
              options={PERIOD_OPTIONS}
              onChange={(range, preset) => {
                setSelectedRange(range);
                setPeriod(preset as PeriodKey);
              }}
            />
          </div>
          {canCreate && (
            <Button onClick={() => setEmitModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Emitir NFS-e
            </Button>
          )}
        </div>
      )}

      {/* Banner configuração ausente */}
      {isApiKeyMissing && (
        <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-700">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              A integração com a Notaas ainda não está configurada. Configure a <strong>API Key</strong> nas configurações fiscais.
            </span>
            <Button variant="outline" size="sm" asChild className="shrink-0 border-amber-600 text-amber-700 hover:bg-amber-100">
              <Link to="/settings?tab=integrations">
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Configurar
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Pendentes" value={loadingInvoices ? "…" : stats.pendentes}
          sub="aguardando envio" icon={Receipt} color="text-amber-600"
          onClick={() => setActiveTab("pendentes")}
        />
        <StatCard
          label="Processando" value={loadingInvoices ? "…" : stats.processando}
          sub="aguardando retorno" icon={Clock} color="text-blue-600"
          onClick={() => setActiveTab("processando")}
        />
        <StatCard
          label="Autorizadas" value={loadingInvoices ? "…" : stats.autorizadas}
          sub={loadingInvoices ? "" : fmtCurrency(stats.totalEmitido)}
          icon={CheckCircle2} color="text-emerald-600"
          onClick={() => setActiveTab("autorizadas")}
        />
        <StatCard
          label="Rejeitadas" value={loadingInvoices ? "…" : stats.rejeitadas}
          sub="verificar erros" icon={XCircle} color="text-red-600"
          onClick={() => setActiveTab("rejeitadas")}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pendentes">
            Pendentes
            {stats.pendentes > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {stats.pendentes}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="processando">
            Processando
            {stats.processando > 0 && (
              <span className="ml-2 rounded-full bg-blue-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {stats.processando}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="autorizadas">Autorizadas</TabsTrigger>
          <TabsTrigger value="rejeitadas">
            Rejeitadas
            {stats.rejeitadas > 0 && (
              <span className="ml-2 rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {stats.rejeitadas}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sem-pdf">
            PDF Pendente
            {noPdfInvoices.length > 0 && (
              <span className="ml-2 rounded-full bg-orange-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {noPdfInvoices.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="cancelamentos">Cancelamentos</TabsTrigger>
        </TabsList>

        {/* ── Aba Pendentes ── */}
        <TabsContent value="pendentes" className="mt-4">
          {loadingInvoices ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : pendingInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-medium">Nenhuma nota pendente no período.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium max-w-[180px] truncate" title={inv.tomador_nome ?? undefined}>
                        {inv.tomador_nome ?? "—"}
                      </TableCell>
                      <TableCell>{fmtCompetencia(inv.competencia)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtCurrency(inv.valor_servico)}</TableCell>
                      <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Enviar */}
                          {canCreate && (
                            <Button
                              size="sm" variant="ghost"
                              title="Enviar para emissão"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              disabled={sendingId === inv.id}
                              onClick={() => handleSend(inv)}
                            >
                              {sendingId === inv.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <FileCheck className="h-4 w-4" />}
                            </Button>
                          )}
                          {/* Editar */}
                          {canCreate && (
                            <Button
                              size="sm" variant="ghost"
                              title="Editar nota"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => setEditTarget(inv)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {/* Excluir */}
                          {canDelete && (
                            <Button
                              size="sm" variant="ghost"
                              title="Excluir nota"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(inv)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Aba Processando ── */}
        <TabsContent value="processando" className="mt-4">
          <div className="mb-3">
            <CheckStatusBadge
              lastCheckAt={lastCheckAt}
              lastCheckStatus={lastCheckStatus}
              lastCheckResults={lastCheckResults}
              onTrigger={handleTriggerCheck}
              triggering={triggeringCheck}
            />
          </div>
          <InvoiceList
            organizationId={organizationId}
            initialStatus="processando"
            periodInterval={invoiceInterval}
            onRequestPdf={handleRequestPdf}
            requestingPdfId={requestingPdfId}
          />
        </TabsContent>

        {/* ── Aba Autorizadas ── */}
        <TabsContent value="autorizadas" className="mt-4">
          <InvoiceList
            organizationId={organizationId}
            initialStatus="emitida"
            periodInterval={invoiceInterval}
            onRequestPdf={handleRequestPdf}
            requestingPdfId={requestingPdfId}
          />
        </TabsContent>

        {/* ── Aba Rejeitadas ── */}
        <TabsContent value="rejeitadas" className="mt-4">
          <InvoiceList
            organizationId={organizationId}
            initialStatus="rejeitada"
            periodInterval={invoiceInterval}
            extraFilter={(inv) => !!inv.notaas_id}
          />
        </TabsContent>

        {/* ── Aba PDF Pendente ── */}
        <TabsContent value="sem-pdf" className="mt-4">
          <div className="mb-3">
            <CheckStatusBadge
              lastCheckAt={lastCheckAt}
              lastCheckStatus={lastCheckStatus}
              lastCheckResults={lastCheckResults}
              onTrigger={handleTriggerCheck}
              triggering={triggeringCheck}
            />
          </div>
          {loadingInvoices ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : noPdfInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-medium">Todas as notas autorizadas têm PDF no período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {!notaasConfig.pdf_webhook_url && (
                <Alert className="border-amber-500 bg-amber-50 text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="flex items-center justify-between gap-4">
                    <span>Configure o webhook de PDF nas configurações para solicitar a geração.</span>
                    <Button variant="outline" size="sm" asChild className="shrink-0 border-amber-600 text-amber-700 hover:bg-amber-100">
                      <Link to="/settings?tab=integrations">
                        <Settings className="h-3.5 w-3.5 mr-1.5" />
                        Configurar
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Nota</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Competência</TableHead>
                      <TableHead>Emissão</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Erro PDF</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {noPdfInvoices.map((inv) => {
                      const meta = (inv.metadata ?? {}) as Record<string, unknown>;
                      const pdfError = (meta.pdf_error as string | null) ?? null;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-sm">
                            {inv.numero ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate" title={inv.tomador_nome ?? undefined}>
                            {inv.tomador_nome ?? "—"}
                          </TableCell>
                          <TableCell>{fmtCompetencia(inv.competencia)}</TableCell>
                          <TableCell>{fmtDate(inv.emitida_em)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtCurrency(inv.valor_servico)}</TableCell>
                          <TableCell className="max-w-[220px]">
                            {pdfError ? (
                              <span
                                className="text-xs text-red-600 truncate block"
                                title={pdfError}
                              >
                                {pdfError.slice(0, 80)}{pdfError.length > 80 ? "…" : ""}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm" variant="outline"
                              title={pdfError ? `Tentar novamente (erro anterior: ${pdfError.slice(0, 60)})` : "Solicitar geração e arquivamento do PDF"}
                              className={pdfError
                                ? "text-red-600 border-red-300 hover:bg-red-50"
                                : "text-orange-600 border-orange-300 hover:bg-orange-50"}
                              disabled={requestingPdfId === inv.id || !notaasConfig.pdf_webhook_url}
                              onClick={() => handleRequestPdf(inv)}
                            >
                              {requestingPdfId === inv.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                : <Download className="h-3.5 w-3.5 mr-1.5" />}
                              {pdfError ? "Tentar novamente" : "Gerar PDF"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Aba Cancelamentos ── */}
        <TabsContent value="cancelamentos" className="mt-4">
          <CancellationTab
            organizationId={organizationId}
            notaasConfig={notaasConfig}
          />
        </TabsContent>
      </Tabs>

      {/* Modal emissão manual */}
      {canCreate && (
        <InvoiceEmitModal
          open={emitModalOpen}
          onOpenChange={setEmitModalOpen}
          organizationId={organizationId}
        />
      )}

      {/* Modal edição de pendente */}
      {editTarget && canCreate && (
        <InvoiceEmitModal
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          organizationId={organizationId}
          defaultClientId={editTarget.client_id}
          defaultContractId={editTarget.contract_id ?? undefined}
          defaultPaymentId={editTarget.payment_id ?? undefined}
          defaultValorServico={editTarget.valor_servico}
        />
      )}

      {/* Dialog exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir nota fiscal</DialogTitle>
            <DialogDescription>
              Esta ação removerá permanentemente o registro da nota pendente. Não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PinAuthDialog {...pinProps} />
    </div>
  );
}
