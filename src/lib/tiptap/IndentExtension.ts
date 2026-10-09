/**
 * IndentExtension — Extensão TipTap para recuo de parágrafo
 *
 * - Botões ► e ◄ aumentam/diminuem padding-left
 * - Tab aumenta recuo (fora de lista), Shift+Tab reduz
 * - Cada nível = 2em, máximo 20em (10 níveis)
 */
import { Extension } from "@tiptap/core";

const INDENT_STEP = 2;   // em por nível
const INDENT_MAX  = 20;  // máximo
const INDENT_MIN  = 0;
// Nível base de indentação para parágrafos com data-alpha-list (espelha o CSS)
const ALPHA_BASE_INDENT = 2;

function getIndent(style: string | null | undefined): number {
  if (!style) return 0;
  const m = style.match(/padding-left:\s*([\d.]+)em/);
  return m ? parseFloat(m[1]) : 0;
}

function getEffectiveIndent(node: { attrs?: Record<string, unknown> }): number {
  const style = node.attrs?.style as string | null | undefined;
  const inlineIndent = getIndent(style);
  // Se o parágrafo tem data-alpha-list e não tem padding-left inline,
  // o nível efetivo é o base do CSS (2em), para que o primeiro indent
  // produza um salto visível (2em → 4em) em vez de 0em → 2em (invisível)
  if (inlineIndent === 0 && node.attrs?.["data-alpha-list"]) {
    return ALPHA_BASE_INDENT;
  }
  return inlineIndent;
}

function setIndent(style: string | null | undefined, value: number): string | null {
  const base = (style ?? "").replace(/padding-left:\s*[\d.]+em;?\s*/g, "").trim();
  if (value <= 0) return base || null;
  const rule = `padding-left: ${value}em;`;
  return base ? `${rule} ${base}` : rule;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent:  () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

export const IndentExtension = Extension.create({
  name: "indent",

  // Registra o atributo style em paragraph e heading para que o TipTap
  // saiba parsear e renderizar padding-left
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          style: {
            default: null,
            parseHTML:  elem  => elem.getAttribute("style") ?? null,
            renderHTML: attrs => attrs.style ? { style: attrs.style } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent: () => ({ editor, chain }) => {
        // Foca antes para garantir que o estado está correto
        const { state } = editor;
        const { from, to, empty } = state.selection;
        const nodePos: number[] = [];

        // Coleta posições dos nós suportados dentro da seleção
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (
            node.type === state.schema.nodes.paragraph ||
            node.type === state.schema.nodes.heading
          ) {
            nodePos.push(pos);
          }
        });

        if (nodePos.length === 0) return false;

        // Aplica o indent em cada nó encontrado
        let cmd = chain().focus();
        for (const pos of nodePos) {
          const node = state.doc.nodeAt(pos);
          if (!node) continue;
          const current = getEffectiveIndent(node);
          const next    = Math.min(current + INDENT_STEP, INDENT_MAX);
          if (next === current) continue;
          const style = setIndent(node.attrs.style as string, next);
          cmd = cmd.command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, style });
            return true;
          });
        }

        return cmd.run();
      },

      outdent: () => ({ editor, chain }) => {
        const { state } = editor;
        const { from, to } = state.selection;
        const nodePos: number[] = [];

        state.doc.nodesBetween(from, to, (node, pos) => {
          if (
            node.type === state.schema.nodes.paragraph ||
            node.type === state.schema.nodes.heading
          ) {
            nodePos.push(pos);
          }
        });

        if (nodePos.length === 0) return false;

        let cmd = chain().focus();
        for (const pos of nodePos) {
          const node = state.doc.nodeAt(pos);
          if (!node) continue;
          const current = getEffectiveIndent(node);
          if (current <= 0) continue;
          const next  = Math.max(current - INDENT_STEP, INDENT_MIN);
          const style = setIndent(node.attrs.style as string, next);
          cmd = cmd.command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, style });
            return true;
          });
        }

        return cmd.run();
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive("listItem")) return false;
        return editor.commands.indent();
      },
      "Shift-Tab": ({ editor }) => {
        if (editor.isActive("listItem")) return false;
        return editor.commands.outdent();
      },
    };
  },
});
