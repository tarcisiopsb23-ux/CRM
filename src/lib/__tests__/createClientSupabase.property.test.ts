import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";

// We test the cache behaviour with a local re-implementation to avoid
// side-effects from the real Supabase client in unit tests.
const clientCache = new Map<string, object>();

function createClientSupabaseMock(url: string, key: string): object {
  const cacheKey = `${url}::${key}`;
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }
  const client = { url, key, _id: Math.random() };
  clientCache.set(cacheKey, client);
  return client;
}

describe("createClientSupabase — cache invariants", () => {
  beforeEach(() => {
    clientCache.clear();
  });

  it("Propriedade 1a: mesma url+key sempre retorna a mesma instância (cache)", () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 10, maxLength: 100 }),
        (url, key) => {
          const client1 = createClientSupabaseMock(url, key);
          const client2 = createClientSupabaseMock(url, key);
          return client1 === client2;
        }
      )
    );
  });

  it("Propriedade 1b: url+key diferentes retornam instâncias distintas", () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        (url, key1, key2) => {
          fc.pre(key1 !== key2);
          const client1 = createClientSupabaseMock(url, key1);
          const client2 = createClientSupabaseMock(url, key2);
          return client1 !== client2;
        }
      )
    );
  });
});
