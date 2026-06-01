import { describe, it, expect } from "vitest";
import fc from "fast-check";

const IA_ROUTES = ["/agenda", "/promocoes", "/sugestoes", "/eventos", "/avisos", "/configuracoes"];
const NON_IA_ROUTES = ["", "/performance", "/atendimento"];

function shouldRedirectIaGuard(pathname: string, showIaContent: boolean): boolean {
  const isIaRoute = IA_ROUTES.some((r) => pathname.endsWith(r));
  return isIaRoute && !showIaContent;
}

describe("Guard de rota IA — consistência com show_ia_content", () => {
  it("Propriedade 3a: rota IA com show_ia_content=false SEMPRE redireciona", () => {
    fc.assert(
      fc.property(fc.constantFrom(...IA_ROUTES), (route) => {
        const pathname = `/public/dashboard/test-slug${route}`;
        return shouldRedirectIaGuard(pathname, false) === true;
      })
    );
  });

  it("Propriedade 3b: rota IA com show_ia_content=true NUNCA redireciona pelo guard IA", () => {
    fc.assert(
      fc.property(fc.constantFrom(...IA_ROUTES), (route) => {
        const pathname = `/public/dashboard/test-slug${route}`;
        return shouldRedirectIaGuard(pathname, true) === false;
      })
    );
  });

  it("Propriedade 3c: rota não-IA NUNCA redireciona independente de show_ia_content", () => {
    fc.assert(
      fc.property(fc.constantFrom(...NON_IA_ROUTES), fc.boolean(), (route, showIaContent) => {
        const pathname = `/public/dashboard/test-slug${route}`;
        return shouldRedirectIaGuard(pathname, showIaContent) === false;
      })
    );
  });
});
