import { describe, it } from "vitest";
import fc from "fast-check";

function validateScheduleForm(values: {
  artist: string;
  date: string;
  time: string;
}): boolean {
  return (
    values.artist.trim().length > 0 &&
    values.date.trim().length > 0 &&
    values.time.trim().length > 0
  );
}

function validateNoticeForm(values: {
  message: string;
  priority: string;
}): boolean {
  return values.message.trim().length > 0 && values.priority.trim().length > 0;
}

describe("Validação de formulários — campos obrigatórios", () => {
  it("Propriedade 5a: formulário de agenda inválido quando artista está vazio", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (date, time) => {
          return validateScheduleForm({ artist: "", date, time }) === false;
        }
      )
    );
  });

  it("Propriedade 5b: formulário de agenda inválido quando data está vazia", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (artist, time) => {
          return validateScheduleForm({ artist, date: "", time }) === false;
        }
      )
    );
  });

  it("Propriedade 5c: formulário de agenda inválido quando horário está vazio", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (artist, date) => {
          return validateScheduleForm({ artist, date, time: "" }) === false;
        }
      )
    );
  });

  it("Propriedade 5d: formulário de agenda válido quando todos os campos obrigatórios estão preenchidos", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (artist, date, time) => {
          return validateScheduleForm({ artist, date, time }) === true;
        }
      )
    );
  });

  it("Propriedade 5e: formulário de aviso inválido quando mensagem está vazia", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("alta", "média", "baixa"),
        (priority) => {
          return validateNoticeForm({ message: "", priority }) === false;
        }
      )
    );
  });

  it("Propriedade 5f: formulário de aviso inválido quando prioridade está vazia", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (message) => {
          return validateNoticeForm({ message, priority: "" }) === false;
        }
      )
    );
  });
});
