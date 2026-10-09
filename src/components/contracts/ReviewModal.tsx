// src/components/contracts/ReviewModal.tsx
// Modal de revisão do contrato montado — preview WYSIWYG com timbrado e paginação.
// Usa a mesma lógica do ContractViewer (useRef + useEffect), sem botões de imprimir.

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ContractAssemblyResult } from "@/types/contracts";
import type { ContractTemplateV2 } from "@/types/contracts";

// ---------------------------------------------------------------------------
// Page simulation constants (same as ContractViewer)
// ---------------------------------------------------------------------------

const MM = 3.7795;
const PAGE_W_PX = Math.round(210 * MM); // 794 px
const PAGE_H_PX = Math.round(297 * MM); // 1123 px

const contractCssBase = (usableW: number) => `
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
  /* Cláusula: espaço reduzido entre cláusulas */
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
  .contract-clause .alinea { margin-bottom:4pt; }
  .contract-clause p  { margin:3pt 0; text-align:justify; orphans:3; widows:3; }
  .contract-clause ul,
  .contract-clause ol { margin:5pt 0 5pt 22pt; }
  .contract-clause li { margin:2pt 0; text-align:justify; }
  /* Hierarquia de nós */
  .contract-node       { display:block; }
  .clause-node-row     { display:flex; gap:6pt; align-items:baseline; }
  .clause-marker       { flex-shrink:0; font-weight:normal; min-width:2em; }
  .clause-node-content { flex:1; }
  .clause-node-content p { margin:3pt 0; text-align:justify; orphans:3; widows:3; }
  .clause-children     { margin-left:18pt; }
  .clause-depth-0      { margin-bottom:4pt; }
  .clause-depth-1      { margin-bottom:3pt; }
  .clause-depth-2      { margin-bottom:2pt; }
  /* Bloco de assinaturas */
  .sig-table { margin-top:36pt; }
  p:has(+ .sig-table) { margin-top:16pt !important; }
`;

// ---------------------------------------------------------------------------
// splitIntoPages — identical to ContractViewer
// ---------------------------------------------------------------------------

function splitIntoPages(
  htmlContent: string,
  mtPx: number,
  mbPx: number,
  mlPx: number,
  mrPx: number,
): Promise<string[]> {
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
    doc.write(`<!DOCTYPE html><html><head><style>${contractCssBase(usableW)}</style></head><body>${htmlContent}</body></html>`);
    doc.close();

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const pages: string[] = [];
      let pageHtml = "";
      let pageUsed = 0;

      const LINE_H_PX = Math.round(12 * 1.6 * (96 / 72));
      const MIN_SPLIT = 3;

      function splitParagraph(el: HTMLElement, spaceLeft: number): [string, string] | null {
        const elH = el.offsetHeight;
        if (elH < LINE_H_PX * MIN_SPLIT || spaceLeft < LINE_H_PX * MIN_SPLIT) return null;
        const linesFit = Math.floor(spaceLeft / LINE_H_PX);
        if (linesFit < MIN_SPLIT) return null;
        const targetH = linesFit * LINE_H_PX;
        const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(" ");
        const tO = `<${el.tagName.toLowerCase()}${attrs ? " " + attrs : ""}>`;
        const tC = `</${el.tagName.toLowerCase()}>`;

        // Preserve inline HTML (strong/em/span) by splitting on child nodes
        if (el.children.length > 0) {
          const nodes = Array.from(el.childNodes);
          if (nodes.length < 2) return null;
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
          const toHtml = (ns: ChildNode[]) => ns.map(n => { const d = doc.createElement("div"); d.appendChild(n.cloneNode(true)); return d.innerHTML; }).join("");
          const restNodes = nodes.slice(cutAt + 1);
          if (restNodes[0]?.nodeType === Node.TEXT_NODE) restNodes[0] = doc.createTextNode((restNodes[0] as Text).data.trimStart());
          const fh = toHtml(nodes.slice(0, cutAt + 1)), rh = toHtml(restNodes);
          if (!fh.trim() || !rh.trim()) return null;
          return [tO + fh + tC, tO + rh + tC];
        }

        // Plain text — split by words
        const text = el.textContent ?? "";
        const words = text.split(/(\s+)/);
        if (words.length < 6) return null;
        const temp = doc.createElement(el.tagName);
        temp.className = el.className;
        const sAttr = el.getAttribute("style"); if (sAttr) temp.setAttribute("style", sAttr);
        temp.style.cssText += `;position:absolute;visibility:hidden;width:${usableW}px`;
        doc.body.appendChild(temp);
        let cutIdx = 0, acc = "";
        for (let i = 0; i < words.length; i++) {
          acc += words[i]; temp.innerHTML = acc;
          if (temp.offsetHeight > targetH) { cutIdx = Math.max(0, i - 1); break; }
          cutIdx = i;
        }
        doc.body.removeChild(temp);
        if (cutIdx <= 0 || cutIdx >= words.length - 1) return null;
        return [tO + words.slice(0, cutIdx + 1).join("") + tC, tO + words.slice(cutIdx + 1).join("").trimStart() + tC];
      }

      function fitList(el: HTMLElement): void {
        const elH = el.offsetHeight;
        if (elH === 0) { pageHtml += el.outerHTML; return; }
        if (pageUsed + elH <= usableH) { pageHtml += el.outerHTML; pageUsed += elH; return; }
        const tN = el.tagName.toLowerCase();
        const tO = el.outerHTML.match(/^<[^>]+>/)?.[0] ?? `<${tN}>`;
        const tC = `</${tN}>`;
        let blk = "", blkH = 0;
        for (const li of Array.from(el.children) as HTMLElement[]) {
          const liH = li.offsetHeight;
          if (liH === 0) { blk += li.outerHTML; continue; }
          if (pageUsed + blkH + liH <= usableH) { blk += li.outerHTML; blkH += liH; }
          else {
            if (blk !== "") { pageHtml += tO + blk + tC; pages.push(pageHtml); pageHtml = ""; pageUsed = 0; blk = ""; blkH = 0; }
            else if (pageHtml !== "") { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
            blk = li.outerHTML; blkH = liH;
          }
        }
        if (blk !== "") { pageHtml += tO + blk + tC; pageUsed += blkH; }
      }

      function fitElement(el: HTMLElement): void {
        const elH = el.offsetHeight;
        if (elH === 0) { pageHtml += el.outerHTML; return; }
        const isSigBlock = (el.tagName === "TABLE" && (
          el.classList.contains("sig-table") ||
          (typeof el.className === "string" && el.className.includes("sig-"))
        )) || el.classList.contains("contract-signatures") || (typeof el.className === "string" && el.className.includes("sig-"));
        if (isSigBlock) {
          if (pageUsed + elH > usableH) { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
          pageHtml += el.outerHTML; pageUsed += elH; return;
        }
        if (pageUsed + elH <= usableH) { pageHtml += el.outerHTML; pageUsed += elH; return; }
        const children = Array.from(el.children) as HTMLElement[];
        // <p> com conteúdo misto (text nodes + inline elements): tratar como unidade,
        // usar splitParagraph para dividir preservando HTML, nunca descer pelos children.
        if (el.tagName === "P") {
          const spaceLeft = usableH - pageUsed;
          const parts = pageHtml !== "" ? splitParagraph(el, spaceLeft) : null;
          if (parts) {
            pageHtml += parts[0]; pages.push(pageHtml); pageHtml = ""; pageUsed = 0;
            const tmp = doc.createElement("div");
            tmp.innerHTML = parts[1]; tmp.style.cssText = `position:absolute;visibility:hidden;width:${usableW}px`;
            doc.body.appendChild(tmp); pageHtml = parts[1]; pageUsed = tmp.offsetHeight; doc.body.removeChild(tmp); return;
          }
          if (pageHtml !== "") { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
          pageHtml += el.outerHTML; pageUsed = elH; return;
        }
        if (children.length === 0) {
          const spaceLeft = usableH - pageUsed;
          if (el.tagName === "P" && pageHtml !== "") {
            const parts = splitParagraph(el, spaceLeft);
            if (parts) {
              pageHtml += parts[0]; pages.push(pageHtml); pageHtml = ""; pageUsed = 0;
              const tmp = doc.createElement("div");
              tmp.innerHTML = parts[1]; tmp.style.cssText = `position:absolute;visibility:hidden;width:${usableW}px`;
              doc.body.appendChild(tmp); pageHtml = parts[1]; pageUsed = tmp.offsetHeight; doc.body.removeChild(tmp); return;
            }
          }
          if (pageHtml !== "") { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
          pageHtml += el.outerHTML; pageUsed = elH; return;
        }
        if (el.tagName === "UL" || el.tagName === "OL") { fitList(el); return; }
        const isClause = el.classList.contains("contract-clause");
        if (isClause) {
          let h2El: HTMLElement | null = null, firstEl: HTMLElement | null = null;
          for (const c of children) { if (c.tagName === "H2" && !h2El) { h2El = c; continue; } if (!firstEl) { firstEl = c; break; } }
          if (h2El && firstEl && pageHtml !== "") {
            const firstInner = firstEl.children[0] as HTMLElement | undefined;
            const anchorH = firstInner ? firstInner.offsetHeight : firstEl.offsetHeight;
            if (pageUsed + h2El.offsetHeight + anchorH > usableH) { pages.push(pageHtml); pageHtml = ""; pageUsed = 0; }
          }
        }
        for (const child of children) { if ((child.offsetHeight || 0) === 0) { pageHtml += child.outerHTML; continue; } fitElement(child); }
      }

      Array.from(doc.body.children).forEach(el => fitElement(el as HTMLElement));
      if (pageHtml) pages.push(pageHtml);
      document.body.removeChild(iframe);
      resolve(pages.length > 0 ? pages : [htmlContent]);
    }));
  });
}

// ---------------------------------------------------------------------------
// buildPreviewDoc
// ---------------------------------------------------------------------------

function buildPreviewDoc(
  pages: string[],
  lhUrl: string,
  mt: number, mb: number, ml: number, mr: number,
): string {
  const mtPx = Math.round(mt * MM);
  const mbPx = Math.round(mb * MM);
  const mlPx = Math.round(ml * MM);
  const mrPx = Math.round(mr * MM);
  const usableW = PAGE_W_PX - mlPx - mrPx;

  const lhImg = lhUrl ? `<img class="lh" src="${lhUrl}" crossorigin="anonymous" alt="" />` : "";
  const pagesHtml = pages.map(content => `
    <div class="page">${lhImg}<div class="content">${content}</div></div>
  `).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<style>
*, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
html { background:#cbd5e1; padding:24px 0; min-height:100%; overflow-y:auto; }
body { background:transparent; }
.page {
  width:210mm; height:297mm;
  margin:0 auto 20px auto;
  position:relative; background:white;
  box-shadow:0 2px 16px rgba(0,0,0,0.18);
  overflow:hidden;
}
.lh {
  position:absolute; top:0; left:0;
  width:100%; height:100%;
  object-fit:fill; z-index:0; display:block;
  pointer-events:none;
}
.content {
  position:relative; z-index:1;
  width:100%; height:100%;
  padding:${mt}mm ${mr}mm ${mb}mm ${ml}mm;
  box-sizing:border-box; overflow:hidden;
}
${contractCssBase(usableW).replace(`width: ${usableW}px;`, "width:100%;").replace("overflow: visible;", "overflow:hidden;")}
h1, .contract-title { border:none !important; }
hr { display:none !important; }
</style></head>
<body>${pagesHtml}</body></html>`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  assembledResult: ContractAssemblyResult | null;
  clauseEdits?: Record<string, string>;
  onEditClause?: (clauseId: string, html: string) => Promise<void>;
  onConfirmGenerate: () => Promise<void>;
  /** Template resolvido — fornece timbrado e margens para o preview */
  template?: ContractTemplateV2 | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewModal({
  isOpen,
  onClose,
  assembledResult,
  clauseEdits = {},
  onConfirmGenerate,
  template,
}: ReviewModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [ready, setReady]         = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) { setIsConfirming(false); setReady(false); setLoading(false); }
  }, [isOpen]);

  // Build + inject preview whenever result/template/open changes — same pattern as ContractViewer
  useEffect(() => {
    if (!assembledResult || !isOpen) return;

    setReady(false);
    setLoading(true);

    // Apply clause edits to assembled HTML
    let html = assembledResult.html;
    for (const [id, content] of Object.entries(clauseEdits)) {
      html = html.replace(
        new RegExp(`(<div[^>]*data-clause-id="${id}"[^>]*>)([\\s\\S]*?)(</div>)`),
        `$1${content}$3`
      );
    }

    const mt = template?.margin_top    ?? 30;
    const mb = template?.margin_bottom ?? 25;
    const ml = template?.margin_left   ?? 25;
    const mr = template?.margin_right  ?? 25;
    const lhUrl = template?.letterhead_url ?? "";

    const mtPx = Math.round(mt * MM);
    const mbPx = Math.round(mb * MM);
    const mlPx = Math.round(ml * MM);
    const mrPx = Math.round(mr * MM);

    const timer = setTimeout(async () => {
      const pages = await splitIntoPages(html, mtPx, mbPx, mlPx, mrPx);
      const doc   = buildPreviewDoc(pages, lhUrl, mt, mb, ml, mr);

      const iframe = iframeRef.current;
      if (!iframe) return;

      const iDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!iDoc) return;

      iDoc.open();
      iDoc.write(doc);
      iDoc.close();

      const adjustHeight = () => {
        const h = iDoc.documentElement?.scrollHeight || iDoc.body?.scrollHeight || 0;
        if (h > 0) iframe.style.height = `${h}px`;
        setReady(true);
        setLoading(false);
      };

      const imgs = Array.from(iDoc.querySelectorAll<HTMLImageElement>("img"));
      if (imgs.length === 0) { requestAnimationFrame(adjustHeight); return; }
      let loaded = 0;
      const onLoad = () => { if (++loaded >= imgs.length) adjustHeight(); };
      imgs.forEach(img => {
        if (img.complete && img.naturalHeight > 0) onLoad();
        else { img.onload = onLoad; img.onerror = onLoad; }
      });
      setTimeout(() => { adjustHeight(); }, 4000);
    }, 150);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembledResult, template, isOpen]);

  async function handleConfirm() {
    setIsConfirming(true);
    try { await onConfirmGenerate(); } finally { setIsConfirming(false); }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Revisão do Contrato</DialogTitle>
        </DialogHeader>

        {/* ── Preview body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#cbd5e1] relative">
          {/* Loading overlay — shown while assembling or building pages */}
          {(!assembledResult || loading) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#cbd5e1] z-10">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
              <p className="text-sm text-slate-600">
                {!assembledResult ? "Montando o contrato…" : "Preparando preview…"}
              </p>
            </div>
          )}

          {/* Iframe — always mounted once assembledResult exists, hidden until ready */}
          {assembledResult && (
            <iframe
              ref={iframeRef}
              title="Preview do contrato"
              className="w-full border-none"
              style={{
                display: "block",
                minHeight: "600px",
                opacity: ready ? 1 : 0,
                transition: "opacity 0.2s ease",
              }}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="px-6 py-4 border-t shrink-0 sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={isConfirming}>
            Fechar
          </Button>
          <Button onClick={handleConfirm} disabled={!assembledResult || isConfirming}>
            {isConfirming ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando PDF…</>
            ) : (
              "Confirmar e Gerar PDF"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
