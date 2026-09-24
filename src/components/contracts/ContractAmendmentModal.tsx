/**
 * ContractAmendmentModal
 *
 * Modal para criação e aplicação de aditivos contratuais.
 * Obrigatório quando o contrato está assinado (is_signed = true).
 *
 * Tipos suportados:
 *   - renovacao : estende prazo + define novo valor fixo
 *   - reajuste  : altera valor recorrente (pendentes atualizados a partir de data)
 *   - prazo     : apenas estende o prazo sem alterar valor
 *   - escopo    : alteração de escopo/serviços (documental, sem efeito financeiro)
 *   - outro     : demais alterações
 *
 * Fluxo:
 *   1. Usuário seleciona tipo e preenche campos
 *   2. Modal cria o aditivo (rascunho)
 *   3. Usuário revisa e confirma → aditivo aplicado imediatamente ou
 *      enviado para assinatura (pendente_assinatura)
 */
import { useState } from "react";
import { format, addMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileSignature, RefreshCw, TrendingUp, Clock, FileText,
  MoreHorizontal, Loader2, AlertTriangle, CheckCircle2, Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useContractAmendments,
  type AmendmentType,
  type ContractAmendment,
} from "@/hooks/useContractAmendments";
import { useAmendmentAssembly } from "@/hooks/useAmendmentAssembly";
import { AmendmentReviewModal } from "@/components/contracts/AmendmentReviewModal";
import type { ContractRow } from "@/hooks/useContracts";

// ── Tipos e constantes ────────────────────────────────────────────────────────

const AMENDMENT_LABELS: Record<AmendmentType, string> = {
  renovacao: "Renovação (extensão de prazo)",
  reajuste:  "Reajuste de valor",
  prazo:     "Extensão de prazo",
  escopo:    "Alteração de escopo",
  outro:     "Outro",
};

const AMENDMENT_ICONS: Record<AmendmentType, React.ReactNode> = {
  renovacao: <RefreshCw className="h-4 w-4 text-violet-500" />,
  reajuste:  <TrendingUp className="h-4 w-4 text-blue-500" />,
  prazo:     <Clock className="h-4 w-4 text-amber-500" />,
  escopo:    <FileText className="h-4 w-4 text-slate-500" />,
  outro:     <MoreHorizontal className="h-4 w-4 text-muted-foreground" />,
};

interface AmendmentForm {
  amendment_type: AmendmentType;
  reason: string;
  // Renovação / prazo
  additional_months: string;
  // Reajuste / renovação com novo valor
  new_value: string;
  value_effective_date: string;
}

const emptyForm = (): AmendmentForm => ({
  amendment_type:      "renovacao",
  reason:              "",
  additional_months:   "12",
  new_value:           "",
  value_effective_date: format(new Date(), "yyyy-MM-dd"),
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  contract: ContractRow;
  organizationId: string;
  /** Número do próximo aditivo (exibido no título) */
  nextAmendmentNumber?: number;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ContractAmendmentModal({
  open, onClose, contract, organizationId, nextAmendmentNumber = 1,
}: Props) {
  const { createAmendment, applyAmendment } = useContractAmendments(contract.id);

  const [form, setForm]                 = useState<AmendmentForm>(emptyForm);
  const [saving, setSaving]             = useState(false);
  // Aditivo criado — usado para montar o documento após aplicar
  const [appliedAmendment, setAppliedAmendment] = useState<ContractAmendment | null>(null);

  // Hook de montagem do documento de aditivo
  const {
    isReviewOpen, setIsReviewOpen,
    assembledHtml, isAssembling, isConfirming,
    openReview, confirmGenerate,
  } = useAmendmentAssembly(appliedAmendment, contract as ContractRow);

  const update = (patch: Partial<AmendmentForm>) => setForm(p => ({ ...p, ...patch }));

  const isTemporal = form.amendment_type === "renovacao" || form.amendment_type === "prazo";
  const isFinancial = form.amendment_type === "renovacao" || form.amendment_type === "reajuste";

  // Preview: nova data de término
  const previewEndDate = (() => {
    if (!isTemporal || !form.additional_months) return null;
    const months = parseInt(form.additional_months, 10);
    if (!months || months <= 0) return null;
    const base = contract.end_date ? parseISO(contract.end_date) : new Date();
    return format(addMonths(base, months), "dd/MM/yyyy", { locale: ptBR });
  })();

  // Preview: nova duração total
  const previewDuration = (() => {
    if (!isTemporal || !form.additional_months) return null;
    const months = parseInt(form.additional_months, 10);
    if (!months || months <= 0) return null;
    return (contract.duration_months ?? 0) + months;
  })();

  const handleSave = async () => {
    if (!form.reason.trim()) { toast.error("Informe o motivo do aditivo."); return; }
    if (isTemporal && (!form.additional_months || parseInt(form.additional_months) <= 0)) {
      toast.error("Informe o número de meses de extensão."); return;
    }
    if (form.amendment_type === "reajuste" && !form.new_value) {
      toast.error("Informe o novo valor recorrente."); return;
    }

    setSaving(true);
    try {
      // Snapshot do contrato antes da alteração
      const previousSnapshot: Record<string, unknown> = {
        value:           contract.value,
        duration_months: contract.duration_months,
        end_date:        contract.end_date,
        start_date:      contract.start_date,
        contract_type:   (contract.metadata as Record<string, unknown>)?.contract_type,
        metadata:        contract.metadata,
      };

      // Cria o aditivo
      const amendment = await createAmendment.mutateAsync({
        contract_id:       contract.id,
        client_id:         contract.client_id,
        amendment_type:    form.amendment_type,
        reason:            form.reason.trim(),
        additional_months: isTemporal ? parseInt(form.additional_months) : undefined,
        new_value:         isFinancial && form.new_value ? Number(form.new_value) : undefined,
        value_effective_date: form.amendment_type === "reajuste" ? form.value_effective_date : undefined,
        previous_snapshot,
      });

      // Aplica imediatamente
      await applyAmendment.mutateAsync({
        amendment,
        organizationIdParam: organizationId,
      });

      toast.success(`${AMENDMENT_LABELS[form.amendment_type]} aplicado com sucesso.`);
      setForm(emptyForm());
      // Guarda o aditivo criado para montar o documento e abre o ReviewModal
      setAppliedAmendment(amendment);
      onClose();
      setTimeout(() => openReview(amendment), 100);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao aplicar aditivo.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm(emptyForm());
    onClose();
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-violet-600" />
            {nextAmendmentNumber}º Aditivo — {contract.service_contracted || contract.title}
          </DialogTitle>
        </DialogHeader>

        {/* Aviso de bloqueio */}
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Este contrato está <strong>assinado</strong>. Alterações diretas são bloqueadas —
            toda modificação deve ser feita via aditivo.
          </span>
        </div>

        <div className="space-y-4 py-1">

          {/* Tipo do aditivo */}
          <div className="space-y-1.5">
            <Label>Tipo do aditivo <span className="text-red-500">*</span></Label>
            <Select
              value={form.amendment_type}
              onValueChange={v => update({ amendment_type: v as AmendmentType })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(AMENDMENT_LABELS) as [AmendmentType, string][]).map(([val, lbl]) => (
                  <SelectItem key={val} value={val}>
                    <div className="flex items-center gap-2">
                      {AMENDMENT_ICONS[val]}
                      {lbl}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campos de extensão de prazo */}
          {isTemporal && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meses adicionais <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={form.additional_months}
                  placeholder="Ex: 12"
                  className="h-9"
                  onChange={e => update({ additional_months: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Novo encerramento</Label>
                <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm">
                  {previewEndDate ?? "—"}
                </div>
              </div>
            </div>
          )}

          {/* Campo de novo valor */}
          {isFinancial && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  {form.amendment_type === "renovacao" ? "Novo valor mensal" : "Novo valor recorrente"}
                  {form.amendment_type === "reajuste" && <span className="text-red-500"> *</span>}
                </Label>
                <CurrencyInput
                  value={form.new_value}
                  placeholder={`Atual: ${fmt(contract.value ?? 0)}`}
                  onChange={v => update({ new_value: v })}
                />
              </div>
              {form.amendment_type === "reajuste" && (
                <div className="space-y-1.5">
                  <Label>Vigência a partir de <span className="text-red-500">*</span></Label>
                  <Input
                    type="date"
                    value={form.value_effective_date}
                    className="h-9"
                    onChange={e => update({ value_effective_date: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

          {/* Resumo do aditivo */}
          {(isTemporal || isFinancial) && (
            <div className="rounded-md border bg-violet-50/50 border-violet-200 px-3 py-2.5 space-y-1 text-[11px]">
              <p className="font-semibold text-violet-800 flex items-center gap-1.5">
                <Info className="h-3 w-3" /> Resumo do aditivo
              </p>
              {isTemporal && previewDuration && (
                <>
                  <p className="text-muted-foreground">
                    Prazo: <strong>{contract.duration_months ?? 0} meses</strong>
                    {" → "}
                    <strong className="text-violet-700">{previewDuration} meses</strong>
                    {" (+ "}{form.additional_months}{" meses)"}
                  </p>
                  <p className="text-muted-foreground">
                    Encerramento: <strong>{contract.end_date ? format(parseISO(contract.end_date), "dd/MM/yyyy") : "—"}</strong>
                    {" → "}
                    <strong className="text-violet-700">{previewEndDate}</strong>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Novos pagamentos gerados a partir do mês seguinte ao último vencimento.
                  </p>
                </>
              )}
              {isFinancial && form.new_value && (
                <p className="text-muted-foreground">
                  Valor: <strong>{fmt(contract.value ?? 0)}</strong>
                  {" → "}
                  <strong className="text-violet-700">{fmt(Number(form.new_value))}</strong>
                </p>
              )}
              {form.amendment_type === "reajuste" && form.new_value && form.value_effective_date && (
                <p className="text-[10px] text-muted-foreground">
                  Pagamentos pendentes a partir de {format(parseISO(form.value_effective_date), "dd/MM/yyyy")} serão atualizados.
                </p>
              )}
            </div>
          )}

          <Separator />

          {/* Motivo */}
          <div className="space-y-1.5">
            <Label>Motivo / descrição do aditivo <span className="text-red-500">*</span></Label>
            <Textarea
              value={form.reason}
              rows={3}
              placeholder="Descreva o motivo da alteração contratual..."
              className="resize-none text-sm"
              onChange={e => update({ reason: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground">
              Este texto ficará registrado no histórico de aditivos e poderá constar no documento gerado.
            </p>
          </div>

        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CheckCircle2 className="h-4 w-4" />
            }
            Aplicar aditivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal de revisão do documento do aditivo — abre após aplicar */}
    <AmendmentReviewModal
      isOpen={isReviewOpen}
      onClose={() => setIsReviewOpen(false)}
      html={assembledHtml}
      isConfirming={isConfirming || isAssembling}
      onConfirm={confirmGenerate}
      title={`${nextAmendmentNumber}º Aditivo — ${contract.service_contracted || contract.title}`}
    />
    </>
  );
}
