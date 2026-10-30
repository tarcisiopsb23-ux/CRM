// DeleteableEdge — aresta com botão de lixeira no meio
// Botão aparece ao passar o mouse ou quando a aresta está selecionada.

import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";

export function DeleteableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  style,
  label,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showDelete = selected || hovered;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    deleteElements({ edges: [{ id }] });
  }

  return (
    <>
      {/* Área invisível mais larga sobre a aresta para capturar hover */}
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer" }}
      />

      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected
            ? "hsl(var(--primary))"
            : hovered
            ? "hsl(var(--foreground) / 0.4)"
            : "hsl(var(--muted-foreground) / 0.4)",
          strokeWidth: selected || hovered ? 2 : 1.5,
          transition: "stroke 0.15s, stroke-width 0.15s",
        }}
      />

      <EdgeLabelRenderer>
        {/* Rótulo da aresta (ex: "Sim", "Não", "btn_0") */}
        {label && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 10}px)`,
              pointerEvents: "none",
            }}
            className="rounded-full bg-card border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground nodrag nopan"
          >
            {label as string}
          </div>
        )}

        {/* Botão lixeira — visível no hover ou quando selecionada */}
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + (label ? 10 : 0)}px)`,
            pointerEvents: "all",
            opacity: showDelete ? 1 : 0,
            transition: "opacity 0.15s",
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <button
            onClick={handleDelete}
            className="flex h-5 w-5 items-center justify-center rounded-full border bg-card shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground hover:border-destructive border-border text-muted-foreground"
            title="Excluir conexão"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
