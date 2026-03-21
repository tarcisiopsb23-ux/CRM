/**
 * Property-based tests for ModuleGuard component
 *
 * Property 2: Route guard usa permissão dinâmica
 *
 * Para qualquer rota mapeada em ROUTE_TO_MODULE, usuário com canView: false
 * recebe tela de acesso negado; com canView: true vê o conteúdo.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */
import { describe, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import * as fc from "fast-check";
import { ModuleGuard } from "../ModuleGuard";

// ---------------------------------------------------------------------------
// Mock useModulePermission — controlled per test via mockReturnValue
// ---------------------------------------------------------------------------

const mockUseModulePermission = vi.fn();

vi.mock("@/hooks/usePermissions", () => ({
  getModuleForRoute: (pathname: string) => {
    const ROUTE_TO_MODULE: Record<string, string> = {
      "/": "dashboard",
      "/kanban": "kanban",
      "/leads": "crm",
      "/clients": "clients",
      "/financial": "financial",
      "/team": "team",
      "/settings": "settings",
      "/reports": "reports",
      "/audit": "audit",
    };
    if (pathname === "/") return "dashboard";
    const exact = ROUTE_TO_MODULE[pathname];
    if (exact) return exact;
    for (const [route, mod] of Object.entries(ROUTE_TO_MODULE)) {
      if (route === "/") continue;
      if (pathname.startsWith(route)) return mod;
    }
    return null;
  },
  useModulePermission: (module: string | null) => mockUseModulePermission(module),
}));

// ---------------------------------------------------------------------------
// Helper: render ModuleGuard at a given route
// ---------------------------------------------------------------------------

function renderModuleGuard(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route element={<ModuleGuard />}>
          <Route path="*" element={<div>Conteúdo da página</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Known routes that map to a module (non-null)
// ---------------------------------------------------------------------------

const KNOWN_ROUTES = ["/team", "/settings", "/audit", "/financial", "/reports"];

// ---------------------------------------------------------------------------
// Describe block
// ---------------------------------------------------------------------------

describe("ModuleGuard – property tests", () => {
  beforeEach(() => {
    mockUseModulePermission.mockReset();
  });

  /**
   * Property 2: Route guard usa permissão dinâmica
   *
   * Para qualquer rota mapeada e qualquer valor de canView:
   * - canView: false → renderiza tela de acesso negado (não renderiza children)
   * - canView: true  → renderiza children (não renderiza tela de acesso negado)
   *
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  it("Property 2: ModuleGuard renderiza acesso negado quando canView é false, e conteúdo quando canView é true", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_ROUTES),
        fc.boolean(),
        (route, canView) => {
          mockUseModulePermission.mockReturnValue({
            canView,
            canCreate: canView,
            canEdit: canView,
            canDelete: canView,
            isAdminOrOwner: false,
          });

          const { unmount } = renderModuleGuard(route);

          if (!canView) {
            // Should show access denied screen
            const denied = screen.queryByText("Acesso negado");
            const content = screen.queryByText("Conteúdo da página");
            unmount();
            return denied !== null && content === null;
          } else {
            // Should show page content
            const denied = screen.queryByText("Acesso negado");
            const content = screen.queryByText("Conteúdo da página");
            unmount();
            return content !== null && denied === null;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
