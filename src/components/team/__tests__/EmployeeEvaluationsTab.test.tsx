/**
 * Unit Tests — EmployeeEvaluationsTab
 * Task 13.2: Exibição do histórico read-only (seção 360 e seção técnica)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeEvaluationsTab } from "../EmployeeEvaluationsTab";
import type { ProfileRow } from "@/hooks/useProfiles";

// Mock dos hooks
vi.mock("@/hooks/useAvaliacao360", () => ({
  useResultadoDoColaborador: vi.fn(),
}));

vi.mock("@/hooks/useAvaliacoesTecnicas", () => ({
  useAvaliacoesTecnicas: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useResultadoDoColaborador } from "@/hooks/useAvaliacao360";
import { useAvaliacoesTecnicas } from "@/hooks/useAvaliacoesTecnicas";
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

const mockResultado = {
  id: "resultado-1",
  ciclo_id: "ciclo-1",
  organization_id: "org-1",
  avaliado_id: "user-1",
  media_geral: 4.2,
  media_autoavaliacao: 4.5,
  media_pares: 4.0,
  media_gestor: 4.1,
  media_liderado: null,
  score_final: 4.15,
  feedback_final: null,
  feedback_updated_at: null,
  feedback_updated_by: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ciclo: { nome: "Ciclo Q1 2025", data_inicio: "2025-01-01", data_fim: "2025-03-31" },
};

const mockAvaliacaoTecnica = {
  id: "tecnica-1",
  organization_id: "org-1",
  colaborador_id: "user-1",
  avaliador_id: "admin-1",
  titulo: "Avaliação de Competências Q1",
  data: "2025-03-15",
  nota_geral: 4,
  criterios: [{ nome: "Domínio técnico", nota: 4, comentario: null }],
  observacoes: "Bom desempenho geral.",
  created_at: "2025-03-15T00:00:00Z",
};

describe("EmployeeEvaluationsTab", () => {
  describe("Seção Avaliações 360", () => {
    it("exibe mensagem vazia quando não há resultados 360", () => {
      vi.mocked(useResultadoDoColaborador).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAvaliacoesTecnicas).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAuth).mockReturnValue({ profile: { ...mockProfile, role: "member" } } as any);

      render(<EmployeeEvaluationsTab profile={mockProfile} />);

      expect(screen.getByText(/nenhum resultado de avaliação 360/i)).toBeInTheDocument();
    });

    it("exibe o nome do ciclo e score quando há resultados 360", () => {
      vi.mocked(useResultadoDoColaborador).mockReturnValue({ data: [mockResultado], isLoading: false } as any);
      vi.mocked(useAvaliacoesTecnicas).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAuth).mockReturnValue({ profile: { ...mockProfile, role: "member" } } as any);

      render(<EmployeeEvaluationsTab profile={mockProfile} />);

      expect(screen.getByText("Ciclo Q1 2025")).toBeInTheDocument();
      expect(screen.getByText(/score: 4\.15/i)).toBeInTheDocument();
    });

    it("exibe médias por tipo (Geral, Auto, Pares, Gestor)", () => {
      vi.mocked(useResultadoDoColaborador).mockReturnValue({ data: [mockResultado], isLoading: false } as any);
      vi.mocked(useAvaliacoesTecnicas).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAuth).mockReturnValue({ profile: { ...mockProfile, role: "member" } } as any);

      render(<EmployeeEvaluationsTab profile={mockProfile} />);

      expect(screen.getByText(/4\.20/)).toBeInTheDocument(); // media_geral
      expect(screen.getByText(/4\.50/)).toBeInTheDocument(); // media_autoavaliacao
    });
  });

  describe("Seção Avaliações Técnicas", () => {
    it("exibe mensagem vazia quando não há avaliações técnicas", () => {
      vi.mocked(useResultadoDoColaborador).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAvaliacoesTecnicas).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAuth).mockReturnValue({ profile: { ...mockProfile, role: "member" } } as any);

      render(<EmployeeEvaluationsTab profile={mockProfile} />);

      expect(screen.getByText(/nenhuma avaliação técnica registrada/i)).toBeInTheDocument();
    });

    it("exibe título e nota da avaliação técnica", () => {
      vi.mocked(useResultadoDoColaborador).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAvaliacoesTecnicas).mockReturnValue({ data: [mockAvaliacaoTecnica], isLoading: false } as any);
      vi.mocked(useAuth).mockReturnValue({ profile: { ...mockProfile, role: "member" } } as any);

      render(<EmployeeEvaluationsTab profile={mockProfile} />);

      expect(screen.getByText("Avaliação de Competências Q1")).toBeInTheDocument();
      expect(screen.getByText("4/5")).toBeInTheDocument();
    });

    it("exibe critérios técnicos quando presentes", () => {
      vi.mocked(useResultadoDoColaborador).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAvaliacoesTecnicas).mockReturnValue({ data: [mockAvaliacaoTecnica], isLoading: false } as any);
      vi.mocked(useAuth).mockReturnValue({ profile: { ...mockProfile, role: "member" } } as any);

      render(<EmployeeEvaluationsTab profile={mockProfile} />);

      expect(screen.getByText("Domínio técnico")).toBeInTheDocument();
    });

    it("exibe observações quando presentes", () => {
      vi.mocked(useResultadoDoColaborador).mockReturnValue({ data: [], isLoading: false } as any);
      vi.mocked(useAvaliacoesTecnicas).mockReturnValue({ data: [mockAvaliacaoTecnica], isLoading: false } as any);
      vi.mocked(useAuth).mockReturnValue({ profile: { ...mockProfile, role: "member" } } as any);

      render(<EmployeeEvaluationsTab profile={mockProfile} />);

      expect(screen.getByText("Bom desempenho geral.")).toBeInTheDocument();
    });
  });
});
