/**
 * ContractViewer — iframe WYSIWYG com divisão manual de páginas
 *
 * - splitIntoPages: divide o HTML em páginas usando offsetHeight no iframe
 * - Cada folha: div 210x297mm, overflow:hidden, <img> absoluta cobrindo 100%
 * - Timbrado borda a borda em cada folha
 * - @page { margin: 0 } + break-after:page para impressão correta
 */
import { useEffect, useCallback, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ContractV2 } from "@/hooks/useContracts";
import type { ContractTemplate } from "@/hooks/useContractTemplates";
import type { ContractPaymentLine } from "@/hooks/useContractSchedule";

interface Props {
  contract: ContractV2;
  template: ContractTemplate | null;
  onClose?: () => void;
  /** Callback chamado ao gerar PDF/imprimir — deve marcar o contrato como "emitido" */
  onEmit?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildScheduleHtml(lines: ContractPaymentLine[]): string {
  if (!lines || lines.length === 0) return "";
  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const monthlyLines = lines.filter(l => l.line_type === "mensalidade");
  const setupLines   = lines.filter(l => l.line_type === "setup" || l.line_type === "unico");
  const isSimple     = monthlyLines.length === 1 && setupLines.length === 0
                     && monthlyLines[0].month_to === null;

  if (isSimple) {
    const m = monthlyLines[0];
    const fmtDate = m.due_date
      ? new Date(m.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
      : "";
    return `<p>O valor mensal do presente contrato é de <strong>${fmt(m.amount)}</strong>, `
      + `vencendo todo dia ${m.due_date ? new Date(m.due_date).getDate() : "___"} de cada mês`
      + (fmtDate ? `, com primeira parcela em ${fmtDate}` : "")
      + `, a ser pago exclusivamente via PIX (Chave CNPJ: 62.659.676/0001-49 — Agência C8 LTDA).</p>`;
  }

  const rows = lines.map(l => `
    <tr>
      <td>${l.period_label}</td>
      ${l.due_date
        ? `<td>${new Date(l.due_date).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" })}</td>`
        : "<td>—</td>"}
      <td class="amount-col">${fmt(l.amount)}</td>
    </tr>`).join("");

  return `
    <p>O cronograma de pagamentos do presente contrato é o seguinte:</p>
    <table class="schedule-table">
      <thead><tr><th>Período</th><th>Vencimento</th><th>Valor</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Pagamentos via PIX (CNPJ: 62.659.676/0001-49 — Agência C8 LTDA).</p>
    <p>Atraso: multa de 10% + juros de 1% ao mês.</p>`;
}

function renderTemplate(
  html: string,
  variables: Record<string, unknown>,
  scheduleHtml: string,
): string {
  let result = html;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value ?? ""));
  }
  result = result.replace(/\{\{cronograma_pagamento\}\}/g, scheduleHtml);
  result = result.replace(/\{\{[^}]+\}\}/g, "___");
  return result;
}

// ── CSS base — idêntico no iframe de medição e no documento final ─────────────

const contractCss = (usableW: number) => `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: "Calibri", Calibri, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #000;
    width: ${usableW}px;
    overflow: visible;
  }
  h1 { font-size:14pt; font-weight:bold; text-align:center;
       text-transform:uppercase; margin:0 0 16pt; letter-spacing:.5pt;
       border:none !important; padding-top:0; }
  h2 { font-size:12pt; font-weight:bold; text-transform:uppercase;
       margin:12pt 0 6pt; border-bottom:1px solid #888; padding-bottom:3pt;
       page-break-after:avoid; break-after:avoid; }
  p  { margin:3pt 0; text-align:justify; orphans:3; widows:3; }
  /* Parágrafo vazio (Enter no editor) — garante altura visível no preview */
  p:empty, p br:only-child { min-height:1.4em; display:block; }
  ul, ol { margin:5pt 0 5pt 22pt; }
  li { margin:2pt 0; text-align:justify; }
  strong { font-weight:bold; }
  em     { font-style:italic; }
  u      { text-decoration:underline; }
  section { display:block; }
  hr { display:none !important; }

  .contract-title { font-size:14pt; font-weight:bold; text-align:center;
                    text-transform:uppercase; margin:0 0 16pt; border:none !important; }
  .contract-parties { margin-bottom:20pt; }
  .contract-parties p { margin:3pt 0; text-align:justify; }

  /* Cláusula: sem page-break-inside — permite quebrar entre alíneas */
  .contract-clause { margin-bottom:14pt; }
  .contract-clause h2 { font-size:12pt; font-weight:bold; text-transform:uppercase;
                        margin:8pt 0 4pt; border-bottom:1px solid #888; padding-bottom:2pt;
                        page-break-after:avoid; break-after:avoid; }
  /* Alínea: pode quebrar entre alíneas, cada alínea é coesa */
  .contract-clause .alinea { margin-bottom:4pt; }
  .contract-clause p  { margin:3pt 0; text-align:justify; orphans:3; widows:3; }
  .contract-clause ul,
  .contract-clause ol { margin:5pt 0 5pt 22pt; }
  .contract-clause li { margin:2pt 0; text-align:justify; }

  /* ── Hierarquia de nós (migration 00216) ─────────────────────────────── */
  .contract-node       { display:block; }
  .clause-node-row     { display:flex; gap:6pt; align-items:baseline; }
  .clause-marker       { flex-shrink:0; font-weight:normal; min-width:2em; }
  .clause-node-content { flex:1; }
  .clause-node-content p { margin:3pt 0; text-align:justify; orphans:3; widows:3; }
  .clause-children     { margin-left:18pt; }
  /* Espaçamentos por profundidade */
  .clause-depth-0      { margin-bottom:4pt; }
  .clause-depth-1      { margin-bottom:3pt; }
  .clause-depth-2      { margin-bottom:2pt; }
  .clause-depth-3      { margin-bottom:2pt; }

  .contract-signatures { margin-top:28pt; }
  .contract-signatures p { margin:3pt 0; text-align:justify; }
  .signature-block { display:table; width:100%; table-layout:fixed; margin-top:36pt; min-height:60pt; }
  .signature-line  { display:table-cell; text-align:center; min-height:40pt; padding:0 16pt; }
  .witnesses-block { display:table; width:100%; table-layout:fixed; margin-top:36pt; min-height:60pt; }

  /* Blocos de assinatura configuráveis — classes novas (sig-row-*) e retrocompat (sig-block-*) */
  .sig-row-single { margin-top:36pt; }
  .sig-row-single .sig-line { border-bottom:1px solid #000; margin-bottom:4pt; min-height:18pt; }
  .sig-row-table  { display:table; width:100%; table-layout:fixed; margin-top:36pt; }
  .sig-col        { display:table-cell; text-align:center; padding:0 16pt; vertical-align:bottom; }
  .sig-col .sig-line { border-bottom:1px solid #000; margin-bottom:4pt; min-height:18pt; }
  .sig-row-single p, .sig-col p { margin:3pt 0; text-align:center; }
  /* Retrocompatibilidade */
  .sig-block-single { margin-top:36pt; }
  .sig-block-single .sig-line { border-bottom:1px solid #000; margin-bottom:4pt; min-height:18pt; }
  .sig-block-table { display:table; width:100%; table-layout:fixed; margin-top:36pt; }
  .sig-block-single p { margin:3pt 0; text-align:center; }

  table { width:100%; border-collapse:collapse; font-size:11pt; margin:8pt 0; }
  th { background:#f0f0f0; border:1px solid #999; padding:4pt 7pt;
       text-align:left; font-weight:bold;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  td { border:1px solid #ccc; padding:3pt 7pt; }

  /* Tabela de assinatura — sem bordas, colunas fixas, respeitando margens */
  table.sig-table {
    border: none;
    margin-top: 36pt;
    width: 100%;
    table-layout: fixed;   /* colunas com largura fixa igual, não moldadas ao texto */
    border-collapse: collapse;
  }
  table.sig-table td {
    border: none;
    text-align: center;
    padding: 0 12pt;
    vertical-align: top;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  table.sig-table p  { margin:3pt 0; text-align:center; min-height:1.4em; }
  table.sig-table .sig-line { border-bottom:1px solid #000; margin-bottom:4pt; min-height:18pt; display:block; }
  .amount-col { text-align:right; font-variant-numeric:tabular-nums; }
  .schedule-table { width:100%; border-collapse:collapse; font-size:11pt; }
  .schedule-table th { background:#f0f0f0; border:1px solid #999; padding:4pt 7pt;
                       text-align:left; font-weight:bold;
                       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .schedule-table td { border:1px solid #ccc; padding:3pt 7pt; }

  /* Marcador de letra a), b), c)... */
  p[data-alpha-list] { padding-left:2em; }
  p[data-alpha-list]::before { content: attr(data-alpha-list) ") "; }

  /* Remove qualquer borda do elemento antes do título */
  *:has(+ h1), *:has(+ .contract-title), .contract-header-space { border-bottom:none !important; border:none !important; }
  h1, .contract-title { border:none !important; border-top:none !important; padding-top:0 !important; }
`;

// ── A4 constants ──────────────────────────────────────────────────────────────

const PAGE_W_PX = 794;   // 210mm a 96dpi
const PAGE_H_PX = 1123;  // 297mm a 96dpi

// ── splitIntoPages ────────────────────────────────────────────────────────────

/**
 * Divide o HTML em páginas A4.
 * O iframe de medição usa os mesmos estilos do documento final.
 * fitElement distribui elementos recursivamente respeitando usableH.
 */
function splitIntoPages(
  htmlContent: string,
  mtPx: number,
  mbPx: number,
  mlPx: number,
  mrPx: number,
): Promise<{ pages: string[]; lastPageUsed: number }> {
  const usableW = PAGE_W_PX - mlPx - mrPx;
  const usableH = PAGE_H_PX - mtPx - mbPx;

  return new Promise(resolve => {
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, {
      position: "fixed", top: "0", left: "0",
      width: `${usableW}px`, height: `${PAGE_H_PX * 20}px`,
      border: "none", opacity: "0", pointerEvents: "none", zIndex: "-9999",
    });
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>${contractCss(usableW)}</style></head><body>${htmlContent}</body></html>`);
    doc.close();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const pages: string[] = [];
        let pageHtml = "";
        let pageUsed = 0;

        // Altura estimada de uma linha (12pt * 1.6 * 96/72 ≈ 26px)
        const LINE_H_PX = Math.round(12 * 1.6 * (96 / 72));
        const MIN_SPLIT  = 3; // só divide parágrafo se >= 3 linhas

        // ── splitParagraph: divide <p> por palavras ─────────────────────
        function splitParagraph(el: HTMLElement, spaceLeft: number): [string, string] | null {
          const elH = el.offsetHeight;
          if (elH < LINE_H_PX * MIN_SPLIT) return null;
          if (spaceLeft < LINE_H_PX * MIN_SPLIT) return null;

          const linesFit = Math.floor(spaceLeft / LINE_H_PX);
          if (linesFit < MIN_SPLIT) return null;
          const targetH = linesFit * LINE_H_PX;

          const text  = el.textContent ?? "";
          const words = text.split(/(\s+)/);
          if (words.length < 6) return null;

          const temp = doc.createElement(el.tagName);
          temp.className = el.className;
          const sAttr = el.getAttribute("style");
          if (sAttr) temp.setAttribute("style", sAttr);
          const aAttr = el.getAttribute("data-alpha-list");
          if (aAttr) temp.setAttribute("data-alpha-list", aAttr);
          temp.style.cssText += `;position:absolute;visibility:hidden;width:${usableW}px`;
          doc.body.appendChild(temp);

          let cutIdx = 0;
          let acc = "";
          for (let i = 0; i < words.length; i++) {
            acc += words[i];
            temp.innerHTML = acc;
            if (temp.offsetHeight > targetH) { cutIdx = Math.max(0, i - 1); break; }
            cutIdx = i;
          }
          doc.body.removeChild(temp);
          if (cutIdx <= 0 || cutIdx >= words.length - 1) return null;

          const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(" ");
          const tO = `<${el.tagName.toLowerCase()}${attrs ? " " + attrs : ""}>`;
          const tC = `</${el.tagName.toLowerCase()}>`;
          return [
            tO + words.slice(0, cutIdx + 1).join("") + tC,
            tO + words.slice(cutIdx + 1).join("").trimStart() + tC,
          ];
        }

        // ── fitList: distribui <li> entre páginas ────────────────────────
        function fitList(el: HTMLElement): void {
          const elH = el.offsetHeight;
          if (elH === 0)            { pageHtml += el.outerHTML; return; }
          if (pageUsed + elH <= usableH) { pageHtml += el.outerHTML; pageUsed += elH; return; }

          const tN = el.tagName.toLowerCase();
          const tO = el.outerHTML.match(/^<[^>]+>/)?.[0] ?? `<${tN}>`;
          const tC = `</${tN}>`;
          let blk = "", blkH = 0;

          for (const li of Array.from(el.children) as HTMLElement[]) {
            const liH = li.offsetHeight;
            if (liH === 0) { blk += li.outerHTML; continue; }
            if (pageUsed + blkH + liH <= usableH) {
              blk += li.outerHTML; blkH += liH;
            } else {
              if (blk !== "") { pageHtml += tO + blk + tC; pages.push(pageHtml); pageHtml = ""; pageUsed = 0; blk = ""; blkH = 0; }
              else if (pageHtml !== "") { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
              blk = li.outerHTML; blkH = liH;
            }
          }
          if (blk !== "") { pageHtml += tO + blk + tC; pageUsed += blkH; }
        }

        // ── fitElement: distribui qualquer elemento recursivamente ───────
        function fitElement(el: HTMLElement): void {
          const elH = el.offsetHeight;
          if (elH === 0) { pageHtml += el.outerHTML; return; }

          // ── Blocos de assinatura e tabelas: NUNCA quebrar ───────────────
          const isSigBlock =
            el.tagName === "TABLE"                        ||
            el.classList.contains("contract-signatures") ||
            (el.className && typeof el.className === "string" && el.className.includes("sig-"));
          if (isSigBlock) {
            if (pageUsed + elH > usableH) { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
            pageHtml += el.outerHTML; pageUsed += elH;
            return;
          }

          // Cabe inteiro
          if (pageUsed + elH <= usableH) { pageHtml += el.outerHTML; pageUsed += elH; return; }

          const children = Array.from(el.children) as HTMLElement[];

          // Sem filhos: tenta split de parágrafo ou quebra de página
          if (children.length === 0) {
            const spaceLeft = usableH - pageUsed;
            if (el.tagName === "P" && pageHtml !== "") {
              const parts = splitParagraph(el, spaceLeft);
              if (parts) {
                pageHtml += parts[0]; pages.push(pageHtml); pageHtml = ""; pageUsed = 0;
                const tmp = doc.createElement("div");
                tmp.innerHTML = parts[1];
                tmp.style.cssText = `position:absolute;visibility:hidden;width:${usableW}px`;
                doc.body.appendChild(tmp);
                pageHtml = parts[1]; pageUsed = tmp.offsetHeight;
                doc.body.removeChild(tmp);
                return;
              }
            }
            if (pageHtml !== "") { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
            pageHtml += el.outerHTML; pageUsed = elH;
            return;
          }

          // Lista: distribui por <li>
          if (el.tagName === "UL" || el.tagName === "OL") { fitList(el); return; }

          const isClause = el.classList.contains("contract-clause");

          // h2 + primeira alínea inseparáveis
          if (isClause) {
            let h2El: HTMLElement | null = null, firstEl: HTMLElement | null = null;
            for (const c of children) {
              if (c.tagName === "H2" && !h2El) { h2El = c; continue; }
              if (!firstEl) { firstEl = c; break; }
            }
            if (h2El && firstEl && pageHtml !== "") {
              const firstInner = firstEl.children[0] as HTMLElement | undefined;
              const anchorH = firstInner ? firstInner.offsetHeight : firstEl.offsetHeight;
              if (pageUsed + h2El.offsetHeight + anchorH > usableH) {
                pages.push(pageHtml); pageHtml = ""; pageUsed = 0;
              }
            }
          }

          // Processa cada filho recursivamente
          for (const child of children) {
            const childH = child.offsetHeight || 0;
            if (childH === 0) { pageHtml += child.outerHTML; continue; }
            fitElement(child);
          }
        }

        Array.from(doc.body.children).forEach(el => fitElement(el as HTMLElement));
        if (pageHtml) pages.push(pageHtml);
        document.body.removeChild(iframe);
        const finalPages = pages.length > 0 ? pages : [htmlContent];
        resolve({ pages: finalPages, lastPageUsed: pageUsed });
      });
    });
  });
}

// ── buildIframeDocument ───────────────────────────────────────────────────────

function buildIframeDocument(
  pages: string[],
  lhUrl: string,
  mt: number, mb: number, ml: number, mr: number,
): string {
  const MM     = 3.7795;
  const mtPx   = Math.round(mt * MM);
  const mbPx   = Math.round(mb * MM);
  const mlPx   = Math.round(ml * MM);
  const mrPx   = Math.round(mr * MM);
  const usableW = PAGE_W_PX - mlPx - mrPx;

  // Timbrado: <img> absoluta cobrindo 100% da folha — visível na tela e na impressão
  const lhImg = lhUrl
    ? `<img class="lh" src="${lhUrl}" crossorigin="anonymous" alt="" />`
    : "";

  const pagesHtml = pages.map(content => `
    <div class="page">
      ${lhImg}
      <div class="content">${content}</div>
    </div>`).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<style>
*, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

html { background:#cbd5e1; padding:24px 0; min-height:100%; overflow-y:auto; }
body { background:transparent; }

/* Folha A4 com timbrado */
.page {
  width:210mm; height:297mm;
  margin:0 auto 20px auto;
  position:relative; background:white;
  box-shadow:0 2px 16px rgba(0,0,0,0.18);
  overflow:hidden;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}

/* Timbrado: <img> absoluta cobre 100% borda a borda */
.lh {
  position:absolute; top:0; left:0;
  width:100%; height:100%;
  object-fit:fill; z-index:0; display:block;
  pointer-events:none;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}

/* Conteúdo acima do timbrado */
.content {
  position:relative; z-index:1;
  width:100%; height:100%;
  padding:${mt}mm ${mr}mm ${mb}mm ${ml}mm;
  box-sizing:border-box; overflow:hidden;
}

/* Tipografia — idêntica ao contractCss */
${contractCss(usableW).replace(`width: ${usableW}px;`, "width:100%;").replace(`overflow: visible;`, "overflow:hidden;")}

/* Garante que h1 não tem borda */
h1, .contract-title { border:none !important; }
*:has(+ h1), *:has(+ .contract-title), .contract-header-space { border-bottom:none !important; border:none !important; }
hr { display:none !important; }

/* Impressão: cada folha = uma página A4 */
@media print {
  @page { size:A4; margin:0; }
  html { background:white; padding:0; }
  .page {
    width:100%; height:297mm; margin:0;
    box-shadow:none;
    page-break-after:always; break-after:page;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .page:last-child { page-break-after:auto; break-after:auto; }
  .lh { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ContractViewer({ contract, template, onClose, onEmit }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready,   setReady]   = useState(false);
  const [loading, setLoading] = useState(true);

  const mt = template?.margin_top    ?? 30;
  const mb = template?.margin_bottom ?? 25;
  const ml = template?.margin_left   ?? 25;
  const mr = template?.margin_right  ?? 25;

  const MM   = 3.7795;
  const mtPx = Math.round(mt * MM);
  const mbPx = Math.round(mb * MM);
  const mlPx = Math.round(ml * MM);
  const mrPx = Math.round(mr * MM);
  const lhUrl = template?.letterhead_url ?? "";

  const scheduleHtml = buildScheduleHtml(contract.payment_schedule ?? []);
  const htmlContent  = renderTemplate(
    contract.html_content ?? template?.html_content ?? "",
    contract.variables ?? {},
    scheduleHtml,
  );

  useEffect(() => {
    if (!htmlContent) return;
    setLoading(true);
    setReady(false);

    const timer = setTimeout(async () => {
      // Com display:table nos blocos de assinatura, o offsetHeight é calculado
      // corretamente pelo splitIntoPages — não é mais necessária extração prévia.
      // Remove apenas resíduos de container que o editor pode gerar no final.
      const cleanedHtml = htmlContent
        .replace(/<div[^>]*class="[^"]*contract-footer-space[^"]*"[^>]*\/?>/gi, "")
        .replace(/<\/div>\s*$/, "")
        .trimEnd();

      // 1. Divide todo o conteúdo (incluindo assinaturas) em páginas
      const { pages } = await splitIntoPages(cleanedHtml, mtPx, mbPx, mlPx, mrPx);

      // 2. Monta o HTML final e injeta no iframe
      const iframeDoc = buildIframeDocument(pages, lhUrl, mt, mb, ml, mr);
      const iframe    = iframeRef.current;
      if (!iframe) return;

      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) return;

      doc.open();
      doc.write(iframeDoc);
      doc.close();

      // 4. Aguarda imagens (timbrado) e ajusta altura do iframe ao conteúdo
      const adjustHeight = () => {
        if (iframe && doc.body) {
          const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
          if (h > 0) iframe.style.height = `${h}px`;
        }
      };

      const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
      if (imgs.length === 0) {
        adjustHeight();
        setReady(true);
        setLoading(false);
        return;
      }

      let loaded = 0;
      const onLoad = () => {
        if (++loaded >= imgs.length) {
          adjustHeight();
          setReady(true);
          setLoading(false);
        }
      };
      imgs.forEach(img => {
        if (img.complete && img.naturalHeight > 0) onLoad();
        else { img.onload = onLoad; img.onerror = onLoad; }
      });
      setTimeout(() => { adjustHeight(); setReady(true); setLoading(false); }, 5000);
    }, 150);

    return () => clearTimeout(timer);
  }, [htmlContent, mtPx, mbPx, mlPx, mrPx, lhUrl, mt, mb, ml, mr]);

  const handlePrint = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    // Marca como emitido ao imprimir (só se ainda for rascunho)
    if (contract.status === "rascunho") onEmit?.();
  }, [contract.status, onEmit]);

  const handlePdf = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    toast.info("No diálogo, selecione 'Salvar como PDF' como destino.", { duration: 6000 });
    win.focus();
    setTimeout(() => win.print(), 400);
    // Marca como emitido ao gerar PDF (só se ainda for rascunho)
    if (contract.status === "rascunho") onEmit?.();
  }, [contract.status, onEmit]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background shrink-0">
        <span className="text-sm font-medium flex-1 truncate">
          {contract.contract_number && (
            <span className="text-xs text-muted-foreground mr-2">{contract.contract_number}</span>
          )}
          {contract.title}
        </span>
        <Button size="sm" variant="outline" onClick={handlePrint} disabled={!ready} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          Imprimir
        </Button>
        <Button size="sm" variant="outline" onClick={handlePdf} disabled={!ready} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Salvar PDF
        </Button>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-[#cbd5e1]">
        <iframe
          ref={iframeRef}
          title={contract.title ?? "Contrato"}
          className="w-full border-none"
          style={{ minHeight: "100%", display: "block" }}
        />
      </div>
    </div>
  );
}
