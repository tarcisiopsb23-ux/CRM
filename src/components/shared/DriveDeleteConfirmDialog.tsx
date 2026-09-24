/**
 * DriveDeleteConfirmDialog
 * Dialog de confirmação para exclusão de arquivos/pastas no Google Drive.
 * Requer PIN gerencial (8 dígitos) + justificativa obrigatória.
 * Restrito a roles: manager, admin, owner.
 */
import { useState, useRef } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useManagerPin } from "@/hooks/useManagerPin";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome do item sendo excluído (arquivo ou pasta) */
  itemName: string;
  /** "file" ou "folder" */
  itemType: "file" | "folder";
  /** Callback executado após confirmação bem-sucedida */
  onConfirm: () => Promise<void>;
}

export function DriveDeleteConfirmDialog({
  open,
  onOpenChange,
  itemName,
  itemType,
  onConfirm,
}: Props) {
  const { hasPin, verifyPin } = useManagerPin();

  const [pin, setPin] = useState(["", "", "", "", "", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [justification, setJustification] = useState("");
  const [loading, setLoading] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const pinValue = pin.join("");
  const isReady = pinValue.length === 8 && justification.trim().length >= 10;

  const handleDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...pin];
    next[index] = value.slice(-1);
    setPin(next);
    if (value && index < 7) pinRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  };

  const handleClose = () => {
    setPin(["", "", "", "", "", "", "", ""]);
    setJustification("");
    setShowPin(false);
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!isReady) return;

    // Verifica PIN
    const valid = await verifyPin(pinValue);
    if (!valid) {
      toast.error("PIN incorreto. Tente novamente.");
      setPin(["", "", "", "", "", "", "", ""]);
      pinRefs.current[0]?.focus();
      return;
    }

    setLoading(true);
    try {
      await onConfirm();
      toast.success(`${itemType === "file" ? "Arquivo" : "Pasta"} "${itemName}" excluído(a).`);
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" />
            Excluir {itemType === "file" ? "arquivo" : "pasta"}
          </DialogTitle>
          <DialogDescription className="flex items-start gap-2 pt-1">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Você está prestes a excluir <strong>"{itemName}"</strong> do Google Drive.
              Esta ação <strong>não pode ser desfeita</strong>.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* PIN */}
          {hasPin ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">PIN Gerencial *</Label>
                <button
                  type="button"
                  onClick={() => setShowPin(v => !v)}
                  className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
                >
                  {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showPin ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <div className="flex gap-1.5">
                {pin.map((d, i) => (
                  <Input
                    key={i}
                    ref={el => { pinRefs.current[i] = el; }}
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(e, i)}
                    className="w-9 h-9 text-center text-sm p-0 font-mono"
                    autoFocus={i === 0}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Você não tem PIN gerencial cadastrado. Configure em Configurações → Perfil → PIN Gerencial para habilitar exclusões.
              </p>
            </div>
          )}

          {/* Justificativa */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Justificativa * <span className="text-muted-foreground">(mínimo 10 caracteres)</span>
            </Label>
            <Textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Descreva o motivo da exclusão..."
              className="text-xs resize-none"
              rows={3}
            />
            <p className="text-[10px] text-muted-foreground text-right">
              {justification.trim().length}/10 mínimo
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={!isReady || !hasPin || loading}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Excluir permanentemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
