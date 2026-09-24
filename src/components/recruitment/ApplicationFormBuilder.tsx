import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { JobFormQuestion, QuestionType, JobOpening } from "@/types/recruitment";
import { calculateMaxScore } from "@/lib/recruitmentScoring";

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: "Texto livre",
  single_choice: "Escolha única",
  multiple_choice: "Múltipla escolha",
  scale_1_5: "Escala 1–5",
  yes_no: "Sim / Não",
};

type DraftQuestion = Omit<JobFormQuestion, "id" | "created_at" | "organization_id" | "job_opening_id"> & {
  _key: string;
};

function newDraft(): DraftQuestion {
  return {
    _key: Math.random().toString(36).slice(2),
    question_text: "",
    question_type: "text",
    options: null,
    correct_answer: null,
    weight: 5,
    is_required: true,
    sort_order: 0,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobOpening: JobOpening;
  initialQuestions: JobFormQuestion[];
  onSave: (questions: Omit<JobFormQuestion, "id" | "created_at" | "organization_id" | "job_opening_id">[]) => Promise<void>;
  /** Callback para disparar geração com IA (opcional — exibe botão quando fornecido) */
  onGenerateWithAI?: () => Promise<void>;
  isGeneratingAI?: boolean;
}

export function ApplicationFormBuilder({ open, onOpenChange, jobOpening, initialQuestions, onSave, onGenerateWithAI, isGeneratingAI }: Props) {
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    initialQuestions.length > 0
      ? initialQuestions.map((q) => ({ ...q, _key: q.id }))
      : []
  );
  const [saving, setSaving] = useState(false);

  const maxScore = calculateMaxScore(questions);

  const addQuestion = () => {
    if (questions.length >= 30) {
      toast.error("Máximo de 30 perguntas por vaga.");
      return;
    }
    setQuestions((prev) => [...prev, { ...newDraft(), sort_order: prev.length }]);
  };

  const removeQuestion = (key: string) => {
    setQuestions((prev) => prev.filter((q) => q._key !== key));
  };

  const updateQuestion = (key: string, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q._key === key ? { ...q, ...patch } : q)));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setQuestions((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    setQuestions((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    for (const q of questions) {
      if (!q.question_text.trim()) {
        toast.error("Todas as perguntas precisam ter um enunciado.");
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(
        questions.map((q, i) => {
          // Remove _key, id e created_at — campos que não devem ir para o banco
          const { _key, id, created_at, ...rest } = q as any;
          void _key; void id; void created_at;
          return { ...rest, sort_order: i };
        })
      );
      toast.success("Formulário salvo com sucesso.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar formulário.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Formulário de candidatura — {jobOpening.title}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {questions.length} pergunta{questions.length !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className="text-xs text-blue-600">
              Pontuação máxima: {maxScore} pts
            </Badge>
            {onGenerateWithAI && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto border-violet-400 text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900 text-xs h-7"
                onClick={onGenerateWithAI}
                disabled={isGeneratingAI}
              >
                {isGeneratingAI
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Gerando...</>
                  : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Gerar com IA</>
                }
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {questions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma pergunta configurada. Clique em "Adicionar pergunta" para começar.
            </p>
          )}

          {questions.map((q, idx) => (
            <QuestionEditor
              key={q._key}
              question={q}
              index={idx}
              total={questions.length}
              onChange={(patch) => updateQuestion(q._key, patch)}
              onRemove={() => removeQuestion(q._key)}
              onMoveUp={() => moveUp(idx)}
              onMoveDown={() => moveDown(idx)}
            />
          ))}

          <Button variant="outline" onClick={addQuestion} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar pergunta
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar formulário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionEditor({
  question,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  question: DraftQuestion;
  index: number;
  total: number;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const needsOptions = question.question_type === "single_choice" || question.question_type === "multiple_choice";
  const needsCorrect = question.question_type !== "text";

  const optionsText = (question.options ?? []).join("\n");

  const handleOptionsChange = (text: string) => {
    const opts = text.split("\n").map((s) => s.trim()).filter(Boolean);
    onChange({ options: opts.length > 0 ? opts : null });
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-0.5 mt-1">
          <button onClick={onMoveUp} disabled={index === 0} className="p-0.5 hover:bg-muted rounded disabled:opacity-30">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 hover:bg-muted rounded disabled:opacity-30">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground w-6">{index + 1}.</span>
            <div className="flex-1">
              <Input
                value={question.question_text}
                onChange={(e) => onChange({ question_text: e.target.value })}
                placeholder="Enunciado da pergunta..."
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={question.question_type}
                onValueChange={(v) => onChange({ question_type: v as QuestionType, options: null, correct_answer: null })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Peso (1–10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={question.weight}
                onChange={(e) => onChange({ weight: Math.min(10, Math.max(1, Number(e.target.value))) })}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={question.is_required}
                  onCheckedChange={(v) => onChange({ is_required: v })}
                  id={`req-${question._key}`}
                />
                <Label htmlFor={`req-${question._key}`} className="text-xs cursor-pointer">Obrigatória</Label>
              </div>
            </div>
          </div>

          {needsOptions && (
            <div>
              <Label className="text-xs">Opções (uma por linha)</Label>
              <Textarea
                rows={3}
                value={optionsText}
                onChange={(e) => handleOptionsChange(e.target.value)}
                placeholder="Opção A&#10;Opção B&#10;Opção C"
                className="text-xs"
              />
            </div>
          )}

          {needsCorrect && (
            <div>
              <Label className="text-xs">
                Resposta correta
                {question.question_type === "multiple_choice" && " (separar por vírgula)"}
                {question.question_type === "yes_no" && " (sim ou não)"}
                {question.question_type === "scale_1_5" && " (1 a 5)"}
              </Label>
              <Input
                value={
                  Array.isArray(question.correct_answer)
                    ? question.correct_answer.join(", ")
                    : (question.correct_answer as string) ?? ""
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (question.question_type === "multiple_choice") {
                    onChange({ correct_answer: val.split(",").map((s) => s.trim()).filter(Boolean) });
                  } else {
                    onChange({ correct_answer: val });
                  }
                }}
                placeholder={
                  question.question_type === "yes_no"
                    ? "sim"
                    : question.question_type === "scale_1_5"
                    ? "5"
                    : "Resposta esperada..."
                }
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Pontuação máxima desta pergunta: {question.weight * 10} pts
              </p>
            </div>
          )}

          {question.question_type === "text" && (
            <p className="text-xs text-muted-foreground italic">
              Respostas de texto livre são avaliadas manualmente pelo gestor.
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onRemove} className="text-destructive hover:text-destructive mt-1">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
