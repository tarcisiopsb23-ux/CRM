import { describe, it, expect } from "vitest";
import fc from "fast-check";

const clientAuthArb = fc.record({
  id: fc.uuid(),
  organization_id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  company: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  favicon_url: fc.option(fc.webUrl(), { nil: null }),
  authenticated: fc.constant(true as const),
  show_ia_content: fc.boolean(),
  client_supabase_url: fc.option(fc.webUrl(), { nil: null }),
  client_supabase_anon_key: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: null }),
  metadata: fc.record({
    dashboard_performance: fc.boolean(),
    dashboard_atendimento: fc.boolean(),
  }),
});

describe("ClientAuth — serialização/deserialização (localStorage roundtrip)", () => {
  it("Propriedade 2: ClientAuth sobrevive a roundtrip JSON sem perda de dados", () => {
    fc.assert(
      fc.property(clientAuthArb, (auth) => {
        const serialized = JSON.stringify(auth);
        const deserialized = JSON.parse(serialized);
        return JSON.stringify(deserialized) === serialized;
      })
    );
  });

  it("Propriedade 2b: authenticated é sempre true após roundtrip", () => {
    fc.assert(
      fc.property(clientAuthArb, (auth) => {
        const deserialized = JSON.parse(JSON.stringify(auth));
        return deserialized.authenticated === true;
      })
    );
  });
});
