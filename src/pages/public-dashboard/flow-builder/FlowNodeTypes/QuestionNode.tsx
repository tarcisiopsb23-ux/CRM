// QuestionNode — pergunta que captura a resposta (laranja). Source padrão + timeout.
import { HelpCircle } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function QuestionNode(props: NodeProps) {
  const data = props.data as NodeData;
  return (
    <NodeShell
      color="question"
      icon={<HelpCircle className="h-3 w-3" />}
      label="Pergunta"
      selected={props.selected}
      sourceHandles={[{ id: "default", label: "Resposta" }, { id: "timeout", label: "Timeout" }]}
    >
      <p className="leading-snug">{preview(data.text, 26)}</p>
      {data.save_response_to ? (
        <p className="text-[10px] text-muted-foreground/70">Salva em: {data.save_response_to}</p>
      ) : (
        <p className="text-[10px] text-muted-foreground/50 italic">resposta não salva</p>
      )}
    </NodeShell>
  );
}
