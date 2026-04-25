import { useState, useRef } from "react";
import { KeyRound, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useManagerPin } from "@/hooks/useManagerPin";

export function ManagerPinSection() {
  const { hasPin, isLoading, canHavePin, setPin } = useManagerPin();

  const [pin, setPin_] = useState(["", "", "", "", "", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", "", "", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

  if (!canHavePin) return null;

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
    next[index] = value.slice(-1); // only last digit
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
      await setPin.mutateAsync(pinValue);
      toast.success(hasPin ? "PIN atualizado com sucesso!" : "PIN cadastrado com sucesso!");
      setPin_(["", "", "", "", "", "", "", ""]);
      setConfirmPin(["", "", "", "", "", "", "", ""]);
      pinRefs.current[0]?.focus();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao salvar PIN.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">PIN Gerencial</h3>
        </div>
        {!isLoading && (
          <Badge className={hasPin ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"}>
            {hasPin ? <><ShieldCheck className="h-3 w-3 mr-1" />PIN cadastrado</> : "Sem PIN"}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        PIN numérico de 8 dígitos usado para confirmar ações críticas como cancelamentos e autorizações gerenciais.
      </p>

      <div className="space-y-3">
        {/* PIN input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{hasPin ? "Novo PIN" : "PIN"}</Label>
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
                onChange={e => handleDigit(i, e.target.value, pin, setPin_, pinRefs)}
                onKeyDown={e => handleKeyDown(e, i, pin, setPin_, pinRefs)}
                className="w-9 h-9 text-center text-sm p-0 font-mono"
              />
            ))}
          </div>
        </div>

        {/* Confirm PIN */}
        <div className="space-y-1.5">
          <Label className="text-xs">Confirmar PIN</Label>
          <div className="flex gap-1.5">
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
                  confirmValue.length === 8
                    ? isMatch ? "border-emerald-400" : "border-red-400"
                    : ""
                }`}
              />
            ))}
            {confirmValue.length === 8 && (
              <div className="flex items-center ml-1">
                {isMatch
                  ? <Check className="h-4 w-4 text-emerald-600" />
                  : <span className="text-xs text-red-500">Não coincidem</span>
                }
              </div>
            )}
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isComplete || !isMatch || isSaving}
          className="w-full"
        >
          {isSaving ? "Salvando..." : hasPin ? "Atualizar PIN" : "Cadastrar PIN"}
        </Button>
      </div>
    </div>
  );
}
