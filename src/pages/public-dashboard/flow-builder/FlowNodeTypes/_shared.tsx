// ── _shared.tsx — shell comum aos custom nodes do Flow Builder ───────────────
// Centraliza o visual (borda colorida por tipo, handles de entrada/saída,
// label do tipo e área de preview) para evitar duplicação entre os 8 nodes.

import type { ReactNode } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Trash2 } from "lucide-react";

export type NodeColorKey =
  | "trigger"
  | "send"
  | "question"
  | "condition"
  | "document"
  | "set_var"
  | "go_to";

export const NODE_COLORS: Record<
  NodeColorKey,
  { border: string; badge: string; icon: string; ring: string }
> = {
  trigger:   { border: "border-purple-500/60", badge: "bg-purple-500/15 text-purple-400", icon: "text-purple-400", ring: "ring-purple-500/60" },
  send:      { border: "border-blue-500/60",   badge: "bg-blue-500/15 text-blue-400",   icon: "text-blue-400",   ring: "ring-blue-500/60" },
  question:  { border: "border-amber-500/60",  badge: "bg-amber-500/15 text-amber-400",  icon: "text-amber-400",  ring: "ring-amber-500/60" },
  condition: { border: "border-emerald-500/60",badge: "bg-emerald-500/15 text-emerald-400",icon: "text-emerald-400",ring: "ring-emerald-500/60" },
  document:  { border: "border-slate-500/60",  badge: "bg-slate-500/15 text-slate-400",  icon: "text-slate-400",  ring: "ring-slate-500/60" },
  set_var:   { border: "border-slate-500/60",  badge: "bg-slate-500/15 text-slate-400",  icon: "text-slate-400",  ring: "ring-slate-500/60" },
  go_to:     { border: "border-purple-500/60", badge: "bg-purple-500/15 text-purple-400", icon: "text-purple-400", ring: "ring-purple-500/60" },
};

export interface SourceHandleDef {
  id?: string;
  label?: string;
}

interface NodeShellProps {
  color: NodeColorKey;
  icon: ReactNode;
  label: string;
  selected?: boolean;
  nodeId?: string;
  /** Handles de saída. Se vazio, renderiza um único source handle padrão (sem id). */
  sourceHandles?: SourceHandleDef[];
  children: ReactNode;
}

export function NodeShell({
  color,
  icon,
  label,
  selected,
  nodeId,
  sourceHandles,
  children,
}: NodeShellProps) {
  const c = NODE_COLORS[color];
  const handles = sourceHandles && sourceHandles.length > 0 ? sourceHandles : [undefined];
  const { deleteElements } = useReactFlow();

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (nodeId) deleteElements({ nodes: [{ id: nodeId }] });
  }

  return (
    <div
      className={`relative min-w-[200px] max-w-[260px] rounded-lg border bg-card px-3 py-2.5 text-xs shadow-sm transition-shadow ${
        c.border
      } ${selected ? `ring-2 ${c.ring}` : ""}`}
    >
      {/* Handle de entrada (topo) */}
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !bg-muted-foreground/60" />

      {/* Botão de deletar — aparece apenas quando selecionado */}
      {selected && nodeId && (
        <button
          onClick={handleDelete}
          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/80 transition-colors"
          title="Deletar nó (ou tecle Delete)"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}

      {/* Cabeçalho */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`flex h-5 w-5 items-center justify-center rounded ${c.badge}`}>{icon}</span>
        <span className="font-semibold text-foreground">{label}</span>
      </div>

      {/* Preview / conteúdo */}
      <div className="space-y-1 text-muted-foreground">{children}</div>

      {/* Handles de saída (base) */}
      {handles.map((h, i) => {
        const leftPct = ((i + 1) * 100) / (handles.length + 1);
        return (
          <Handle
            key={h?.id ?? `default-source-${i}`}
            type="source"
            position={Position.Bottom}
            id={h?.id}
            style={{ left: `${leftPct}%` }}
            className="!h-2.5 !w-2.5 !bg-muted-foreground/60"
          />
        );
      })}

      {/* Rótulos dos handles de saída */}
      {sourceHandles && sourceHandles.length > 1 && (
        <div className="mt-1 flex justify-between px-1">
          {sourceHandles.map((h) => (
            <span key={h.id ?? h.label} className="text-[9px] text-muted-foreground/70">
              {h.label ?? h.id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Trunca texto para preview de nós.
 * - undefined/null → "—" (campo não preenchido)
 * - "" → "" (campo intencionalmente vazio — não mostrar "—")
 */
export function preview(text: string | undefined | null, max = 30): string {
  if (text == null) return "—";
  if (text === "") return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}
