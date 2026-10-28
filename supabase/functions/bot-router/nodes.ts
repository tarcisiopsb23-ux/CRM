// ── nodes.ts — Execução de nós individuais do fluxo ─────────────────────────

import type {
  FlowNode,
  FlowEdge,
  FlowState,
  IncomingMessage,
  ContactData,
  NodeResult,
  Action,
  FlowDefinition,
} from './types.ts';
import { resolveVariables } from './variables.ts';

// ── Tipo do callback executeFlow (evita importação circular) ──────────────────
type ExecuteFlowFn = (
  flow: { definition: FlowDefinition; default_timeout_hours: number },
  state: FlowState,
  message: IncomingMessage,
  contact: ContactData,
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  depth?: number
) => Promise<Action[]>;

// ── Helper: encontra o próximo nó via aresta ──────────────────────────────────

export function getNextNodeId(
  edges: FlowEdge[],
  nodeId: string,
  handle?: string
): string | undefined {
  if (handle !== undefined) {
    // Tenta primeiro a aresta com o handle exato
    const exact = edges.find(
      e => e.source === nodeId && e.sourceHandle === handle
    );
    if (exact) return exact.target;
    // Fallback: qualquer aresta saindo deste nó (sem handle definido)
    const fallback = edges.find(
      e => e.source === nodeId && !e.sourceHandle
    );
    if (fallback) return fallback.target;
    return undefined;
  }
  // Sem handle: primeira aresta que sai deste nó
  const edge = edges.find(e => e.source === nodeId);
  return edge?.target;
}

// ── Helper: avalia operador de condição ───────────────────────────────────────

function evaluate(left: string, operator: string, right: string): boolean {
  const l = left.toLowerCase();
  const r = right.toLowerCase();

  switch (operator) {
    case 'equals':
    case 'eq':
      return l === r;

    case 'not_equals':
    case 'not_eq':
      return l !== r;

    case 'contains':
      return l.includes(r);

    case 'not_contains':
      return !l.includes(r);

    case 'starts_with':
      return l.startsWith(r);

    case 'ends_with':
      return l.endsWith(r);

    case 'is_empty':
      return left.trim() === '';

    case 'is_not_empty':
      return left.trim() !== '';

    case 'regex':
    case 'regex_match': {
      try {
        return new RegExp(right, 'i').test(left);
      } catch {
        return false;
      }
    }

    case 'gt': {
      const ln = parseFloat(left);
      const rn = parseFloat(right);
      return !isNaN(ln) && !isNaN(rn) && ln > rn;
    }

    case 'lt': {
      const ln = parseFloat(left);
      const rn = parseFloat(right);
      return !isNaN(ln) && !isNaN(rn) && ln < rn;
    }

    default:
      return false;
  }
}

// ── Executor principal ────────────────────────────────────────────────────────

export async function executeNode(
  node: FlowNode,
  edges: FlowEdge[],
  state: FlowState,
  message: IncomingMessage,
  incomingHandle: string | undefined,
  contact: ContactData,
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  depth: number,
  executeFlowFn: ExecuteFlowFn
): Promise<NodeResult> {
  const data = node.data;

  switch (node.type) {
    // ── trigger_keyword: nunca executado pelo motor ──────────────────────────
    case 'trigger_keyword':
      return { actions: [] };

    // ── send_message: envia texto e avança ───────────────────────────────────
    case 'send_message': {
      const text = resolveVariables(
        (data.text as string) ?? '',
        state.variables,
        contact
      );
      return {
        actions: [{ type: 'send_text', text }],
        nextNodeId: getNextNodeId(edges, node.id),
      };
    }

    // ── send_buttons: envia botões, opcionalmente aguarda ────────────────────
    case 'send_buttons': {
      const text = resolveVariables(
        (data.text as string) ?? '',
        state.variables,
        contact
      );
      const buttons = (data.buttons as Array<{ id: string; title: string }>) ?? [];

      if (data.wait_for_reply && incomingHandle === undefined) {
        // Primeira passagem: envia botões e aguarda
        return {
          actions: [{ type: 'send_buttons', text, buttons }],
          wait: true,
        };
      }

      // Retomada com handle de botão esperado (btn_0, btn_1 etc.)
      // Se incomingHandle for 'answer' (texto livre em vez de clique no botão)
      // ou outro handle não reconhecido, reenvia os botões para não silenciar o usuário.
      const handle = incomingHandle ?? 'btn_0';
      const nextNodeId = getNextNodeId(edges, node.id, handle);

      if (!nextNodeId) {
        // Handle não corresponde a nenhuma aresta: reenvia botões aguardando novo clique
        return {
          actions: [{ type: 'send_buttons', text, buttons }],
          wait: true,
        };
      }

      return {
        actions: [],
        nextNodeId,
      };
    }

    // ── question: envia pergunta e aguarda resposta de texto livre ───────────
    case 'question': {
      if (incomingHandle === 'answer') {
        // Retomada: salva resposta e avança
        const saveKey = (data.save_response_to as string) ?? '__answer';
        state.variables[saveKey] = message.text ?? '';
        return {
          actions: [],
          nextNodeId: getNextNodeId(edges, node.id),
        };
      }

      // Primeira passagem: envia pergunta e aguarda
      const text = resolveVariables(
        (data.text as string) ?? '',
        state.variables,
        contact
      );
      return {
        actions: [{ type: 'send_text', text }],
        wait: true,
      };
    }

    // ── condition: avalia e roteia para 'yes' ou 'no' ───────────────────────
    case 'condition': {
      // Suporta tanto data.variable/operator/value quanto data.left/operator/right
      const rawLeft     = (data.left ?? data.variable ?? '') as string;
      const operator    = (data.operator ?? '') as string;
      const rawRight    = (data.right ?? data.value ?? '') as string;

      const left  = resolveVariables(rawLeft,  state.variables, contact);
      const right = resolveVariables(rawRight, state.variables, contact);

      const result = evaluate(left, operator, right);
      const handle = result ? 'yes' : 'no';

      return {
        actions: [],
        nextNodeId: getNextNodeId(edges, node.id, handle),
      };
    }

    // ── send_document: envia arquivo via URL ─────────────────────────────────
    case 'send_document': {
      const url      = (data.url      as string) ?? '';
      const filename = (data.filename as string) ?? 'arquivo';
      const caption  = data.caption
        ? resolveVariables(data.caption as string, state.variables, contact)
        : undefined;

      const action: Action = { type: 'send_document', url, filename, ...(caption ? { caption } : {}) };
      return {
        actions: [action],
        nextNodeId: getNextNodeId(edges, node.id),
      };
    }

    // ── set_variable: atribui variável e avança ──────────────────────────────
    case 'set_variable': {
      const varName  = (data.variable as string) ?? '';
      const rawValue = (data.value    as string) ?? '';
      state.variables[varName] = resolveVariables(rawValue, state.variables, contact);
      return {
        actions: [],
        nextNodeId: getNextNodeId(edges, node.id),
      };
    }

    // ── go_to_flow: abandona fluxo atual e inicia outro ──────────────────────
    case 'go_to_flow': {
      if (depth >= 5) {
        // Limite de profundidade atingido: encerra silenciosamente
        return { actions: [], done: true };
      }

      const targetFlowId = (data.flow_id as string) ?? '';
      if (!targetFlowId) {
        return { actions: [], done: true };
      }

      // Marca fluxo atual como concluído antes de criar o novo estado.
      // Se falhar, abortamos para evitar violação de uq_cfs_active no insert seguinte.
      const { error: completeErr } = await supabaseClient.rpc('upsert_flow_state', {
        p_id:              state.id ?? null,
        p_organization_id: state.organization_id,
        p_client_id:       state.client_id,
        p_contact_id:      state.contact_id,
        p_flow_id:         state.flow_id,
        p_current_node_id: state.current_node_id,
        p_variables:       state.variables,
        p_status:          'completed',
        p_channel:         state.channel,
        p_expires_at:      state.expires_at,
      });
      if (completeErr) {
        console.error('[bot-router] go_to_flow: falha ao marcar estado atual como completed:', completeErr.message);
        return { actions: [], done: true };
      }

      // Busca fluxo destino
      const { data: targetFlow, error: flowErr } = await supabaseClient
        .from('chatbot_flows')
        .select('id, definition, default_timeout_hours')
        .eq('id', targetFlowId)
        .eq('status', 'active')
        .maybeSingle();

      if (flowErr || !targetFlow) {
        return { actions: [], done: true };
      }

      // Encontra o nó trigger_keyword do fluxo destino
      const def = targetFlow.definition as import('./types.ts').FlowDefinition;
      const triggerNode = def.nodes.find(n => n.type === 'trigger_keyword');
      if (!triggerNode) {
        return { actions: [], done: true };
      }

      const startNodeId = getNextNodeId(def.edges, triggerNode.id);
      if (!startNodeId) {
        return { actions: [], done: true };
      }

      // Cria novo estado para o fluxo destino
      const expiresAt = new Date(
        Date.now() + (targetFlow.default_timeout_hours ?? 24) * 3_600_000
      ).toISOString();

      const { data: newStateId, error: newStateErr } = await supabaseClient.rpc('upsert_flow_state', {
        p_id:              null,
        p_organization_id: state.organization_id,
        p_client_id:       state.client_id,
        p_contact_id:      state.contact_id,
        p_flow_id:         targetFlow.id,
        p_current_node_id: startNodeId,
        p_variables:       {},
        p_status:          'running',
        p_channel:         state.channel,
        p_expires_at:      expiresAt,
      });

      if (newStateErr || !newStateId) {
        console.error('[bot-router] go_to_flow: falha ao criar estado para fluxo destino:', newStateErr?.message ?? 'null state id');
        return { actions: [], done: true };
      }

      const newState: FlowState = {
        id:              newStateId as string,
        organization_id: state.organization_id,
        client_id:       state.client_id,
        contact_id:      state.contact_id,
        flow_id:         targetFlow.id,
        current_node_id: startNodeId,
        variables:       {},
        status:          'running',
        channel:         state.channel,
        expires_at:      expiresAt,
      };

      // Executa fluxo destino recursivamente
      const subActions = await executeFlowFn(
        { definition: def, default_timeout_hours: targetFlow.default_timeout_hours ?? 24 },
        newState,
        message,
        contact,
        supabaseClient,
        depth + 1
      );

      return { actions: subActions, done: true };
    }

    default:
      return { actions: [], done: true };
  }
}
