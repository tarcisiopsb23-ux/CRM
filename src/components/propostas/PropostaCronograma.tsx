// src/components/propostas/PropostaCronograma.tsx
// Editor completo de cronograma financeiro da proposta.
// Suporta 7 modalidades de cobrança com campos condicionais por modo.

import { useState } from "react";
import { Calendar, ChevronDown, Info, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  generateScheduleFromConfig,
  MODE_LABELS,
  RECURRENCE_LABELS,
  PAYMENT_METHOD_LABELS,
  type Recurrence,
} from "@/lib/financialSchedule";
import type { ScheduleConfig, ScheduleMode, ScheduleSlice } from "@/types/proposals";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const ROW_TYPE_COLORS: Record<string, string> = {
  setup:     "text-amber-600",
  entrada:   "text-violet-600",
  conclusao: "text-blue-600",
  unico:     "text-emerald-600",
  mensalidade: "",
};

const ROW_TYPE_LABELS: Record<string, string> = {
  setup:     "Setup",
  entrada:   "Entrada",
  conclusao: "Conclusão",
  unico:     "Único",
  mensalidade: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  value: ScheduleConfig | null;
  /** Soma dos serviços não-bônus (referência de "preço de tabela") */
  totalIndividual?: number;
  /** Valor efetivamente cobrado ao cliente (pode ser <= totalIndividual) */
  planValue?: number;
  /** Callback para atualizar o plan_value quando o usuário altera o campo */
  onPlanValueChange?: (v: number) => void;
  onChange: (cfg: ScheduleConfig) => void;
  readOnly?: boolean;
}

// ─── Componente auxiliar: label com tooltip ───────────────────────────────────

function LabelTip({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs">{label}</span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {tip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

// ─── Campos: À vista ─────────────────────────────────────────────────────────

function ModeIntegral({ cfg, set }: { cfg: ScheduleConfig; set: (p: Partial<ScheduleConfig>) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Valor à vista (R$)</Label>
        <Input type="number" min={0} step={0.01} placeholder="0,00"
          value={cfg.integralValue ?? ""}
          onChange={(e) => set({ integralValue: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Data de vencimento</Label>
        <Input type="date" value={cfg.firstDate}
          onChange={(e) => set({ firstDate: e.target.value })} />
      </div>
    </div>
  );
}

// ─── Campos: Mensalidades fixas ───────────────────────────────────────────────

function ModeMensal({ cfg, set }: { cfg: ScheduleConfig; set: (p: Partial<ScheduleConfig>) => void }) {
  return (
    <div className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
      <div className="space-y-1.5">
        <Label className="text-xs">Valor da parcela (R$)</Label>
        <Input type="number" min={0} step={0.01} placeholder="0,00"
          value={cfg.firstValue || ""}
          onChange={(e) => set({ firstValue: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">1ª parcela</Label>
        <Input type="date" value={cfg.firstDate}
          onChange={(e) => set({ firstDate: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Recorrência</Label>
        <Select value={cfg.recurrence}
          onValueChange={(v) => set({ recurrence: v as Recurrence })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
              <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Nº de parcelas</Label>
        <Input type="number" min={1} max={360}
          value={cfg.installments}
          onChange={(e) => set({ installments: Math.min(360, Math.max(1, parseInt(e.target.value) || 1)) })} />
      </div>
    </div>
  );
}

// ─── Campos: Setup + Mensalidades ────────────────────────────────────────────

function ModeSetupMensal({ cfg, set }: { cfg: ScheduleConfig; set: (p: Partial<ScheduleConfig>) => void }) {
  return (
    <div className="space-y-4">
      {/* Setup */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          Setup / Implementação
        </p>
        <div className="grid gap-4 items-end"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="space-y-1.5">
            <LabelTip label="Valor do setup (R$)" tip="Cobrado na assinatura do contrato, separado das mensalidades." />
            <Input type="number" min={0} step={0.01} placeholder="0,00"
              value={cfg.setupValue ?? ""}
              onChange={(e) => set({ setupValue: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <LabelTip label="Parcelas do setup" tip="Normalmente 1. Pode parcelar o setup em até 12 vezes." />
            <Input type="number" min={1} max={12}
              value={cfg.setupInstallments ?? 1}
              onChange={(e) => set({ setupInstallments: Math.min(12, Math.max(1, parseInt(e.target.value) || 1)) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data de início</Label>
            <Input type="date" value={cfg.firstDate}
              onChange={(e) => set({ firstDate: e.target.value })} />
          </div>
        </div>
      </div>
      {/* Mensalidade */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mensalidades
        </p>
        <div className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor da mensalidade (R$)</Label>
            <Input type="number" min={0} step={0.01} placeholder="0,00"
              value={cfg.firstValue || ""}
              onChange={(e) => set({ firstValue: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <LabelTip label="Carência (meses)" tip="Meses sem cobrança de mensalidade após o setup. Ex: 1 = a 1ª mensalidade começa no mês 2." />
            <Input type="number" min={0} max={12}
              value={cfg.graceMonths ?? 0}
              onChange={(e) => set({ graceMonths: Math.min(12, Math.max(0, parseInt(e.target.value) || 0)) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Recorrência</Label>
            <Select value={cfg.recurrence}
              onValueChange={(v) => set({ recurrence: v as Recurrence })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                  <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nº de mensalidades</Label>
            <Input type="number" min={1} max={360}
              value={cfg.installments}
              onChange={(e) => set({ installments: Math.min(360, Math.max(1, parseInt(e.target.value) || 1)) })} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Campos: 50% / 50% ───────────────────────────────────────────────────────

function ModeMeioMeio({ cfg, set, planValue }: { cfg: ScheduleConfig; set: (p: Partial<ScheduleConfig>) => void; planValue: number }) {
  const pct = cfg.entryPercent ?? 50;
  const entrada = Math.round(planValue * (pct / 100) * 100) / 100;
  const restante = planValue - entrada;
  const trigger = cfg.secondPaymentTrigger ?? "conclusao";
  const isMonths = trigger !== "conclusao";

  return (
    <div className="space-y-4">
      <div className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="space-y-1.5">
          <Label className="text-xs">Data da entrada</Label>
          <Input type="date" value={cfg.firstDate}
            onChange={(e) => set({ firstDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <LabelTip label="% da entrada" tip="Percentual do valor total cobrado na assinatura. O restante é cobrado na conclusão ou após N meses." />
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={99} className="w-24"
              value={pct}
              onChange={(e) => set({ entryPercent: Math.min(99, Math.max(1, parseInt(e.target.value) || 50)) })} />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <LabelTip label="Quando receber o saldo" tip="'Na conclusão' = sem data fixa, a combinar. Ou defina quantos meses após a assinatura." />
          <Select value={isMonths ? "meses" : "conclusao"}
            onValueChange={(v) => set({ secondPaymentTrigger: v === "conclusao" ? "conclusao" : 1 })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="conclusao">Na conclusão</SelectItem>
              <SelectItem value="meses">Após N meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isMonths && (
          <div className="space-y-1.5">
            <Label className="text-xs">Meses até o saldo</Label>
            <Input type="number" min={1} max={24}
              value={typeof trigger === "number" ? trigger : 1}
              onChange={(e) => set({ secondPaymentTrigger: Math.min(24, Math.max(1, parseInt(e.target.value) || 1)) })} />
          </div>
        )}
      </div>
      {planValue > 0 && (
        <div className="rounded-lg bg-muted/30 border p-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Entrada ({pct}%)</p>
            <p className="font-semibold">{fmtCurrency(entrada)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saldo ({100 - pct}%)</p>
            <p className="font-semibold">{fmtCurrency(restante)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Campos: Entrada + Parcelado ──────────────────────────────────────────────

function ModeEntradaParcelado({ cfg, set }: { cfg: ScheduleConfig; set: (p: Partial<ScheduleConfig>) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">Entrada</p>
        <div className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor da entrada (R$)</Label>
            <Input type="number" min={0} step={0.01} placeholder="0,00"
              value={cfg.entryValue ?? ""}
              onChange={(e) => set({ entryValue: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data da entrada</Label>
            <Input type="date" value={cfg.firstDate}
              onChange={(e) => set({ firstDate: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Restante Parcelado</p>
        <div className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor de cada parcela (R$)</Label>
            <Input type="number" min={0} step={0.01} placeholder="0,00"
              value={cfg.remainderInstallmentValue ?? ""}
              onChange={(e) => set({ remainderInstallmentValue: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nº de parcelas</Label>
            <Input type="number" min={1} max={360}
              value={cfg.remainderInstallments ?? 1}
              onChange={(e) => set({ remainderInstallments: Math.min(360, Math.max(1, parseInt(e.target.value) || 1)) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Recorrência</Label>
            <Select value={cfg.recurrence}
              onValueChange={(v) => set({ recurrence: v as Recurrence })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                  <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Campos: Evolutivo / Carência (editor de fatias) ─────────────────────────

function ModeSlices({
  cfg, set, modeLabel,
}: {
  cfg: ScheduleConfig;
  set: (p: Partial<ScheduleConfig>) => void;
  modeLabel: string;
}) {
  const slices: ScheduleSlice[] = cfg.slices ?? [];

  const updateSlice = (i: number, patch: Partial<ScheduleSlice>) => {
    const next = slices.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    set({ slices: next });
  };

  const addSlice = () => {
    const last = slices[slices.length - 1];
    set({
      slices: [...slices, {
        label: `Fase ${slices.length + 1}`,
        value: last?.value ?? 0,
        installments: 3,
        firstDate: cfg.firstDate,
      }],
    });
  };

  const removeSlice = (i: number) => {
    set({ slices: slices.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="space-y-1.5">
          <Label className="text-xs">Data início</Label>
          <Input type="date" value={cfg.firstDate}
            onChange={(e) => set({ firstDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Recorrência entre parcelas</Label>
          <Select value={cfg.recurrence}
            onValueChange={(v) => set({ recurrence: v as Recurrence })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {slices.map((slice, i) => (
          <div key={i} className="rounded-lg border p-3 bg-muted/20 space-y-3 sm:space-y-0 sm:grid sm:gap-2 sm:items-end"
            style={{ gridTemplateColumns: "1fr 1fr minmax(90px,auto) auto" }}>
            <div className="space-y-1.5">
              <Label className="text-xs">Rótulo</Label>
              <Input placeholder="Ex: Meses 1–3"
                value={slice.label}
                onChange={(e) => updateSlice(i, { label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" min={0} step={0.01} placeholder="0,00"
                value={slice.value || ""}
                onChange={(e) => updateSlice(i, { value: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <LabelTip label="Parcelas" tip="Número de parcelas nesta fase. Deixe vazio ou 0 = recorrente indefinido (última fase)." />
              <Input type="number" min={0} max={360}
                placeholder="∞"
                value={slice.installments ?? ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  updateSlice(i, { installments: isNaN(v) || v <= 0 ? null : v });
                }} />
            </div>
            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 self-end"
              onClick={() => removeSlice(i)}
              disabled={slices.length <= 1}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={addSlice} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Adicionar fase
      </Button>

      <p className="text-xs text-muted-foreground">
        A última fase com parcelas em branco (∞) será tratada como recorrente indefinida.
      </p>
    </div>
  );
}

// ─── Preview: tabela de parcelas ─────────────────────────────────────────────

function SchedulePreview({ cfg, planValue }: { cfg: ScheduleConfig; planValue: number }) {
  const rows = generateScheduleFromConfig(cfg, planValue);
  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Pré-visualização do cronograma
      </p>
      <div className="rounded-md border overflow-hidden max-h-72 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Nº</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.installment} className={row.isRecurring ? "bg-muted/20" : ""}>
                <TableCell className="text-muted-foreground text-xs">{row.installment}</TableCell>
                <TableCell className="text-sm">
                  <span>{row.label}</span>
                  {row.type !== "mensalidade" && (
                    <span className={`ml-2 text-xs font-medium ${ROW_TYPE_COLORS[row.type] ?? ""}`}>
                      {ROW_TYPE_LABELS[row.type]}
                    </span>
                  )}
                  {row.isRecurring && (
                    <span className="ml-2 text-xs text-muted-foreground">(em diante)</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.dueDate}</TableCell>
                <TableCell className="text-right font-semibold text-sm">{fmtCurrency(row.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end">
        <p className="text-xs text-muted-foreground">
          Total listado: <strong>{fmtCurrency(total)}</strong>
          {cfg.mode !== "integral" && cfg.mode !== "meio_meio" && (
            <span className="text-muted-foreground/60 ml-1">
              (parcelas recorrentes não somadas na totalização)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const DEFAULT_SLICES: ScheduleSlice[] = [
  { label: "Meses 1–3", value: 0, installments: 3 },
  { label: "A partir do mês 4", value: 0, installments: null },
];

function ensureMode(cfg: ScheduleConfig): ScheduleConfig {
  // Retrocompatibilidade: registros antigos não têm mode
  if (!cfg.mode) return { ...cfg, mode: "mensal" };
  // Garante slices padrão para modos que precisam
  if ((cfg.mode === "evolutivo" || cfg.mode === "carencia") && !cfg.slices?.length) {
    return { ...cfg, slices: DEFAULT_SLICES };
  }
  return cfg;
}

export function PropostaCronograma({
  value,
  totalIndividual = 0,
  planValue = 0,
  onPlanValueChange,
  onChange,
  readOnly = false,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(true);

  const raw: ScheduleConfig = value ?? {
    mode: "mensal",
    firstValue: 0,
    firstDate: new Date().toISOString().split("T")[0],
    dueDay: 10,
    recurrence: "mensal",
    installments: 12,
    paymentMethod: "pix",
  };

  const cfg = ensureMode(raw);
  const set = (patch: Partial<ScheduleConfig>) => onChange({ ...cfg, ...patch });

  const handleModeChange = (mode: ScheduleMode) => {
    const base: ScheduleConfig = {
      ...cfg,
      mode,
      integralValue:             undefined,
      entryPercent:              undefined,
      secondPaymentTrigger:      undefined,
      entryValue:                undefined,
      remainderInstallmentValue: undefined,
      remainderInstallments:     undefined,
      slices:                    undefined,
      // setup add-on mantém os valores ao trocar de modo
    };
    if (mode === "integral")          { base.integralValue = planValue || 0; }
    if (mode === "setup_mensal")      { base.setupValue = base.setupValue ?? 0; base.setupInstallments = base.setupInstallments ?? 1; base.graceMonths = base.graceMonths ?? 0; base.hasSetup = false; }
    if (mode === "meio_meio")         { base.entryPercent = 50; base.secondPaymentTrigger = "conclusao"; }
    if (mode === "entrada_parcelado") { base.entryValue = 0; base.remainderInstallmentValue = 0; base.remainderInstallments = 6; }
    if (mode === "evolutivo" || mode === "carencia") {
      base.slices = [
        { label: "Meses 1–3", value: 0, installments: 3 },
        { label: "A partir do mês 4", value: 0, installments: null },
      ];
    }
    onChange(base);
  };

  // Desconto em relação ao total individual dos serviços
  const discount = totalIndividual > 0 && planValue > 0 && planValue < totalIndividual
    ? totalIndividual - planValue
    : 0;
  const discountPct = totalIndividual > 0 && discount > 0
    ? ((discount / totalIndividual) * 100).toFixed(0)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Cobrança e Cronograma Financeiro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── Bloco: Total da proposta ── */}
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          {totalIndividual > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total dos serviços</span>
              <span className="font-semibold">{fmtCurrency(totalIndividual)}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Label className="text-sm whitespace-nowrap shrink-0 font-medium">
              Total da proposta (R$)
            </Label>
            {readOnly ? (
              <span className="font-semibold text-sm">{fmtCurrency(planValue)}</span>
            ) : (
              <Input
                type="number"
                min={0}
                step={0.01}
                className="w-40"
                placeholder="0,00"
                value={planValue || ""}
                onChange={(e) => onPlanValueChange?.(parseFloat(e.target.value) || 0)}
              />
            )}
          </div>
          {discount > 0 && discountPct && (
            <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
              <span>Desconto para o cliente</span>
              <span className="font-bold">
                {fmtCurrency(discount)} ({discountPct}%)
              </span>
            </div>
          )}
          {!readOnly && totalIndividual > 0 && planValue >= totalIndividual && (
            <p className="text-xs text-muted-foreground">
              💡 Defina um valor menor que {fmtCurrency(totalIndividual)} para exibir o desconto ao cliente.
            </p>
          )}
        </div>

        {/* ── Setup add-on (combinável com qualquer modo) ── */}
        {!readOnly && cfg.mode !== "setup_mensal" && cfg.mode !== "integral" && cfg.mode !== "meio_meio" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Setup / Implementação
                </span>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-amber-600 dark:text-amber-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Adiciona uma cobrança de setup antes das mensalidades. Combinável com qualquer modalidade — ex: setup + evolutivo, setup + carência.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <button
                type="button"
                onClick={() => set({ hasSetup: !cfg.hasSetup, setupValue: cfg.setupValue ?? 0, setupInstallments: cfg.setupInstallments ?? 1, graceMonths: cfg.graceMonths ?? 0 })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${cfg.hasSetup ? "bg-amber-500" : "bg-input"}`}
                role="switch"
                aria-checked={cfg.hasSetup ?? false}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${cfg.hasSetup ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
            {cfg.hasSetup && (
              <div className="grid gap-4 pt-1 items-end"
                style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor do setup (R$)</Label>
                  <Input type="number" min={0} step={0.01} placeholder="0,00"
                    value={cfg.setupValue ?? ""}
                    onChange={(e) => set({ setupValue: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <LabelTip label="Parcelas do setup" tip="Normalmente 1. Pode dividir em até 12 vezes mensais." />
                  <Input type="number" min={1} max={12}
                    value={cfg.setupInstallments ?? 1}
                    onChange={(e) => set({ setupInstallments: Math.min(12, Math.max(1, parseInt(e.target.value) || 1)) })} />
                </div>
                <div className="space-y-1.5">
                  <LabelTip label="Carência (meses)" tip="Meses sem mensalidade após o último pagamento do setup. 0 = mensalidade começa no mês seguinte ao fim do setup." />
                  <Input type="number" min={0} max={24}
                    value={cfg.graceMonths ?? 0}
                    onChange={(e) => set({ graceMonths: Math.min(24, Math.max(0, parseInt(e.target.value) || 0)) })} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Seletor de modalidade ── */}
        {!readOnly && (
          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide">
              Modalidade de cobrança
            </Label>
            <Select value={cfg.mode} onValueChange={(v) => handleModeChange(v as ScheduleMode)}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABELS) as ScheduleMode[]).map((m) => (
                  <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ── Campos específicos por modo ── */}
        {!readOnly && (
          <div>
            {cfg.mode === "integral"          && <ModeIntegral cfg={cfg} set={set} />}
            {cfg.mode === "mensal"            && <ModeMensal cfg={cfg} set={set} />}
            {cfg.mode === "setup_mensal"      && <ModeSetupMensal cfg={cfg} set={set} />}
            {cfg.mode === "meio_meio"         && <ModeMeioMeio cfg={cfg} set={set} planValue={planValue} />}
            {cfg.mode === "entrada_parcelado" && <ModeEntradaParcelado cfg={cfg} set={set} />}
            {(cfg.mode === "evolutivo" || cfg.mode === "carencia") && (
              <ModeSlices cfg={cfg} set={set} modeLabel={MODE_LABELS[cfg.mode]} />
            )}
          </div>
        )}

        {/* ── Campos comuns: método de pagamento + observações ── */}
        {!readOnly && (
          <div className="grid gap-4 pt-2 border-t"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div className="space-y-1.5">
              <Label className="text-xs">Método de pagamento preferencial</Label>
              <Select value={cfg.paymentMethod ?? "pix"}
                onValueChange={(v) => set({ paymentMethod: v as ScheduleConfig["paymentMethod"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observação (exibida ao cliente)</Label>
              <Textarea rows={2} className="resize-none text-sm"
                placeholder="Ex: Pagamento via PIX com desconto de 5%"
                value={cfg.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value || undefined })} />
            </div>
          </div>
        )}

        {/* ── Preview do cronograma ── */}
        <div className="border-t pt-3">
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform duration-200"
              style={{ transform: previewOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
            Pré-visualização do cronograma
          </button>
          {previewOpen && <SchedulePreview cfg={cfg} planValue={planValue} />}
        </div>

      </CardContent>
    </Card>
  );
}
