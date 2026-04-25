import { useSuppliers } from "@/hooks/useSuppliers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SupplierSelectProps {
  organizationId: string;
  value: string | null;
  onChange: (supplierId: string | null) => void;
  disabled?: boolean;
  filterIds?: string[]; // se fornecido, só mostra fornecedores com esses IDs
}

const NULL_VALUE = "__none__";

export function SupplierSelect({
  organizationId,
  value,
  onChange,
  disabled,
  filterIds,
}: SupplierSelectProps) {
  const { data: suppliers = [], isLoading } = useSuppliers(organizationId);

  const activeSuppliers = suppliers
    .filter((s) => s.is_active)
    .filter((s) => !filterIds || filterIds.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleChange = (val: string) => {
    onChange(val === NULL_VALUE ? null : val);
  };

  return (
    <Select
      value={value ?? NULL_VALUE}
      onValueChange={handleChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder="Selecionar fornecedor..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NULL_VALUE}>Nenhum / Não especificado</SelectItem>
        {activeSuppliers.map((supplier) => (
          <SelectItem key={supplier.id} value={supplier.id}>
            {supplier.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
