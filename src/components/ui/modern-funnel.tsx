import React from 'react';
import { cn } from "@/lib/utils";

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

export function FunnelStep({ label, value, color, width, textVariant = "default", horizontal, percentage, rateLabel, isLast = false }: FunnelStepProps) {
  return (
    <div className={cn(
      "relative p-4 rounded-xl flex items-center justify-between border border-slate-200/50 dark:border-slate-700/50 shadow-sm transition-all duration-500 hover:scale-[1.01] min-w-0 h-auto min-h-[160px] items-stretch z-10", 
      color || "bg-slate-50 dark:bg-slate-800/50", 
      horizontal ? "flex-1 flex-col text-center gap-3" : width || "w-full"
    )}>
      <div className="flex flex-col justify-center flex-1 w-full gap-2">
        <span
          className={cn(
            "text-[10px] font-black uppercase tracking-widest break-words",
            textVariant === "white" ? "text-white/90" : "text-slate-500 dark:text-slate-400"
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "text-lg font-black mt-1",
            textVariant === "white" ? "text-white" : "text-slate-900 dark:text-white"
          )}
        >
          {value}
        </span>
        {percentage && (
          <span className="text-[11px] font-bold text-primary mt-1">
            {rateLabel && `${rateLabel}: `}{percentage}
          </span>
        )}
      </div>
      {!isLast && horizontal && (
        <div className={cn("absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rotate-45 border-r border-b border-slate-200/50 dark:border-slate-700/50 z-0", color || "bg-slate-50 dark:bg-slate-800/50")} />
      )}
    </div>
  );
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
  return (
    <div className={cn(horizontal ? "flex items-center w-full gap-8 overflow-x-auto pb-6" : "flex flex-col items-center w-full", className)}>
      {steps.map((step, index) => (
        <FunnelStep 
          key={index}
          label={step.label} 
          value={step.value} 
          color={step.color} 
          width={step.width} 
          textVariant={textVariant}
          horizontal={horizontal}
          percentage={step.percentage}
          rateLabel={step.rateLabel}
          isLast={step.isLast}
        />
      ))}
    </div>
  );
}
