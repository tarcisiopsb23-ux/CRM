// src/components/contracts/settings/ClauseEditor.tsx
// TipTap-based rich text editor for contract clause content with variable insertion.
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.7

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered } from "lucide-react";

import { VariableMention } from "@/lib/contracts/tiptapExtensions";
import { normalizeServiceVariable, normalizeVariableIdentifier } from "@/lib/contracts/normalizeVariable";
import type { JSONContent, ServiceCatalogItem } from "@/types/contracts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Fixed variables (Requirement 3.2)
// ---------------------------------------------------------------------------

const FIXED_VARIABLES: { id: string; label: string }[] = [
  { id: "cliente",           label: "cliente" },
  { id: "empresa",           label: "empresa" },
  { id: "cnpj",              label: "cnpj" },
  { id: "cpf",               label: "cpf" },
  { id: "valor",             label: "valor" },
  { id: "servicos",          label: "servicos" },
  { id: "vencimento",        label: "vencimento" },
  { id: "primeiro_pagamento",label: "primeiro_pagamento" },
  { id: "data",              label: "data" },
  { id: "consultor",         label: "consultor" },
  { id: "escopo",            label: "escopo" },
  { id: "cronograma",        label: "cronograma" },
  { id: "prazo_minimo",      label: "prazo_minimo" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClauseEditorProps {
  /** Controlled TipTap JSONContent value (null = empty) */
  value: JSONContent | null;
  onChange: (value: JSONContent) => void;
  /** Services available for dynamic variable generation (Requirement 3.3) */
  availableServices?: ServiceCatalogItem[];
  disabled?: boolean;
  // Legacy optional callbacks kept for backward compatibility
  onEmptyChange?: (isEmpty: boolean) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Utility: checks whether a TipTap JSONContent value is effectively empty.
 * Useful for disabling the Save button when the editor has no content.
 */
export function isClauseContentEmpty(content: JSONContent | undefined | null): boolean {
  if (!content) return true;
  // A fresh empty TipTap doc looks like: { type: "doc", content: [{ type: "paragraph" }] }
  const doc = content as { type?: string; content?: Array<{ type?: string; content?: unknown[] }> };
  if (doc.type !== "doc") return false;
  const nodes = doc.content ?? [];
  if (nodes.length === 0) return true;
  if (nodes.length === 1) {
    const node = nodes[0];
    return node.type === "paragraph" && (!node.content || node.content.length === 0);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, label, children }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      size="sm"
      className={cn("h-8 w-8 p-0", isActive && "bg-muted")}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={isActive}
    >
      {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClauseEditor({
  value,
  onChange,
  availableServices = [],
  disabled = false,
  onEmptyChange,
}: ClauseEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      VariableMention,
    ],
    content: value ?? "",
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON() as JSONContent);
      onEmptyChange?.(e.isEmpty);
    },
  });

  // Sync external value changes (edit mode)
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value ?? "");
    if (current !== next) {
      editor.commands.setContent(
        (value ?? "") as Parameters<typeof editor.commands.setContent>[0]
      );
    }
  }, [editor, value]);

  // Sync disabled state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Notify empty state on mount
  useEffect(() => {
    if (!editor) return;
    onEmptyChange?.(editor.isEmpty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // ── Variable insertion ───────────────────────────────────────────────────

  const insertVariable = (varName: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: "variableMention",
      attrs: { id: varName, label: varName },
    }).run();
  };

  // ── Dynamic variables from availableServices (Requirement 3.3) ───────────

  const dynamicVariables: { id: string; label: string }[] = availableServices
    .map((service) => {
      const normalized = normalizeVariableIdentifier(service.name);
      const id = `escopo_${normalized}`;
      // Display label matches {{escopo_nome}} without braces
      return { id, label: id };
    })
    .filter((v) => v.id !== "escopo_"); // skip empty normalizations

  const allVariables = [...FIXED_VARIABLES, ...dynamicVariables];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background flex flex-col",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-0.5 border-b border-input px-2 py-1">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          isActive={!!editor?.isActive("bold")}
          disabled={disabled}
          label="Negrito"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          isActive={!!editor?.isActive("italic")}
          disabled={disabled}
          label="Itálico"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          isActive={!!editor?.isActive("underline")}
          disabled={disabled}
          label="Sublinhado"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          isActive={!!editor?.isActive("bulletList")}
          disabled={disabled}
          label="Lista não-ordenada"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          isActive={!!editor?.isActive("orderedList")}
          disabled={disabled}
          label="Lista ordenada"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* ── Variable panel ── */}
      <div className="border-b border-input bg-muted/30 px-3 py-2">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Variáveis — clique para inserir no cursor
        </p>
        <div className="flex flex-wrap gap-1.5">
          {allVariables.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => insertVariable(v.id)}
              disabled={disabled}
              title={`Inserir {{${v.label}}}`}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Badge
                variant="outline"
                className={cn(
                  "cursor-pointer text-xs font-mono transition-colors",
                  "hover:bg-primary hover:text-primary-foreground hover:border-primary",
                  disabled && "cursor-not-allowed opacity-50"
                )}
              >
                {`{{${v.label}}}`}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {/* ── Editor area ── */}
      <div className="relative">
        <EditorContent
          editor={editor}
          className={cn(
            "min-h-[160px] px-3 py-2 text-sm",
            "prose prose-sm max-w-none focus-within:outline-none",
            "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[140px]",
            // Variable chip styles
            "[&_.variable-chip]:inline-block [&_.variable-chip]:rounded",
            "[&_.variable-chip]:bg-primary/10 [&_.variable-chip]:text-primary",
            "[&_.variable-chip]:border [&_.variable-chip]:border-primary/30",
            "[&_.variable-chip]:px-1 [&_.variable-chip]:font-mono [&_.variable-chip]:text-xs"
          )}
        />

        {/* Empty placeholder */}
        {editor?.isEmpty && !disabled && (
          <p
            className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            Digite o conteúdo da cláusula…
          </p>
        )}
      </div>
    </div>
  );
}

// Re-export normalizeServiceVariable for consumers that need it
export { normalizeServiceVariable };
