/**
 * tableExtensions — extensões TipTap de tabela compartilhadas entre editores.
 * TipTap v3: Table, TableRow, TableHeader, TableCell são named exports
 * do pacote único @tiptap/extension-table.
 *
 * Dois modos:
 *   tableExtensions        → tabela normal com bordas (para cláusulas/templates)
 *   sigTableExtensions     → tabela de assinatura sem bordas (class="sig-table")
 */
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";

// ── Tabela normal (bordas, para uso geral) ────────────────────────────────────
export const tableExtensions = [
  Table.configure({ resizable: false, HTMLAttributes: { class: "contract-table" } }),
  TableRow,
  TableHeader,
  TableCell,
];

// ── CSS a injetar no editorProps para preview fiel de tabelas normais ─────────
export const tableEditorCss = `
  .ProseMirror table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  .ProseMirror th, .ProseMirror td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; min-width: 40px; }
  .ProseMirror th { background: #f0f0f0; font-weight: bold; }
  .ProseMirror .selectedCell::after { background: rgba(200,200,255,0.4); content: ""; position: absolute; inset: 0; pointer-events: none; }
`;

// ── CSS para tabela de assinatura no editor (sem bordas, centralizada) ────────
export const sigTableEditorCss = `
  .ProseMirror table.sig-table {
    border: none !important;
    margin-top: 24px;
    width: 100%;
    table-layout: fixed !important;
    border-collapse: collapse;
  }
  .ProseMirror table.sig-table td {
    border: 1px dashed #a78bfa !important;
    text-align: center;
    padding: 8px 12px;
    vertical-align: top;
    word-break: break-word;
    overflow-wrap: break-word;
    width: auto;    /* table-layout:fixed distribui igualmente */
  }
  .ProseMirror table.sig-table p {
    text-align: center;
    margin: 5px 0;
    min-height: 1.6em;
  }
  .ProseMirror table.sig-table .sig-line {
    border-bottom: 1px solid #000;
    min-height: 18px;
    margin-bottom: 4px;
    display: block;
  }
  .ProseMirror .selectedCell::after {
    background: rgba(167,139,250,0.2);
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
`;

// ── Snippets HTML de tabela de assinatura ─────────────────────────────────────

export const SIG_TABLE_2_COLS = `<table class="sig-table"><tbody><tr><td><p><strong>COLUNA 1</strong></p><p class="sig-line"> </p><p>Nome</p></td><td><p><strong>COLUNA 2</strong></p><p class="sig-line"> </p><p>Nome</p></td></tr></tbody></table>`;

export const SIG_TABLE_3_COLS = `<table class="sig-table"><tbody><tr><td><p><strong>COLUNA 1</strong></p><p class="sig-line"> </p><p>Nome</p></td><td><p><strong>COLUNA 2</strong></p><p class="sig-line"> </p><p>Nome</p></td><td><p><strong>COLUNA 3</strong></p><p class="sig-line"> </p><p>Nome</p></td></tr></tbody></table>`;

export const SIG_TABLE_1_COL = `<table class="sig-table"><tbody><tr><td><p><strong>COLUNA 1</strong></p><p class="sig-line"> </p><p>Nome</p></td></tr></tbody></table>`;
