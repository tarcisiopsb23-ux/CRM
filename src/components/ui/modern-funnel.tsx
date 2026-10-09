import React from 'react';
import { cn } from "@/lib/utils";
import { ArrowDown } from "lucide-react";

interface FunnelStepProps {
  label: string;
  value: string | number;
  color?: string;
  width?: string;
  textVariant?: "default" | "white";
  horizontal?: boolean;
  percentage?: string | number;
  rateLabel?: string;
  isLast?: boolean;
}

// ── Step horizontal (para o PipelineFunnel de leads) ────────────────────────
function FunnelStepHorizontal({ label, value, color, percentage, rateLabel, isLast = false }: FunnelStepProps) {
  return (
    <div className={cn(
      "relative p-4 rounded-xl flex-1 flex flex-col text-center gap-3 border border-slate-200/50 dark:border-slate-700/50 shadow-sm transition-all duration-500 hover:scale-[1.01] min-h-[160px] z-10",
      color || "bg-slate-50 dark:bg-slate-800/50"
    )}>
      <div className="flex flex-col justify-center flex-1 w-full gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 break-words">
          {label}
        </span>
        <span className="text-lg font-black mt-1 text-slate-900 dark:text-white">
          {value}
        </span>
        {percentage && (
          <span className="text-[11px] font-bold text-primary mt-1">
            {rateLabel && `${rateLabel}: `}{percentage}
          </span>
        )}
      </div>
      {!isLast && (
        <div className={cn(
          "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rotate-45 border-r border-b border-slate-200/50 dark:border-slate-700/50 z-0",
          color || "bg-slate-50 dark:bg-slate-800/50"
        )} />
      )}
    </div>
  );
}

// ── Step vertical (para o funil de conversão do dashboard do cliente) ────────
// Aparência: card com largura progressiva, label à esquerda, valor à direita,
// conector com badge de % de conversão entre etapas
function FunnelStepVertical({ label, value, color, width, textVariant = "default", percentage, rateLabel, isLast = false }: FunnelStepProps) {
  return (
    <>
      <div className={cn(
        "px-6 py-5 rounded-2xl shadow-sm transition-all duration-300",
        color || "bg-slate-100 dark:bg-slate-800",
        width || "w-full"
      )}>
        <div className="flex items-center justify-between gap-4">
          <span className={cn(
            "text-[11px] font-black uppercase tracking-widest",
            textVariant === "white" ? "text-white/80" : "text-slate-500 dark:text-slate-400"
          )}>
            {label}
          </span>
          <span className={cn(
            "text-2xl font-black",
            textVariant === "white" ? "text-white" : "text-slate-900 dark:text-white"
          )}>
            {value}
          </span>
        </div>
      </div>

      {/* Conector com badge de conversão entre etapas */}
      {!isLast && (
        <div className="flex flex-col items-center gap-0 my-1">
          <div className="w-px h-3 bg-slate-300 dark:bg-slate-600" />
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <ArrowDown className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-black text-primary">{percentage ?? "0%"}</span>
            {rateLabel && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{rateLabel}</span>
            )}
          </div>
          <div className="w-px h-3 bg-slate-300 dark:bg-slate-600" />
        </div>
      )}
    </>
  );
}

export function FunnelStep(props: FunnelStepProps) {
  if (props.horizontal) return <FunnelStepHorizontal {...props} />;
  return <FunnelStepVertical {...props} />;
}

interface ModernFunnelProps {
  steps: {
    label: string;
    value: string | number;
    color?: string;
    width?: string;
    percentage?: string | number;
    rateLabel?: string;
    isLast?: boolean;
  }[];
  className?: string;
  textVariant?: "default" | "white";
  horizontal?: boolean;
}

export function ModernFunnel({ steps, className, textVariant = "default", horizontal }: ModernFunnelProps) {
  if (horizontal) {
    return (
      <div className={cn("flex items-center w-full gap-8 overflow-x-auto pb-6", className)}>
        {steps.map((step, index) => (
          <FunnelStep
            key={index}
            horizontal
            label={step.label}
            value={step.value}
            color={step.color}
            width={step.width}
            textVariant={textVariant}
            percentage={step.percentage}
            rateLabel={step.rateLabel}
            isLast={step.isLast}
          />
        ))}
      </div>
    );
  }

  // Modo vertical — largura progressivamente menor conforme desce no funil
  // Respeita `width` de cada step se definido, senão usa largura automática
  const defaultWidths = ["w-full", "w-[90%]", "w-[80%]", "w-[70%]", "w-[60%]"];

  return (
    <div className={cn("flex flex-col items-center w-full gap-0", className)}>
      {steps.map((step, index) => (
        <FunnelStep
          key={index}
          horizontal={false}
          label={step.label}
          value={step.value}
          color={step.color}
          width={step.width ?? defaultWidths[Math.min(index, defaultWidths.length - 1)]}
          textVariant={textVariant}
          percentage={step.percentage}
          rateLabel={step.rateLabel}
          isLast={step.isLast ?? index === steps.length - 1}
        />
      ))}
    </div>
  );
}
