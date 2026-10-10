// src/components/propostas/PropostaCronograma.tsx
// Editor completo de cronograma financeiro da proposta.
// Suporta modalidades: integral, mensal, setup_mensal, meio_meio,
//   entrada_parcelado, evolutivo, eventual.
// Carência removida. Modo 'carencia' legado é tratado como 'evolutivo'.

import { useState, useEffect } from "react";
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
import type {
  ScheduleConfig,
  ScheduleMode,
  ScheduleSlice,
  EventualParcela,
} from "@/types/proposals";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const parsePct = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
};

const ROW_TYPE_COLORS: Record<string, string> = {
  setup:       "text-amber-600",
  entrada:     "text-violet-600",
  conclusao:   "text-blue-600",
  unico:       "text-emerald-600",
  mensalidade: "",
};

const ROW_TYPE_LABELS: Record<string, string> = {
  setup:       "Setup",
  entrada:     "Entrada",
  conclusao:   "Conclusão",
  unico:       "Único",
  mensalidade: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  value: ScheduleConfig | null;
  totalIndividual?: number;
  planValue?: number;
  onPlanValueChange?: (v: number) => void;
  onChange: (cfg: ScheduleConfig) => void;
  readOnly?: boolean;
}

// ─── Label com tooltip ────────────────────────────────────────────────────────

function LabelTip({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs">{label}</span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">{tip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

// ─── Campos: À vista ──────────────────────────────────────────────────────────

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

function ModeMensal({
  cfg, set, planValue,
}: {
  cfg: ScheduleConfig;
  set: (p: Partial<ScheduleConfig>) => void;
  planValue: number;
}) {
  const [customizeDates, setCustomizeDates] = useState(
    Object.keys(cfg.dateOverrides ?? {}).length > 0
  );
  const qty = Math.min(cfg.installments, 60); // limita preview a 60 linhas

  const setOverride = (i: number, patch: { date?: string; paymentMethod?: string }) => {
    const prev = cfg.dateOverrides ?? {};
    set({ dateOverrides: { ...prev, [i]: { ...prev[i], ...patch } } });
  };

  // Calcula datas padrão para pré-preencher os overrides
  const defaultDates = Array.from({ length: qty }, (_, i) => {
    const base = new Date(cfg.firstDate + "T12:00:00");
    base.setMonth(base.getMonth() + i);
    return base.toISOString().split("T")[0];
  });

  return (
    <div className="space-y-4">
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
            onChange={(e) => set({ firstDate: e.target.value, dateOverrides: undefined })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Recorrência</Label>
          <Select value={cfg.recurrence}
            onValueChange={(v) => set({ recurrence: v as Recurrence, dateOverrides: undefined })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <LabelTip label="Nº de parcelas" tip="Total de parcelas do cronograma." />
          <Input type="number" min={1} max={360}
            value={cfg.installments}
            onChange={(e) => set({ installments: Math.min(360, Math.max(1, parseInt(e.target.value) || 1)), dateOverrides: undefined })} />
        </div>
      </div>

      {/* Toggle personalizar datas */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold">Personalizar datas de vencimento</p>
          <p className="text-xs text-muted-foreground">
            Defina a data exata e o método de cada parcela individualmente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !customizeDates;
            setCustomizeDates(next);
            if (!next) set({ dateOverrides: undefined });
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${customizeDates ? "bg-primary" : "bg-input"}`}
          role="switch" aria-checked={customizeDates}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${customizeDates ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </div>

      {customizeDates && qty > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Nº</TableHead>
                <TableHead>Data de vencimento</TableHead>
                <TableHead>Método de pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: qty }, (_, i) => {
                const override = cfg.dateOverrides?.[i] ?? {};
                const date = override.date ?? defaultDates[i] ?? "";
                const method = override.paymentMethod ?? cfg.paymentMethod ?? "pix";
                return (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell>
                      <Input type="date" value={date} className="h-8 text-xs"
                        onChange={(e) => setOverride(i, { date: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Select value={method}
                        onValueChange={(v) => setOverride(i, { paymentMethod: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Campos: Setup + Mensalidades (legado) ────────────────────────────────────

function ModeSetupMensal({ cfg, set }: { cfg: ScheduleConfig; set: (p: Partial<ScheduleConfig>) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Setup / Implementação</p>
        <div className="grid gap-4 items-end" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="space-y-1.5">
            <LabelTip label="Valor do setup (R$)" tip="Cobrado na assinatura do contrato." />
            <Input type="number" min={0} step={0.01} placeholder="0,00"
              value={cfg.setupValue ?? ""}
              onChange={(e) => set({ setupValue: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <LabelTip label="Parcelas do setup" tip="Normalmente 1. Pode parcelar em até 12 vezes." />
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
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensalidades</p>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor da mensalidade (R$)</Label>
            <Input type="number" min={0} step={0.01} placeholder="0,00"
              value={cfg.firstValue || ""}
              onChange={(e) => set({ firstValue: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Recorrência</Label>
            <Select value={cfg.recurrence} onValueChange={(v) => set({ recurrence: v as Recurrence })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                  <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <LabelTip label="Prazo total (meses)" tip="Inclui o setup. Ex: 12 meses = 1 setup + 11 mensalidades." />
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
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="space-y-1.5">
          <Label className="text-xs">Data da entrada</Label>
          <Input type="date" value={cfg.firstDate} onChange={(e) => set({ firstDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <LabelTip label="% da entrada" tip="Percentual cobrado na assinatura." />
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={99} className="w-24"
              value={pct}
              onChange={(e) => set({ entryPercent: Math.min(99, Math.max(1, parseInt(e.target.value) || 50)) })} />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <LabelTip label="Quando receber o saldo" tip="Na conclusão = sem data fixa. Ou N meses após a assinatura." />
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
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor da entrada (R$)</Label>
            <Input type="number" min={0} step={0.01} placeholder="0,00"
              value={cfg.entryValue ?? ""}
              onChange={(e) => set({ entryValue: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data da entrada</Label>
            <Input type="date" value={cfg.firstDate} onChange={(e) => set({ firstDate: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Restante Parcelado</p>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
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
            <Select value={cfg.recurrence} onValueChange={(v) => set({ recurrence: v as Recurrence })}>
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

// ─── Campos: Evolutivo ────────────────────────────────────────────────────────

function ModeEvolutivo({
  cfg, set, planValue,
}: {
  cfg: ScheduleConfig;
  set: (p: Partial<ScheduleConfig>) => void;
  planValue: number;
}) {
  const slices: ScheduleSlice[] = cfg.slices ?? [];

  const updateSlice = (i: number, patch: Partial<ScheduleSlice>) => {
    set({ slices: slices.map((s, idx) => idx === i ? { ...s, ...patch } : s) });
  };

  // Quando o usuário edita o VALOR → recalcula o %
  const handleValueChange = (i: number, rawValue: string) => {
    const value = parseFloat(rawValue) || 0;
    updateSlice(i, { value });
  };

  // Quando o usuário edita o % → recalcula o valor
  const handlePctChange = (i: number, rawPct: string) => {
    const pct = parsePct(rawPct);
    const value = planValue > 0
      ? Math.round(planValue * (pct / 100) * 100) / 100
      : 0;
    updateSlice(i, { value });
  };

  // % atual de uma fatia em relação ao planValue
  const getPct = (value: number): string => {
    if (!planValue || planValue === 0) return "";
    return ((value / planValue) * 100).toFixed(1);
  };

  const addSlice = () => {
    const last = slices[slices.length - 1];
    set({
      slices: [...slices, {
        label:        `Fase ${slices.length + 1}`,
        value:        last?.value ?? planValue ?? 0,
        installments: 3,
        firstDate:    cfg.firstDate,
      }],
    });
  };

  const removeSlice = (i: number) => {
    set({ slices: slices.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="space-y-1.5">
          <Label className="text-xs">Data início</Label>
          <Input type="date" value={cfg.firstDate}
            onChange={(e) => set({ firstDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Recorrência entre parcelas</Label>
          <Select value={cfg.recurrence} onValueChange={(v) => set({ recurrence: v as Recurrence })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fases */}
      <div className="space-y-3">
        {slices.map((slice, i) => (
          <div key={i} className="rounded-lg border p-3 bg-muted/20 space-y-3">
            {/* Linha 1: rótulo + parcelas + data de início */}
            <div className="grid gap-2 items-end sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Rótulo da fase</Label>
                <Input placeholder="Ex: Meses 1–3"
                  value={slice.label}
                  onChange={(e) => updateSlice(i, { label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <LabelTip label="Parcelas" tip="Número de parcelas nesta fase. Deixe em branco = recorrente indefinido (última fase)." />
                <Input type="number" min={0} max={360}
                  placeholder="∞"
                  value={slice.installments ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    updateSlice(i, { installments: isNaN(v) || v <= 0 ? null : v });
                  }} />
              </div>
              <div className="space-y-1.5">
                <LabelTip label="Data início da fase" tip="Data da 1ª parcela desta fase. Se em branco, continua da fase anterior." />
                <Input type="date"
                  value={slice.firstDate ?? ""}
                  onChange={(e) => updateSlice(i, { firstDate: e.target.value || undefined })} />
              </div>
            </div>

            {/* Linha 2: valor + % lado a lado */}
            <div className="grid gap-2 items-end sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor da parcela (R$)</Label>
                <Input type="number" min={0} step={0.01} placeholder="0,00"
                  value={slice.value || ""}
                  onChange={(e) => handleValueChange(i, e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <LabelTip
                  label="Redução / % do valor cheio"
                  tip={planValue > 0
                    ? `Porcentagem em relação ao valor cheio (${fmtCurrency(planValue)}). Altere o % para calcular o valor automaticamente.`
                    : "Defina o valor total da proposta para calcular % automaticamente."}
                />
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={0} max={100} step={0.1}
                    placeholder="100"
                    value={getPct(slice.value)}
                    onChange={(e) => handlePctChange(i, e.target.value)}
                    className="w-24" />
                  <span className="text-sm text-muted-foreground">%</span>
                  {planValue > 0 && slice.value < planValue && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      ({fmtCurrency(planValue - slice.value)} de desconto)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="icon"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => removeSlice(i)}
                  disabled={slices.length <= 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={addSlice} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Adicionar fase
      </Button>

      <p className="text-xs text-muted-foreground">
        A última fase com parcelas em branco (∞) será recorrente indefinida.
        Defina a data de início de cada fase para controlar datas exatas.
      </p>
    </div>
  );
}

// ─── Campos: Eventual (serviço pontual / parcelado livre) ─────────────────────

function ModeEventual({ cfg, set }: { cfg: ScheduleConfig; set: (p: Partial<ScheduleConfig>) => void }) {
  const parcelas: EventualParcela[] = cfg.eventualParcelas ?? [];

  const update = (i: number, patch: Partial<EventualParcela>) => {
    set({ eventualParcelas: parcelas.map((p, idx) => idx === i ? { ...p, ...patch } : p) });
  };

  const add = () => {
    const last = parcelas[parcelas.length - 1];
    // Próxima data = última + 1 mês, ou hoje
    let nextDate = cfg.firstDate;
    if (last?.vencimento) {
      const d = new Date(last.vencimento + "T12:00:00");
      d.setMonth(d.getMonth() + 1);
      nextDate = d.toISOString().split("T")[0];
    }
    set({
      eventualParcelas: [...parcelas, {
        valor:            last?.valor ?? 0,
        vencimento:       nextDate,
        metodoPagamento:  (cfg.paymentMethod as EventualParcela["metodoPagamento"]) ?? "pix",
        descricao:        "",
      }],
    });
  };

  const remove = (i: number) => {
    set({ eventualParcelas: parcelas.filter((_, idx) => idx !== i) });
  };

  const distribuir = () => {
    if (parcelas.length === 0) return;
    const total = parcelas.reduce((s, p) => s + (p.valor || 0), 0);
    if (total === 0) return;
    const perParcela = Math.round((total / parcelas.length) * 100) / 100;
    set({
      eventualParcelas: parcelas.map((p) => ({ ...p, valor: perParcela })),
    });
  };

  const totalEventual = parcelas.reduce((s, p) => s + (p.valor || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 p-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Total: {fmtCurrency(totalEventual)}
          </p>
          <p className="text-xs text-muted-foreground">{parcelas.length} parcela(s)</p>
        </div>
        {parcelas.length > 1 && (
          <Button variant="outline" size="sm" className="text-xs gap-1.5 border-emerald-300 dark:border-emerald-700"
            onClick={distribuir}>
            Distribuir igualmente
          </Button>
        )}
      </div>

      {parcelas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma parcela cadastrada. Clique em "Adicionar parcela" para começar.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Nº</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor (R$)</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelas.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                  <TableCell>
                    <Input placeholder="Parcela, sinal, entrega…"
                      value={p.descricao ?? ""}
                      onChange={(e) => update(i, { descricao: e.target.value })}
                      className="h-8 text-xs" />
                  </TableCell>
                  <TableCell>
                    <Input type="date" value={p.vencimento}
                      onChange={(e) => update(i, { vencimento: e.target.value })}
                      className="h-8 text-xs" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} step={0.01}
                      value={p.valor || ""}
                      onChange={(e) => update(i, { valor: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs w-28" />
                  </TableCell>
                  <TableCell>
                    <Select value={p.metodoPagamento}
                      onValueChange={(v) => update(i, { metodoPagamento: v as EventualParcela["metodoPagamento"] })}>
                      <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => remove(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={add} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Adicionar parcela
      </Button>
    </div>
  );
}

// ─── Preview: tabela de parcelas ──────────────────────────────────────────────

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
              <TableHead>Método</TableHead>
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
                <TableCell className="text-xs text-muted-foreground">
                  {row.paymentMethod
                    ? PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-semibold text-sm">{fmtCurrency(row.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end">
        <p className="text-xs text-muted-foreground">
          Total listado: <strong>{fmtCurrency(total)}</strong>
          {cfg.mode !== "integral" && cfg.mode !== "meio_meio" && cfg.mode !== "eventual" && (
            <span className="text-muted-foreground/60 ml-1">
              (parcelas recorrentes não somadas na totalização)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Modo padrão para slices evolutivos ──────────────────────────────────────

function defaultSlices(planValue: number): ScheduleSlice[] {
  return [
    { label: "Meses 1–3",         value: planValue, installments: 3,    firstDate: undefined },
    { label: "A partir do mês 4", value: planValue, installments: null, firstDate: undefined },
  ];
}

// ─── ensureMode — retrocompatibilidade ───────────────────────────────────────

function ensureMode(cfg: ScheduleConfig, planValue: number): ScheduleConfig {
  // Retrocompatibilidade: 'carencia' → 'evolutivo'
  if (cfg.mode === "carencia") {
    return ensureMode({ ...cfg, mode: "evolutivo" }, planValue);
  }
  if (!cfg.mode) return { ...cfg, mode: "mensal" };
  if (cfg.mode === "evolutivo" && !cfg.slices?.length) {
    return { ...cfg, slices: defaultSlices(planValue) };
  }
  return cfg;
}

// ─── Componente principal ─────────────────────────────────────────────────────

// Modos exibidos na UI (sem 'carencia' que é legado)
const UI_MODES = Object.entries(MODE_LABELS) as [Exclude<ScheduleMode, "carencia">, string][];

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
    mode:         "mensal",
    firstValue:   0,
    firstDate:    new Date().toISOString().split("T")[0],
    dueDay:       10,
    recurrence:   "mensal",
    installments: 12,
    paymentMethod: "pix",
  };

  const cfg = ensureMode(raw, planValue);
  const set = (patch: Partial<ScheduleConfig>) => onChange({ ...cfg, ...patch });

  // Quando planValue muda, atualiza slices evolutivos que ainda têm o valor padrão antigo
  useEffect(() => {
    if (cfg.mode !== "evolutivo" || !cfg.slices?.length || planValue <= 0) return;
    // Atualiza apenas fatias que têm o mesmo valor (provavelmente o padrão)
    // Não altera fatias que o usuário customizou para um valor diferente
    const prevPlanValue = cfg.slices[0]?.value;
    if (prevPlanValue !== planValue) {
      // Deixa o usuário decidir — não forçamos atualização automática para não sobrescrever personalização
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planValue]);

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
      eventualParcelas:          undefined,
      dateOverrides:             undefined,
    };
    if (mode === "integral")           { base.integralValue = planValue || 0; }
    if (mode === "setup_mensal")       { base.setupValue = base.setupValue ?? 0; base.setupInstallments = base.setupInstallments ?? 1; base.hasSetup = false; }
    if (mode === "meio_meio")          { base.entryPercent = 50; base.secondPaymentTrigger = "conclusao"; }
    if (mode === "entrada_parcelado")  { base.entryValue = 0; base.remainderInstallmentValue = 0; base.remainderInstallments = 6; }
    if (mode === "evolutivo")          { base.slices = defaultSlices(planValue); }
    if (mode === "eventual") {
      const d = new Date().toISOString().split("T")[0];
      base.eventualParcelas = [
        { valor: planValue || 0, vencimento: d, metodoPagamento: base.paymentMethod as EventualParcela["metodoPagamento"] ?? "pix", descricao: "Pagamento" },
      ];
    }
    onChange(base);
  };

  const discount = totalIndividual > 0 && planValue > 0 && planValue < totalIndividual
    ? totalIndividual - planValue : 0;
  const discountPct = totalIndividual > 0 && discount > 0
    ? ((discount / totalIndividual) * 100).toFixed(0) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Cobrança e Cronograma Financeiro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── Total da proposta ── */}
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          {totalIndividual > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total dos serviços</span>
              <span className="font-semibold">{fmtCurrency(totalIndividual)}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Label className="text-sm whitespace-nowrap shrink-0 font-medium">Total da proposta (R$)</Label>
            {readOnly ? (
              <span className="font-semibold text-sm">{fmtCurrency(planValue)}</span>
            ) : (
              <Input type="number" min={0} step={0.01} className="w-40" placeholder="0,00"
                value={planValue || ""}
                onChange={(e) => onPlanValueChange?.(parseFloat(e.target.value) || 0)} />
            )}
          </div>
          {discount > 0 && discountPct && (
            <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
              <span>Desconto para o cliente</span>
              <span className="font-bold">{fmtCurrency(discount)} ({discountPct}%)</span>
            </div>
          )}
        </div>

        {/* ── Setup add-on ── */}
        {!readOnly && cfg.mode !== "setup_mensal" && cfg.mode !== "integral" && cfg.mode !== "meio_meio" && cfg.mode !== "eventual" && (
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
                      Adiciona uma cobrança de setup antes das mensalidades.
                      Parcela 1 do setup é avulsa; parcelas 2+ são somadas às mensalidades do mesmo mês.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <button
                type="button"
                onClick={() => set({ hasSetup: !cfg.hasSetup, setupValue: cfg.setupValue ?? 0, setupInstallments: cfg.setupInstallments ?? 1 })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${cfg.hasSetup ? "bg-amber-500" : "bg-input"}`}
                role="switch" aria-checked={cfg.hasSetup ?? false}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${cfg.hasSetup ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
            {cfg.hasSetup && (
              <div className="grid gap-4 pt-1 items-end" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor do setup (R$)</Label>
                  <Input type="number" min={0} step={0.01} placeholder="0,00"
                    value={cfg.setupValue ?? ""}
                    onChange={(e) => set({ setupValue: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <LabelTip label="Parcelas do setup" tip="Parcela 1 é avulsa. As demais são somadas às mensalidades dos meses seguintes." />
                  <Input type="number" min={1} max={12}
                    value={cfg.setupInstallments ?? 1}
                    onChange={(e) => set({ setupInstallments: Math.min(12, Math.max(1, parseInt(e.target.value) || 1)) })} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Seletor de modalidade ── */}
        {!readOnly && (
          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide">Modalidade de cobrança</Label>
            <Select value={cfg.mode === "carencia" ? "evolutivo" : cfg.mode}
              onValueChange={(v) => handleModeChange(v as ScheduleMode)}>
              <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UI_MODES.map(([m, label]) => (
                  <SelectItem key={m} value={m}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ── Campos específicos por modo ── */}
        {!readOnly && (
          <div>
            {cfg.mode === "integral"           && <ModeIntegral cfg={cfg} set={set} />}
            {cfg.mode === "mensal"             && <ModeMensal cfg={cfg} set={set} planValue={planValue} />}
            {cfg.mode === "setup_mensal"       && <ModeSetupMensal cfg={cfg} set={set} />}
            {cfg.mode === "meio_meio"          && <ModeMeioMeio cfg={cfg} set={set} planValue={planValue} />}
            {cfg.mode === "entrada_parcelado"  && <ModeEntradaParcelado cfg={cfg} set={set} />}
            {(cfg.mode === "evolutivo" || cfg.mode === "carencia") && (
              <ModeEvolutivo cfg={cfg} set={set} planValue={planValue} />
            )}
            {cfg.mode === "eventual" && <ModeEventual cfg={cfg} set={set} />}
          </div>
        )}

        {/* ── Início de vigência (exceto integral e eventual) ── */}
        {!readOnly && cfg.mode !== "integral" && cfg.mode !== "eventual" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                Início de vigência
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-blue-600 dark:text-blue-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Se o contrato é assinado hoje mas as obrigações e os pagamentos
                    mensais começam em uma data futura, defina aqui.
                    O setup (se houver) continua sendo cobrado na data de assinatura.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-3">
              <Input type="date"
                className="w-auto"
                value={cfg.vigenciaInicio ?? ""}
                min={cfg.firstDate}
                onChange={(e) => set({ vigenciaInicio: e.target.value || undefined })} />
              {cfg.vigenciaInicio && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7"
                  onClick={() => set({ vigenciaInicio: undefined })}>
                  Limpar
                </Button>
              )}
              {!cfg.vigenciaInicio && (
                <span className="text-xs text-muted-foreground">Opcional — deixe em branco para vigência imediata</span>
              )}
            </div>
            {cfg.vigenciaInicio && cfg.vigenciaInicio > cfg.firstDate && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                As mensalidades começam em {new Date(cfg.vigenciaInicio + "T12:00:00").toLocaleDateString("pt-BR")}.
              </p>
            )}
          </div>
        )}

        {/* ── Campos comuns: método + observações ── */}
        {!readOnly && cfg.mode !== "eventual" && (
          <div className="grid gap-4 pt-2 border-t" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
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
              <Label className="text-xs">Observação (visível ao cliente)</Label>
              <Textarea
                placeholder="Ex: Pagamentos via PIX para a chave CNPJ."
                value={cfg.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value })}
                className="resize-none text-sm h-9 min-h-0 py-2"
              />
            </div>
          </div>
        )}

        {/* ── Preview ── */}
        <div className="space-y-2 border-t pt-4">
          <button
            type="button"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setPreviewOpen((o) => !o)}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${previewOpen ? "" : "-rotate-90"}`} />
            Pré-visualização do cronograma
          </button>
          {previewOpen && <SchedulePreview cfg={cfg} planValue={planValue} />}
        </div>

      </CardContent>
    </Card>
  );
}
