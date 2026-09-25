/**
 * C8ControlSection — Configurações do C8 Control no CRM da Agência (Maestria)
 *
 * Persiste em organization_integrations com integration_type = 'c8control'.
 * Lido via useC8ControlConfig no dashboard público do cliente (useAppointments).
 *
 * SEPARAÇÃO DE RESPONSABILIDADES:
 *   • Este componente (Maestria/CRM):
 *       - Referências às variáveis de ambiente (appUrl, crmApiKey, supportEmail)
 *       - Webhooks n8n GLOBAIS da Agenda (universais — valem para todos os clientes)
 *
 *   • N8nSection (Maestria/CRM):
 *       - Webhooks de provisionamento do Banco B (c8ProvisionWebhookUrl, etc.)
 *       - Todos os outros webhooks n8n gerais (leads, financeiro, Drive, ClickUp, etc.)
 *
 *   • ConfigIntegracoesPage (dashboard público do cliente):
 *       - Apenas autorização OAuth2 Google Calendar (conectar/desconectar conta Google)
 *       - Cliente NÃO configura webhooks
 */

import { useState, useEffect, useRef } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Loader2, Webhook, Globe, KeyRound, CalendarCheck, Info, Eye, EyeOff, Copy } from "lucide-react";
import { toast } from "sonner";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import type { C8ControlConfig } from "@/types/settings";

type FieldDef = {
  key: keyof C8ControlConfig;
  label: string;
  placeholder: string;
  mask?: boolean;
  hint?: string;
};

// ── Grupo 1: Aplicação ────────────────────────────────────────────────────────
// Campos de referência — o código lê do .env, estes são apenas documentação visual.

const FIELDS_APP: FieldDef[] = [
  {
    key: "appUrl",
    label: "URL do App C8 Control",
    placeholder: "https://app.c8control.com.br",
    hint: "Referência para VITE_C8_CONTROL_URL. O código lê a variável de ambiente, não este campo.",
  },
  {
    key: "supportEmail",
    label: "E-mail de Suporte",
    placeholder: "suporte@agenciac8.com.br",
  },
  {
    key: "crmApiKey",
    label: "CRM API Key (x-crm-api-key)",
    placeholder: "uuid-secreto-compartilhado",
    mask: true,
    hint: "Referência para VITE_CRM_API_KEY. Configure também nos Secrets das Edge Functions do Supabase.",
  },
];

// ── Grupo 2: Webhooks C8 Control — Agenda ─────────────────────────────────────
// Lidos via useC8ControlConfig (integration_type='c8control').
// Servem como fallback GLOBAL para todos os clientes do C8 Control.
// Hierarquia: por cliente (ConfigIntegracoesPage) > aqui > env VITE_N8N_AGENDA_*

const FIELDS_AGENDA: FieldDef[] = [
  {
    key: "agendaWebhookUrl",
    label: "Webhook de Saída — C8 → n8n → Google Calendar",
    placeholder: "https://n8n.dominio.com/webhook/agenda-upsert",
    hint: "Disparado ao criar, editar ou cancelar agendamentos de QUALQUER cliente. Fallback global — pode ser sobrescrito por cliente individualmente.",
  },
  {
    key: "agendaManagerWebhookUrl",
    label: "Webhook: Agenda Manager",
    placeholder: "https://n8n.dominio.com/webhook/agenda-manager",
    hint: "Editar dados/horário de agendamentos e renovar watch channels do Google Calendar.",
  },
  {
    key: "agendaWebhookToken",
    label: "Token de Autenticação (X-Webhook-Token)",
    placeholder: "token-secreto-compartilhado",
    mask: true,
    hint: "Enviado como header em todas as chamadas de Agenda. Mesma lógica de fallback: cliente > global > env.",
  },
  {
    key: "agendaN8nGoogleWebhookUrl",
    label: "Webhook n8n — Entrada do Google Calendar",
    placeholder: "https://n8n.dominio.com/webhook/agenda-google-webhook",
    hint: "URL do workflow n8n que recebe notificações push do Google Calendar (watch channel). Configure no Google Calendar API.",
  },
  {
    key: "agendaReceiverUrl",
    label: "Receiver URL — n8n → C8 Control",
    placeholder: "https://xxxx.supabase.co/functions/v1/agenda-n8n-receiver",
    hint: "URL da Edge Function agenda-n8n-receiver. Configure esta URL no workflow n8n para sincronizar eventos do Google Calendar de volta ao C8.",
  },
  {
    key: "agendaEmailWebhookUrl",
    label: "Webhook: Notificações por E-mail",
    placeholder: "https://n8n.dominio.com/webhook/agenda-email-notify",
    hint: "URL do workflow n8n que envia e-mails de agendamento via Resend (criado, confirmado, cancelado). Usa o padrão on-behalf-of: From no domínio c8control.com.br, Reply-To do cliente.",
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export function C8ControlSection() {
  const organizationId = useOrganization();
  const { data: integration, isLoading, upsert } = useIntegration(organizationId, "c8control");

  const [values, setValues]       = useState<C8ControlConfig>({});
  const [isDirty, setIsDirty]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [revealed, setRevealed]   = useState<Set<keyof C8ControlConfig>>(new Set());
  const loadedRef                 = useRef<string | null>(null);

  useEffect(() => {
    if (!organizationId || !integration || loadedRef.current === organizationId) return;
    loadedRef.current = organizationId;
    setValues((integration.config as C8ControlConfig) ?? {});
    setIsDirty(false);
  }, [organizationId, integration]);

  const set = (key: keyof C8ControlConfig, val: string) => {
    setValues(p => ({ ...p, [key]: val || undefined }));
    setIsDirty(true);
  };

  const toggleReveal = (key: keyof C8ControlConfig) =>
    setRevealed(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const copy = (val: string | undefined, label: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    toast.success(`${label} copiado!`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsert.mutateAsync(values as any);
      setIsDirty(false);
      toast.success("Configurações do C8 Control salvas!");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setValues((integration?.config as C8ControlConfig) ?? {});
    setIsDirty(false);
  };

  if (isLoading) return null;

  const countFilled = (fields: FieldDef[]) =>
    fields.filter(f => !!(values as any)[f.key]).length;

  const renderField = (f: FieldDef) => {
    const val      = (values as any)[f.key] as string | undefined;
    const isMasked = f.mask && !revealed.has(f.key);

    return (
      <div key={f.key} className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-foreground">{f.label}</label>
          {f.mask && (
            <button type="button" onClick={() => toggleReveal(f.key)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={isMasked ? "Mostrar" : "Ocultar"}>
              {isMasked ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
          )}
          {val && !f.mask && (
            <button type="button" onClick={() => copy(val, f.label)}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
        {f.hint && (
          <p className="text-[10px] text-muted-foreground flex items-start gap-1">
            <Info className="h-3 w-3 shrink-0 mt-0.5" />{f.hint}
          </p>
        )}
        <SettingsInput
          label=""
          value={isMasked && val ? "••••••••••••••••" : (val ?? "")}
          onChange={v => { if (!isMasked) set(f.key, v); }}
          placeholder={isMasked && val ? "Salvo — clique no olho para visualizar" : f.placeholder}
        />
      </div>
    );
  };

  const renderGroup = (
    title: string,
    fields: FieldDef[],
    icon: React.ReactNode,
    description?: string
  ) => {
    const filled = countFilled(fields);
    return (
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{title}</h4>
          </div>
          <Badge variant={filled === fields.length ? "default" : "secondary"} className="text-[10px]">
            {filled}/{fields.length} configurados
          </Badge>
        </div>
        {description && (
          <p className="text-[10px] text-muted-foreground italic">{description}</p>
        )}
        <div className="space-y-3">
          {fields.map(renderField)}
        </div>
      </div>
    );
  };

  return (
    <SettingsSection
      title="C8 Control"
      description="Credenciais e webhooks globais do C8 Control. Os webhooks de Agenda aqui valem para todos os clientes."
      icon={<Package className="h-5 w-5" />}
    >
      <div className="space-y-5">

        {/* Aviso de separação de responsabilidades */}
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Onde ficam as outras configurações
          </p>
          <ul className="text-[10px] text-muted-foreground space-y-0.5 pl-5 list-disc">
            <li><strong>Webhooks de provisionamento do Banco B</strong> (provision, schema, ops) → aba <strong>n8n Integration</strong> acima</li>
            <li><strong>Webhook de Agenda por cliente</strong> (sobrescreve o global) → <strong>Configurações → Integrações</strong> no dashboard do cliente</li>
          </ul>
        </div>

        {/* Grupo 1: Aplicação */}
        {renderGroup(
          "Aplicação",
          FIELDS_APP,
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />,
          "Referência às variáveis de ambiente. O código usa os valores do .env — estes campos servem como documentação visual para a equipe."
        )}

        {/* Grupo 2: Webhooks C8 Control — Agenda */}
        {renderGroup(
          "Webhooks C8 Control — Agenda",
          FIELDS_AGENDA,
          <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />,
          "Webhooks globais de integração bidirecional com Google Calendar via n8n. Valem para TODOS os clientes do C8 Control que não configuraram o webhook individualmente."
        )}

        {/* Botões */}
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={!isDirty || saving} className="flex-1">
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
              : "Salvar Configurações C8 Control"
            }
          </Button>
          {isDirty && (
            <Button variant="outline" onClick={handleDiscard}>Descartar</Button>
          )}
        </div>

      </div>
    </SettingsSection>
  );
}
