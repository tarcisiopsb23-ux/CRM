/**
 * VariableContractSection
 *
 * Configura o componente variável de um contrato do tipo 'variavel'.
 *
 * Campos de configuração (definidos no cadastro do contrato):
 *   - Valor fixo mensal (já existe no contractForm como recurring_value)
 *   - Percentual de comissão variável (ex: 10%)
 *   - Tipo de base de cálculo:
 *       'contrato_individual' — apuração por contrato fechado
 *       'faturamento_global'  — apuração sobre incremento de faturamento
 *   - Dia de vencimento da cobrança variável:
 *       'contrato_individual' — 5 dias após o registro (calculado automaticamente)
 *       'faturamento_global'  — vencimento na data do pagamento fixo do mês seguinte
 *
 * Exibe também um demonstrativo de exemplo baseado nos valores informados.
 */
import { PercentIcon, TrendingUp, FileText, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type VariableResultType = "contrato_individual" | "faturamento_global";

export interface VariableConfig {
  commission_pct: number;           // percentual ex: 10
  result_type: VariableResultType;
  fixed_value: number;              // valor fixo mensal (espelhado de recurring_value)
}

interface Props {
  config: VariableConfig;
  onChange: (config: VariableConfig) => void;
  disabled?: boolean;
}

export function VariableContractSection({ config, onChange, disabled }: Props) {
  const { commission_pct, result_type, fixed_value } = config;

  const update = (partial: Partial<VariableConfig>) =>
    onChange({ ...config, ...partial });

  // Demonstrativo de exemplos
  const examples = result_type === "contrato_individual"
    ? [
        { label: "Sem contratos fechados", result: 0 },
        { label: "1 contrato de R$ 9.000", result: 9000 },
        { label: "1 contrato de R$ 11.000", result: 11000 },
        { label: "2 contratos totalizando R$ 20.000", result: 20000 },
      ]
    : [
        { label: "Faturamento igual à média (sem incremento)", result: 0 },
        { label: "Incremento de R$ 25.000", result: 25000 },
        { label: "Incremento de R$ 50.000", result: 50000 },
        { label: "Incremento de R$ 100.000", result: 100000 },
      ];

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const commissionFor = (base: number) =>
    Math.round(base * commission_pct / 100 * 100) / 100;

  return (
    <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <PercentIcon className="h-4 w-4 text-blue-600" />
        <Label className="text-sm font-semibold text-blue-800">
          Configuração da Parte Variável
        </Label>
      </div>

      <p className="text-[11px] text-muted-foreground">
        A parte variável é lançada separadamente do fixo mensal, após o registro
        dos resultados do cliente pela agência.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {/* Percentual de comissão */}
        <div className="space-y-1.5">
          <Label className="text-sm">
            Percentual de comissão (%) <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={commission_pct === 0 ? "" : commission_pct}
              placeholder="Ex: 10"
              disabled={disabled}
              className="h-9 pr-7"
              onChange={e => update({ commission_pct: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        </div>

        {/* Tipo de base de cálculo */}
        <div className="space-y-1.5">
          <Label className="text-sm">
            Base de cálculo <span className="text-red-500">*</span>
          </Label>
          <Select
            value={result_type}
            onValueChange={v => update({ result_type: v as VariableResultType })}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contrato_individual">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-500" />
                  Por contrato fechado
                </div>
              </SelectItem>
              <SelectItem value="faturamento_global">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  Incremento de faturamento
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Explicação do tipo selecionado */}
      <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-white px-3 py-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
        {result_type === "contrato_individual" ? (
          <span>
            A comissão incide sobre o <strong>valor bruto de cada contrato fechado</strong> pelo
            cliente. O lançamento é gerado <strong>5 dias após o registro</strong> de cada contrato.
            Pode ser registrado individualmente (data + valor de cada contrato).
          </span>
        ) : (
          <span>
            A comissão incide sobre o <strong>incremento de faturamento</strong> acima da média
            dos últimos 12 meses registrada no sistema. O lançamento é gerado com vencimento
            na <strong>data do pagamento fixo do mês seguinte</strong>. O resultado é registrado
            como o faturamento total do mês (do dia 1 ao último dia).
          </span>
        )}
      </div>

      {/* Demonstrativo */}
      {commission_pct > 0 && (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-blue-700 uppercase tracking-wide">
            Demonstrativo de exemplo
          </Label>
          <div className="rounded border border-blue-100 bg-white overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-blue-50 border-b border-blue-100">
                  <th className="px-3 py-1.5 text-left font-medium text-blue-700">Situação</th>
                  <th className="px-3 py-1.5 text-right font-medium text-blue-700">Fixo</th>
                  <th className="px-3 py-1.5 text-right font-medium text-blue-700">
                    Variável ({commission_pct}%)
                  </th>
                  <th className="px-3 py-1.5 text-right font-medium text-blue-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {examples.map((ex, i) => {
                  const variable = commissionFor(ex.result);
                  const total = fixed_value + variable;
                  return (
                    <tr key={i} className={i % 2 === 0 ? "" : "bg-blue-50/30"}>
                      <td className="px-3 py-1 text-muted-foreground">{ex.label}</td>
                      <td className="px-3 py-1 text-right">{fmt(fixed_value)}</td>
                      <td className="px-3 py-1 text-right font-medium text-blue-700">
                        {variable > 0 ? `+ ${fmt(variable)}` : "—"}
                      </td>
                      <td className="px-3 py-1 text-right font-semibold">{fmt(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground">
            * Valores baseados no fixo de {fmt(fixed_value)} e comissão de {commission_pct}%.
            O lançamento variável é separado do fixo.
          </p>
        </div>
      )}
    </div>
  );
}
