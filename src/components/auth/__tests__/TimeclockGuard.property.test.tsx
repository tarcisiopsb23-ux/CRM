/**
 * Property-based tests for TimeclockGuard component
 *
 * Property 3: Isenção do TimeclockGuard via permissão dinâmica
 *
 * Para qualquer usuário com usePermissionForScope("team", "timeclock").canView === true,
 * o TimeclockGuard não deve chamar navigate("/timeclock/entry").
 *
 * **Validates: Requirements 3.1, 3.3**
 */
import { describe, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mock navigate — captured per test
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------------------
// Mock usePermissionForScope — controlled per test
// ---------------------------------------------------------------------------

const mockUsePermissionForScope = vi.fn();

vi.mock("@/hooks/usePermissions", () => ({
  usePermissionForScope: (module: string, scope: string) =>
    mockUsePermissionForScope(module, scope),
}));

// ---------------------------------------------------------------------------
// Mock useTimeClockState — simulates a user without a timeclock entry
// ---------------------------------------------------------------------------

vi.mock("@/hooks/useTimeClock", () => ({
  useTimeClockState: () => ({
    data: { has_entry: false, has_final_exit: false },
    isLoading: false,
  }),
}));

// ---------------------------------------------------------------------------
// Mock useAuth — provides a minimal profile
// ---------------------------------------------------------------------------

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: {
      id: "user-1",
      organization_id: "org-1",
      role: "member",
    },
  }),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks are set up
// ---------------------------------------------------------------------------

import { TimeclockGuard } from "../TimeclockGuard";

// ---------------------------------------------------------------------------
// Helper: render TimeclockGuard at a given route
// ---------------------------------------------------------------------------

function renderGuard(route = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TimeclockGuard>
        <div>Conteúdo protegido</div>
      </TimeclockGuard>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Describe block
// ---------------------------------------------------------------------------

describe("TimeclockGuard – property tests", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUsePermissionForScope.mockReset();
  });

  /**
   * Property 3: Isenção do TimeclockGuard via permissão dinâmica
   *
   * Para qualquer valor de canView:
   * - canView: true  → navigate("/timeclock/entry") NÃO deve ser chamado
   * - canView: false → navigate("/timeclock/entry") DEVE ser chamado (usuário sem entrada)
   *
   * **Validates: Requirements 3.1, 3.3**
   */
  it("Property 3: TimeclockGuard não redireciona quando canView é true, e redireciona quando canView é false", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (canView) => {
          mockNavigate.mockReset();
          mockUsePermissionForScope.mockReturnValue({
            canView,
            canCreate: false,
            canEdit: false,
            canDelete: false,
            isAdminOrOwner: false,
            isLoading: false,
          });

          const { unmount } = renderGuard("/dashboard");

          const navigateCalls = mockNavigate.mock.calls;
          const calledWithEntry = navigateCalls.some(
            (args) => args[0] === "/timeclock/entry"
          );

          unmount();

          if (canView) {
            // Exempt user — must NOT navigate to /timeclock/entry
            return !calledWithEntry;
          } else {
            // Non-exempt user without timeclock entry — MUST navigate to /timeclock/entry
            return calledWithEntry;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
