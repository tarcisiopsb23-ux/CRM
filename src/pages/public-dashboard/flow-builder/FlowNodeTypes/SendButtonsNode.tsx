// SendButtonsNode — envia mensagem com botões (azul). Um source handle por botão.
import { MousePointerClick } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function SendButtonsNode(props: NodeProps) {
  const data = props.data as NodeData;
  const buttons = (data.buttons ?? []).slice(0, 3);
  const handles = buttons.map((b, i) => ({
    id: `btn_${i}`,
    label: preview(b.title, 12) || `Botão ${i + 1}`,
  }));

  return (
    <NodeShell
      color="send"
      icon={<MousePointerClick className="h-3 w-3" />}
      label="Enviar botões"
      selected={props.selected} nodeId={props.id}
      sourceHandles={handles}
    >
      <p className="leading-snug">{preview(data.text, 26)}</p>
      <div className="flex flex-wrap gap-1">
        {buttons.length > 0 ? (
          buttons.map((b, i) => (
            <span key={b.id ?? i} className="rounded border border-border/60 bg-secondary/40 px-1.5 py-0.5 text-[10px]">
              {preview(b.title, 12) || `Botão ${i + 1}`}
            </span>
          ))
        ) : (
          <span className="italic text-muted-foreground/60">sem botões</span>
        )}
      </div>
    </NodeShell>
  );
}
