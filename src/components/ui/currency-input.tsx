import { forwardRef, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  /** Valor numérico (ex: 1234.56) ou string numérica */
  value: string | number | null | undefined;
  /** Retorna o valor como string numérica com ponto decimal (ex: "1234.56") */
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Input monetário no padrão brasileiro.
 * - Digita centavos da direita para a esquerda (ex: 1 → R$ 0,01 → R$ 0,10 → R$ 1,00)
 * - Exibe R$ 1.234,56 durante a digitação
 * - onChange retorna "1234.56" (ponto decimal, sem símbolo)
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className, placeholder = "R$ 0,00", ...props }, ref) => {
    const toDisplay = (v: string | number | null | undefined): string => {
      if (v === null || v === undefined || v === "" || v === "0" || v === 0) return "";
      const num = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
      if (isNaN(num) || num === 0) return "";
      return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    };

    const [display, setDisplay] = useState(toDisplay(value));
    const prevValue = useRef(value);

    useEffect(() => {
      if (prevValue.current !== value) {
        prevValue.current = value;
        setDisplay(toDisplay(value));
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Extrai apenas dígitos
      const digits = raw.replace(/\D/g, "").slice(0, 13);
      if (!digits || digits === "0") {
        setDisplay("");
        onChange("");
        return;
      }
      const num = parseInt(digits, 10) / 100;
      const formatted = num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      setDisplay(formatted);
      onChange(num.toFixed(2));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(className)}
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
