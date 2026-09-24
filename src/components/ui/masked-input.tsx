import * as React from "react";
import { Input } from "@/components/ui/input";
import { applyMask, removeMask, type MaskType } from "@/lib/masks";
import { cn } from "@/lib/utils";

interface MaskedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  mask: MaskType;
  value?: string;
  /** Retorna o valor com máscara aplicada */
  onChange?: (masked: string, raw: string) => void;
  className?: string;
}

const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ mask, value = "", onChange, className, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = applyMask(e.target.value, mask);
      const raw = removeMask(masked, mask);
      onChange?.(masked, raw);
    };

    return (
      <Input
        ref={ref}
        value={applyMask(value, mask)}
        onChange={handleChange}
        className={cn(className)}
        {...props}
      />
    );
  }
);

MaskedInput.displayName = "MaskedInput";

export { MaskedInput };
