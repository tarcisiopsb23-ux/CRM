// ── flowTypes.ts — tipos locais do Flow Builder ──────────────────────────────
// Espelho de supabase/functions/bot-router/types.ts (fora de src/).
// Mantém semântica idêntica sem acoplamento por caminho relativo profundo.

export type MatchType = "exact" | "contains" | "starts_with" | "regex";

export type NodeType =
  | "trigger_keyword"
  | "send_message"
  | "send_buttons"
  | "question"
  | "condition"
  | "send_document"
  | "set_variable"
  | "go_to_flow";

export type FlowStatus = "draft" | "active" | "archived";

export type ChannelType =
  | "whatsapp"
  | "instagram_dm"
  | "instagram_comment"
  | "facebook_dm"
  | "facebook_comment";

export interface NodeData {
  // trigger_keyword
  keywords?: string[];
  match_type?: MatchType;
  scope?: "general" | "channel";

  // send_message / question
  text?: string;

  // question
  save_response_to?: string;
  timeout_hours?: number;

  // send_buttons
  buttons?: Array<{ id: string; title: string }>;
  wait_for_reply?: boolean;

  // condition
  variable?: string;
  operator?: string;
  value?: string;

  // send_document
  url?: string;
  filename?: string;
  caption?: string;

  // set_variable
  // variable (already declared above)

  // go_to_flow
  flow_id?: string;

  // allow arbitrary extra keys from builder
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ── Linha de chatbot_flows (mirror da tabela do Banco A) ──────────────────────

export interface ChatbotFlow {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  description: string | null;
  scope: "general" | "channel";
  channel_type: ChannelType | null;
  definition: FlowDefinition;
  version: number;
  status: FlowStatus;
  default_timeout_hours: number;
  created_at: string;
  updated_at: string;
}

// ── Metadados de UI por tipo de nó ────────────────────────────────────────────

export const NODE_TYPES: NodeType[] = [
  "trigger_keyword",
  "send_message",
  "send_buttons",
  "question",
  "condition",
  "send_document",
  "set_variable",
  "go_to_flow",
];

export const NODE_LABELS: Record<NodeType, string> = {
  trigger_keyword: "Gatilho (palavra-chave)",
  send_message: "Enviar mensagem",
  send_buttons: "Enviar botões",
  question: "Pergunta",
  condition: "Condição",
  send_document: "Enviar documento",
  set_variable: "Definir variável",
  go_to_flow: "Ir para flow",
};

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram_dm: "Instagram DM",
  instagram_comment: "Comentário IG",
  facebook_dm: "Facebook DM",
  facebook_comment: "Comentário FB",
};

export const CHANNEL_OPTIONS: ChannelType[] = [
  "whatsapp",
  "instagram_dm",
  "instagram_comment",
  "facebook_dm",
  "facebook_comment",
];

// Dados padrão por tipo de nó (ao soltar um novo nó no canvas)
export function defaultNodeData(type: NodeType): NodeData {
  switch (type) {
    case "trigger_keyword":
      return { keywords: [], match_type: "contains", scope: "general" };
    case "send_message":
      return { text: "" };
    case "send_buttons":
      return {
        text: "",
        buttons: [
          { id: "btn_0", title: "" },
          { id: "btn_1", title: "" },
        ],
        wait_for_reply: true,
      };
    case "question":
      return { text: "", save_response_to: "", timeout_hours: 24 };
    case "condition":
      return { variable: "", operator: "contains", value: "" };
    case "send_document":
      return { url: "", filename: "", caption: "" };
    case "set_variable":
      return { variable: "", value: "" };
    case "go_to_flow":
      return { flow_id: "" };
  }
}
