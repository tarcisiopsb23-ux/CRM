// ── engine.ts — Loop de execução do fluxo ────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { FlowDefinition, FlowState, Action, ContactData, IncomingMessage } from './types.ts';
import { executeNode } from './nodes.ts';

const MAX_HOPS = 50;

// ── Helper: calcula data de expiração ─────────────────────────────────────────
function addHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

// ── Helper: persiste estado no banco ─────────────────────────────────────────
async function upsertState(
  sb: ReturnType<typeof createClient>,
  state: FlowState,
  status: string,
  nodeId?: string
): Promise<void> {
  await sb.rpc('upsert_flow_state', {
    p_id:              state.id ?? null,
    p_organization_id: state.organization_id,
    p_client_id:       state.client_id,
    p_contact_id:      state.contact_id,
    p_flow_id:         state.flow_id,
    p_current_node_id: nodeId ?? state.current_node_id,
    p_variables:       state.variables,
    p_status:          status,
    p_channel:         state.channel,
    p_expires_at:      state.expires_at,
  });
  // deno-lint-ignore no-explicit-any
  (state as any).status = status;
}

// ── Motor principal ───────────────────────────────────────────────────────────

export async function executeFlow(
  flow: { definition: FlowDefinition; default_timeout_hours: number },
  state: FlowState,
  message: IncomingMessage,
  contact: ContactData,
  supabaseClient: ReturnType<typeof createClient>,
  depth = 0
): Promise<Action[]> {
  const actions: Action[] = [];
  let hops = 0;
  let currentHandle: string | undefined = undefined;

  // Na primeira chamada, o handle de entrada vem do state quando foi configurado
  // pelo router antes de chamar executeFlow (para retomada de nó waiting).
  // Passamos aqui por parâmetro via state.current_node_id já ajustado.

  while (hops < MAX_HOPS) {
    const node = flow.definition.nodes.find(n => n.id === state.current_node_id);
    if (!node) break;

    const result = await executeNode(
      node,
      flow.definition.edges,
      state,
      message,
      currentHandle,
      contact,
      supabaseClient,
      depth,
      executeFlow  // callback para resolver go_to_flow sem importação circular
    );

    actions.push(...result.actions);
    currentHandle = undefined; // handle só se aplica na primeira iteração do loop

    if (result.wait) {
      // Nó aguarda resposta: persiste estado 'waiting' e retorna actions geradas.
      // Calcula expires_at antes do upsert para gravar o valor correto num único write.
      state.expires_at = addHours(flow.default_timeout_hours);
      state.current_node_id = node.id;
      await supabaseClient.rpc('upsert_flow_state', {
        p_id:              state.id ?? null,
        p_organization_id: state.organization_id,
        p_client_id:       state.client_id,
        p_contact_id:      state.contact_id,
        p_flow_id:         state.flow_id,
        p_current_node_id: node.id,
        p_variables:       state.variables,
        p_status:          'waiting',
        p_channel:         state.channel,
        p_expires_at:      state.expires_at,
      });
      // deno-lint-ignore no-explicit-any
      (state as any).status = 'waiting';
      return actions;
    }

    if (result.done || !result.nextNodeId) {
      // Fluxo encerrado normalmente (ou go_to_flow já completou internamente)
      if (!result.done) {
        await upsertState(supabaseClient, state, 'completed');
      }
      // Se result.done=true o go_to_flow já gerenciou o estado
      // Acrescenta as actions do sub-fluxo (go_to_flow as retorna em result.actions)
      return actions;
    }

    state.current_node_id = result.nextNodeId;
    hops++;
  }

  if (hops >= MAX_HOPS) {
    // Loop guard ativado: descarta actions parciais, marca erro
    await upsertState(supabaseClient, state, 'error');
    return [];
  }

  // Sem próximo nó → fluxo concluído
  await upsertState(supabaseClient, state, 'completed');
  return actions;
}
