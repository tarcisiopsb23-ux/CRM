/**
 * CancellationTab.tsx
 * Aba de gerenciamento de cancelamentos de NFS-e.
 *
 * Status possíveis (coluna status da tabela invoices):
 *  - cancelamento_pendente  → Processando (aguardando webhook)
 *  - cancelamento_erro      → Erro (erro_mensagem contém o detalhe)
 *  - cancelada              → Autorizado
 *
 * Auto-retry a cada 1h para notas em "cancelamento_pendente".
 */

import { useEffect, useRef, useState } from "react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Invoice, NotaasConfig } from "@/types/fiscal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return "—"; }
};

const fmtAgo = (iso: string | null) => {
  if (!iso) return null;
  try { return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true }); }
  catch { return null; }
};

const fmtCompetencia = (c: string | null) => {
  if (!c) return "—";
  const [y, m] = c.split("-");
  return y && m ? `${m}/${y}` : c;
};

// ── Badge de status ───────────────────────────────────────────────────────────

function CancelStatusBadge({ status }: { status: Invoice["status"] }) {
  if (status === "cancelada") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Autorizado
      </Badge>
    );
  }
  if (status === "cancelamento_erro") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-300 gap-1">
        <XCircle className="h-3 w-3" /> Erro
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-300 gap-1">
      <Clock className="h-3 w-3" /> Processando
    </Badge>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CancellationTabProps {
  organizationId: string;
  notaasConfig: NotaasConfig;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function CancellationTab({ organizationId, notaasConfig }: CancellationTabProps) {
  const qc = useQueryClient();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const autoRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Query ─────────────────────────────────────────────────────────────────
  const { data: invoices = [], isLoading, error } = useQuery({
    queryKey: ["invoices_cancellations", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", organizationId)
        .in("status", ["cancelamento_pendente", "cancelamento_erro", "cancelada"])
        .not("motivo_cancelamento", "is", null)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
    enabled: !!organizationId,
    refetchInterval: 30_000,
  });

  // ── Disparo do webhook de cancelamento ────────────────────────────────────
  const dispararCancelamento = async (invoice: Invoice, isAuto = false) => {
    const cancelWebhookUrl =
      notaasConfig.cancel_webhook_url?.trim() || notaasConfig.n8n_webhook_url?.trim();

    if (!cancelWebhookUrl) {
      if (!isAuto) toast.error("URL do webhook de cancelamento não configurada.");
      return;
    }

    if (!invoice.notaas_id) {
      await supabase.from("invoices").update({
        status: "cancelada",
        cancelada_em: new Date().toISOString(),
        erro_mensagem: null,
      }).eq("id", invoice.id);
      qc.invalidateQueries({ queryKey: ["invoices_cancellations", organizationId] });
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
      return;
    }

    // Volta para pendente antes de tentar (limpa erro anterior)
    await supabase.from("invoices").update({
      status: "cancelamento_pendente",
      erro_mensagem: null,
    }).eq("id", invoice.id);

    try {
      const res = await fetch(cancelWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action:         "cancelar",
          invoice_id:      invoice.id,
          organization_id: organizationId,
          notaas_id:       invoice.notaas_id,
          numero:          invoice.numero ?? null,
          motivo:          invoice.motivo_cancelamento ?? "Cancelamento solicitado",
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const errMsg = `Webhook ${res.status}: ${text.slice(0, 300)}`;
        await supabase.from("invoices").update({
          status: "cancelamento_erro",
          erro_mensagem: errMsg,
        }).eq("id", invoice.id);
        if (!isAuto) toast.error(errMsg);
      } else {
        if (!isAuto) toast.success("Cancelamento reenviado. Aguardando confirmação.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase.from("invoices").update({
        status: "cancelamento_erro",
        erro_mensagem: msg,
      }).eq("id", invoice.id);
      if (!isAuto) toast.error(msg);
    } finally {
      qc.invalidateQueries({ queryKey: ["invoices_cancellations", organizationId] });
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
    }
  };

  const handleRetry = async (invoice: Invoice) => {
    setRetryingId(invoice.id);
    await dispararCancelamento(invoice, false);
    setRetryingId(null);
  };

  // ── Auto-retry a cada 1h para notas em cancelamento_pendente ─────────────
  useEffect(() => {
    if (autoRetryRef.current) clearInterval(autoRetryRef.current);

    autoRetryRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "cancelamento_pendente")
        .not("motivo_cancelamento", "is", null);

      for (const inv of data ?? []) {
        await dispararCancelamento(inv as Invoice, true);
      }
    }, 60 * 60 * 1000);

    return () => {
      if (autoRetryRef.current) clearInterval(autoRetryRef.current);
    };
  }, [organizationId, notaasConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 p-4">
        <AlertCircle className="h-4 w-4" />
        <span>Erro ao carregar cancelamentos.</span>
      </div>
    );
  }

  const pending = invoices.filter((i) => i.status === "cancelamento_pendente").length;
  const erros   = invoices.filter((i) => i.status === "cancelamento_erro").length;

  return (
    <div className="space-y-4">
      {(pending > 0 || erros > 0) && (
        <div className="flex flex-wrap gap-3 text-sm">
          {pending > 0 && (
            <span className="flex items-center gap-1.5 text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5">
              <Clock className="h-3.5 w-3.5" />
              {pending} processando — auto-retry a cada 1h
            </span>
          )}
          {erros > 0 && (
            <span className="flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">
              <XCircle className="h-3.5 w-3.5" />
              {erros} com erro — reenvio manual disponível
            </span>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Nota</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Erro</TableHead>
              <TableHead>Solicitado</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-emerald-500" />
                  Nenhum cancelamento registrado.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => {
                const requestedAt =
                  (invoice.metadata as Record<string, unknown>)?.cancel_requested_at as string | null
                  ?? invoice.cancelada_em;
                const canRetry = invoice.status === "cancelamento_pendente" || invoice.status === "cancelamento_erro";

                return (
                  <TableRow key={invoice.id} className={invoice.status === "cancelamento_erro" ? "bg-red-50/40" : undefined}>
                    <TableCell className="font-mono text-sm">
                      {invoice.numero ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="max-w-[140px] truncate" title={invoice.tomador_nome ?? undefined}>
                      {invoice.tomador_nome ?? "—"}
                    </TableCell>

                    <TableCell>{fmtCompetencia(invoice.competencia)}</TableCell>

                    <TableCell className="text-right font-medium">
                      {fmtCurrency(invoice.valor_servico)}
                    </TableCell>

                    <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground"
                      title={invoice.motivo_cancelamento ?? undefined}>
                      {invoice.motivo_cancelamento ?? "—"}
                    </TableCell>

                    <TableCell>
                      <CancelStatusBadge status={invoice.status} />
                    </TableCell>

                    <TableCell className="max-w-[220px]">
                      {invoice.erro_mensagem ? (
                        <span className="text-xs text-red-600 break-words leading-tight" title={invoice.erro_mensagem}>
                          {invoice.erro_mensagem}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      <span title={fmtDate(requestedAt)}>
                        {fmtAgo(requestedAt) ?? fmtDate(requestedAt)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      {canRetry && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Reenviar cancelamento"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          disabled={retryingId === invoice.id}
                          onClick={() => handleRetry(invoice)}
                        >
                          {retryingId === invoice.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RefreshCw className="h-4 w-4" />}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
