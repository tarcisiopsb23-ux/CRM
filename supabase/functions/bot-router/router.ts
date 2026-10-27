// ── router.ts — Orquestração principal do bot-router ─────────────────────────
//
// Fluxo de execução:
//   1. Valida campos obrigatórios do request
//   2. Chama resolve_bot_strategy → se mode='n8n', retorna imediatamente
//   3. Resolve contact_id via upsert_omni_contact_identity
//   4. Busca estado ativo (running/waiting) do contato
//   5a. Estado waiting válido → prepara retomada com handle de entrada
//   5b. Sem estado (ou expirado) → busca trigger_keyword, cria estado inicial
//        Se nenhum trigger casou → retorna {mode:'n8n'} (antes do motor)
//   6. Executa motor de fluxo via executeFlowWithHandle
//   7. Retorna {mode:'flow', actions} — actions pode ser [] para fluxos sem
//        saída visível (ex: cadeia set_variable); não confundir com fallback n8n

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  RouterRequest,
  RouterResponse,
  FlowState,
  FlowDefinition,
  FlowNode,
  Action,
  ChannelType,
} from './types.ts';
import { executeFlow } from './engine.ts';
import { executeNode, getNextNodeId } from './nodes.ts';

// ── Helper: testa se o texto casa com um nó trigger_keyword ──────────────────
function matchKeyword(text: string, node: FlowNode): boolean {
  const lower    = (text ?? '').toLowerCase();
  const keywords = (node.data.keywords as string[]) ?? [];
  const matchType = (node.data.match_type as string) ?? 'contains';

  return keywords.some(kw => {
    const k = kw.toLowerCase();
    switch (matchType) {
      case 'exact':       return lower === k;
      case 'contains':    return lower.includes(k);
      case 'starts_with': return lower.startsWith(k);
      case 'regex': {
        try { return new RegExp(k, 'i').test(text); }
        catch { return false; }
      }
      default:            return lower.includes(k);
    }
  });
}

// ── Execução com handle de entrada (retomada ou início) ──────────────────────
//
// Quando retomando de um nó 'waiting', o engine não sabe qual handle usar na
// primeira iteração. Aqui resolvemos: executamos o nó atual com o handle
// correto, depois continuamos o loop normalmente via executeFlow.
//
async function executeFlowWithHandle(
  flow: { definition: FlowDefinition; default_timeout_hours: number },
  state: FlowState,
  message: { text: string; payload?: string; type?: string },
  contact: import('./types.ts').ContactData,
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  incomingHandle: string | undefined
): Promise<Action[]> {
  if (incomingHandle === undefined) {
    // Início limpo: executa normalmente
    return executeFlow(flow, state, message, contact, supabaseClient, 0);
  }

  // Retomada: executa o nó atual com o handle de entrada
  const currentNode = flow.definition.nodes.find(n => n.id === state.current_node_id);
  if (!currentNode) return [];

  const firstResult = await executeNode(
    currentNode,
    flow.definition.edges,
    state,
    message,
    incomingHandle,
    contact,
    supabaseClient,
    0,
    executeFlow
  );

  const collectedActions: Action[] = [...firstResult.actions];

  if (firstResult.wait) {
    // Nó ainda aguarda resposta (ex: nova pergunta após responder a anterior)
    const expiresAt = new Date(
      Date.now() + flow.default_timeout_hours * 3_600_000
    ).toISOString();
    await supabaseClient.rpc('upsert_flow_state', {
      p_id:              state.id ?? null,
      p_organization_id: state.organization_id,
      p_client_id:       state.client_id,
      p_contact_id:      state.contact_id,
      p_flow_id:         state.flow_id,
      p_current_node_id: currentNode.id,
      p_variables:       state.variables,
      p_status:          'waiting',
      p_channel:         state.channel,
      p_expires_at:      expiresAt,
    });
    return collectedActions;
  }

  if (firstResult.done || !firstResult.nextNodeId) {
    // Fluxo encerrado pelo primeiro nó (go_to_flow ou sem próximo)
    return collectedActions;
  }

  // Avança para o próximo nó e continua com o loop normal do engine
  state.current_node_id = firstResult.nextNodeId;
  const remaining = await executeFlow(flow, state, message, contact, supabaseClient, 0);
  return [...collectedActions, ...remaining];
}

// ── Função principal exportada ────────────────────────────────────────────────

export async function resolveAndExecute(
  req: RouterRequest,
  // deno-lint-ignore no-explicit-any
  supabaseClient: ReturnType<typeof createClient>
): Promise<RouterResponse> {
  try {
    // 1. Validação
    if (!req.client_id)            throw new Error('client_id obrigatório');
    if (!req.organization_id)      throw new Error('organization_id obrigatório');
    if (!req.channel)              throw new Error('channel obrigatório');
    if (!req.contact?.external_id) throw new Error('contact.external_id obrigatório');

    const clientId = req.client_id;
    const orgId    = req.organization_id;
    const channel  = req.channel as ChannelType;
    const contact  = req.contact;
    const message  = req.message ?? { text: '' };

    // 2. Resolve estratégia do bot
    const { data: strategy, error: stratErr } = await supabaseClient.rpc(
      'resolve_bot_strategy',
      { p_client_id: clientId, p_channel: channel }
    );
    if (stratErr) throw new Error(`resolve_bot_strategy: ${stratErr.message}`);

    // deno-lint-ignore no-explicit-any
    const strat = strategy as any;
    if (!strat || strat.mode === 'n8n') return { mode: 'n8n' };

    // 3. Resolve contact_id
    const { data: omniResult, error: omniErr } = await supabaseClient.rpc(
      'upsert_omni_contact_identity',
      {
        p_organization_id:  orgId,
        p_channel_type:     channel,
        p_external_user_id: contact.external_id,
        p_display_name:     contact.name ?? null,
        p_username:         contact.name ?? null,
      }
    );
    if (omniErr) throw new Error(`upsert_omni_contact_identity: ${omniErr.message}`);

    // Migration 149: retorno mudou de UUID para JSONB { contact_id, ... }
    // deno-lint-ignore no-explicit-any
    const contactId: string = (omniResult as any)?.contact_id ?? (omniResult as string);
    if (!contactId) throw new Error('contact_id não resolvido');

    // 4. Busca estado ativo
    const { data: stateRows, error: stateErr } = await supabaseClient.rpc(
      'get_active_flow_state',
      { p_client_id: clientId, p_contact_id: contactId, p_channel: channel }
    );
    if (stateErr) throw new Error(`get_active_flow_state: ${stateErr.message}`);

    // deno-lint-ignore no-explicit-any
    const stateRow = (stateRows as any[])?.[0] ?? null;

    let flowState: FlowState | null        = null;
    let flowDef: FlowDefinition | null     = null;
    let flowTimeoutHours                   = 24;
    let incomingHandle: string | undefined = undefined;

    // 5a. Estado waiting válido?
    if (stateRow?.status === 'waiting') {
      if (new Date(stateRow.expires_at) < new Date()) {
        // Expirado: marca e trata como nova mensagem
        await supabaseClient.rpc('upsert_flow_state', {
          p_id:              stateRow.id,
          p_organization_id: stateRow.organization_id,
          p_client_id:       stateRow.client_id,
          p_contact_id:      stateRow.contact_id,
          p_flow_id:         stateRow.flow_id,
          p_current_node_id: stateRow.current_node_id,
          p_variables:       stateRow.variables,
          p_status:          'expired',
          p_channel:         stateRow.channel,
          p_expires_at:      stateRow.expires_at,
        });
        // stateRow permanece null → flui para 5b
      } else {
        // Retomada: prepara estado e handle de entrada
        flowState = {
          id:              stateRow.id,
          organization_id: stateRow.organization_id,
          client_id:       stateRow.client_id,
          contact_id:      stateRow.contact_id,
          flow_id:         stateRow.flow_id,
          current_node_id: stateRow.current_node_id,
          variables:       stateRow.variables ?? {},
          status:          stateRow.status,
          channel:         stateRow.channel,
          expires_at:      stateRow.expires_at,
        };

        // Handle de entrada: button_reply usa payload como handle de botão
        incomingHandle = (message.type === 'button_reply')
          ? (message.payload ?? 'btn_0')
          : 'answer';

        // Busca definição do fluxo
        const { data: existingFlow } = await supabaseClient
          .from('chatbot_flows')
          .select('definition, default_timeout_hours')
          .eq('id', stateRow.flow_id)
          .maybeSingle();

        if (!existingFlow) return { mode: 'n8n' };
        flowDef          = existingFlow.definition as FlowDefinition;
        flowTimeoutHours = existingFlow.default_timeout_hours ?? 24;
      }
    }

    // 5b. Sem estado ativo → testa trigger_keyword e cria novo fluxo
    if (!flowState) {
      const definition = strat.definition as FlowDefinition;
      if (!definition) return { mode: 'n8n' };

      const triggers = definition.nodes.filter(n => n.type === 'trigger_keyword');
      const matched  = triggers.find(t => matchKeyword(message.text ?? '', t));
      if (!matched) return { mode: 'n8n' };

      const startNodeId = getNextNodeId(definition.edges, matched.id);
      if (!startNodeId) return { mode: 'n8n' };

      // Busca timeout do fluxo
      const { data: flowMeta } = await supabaseClient
        .from('chatbot_flows')
        .select('default_timeout_hours')
        .eq('id', strat.flow_id)
        .maybeSingle();

      flowTimeoutHours = flowMeta?.default_timeout_hours ?? 24;
      const expiresAt  = new Date(Date.now() + flowTimeoutHours * 3_600_000).toISOString();

      const { data: newId, error: insertErr } = await supabaseClient.rpc('upsert_flow_state', {
        p_id:              null,
        p_organization_id: orgId,
        p_client_id:       clientId,
        p_contact_id:      contactId,
        p_flow_id:         strat.flow_id,
        p_current_node_id: startNodeId,
        p_variables:       {},
        p_status:          'running',
        p_channel:         channel,
        p_expires_at:      expiresAt,
      });
      if (insertErr) throw new Error(`upsert_flow_state: ${insertErr.message}`);

      flowState = {
        id:              newId as string,
        organization_id: orgId,
        client_id:       clientId,
        contact_id:      contactId,
        flow_id:         strat.flow_id,
        current_node_id: startNodeId,
        variables:       {},
        status:          'running',
        channel,
        expires_at:      expiresAt,
      };
      flowDef = definition;
      // incomingHandle permanece undefined (início limpo)
    }

    if (!flowDef || !flowState) return { mode: 'n8n' };

    // 6. Executa o motor
    const actions = await executeFlowWithHandle(
      { definition: flowDef, default_timeout_hours: flowTimeoutHours },
      flowState,
      { text: message.text ?? '', payload: message.payload, type: message.type },
      contact,
      supabaseClient,
      incomingHandle
    );

    // 7. Retorna ao n8n
    // Nota: NÃO aplicamos guard "actions.length === 0" aqui — um fluxo que
    // completa com zero ações visíveis (ex: cadeia pura de set_variable) ainda
    // deve retornar {mode:'flow'} para que o n8n não ative o handler de IA.
    return { mode: 'flow', actions };

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bot-router] resolveAndExecute error:', msg);
    return { mode: 'n8n', error: msg };
  }
}
