// SendDocumentNode — envia documento/anexo (cinza)
import { FileText } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function SendDocumentNode(props: NodeProps) {
  const data = props.data as NodeData;
  return (
    <NodeShell color="document" icon={<FileText className="h-3 w-3" />} label="Enviar documento" selected={props.selected}>
      <p className="leading-snug">{preview(data.filename, 24) || "sem arquivo"}</p>
      {data.caption ? <p className="text-[10px] text-muted-foreground/70">{preview(data.caption, 26)}</p> : null}
    </NodeShell>
  );
}
