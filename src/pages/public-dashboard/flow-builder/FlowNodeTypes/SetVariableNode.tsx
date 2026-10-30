// SetVariableNode — define uma variável (cinza)
import { Variable } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function SetVariableNode(props: NodeProps) {
  const data = props.data as NodeData;
  return (
    <NodeShell color="set_var" icon={<Variable className="h-3 w-3" />} label="Definir variável" selected={props.selected} nodeId={props.id}>
      <p className="leading-snug">
        <span className="text-foreground/90">{preview(data.variable, 14) || "—"}</span>
        {" = "}
        <span className="text-foreground/90">{preview(data.value, 16)}</span>
      </p>
    </NodeShell>
  );
}
