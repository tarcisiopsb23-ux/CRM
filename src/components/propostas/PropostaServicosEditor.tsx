import { useState } from "react";
import { Plus, Trash2, GripVertical, BookOpen, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
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
import { cn } from "@/lib/utils";
import { calcValueComparison } from "@/lib/proposalValueCalc";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";

export type ServiceDraft = {
  _key: string;
  name: string;
  description: string | null;
  value: number;
  is_bonus: boolean;
  sort_order: number;
};

interface Props {
  services: ServiceDraft[];
  planValue: number;
  organizationId: string | undefined;
  onServicesChange: (services: ServiceDraft[]) => void;
  onPlanValueChange: (value: number) => void;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function newService(): ServiceDraft {
  return {
    _key: crypto.randomUUID(),
    name: "",
    description: null,
    value: 0,
    is_bonus: false,
    sort_order: 0,
  };
}

// ── Combobox de seleção do catálogo ──────────────────────────────────────────

interface CatalogComboboxProps {
  organizationId: string | undefined;
  onSelect: (draft: ServiceDraft) => void;
}

function CatalogCombobox({ organizationId, onSelect }: CatalogComboboxProps) {
  const [open, setOpen] = useState(false);
  const { services, isLoading } = useServiceCatalog(organizationId);

  function handleSelect(serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    onSelect({
      _key: crypto.randomUUID(),
      name: svc.name,
      description: svc.description_text ?? null,
      value: 0,
      is_bonus: false,
      sort_order: 0,
    });
    setOpen(false);
  }

  // Group by category for display
  const byCategory = services.reduce<Record<string, typeof services>>(
    (acc, svc) => {
      const key = svc.category || "Sem categoria";
      if (!acc[key]) acc[key] = [];
      acc[key].push(svc);
      return acc;
    },
    {}
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={isLoading || services.length === 0}
          title={
            services.length === 0
              ? "Nenhum serviço cadastrado em Configurações"
              : "Adicionar do catálogo"
          }
        >
          <BookOpen className="h-4 w-4" />
          Do catálogo
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar serviço..." />
          <CommandList>
            <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
            {Object.entries(byCategory).map(([category, items]) => (
              <CommandGroup key={category} heading={category}>
                {items.map((svc) => (
                  <CommandItem
                    key={svc.id}
                    value={`${svc.name} ${svc.category}`}
                    onSelect={() => handleSelect(svc.id)}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span className="font-medium text-sm">{svc.name}</span>
                    {svc.modality && (
                      <span className="text-xs text-muted-foreground">{svc.modality}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {services.length > 0 && (
          <div className="border-t px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {services.length} serviço{services.length !== 1 ? "s" : ""} no catálogo ·{" "}
              <span className="text-foreground/60">Valor pode ser editado após adicionar</span>
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PropostaServicosEditor({
  services,
  planValue,
  organizationId,
  onServicesChange,
  onPlanValueChange,
}: Props) {
  const comparison = calcValueComparison(services, planValue);

  const update = (key: string, patch: Partial<ServiceDraft>) =>
    onServicesChange(services.map((s) => (s._key === key ? { ...s, ...patch } : s)));

  const remove = (key: string) =>
    onServicesChange(services.filter((s) => s._key !== key));

  const addEmpty = () => onServicesChange([...services, newService()]);

  const addFromCatalog = (draft: ServiceDraft) =>
    onServicesChange([...services, draft]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Serviços</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum serviço adicionado. Use o catálogo ou adicione manualmente.
          </p>
        )}

        {services.map((svc) => (
          <div
            key={svc._key}
            className="flex gap-2 items-start p-3 rounded-lg border bg-muted/20"
          >
            <GripVertical className="h-4 w-4 mt-2 text-muted-foreground/50 shrink-0" />
            <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input
                  maxLength={120}
                  placeholder="Ex: Gestão de Tráfego"
                  value={svc.name}
                  onChange={(e) => update(svc._key, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Input
                  maxLength={500}
                  placeholder="Opcional"
                  value={svc.description ?? ""}
                  onChange={(e) =>
                    update(svc._key, { description: e.target.value || null })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  Valor de tabela (R$)
                  <span
                    title="Preço individual deste serviço. Usado para mostrar economia ao cliente no comparativo do pacote. Opcional — deixe em branco se não quiser exibir comparativo."
                    className="cursor-help text-muted-foreground/60 hover:text-muted-foreground"
                  >ⓘ</span>
                </Label>
                <Input
                  type="number"
                  min={0.01}
                  max={999999.99}
                  step={0.01}
                  className="w-32"
                  placeholder="Opcional"
                  value={svc.value || ""}
                  onChange={(e) =>
                    update(svc._key, {
                      value: Math.min(
                        999999.99,
                        Math.max(0, parseFloat(e.target.value) || 0)
                      ),
                    })
                  }
                />
              </div>
              <div className="flex items-center gap-1.5 pb-1">
                <Switch
                  checked={svc.is_bonus}
                  onCheckedChange={(v) => update(svc._key, { is_bonus: v })}
                  id={`bonus-${svc._key}`}
                />
                <Label
                  htmlFor={`bonus-${svc._key}`}
                  className="text-xs whitespace-nowrap cursor-pointer"
                >
                  🎁 Bônus
                </Label>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:bg-red-50 self-end"
                onClick={() => remove(svc._key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {/* Botões de adição */}
        <div className="flex gap-2 flex-wrap">
          <CatalogCombobox
            organizationId={organizationId}
            onSelect={addFromCatalog}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addEmpty}
            className="gap-2 border-dashed flex-1"
          >
            <Plus className="h-4 w-4" /> Adicionar manualmente
          </Button>
        </div>

        {services.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total dos serviços:</span>
              <span className="font-semibold">
                {fmtCurrency(comparison.totalIndividual)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
