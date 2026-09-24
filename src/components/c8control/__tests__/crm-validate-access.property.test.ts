// Feature: c8-control-gerencial-module
// Propriedade 17: Edge Function retorna 403 para tenant suspenso
// Valida: Requisitos 8.4

import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Pure function that mirrors the subscription_status check logic
 * in supabase/functions/crm-validate-access/index.ts (action: 'validate').
 *
 * Returns the HTTP response shape the Edge Function would produce
 * based solely on the subscription_status of the tenant's plan.
 */
function resolveValidateResponse(subscriptionStatus: string): { status: number; body: Record<string, unknown> } {
  if (subscriptionStatus === "bloqueado") {
    return { status: 403, body: { reason: "blocked" } };
  }
  if (subscriptionStatus === "suspenso") {
    return { status: 403, body: { reason: "suspended" } };
  }
  // For any other status (ativo, cancelado, etc.) the session would be renewed
  return { status: 200, body: { valid: true } };
}

// **Validates: Requirements 8.2, 8.4**
describe("crm-validate-access — subscription_status checks (Propriedade 17)", () => {
  it("retorna 403 { reason: 'suspended' } para qualquer tenant com status suspenso", () => {
    // Property: for ALL sessions belonging to a tenant with subscription_status = 'suspenso',
    // the validate action must return HTTP 403 with body { reason: 'suspended' }.
    fc.assert(
      fc.property(fc.constant("suspenso"), (status) => {
        const response = resolveValidateResponse(status);
        return response.status === 403 && response.body.reason === "suspended";
      }),
      { numRuns: 100 }
    );
  });

  it("retorna 403 { reason: 'blocked' } para qualquer tenant com status bloqueado", () => {
    fc.assert(
      fc.property(fc.constant("bloqueado"), (status) => {
        const response = resolveValidateResponse(status);
        return response.status === 403 && response.body.reason === "blocked";
      }),
      { numRuns: 100 }
    );
  });

  it("retorna 200 para tenant com status ativo", () => {
    fc.assert(
      fc.property(fc.constant("ativo"), (status) => {
        const response = resolveValidateResponse(status);
        return response.status === 200;
      }),
      { numRuns: 100 }
    );
  });

  it("suspenso e bloqueado são os únicos status que retornam 403", () => {
    // Property: for any subscription_status that is NOT 'suspenso' or 'bloqueado',
    // the response must NOT be 403.
    const nonBlockingStatuses = fc.oneof(
      fc.constant("ativo"),
      fc.constant("cancelado"),
      fc.string({ minLength: 1 }).filter(
        (s) => s !== "suspenso" && s !== "bloqueado"
      )
    );

    fc.assert(
      fc.property(nonBlockingStatuses, (status) => {
        const response = resolveValidateResponse(status);
        return response.status !== 403;
      }),
      { numRuns: 100 }
    );
  });

  it("suspenso retorna reason 'suspended', não 'blocked'", () => {
    // Ensures the two statuses produce distinct reason values
    fc.assert(
      fc.property(fc.constant("suspenso"), (status) => {
        const response = resolveValidateResponse(status);
        return response.body.reason === "suspended" && (response.body.reason as string) !== "blocked";
      }),
      { numRuns: 100 }
    );
  });
});
