// ConditionNode — ramificação condicional (verde). Source handles yes / no.
import { GitBranch } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import type { NodeData } from "../flowTypes";
import { NodeShell, preview } from "./_shared";

export function ConditionNode(props: NodeProps) {
  const data = props.data as NodeData;
  const opLabel: Record<string, string> = {
    contains: "contém", eq: "=", ne: "≠", starts_with: "começa com", regex: "regex",
  };
  return (
    <NodeShell
      color="condition"
      icon={<GitBranch className="h-3 w-3" />}
      label="Condição"
      selected={props.selected}
      sourceHandles={[{ id: "yes", label: "Sim" }, { id: "no", label: "Não" }]}
    >
      <p className="leading-snug">
        <span className="text-foreground/90">{preview(data.variable, 14) || "—"}</span>{" "}
        <span className="text-muted-foreground/70">{opLabel[data.operator ?? "contains"] ?? data.operator}</span>{" "}
        <span className="text-foreground/90">{preview(data.value, 14)}</span>
      </p>
    </NodeShell>
  );
}
