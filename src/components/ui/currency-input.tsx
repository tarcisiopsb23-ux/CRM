/**
 * CurrencyInput
 * Input de valor monetário com máscara BRL (R$ 1.234,56).
 * - Exibe o valor formatado com separador de milhar e 2 casas decimais
 * - Armazena internamente como string numérica (sem formatação)
 * - `value` e `onChange` trabalham com número puro (ex: 3000.5)
 */
import { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string | number;
  onValueChange?: (raw: string) => void; // string numérica, ex: "3000.50"
  onChange?: (raw: string) => void;       // alias de onValueChange
  placeholder?: string;
  className?: string;
}

const fmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Converte string BRL formatada → número puro */
function parseFormatted(s: string): string {
  // Remove tudo exceto dígitos e vírgula
  const cleaned = s.replace(/[^\d,]/g, "");
  // Troca vírgula por ponto
  return cleaned.replace(",", ".");
}

export function CurrencyInput({
  value,
  onValueChange,
  onChange,
  placeholder = "0,00",
  className,
  ...props
}: CurrencyInputProps) {
  // Suporta tanto onValueChange quanto onChange como alias
  const emit = (v: string) => {
    onValueChange?.(v);
    onChange?.(v);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const [display, setDisplay] = useState("");

  // Sincroniza display quando value muda externamente
  useEffect(() => {
    const num = Number(value);
    if (!isNaN(num) && value !== "" && value !== null && value !== undefined) {
      setDisplay(fmt.format(num));
    } else {
      setDisplay("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Mantém apenas dígitos e vírgula
    const digitsOnly = raw.replace(/[^\d,]/g, "");
    setDisplay(digitsOnly);
  };

  const handleBlur = () => {
    const raw = parseFormatted(display);
    const num = parseFloat(raw);
    if (!isNaN(num) && raw !== "") {
      setDisplay(fmt.format(num));
      emit(String(num));
    } else {
      setDisplay("");
      emit("");
    }
  };

  const handleFocus = () => {
    // Ao focar, mostra apenas os dígitos para facilitar edição
    if (display) {
      const raw = parseFormatted(display);
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) {
        // Mostra com vírgula mas sem pontos de milhar
        setDisplay(num.toFixed(2).replace(".", ","));
      }
    }
  };

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      className={cn("text-right tabular-nums", className)}
    />
  );
}
