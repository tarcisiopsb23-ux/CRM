import { Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  generateSchedule,
  type Recurrence,
  type ScheduleParams,
} from "@/lib/financialSchedule";
import type { ScheduleConfig } from "@/types/proposals";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

interface Props {
  value: ScheduleConfig | null;
  onChange: (config: ScheduleConfig) => void;
  readOnly?: boolean;
}

export function PropostaCronograma({ value, onChange, readOnly = false }: Props) {
  const config: ScheduleConfig = value ?? {
    firstValue: 0,
    firstDate: new Date().toISOString().split("T")[0],
    dueDay: 10,
    recurrence: "mensal",
    installments: 12,
  };

  const scheduleParams: ScheduleParams = {
    firstValue: config.firstValue,
    firstDate: config.firstDate,
    recurrence: config.recurrence,
    installments: config.installments,
    adjustments: config.adjustments,
  };

  const rows =
    config.firstValue > 0 && config.installments > 0
      ? generateSchedule(scheduleParams)
      : [];

  const set = (patch: Partial<ScheduleConfig>) => onChange({ ...config, ...patch });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" /> Cronograma Financeiro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Valor da parcela (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={config.firstValue || ""}
                onChange={(e) =>
                  set({ firstValue: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data da 1ª parcela</Label>
              <Input
                type="date"
                value={config.firstDate}
                onChange={(e) => set({ firstDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Recorrência</Label>
              <Select
                value={config.recurrence}
                onValueChange={(v) => set({ recurrence: v as Recurrence })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {RECURRENCE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nº de parcelas (máx 360)</Label>
              <Input
                type="number"
                min={1}
                max={360}
                value={config.installments}
                onChange={(e) =>
                  set({
                    installments: Math.min(
                      360,
                      Math.max(1, parseInt(e.target.value) || 1)
                    ),
                  })
                }
              />
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Nº</TableHead>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.installment}>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.installment}
                    </TableCell>
                    <TableCell className="text-sm">{row.monthRef}</TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {fmtCurrency(row.value)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.dueDate}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {rows.length === 0 && !readOnly && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Preencha o valor e o número de parcelas para gerar o cronograma.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
