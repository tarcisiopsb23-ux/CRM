import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Loader2, User, Mail, Phone, Linkedin, Globe } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScoreBadge } from "./ScoreBadge";
import { CandidateStatusBadge } from "./CandidateStatusBadge";
import type { Application, ApplicationStatus } from "@/types/recruitment";

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "em_analise", label: "Em análise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "reprovado", label: "Reprovado" },
  { value: "contratado", label: "Contratado" },
];

interface Props {
  application: Application | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: string, status: ApplicationStatus) => Promise<void>;
  onUpdateScore: (params: {
    id: string;
    score_manual: number;
    notes?: string;
    score_auto: number;
    score_max: number;
  }) => Promise<void>;
}

export function CandidateDetail({ application, open, onOpenChange, onUpdateStatus, onUpdateScore }: Props) {
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [scoreManual, setScoreManual] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Sync local state when application changes
  const [lastId, setLastId] = useState<string | null>(null);
  if (application && application.id !== lastId) {
    setLastId(application.id);
    setScoreManual(String(application.score_manual ?? ""));
    setNotes(application.notes ?? "");
  }

  if (!application) return null;

  const candidate = application.candidate;
  const fmtDate = (iso: string) => {
    try { return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); }
    catch { return "—"; }
  };

  const handleStatusChange = async (status: ApplicationStatus) => {
    setSavingStatus(true);
    try {
      await onUpdateStatus(application.id, status);
      toast.success("Status atualizado.");
    } catch {
      toast.error("Erro ao atualizar status.");
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSaveScore = async () => {
    const val = Number(scoreManual);
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error("Score manual deve ser entre 0 e 100.");
      return;
    }
    setSavingScore(true);
    try {
      await onUpdateScore({
        id: application.id,
        score_manual: val,
        notes,
        score_auto: application.score_auto ?? 0,
        score_max: application.score_max ?? 0,
      });
      toast.success("Avaliação salva.");
    } catch {
      toast.error("Erro ao salvar avaliação.");
    } finally {
      setSavingScore(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{candidate?.full_name ?? "Candidato"}</SheetTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <ScoreBadge percent={application.score_percent ?? 0} total={application.score_total} max={application.score_max} />
            <CandidateStatusBadge status={application.status} />
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Dados pessoais */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Dados pessoais</h3>
            <div className="space-y-1.5 text-sm">
              {candidate?.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span>{candidate.email}</span>
                </div>
              )}
              {candidate?.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{candidate.phone}</span>
                </div>
              )}
              {candidate?.linkedin_url && (
                <div className="flex items-center gap-2">
                  <Linkedin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                    LinkedIn
                  </a>
                </div>
              )}
              {candidate?.portfolio_url && (
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <a href={candidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                    Portfólio
                  </a>
                </div>
              )}
              {candidate?.resume_drive_url && (
                <a
                  href={candidate.resume_drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver currículo no Drive
                </a>
              )}
              <p className="text-xs text-muted-foreground">Candidatou-se em {fmtDate(application.applied_at)}</p>
            </div>
          </section>

          {application.cover_letter && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-2">Carta de apresentação</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{application.cover_letter}</p>
              </section>
            </>
          )}

          <Separator />

          {/* Respostas */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Respostas ao formulário</h3>
            {(application.answers ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma resposta registrada.</p>
            ) : (
              <div className="space-y-3">
                {application.answers.map((ans, i) => (
                  <div key={ans.question_id} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium">{i + 1}. {ans.question_text || `Pergunta ${i + 1}`}</p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {ans.score}/{ans.max_score} pts
                      </span>
                    </div>
                    <p className="text-sm">
                      {Array.isArray(ans.answer) ? ans.answer.join(", ") : String(ans.answer || "—")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Avaliação do gestor */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Avaliação do gestor</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Score manual (0–100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreManual}
                  onChange={(e) => setScoreManual(e.target.value)}
                  placeholder="0"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  Score automático: {application.score_auto ?? 0} pts · Máximo: {application.score_max ?? 0} pts
                </p>
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anotações sobre o candidato..."
                  className="mt-1"
                />
              </div>
              <Button size="sm" onClick={handleSaveScore} disabled={savingScore}>
                {savingScore && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Salvar avaliação
              </Button>
            </div>
          </section>

          <Separator />

          {/* Status */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Status da candidatura</h3>
            <div className="flex items-center gap-2">
              <Select value={application.status} onValueChange={(v) => handleStatusChange(v as ApplicationStatus)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savingStatus && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
