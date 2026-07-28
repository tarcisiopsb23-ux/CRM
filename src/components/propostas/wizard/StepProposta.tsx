// src/components/propostas/wizard/StepProposta.tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScheduleConfig } from "@/types/proposals";
import type { Client } from "@/types/crm";

interface Props {
  client: Client;
  title: string;
  heroMessage: string;
  closerWhatsapp: string;
  schedule: ScheduleConfig;
  onTitleChange: (v: string) => void;
  onHeroMessageChange: (v: string) => void;
  onCloserWhatsappChange: (v: string) => void;
  onScheduleChange: (s: ScheduleConfig) => void;
}

const RECURRENCE_LABELS: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export function StepProposta({
  client,
  title,
  heroMessage,
  closerWhatsapp,
  schedule,
  onTitleChange,
  onHeroMessageChange,
  onCloserWhatsappChange,
  onScheduleChange,
}: Props) {
  const set = (patch: Partial<ScheduleConfig>) =>
    onScheduleChange({ ...schedule, ...patch });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Informações da proposta</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Dados específicos para <strong>{client.name}</strong>.
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

      {/* Cronograma financeiro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Cronograma financeiro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Valor da parcela (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0,00"
                value={schedule.firstValue || ""}
                onChange={(e) => set({ firstValue: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Data da 1ª parcela</Label>
              <Input
                type="date"
                value={schedule.firstDate}
                onChange={(e) => set({ firstDate: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Recorrência</Label>
              <Select
                value={schedule.recurrence}
                onValueChange={(v) =>
                  set({ recurrence: v as ScheduleConfig["recurrence"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Nº de parcelas</Label>
              <Input
                type="number"
                min={1}
                max={360}
                value={schedule.installments}
                onChange={(e) =>
                  set({
                    installments: Math.min(360, Math.max(1, parseInt(e.target.value) || 1)),
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
