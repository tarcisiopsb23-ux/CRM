/**
 * VariableResultsPanel
 *
 * Painel de registro e histórico de resultados variáveis de um contrato.
 * Exibido na aba "Contratos" do cliente, quando o contrato é do tipo 'variavel'.
 *
 * Funcionalidades:
 *   - Listar resultados por mês de referência
 *   - Registrar novo resultado (por contrato individual ou faturamento global)
 *   - Gerar lançamento em payments para a comissão apurada
 *   - Remover resultado sem lançamento gerado
 */
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Trash2, Loader2, Receipt, TrendingUp, FileText,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  useContractVariableResults,
  type SaveVariableResultInput,
  type IndividualContract,
  type ContractVariableResult,
  type VariableResultType,
} from "@/hooks/useContractVariableResults";

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface ResultForm {
  id?: string;
  reference_month: string;   // "YYYY-MM"
  // Contrato individual
  individual_contracts: IndividualContract[];
  // Faturamento global
  total_result_global: string;
  revenue_baseline: string;
  notes: string;
}

const emptyForm = (today: string): ResultForm => ({
  reference_month: today.slice(0, 7), // "YYYY-MM"
  individual_contracts: [{ date: today, value: 0, description: "" }],
  total_result_global: "",
  revenue_baseline: "",
  notes: "",
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  contractId: string;
  clientId: string;
  commissionPct: number;
  resultType: VariableResultType;
  recurringDueDate?: string;
  revenueBaseline?: number | null;  // média calculada pelo useDynamicRevenue
  disabled?: boolean;
}

// ── Formatadores ──────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtMonth(iso: string) {
  try { return format(parseISO(iso), "MMMM/yyyy", { locale: ptBR }); }
  catch { return iso; }
}

// ── Componente principal ──────────────────────────────────────────────────────

export function VariableResultsPanel({
  contractId,
  clientId,
  commissionPct,
  resultType,
  recurringDueDate,
  revenueBaseline,
  disabled,
}: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const {
    data: results = [],
    isLoading,
    saveResult,
    generatePayment,
    removeResult,
  } = useContractVariableResults(contractId);

  const [editing, setEditing] = useState<ResultForm | null>(null);
  const [saving, setSaving]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Cálculo de preview ──────────────────────────────────────────────────────
  const previewCommission = (form: ResultForm): number => {
    if (resultType === "contrato_individual") {
      const total = form.individual_contracts.reduce((s, c) => s + (c.value || 0), 0);
      return Math.round(total * commissionPct / 100 * 100) / 100;
    }
    const total = Number(form.total_result_global) || 0;
    const baseline = Number(form.revenue_baseline) || revenueBaseline || 0;
    const increment = Math.max(0, total - baseline);
    return Math.round(increment * commissionPct / 100 * 100) / 100;
  };

  // ── Salvar ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editing) return;
    if (!editing.reference_month) { toast.error("Informe o mês de referência."); return; }

    if (resultType === "contrato_individual") {
      const invalid = editing.individual_contracts.some(c => !c.date || c.value <= 0);
      if (invalid) { toast.error("Preencha data e valor de todos os contratos."); return; }
    } else {
      if (!editing.total_result_global || Number(editing.total_result_global) <= 0) {
        toast.error("Informe o faturamento total do mês."); return;
      }
    }

    setSaving(true);
    try {
      const referenceMonth = editing.reference_month + "-01";
      const input: SaveVariableResultInput = {
        id: editing.id,
        contract_id: contractId,
        client_id: clientId,
        reference_month: referenceMonth,
        result_type: resultType,
        commission_pct: commissionPct,
        recurring_due_date: recurringDueDate,
        notes: editing.notes || undefined,
        ...(resultType === "contrato_individual"
          ? { individual_contracts: editing.individual_contracts }
          : {
              total_result_global: Number(editing.total_result_global),
              revenue_baseline: Number(editing.revenue_baseline) || revenueBaseline || 0,
            }
        ),
      };
      await saveResult.mutateAsync(input);
      toast.success(editing.id ? "Resultado atualizado." : "Resultado registrado.");
      setEditing(null);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao salvar resultado.");
    } finally {
      setSaving(false);
    }
  };

  // ── Gerar lançamento ────────────────────────────────────────────────────────
  const handleGeneratePayment = async (result: ContractVariableResult) => {
    try {
      await generatePayment.mutateAsync(result);
      toast.success("Lançamento gerado com sucesso.");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao gerar lançamento.");
    }
  };

  // ── Remover ─────────────────────────────────────────────────────────────────
  const handleRemove = async (result: ContractVariableResult) => {
    if (result.payment_id) {
      toast.error("Não é possível remover um resultado com lançamento já gerado.");
      return;
    }
    try {
      await removeResult.mutateAsync(result.id);
      toast.success("Resultado removido.");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao remover resultado.");
    }
  };

  if (isLoading) return (
    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando resultados…
    </div>
  );

  const commission = editing ? previewCommission(editing) : 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            {resultType === "contrato_individual"
              ? <><FileText className="h-3.5 w-3.5 text-blue-500" /> Resultados por Contrato</>
              : <><TrendingUp className="h-3.5 w-3.5 text-green-500" /> Resultados por Faturamento</>
            }
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Comissão de {commissionPct}% sobre{" "}
            {resultType === "contrato_individual"
              ? "o valor dos contratos fechados"
              : "o incremento acima da média de faturamento"}
          </p>
        </div>
        <Button
          size="sm" variant="outline"
          className="gap-1.5 h-7 text-xs"
          disabled={disabled}
          onClick={() => setEditing(emptyForm(today))}
        >
          <Plus className="h-3 w-3" /> Registrar resultado
        </Button>
      </div>

      {/* Lista de resultados */}
      {results.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center border rounded-md">
          Nenhum resultado registrado ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {results.map(result => {
            const isExp = expanded === result.id;
            return (
              <div key={result.id} className="rounded-lg border bg-background">
                {/* Linha principal */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium capitalize">
                        {fmtMonth(result.reference_month)}
                      </span>
                      {result.payment_id ? (
                        <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Lançamento gerado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" /> Pendente lançamento
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                      <span>Base: {fmt(result.commission_base)}</span>
                      <span>Comissão: <strong className="text-foreground">{fmt(result.commission_value)}</strong></span>
                      <span>Venc.: {format(parseISO(result.due_date), "dd/MM/yyyy")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!result.payment_id && (
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
                        disabled={result.commission_value <= 0}
                        onClick={() => handleGeneratePayment(result)}
                      >
                        <Receipt className="h-3 w-3" /> Gerar lançamento
                      </Button>
                    )}
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setExpanded(isExp ? null : result.id)}
                    >
                      {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    {!result.payment_id && !disabled && (
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemove(result)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Detalhe expandido */}
                {isExp && (
                  <div className="border-t px-3 py-2.5 space-y-1.5">
                    {result.result_type === "contrato_individual" ? (
                      <>
                        <p className="text-[11px] font-medium text-muted-foreground">Contratos registrados:</p>
                        {(result.individual_contracts ?? []).map((c, i) => (
                          <div key={i} className="flex gap-3 text-[11px]">
                            <span className="text-muted-foreground">{format(parseISO(c.date), "dd/MM/yyyy")}</span>
                            <span className="font-medium">{fmt(c.value)}</span>
                            {c.description && <span className="text-muted-foreground">{c.description}</span>}
                          </div>
                        ))}
                        <Separator className="my-1" />
                        <div className="flex gap-3 text-[11px] font-medium">
                          <span>Total: {fmt(result.total_result)}</span>
                          <span className="text-blue-700">Comissão ({result.commission_pct}%): {fmt(result.commission_value)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <p className="text-muted-foreground">Faturamento do mês</p>
                            <p className="font-medium">{fmt(result.total_result)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Média base</p>
                            <p className="font-medium">{result.revenue_baseline ? fmt(result.revenue_baseline) : "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Incremento</p>
                            <p className="font-medium text-green-700">{fmt(result.incremental_result ?? 0)}</p>
                          </div>
                        </div>
                        <Separator className="my-1" />
                        <p className="text-[11px] font-medium text-blue-700">
                          Comissão ({result.commission_pct}% sobre {fmt(result.commission_base)}): {fmt(result.commission_value)}
                        </p>
                      </>
                    )}
                    {result.notes && (
                      <p className="text-[11px] text-muted-foreground italic">Obs: {result.notes}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog — registrar/editar resultado */}
      {editing && (
        <Dialog open onOpenChange={o => { if (!o) setEditing(null); }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                {resultType === "contrato_individual"
                  ? <><FileText className="h-4 w-4 text-blue-500" /> Registrar contratos do mês</>
                  : <><TrendingUp className="h-4 w-4 text-green-500" /> Registrar faturamento do mês</>
                }
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* Mês de referência */}
              <div className="space-y-1.5">
                <Label>Mês de referência <span className="text-red-500">*</span></Label>
                <Input
                  type="month"
                  value={editing.reference_month}
                  className="h-9"
                  onChange={e => setEditing(p => p ? { ...p, reference_month: e.target.value } : p)}
                />
              </div>

              {/* Contrato individual */}
              {resultType === "contrato_individual" && (
                <div className="space-y-2">
                  <Label>Contratos fechados <span className="text-red-500">*</span></Label>
                  {editing.individual_contracts.map((c, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div className="space-y-1">
                        {i === 0 && <span className="text-[10px] text-muted-foreground">Data</span>}
                        <Input
                          type="date" value={c.date} className="h-8"
                          onChange={e => {
                            const updated = [...editing.individual_contracts];
                            updated[i] = { ...updated[i], date: e.target.value };
                            setEditing(p => p ? { ...p, individual_contracts: updated } : p);
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        {i === 0 && <span className="text-[10px] text-muted-foreground">Valor do contrato</span>}
                        <CurrencyInput
                          value={c.value === 0 ? "" : String(c.value)}
                          placeholder="R$ 0,00"
                          onChange={v => {
                            const updated = [...editing.individual_contracts];
                            updated[i] = { ...updated[i], value: v ? Number(v) : 0 };
                            setEditing(p => p ? { ...p, individual_contracts: updated } : p);
                          }}
                        />
                      </div>
                      <Button
                        type="button" size="icon" variant="ghost"
                        className="h-8 w-8 text-red-500 hover:text-red-700 shrink-0"
                        disabled={editing.individual_contracts.length <= 1}
                        onClick={() => {
                          const updated = editing.individual_contracts.filter((_, idx) => idx !== i);
                          setEditing(p => p ? { ...p, individual_contracts: updated } : p);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button" size="sm" variant="outline"
                    className="gap-1 h-7 text-xs"
                    onClick={() => setEditing(p => p ? {
                      ...p,
                      individual_contracts: [...p.individual_contracts, { date: today, value: 0, description: "" }],
                    } : p)}
                  >
                    <Plus className="h-3 w-3" /> Adicionar contrato
                  </Button>
                </div>
              )}

              {/* Faturamento global */}
              {resultType === "faturamento_global" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Faturamento total do mês <span className="text-red-500">*</span></Label>
                    <CurrencyInput
                      value={editing.total_result_global}
                      placeholder="R$ 0,00"
                      onChange={v => setEditing(p => p ? { ...p, total_result_global: v } : p)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Média base (12m)
                      {revenueBaseline && (
                        <span className="text-[10px] text-muted-foreground ml-1">
                          (calculado: {fmt(revenueBaseline)})
                        </span>
                      )}
                    </Label>
                    <CurrencyInput
                      value={editing.revenue_baseline || (revenueBaseline ? String(revenueBaseline) : "")}
                      placeholder={revenueBaseline ? fmt(revenueBaseline) : "R$ 0,00"}
                      onChange={v => setEditing(p => p ? { ...p, revenue_baseline: v } : p)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Pré-preenchido com a média calculada. Edite se necessário.
                    </p>
                  </div>
                </div>
              )}

              {/* Preview da comissão */}
              {commission > 0 && (
                <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Comissão apurada: </span>
                  <strong className="text-blue-700">{fmt(commission)}</strong>
                  <span className="text-[11px] text-muted-foreground ml-2">({commissionPct}%)</span>
                </div>
              )}

              {/* Observações */}
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Input
                  value={editing.notes}
                  placeholder="Opcional"
                  className="h-8"
                  onChange={e => setEditing(p => p ? { ...p, notes: e.target.value } : p)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar resultado
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
