// GoToFlowNode — redireciona para outro flow (roxo)
import { CornerDownRight } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function GoToFlowNode(props: NodeProps) {
  const data = props.data as NodeData;
  return (
    <NodeShell color="go_to" icon={<CornerDownRight className="h-3 w-3" />} label="Ir para flow" selected={props.selected}>
      <p className="leading-snug">{data.flow_id ? `→ ${preview(data.flow_id, 22)}` : "— flow não definido —"}</p>
    </NodeShell>
  );
}
