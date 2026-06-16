import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOmnichannelChat } from "../hooks/useOmnichannelChat";

describe("useOmnichannelChat", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should initialize with default conversations", () => {
    const { result } = renderHook(() => useOmnichannelChat());
    expect(result.current.allConversationsCount).toBeGreaterThan(0);
    expect(result.current.activeConversation).not.toBeNull();
    expect(result.current.activeConversation?.contact_name).toBe("Thiago Silva");
  });

  it("should select a conversation", () => {
    const { result } = renderHook(() => useOmnichannelChat());
    
    act(() => {
      result.current.setSelectedConversationId("conv-2");
    });

    expect(result.current.selectedConversationId).toBe("conv-2");
    expect(result.current.activeConversation?.contact_name).toBe("Mariana Costa");
  });

  it("should allow sending a message", () => {
    const { result } = renderHook(() => useOmnichannelChat());

    act(() => {
      result.current.sendMessage("Olá, esta é uma mensagem de teste");
    });

    const timeline = result.current.activeTimeline;
    const lastMsg = timeline[timeline.length - 1];
    expect(lastMsg.type).toBe("message");
    expect((lastMsg as any).text).toBe("Olá, esta é uma mensagem de teste");
  });

  it("should assign an agent and transition status", () => {
    const { result } = renderHook(() => useOmnichannelChat());

    act(() => {
      result.current.assignAgent("Ana");
    });

    expect(result.current.activeConversation?.assigned_user).toBe("Ana");
    expect(result.current.activeConversation?.status).toBe("em_atendimento");
  });

  it("should simulate incoming message", () => {
    const { result } = renderHook(() => useOmnichannelChat());

    act(() => {
      result.current.simulateIncomingMessage("whatsapp", "Cliente Novo Teste", "+5511955554444", "Gostaria de saber preços");
    });

    expect(result.current.activeConversation?.contact_name).toBe("Cliente Novo Teste");
    expect(result.current.activeConversation?.channel).toBe("whatsapp");
    expect(result.current.activeConversation?.last_message).toBe("Gostaria de saber preços");
  });

  it("should update lead score", () => {
    const { result } = renderHook(() => useOmnichannelChat());

    act(() => {
      result.current.updateLeadScore(85);
    });

    expect(result.current.activeConversation?.lead_score).toBe(85);
  });
});
