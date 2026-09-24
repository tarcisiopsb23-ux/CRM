/**
 * AmendmentReviewModal
 *
 * Modal de revisão do documento de aditivo.
 * Exibe o HTML montado pelo assembleAmendment para revisão antes de confirmar.
 * Mais simples que o ReviewModal do contrato — sem edição inline de cláusulas.
 */
import { useState } from "react";
import { Loader2, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  html: string | null;
  isConfirming: boolean;
  onConfirm: () => Promise<void>;
  /** Título exibido no cabeçalho do modal */
  title?: string;
}

export function AmendmentReviewModal({
  isOpen, onClose, html, isConfirming, onConfirm, title = "Revisão do Aditivo",
}: Props) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  const isPending = confirming || isConfirming;

  return (
    <Dialog open={isOpen} onOpenChange={o => { if (!o && !isPending) onClose(); }}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0 flex flex-row items-center gap-2">
          <FileSignature className="h-5 w-5 text-violet-600 shrink-0" />
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {!html ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Montando o documento…</p>
            </div>
          ) : (
            <div
              className="bg-white text-black p-8 shadow rounded prose max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t shrink-0 sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Fechar
          </Button>
          <Button onClick={handleConfirm} disabled={!html || isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando documento…
              </>
            ) : (
              "Confirmar e Gerar Documento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
