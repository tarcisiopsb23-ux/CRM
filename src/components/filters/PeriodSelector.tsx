import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PeriodOption,
  PERIOD_LABELS,
  getPeriodDateRange,
} from "@/lib/periodHelpers";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subYears,
} from "date-fns";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface PeriodSelectorOption {
  value: string;
  label: string;
}

export function getDateRangeFromPreset(preset: string, now: Date = new Date()): DateRange {
  if (Object.prototype.hasOwnProperty.call(PERIOD_LABELS, preset)) {
    return getPeriodDateRange(preset as PeriodOption, now);
  }

  const today = startOfDay(now);
  if (preset === "today") {
    return { from: today, to: endOfDay(now) };
  }
  if (preset === "week") {
    return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
  }
  if (preset === "month") {
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }
  if (preset === "last_month") {
    const prev = subMonths(now, 1);
    return { from: startOfMonth(prev), to: endOfMonth(prev) };
  }
  if (preset === "last_3_months") {
    return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
  }
  if (preset === "7d") {
    return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
  }
  if (preset === "30d") {
    return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
  }
  if (preset === "90d") {
    return { from: startOfDay(subDays(now, 90)), to: endOfDay(now) };
  }
  if (preset === "180d") {
    return { from: startOfDay(subDays(now, 180)), to: endOfDay(now) };
  }
  if (preset === "1y") {
    return { from: startOfDay(subYears(now, 1)), to: endOfDay(now) };
  }
  if (preset === "all") {
    return { from: new Date(0), to: new Date("9999-12-31T23:59:59.999Z") };
  }

  return getPeriodDateRange("mes_atual", now);
}

type PresetOrCustom = string;

interface Props {
  initialPreset?: string;
  onChange: (range: DateRange, preset: string) => void;
  options?: PeriodSelectorOption[];
  customLabel?: string;
  placeholder?: string;
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function PeriodSelector({
  initialPreset = "mes_atual",
  onChange,
  options,
  customLabel = "Intervalo personalizado",
  placeholder = "Período",
}: Props) {
  const [preset, setPreset] = useState<string>(initialPreset);
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  useEffect(() => {
    if (preset !== "custom") {
      const range = getDateRangeFromPreset(preset);
      onChange(range, preset);
      setCustomFrom(toIsoDate(range.from));
      setCustomTo(toIsoDate(range.to));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const applyCustom = () => {
    const from = customFrom ? new Date(customFrom + "T00:00:00") : startOfDay(new Date());
    const to = customTo ? new Date(customTo + "T23:59:59.999") : endOfDay(new Date());
    onChange({ from, to }, "custom");
  };

  const presetOptions = useMemo<PeriodSelectorOption[]>(() => {
    const base = options ?? Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }));
    const hasCustom = base.some((option) => option.value === "custom");
    return hasCustom ? base : [...base, { value: "custom", label: customLabel }];
  }, [options, customLabel]);

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <Select value={preset} onValueChange={(v) => setPreset(v)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {presetOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span className="text-sm">→</span>
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          <Button size="sm" onClick={applyCustom}>Aplicar</Button>
        </div>
      )}
    </div>
  );
}
