import { useState, useEffect } from "react";
import { useSuppliers } from "@/hooks/useSuppliers";
import {
  Popover,
  PopoverContentNoPortal,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface SupplierSelectProps {
  organizationId: string;
  value: string | null;
  onChange: (supplierId: string | null) => void;
  onAddNew?: () => void; // callback para adicionar novo fornecedor
  disabled?: boolean;
  filterIds?: string[]; // se fornecido, só mostra fornecedores com esses IDs
}

export function SupplierSelect({
  organizationId,
  value,
  onChange,
  onAddNew,
  disabled,
  filterIds,
}: SupplierSelectProps) {
  const { data: suppliers = [], isLoading } = useSuppliers(organizationId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const activeSuppliers = suppliers
    .filter((s) => s.is_active)
    .filter((s) => !filterIds || filterIds.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Filtrar fornecedores baseado no termo de busca
  const filteredSuppliers = search
    ? activeSuppliers.filter((supplier) =>
        supplier.name.toLowerCase().includes(search.toLowerCase())
      )
    : activeSuppliers;

  // Obter o nome do fornecedor selecionado
  const selectedSupplier = activeSuppliers.find((s) => s.id === value);

  const handleSelect = (supplierId: string) => {
    onChange(supplierId);
    setOpen(false);
    setSearch("");
  };

  const handleAddNew = () => {
    if (onAddNew) {
      onAddNew();
      setOpen(false);
      setSearch("");
    }
  };

  const handleClear = () => {
    onChange(null);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled || isLoading}
        >
          <span className={cn("truncate", !selectedSupplier && "text-muted-foreground")}>
            {selectedSupplier ? selectedSupplier.name : "Selecionar fornecedor..."}
          </span>
          <span className="ml-2 h-4 w-4 shrink-0 opacity-50">⌘</span>
        </Button>
      </PopoverTrigger>
      <PopoverContentNoPortal className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar fornecedor..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <CommandEmpty>Carregando fornecedores...</CommandEmpty>
            ) : filteredSuppliers.length === 0 && search ? (
              <div className="space-y-2 p-2">
                <div className="text-sm text-muted-foreground text-center py-4">
                  Fornecedor <strong>"{search}"</strong> não foi encontrado
                </div>
                {onAddNew && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={handleAddNew}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar novo fornecedor
                  </Button>
                )}
              </div>
            ) : activeSuppliers.length === 0 ? (
              <CommandEmpty>Nenhum fornecedor disponível</CommandEmpty>
            ) : (
              <>
                <CommandGroup>
                  {filteredSuppliers.map((supplier) => (
                    <CommandItem
                      key={supplier.id}
                      value={supplier.id}
                      onSelect={() => handleSelect(supplier.id)}
                    >
                      <span
                        className={cn(
                          "flex-1",
                          value === supplier.id && "font-semibold"
                        )}
                      >
                        {supplier.name}
                      </span>
                      {value === supplier.id && (
                        <span className="text-primary">✓</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {search === "" && (
                  <div className="border-t p-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                      onClick={handleClear}
                    >
                      <span>Limpar seleção</span>
                    </Button>
                  </div>
                )}
                {onAddNew && search && filteredSuppliers.length === 0 && (
                  <div className="border-t p-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={handleAddNew}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar novo fornecedor
                    </Button>
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContentNoPortal>
    </Popover>
  );
}
