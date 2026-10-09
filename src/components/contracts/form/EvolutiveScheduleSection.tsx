/**
 * EvolutiveScheduleSection
 *
 * Permite definir um cronograma de valores mensais para contratos evolutivos.
 * O usuário informa o valor de cada mês; o último valor informado se repete
 * automaticamente até o fim da duração do contrato.
 *
 * Exemplo visual:
 *   Mês 1  R$ 1.500,00
 *   Mês 2  R$ 1.500,00
 *   Mês 3  R$ 2.000,00
 *   Mês 4  R$ 2.500,00
 *   Mês 5+ R$ 3.000,00  ← último: repete até o fim
 */
import { useEffect } from "react";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import type { EvolutiveEntry } from "@/lib/contracts/generatePayments";

interface Props {
  schedule: EvolutiveEntry[];
  durationMonths: number;
  onChange: (schedule: EvolutiveEntry[]) => void;
  disabled?: boolean;
}

export function EvolutiveScheduleSection({ schedule, durationMonths, onChange, disabled }: Props) {

  // Garante que sempre há ao menos uma entrada
  useEffect(() => {
    if (schedule.length === 0) {
      onChange([{ month: 1, value: 0 }]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addEntry = () => {
    const lastMonth = schedule.length > 0 ? schedule[schedule.length - 1].month : 0;
    const nextMonth = lastMonth + 1;
    if (nextMonth > durationMonths) return;
    onChange([...schedule, { month: nextMonth, value: schedule[schedule.length - 1]?.value ?? 0 }]);
  };

  const removeEntry = (idx: number) => {
    if (schedule.length <= 1) return; // sempre mantém ao menos 1
    onChange(schedule.filter((_, i) => i !== idx));
  };

  const updateMonth = (idx: number, month: number) => {
    const updated = schedule.map((e, i) => i === idx ? { ...e, month } : e);
    // Reordena por mês
    updated.sort((a, b) => a.month - b.month);
    onChange(updated);
  };

  const updateValue = (idx: number, value: number) => {
    onChange(schedule.map((e, i) => i === idx ? { ...e, value } : e));
  };

  const lastEntry = schedule[schedule.length - 1];
  const lastMonth = lastEntry?.month ?? 1;
  const canAdd = lastMonth < durationMonths;

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-violet-600" />
        <Label className="text-sm font-semibold text-violet-800">
          Cronograma Evolutivo de Valores
        </Label>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Defina o valor de cada faixa de meses. O último valor informado se repete
        automaticamente até o mês {durationMonths} (fim do contrato).
      </p>

      <div className="space-y-2">
        {schedule.map((entry, idx) => {
          const isLast = idx === schedule.length - 1;
          const nextEntry = schedule[idx + 1];
          // Rótulo do intervalo: "Mês X" ou "Mês X a Y" ou "Mês X em diante"
          const fromMonth = entry.month;
          const toMonth = isLast
            ? null
            : (nextEntry ? nextEntry.month - 1 : null);

          const rangeLabel = isLast
            ? `Mês ${fromMonth} em diante`
            : toMonth && toMonth > fromMonth
              ? `Mês ${fromMonth} a ${toMonth}`
              : `Mês ${fromMonth}`;

          return (
            <div key={idx} className="flex items-center gap-2">
              {/* Seletor de mês inicial da faixa */}
              <div className="flex flex-col gap-0.5 w-28 shrink-0">
                <span className="text-[10px] text-muted-foreground">A partir do mês</span>
                <input
                  type="number"
                  min={idx === 0 ? 1 : (schedule[idx - 1]?.month ?? 0) + 1}
                  max={durationMonths}
                  value={entry.month}
                  disabled={disabled || idx === 0} // mês 1 é fixo
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  onChange={e => updateMonth(idx, Math.max(1, Number(e.target.value)))}
                />
              </div>

              {/* Label do intervalo */}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-muted-foreground block mb-0.5">{rangeLabel}</span>
                <CurrencyInput
                  value={entry.value === 0 ? "" : String(entry.value)}
                  onChange={v => updateValue(idx, v ? Number(v) : 0)}
                  disabled={disabled}
                  placeholder="R$ 0,00"
                />
              </div>

              {/* Botão remover (desabilitado para o primeiro) */}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 mt-4"
                disabled={disabled || schedule.length <= 1}
                onClick={() => removeEntry(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Botão adicionar nova faixa */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-100"
        disabled={disabled || !canAdd}
        onClick={addEntry}
      >
        <Plus className="h-3 w-3" />
        Adicionar faixa
      </Button>

      {!canAdd && (
        <p className="text-[10px] text-muted-foreground">
          Todas as faixas até o mês {durationMonths} já foram definidas.
        </p>
      )}

      {/* Preview do cronograma completo */}
      {durationMonths > 0 && schedule.length > 0 && (
        <details className="mt-2">
          <summary className="text-[11px] text-violet-700 cursor-pointer select-none hover:underline">
            Ver prévia dos {durationMonths} meses
          </summary>
          <div className="mt-2 rounded border border-violet-100 bg-white max-h-40 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b bg-violet-50">
                  <th className="px-2 py-1 text-left font-medium text-violet-700">Mês</th>
                  <th className="px-2 py-1 text-right font-medium text-violet-700">Valor</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: durationMonths }, (_, i) => {
                  const m = i + 1;
                  // Encontra o valor correto para este mês
                  const sorted = [...schedule].sort((a, b) => a.month - b.month);
                  let val = sorted[0]?.value ?? 0;
                  for (const e of sorted) {
                    if (e.month <= m) val = e.value;
                    else break;
                  }
                  return (
                    <tr key={m} className={i % 2 === 0 ? "" : "bg-violet-50/30"}>
                      <td className="px-2 py-0.5 text-muted-foreground">Mês {m}</td>
                      <td className="px-2 py-0.5 text-right font-medium">
                        {val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
