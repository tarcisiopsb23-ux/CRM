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
import { Printer, Download, X, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { ContractV2 } from "@/hooks/useContracts";
import type { ContractTemplate } from "@/hooks/useContractTemplates";
import type { ContractPaymentLine } from "@/hooks/useContractSchedule";
import { useContractSecurity } from "@/hooks/useContractSecurity";
import { buildScheduleHtml } from "@/lib/contracts/buildScheduleHtml";

interface Props {
  contract: ContractV2;
  template: ContractTemplate | null;
  /** clientId necessário para invalidar queries após emissão */
  clientId?: string;
  onClose?: () => void;
  /** Callback chamado ao gerar PDF/imprimir — deve marcar o contrato como "emitido" */
  onEmit?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// buildScheduleHtml imported from @/lib/contracts/buildScheduleHtml

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
  .contract-clause { margin-bottom:8pt; }
  /* Chips de variável do TipTap — no contrato final devem aparecer como texto inline normal */
  .variable-chip { display:inline; background:none; border:none; padding:0; color:inherit; font:inherit; }
  /* Título da cláusula — gerado pelo assembleContract como <h4 class="clause-title"> */
  .contract-clause h2,
  .contract-clause h4,
  .clause-title {
    font-size:12pt; font-weight:bold; text-transform:uppercase;
    margin:8pt 0 4pt; border-bottom:1px solid #888; padding-bottom:2pt;
    page-break-after:avoid; break-after:avoid;
  }
  /* Alínea: pode quebrar entre alíneas, cada alínea é coesa */
  .contract-clause .alinea { margin-bottom:4pt; }
  .contract-clause p  { margin:3pt 0; text-align:justify; orphans:3; widows:3; }
  .contract-clause ul,
  .contract-clause ol { margin:5pt 0 5pt 22pt; }
  .contract-clause li { margin:2pt 0; text-align:justify; }

  /* Espaço antes da tabela de assinaturas e do parágrafo de local/data */
  .sig-table { margin-top:36pt; }
  p:has(+ .sig-table) { margin-top:16pt !important; }

  /* Bloco de assinaturas — espaço acima do local/data e das linhas */
  .sig-table { margin-top:36pt; }
  /* Parágrafo de local e data: espaço generoso acima */
  p:has(+ .sig-table),
  p + p:last-of-type { margin-top: 0; }
  /* Seleciona o <p> imediatamente antes da sig-table */
  .sig-table { margin-top: 36pt; }
  /* Espaço extra antes do bloco de fechamento (local/data + assinaturas) */
  .contract-signatures-intro + p,
  p.sig-local { margin-top: 18pt; }

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

        // ── splitParagraph: divide <p> por palavras preservando HTML interno ──
        function splitParagraph(el: HTMLElement, spaceLeft: number): [string, string] | null {
          const elH = el.offsetHeight;
          if (elH < LINE_H_PX * MIN_SPLIT) return null;
          if (spaceLeft < LINE_H_PX * MIN_SPLIT) return null;

          const linesFit = Math.floor(spaceLeft / LINE_H_PX);
          if (linesFit < MIN_SPLIT) return null;
          const targetH = linesFit * LINE_H_PX;

          // Se o parágrafo tem HTML interno (strong, em, span…) usa innerHTML
          // para medir, mas divide no textContent para encontrar o ponto de corte
          // e depois reaplica os nós originais nas duas metades.
          // Abordagem: clona o elemento e vai removendo nós filhos pelo final
          // até caber, preservando formatação.
          const hasInlineHtml = el.children.length > 0;

          if (hasInlineHtml) {
            // Mede quantos childNodes cabem na spaceLeft
            const nodes = Array.from(el.childNodes);
            if (nodes.length < 2) return null;

            const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(" ");
            const tO = `<${el.tagName.toLowerCase()}${attrs ? " " + attrs : ""}>`;
            const tC = `</${el.tagName.toLowerCase()}>`;

            const temp = doc.createElement(el.tagName);
            temp.className = el.className;
            temp.style.cssText = `position:absolute;visibility:hidden;width:${usableW}px`;
            doc.body.appendChild(temp);

            let cutAt = 0;
            for (let i = 0; i < nodes.length; i++) {
              temp.appendChild(nodes[i].cloneNode(true));
              if (temp.offsetHeight > targetH) { cutAt = Math.max(0, i - 1); break; }
              cutAt = i;
            }
            doc.body.removeChild(temp);
            if (cutAt <= 0 || cutAt >= nodes.length - 1) return null;

            const firstNodes = nodes.slice(0, cutAt + 1);
            const restNodes  = nodes.slice(cutAt + 1);
            // Trim leading whitespace from rest
            if (restNodes[0]?.nodeType === Node.TEXT_NODE) {
              restNodes[0] = doc.createTextNode((restNodes[0] as Text).data.trimStart());
            }
            const firstHtml = firstNodes.map(n => {
              const d = doc.createElement("div"); d.appendChild(n.cloneNode(true)); return d.innerHTML;
            }).join("");
            const restHtml = restNodes.map(n => {
              const d = doc.createElement("div"); d.appendChild(n.cloneNode(true)); return d.innerHTML;
            }).join("");
            if (!firstHtml.trim() || !restHtml.trim()) return null;
            return [tO + firstHtml + tC, tO + restHtml + tC];
          }

          // Texto puro — divide por palavras
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
          // Apenas tabelas de assinatura (sig-table, sig-block-*) são indivisíveis.
          // Tabelas de conteúdo (schedule-table, tabelas genéricas) podem quebrar.
          const isSigBlock =
            (el.tagName === "TABLE" && (
              el.classList.contains("sig-table") ||
              (el.className && typeof el.className === "string" && el.className.includes("sig-"))
            ))                                              ||
            el.classList.contains("contract-signatures")   ||
            (el.className && typeof el.className === "string" && el.className.includes("sig-"));
          if (isSigBlock) {
            if (pageUsed + elH > usableH) { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
            pageHtml += el.outerHTML; pageUsed += elH;
            return;
          }

          // Cabe inteiro
          if (pageUsed + elH <= usableH) { pageHtml += el.outerHTML; pageUsed += elH; return; }

          const children = Array.from(el.children) as HTMLElement[];

          // <p> com conteúdo misto (text nodes + inline elements): tratar como unidade.
          // Nunca descer pelos children de um <p> — os text nodes seriam perdidos.
          if (el.tagName === "P") {
            const spaceLeft = usableH - pageUsed;
            const parts = pageHtml !== "" ? splitParagraph(el, spaceLeft) : null;
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
            if (pageHtml !== "") { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
            pageHtml += el.outerHTML; pageUsed = elH;
            return;
          }

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

export function ContractViewer({ contract, template, clientId, onClose, onEmit }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready,   setReady]   = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Segurança: verificação de integridade do hash ──────────────────────────
  const { checkHashIntegrity, emitContract, logView } = useContractSecurity();
  const [hashStatus, setHashStatus] = useState<
    { checked: false } |
    { checked: true; ok: true; noHash?: boolean } |
    { checked: true; ok: false; reason: string }
  >({ checked: false });

  // Verifica integridade ao abrir o viewer
  useEffect(() => {
    let cancelled = false;
    checkHashIntegrity({
      ...contract,
      payment_schedule: contract.payment_schedule ?? [],
    }).then(result => {
      if (!cancelled) setHashStatus({ checked: true, ...result } as typeof hashStatus);
    });
    // Registra visualização no audit_log
    logView(contract.id);
    return () => { cancelled = true; };
  }, [contract.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const htmlContent  = (() => {
    let html = renderTemplate(
      contract.html_content ?? template?.html_content ?? "",
      contract.variables ?? {},
      scheduleHtml,
    );
    // Inject contract number if not already present
    if (contract.contract_number && !html.includes('class="contract-number"')) {
      const numHtml = `<p class="contract-number" style="text-align:right;font-size:9pt;color:#666;margin:0 0 4pt;font-family:Calibri,sans-serif;">Contrato nº <strong>${contract.contract_number}</strong></p>`;
      html = numHtml + html;
    }
    return html;
  })();

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
    if (contract.status === "rascunho") {
      emitContract(
        { ...contract, payment_schedule: contract.payment_schedule ?? [] },
        clientId ?? contract.client_id
      );
      onEmit?.();
    }
  }, [contract, clientId, emitContract, onEmit]);

  const handlePdf = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    toast.info("No diálogo, selecione 'Salvar como PDF' como destino.", { duration: 6000 });
    win.focus();
    setTimeout(() => win.print(), 400);
    // Marca como emitido ao gerar PDF (só se ainda for rascunho)
    if (contract.status === "rascunho") {
      emitContract(
        { ...contract, payment_schedule: contract.payment_schedule ?? [] },
        clientId ?? contract.client_id
      );
      onEmit?.();
    }
  }, [contract, clientId, emitContract, onEmit]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Banner de alerta de integridade ─────────────────────────────────── */}
      {hashStatus.checked && !hashStatus.ok && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border-b border-red-200 text-red-700 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">⚠️ Contrato alterado após a emissão do PDF</p>
            <p className="mt-0.5 text-red-600">
              {(hashStatus as { ok: false; reason: string }).reason}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background shrink-0">
        <span className="text-sm font-medium flex-1 truncate flex items-center gap-2">
          {contract.contract_number && (
            <span className="text-xs text-muted-foreground font-mono">{contract.contract_number}</span>
          )}
          {contract.title}
          {/* Badge de integridade */}
          {hashStatus.checked && (
            hashStatus.ok && !("noHash" in hashStatus && hashStatus.noHash) ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                <ShieldCheck className="h-3 w-3" /> Hash verificado
              </span>
            ) : !hashStatus.ok ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" /> Hash divergente
              </span>
            ) : null
          )}
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
