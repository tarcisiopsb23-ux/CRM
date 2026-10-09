import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicDashboardLoginPage } from "./PublicDashboardLoginPage";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock supabase
const mockRpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { toast } from "sonner";

function renderPage(slug = "test-slug") {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/${slug}`]}>
      <Routes>
        <Route path="/dashboard/:slug" element={<PublicDashboardLoginPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const mockClient = {
  id: "client-1",
  name: "Test Client",
  slug: "test-slug",
  favicon_url: null,
  has_temp_password: false,
  dashboard_performance: true,
  dashboard_atendimento: true,
  dashboard_crm: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("PublicDashboardLoginPage", () => {
  describe("Req 2.3 — mensagem de erro genérica (não revela campo incorreto)", () => {
    it("exibe mensagem genérica quando credenciais são inválidas", async () => {
      // get_client_by_slug retorna cliente
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "get_client_by_slug") return Promise.resolve({ data: [mockClient], error: null });
        if (fn === "validate_client_dashboard_password") return Promise.resolve({ data: false, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      renderPage();

      fireEvent.change(screen.getByPlaceholderText("seu@email.com"), {
        target: { value: "wrong@email.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), {
        target: { value: "wrongpassword" },
      });
      fireEvent.click(screen.getByText("Entrar no Dashboard"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("E-mail ou senha incorretos.");
      });
    });

    it("mensagem de erro NÃO menciona 'e-mail incorreto' isoladamente", async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "get_client_by_slug") return Promise.resolve({ data: [mockClient], error: null });
        if (fn === "validate_client_dashboard_password") return Promise.resolve({ data: false, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      renderPage();

      fireEvent.change(screen.getByPlaceholderText("seu@email.com"), {
        target: { value: "wrong@email.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), {
        target: { value: "wrongpassword" },
      });
      fireEvent.click(screen.getByText("Entrar no Dashboard"));

      await waitFor(() => {
        const calls = (toast.error as ReturnType<typeof vi.fn>).mock.calls;
        const errorMessages = calls.map((c) => String(c[0]).toLowerCase());
        // Must not reveal which specific field is wrong
        expect(errorMessages.some((m) => m.includes("e-mail incorreto") && !m.includes("senha"))).toBe(false);
        expect(errorMessages.some((m) => m.includes("senha incorreta") && !m.includes("e-mail"))).toBe(false);
      });
    });

    it("mensagem de erro NÃO menciona 'senha incorreta' isoladamente", async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "get_client_by_slug") return Promise.resolve({ data: [mockClient], error: null });
        if (fn === "validate_client_dashboard_password") return Promise.resolve({ data: false, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      renderPage();

      fireEvent.change(screen.getByPlaceholderText("seu@email.com"), {
        target: { value: "user@email.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), {
        target: { value: "wrongpassword" },
      });
      fireEvent.click(screen.getByText("Entrar no Dashboard"));

      await waitFor(() => {
        const calls = (toast.error as ReturnType<typeof vi.fn>).mock.calls;
        const errorMessages = calls.map((c) => String(c[0]).toLowerCase());
        expect(errorMessages.some((m) => /senha\s+incorreta/.test(m) && !m.includes("e-mail"))).toBe(false);
      });
    });
  });

  describe("Req 2.5 — redireciona para first-access quando has_temp_password = true", () => {
    it("exibe tela de primeiro acesso quando has_temp_password é true", async () => {
      const clientWithTempPassword = { ...mockClient, has_temp_password: true };

      mockRpc.mockImplementation((fn: string) => {
        if (fn === "get_client_by_slug") return Promise.resolve({ data: [clientWithTempPassword], error: null });
        if (fn === "validate_client_dashboard_password") return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      renderPage();

      fireEvent.change(screen.getByPlaceholderText("seu@email.com"), {
        target: { value: "user@email.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), {
        target: { value: "temppassword" },
      });
      fireEvent.click(screen.getByText("Entrar no Dashboard"));

      await waitFor(() => {
        expect(screen.getByText("Primeiro Acesso")).toBeInTheDocument();
      });
    });

    it("NÃO navega para o dashboard quando has_temp_password é true", async () => {
      const clientWithTempPassword = { ...mockClient, has_temp_password: true };

      mockRpc.mockImplementation((fn: string) => {
        if (fn === "get_client_by_slug") return Promise.resolve({ data: [clientWithTempPassword], error: null });
        if (fn === "validate_client_dashboard_password") return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      renderPage();

      fireEvent.change(screen.getByPlaceholderText("seu@email.com"), {
        target: { value: "user@email.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), {
        target: { value: "temppassword" },
      });
      fireEvent.click(screen.getByText("Entrar no Dashboard"));

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith("/dashboard/test-slug");
      });
    });

    it("navega para o dashboard quando has_temp_password é false", async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "get_client_by_slug") return Promise.resolve({ data: [mockClient], error: null });
        if (fn === "validate_client_dashboard_password") return Promise.resolve({ data: true, error: null });
        if (fn === "validate_support_password") return Promise.resolve({ data: false, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      renderPage();

      fireEvent.change(screen.getByPlaceholderText("seu@email.com"), {
        target: { value: "user@email.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), {
        target: { value: "correctpassword" },
      });
      fireEvent.click(screen.getByText("Entrar no Dashboard"));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard/test-slug");
      });
    });
  });
});
