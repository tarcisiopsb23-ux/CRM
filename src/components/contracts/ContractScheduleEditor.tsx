/**
 * ContractScheduleEditor
 * Editor de cronograma de pagamento linha a linha.
 * Permite adicionar, editar, reordenar e remover linhas.
 * Exibe preview do que será impresso no contrato.
 */
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Plus, Trash2, GripVertical, Info } from "lucide-react";
import type { ContractPaymentLine } from "@/hooks/useContractSchedule";

interface Props {
  lines: ContractPaymentLine[];
  onChange: (lines: ContractPaymentLine[]) => void;
  warnings?: string[];
}

const LINE_TYPE_LABELS: Record<string, string> = {
  setup:       "Setup / Implementação",
  mensalidade: "Mensalidade",
  unico:       "Pagamento Único",
  outro:       "Outro",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix:          "PIX",
  cartao:       "Cartão",
  boleto:       "Boleto",
  transferencia:"Transferência",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

export function ContractScheduleEditor({ lines, onChange, warnings = [] }: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const updateLine = (idx: number, patch: Partial<ContractPaymentLine>) => {
    const next = lines.map((l, i) => i === idx ? { ...l, ...patch } : l);
    onChange(next);
  };

  const addLine = () => {
    const last = lines[lines.length - 1];
    const newLine: ContractPaymentLine = {
      line_order:     lines.length,
      month_from:     (last?.month_to ?? last?.month_from ?? 0) + 1,
      month_to:       null,
      period_label:   "",
      due_date:       null,
      is_recurring:   false,
      amount:         0,
      payment_method: "pix",
      line_type:      "mensalidade",
      notes:          null,
    };
    onChange([...lines, newLine]);
    setEditingIdx(lines.length);
  };

  const removeLine = (idx: number) => {
    const next = lines.filter((_, i) => i !== idx)
      .map((l, i) => ({ ...l, line_order: i }));
    onChange(next);
    if (editingIdx === idx) setEditingIdx(null);
  };

  const moveLine = (idx: number, dir: -1 | 1) => {
    const next = [...lines];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next.map((l, i) => ({ ...l, line_order: i })));
  };

  // Determina se o cronograma é simplificável
  const recurrentLines = lines.filter(l => l.line_type === "mensalidade");
  const allSameAmount  = recurrentLines.length > 0 &&
    recurrentLines.every(l => l.amount === recurrentLines[0].amount);
  const isSimple       = lines.filter(l => l.line_type === "setup").length <= 1 &&
    recurrentLines.length === 1 && allSameAmount;

  return (
    <div className="space-y-4">
      {/* Alertas */}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {w}
        </div>
      ))}

      {/* Badge de tipo de cronograma */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={isSimple ? "text-emerald-600 border-emerald-300" : "text-violet-600 border-violet-300"}>
          {isSimple ? "Cronograma simples" : "Cronograma flexível"}
        </Badge>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" />
          {isSimple
            ? "Uma única linha de mensalidade — será exibido como valor fixo no contrato."
            : "Múltiplas linhas — tabela completa será exibida no contrato."}
        </span>
      </div>

      {/* Tabela de linhas */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-6 px-2 py-2" />
              <th className="text-left px-3 py-2">Período</th>
              <th className="text-left px-3 py-2">Vencimento</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-right px-3 py-2">Valor</th>
              <th className="text-left px-3 py-2">Pagamento</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <>
                <tr
                  key={idx}
                  className={`border-t cursor-pointer hover:bg-muted/30 transition-colors ${editingIdx === idx ? "bg-violet-50" : ""}`}
                  onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                >
                  <td className="px-2 py-2 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {line.period_label || <span className="text-muted-foreground italic text-xs">Sem rótulo</span>}
                    {line.month_to === null && (
                      <Badge variant="outline" className="ml-2 text-[10px] text-emerald-600 border-emerald-300">recorrente</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{fmtDate(line.due_date)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {LINE_TYPE_LABELS[line.line_type] ?? line.line_type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(line.amount)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[line.payment_method]}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={e => { e.stopPropagation(); moveLine(idx, -1); }}
                        disabled={idx === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground text-xs">↑</button>
                      <button type="button" onClick={e => { e.stopPropagation(); moveLine(idx, 1); }}
                        disabled={idx === lines.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground text-xs">↓</button>
                      <button type="button" onClick={e => { e.stopPropagation(); removeLine(idx); }}
                        className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Linha de edição inline */}
                {editingIdx === idx && (
                  <tr key={`edit-${idx}`} className="bg-violet-50 border-t">
                    <td />
                    <td colSpan={6} className="px-3 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Rótulo do período</Label>
                          <Input value={line.period_label} className="h-7 text-xs"
                            placeholder="Ex: Meses 1 e 2 / A partir do mês 3"
                            onChange={e => updateLine(idx, { period_label: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Mês inicial</Label>
                          <Input type="number" value={line.month_from} min={1} className="h-7 text-xs"
                            onChange={e => updateLine(idx, { month_from: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Mês final (vazio = em diante)</Label>
                          <Input type="number" value={line.month_to ?? ""} min={line.month_from} className="h-7 text-xs"
                            placeholder="∞ em diante"
                            onChange={e => updateLine(idx, { month_to: e.target.value ? Number(e.target.value) : null })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Data de vencimento</Label>
                          <Input type="date" value={line.due_date ?? ""} className="h-7 text-xs"
                            onChange={e => updateLine(idx, { due_date: e.target.value || null })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Valor (R$)</Label>
                          <Input type="number" value={line.amount} min={0} step={100} className="h-7 text-xs"
                            onChange={e => updateLine(idx, { amount: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Tipo da parcela</Label>
                          <Select value={line.line_type}
                            onValueChange={v => updateLine(idx, { line_type: v as ContractPaymentLine["line_type"] })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(LINE_TYPE_LABELS).map(([v, l]) => (
                                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Forma de pagamento</Label>
                          <Select value={line.payment_method}
                            onValueChange={v => updateLine(idx, { payment_method: v as ContractPaymentLine["payment_method"] })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label className="text-xs">Observação interna (não aparece no contrato)</Label>
                          <Input value={line.notes ?? ""} className="h-7 text-xs"
                            placeholder="Ex: carência do Agente IA"
                            onChange={e => updateLine(idx, { notes: e.target.value || null })} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {lines.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma linha no cronograma. Clique em "Adicionar linha" para começar.
          </p>
        )}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Adicionar linha
      </Button>
    </div>
  );
}
