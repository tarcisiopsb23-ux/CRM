/**
 * Unit Tests — ResultadoCard
 * Task 13.3: Exibição do feedback_final quando disponível
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultadoCard } from "../ResultadoCard";
import type { ResultadoFinal360 } from "@/types/avaliacao360";

vi.mock("@/hooks/useAvaliacao360", () => ({
  useSaveFeedbackFinal: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { id: "admin-1", role: "admin" },
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseResultado: ResultadoFinal360 = {
  id: "resultado-1",
  ciclo_id: "ciclo-1",
  organization_id: "org-1",
  avaliado_id: "user-1",
  media_geral: 4.2,
  media_autoavaliacao: 4.5,
  media_pares: 4.0,
  media_gestor: 4.1,
  media_liderado: null,
  media_comportamental: 4.3,
  media_performance: 4.1,
  media_desenvolvimento: 4.0,
  score_360: 4.2,
  score_final: 4.15,
  classificacao: "Alta Performance",
  feedback_final: null,
  feedback_updated_at: null,
  feedback_updated_by: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

describe("ResultadoCard", () => {
  it("exibe 'Nenhum feedback registrado' quando feedback_final é null", () => {
    render(
      <ResultadoCard
        resultado={baseResultado}
        canEditFeedback={false}
      />
    );

    expect(screen.getByText(/nenhum feedback registrado/i)).toBeInTheDocument();
  });

  it("exibe o texto do feedback_final quando disponível", () => {
    const resultado = {
      ...baseResultado,
      feedback_final: "Excelente desempenho no trimestre.",
    };

    render(
      <ResultadoCard
        resultado={resultado}
        canEditFeedback={false}
      />
    );

    expect(screen.getByText("Excelente desempenho no trimestre.")).toBeInTheDocument();
  });

  it("exibe as médias por tipo", () => {
    render(
      <ResultadoCard
        resultado={baseResultado}
        canEditFeedback={false}
      />
    );

    expect(screen.getByText("Média Geral")).toBeInTheDocument();
    expect(screen.getByText("Autoavaliação")).toBeInTheDocument();
    expect(screen.getByText("Pares")).toBeInTheDocument();
    expect(screen.getByText("Gestor")).toBeInTheDocument();
  });

  it("exibe o score final", () => {
    render(
      <ResultadoCard
        resultado={baseResultado}
        canEditFeedback={false}
      />
    );

    expect(screen.getByText("Score Final")).toBeInTheDocument();
    expect(screen.getByText("4.15")).toBeInTheDocument();
  });

  it("exibe o gap quando ambas as médias estão disponíveis", () => {
    render(
      <ResultadoCard
        resultado={baseResultado}
        canEditFeedback={false}
      />
    );

    // gap = 4.5 - 4.2 = 0.30
    expect(screen.getByText(/gap/i)).toBeInTheDocument();
    expect(screen.getByText("+0.30")).toBeInTheDocument();
  });

  it("exibe o nome do perfil quando profileName é fornecido", () => {
    render(
      <ResultadoCard
        resultado={baseResultado}
        canEditFeedback={false}
        profileName="Maria Souza"
      />
    );

    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
  });

  it("exibe botão Editar quando canEditFeedback=true", () => {
    render(
      <ResultadoCard
        resultado={baseResultado}
        canEditFeedback={true}
      />
    );

    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
  });

  it("não exibe botão Editar quando canEditFeedback=false", () => {
    render(
      <ResultadoCard
        resultado={baseResultado}
        canEditFeedback={false}
      />
    );

    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
  });
});
