/**
 * Unit Tests — AvaliacaoForm
 * Task 13.1: Renderização com os 6 critérios
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvaliacaoForm } from "../AvaliacaoForm";
import { CRITERIOS } from "@/types/avaliacao360";
import type { Avaliacao360, CicloTipo } from "@/types/avaliacao360";

// Mock do hook de submissão
vi.mock("@/hooks/useAvaliacao360", () => ({
  useSubmitAvaliacao: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

// Mock do toast
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockAvaliacao: Avaliacao360 = {
  id: "avaliacao-1",
  ciclo_id: "ciclo-1",
  organization_id: "org-1",
  avaliador_id: "user-1",
  avaliado_id: "user-2",
  tipo: "pares",
  anonimo: true,
  status: "pendente",
  decisao_probatorio: null,
  data_resposta: null,
  created_at: "2025-01-01T00:00:00Z",
};

const cicloTipo: CicloTipo = "360";

describe("AvaliacaoForm", () => {
  it("renderiza os 6 critérios de avaliação", () => {
    render(
      <AvaliacaoForm
        avaliacao={mockAvaliacao}
        cicloTipo={cicloTipo}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    for (const criterio of CRITERIOS) {
      expect(screen.getByText(criterio.label)).toBeInTheDocument();
    }
  });

  it("renderiza botões de nota 1–5 para cada critério", () => {
    render(
      <AvaliacaoForm
        avaliacao={mockAvaliacao}
        cicloTipo={cicloTipo}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    // 6 critérios × 5 botões = 30 botões de nota
    const botoesNota = screen.getAllByRole("button", { name: /^[1-5]$/ });
    expect(botoesNota).toHaveLength(30);
  });

  it("exibe o campo de comentário opcional", () => {
    render(
      <AvaliacaoForm
        avaliacao={mockAvaliacao}
        cicloTipo={cicloTipo}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText(/comentário geral/i)).toBeInTheDocument();
  });

  it("exibe o título correto para tipo 'pares'", () => {
    render(
      <AvaliacaoForm
        avaliacao={mockAvaliacao}
        cicloTipo={cicloTipo}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText("Avaliação de Par")).toBeInTheDocument();
  });

  it("exibe o título correto para tipo 'autoavaliacao'", () => {
    render(
      <AvaliacaoForm
        avaliacao={{ ...mockAvaliacao, tipo: "autoavaliacao" }}
        cicloTipo={cicloTipo}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText("Autoavaliação")).toBeInTheDocument();
  });

  it("selecionar uma nota destaca o botão correspondente", () => {
    render(
      <AvaliacaoForm
        avaliacao={mockAvaliacao}
        cicloTipo={cicloTipo}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    // Clica no botão "3" do primeiro critério
    const botoesNota = screen.getAllByRole("button", { name: "3" });
    fireEvent.click(botoesNota[0]);

    // O botão clicado deve ter a classe de selecionado
    expect(botoesNota[0].className).toContain("bg-primary");
  });

  it("não fecha o dialog quando open=false", () => {
    const { queryByText } = render(
      <AvaliacaoForm
        avaliacao={mockAvaliacao}
        cicloTipo={cicloTipo}
        open={false}
        onOpenChange={vi.fn()}
      />
    );

    // Quando open=false, o conteúdo do dialog não é renderizado
    expect(queryByText("Avaliação de Par")).not.toBeInTheDocument();
  });
});
