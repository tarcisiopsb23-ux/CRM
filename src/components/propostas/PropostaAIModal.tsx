import { useState, useEffect } from "react";
import { Sparkles, RefreshCw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  sectionLabel: string;
  generatedText: string | null;
  isLoading: boolean;
  error: string | null;
  onUse: (text: string) => void;
  onRegenerate: () => void;
  onCancel: () => void;
}

export function PropostaAIModal({
  open, sectionLabel, generatedText, isLoading, error,
  onUse, onRegenerate, onCancel,
}: Props) {
  const [editedText, setEditedText] = useState("");

  useEffect(() => {
    if (generatedText) setEditedText(generatedText);
  }, [generatedText]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar conteúdo — {sectionLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/40 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Gerando conteúdo com IA...
            </div>
          )}
          {error && !isLoading && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
          {!isLoading && generatedText !== null && (
            <Textarea
              rows={12}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="text-sm resize-none"
              placeholder="Conteúdo gerado aparecerá aqui..."
            />
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button variant="outline" onClick={onRegenerate} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Regenerar
          </Button>
          <Button
            onClick={() => onUse(editedText)}
            disabled={isLoading || !editedText.trim()}
          >
            <Check className="h-4 w-4 mr-1" /> Usar texto gerado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
