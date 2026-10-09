/**
 * ScreencastChecklist
 *
 * Checklist que valida se todos os requisitos foram atendidos antes
 * do screencast para App Review. Exibe READY FOR SCREENCAST somente
 * quando todos os itens estão marcados.
 */

import { useState } from "react";
import { CheckCircle2, Circle, Video, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCREENCAST_CHECKLIST_ITEMS, type ChecklistItem } from "./types";
import { cn } from "@/lib/utils";

interface ScreencastChecklistProps {
  permission: string;
  /** Itens já confirmados automaticamente (ex: api_called se já houve chamada real) */
  autoChecked?: string[];
  onStartScreencast?: () => void;
}

export function ScreencastChecklist({
  permission,
  autoChecked = [],
  onStartScreencast,
}: ScreencastChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>(
    SCREENCAST_CHECKLIST_ITEMS.map((item) => ({
      ...item,
      checked: autoChecked.includes(item.id),
    }))
  );

  const toggle = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  const allChecked = items.every((i) => i.checked);
  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold">Screencast Checklist</span>
          <code className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
            {permission}
          </code>
        </div>
        <span className="text-xs text-muted-foreground">
          {checkedCount}/{items.length}
        </span>
      </div>

      {/* Items */}
      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/20",
              autoChecked.includes(item.id) && "opacity-70"
            )}
          >
            {item.checked ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
            )}
            <span className={cn(
              "text-sm",
              item.checked ? "text-foreground" : "text-muted-foreground"
            )}>
              {item.label}
            </span>
            {autoChecked.includes(item.id) && (
              <span className="ml-auto text-[10px] text-emerald-500/70 font-medium">AUTO</span>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border bg-secondary/10">
        {allChecked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-sm font-semibold text-emerald-400">READY FOR SCREENCAST</span>
            </div>
            {onStartScreencast && (
              <Button
                onClick={onStartScreencast}
                className="w-full gap-2 bg-violet-600 hover:bg-violet-500"
                size="sm"
              >
                <Video className="h-3.5 w-3.5" />
                Start Screencast Mode
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-400">
              Complete todos os itens antes de iniciar o screencast
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
