// SendMessageNode — envia mensagem de texto (azul)
import { MessageSquare } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function SendMessageNode(props: NodeProps) {
  const data = props.data as NodeData;
  return (
    <NodeShell color="send" icon={<MessageSquare className="h-3 w-3" />} label="Enviar mensagem" selected={props.selected} nodeId={props.id}>
      <p className="leading-snug">{preview(data.text, 30)}</p>
    </NodeShell>
  );
}
