import { ArrowDown } from "lucide-react";

const STEP_COLORS = [
  { bg: "bg-slate-100",      text: "text-slate-700"   },
  { bg: "bg-blue-500/10",    text: "text-blue-700"    },
  { bg: "bg-indigo-500/10",  text: "text-indigo-700"  },
  { bg: "bg-violet-500/10",  text: "text-violet-700"  },
  { bg: "bg-emerald-500/10", text: "text-emerald-700" },
  { bg: "bg-teal-500/10",    text: "text-teal-700"    },
  { bg: "bg-orange-500/10",  text: "text-orange-700"  },
];

// Half-offset per step — applied equally to left and right so bars are centered
const HALF_OFFSETS = ["0%", "5%", "9%", "13%", "17%", "20%", "23%"];

export interface SalesFunnelStep {
  label: string;
  value: number;
  rateLabel?: string;
}

interface SalesFunnelProps {
  steps: SalesFunnelStep[];
  emptyMessage?: string;
}

export function SalesFunnel({ steps, emptyMessage = "Sem dados para exibir." }: SalesFunnelProps) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</p>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {steps.map((step, i) => {
        const c = STEP_COLORS[i] ?? STEP_COLORS[STEP_COLORS.length - 1];
        const halfOffset = HALF_OFFSETS[i] ?? "23%";
        const next = steps[i + 1];
        const convRate = next
          ? step.value > 0
            ? ((next.value / step.value) * 100).toFixed(1) + "%"
            : "0%"
          : null;

        return (
          <div key={i} className="flex flex-col w-full">
            {/* Bar */}
            <div
              className={`${c.bg} rounded-xl border border-slate-200/60 shadow-sm flex items-center justify-between px-5 py-4`}
              style={{ marginLeft: halfOffset, marginRight: halfOffset }}
            >
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 truncate mr-3">
                {step.label}
              </span>
              <span className={`text-2xl font-black shrink-0 ${c.text}`}>
                {step.value.toLocaleString("pt-BR")}
              </span>
            </div>

            {/* Connector */}
            {convRate !== null && (
              <div className="flex flex-col items-center py-1">
                <div className="h-3 w-px bg-slate-200" />
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-0.5 rounded-full border border-slate-200 text-[10px] font-bold text-primary shadow-sm">
                  <ArrowDown className="h-3 w-3" />
                  <span>{convRate}</span>
                  {step.rateLabel && (
                    <span className="text-slate-400 uppercase tracking-tighter font-medium">
                      {step.rateLabel}
                    </span>
                  )}
                </div>
                <div className="h-3 w-px bg-slate-200" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
