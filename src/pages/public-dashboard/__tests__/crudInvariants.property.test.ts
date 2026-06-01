import { describe, it, expect } from "vitest";
import fc from "fast-check";

// Funções puras que modelam as operações CRUD (sem I/O)
function insertItem<T extends { id: string }>(list: T[], item: T): T[] {
  return [...list, item];
}

function deleteItem<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((i) => i.id !== id);
}

function toggleStatus<T extends { id: string; status: "active" | "inactive" }>(
  list: T[],
  id: string
): T[] {
  return list.map((i) =>
    i.id === id
      ? { ...i, status: i.status === "active" ? ("inactive" as const) : ("active" as const) }
      : i
  );
}

const itemArb = fc.record({
  id: fc.uuid(),
  status: fc.constantFrom("active" as const, "inactive" as const),
});

describe("Operações CRUD — invariantes de consistência de estado", () => {
  it("Propriedade 4a: inserção aumenta a lista em exatamente +1", () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 0, maxLength: 20 }),
        itemArb,
        (list, newItem) => {
          fc.pre(!list.some((i) => i.id === newItem.id));
          return insertItem(list, newItem).length === list.length + 1;
        }
      )
    );
  });

  it("Propriedade 4b: exclusão diminui a lista em exatamente -1 quando o item existe", () => {
    fc.assert(
      fc.property(fc.array(itemArb, { minLength: 1, maxLength: 20 }), (list) => {
        const target = list[0];
        return deleteItem(list, target.id).length === list.length - 1;
      })
    );
  });

  it("Propriedade 4c: toggle inverte o status do alvo sem afetar outros itens", () => {
    fc.assert(
      fc.property(fc.array(itemArb, { minLength: 1, maxLength: 20 }), (list) => {
        const targetIndex = 0;
        const target = list[targetIndex];
        const result = toggleStatus(list, target.id);
        const toggled = result.find((i) => i.id === target.id)!;
        const othersAfter = result.filter((i) => i.id !== target.id);
        const othersBefore = list.filter((i) => i.id !== target.id);
        return (
          toggled.status !== target.status &&
          JSON.stringify(othersAfter) === JSON.stringify(othersBefore)
        );
      })
    );
  });

  it("Propriedade 4d: inserção preserva todos os itens existentes", () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 0, maxLength: 20 }),
        itemArb,
        (list, newItem) => {
          fc.pre(!list.some((i) => i.id === newItem.id));
          const result = insertItem(list, newItem);
          return list.every((item) => result.some((r) => r.id === item.id));
        }
      )
    );
  });
});
