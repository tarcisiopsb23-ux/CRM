/**
 * NacionalidadeCombobox
 *
 * Campo de busca + seleção para nacionalidade.
 * - Sempre exibe "Brasileiro(a)" como primeira opção
 * - Filtra ao digitar (case-insensitive, sem acentos)
 * - Dropdown sempre abre para baixo (side="bottom")
 * - Usa PopoverContentNoPortal para funcionar corretamente dentro de Dialogs
 */
import { useState, useRef } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContentNoPortal,
} from "@/components/ui/popover";

// ── Lista completa de nacionalidades ─────────────────────────────────────────

const NACIONALIDADES = [
  { value: "brasileiro(a)",  label: "Brasileiro(a)" },
  { value: "alemão",         label: "Alemão(ã)" },
  { value: "americano",      label: "Americano(a)" },
  { value: "argentino",      label: "Argentino(a)" },
  { value: "australiano",    label: "Australiano(a)" },
  { value: "austríaco",      label: "Austríaco(a)" },
  { value: "belga",          label: "Belga" },
  { value: "boliviano",      label: "Boliviano(a)" },
  { value: "canadense",      label: "Canadense" },
  { value: "chileno",        label: "Chileno(a)" },
  { value: "chinês",         label: "Chinês(a)" },
  { value: "colombiano",     label: "Colombiano(a)" },
  { value: "coreano",        label: "Coreano(a)" },
  { value: "cubano",         label: "Cubano(a)" },
  { value: "dinamarquês",    label: "Dinamarquês(a)" },
  { value: "equatoriano",    label: "Equatoriano(a)" },
  { value: "espanhol",       label: "Espanhol(a)" },
  { value: "finlandês",      label: "Finlandês(a)" },
  { value: "francês",        label: "Francês(a)" },
  { value: "grego",          label: "Grego(a)" },
  { value: "holandês",       label: "Holandês(a)" },
  { value: "húngaro",        label: "Húngaro(a)" },
  { value: "indiano",        label: "Indiano(a)" },
  { value: "inglês",         label: "Inglês(a)" },
  { value: "irlandês",       label: "Irlandês(a)" },
  { value: "israelense",     label: "Israelense" },
  { value: "italiano",       label: "Italiano(a)" },
  { value: "japonês",        label: "Japonês(a)" },
  { value: "libanês",        label: "Libanês(a)" },
  { value: "mexicano",       label: "Mexicano(a)" },
  { value: "norueguês",      label: "Norueguês(a)" },
  { value: "panamenho",      label: "Panamenho(a)" },
  { value: "paraguaio",      label: "Paraguaio(a)" },
  { value: "peruano",        label: "Peruano(a)" },
  { value: "polonês",        label: "Polonês(a)" },
  { value: "português",      label: "Português(a)" },
  { value: "romeno",         label: "Romeno(a)" },
  { value: "russo",          label: "Russo(a)" },
  { value: "sul-africano",   label: "Sul-africano(a)" },
  { value: "sueco",          label: "Sueco(a)" },
  { value: "suíço",          label: "Suíço(a)" },
  { value: "turco",          label: "Turco(a)" },
  { value: "ucraniano",      label: "Ucraniano(a)" },
  { value: "uruguaio",       label: "Uruguaio(a)" },
  { value: "venezuelano",    label: "Venezuelano(a)" },
  { value: "vietnamita",     label: "Vietnamita" },
];

// ── Normalização para busca sem acento ───────────────────────────────────────

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.\)/g, "");
}

// ── Componente ────────────────────────────────────────────────────────────────

interface NacionalidadeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Classe CSS adicional para o botão trigger */
  className?: string;
  /** Altura do trigger: "default" usa h-9, "sm" usa h-8 (para uso em Dialogs compactos) */
  size?: "default" | "sm";
  placeholder?: string;
}

export function NacionalidadeCombobox({
  value,
  onChange,
  className,
  size = "default",
  placeholder = "Selecione…",
}: NacionalidadeComboboxProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = NACIONALIDADES.find(n => n.value === value);
  const label = selected?.label ?? (value || placeholder);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            size === "sm" ? "h-8 text-sm" : "h-9 text-sm",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      {/* PopoverContentNoPortal: permanece na árvore DOM do Dialog, evitando
          o bloqueio de pointer-events causado pelo aria-hidden do Radix Dialog. */}
      <PopoverContentNoPortal
        side="bottom"
        align="start"
        sideOffset={4}
        className="p-0"
        style={{ width: triggerRef.current?.offsetWidth ?? 240 }}
      >
        <Command
          filter={(itemValue, search) =>
            normalize(itemValue).includes(normalize(search)) ? 1 : 0
          }
        >
          <CommandInput placeholder="Buscar nacionalidade…" />
          <CommandList>
            <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            <CommandGroup>
              {NACIONALIDADES.map(n => (
                <CommandItem
                  key={n.value}
                  value={n.value}
                  onSelect={val => {
                    onChange(val === value ? "" : val);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === n.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {n.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContentNoPortal>
    </Popover>
  );
}
