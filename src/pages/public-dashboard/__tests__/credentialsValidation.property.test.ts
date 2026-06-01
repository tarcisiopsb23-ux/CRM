import { describe, it } from "vitest";
import fc from "fast-check";

function validateIaContentConfig(
  showIaContent: boolean,
  url: string,
  key: string
): boolean {
  if (!showIaContent) return true;
  return url.trim().length > 0 && key.trim().length > 0;
}

describe("Validação de credenciais IA — ClientIntegrationsTab", () => {
  it("Propriedade 6a: show_ia_content=true com URL vazia sempre falha na validação", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 0 }),
        fc.string({ minLength: 0 }),
        (emptyUrl, key) => {
          return validateIaContentConfig(true, emptyUrl, key) === false;
        }
      )
    );
  });

  it("Propriedade 6b: show_ia_content=true com chave vazia sempre falha na validação", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 0, maxLength: 0 }),
        (url, emptyKey) => {
          return validateIaContentConfig(true, url, emptyKey) === false;
        }
      )
    );
  });

  it("Propriedade 6c: show_ia_content=false sempre passa independente das credenciais", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (url, key) => {
          return validateIaContentConfig(false, url, key) === true;
        }
      )
    );
  });

  it("Propriedade 6d: show_ia_content=true com ambas credenciais preenchidas sempre passa", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (url, key) => {
          return validateIaContentConfig(true, url, key) === true;
        }
      )
    );
  });
});
