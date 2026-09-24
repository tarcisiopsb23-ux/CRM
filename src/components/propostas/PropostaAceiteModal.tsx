import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const TRACK_URL = `${SUPABASE_URL}/functions/v1/proposal-track-event`;

interface Props {
  open: boolean;
  slug: string;
  proposalSnapshot: Record<string, unknown>;
  onAccepted: () => void;
  onClose: () => void;
}

function getSessionId(): string {
  let sid = sessionStorage.getItem("proposal_session_id");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("proposal_session_id", sid);
  }
  return sid;
}

function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(digits[10]);
}

export function PropostaAceiteModal({
  open,
  slug,
  proposalSnapshot,
  onAccepted,
  onClose,
}: Props) {
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Nome obrigatório";
    if (!validateCPF(cpf)) e.cpf = "CPF inválido";
    if (!terms) e.terms = "Aceite os termos para continuar";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleConfirm = async () => {
    if (!validate()) return;
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch(TRACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "aceite",
          slug,
          session_id: getSessionId(),
          user_agent: navigator.userAgent,
          approver_name: name.trim(),
          approver_cpf: cpf.replace(/\D/g, ""),
          proposal_snapshot: proposalSnapshot,
        }),
      });
      if (res.status === 409) {
        setApiError("Esta proposta já foi aprovada.");
        return;
      }
      if (!res.ok) {
        setApiError("Erro ao registrar aceite. Tente novamente.");
        return;
      }
      onAccepted();
    } catch {
      setApiError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Aprovar Proposta
          </DialogTitle>
          <DialogDescription>
            Preencha os dados para registrar seu aceite digital.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nome completo *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>CPF *</Label>
            <Input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
            />
            {errors.cpf && (
              <p className="text-xs text-red-500">{errors.cpf}</p>
            )}
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="terms-aceite"
              checked={terms}
              onCheckedChange={(v) => setTerms(!!v)}
            />
            <Label
              htmlFor="terms-aceite"
              className="text-sm leading-relaxed cursor-pointer"
            >
              Declaro que li e aceito os termos desta proposta
            </Label>
          </div>
          {errors.terms && (
            <p className="text-xs text-red-500">{errors.terms}</p>
          )}
          {apiError && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-2">
              {apiError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Registrando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar aceite
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
