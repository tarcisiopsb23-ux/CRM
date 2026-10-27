// ── types.ts — Chatbot Flow Builder: definições de tipos ─────────────────────

export type MatchType = 'exact' | 'contains' | 'starts_with' | 'regex';

export type NodeType =
  | 'trigger_keyword'
  | 'send_message'
  | 'send_buttons'
  | 'question'
  | 'condition'
  | 'send_document'
  | 'set_variable'
  | 'go_to_flow';

export type ActionType =
  | 'send_text'
  | 'send_buttons'
  | 'send_document'
  | 'send_list';

export type FlowStatus = 'draft' | 'active' | 'archived';

export type StateStatus = 'running' | 'waiting' | 'completed' | 'expired' | 'error';

export type BotMode = 'n8n' | 'flow';

export type ChannelType =
  | 'whatsapp'
  | 'instagram_dm'
  | 'instagram_comment'
  | 'facebook_dm'
  | 'facebook_comment';

// ── Node data shapes ──────────────────────────────────────────────────────────

export interface NodeData {
  // trigger_keyword
  keywords?:        string[];
  match_type?:      MatchType;
  scope?:           'general' | 'channel';

  // send_message / question
  text?:            string;

  // question
  save_response_to?: string;
  timeout_hours?:   number;

  // send_buttons
  buttons?:         Array<{ id: string; title: string }>;
  wait_for_reply?:  boolean;

  // condition
  variable?:        string;
  left?:            string;
  operator?:        string;
  right?:           string;
  value?:           string;

  // send_document
  url?:             string;
  filename?:        string;
  caption?:         string;

  // set_variable
  // variable (already declared above)

  // go_to_flow
  flow_id?:         string;

  // allow arbitrary extra keys from builder
  [key: string]: unknown;
}

export interface FlowNode {
  id:       string;
  type:     NodeType;
  position: { x: number; y: number };
  data:     NodeData;
}

export interface FlowEdge {
  id:           string;
  source:       string;
  target:       string;
  sourceHandle?: string;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ContactData {
  external_id: string;
  name?:       string;
  phone?:      string;
  email?:      string;
}

export interface IncomingMessage {
  id?:      string;
  text:     string;
  type?:    'text' | 'button_reply' | 'interactive_reply';
  payload?: string;
}

export interface RouterRequest {
  event_type?:     string;
  channel:         ChannelType;
  client_id:       string;
  organization_id: string;
  contact:         ContactData;
  message:         IncomingMessage;
  timestamp?:      string;
}

// ── Action shapes ─────────────────────────────────────────────────────────────

export interface SendTextAction {
  type: 'send_text';
  text: string;
}

export interface SendButtonsAction {
  type:    'send_buttons';
  text:    string;
  buttons: Array<{ id: string; title: string }>;
}

export interface SendDocumentAction {
  type:      'send_document';
  url:       string;
  filename:  string;
  caption?:  string;
}

export interface SendListSection {
  title: string;
  rows:  Array<{ id: string; title: string; description?: string }>;
}

export interface SendListAction {
  type:         'send_list';
  text:         string;
  button_label: string;
  sections:     SendListSection[];
}

export type Action =
  | SendTextAction
  | SendButtonsAction
  | SendDocumentAction
  | SendListAction;

export interface RouterResponse {
  mode:    BotMode;
  actions?: Action[];
  error?:  string;
}

// ── Flow state (mirrors contact_flow_state row) ───────────────────────────────

export interface FlowState {
  id?:             string;
  organization_id: string;
  client_id:       string;
  contact_id:      string;
  flow_id:         string;
  current_node_id: string;
  variables:       Record<string, string>;
  status:          StateStatus;
  channel:         ChannelType;
  expires_at:      string;
}

// ── Node execution result ─────────────────────────────────────────────────────

export interface NodeResult {
  actions:      Action[];
  wait?:        boolean;   // true = nó aguarda resposta; persiste estado e retorna
  done?:        boolean;   // true = fluxo encerrado
  nextNodeId?:  string;    // próximo nó a executar
}
