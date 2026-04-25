/**
 * ManagerPinAdminDialog
 * Permite que owner/admin defina ou redefina o PIN gerencial de um colaborador
 * com role manager, admin ou owner.
 */
import { useState, useRef } from "react";
import { KeyRound, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;   // profile.id of the collaborator
  targetName: string;
  targetRole: string;
}

const ELIGIBLE_ROLES = ["owner", "admin", "manager"];

export function ManagerPinAdminDialog({ open, onOpenChange, targetUserId, targetName, targetRole }: Props) {
  const qc = useQueryClient();
  const canHavePin = ELIGIBLE_ROLES.includes(targetRole);

  const { data: hasPin = false } = useQuery({
    queryKey: ["manager_pin_exists_admin", targetUserId],
    queryFn: async () => {
      // Check via direct table query (admin can see org pins)
      const { data } = await supabase
        .from("manager_pins")
        .select("id")
        .eq("user_id", targetUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: open && !!targetUserId && canHavePin,
  });

  const [pin, setPin] = useState(["", "", "", "", "", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", "", "", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

  const pinValue = pin.join("");
  const confirmValue = confirmPin.join("");
  const isComplete = pinValue.length === 8 && confirmValue.length === 8;
  const isMatch = pinValue === confirmValue;

  const handleDigit = (
    index: number,
    value: string,
    arr: string[],
    setArr: (v: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...arr];
    next[index] = value.slice(-1);
    setArr(next);
    if (value && index < 7) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    arr: string[],
    setArr: (v: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (e.key === "Backspace" && !arr[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handleSave = async () => {
    if (!isComplete) { toast.error("Preencha todos os 8 dígitos."); return; }
    if (!isMatch) { toast.error("Os PINs não coincidem."); return; }

    setIsSaving(true);
    try {
      // Admin sets PIN on behalf of the collaborator via direct upsert
      // We need the organization_id — fetch from profiles
      const { data: profileData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", targetUserId)
        .single();

      if (!profileData?.organization_id) throw new Error("Organização não encontrada");

      // Hash the PIN client-side using SubtleCrypto (SHA-256)
      const encoder = new TextEncoder();
      const data = encoder.encode(pinValue);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const pinHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      const { error } = await supabase
        .from("manager_pins")
        .upsert({
          user_id: targetUserId,
          organization_id: profileData.organization_id,
          pin_hash: pinHash,
        }, { onConflict: "user_id" });

      if (error) throw error;

      toast.success(`PIN ${hasPin ? "atualizado" : "cadastrado"} para ${targetName}`);
      qc.invalidateQueries({ queryKey: ["manager_pin_exists_admin", targetUserId] });
      setPin(["", "", "", "", "", "", "", ""]);
      setConfirmPin(["", "", "", "", "", "", "", ""]);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao salvar PIN.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm(`Remover o PIN de ${targetName}?`)) return;
    const { error } = await supabase.from("manager_pins").delete().eq("user_id", targetUserId);
    if (error) { toast.error("Erro ao remover PIN."); return; }
    toast.success("PIN removido.");
    qc.invalidateQueries({ queryKey: ["manager_pin_exists_admin", targetUserId] });
    onOpenChange(false);
  };

  if (!canHavePin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            PIN Gerencial — {targetName}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {hasPin
              ? <><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> PIN já cadastrado. Defina um novo para substituir.</>
              : "Cadastre um PIN de 8 dígitos para este colaborador."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Novo PIN (8 dígitos)</Label>
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
                  onChange={e => handleDigit(i, e.target.value, pin, setPin, pinRefs)}
                  onKeyDown={e => handleKeyDown(e, i, pin, setPin, pinRefs)}
                  className="w-9 h-9 text-center text-sm p-0 font-mono"
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Confirmar PIN</Label>
            <div className="flex gap-1.5 items-center">
              {confirmPin.map((d, i) => (
                <Input
                  key={i}
                  ref={el => { confirmRefs.current[i] = el; }}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e.target.value, confirmPin, setConfirmPin, confirmRefs)}
                  onKeyDown={e => handleKeyDown(e, i, confirmPin, setConfirmPin, confirmRefs)}
                  className={`w-9 h-9 text-center text-sm p-0 font-mono ${
                    confirmValue.length === 8 ? (isMatch ? "border-emerald-400" : "border-red-400") : ""
                  }`}
                />
              ))}
              {confirmValue.length === 8 && (
                isMatch
                  ? <Check className="h-4 w-4 text-emerald-600 ml-1" />
                  : <span className="text-xs text-red-500 ml-1">Não coincidem</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {hasPin && (
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 sm:mr-auto" onClick={handleRemove}>
              Remover PIN
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!isComplete || !isMatch || isSaving}>
            {isSaving ? "Salvando..." : hasPin ? "Atualizar PIN" : "Cadastrar PIN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
