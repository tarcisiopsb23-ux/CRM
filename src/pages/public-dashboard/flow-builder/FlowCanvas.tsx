// ── FlowCanvas.tsx — canvas React Flow + paleta de nós (arrastar) ─────────────
// Requer <ReactFlowProvider> no ancestral (usa useReactFlow para screenToFlowPosition).

import type { Dispatch, SetStateAction } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, useReactFlow,
  type Node, type Edge, type OnNodesChange, type OnEdgesChange, type OnConnect, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Zap, MessageSquare, MousePointerClick, HelpCircle, GitBranch,
  FileText, Variable, CornerDownRight,
} from "lucide-react";

import type { NodeData, NodeType } from "./flowTypes";
import { defaultNodeData, NODE_LABELS } from "./flowTypes";
import { TriggerKeywordNode } from "./FlowNodeTypes/TriggerKeywordNode";
import { SendMessageNode } from "./FlowNodeTypes/SendMessageNode";
import { SendButtonsNode } from "./FlowNodeTypes/SendButtonsNode";
import { QuestionNode } from "./FlowNodeTypes/QuestionNode";
import { ConditionNode } from "./FlowNodeTypes/ConditionNode";
import { SendDocumentNode } from "./FlowNodeTypes/SendDocumentNode";
import { SetVariableNode } from "./FlowNodeTypes/SetVariableNode";
import { GoToFlowNode } from "./FlowNodeTypes/GoToFlowNode";

// nodeTypes definido no nível do módulo (referência estável p/ evitar re-renders).
const nodeTypes: NodeTypes = {
  trigger_keyword: TriggerKeywordNode,
  send_message: SendMessageNode,
  send_buttons: SendButtonsNode,
  question: QuestionNode,
  condition: ConditionNode,
  send_document: SendDocumentNode,
  set_variable: SetVariableNode,
  go_to_flow: GoToFlowNode,
};

// Paleta de nós: tipo + ícone para arrastar para o canvas.
const PALETTE: { type: NodeType; label: string; icon: React.ReactNode }[] = [
  { type: "trigger_keyword", label: NODE_LABELS.trigger_keyword, icon: <Zap className="h-4 w-4 text-purple-400" /> },
  { type: "send_message",    label: NODE_LABELS.send_message,    icon: <MessageSquare className="h-4 w-4 text-blue-400" /> },
  { type: "send_buttons",    label: NODE_LABELS.send_buttons,    icon: <MousePointerClick className="h-4 w-4 text-blue-400" /> },
  { type: "question",        label: NODE_LABELS.question,         icon: <HelpCircle className="h-4 w-4 text-amber-400" /> },
  { type: "condition",       label: NODE_LABELS.condition,        icon: <GitBranch className="h-4 w-4 text-emerald-400" /> },
  { type: "send_document",   label: NODE_LABELS.send_document,   icon: <FileText className="h-4 w-4 text-slate-400" /> },
  { type: "set_variable",    label: NODE_LABELS.set_variable,     icon: <Variable className="h-4 w-4 text-slate-400" /> },
  { type: "go_to_flow",      label: NODE_LABELS.go_to_flow,       icon: <CornerDownRight className="h-4 w-4 text-purple-400" /> },
];

interface FlowCanvasProps {
  nodes: Node<NodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: Dispatch<SetStateAction<Node<NodeData>[]>>;
  onNodeSelect: (nodeId: string | null) => void;
  /** Notifica o pai que houve uma mutação estrutural (ex.: nó solto no canvas). */
  onInteract?: () => void;
}

export function FlowCanvas({
  nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, onNodeSelect, onInteract,
}: FlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  function onDragStart(e: React.DragEvent, type: NodeType) {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/reactflow") as NodeType;
    if (!type) return;

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode: Node<NodeData> = {
      id: `node_${crypto.randomUUID()}`,
      type,
      position,
      data: defaultNodeData(type),
    };
    setNodes((nds) => nds.concat(newNode));
    onInteract?.();
    onNodeSelect(newNode.id);
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Paleta lateral esquerda */}
      <div className="w-44 shrink-0 border-r border-border bg-card p-2">
        <p className="px-1.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Nós
        </p>
        <div className="space-y-1.5">
          {PALETTE.map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              className="flex cursor-grab items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-2 text-xs transition-colors hover:border-primary/40 hover:bg-secondary/40 active:cursor-grabbing"
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 px-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
          Arraste um nó para o canvas.
        </p>
      </div>

      {/* Canvas React Flow */}
      <div className="relative flex-1 min-h-0" onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e, node) => onNodeSelect(node.id)}
          onPaneClick={() => onNodeSelect(null)}
          fitView
          className="h-full w-full bg-background"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} className="!bg-muted/30" />
          <Controls className="!border-border !bg-card" />
          <MiniMap
            pannable
            zoomable
            className="!bg-card !border-border"
            maskColor="rgba(0,0,0,0.4)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
