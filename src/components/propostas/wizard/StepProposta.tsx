// src/components/propostas/wizard/StepProposta.tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import type { ScheduleConfig } from "@/types/proposals";
import type { Client } from "@/types/crm";
import { PropostaCronograma } from "@/components/propostas/PropostaCronograma";
import type { WizardServiceDraft } from "./wizardTypes";

interface Props {
  client: Client;
  title: string;
  heroMessage: string;
  closerWhatsapp: string;
  schedule: ScheduleConfig;
  planValue?: number;
  services: WizardServiceDraft[];
  onTitleChange: (v: string) => void;
  onHeroMessageChange: (v: string) => void;
  onCloserWhatsappChange: (v: string) => void;
  onScheduleChange: (s: ScheduleConfig) => void;
  onPlanValueChange?: (v: number) => void;
  onServicesChange: (services: WizardServiceDraft[]) => void;
}

function newManual(): WizardServiceDraft {
  return { name: "", description: null, value: 0, is_bonus: false };
}

export function StepProposta({
  client,
  title,
  heroMessage,
  closerWhatsapp,
  schedule,
  planValue = 0,
  services,
  onTitleChange,
  onHeroMessageChange,
  onCloserWhatsappChange,
  onScheduleChange,
  onPlanValueChange,
  onServicesChange,
}: Props) {

  function updateService(idx: number, patch: Partial<WizardServiceDraft>) {
    onServicesChange(services.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeService(idx: number) {
    onServicesChange(services.filter((_, i) => i !== idx));
  }

  function addManual() {
    onServicesChange([...services, newManual()]);
  }

  const totalIndividual = services
    .filter((s) => !s.is_bonus)
    .reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Financeiro</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Defina preços, bônus e condições de pagamento para{" "}
          <strong>{client.name}</strong>.
        </p>
      </div>

      {/* Identificação */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Identificação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Título da proposta *</Label>
            <Input
              placeholder={`Proposta ${client.name}`}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Aparece no topo da proposta e na listagem interna.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Hero do cliente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Personalização
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Mensagem de abertura</Label>
            <Textarea
              rows={3}
              placeholder={`Olá ${client.name}, preparamos esta proposta especialmente para você...`}
              value={heroMessage}
              onChange={(e) => onHeroMessageChange(e.target.value)}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Mensagem personalizada exibida no topo da proposta para o cliente.
            </p>
          </div>

          <div className="space-y-1">
            <Label>WhatsApp do closer *</Label>
            <Input
              placeholder="5511999999999"
              value={closerWhatsapp}
              onChange={(e) => onCloserWhatsappChange(e.target.value)}
              maxLength={20}
            />
            <p className="text-xs text-muted-foreground">
              Número que o cliente vai acionar ao clicar em "Falar no WhatsApp".
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Editor de itens da proposta */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Itens da proposta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground -mt-1">
            Valor de tabela é opcional — serve para mostrar o desconto do pacote ao cliente.
            O valor cobrado é definido no cronograma financeiro abaixo.
          </p>

          {services.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              Nenhum serviço selecionado. Volte à etapa anterior ou adicione manualmente.
            </p>
          )}

          <div className="space-y-2">
            {services.map((svc, idx) => (
              <div
                key={`${svc.catalog_id ?? "manual"}-${idx}`}
                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end p-3 rounded-lg border bg-muted/10"
              >
                {/* Nome */}
                <div className="space-y-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input
                    maxLength={120}
                    placeholder="Nome do serviço"
                    value={svc.name}
                    onChange={(e) => updateService(idx, { name: e.target.value })}
                  />
                </div>

                {/* Descrição */}
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input
                    maxLength={500}
                    placeholder="Opcional"
                    value={svc.description ?? ""}
                    onChange={(e) =>
                      updateService(idx, { description: e.target.value || null })
                    }
                  />
                </div>

                {/* Valor de tabela */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    Valor de tabela (R$)
                    <span
                      title="Preço individual. Usado para mostrar economia ao cliente no comparativo do pacote. Opcional."
                      className="cursor-help text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      ⓘ
                    </span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-32"
                    placeholder="Opcional"
                    value={svc.value || ""}
                    onChange={(e) =>
                      updateService(idx, {
                        value: Math.min(
                          999999.99,
                          Math.max(0, parseFloat(e.target.value) || 0)
                        ),
                      })
                    }
                  />
                </div>

                {/* Bônus */}
                <div className="flex items-center gap-1.5 pb-1">
                  <Switch
                    checked={svc.is_bonus}
                    onCheckedChange={(v) => updateService(idx, { is_bonus: v })}
                    id={`bonus-fin-${idx}`}
                  />
                  <Label htmlFor={`bonus-fin-${idx}`} className="text-xs cursor-pointer">
                    🎁 Bônus
                  </Label>
                </div>

                {/* Remover */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 self-end"
                  onClick={() => removeService(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={addManual}
            className="border-dashed gap-2"
          >
            <Plus className="h-4 w-4" /> Adicionar item manualmente
          </Button>
        </CardContent>
      </Card>

      {/* Cronograma financeiro */}
      <PropostaCronograma
        value={schedule}
        planValue={planValue}
        totalIndividual={totalIndividual}
        onPlanValueChange={onPlanValueChange}
        onChange={onScheduleChange}
      />
    </div>
  );
}
