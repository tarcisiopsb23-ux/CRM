/**
 * Unit Tests — AvaliacaoTecnicaDialog
 * Task 13.5: Validação de formulário (título vazio, nota inválida)
 * Task 13.6: Ocultação do botão para roles não autorizados
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AvaliacaoTecnicaDialog } from "../AvaliacaoTecnicaDialog";
import { EmployeeEvaluationsTab } from "../EmployeeEvaluationsTab";
import type { ProfileRow } from "@/hooks/useProfiles";

// Mocks
vi.mock("@/hooks/useAvaliacoesTecnicas", () => ({
  useCreateAvaliacaoTecnica: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useAvaliacoesTecnicas: vi.fn(),
}));

vi.mock("@/hooks/useAvaliacao360", () => ({
  useResultadoDoColaborador: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

import { useAvaliacoesTecnicas } from "@/hooks/useAvaliacoesTecnicas";
import { useResultadoDoColaborador } from "@/hooks/useAvaliacao360";
import { useAuth } from "@/contexts/AuthContext";

const mockProfile: ProfileRow = {
  id: "user-1",
  full_name: "João Silva",
  email: "joao@example.com",
  role: "member",
  organization_id: "org-1",
  avatar_url: null,
  phone: null,
  is_active: true,
  metadata: {},
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  commission_rate: 0,
  bonus_rate_120: 0,
  bonus_rate_135: 0,
  bonus_rate_150: 0,
  is_board_member: false,
};

describe("AvaliacaoTecnicaDialog — Validação de formulário", () => {
  it("exibe erro quando título está vazio ao submeter", async () => {
    render(
      <AvaliacaoTecnicaDialog
        open={true}
        onOpenChange={vi.fn()}
        colaboradorId="user-1"
        organizationId="org-1"
      />
    );

    // Clica em Salvar sem preencher nada
    fireEvent.click(screen.getByRole("button", { name: /salvar avaliação/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/título/i)
      );
    });
  });

  it("exibe erro quando título é apenas whitespace", async () => {
    render(
      <AvaliacaoTecnicaDialog
        open={true}
        onOpenChange={vi.fn()}
        colaboradorId="user-1"
        organizationId="org-1"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/avaliação de competências/i), {
      target: { value: "   " },
    });

    fireEvent.click(screen.getByRole("button", { name: /salvar avaliação/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/título/i)
      );
    });
  });

  it("exibe erro quando data não está preenchida", async () => {
    render(
      <AvaliacaoTecnicaDialog
        open={true}
        onOpenChange={vi.fn()}
        colaboradorId="user-1"
        organizationId="org-1"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/avaliação de competências/i), {
      target: { value: "Avaliação Q1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /salvar avaliação/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/data/i)
      );
    });
  });

  it("exibe erro quando nota_geral não está selecionada", async () => {
    render(
      <AvaliacaoTecnicaDialog
        open={true}
        onOpenChange={vi.fn()}
        colaboradorId="user-1"
        organizationId="org-1"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/avaliação de competências/i), {
      target: { value: "Avaliação Q1" },
    });

    // Preenche a data
    const dateInput = screen.getByDisplayValue("") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-03-15" } });

    fireEvent.click(screen.getByRole("button", { name: /salvar avaliação/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/nota geral/i)
      );
    });
  });

  it("renderiza os botões de nota 1–5 para nota_geral", () => {
    render(
      <AvaliacaoTecnicaDialog
        open={true}
        onOpenChange={vi.fn()}
        colaboradorId="user-1"
        organizationId="org-1"
      />
    );

    const botoesNota = screen.getAllByRole("button", { name: /^[1-5]$/ });
    expect(botoesNota).toHaveLength(5);
  });

  it("selecionar nota_geral destaca o botão", () => {
    render(
      <AvaliacaoTecnicaDialog
        open={true}
        onOpenChange={vi.fn()}
        colaboradorId="user-1"
        organizationId="org-1"
      />
    );

    const botao4 = screen.getByRole("button", { name: "4" });
    fireEvent.click(botao4);

    expect(botao4.className).toContain("bg-primary");
  });
});

describe("EmployeeEvaluationsTab — Ocultação do botão por role (Task 13.6)", () => {
  beforeEach(() => {
    vi.mocked(useResultadoDoColaborador).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useAvaliacoesTecnicas).mockReturnValue({ data: [], isLoading: false } as any);
  });

  it("exibe o botão '+ Avaliação Técnica' para role admin", () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { ...mockProfile, role: "admin" },
    } as any);

    render(<EmployeeEvaluationsTab profile={mockProfile} />);

    expect(screen.getByRole("button", { name: /avaliação técnica/i })).toBeInTheDocument();
  });

  it("exibe o botão '+ Avaliação Técnica' para role owner", () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { ...mockProfile, role: "owner" },
    } as any);

    render(<EmployeeEvaluationsTab profile={mockProfile} />);

    expect(screen.getByRole("button", { name: /avaliação técnica/i })).toBeInTheDocument();
  });

  it("oculta o botão para role manager", () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { ...mockProfile, role: "manager" },
    } as any);

    render(<EmployeeEvaluationsTab profile={mockProfile} />);

    expect(screen.queryByRole("button", { name: /avaliação técnica/i })).not.toBeInTheDocument();
  });

  it("oculta o botão para role member", () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { ...mockProfile, role: "member" },
    } as any);

    render(<EmployeeEvaluationsTab profile={mockProfile} />);

    expect(screen.queryByRole("button", { name: /avaliação técnica/i })).not.toBeInTheDocument();
  });

  it("oculta o botão para role viewer", () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { ...mockProfile, role: "viewer" },
    } as any);

    render(<EmployeeEvaluationsTab profile={mockProfile} />);

    expect(screen.queryByRole("button", { name: /avaliação técnica/i })).not.toBeInTheDocument();
  });
});
