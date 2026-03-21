import React from 'react';
import { cn } from "@/lib/utils";
import { ArrowDown } from "lucide-react";

interface FunnelStepProps {
  label: string;
  value: string | number;
  color?: string;
  width?: string;
  textVariant?: "default" | "white";
}

export function FunnelStep({ label, value, color, width, textVariant = "default" }: FunnelStepProps) {
  return (
    <div className={cn(
      "p-4 rounded-xl flex items-center justify-between border border-slate-200/50 dark:border-slate-700/50 shadow-sm transition-all duration-500 hover:scale-[1.01]", 
      color || "bg-slate-50 dark:bg-slate-800/50", 
      width || "w-full"
    )}>
      <span
        className={cn(
          "text-[10px] font-black uppercase tracking-widest",
          textVariant === "white" ? "text-white/90" : "text-slate-500 dark:text-slate-400"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-lg font-black",
          textVariant === "white" ? "text-white" : "text-slate-900 dark:text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface FunnelArrowProps {
  percentage?: string | number;
  label?: string;
}

export function FunnelArrow({ percentage, label }: FunnelArrowProps) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
      <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-primary">
        <ArrowDown className="h-3 w-3" />
        <span>{percentage}</span>
        {label && <span className="text-slate-400 dark:text-slate-500 uppercase tracking-tighter font-medium">{label}</span>}
      </div>
      <div className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
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
  }[];
  className?: string;
  textVariant?: "default" | "white";
}

export function ModernFunnel({ steps, className, textVariant = "default" }: ModernFunnelProps) {
  return (
    <div className={cn("flex flex-col items-center w-full", className)}>
      {steps.map((step, index) => (
        <React.Fragment key={index}>
          <FunnelStep 
            label={step.label} 
            value={step.value} 
            color={step.color} 
            width={step.width} 
            textVariant={textVariant}
          />
          {index < steps.length - 1 && (
            <FunnelArrow 
              percentage={step.percentage} 
              label={step.rateLabel} 
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
