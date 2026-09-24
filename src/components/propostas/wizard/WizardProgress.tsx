// src/components/propostas/wizard/WizardProgress.tsx
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardStepIndex } from "./wizardTypes";

interface Props {
  currentStep: WizardStepIndex;
  visitedSteps: number[];
  onStepClick: (index: WizardStepIndex) => void;
}

export function WizardProgress({ currentStep, visitedSteps, onStepClick }: Props) {
  return (
    <div className="w-full">
      {/* Desktop: steps horizontais com linha conectora */}
      <div className="hidden sm:flex items-center w-full">
        {WIZARD_STEPS.map((step, i) => {
          const isCompleted = visitedSteps.includes(step.index) && step.index < currentStep;
          const isCurrent   = step.index === currentStep;
          const isClickable = visitedSteps.includes(step.index) || step.index < currentStep;
          const isLast      = i === WIZARD_STEPS.length - 1;

          return (
            <div key={step.index} className="flex items-center flex-1 last:flex-none">
              {/* Círculo */}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(step.index as WizardStepIndex)}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-semibold shrink-0 transition-all",
                  isCompleted
                    ? "bg-primary border-primary text-primary-foreground cursor-pointer hover:opacity-80"
                    : isCurrent
                    ? "bg-background border-primary text-primary cursor-default"
                    : isClickable
                    ? "bg-background border-muted-foreground/40 text-muted-foreground cursor-pointer hover:border-primary hover:text-primary"
                    : "bg-background border-muted-foreground/20 text-muted-foreground/40 cursor-not-allowed"
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : <span>{step.index + 1}</span>}
              </button>

              {/* Label abaixo do círculo */}
              <span
                className={cn(
                  "ml-2 text-xs font-medium whitespace-nowrap",
                  isCurrent
                    ? "text-foreground"
                    : isCompleted
                    ? "text-primary"
                    : "text-muted-foreground/60"
                )}
              >
                {step.label}
              </span>

              {/* Linha conectora */}
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-px mx-3 transition-colors",
                    isCompleted ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: barra de progresso simples + label */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Etapa {currentStep + 1} de {WIZARD_STEPS.length}:{" "}
            <span className="text-primary">{WIZARD_STEPS[currentStep].label}</span>
          </span>
          <span>{Math.round(((currentStep + 1) / WIZARD_STEPS.length) * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
        {/* Steps clicáveis como pills */}
        <div className="flex gap-1.5 flex-wrap">
          {WIZARD_STEPS.map((step) => {
            const isClickable = visitedSteps.includes(step.index) || step.index < currentStep;
            return (
              <button
                key={step.index}
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(step.index as WizardStepIndex)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all",
                  step.index === currentStep
                    ? "bg-primary text-primary-foreground border-primary"
                    : step.index < currentStep
                    ? "bg-primary/10 text-primary border-primary/30 cursor-pointer"
                    : "bg-background text-muted-foreground/50 border-border cursor-not-allowed"
                )}
              >
                {step.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
