/**
 * SecretQuestionForm
 *
 * Salva pergunta secreta + hash SHA-256 da resposta diretamente no user_metadata
 * via supabaseAuth.auth.updateUser — sem depender de edge function.
 *
 * O hash é calculado no frontend com Web Crypto API (SHA-256).
 * A resposta é normalizada (lowercase + trim + remove acentos) antes do hash.
 */

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabaseAuth } from "@/lib/supabase-auth";

const PRESET_QUESTIONS = [
  "Qual o nome do seu primeiro animal de estimação?",
  "Qual o nome da cidade onde você nasceu?",
  "Qual o nome da sua mãe?",
  "Qual o nome da sua escola primária?",
  "Qual o modelo do seu primeiro carro?",
  "Qual o apelido da sua infância?",
  "Qual o nome do seu melhor amigo de infância?",
  "Qual a sua comida favorita?",
  "Pergunta personalizada...",
];

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

interface Props {
  onSaved?: () => void;
  onSkip?: () => void;
  required?: boolean;
}

export function SecretQuestionForm({ onSaved, onSkip, required = false }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [confirmAnswer, setConfirmAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isCustom = selectedPreset === "Pergunta personalizada...";
  const question = isCustom ? customQuestion.trim() : selectedPreset;

  const handleSave = async () => {
    setError(null);
    if (!question) { setError("Selecione ou escreva uma pergunta."); return; }
    if (!answer.trim() || answer.trim().length < 3) { setError("A resposta deve ter pelo menos 3 caracteres."); return; }
    if (answer.trim() !== confirmAnswer.trim()) { setError("As respostas não coincidem."); return; }

    setLoading(true);
    try {
      const answerHash = await sha256hex(normalizeAnswer(answer));

      const { error: updateErr } = await supabaseAuth.auth.updateUser({
        data: {
          secret_question:    question,
          secret_answer_hash: answerHash,
        },
      });

      if (updateErr) {
        setError(`Erro ao salvar: ${updateErr.message}`);
        return;
      }

      setSuccess(true);
      setTimeout(() => { onSaved?.(); }, 1200);
    } catch (e: any) {
      setError(`Erro inesperado: ${e?.message ?? "tente novamente"}`);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <ShieldCheck className="h-10 w-10 text-emerald-400" />
        <p className="text-emerald-400 font-bold text-sm">Pergunta secreta salva com sucesso!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {required && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
          <p className="text-amber-300 text-xs font-bold">
            Obrigatório: configure uma pergunta secreta para poder recuperar o acesso caso esqueça a senha.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-slate-300">Pergunta secreta</Label>
        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
          <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-200 h-12">
            <SelectValue placeholder="Selecione uma pergunta..." />
          </SelectTrigger>
          <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
            {PRESET_QUESTIONS.map(q => (
              <SelectItem key={q} value={q} className="focus:bg-slate-700">{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isCustom && (
          <Input placeholder="Digite sua pergunta personalizada"
            className="bg-slate-900/50 border-slate-700 text-white h-12 mt-2"
            value={customQuestion} onChange={e => setCustomQuestion(e.target.value)} />
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">Resposta</Label>
        <Input type="text" placeholder="Sua resposta" autoComplete="off"
          className="bg-slate-900/50 border-slate-700 text-white h-12"
          value={answer} onChange={e => setAnswer(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">Confirmar resposta</Label>
        <Input type="text" placeholder="Repita a resposta" autoComplete="off"
          className="bg-slate-900/50 border-slate-700 text-white h-12"
          value={confirmAnswer} onChange={e => setConfirmAnswer(e.target.value)} />
        <p className="text-[10px] text-slate-500">Não diferencia maiúsculas/minúsculas ou acentos.</p>
      </div>

      {error && <p className="text-red-400 text-sm font-medium">{error}</p>}

      <div className="flex gap-3 pt-1">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}
            className="flex-1 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            Pular por agora
          </Button>
        )}
        <Button onClick={handleSave} disabled={loading || !question || !answer.trim()}
          className="flex-1 bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Salvar Pergunta"}
        </Button>
      </div>
    </div>
  );
}
