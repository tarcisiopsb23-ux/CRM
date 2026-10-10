import { Mention } from '@tiptap/extension-mention';

/**
 * VariableMention — TipTap extension for rendering contract variables as chips.
 * Variables are stored as mention nodes with attrs.id = variable name (e.g. "cliente")
 * and rendered as <span data-variable="{{nome}}" class="variable-chip">{{nome}}</span>
 *
 * Requirements: 3.1, 3.2, 3.4
 */
export const VariableMention = Mention.extend({
  name: 'variableMention',
}).configure({
  HTMLAttributes: {
    class: 'variable-chip',
  },
  renderLabel({ node }) {
    return `{{${node.attrs.id}}}`;
  },
  suggestion: {
    // Suggestion is handled externally via drag-and-drop; disable keyboard trigger
    char: '', // no trigger char — variables inserted programmatically
    items: () => [],
    render: () => ({ onStart: () => {}, onUpdate: () => {}, onKeyDown: () => false, onExit: () => {} }),
  },
});

/**
 * Base TipTap extensions list for the ClauseEditor.
 * Import this array and spread into the `extensions` prop.
 */
export { StarterKit } from '@tiptap/starter-kit';
