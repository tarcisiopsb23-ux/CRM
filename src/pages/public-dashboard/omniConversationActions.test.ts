/**
 * Unit tests — pure predicates for the omnichannel conversation actions.
 *
 * Cobrem a lógica de visibilidade de Assumir / Finalizar / Transferir usada
 * pela lista (ConversationItem) e pelo topbar (CenterColumn).
 */
import { describe, it, expect } from "vitest";
import type { Conversation } from "@/hooks/useOmnichannelInbox";
import {
  canAssumeConversation,
  isAssignedToMe,
  canFinalizeConversation,
  canTransferConversation,
  canSupervise,
} from "./omniConversationActions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ME = "agent-me";
const OTHER = "agent-other";

function makeConv(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: "conv-1",
    client_id: "client-1",
    organization_id: "org-1",
    channel_type: "whatsapp",
    meta_connection_id: null,
    contact_id: null,
    status: "bot_active",
    priority: "normal",
    bot_active: true,
    assigned_agent_id: null,
    last_message_at: null,
    contact_name: null,
    contact_phone: null,
    contact_avatar: null,
    last_message_preview: null,
    unread_count: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("canSupervise", () => {
  it("returns true for owner/admin/manager", () => {
    expect(canSupervise("owner")).toBe(true);
    expect(canSupervise("admin")).toBe(true);
    expect(canSupervise("manager")).toBe(true);
  });

  it("returns false for member/viewer", () => {
    expect(canSupervise("member")).toBe(false);
    expect(canSupervise("viewer")).toBe(false);
  });

  it("defaults to viewer when no role is provided", () => {
    expect(canSupervise(null)).toBe(false);
    expect(canSupervise(undefined)).toBe(false);
    expect(canSupervise("")).toBe(false);
  });
});

describe("canAssumeConversation", () => {
  it("returns true when unassigned and bot is active", () => {
    expect(canAssumeConversation(makeConv({ bot_active: true, status: "bot_active" }), ME)).toBe(true);
  });

  it("returns true when unassigned and waiting for human", () => {
    expect(canAssumeConversation(makeConv({ bot_active: false, status: "waiting_human" }), ME)).toBe(true);
  });

  it("returns false when unassigned but human_active with bot off", () => {
    expect(canAssumeConversation(makeConv({ bot_active: false, status: "human_active" }), ME)).toBe(false);
  });

  it("returns false when already assigned (regardless of bot)", () => {
    expect(canAssumeConversation(makeConv({ assigned_agent_id: OTHER, bot_active: true }), ME)).toBe(false);
  });

  it("returns false when there is no myAgentId", () => {
    expect(canAssumeConversation(makeConv({ bot_active: true }), null)).toBe(false);
    expect(canAssumeConversation(makeConv({ bot_active: true }), undefined)).toBe(false);
  });
});

describe("isAssignedToMe", () => {
  it("returns true when assigned to me", () => {
    expect(isAssignedToMe(makeConv({ assigned_agent_id: ME }), ME)).toBe(true);
  });

  it("returns false when assigned to someone else", () => {
    expect(isAssignedToMe(makeConv({ assigned_agent_id: OTHER }), ME)).toBe(false);
  });

  it("returns false when unassigned", () => {
    expect(isAssignedToMe(makeConv({ assigned_agent_id: null }), ME)).toBe(false);
  });

  it("returns false when there is no myAgentId", () => {
    expect(isAssignedToMe(makeConv({ assigned_agent_id: ME }), null)).toBe(false);
  });
});

describe("canFinalizeConversation", () => {
  it("returns true when assigned to me and human_active", () => {
    expect(canFinalizeConversation(makeConv({ assigned_agent_id: ME, status: "human_active" }), ME)).toBe(true);
  });

  it("returns false when assigned to me but resolved", () => {
    expect(canFinalizeConversation(makeConv({ assigned_agent_id: ME, status: "resolved" }), ME)).toBe(false);
  });

  it("returns false when assigned to me but closed", () => {
    expect(canFinalizeConversation(makeConv({ assigned_agent_id: ME, status: "closed" }), ME)).toBe(false);
  });

  it("returns false when assigned to someone else", () => {
    expect(canFinalizeConversation(makeConv({ assigned_agent_id: OTHER, status: "human_active" }), ME)).toBe(false);
  });

  it("returns false when there is no myAgentId", () => {
    expect(canFinalizeConversation(makeConv({ assigned_agent_id: ME, status: "human_active" }), null)).toBe(false);
  });
});

describe("canTransferConversation", () => {
  it("returns true when assigned to me even without supervisor role", () => {
    expect(canTransferConversation(makeConv({ assigned_agent_id: ME }), ME, false)).toBe(true);
  });

  it("returns true when assigned to someone else but I can supervise", () => {
    expect(canTransferConversation(makeConv({ assigned_agent_id: OTHER }), ME, true)).toBe(true);
  });

  it("returns false when assigned to someone else and I cannot supervise", () => {
    expect(canTransferConversation(makeConv({ assigned_agent_id: OTHER }), ME, false)).toBe(false);
  });

  it("returns true when assigned to me and I can also supervise", () => {
    expect(canTransferConversation(makeConv({ assigned_agent_id: ME }), ME, true)).toBe(true);
  });

  it("returns true for an unassigned conversation when I can supervise", () => {
    expect(canTransferConversation(makeConv({ assigned_agent_id: null }), ME, true)).toBe(true);
  });

  it("returns false for an unassigned conversation when I cannot supervise", () => {
    expect(canTransferConversation(makeConv({ assigned_agent_id: null }), ME, false)).toBe(false);
  });
});
