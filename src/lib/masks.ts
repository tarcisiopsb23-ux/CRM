/**
 * Funções de máscara para campos de entrada.
 * Uso: import { applyMask, MASKS } from "@/lib/masks"
 */

export type MaskType =
  | "cpf"           // 000.000.000-00
  | "cnpj"          // 00.000.000/0000-00
  | "cpf_cnpj"      // detecta automaticamente pelo tamanho
  | "phone"         // (00) 00000-0000 ou (00) 0000-0000
  | "cep"           // 00000-000
  | "date"          // 00/00/0000
  | "currency"      // R$ 1.234,56
  | "card"          // 0000 0000 0000 0000
  | "card_expiry"   // 00/00
  | "card_cvv"      // 000 ou 0000
  | "rg"            // 00.000.000-0
  | "time"          // 00:00
  | "percent";      // 00,00%

/** Remove tudo que não for dígito */
export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

export function applyMask(value: string, mask: MaskType): string {
  const d = onlyDigits(value);

  switch (mask) {
    case "cpf":
      return d
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

    case "cnpj":
      return d
        .slice(0, 14)
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d{1,2})$/, "$1-$2");

    case "cpf_cnpj":
      return d.length <= 11 ? applyMask(value, "cpf") : applyMask(value, "cnpj");

    case "phone": {
      const p = d.slice(0, 11);
      if (p.length <= 10) {
        return p
          .replace(/(\d{2})(\d)/, "($1) $2")
          .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
      }
      return p
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
    }

    case "cep":
      return d.slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");

    case "date":
      return d
        .slice(0, 8)
        .replace(/(\d{2})(\d)/, "$1/$2")
        .replace(/(\d{2})(\d)/, "$1/$2");

    case "currency": {
      const cents = d.slice(0, 13);
      const num = parseInt(cents || "0", 10) / 100;
      return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    case "card":
      return d.slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ").trim();

    case "card_expiry":
      return d.slice(0, 4).replace(/(\d{2})(\d{1,2})$/, "$1/$2");

    case "card_cvv":
      return d.slice(0, 4);

    case "rg":
      return d
        .slice(0, 9)
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1})$/, "$1-$2");

    case "time":
      return d.slice(0, 4).replace(/(\d{2})(\d{1,2})$/, "$1:$2");

    case "percent":
      return d.slice(0, 5).replace(/(\d{1,3})(\d{2})$/, "$1,$2") + "%";

    default:
      return value;
  }
}

/** Remove a máscara e retorna apenas os dígitos (ou valor limpo) */
export function removeMask(value: string, mask: MaskType): string {
  if (mask === "currency") {
    return value.replace(/[^\d,]/g, "").replace(",", ".");
  }
  return onlyDigits(value);
}
