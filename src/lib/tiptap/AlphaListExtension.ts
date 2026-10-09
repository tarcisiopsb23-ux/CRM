/**
 * AlphaListExtension — Marcador de letra a), b), c)... para TipTap
 *
 * Comportamento igual ao BulletList:
 * - Toggle: clicando no botão ativa/desativa o marcador no parágrafo atual
 * - Enter: continua a sequência (a → b → c...)
 * - Backspace no início: remove o marcador
 * - Recuo automático: ativa padding-left ao ativar, remove ao desativar
 *
 * Implementação: usa um atributo "alphaList" no parágrafo para rastrear
 * o estado, e renderiza a letra como parte do texto via ::before no CSS.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const ALPHA_ATTR   = "data-alpha-list";
const ALPHA_INDENT = "padding-left: 2em;";

// Retorna a letra do parágrafo se for um alpha-list, ou null
function getAlphaLetter(node: { attrs?: Record<string, unknown> }): string | null {
  return (node.attrs?.[ALPHA_ATTR] as string) ?? null;
}

// Próxima letra na sequência
function nextLetter(letter: string): string {
  return String.fromCharCode(letter.charCodeAt(0) + 1);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    alphaList: {
      toggleAlphaList: () => ReturnType;
    };
  }
}

export const AlphaListExtension = Extension.create({
  name: "alphaList",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          [ALPHA_ATTR]: {
            default:    null,
            parseHTML:  el  => el.getAttribute(ALPHA_ATTR) ?? null,
            renderHTML: attrs => {
              if (!attrs[ALPHA_ATTR]) return {};
              return { [ALPHA_ATTR]: attrs[ALPHA_ATTR] };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      toggleAlphaList: () => ({ editor, chain, state }) => {
        const { from } = state.selection;
        const $pos   = state.doc.resolve(from);
        const node   = $pos.parent;

        const currentLetter = getAlphaLetter(node);

        if (currentLetter) {
          // Já tem marcador — remove (toggle off)
          return chain().focus().updateAttributes("paragraph", {
            [ALPHA_ATTR]: null,
            style: null,
          }).run();
        }

        // Não tem marcador — descobre qual letra usar olhando apenas para
        // os parágrafos alpha IMEDIATAMENTE anteriores ao cursor (sem gap).
        // Se houver qualquer parágrafo sem alpha entre o cursor e a sequência,
        // considera que é uma nova alínea e reinicia em 'a'.
        let lastLetter: string | null = null;
        const curNodeIndex = $pos.index($pos.depth - 1);
        const parent       = $pos.node($pos.depth - 1);

        // Percorre de trás para frente a partir do parágrafo imediatamente anterior
        for (let i = curNodeIndex - 1; i >= 0; i--) {
          const sibling = parent.child(i);
          const letter  = getAlphaLetter(sibling);
          if (letter) {
            lastLetter = letter;
            break; // Encontrou a sequência contígua mais próxima
          }
          // Parágrafo não-alpha interrompe a sequência → reinicia
          break;
        }

        const letter = lastLetter ? nextLetter(lastLetter) : "a";

        return chain().focus().updateAttributes("paragraph", {
          [ALPHA_ATTR]: letter,
          style: ALPHA_INDENT,
        }).run();
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Enter: se estiver num parágrafo com alpha-list, continua a sequência
      Enter: ({ editor }) => {
        const { state } = editor;
        const { from, empty } = state.selection;
        if (!empty) return false;

        const $pos = state.doc.resolve(from);
        const node = $pos.parent;
        const currentLetter = getAlphaLetter(node);
        if (!currentLetter) return false;

        // Se o parágrafo está vazio (só o marcador), remove o marcador (sai da lista)
        if (node.textContent.trim() === "") {
          return editor.chain().focus()
            .updateAttributes("paragraph", { [ALPHA_ATTR]: null, style: null })
            .run();
        }

        // Insere novo parágrafo com a próxima letra
        const next = nextLetter(currentLetter);
        return editor.chain().focus()
          .splitBlock()
          .updateAttributes("paragraph", {
            [ALPHA_ATTR]: next,
            style: ALPHA_INDENT,
          })
          .run();
      },

      // Backspace no início do parágrafo: remove o marcador
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { from, empty } = state.selection;
        if (!empty) return false;

        const $pos = state.doc.resolve(from);
        const node = $pos.parent;
        const currentLetter = getAlphaLetter(node);
        if (!currentLetter) return false;

        // Só remove se o cursor estiver no início do conteúdo
        const nodeStart = $pos.before() + 1;
        if (from > nodeStart) return false;

        return editor.chain().focus()
          .updateAttributes("paragraph", { [ALPHA_ATTR]: null, style: null })
          .run();
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("alphaListDecorations"),
      }),
    ];
  },
});
