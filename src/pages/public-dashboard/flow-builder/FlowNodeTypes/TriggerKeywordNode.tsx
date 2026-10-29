// TriggerKeywordNode — gatilho por palavra-chave (roxo)
import { Zap } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function TriggerKeywordNode(props: NodeProps) {
  const data = props.data as NodeData;
  const keywords = data.keywords ?? [];
  const matchLabel: Record<string, string> = {
    exact: "exata", contains: "contém", starts_with: "começa com", regex: "regex",
  };

  return (
    <NodeShell color="trigger" icon={<Zap className="h-3 w-3" />} label="Gatilho" selected={props.selected}>
      <div className="flex flex-wrap gap-1">
        {keywords.length > 0 ? (
          keywords.slice(0, 4).map((kw) => (
            <span key={kw} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{preview(kw, 14)}</span>
          ))
        ) : (
          <span className="italic text-muted-foreground/60">sem palavras-chave</span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Correspondência: {matchLabel[data.match_type ?? "contains"]}
      </p>
    </NodeShell>
  );
}
