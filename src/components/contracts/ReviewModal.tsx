// src/components/contracts/ReviewModal.tsx
// Modal de revisão do contrato montado. Permite editar cláusulas editáveis
// inline antes de confirmar a geração do PDF.
//
// Requirements: 9.3, 9.5, 9.6, 9.7

import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { renderContractHtml } from "@/lib/contracts/renderContractHtml";
import type { ContractAssemblyResult } from "@/types/contracts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Raw assembly result — null while loading or not yet assembled */
  assembledResult: ContractAssemblyResult | null;
  /** Map of { [clause_id]: edited_html } — starts from persisted edits */
  clauseEdits: Record<string, string>;
  /** Called when the user saves an inline clause edit */
  onEditClause: (clauseId: string, html: string) => Promise<void>;
  /** Called when the user clicks "Confirmar e Gerar PDF" */
  onConfirmGenerate: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helper — extract clause IDs from HTML
// ---------------------------------------------------------------------------

function extractClauseIds(html: string): string[] {
  const ids: string[] = [];
  // Match data-clause-id="<id>" anywhere in the HTML
  const re = /data-clause-id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewModal({
  isOpen,
  onClose,
  assembledResult,
  clauseEdits,
  onEditClause,
  onConfirmGenerate,
}: ReviewModalProps) {
  // Track which clause is currently being edited
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Reset inline editor whenever the modal closes
  useEffect(() => {
    if (!isOpen) {
      setEditingId(null);
      setEditBuffer("");
    }
  }, [isOpen]);

  // ── Derived values ────────────────────────────────────────────────────────

  const renderedHtml = assembledResult
    ? renderContractHtml(assembledResult, clauseEdits)
    : null;

  const clauseIds = renderedHtml ? extractClauseIds(renderedHtml) : [];

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleEditClick(clauseId: string) {
    // Seed the buffer: prefer already-edited version, otherwise extract from
    // the rendered HTML (the section with data-clause-id="<id>")
    let initial = clauseEdits[clauseId] ?? "";

    if (!initial && renderedHtml) {
      const re = new RegExp(
        `data-clause-id="${clauseId}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
        "i"
      );
      const match = re.exec(renderedHtml);
      if (match) initial = match[0]; // use the whole element as starting point
    }

    setEditBuffer(initial);
    setEditingId(clauseId);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditBuffer("");
  }

  async function handleSaveEdit(clauseId: string) {
    setIsSavingEdit(true);
    try {
      await onEditClause(clauseId, editBuffer);
      setEditingId(null);
      setEditBuffer("");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleConfirm() {
    setIsConfirming(true);
    try {
      await onConfirmGenerate();
    } finally {
      setIsConfirming(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Revisão do Contrato</DialogTitle>
        </DialogHeader>

        {/* ── Main scrollable body ── */}
        <ScrollArea className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {!assembledResult ? (
            /* Loading / empty state */
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Montando o contrato…</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── HTML preview ── */}
              <div
                className="bg-white text-black p-8 shadow rounded prose max-w-none text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderedHtml ?? "" }}
              />

              {/* ── Inline clause editors ── */}
              {clauseIds.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Editar cláusulas
                  </h3>

                  {clauseIds.map((id) => (
                    <ClauseEditRow
                      key={id}
                      clauseId={id}
                      isEditing={editingId === id}
                      editBuffer={editBuffer}
                      isSaving={isSavingEdit}
                      onEditClick={() => handleEditClick(id)}
                      onCancel={handleCancelEdit}
                      onSave={() => handleSaveEdit(id)}
                      onBufferChange={setEditBuffer}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* ── Footer ── */}
        <DialogFooter className="px-6 py-4 border-t shrink-0 sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={isConfirming}>
            Fechar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!assembledResult || isConfirming}
          >
            {isConfirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando PDF…
              </>
            ) : (
              "Confirmar e Gerar PDF"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-component — single editable clause row
// ---------------------------------------------------------------------------

interface ClauseEditRowProps {
  clauseId: string;
  isEditing: boolean;
  editBuffer: string;
  isSaving: boolean;
  onEditClick: () => void;
  onCancel: () => void;
  onSave: () => void;
  onBufferChange: (v: string) => void;
}

function ClauseEditRow({
  clauseId,
  isEditing,
  editBuffer,
  isSaving,
  onEditClick,
  onCancel,
  onSave,
  onBufferChange,
}: ClauseEditRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
    }
  }, [isEditing]);

  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-muted-foreground truncate">
          Cláusula: {clauseId}
        </span>
        {!isEditing && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={onEditClick}
          >
            <Pencil className="h-3 w-3" />
            Editar
          </Button>
        )}
      </div>

      {isEditing && (
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={editBuffer}
            onChange={(e) => onBufferChange(e.target.value)}
            rows={6}
            className="font-mono text-xs resize-y"
            placeholder="Conteúdo HTML da cláusula…"
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1"
              onClick={onCancel}
              disabled={isSaving}
            >
              <X className="h-3 w-3" />
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Salvar edição
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
