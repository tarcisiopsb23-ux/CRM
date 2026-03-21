/**
 * Property-based tests for usePermissions.ts
 *
 * Validates: Requirements 8.3
 *
 * Uses vitest + fast-check to verify universal properties of
 * `baselineFor` and `applyHardOverrides` across all valid inputs.
 */
import { describe, it } from "vitest";
import * as fc from "fast-check";
import { baselineFor, applyHardOverrides, resolvePermission, resolveQueryEnabled, resolveUIGate, MODULES } from "../usePermissions";
import type { UserRole, PermissionModule } from "../usePermissions";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const allRoles: UserRole[] = ["owner", "admin", "manager", "member", "viewer"];

const moduleIds: PermissionModule[] = MODULES.map((m) => m.id);

export const arbRole = fc.constantFrom(...allRoles);
export const arbModule = fc.constantFrom(...moduleIds);
export const arbNullableModule = fc.option(arbModule, { nil: null });
export const arbScope = fc.option(
  fc.oneof(fc.constant("reports"), fc.constant("contracts"), fc.constant("payroll"), fc.string({ minLength: 1, maxLength: 20 })),
  { nil: null }
);

// ---------------------------------------------------------------------------
// Describe block
// ---------------------------------------------------------------------------

describe("usePermissions – property tests", () => {
  /**
   * Property 1: Owner e Admin têm acesso total irrestrito
   *
   * Para qualquer módulo e scope, baselineFor("owner", module, scope) e
   * baselineFor("admin", module, scope) retornam
   * { canView: true, canCreate: true, canEdit: true, canDelete: true }.
   *
   * **Validates: Requirements 2.4, 3.2, 6.3, 8.1**
   */
  it("Property 1: baselineFor owner/admin sempre retorna acesso total irrestrito", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MODULES.map((m) => m.id)),
        fc.constantFrom(null, "timeclock", "payroll", "reports", "permissions"),
        (module: PermissionModule, scope: string | null) => {
          const ownerResult = baselineFor("owner", module, scope);
          const adminResult = baselineFor("admin", module, scope);

          return (
            ownerResult.canView === true &&
            ownerResult.canCreate === true &&
            ownerResult.canEdit === true &&
            ownerResult.canDelete === true &&
            adminResult.canView === true &&
            adminResult.canCreate === true &&
            adminResult.canEdit === true &&
            adminResult.canDelete === true
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Data-fetch gate desabilita queries quando canView é false
   *
   * Para qualquer valor de `canView` e `isLoading`, a função
   * `resolveQueryEnabled(canView, isLoading)` deve retornar `false` quando
   * `canView === false` ou `isLoading === true`.
   *
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   */
  it("Property 5: resolveQueryEnabled retorna false quando canView é false ou isLoading é true", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        (canView: boolean, isLoading: boolean) => {
          const enabled = resolveQueryEnabled(canView, isLoading);
          if (!canView || isLoading) {
            return enabled === false;
          }
          return enabled === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Fallback para Baseline_Function quando não há permissão explícita
   *
   * Para qualquer role não-admin/owner e qualquer módulo,
   * `resolvePermission(role, module, [], [])` deve ser igual a `baselineFor(role, module)`.
   *
   * **Validates: Requirements 8.2, 8.5**
   */
  it("Property 6: sem permissão explícita, resultado é igual ao baselineFor", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<UserRole>("member", "manager", "viewer"),
        fc.constantFrom(...MODULES.map((m) => m.id)),
        (role: UserRole, module: PermissionModule) => {
          const baseline = baselineFor(role, module);
          const result = resolvePermission(role, module, [], []);

          return (
            result.canView === baseline.canView &&
            result.canCreate === baseline.canCreate &&
            result.canEdit === baseline.canEdit &&
            result.canDelete === baseline.canDelete
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: UI gate corresponde exatamente ao valor de canView
   *
   * Para qualquer componente migrado, um elemento controlado por `canView` deve estar
   * visível se e somente se `canView === true`.
   * `resolveUIGate(canView)` deve retornar exatamente `canView`.
   *
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
   */
  it("Property 4: resolveUIGate corresponde exatamente ao valor de canView", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (canView: boolean) => {
          return resolveUIGate(canView) === canView;
        }
      ),
      { numRuns: 100 }
    );
  });
});
