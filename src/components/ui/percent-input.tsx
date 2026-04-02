import { forwardRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PercentInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Input para valores percentuais no padrão brasileiro (vírgula como separador decimal).
 * Aceita "15,5" e converte para "15.5" internamente ao chamar onChange.
 * Exibe o valor com vírgula para o usuário.
 */
export const PercentInput = forwardRef<HTMLInputElement, PercentInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    // Converte o valor numérico/string para exibição com vírgula
    const toDisplay = (v: string | number | null | undefined): string => {
      if (v === null || v === undefined || v === "") return "";
      return String(v).replace(".", ",");
    };

    const [display, setDisplay] = useState(toDisplay(value));

    useEffect(() => {
      // Só atualiza o display se o valor externo mudou de forma significativa
      const external = toDisplay(value);
      const internalAsExternal = display.replace(",", ".");
      if (internalAsExternal !== String(value ?? "")) {
        setDisplay(external);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Permite apenas dígitos, vírgula e ponto (converte ponto para vírgula)
      const normalized = raw.replace(/[^0-9,.-]/g, "").replace(".", ",");
      // Garante no máximo uma vírgula
      const parts = normalized.split(",");
      const intPart = parts[0];
      const decPart = parts.length > 1 ? parts.slice(1).join("").substring(0, 2) : undefined;
      const cleaned = decPart !== undefined ? `${intPart},${decPart}` : intPart;
      setDisplay(cleaned);
      // Passa para o onChange o valor com ponto (padrão JS)
      onChange(cleaned.replace(",", "."));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        onChange={handleChange}
        className={cn(className)}
        {...props}
      />
    );
  }
);

PercentInput.displayName = "PercentInput";
