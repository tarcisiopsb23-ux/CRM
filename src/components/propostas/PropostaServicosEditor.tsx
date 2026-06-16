import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calcValueComparison } from "@/lib/proposalValueCalc";

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

export function PropostaServicosEditor({
  services,
  planValue,
  onServicesChange,
  onPlanValueChange,
}: Props) {
  const comparison = calcValueComparison(services, planValue);

  const update = (key: string, patch: Partial<ServiceDraft>) =>
    onServicesChange(services.map((s) => (s._key === key ? { ...s, ...patch } : s)));

  const remove = (key: string) =>
    onServicesChange(services.filter((s) => s._key !== key));

  const add = () => onServicesChange([...services, newService()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Serviços</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum serviço adicionado.
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
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  type="number"
                  min={0.01}
                  max={999999.99}
                  step={0.01}
                  className="w-32"
                  placeholder="0,00"
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

        <Button
          variant="outline"
          size="sm"
          onClick={add}
          className="w-full gap-2 border-dashed"
        >
          <Plus className="h-4 w-4" /> Adicionar Serviço
        </Button>

        {services.length > 0 && (
          <div className="pt-3 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total individual:</span>
              <span className="font-semibold">
                {fmtCurrency(comparison.totalIndividual)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">Valor do plano (R$):</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                className="w-40"
                value={planValue || ""}
                onChange={(e) => onPlanValueChange(parseFloat(e.target.value) || 0)}
              />
            </div>
            {comparison.savings > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Economia para o cliente:</span>
                <span className="font-bold">
                  {fmtCurrency(comparison.savings)} (
                  {comparison.savingsPercent.toFixed(0)}%)
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
