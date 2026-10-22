/**
 * AgentStatusToggle
 *
 * Dropdown para o atendente selecionar seu status de presença.
 * Chama onStatusChange ao selecionar uma opção.
 */

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgentStatus } from "@/hooks/useOmnichannelInbox";
import { cn } from "@/lib/utils";

// ─── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AgentStatus, { label: string; dotClass: string }> = {
  online:  { label: "Disponível", dotClass: "bg-emerald-500" },
  busy:    { label: "Ocupado",    dotClass: "bg-yellow-500" },
  away:    { label: "Ausente",    dotClass: "bg-orange-500" },
  offline: { label: "Offline",   dotClass: "bg-slate-500" },
};

const ALL_STATUSES: AgentStatus[] = ["online", "busy", "away", "offline"];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface AgentStatusToggleProps {
  status: AgentStatus;
  onStatusChange: (s: AgentStatus) => void;
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function AgentStatusToggle({ status, onStatusChange }: AgentStatusToggleProps) {
  const current = STATUS_CONFIG[status];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/50 transition-colors outline-none">
          <span className={cn("h-2 w-2 rounded-full shrink-0", current.dotClass)} />
          <span>{current.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {ALL_STATUSES.map((s) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <DropdownMenuItem
              key={s}
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => onStatusChange(s)}
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dotClass)} />
              <span className="text-xs">{cfg.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
