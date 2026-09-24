/**
 * InvoiceViewModal.tsx
 * Modal de visualização de NFS-e com dados resumidos.
 * Requisitos: 6.2
 */

import { format, parseISO } from "date-fns";
import { ExternalLink, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InvoiceStatusBadge } from "@/components/fiscal/InvoiceStatusBadge";
import type { Invoice } from "@/types/fiscal";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formats a YYYY-MM string as MM/YYYY for display. */
function formatCompetencia(value: string | null): string {
  if (!value) return "—";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${month}/${year}`;
}

/** Formats an ISO date string as dd/MM/yyyy. */
function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

/** Formats a number as BRL currency. */
function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
}

// ── Sub-component: labeled row ────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Read-only modal that shows a summary of an NFS-e invoice.
 *
 * Displays: número, competência, valor, status, emissão date, and a PDF link.
 * When status is 'rejeitada', shows the rejection error message.
 */
export function InvoiceViewModal({ open, onOpenChange, invoice }: InvoiceViewModalProps) {
  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[65vw] max-w-[65vw]">
        <DialogHeader>
          <DialogTitle>
            {invoice.numero ? `NFS-e nº ${invoice.numero}` : "Nota Fiscal de Serviços"}
          </DialogTitle>
          <DialogDescription>
            Detalhes da nota fiscal eletrônica.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {/* ── Summary rows ── */}
          <InfoRow label="Status">
            <InvoiceStatusBadge status={invoice.status} />
          </InfoRow>

          <InfoRow label="Número">
            {invoice.numero ?? "—"}
          </InfoRow>

          <InfoRow label="Competência">
            {formatCompetencia(invoice.competencia)}
          </InfoRow>

          <InfoRow label="Valor do Serviço">
            {formatBRL(invoice.valor_servico)}
          </InfoRow>

          {invoice.valor_iss != null && (
            <InfoRow label="Valor ISS">
              {formatBRL(invoice.valor_iss)}
            </InfoRow>
          )}

          {invoice.valor_liquido != null && (
            <InfoRow label="Valor Líquido">
              {formatBRL(invoice.valor_liquido)}
            </InfoRow>
          )}

          {invoice.aliquota_iss != null && (
            <InfoRow label="Alíquota ISS">
              {invoice.aliquota_iss}%
            </InfoRow>
          )}

          {invoice.codigo_servico && (
            <InfoRow label="Código de Serviço">
              {invoice.codigo_servico}
            </InfoRow>
          )}

          <InfoRow label="Data de Emissão">
            {formatDate(invoice.emitida_em)}
          </InfoRow>

          {invoice.cancelada_em && (
            <InfoRow label="Data de Cancelamento">
              {formatDate(invoice.cancelada_em)}
            </InfoRow>
          )}

          {/* ── Req 6.2: rejection error message ── */}
          {invoice.status === "rejeitada" && invoice.erro_mensagem && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-700 mb-0.5">
                  Motivo da rejeição
                </p>
                <p className="text-xs text-red-600">{invoice.erro_mensagem}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {/* ── PDF link ── */}
          {invoice.status === "emitida" && invoice.pdf_url && (
            <Button variant="outline" asChild>
              <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir PDF
              </a>
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
