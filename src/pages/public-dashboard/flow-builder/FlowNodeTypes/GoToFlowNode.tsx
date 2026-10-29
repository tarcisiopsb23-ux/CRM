// GoToFlowNode — redireciona para outro flow (roxo)
import { CornerDownRight } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function GoToFlowNode(props: NodeProps) {
  const data = props.data as NodeData;
  // Usa flow_name se disponível (salvo ao selecionar no painel de propriedades)
  const label = (data.flow_name as string | undefined)
    ?? (data.flow_id ? `ID: ${preview(data.flow_id as string, 12)}` : null);
  return (
    <NodeShell color="go_to" icon={<CornerDownRight className="h-3 w-3" />} label="Ir para flow" selected={props.selected}>
      <p className="leading-snug">{label ? `→ ${label}` : "— flow não definido —"}</p>
    </NodeShell>
  );
}
