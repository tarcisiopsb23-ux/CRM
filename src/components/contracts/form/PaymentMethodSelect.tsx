/**
 * PaymentMethodSelect
 *
 * Select de forma de pagamento para cadastro de contratos.
 * Opções fixas: Boleto, Cartão de Crédito, PIX.
 *
 * Nota: a lógica de cobrança automatizada (via webhook) fica no botão
 * de recebimento dos lançamentos financeiros, não aqui.
 */
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const PAYMENT_METHOD_OPTIONS = [
  { value: "boleto",  label: "Boleto" },
  { value: "cartao",  label: "Cartão de Crédito" },
  { value: "pix",     label: "PIX" },
] as const;

export type PaymentMethodValue = typeof PAYMENT_METHOD_OPTIONS[number]["value"];

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function PaymentMethodSelect({
  value,
  onValueChange,
  disabled = false,
  placeholder = "Selecione a forma de pagamento...",
}: Props) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {PAYMENT_METHOD_OPTIONS.map(({ value: v, label }) => (
          <SelectItem key={v} value={v}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
