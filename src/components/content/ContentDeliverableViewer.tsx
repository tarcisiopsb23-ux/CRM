/**
 * ContentDeliverableViewer
 *
 * Visualizador e gerador de PDF para entregáveis de conteúdo.
 * Renderiza o relatório em um <iframe> e chama window.print() para salvar como PDF.
 * Padrão idêntico ao ContractViewer: @page { margin: 0 }, timbrado como <img> absoluta.
 *
 * Uso:
 *   <ContentDeliverableViewer deliverable={d} items={publishedItems} onClose={() => {}} />
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ContentDeliverable } from "@/hooks/useContentDeliverables";
import type { ContentItem } from "@/hooks/useContentItems";

// ── CSS do relatório (idêntico ao contrato: @page margin:0, corpo com padding) ─

const reportCss = (usableW: number) => `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @page { margin: 0; size: A4 portrait; }
  html, body {
    font-family: "Calibri", Calibri, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #000;
    width: ${usableW}px;
    overflow: visible;
  }
  .page {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page .lh {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    z-index: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page .content {
    position: relative;
    z-index: 1;
    padding: var(--mt) var(--mr) var(--mb) var(--ml);
  }
  h1 { font-size: 16pt; font-weight: bold; text-align: center; margin-bottom: 12pt; color: #1e293b; }
  h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase;
       margin: 14pt 0 6pt; border-bottom: 1px solid #aaa; padding-bottom: 3pt; color: #334155; }
  p  { margin: 3pt 0; text-align: justify; }
  .subtitle { text-align: center; color: #64748b; font-size: 10pt; margin-bottom: 20pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 11pt; }
  th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 5pt 8pt;
       text-align: left; font-weight: bold;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td { border: 1px solid #e2e8f0; padding: 4pt 8pt; }
  .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin: 10pt 0; }
  .metric-box { border: 1px solid #e2e8f0; border-radius: 4pt; padding: 8pt 10pt; text-align: center; }
  .metric-value { font-size: 18pt; font-weight: bold; color: #7c3aed; }
  .metric-label { font-size: 9pt; color: #64748b; margin-top: 2pt; }
  .notes { background: #f8fafc; border-left: 3pt solid #7c3aed; padding: 8pt 12pt; margin: 8pt 0; color: #334155; }
  .platform-row td:first-child { font-weight: bold; }
  .status-published { color: #16a34a; font-weight: bold; }
`;

// ── A4 constants ──────────────────────────────────────────────────────────────

const PAGE_W_PX  = 794;   // 210mm a 96dpi
const PAGE_H_PX  = 1123;  // 297mm a 96dpi

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ContentDeliverableViewerProps {
  deliverable:    ContentDeliverable;
  items:          ContentItem[];
  /** URL do logo do cliente (opcional) */
  logoUrl?:       string;
  onClose:        () => void;
}

// ── Monta o HTML do relatório ─────────────────────────────────────────────────

function buildReportHtml(
  d:      ContentDeliverable,
  items:  ContentItem[],
): string {
  const period = [
    d.period_start && format(parseISO(d.period_start), "dd/MM/yyyy", { locale: ptBR }),
    d.period_end   && format(parseISO(d.period_end),   "dd/MM/yyyy", { locale: ptBR }),
  ].filter(Boolean).join(" a ");

  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  // Plataformas únicas e contagem por plataforma
  const platformCounts: Record<string, number> = {};
  const typeCounts:     Record<string, number> = {};
  for (const item of items) {
    if (item.platform)     platformCounts[item.platform]     = (platformCounts[item.platform]     ?? 0) + 1;
    if (item.content_type) typeCounts[item.content_type]     = (typeCounts[item.content_type]     ?? 0) + 1;
  }

  const platformRows = Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([p, c]) => `<tr><td class="platform-row">${p.charAt(0).toUpperCase() + p.slice(1)}</td><td>${c}</td></tr>`)
    .join("");

  const typeRows = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `<tr><td>${t.charAt(0).toUpperCase() + t.slice(1)}</td><td>${c}</td></tr>`)
    .join("");

  const itemRows = items.map(item => `
    <tr>
      <td class="status-published">${item.status === "publicado" ? "✓ Publicado" : item.status}</td>
      <td>${item.title}</td>
      <td>${item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : "—"}</td>
      <td>${item.content_type ? item.content_type.charAt(0).toUpperCase() + item.content_type.slice(1) : "—"}</td>
      <td>${item.scheduled_date ? format(parseISO(item.scheduled_date), "dd/MM/yy", { locale: ptBR }) : "—"}</td>
    </tr>
  `).join("");

  return `
    <h1>${d.title}</h1>
    <p class="subtitle">
      ${period ? `Período: ${period}` : ""}
      ${period ? " &nbsp;|&nbsp; " : ""}
      Gerado em ${today}
    </p>

    ${d.description ? `<p style="margin-bottom:12pt">${d.description}</p>` : ""}

    <h2>Resultados do Período</h2>
    <div class="metric-grid">
      <div class="metric-box">
        <div class="metric-value">${d.items_count}</div>
        <div class="metric-label">Itens Publicados</div>
      </div>
      ${d.reach_total > 0 ? `
      <div class="metric-box">
        <div class="metric-value">${d.reach_total.toLocaleString("pt-BR")}</div>
        <div class="metric-label">Alcance Total</div>
      </div>` : ""}
      ${d.engagement_total > 0 ? `
      <div class="metric-box">
        <div class="metric-value">${d.engagement_total.toLocaleString("pt-BR")}</div>
        <div class="metric-label">Engajamento Total</div>
      </div>` : ""}
    </div>

    ${platformRows ? `
    <h2>Distribuição por Plataforma</h2>
    <table>
      <tr><th>Plataforma</th><th>Itens</th></tr>
      ${platformRows}
    </table>` : ""}

    ${typeRows ? `
    <h2>Distribuição por Tipo</h2>
    <table>
      <tr><th>Tipo de Conteúdo</th><th>Quantidade</th></tr>
      ${typeRows}
    </table>` : ""}

    ${d.summary_notes ? `
    <h2>Observações</h2>
    <div class="notes">${d.summary_notes}</div>` : ""}

    ${itemRows ? `
    <h2>Detalhamento dos Itens</h2>
    <table>
      <tr>
        <th>Status</th>
        <th>Título</th>
        <th>Plataforma</th>
        <th>Tipo</th>
        <th>Data</th>
      </tr>
      ${itemRows}
    </table>` : ""}
  `;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ContentDeliverableViewer({
  deliverable,
  items,
  logoUrl,
  onClose,
}: ContentDeliverableViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);

  // Margens em mm (padrão A4)
  const mt = 25; const mb = 25; const ml = 25; const mr = 25;
  const MM     = 3.7795;
  const mtPx   = Math.round(mt * MM);
  const mbPx   = Math.round(mb * MM);
  const mlPx   = Math.round(ml * MM);
  const mrPx   = Math.round(mr * MM);
  const usableW = PAGE_W_PX - mlPx - mrPx;

  const htmlContent = buildReportHtml(deliverable, items);

  useEffect(() => {
    setLoading(true);

    const iframeDoc = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    ${reportCss(usableW)}
    .page { --mt: ${mtPx}px; --mb: ${mbPx}px; --ml: ${mlPx}px; --mr: ${mrPx}px; }
    @media print { .page { page-break-after: always; break-after: page; } }
  </style>
</head>
<body>
  <div class="page">
    ${logoUrl ? `<img class="lh" src="${logoUrl}" crossorigin="anonymous" alt="" />` : ""}
    <div class="content">${htmlContent}</div>
  </div>
</body>
</html>`;

    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(iframeDoc);
    doc.close();

    const adjustAndFinish = () => {
      const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
      if (h > 0 && iframe) iframe.style.height = `${h}px`;
      setLoading(false);
    };

    const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
    if (imgs.length === 0) {
      adjustAndFinish();
    } else {
      let loaded = 0;
      const onLoad = () => { if (++loaded >= imgs.length) adjustAndFinish(); };
      imgs.forEach(img => {
        if (img.complete && img.naturalHeight > 0) onLoad();
        else { img.onload = onLoad; img.onerror = onLoad; }
      });
      setTimeout(adjustAndFinish, 3000);
    }
  }, [htmlContent, logoUrl, mtPx, mbPx, mlPx, mrPx, usableW]);

  const handlePrint = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    toast.info("No diálogo, selecione 'Salvar como PDF' como destino.", { duration: 6000 });
    win.focus();
    setTimeout(() => win.print(), 400);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Barra de ações */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background shrink-0">
        <span className="text-sm font-medium flex-1 truncate">{deliverable.title}</span>
        <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Salvar PDF
        </Button>
        <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading}>
          <Printer className="h-3.5 w-3.5 mr-1.5" />
          Imprimir
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-4">
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Gerando relatório...</span>
          </div>
        )}
        <div style={{ display: loading ? "none" : "block" }}>
          <iframe
            ref={iframeRef}
            className="mx-auto shadow-xl bg-white"
            style={{ width: `${PAGE_W_PX}px`, minHeight: `${PAGE_H_PX}px`, border: "none" }}
            title="Relatório de Entregável"
          />
        </div>
      </div>
    </div>
  );
}
