/**
 * Predicados de visibilidade das ações de conversa (Omnichannel Inbox).
 *
 * Funções puras usadas tanto pela lista (ConversationItem) quanto pelo
 * topbar (CenterColumn) para manter a lógica de visibilidade coerente entre
 * os dois pontos de entrada.
 *
 * Modelo de ações:
 *   • Assumir   — conversa sem agente, com bot ativo ou aguardando humano.
 *   • Finalizar — conversa atribuída a mim e ainda não finalizada/encerrada.
 *   • Transferir— conversa atribuída a mim OU usuário com poder de supervisão.
 *
 * O estado do bot é controlado implicitamente: Assumir desliga o bot
 * (assign_client_conversation), Finalizar religa (resolve_conversation).
 */

import type { Conversation } from "@/hooks/useOmnichannelInbox";

/** Roles com poder de supervisão (supervisor ≈ manager, + admin/owner). */
export const SUPERVISOR_ROLES = ["owner", "admin", "manager"] as const;

/** True para roles de gestão (owner/admin/manager). */
export function canSupervise(userRole?: string | null): boolean {
  return (SUPERVISOR_ROLES as readonly string[]).includes(userRole ?? "viewer");
}

/**
 * Assumir: visível quando a conversa não tem agente atribuído e o bot está
 * ativo ou a conversa aguarda atendimento humano.
 */
export function canAssumeConversation(
  conv: Conversation,
  myAgentId?: string | null,
): boolean {
  return (
    Boolean(myAgentId) &&
    !conv.assigned_agent_id &&
    (conv.bot_active || conv.status === "waiting_human")
  );
}

/** True quando a conversa está atribuída ao próprio atendente. */
export function isAssignedToMe(
  conv: Conversation,
  myAgentId?: string | null,
): boolean {
  return (
    Boolean(myAgentId) &&
    Boolean(conv.assigned_agent_id) &&
    conv.assigned_agent_id === myAgentId
  );
}

/**
 * Finalizar: visível quando a conversa está atribuída a mim e ainda não foi
 * resolvida/encerrada.
 */
export function canFinalizeConversation(
  conv: Conversation,
  myAgentId?: string | null,
): boolean {
  return (
    isAssignedToMe(conv, myAgentId) &&
    conv.status !== "resolved" &&
    conv.status !== "closed"
  );
}

/**
 * Transferir: visível quando a conversa está atribuída a mim OU o usuário tem
 * poder de supervisão (para transferir conversas de atendentes ausentes).
 */
export function canTransferConversation(
  conv: Conversation,
  myAgentId?: string | null,
  canSuperviseFlag?: boolean,
): boolean {
  return isAssignedToMe(conv, myAgentId) || Boolean(canSuperviseFlag);
}
