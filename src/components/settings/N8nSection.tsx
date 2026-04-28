import { useState, useEffect, useRef } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import type { N8nConfig } from "@/types/settings";
import { Share2, Copy, Check, RefreshCcw } from "lucide-react";

const FIELD_DEFS: {
  key: keyof N8nConfig;
  label: string;
  placeholder: string;
  section: string;
}[] = [
  { key: "baseUrl",                    label: "URL Base do n8n",                                                              placeholder: "https://n8n.dominio.com",                              section: "creds" },
  { key: "apiKey",                     label: "API Key (opcional)",                                                           placeholder: "sk-...",                                               section: "creds" },
  { key: "webhookPath",                label: "Caminho do Webhook (legado)",                                                  placeholder: "/webhook/drive",                                       section: "creds" },
  { key: "leadWebhookUrl",             label: "Webhook URL: Novos Leads",                                                     placeholder: "https://n8n.dominio.com/webhook/leads",                section: "out"   },
  { key: "clientWebhookUrl",           label: "Webhook URL: Novo Cliente",                                                    placeholder: "https://n8n.dominio.com/webhook/clients",              section: "out"   },
  { key: "financialWebhookUrl",        label: "Webhook URL: Financeiro (Pagamentos)",                                         placeholder: "https://n8n.dominio.com/webhook/payments",             section: "out"   },
  { key: "asaasWebhookUrl",            label: "Webhook URL: Asaas (eventos de cobrança)",                                     placeholder: "https://n8n.dominio.com/webhook/asaas",                section: "out"   },
  { key: "notificationsWebhookUrl",    label: "Webhook URL: Notificações de Sistema (E-mail)",                                placeholder: "https://n8n.dominio.com/webhook/notifications",        section: "out"   },
  { key: "calendarWebhookUrl",         label: "Webhook URL: Google Calendar (Eventos)",                                       placeholder: "https://n8n.dominio.com/webhook/calendar",             section: "out"   },
  { key: "driveFolderClientWebhookUrl",   label: "Webhook URL: Pasta de Clientes",                                           placeholder: "https://n8n.dominio.com/webhook/drive-folder-client",   section: "drive" },
  { key: "driveFolderSupplierWebhookUrl", label: "Webhook URL: Pasta de Fornecedores",                                       placeholder: "https://n8n.dominio.com/webhook/drive-folder-supplier", section: "drive" },
  { key: "driveFolderProjectWebhookUrl",  label: "Webhook URL: Pasta de Projetos",                                           placeholder: "https://n8n.dominio.com/webhook/drive-folder-project",  section: "drive" },
  { key: "driveFolderEmployeeWebhookUrl", label: "Webhook URL: Pasta de Colaboradores",                                      placeholder: "https://n8n.dominio.com/webhook/drive-folder-employee", section: "drive" },
  { key: "driveFolderManualWebhookUrl",   label: "Webhook URL: Ações no Drive (listar, upload, subpasta, renomear, excluir)", placeholder: "https://n8n.dominio.com/webhook/drive-folder-manual",   section: "drive" },
  { key: "marketingWebhookUrl",        label: "Webhook URL: Métricas de Marketing (n8n → CRM)",                              placeholder: "https://n8n.dominio.com/webhook/marketing-data",       section: "in"    },
  { key: "clickupWebhookUrl",          label: "Webhook URL: Maestria → ClickUp (terceirizados)",                              placeholder: "https://n8n.dominio.com/webhook/maestria-to-clickup",  section: "clickup" },
  { key: "clickupSyncWebhookUrl",      label: "Webhook URL: ClickUp → Maestria (sync manual/polling)",                       placeholder: "https://n8n.dominio.com/webhook/clickup-sync-trigger",  section: "clickup" },
  { key: "clickupMembersWebhookUrl",   label: "Webhook URL: Participantes ClickUp (convidar/remover)",                       placeholder: "https://n8n.dominio.com/webhook/clickup-members",        section: "clickup" },
  { key: "adsWebhookUrl",              label: "Webhook URL: Sync de Ads (Meta + Google)",                                     placeholder: "https://n8n.dominio.com/webhook/sync-ads",               section: "ads"     },
  { key: "adsClientId",                label: "Client ID da Agência (para Dashboard e módulo Campanhas)",                     placeholder: "uuid-do-cliente-agencia",                                section: "ads"     },
];

const CACHE_PREFIX = "n8n_cfg_";

function cacheKey(orgId: string) {
  return `${CACHE_PREFIX}${orgId}`;
}

function readCache(orgId: string): Partial<Record<keyof N8nConfig, string>> {
  try {
    const raw = localStorage.getItem(cacheKey(orgId));
    return raw ? (JSON.parse(raw) as Partial<Record<keyof N8nConfig, string>>) : {};
  } catch {
    return {};
  }
}

function writeCache(orgId: string, config: Record<string, unknown>) {
  try {
    const flat: Partial<Record<keyof N8nConfig, string>> = {};
    for (const { key } of FIELD_DEFS) {
      const v = config[key] as string | undefined;
      if (v) flat[key] = v;
    }
    localStorage.setItem(cacheKey(orgId), JSON.stringify(flat));
  } catch { /* ignore */ }
}

export function N8nSection() {
  const orgId = useOrganization();

  // ── Estado local dos campos — fonte única de verdade para a UI ──────────────
  const [values, setValues] = useState<Partial<Record<keyof N8nConfig, string>>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Ref para saber se já carregamos do banco para este orgId
  const loadedForOrgRef = useRef<string | null>(null);

  // ── Carrega do banco UMA vez por orgId, mesclando com cache local ──
  const { data: serverData } = useIntegration(orgId, "n8n");
  const { upsert } = useIntegration(orgId, "n8n");

  // Quando orgId fica disponível, carrega do cache imediatamente
  useEffect(() => {
    if (!orgId) return;
    loadedForOrgRef.current = null; // permite recarregar do banco
    const cached = readCache(orgId);
    setValues(Object.values(cached).some(Boolean) ? cached : {});
    setIsDirty(false);
  }, [orgId]);

  // Quando dados do banco chegam, popula os campos (fonte de verdade)
  useEffect(() => {
    if (!orgId || !serverData || loadedForOrgRef.current === orgId) return;

    const config = (serverData as unknown as { config?: Record<string, unknown> } | null)?.config;
    loadedForOrgRef.current = orgId;

    if (!config || Object.keys(config).length === 0) return;

    if (!isDirty) {
      const fresh: Partial<Record<keyof N8nConfig, string>> = {};
      for (const { key } of FIELD_DEFS) {
        fresh[key] = (config[key] as string | undefined) ?? "";
      }
      setValues(fresh);
      writeCache(orgId, config);
    }
  }, [serverData, orgId, isDirty]);

  const setValue = (key: keyof N8nConfig, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      // Monta o config a partir dos valores locais
      const updated: N8nConfig = {};
      // Preserva campos do banco que não estão na tela
      const existingConfig = (serverData as { config?: N8nConfig } | null)?.config ?? {};
      Object.assign(updated, existingConfig);

      for (const { key } of FIELD_DEFS) {
        const val = (values[key] ?? "").trim();
        if (val) {
          (updated as Record<string, unknown>)[key] = val;
        } else {
          delete (updated as Record<string, unknown>)[key];
        }
      }

      await upsert.mutateAsync(updated);

      // Persiste o resultado salvo no localStorage
      writeCache(orgId, updated as Record<string, unknown>);
      setIsDirty(false);
      toast.success("Configurações do n8n atualizadas!");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!orgId) return;
    setValues(readCache(orgId));
    setIsDirty(false);
  };

  const handleManualSync = async () => {
    const syncUrl = v("clickupSyncWebhookUrl")?.trim();
    if (!syncUrl) {
      toast.error("Configure o Webhook URL: ClickUp → Maestria antes de sincronizar.");
      return;
    }
    setSyncing(true);
    try {
      await fetch(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual", organization_id: orgId }),
      });
      toast.success("Sincronização ClickUp iniciada! Aguarde até 1 minuto.");
    } catch {
      toast.error("Erro ao disparar sincronização. Verifique a URL.");
    } finally {
      setSyncing(false);
    }
  };

  const copyOrgId = () => {
    if (!orgId) return;
    navigator.clipboard.writeText(orgId);
    setCopied(true);
    toast.success("ID da Organização copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const v = (key: keyof N8nConfig) => values[key] ?? "";

  // Mostra loading apenas se não há orgId E não há nada em cache
  if (!orgId) {
    return (
      <SettingsSection title="n8n" icon={<Share2 className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="n8n Integration"
      description="Configure as URLs de Webhook do n8n para que o CRM envie eventos e receba dados de marketing/leads."
      icon={<Share2 className="h-5 w-5" />}
    >
      <div className="space-y-6">

        {/* Credenciais */}
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Credenciais para n8n</h4>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400">ORGANIZATION ID</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-xs font-mono truncate">
                {orgId}
              </code>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copyOrgId}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 italic">
            Use este ID no n8n para identificar sua organização ao enviar dados via API.
          </p>
        </div>

        {/* Webhooks de Saída */}
        <div className="space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Webhooks de Saída (CRM → n8n)</h4>
          {FIELD_DEFS.filter((f) => f.section === "out").map(({ key, label, placeholder }) => (
            <SettingsInput key={key} label={label} value={v(key)} onChange={(val) => setValue(key, val)} placeholder={placeholder} />
          ))}
          <p className="text-[10px] text-slate-400 italic">
            Estes webhooks notificam o n8n sobre eventos de negócio no CRM (novo cliente, lead, pagamento, etc.).
          </p>
        </div>

        {/* Google Drive */}
        <div className="space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Google Drive — Pastas e Documentos</h4>
          <p className="text-[10px] text-slate-400 italic">
            Webhooks para criação automática de pastas e operações de documentos (listar, upload, subpasta).
            O webhook de "Ações no Drive" é o principal — usado para todas as operações da aba Documentos.
          </p>
          {FIELD_DEFS.filter((f) => f.section === "drive").map(({ key, label, placeholder }) => (
            <SettingsInput key={key} label={label} value={v(key)} onChange={(val) => setValue(key, val)} placeholder={placeholder} />
          ))}
        </div>

        {/* Ingestão */}
        <div className="space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Ingestão de Dados (n8n → CRM)</h4>
          {FIELD_DEFS.filter((f) => f.section === "in").map(({ key, label, placeholder }) => (
            <SettingsInput key={key} label={label} value={v(key)} onChange={(val) => setValue(key, val)} placeholder={placeholder} />
          ))}
          <p className="text-[10px] text-slate-400 italic">
            URL onde o n8n deve postar os resultados das campanhas para atualização automática do dashboard.
          </p>
        </div>

        {/* ClickUp */}
        <div className="space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">ClickUp — Terceirizados</h4>
          <p className="text-[10px] text-slate-400 italic">
            Integração com ClickUp para sincronizar projetos e tarefas de terceirizados. Funciona no plano Free do ClickUp.
          </p>
          {FIELD_DEFS.filter((f) => f.section === "clickup").map(({ key, label, placeholder }) => (
            <SettingsInput key={key} label={label} value={v(key)} onChange={(val) => setValue(key, val)} placeholder={placeholder} />
          ))}
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="text-xs font-medium">Sincronização manual</p>
              <p className="text-[10px] text-slate-400">Dispara o polling imediatamente sem aguardar os 15 minutos.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={syncing || !v("clickupSyncWebhookUrl")}
              className="gap-2"
            >
              <RefreshCcw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          </div>
        </div>

        {/* Ads Sync */}
        <div className="space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Ads — Meta & Google</h4>
          <p className="text-[10px] text-slate-400 italic">
            Webhook usado para disparar a sincronização de campanhas dos clientes (Meta Ads e Google Ads).
            O mesmo endpoint recebe o <code>organization_id</code> para sync geral ou <code>client_id</code> + <code>integration_id</code> para sync individual.
          </p>
          {FIELD_DEFS.filter((f) => f.section === "ads").map(({ key, label, placeholder }) => (
            <SettingsInput key={key} label={label} value={v(key)} onChange={(val) => setValue(key, val)} placeholder={placeholder} />
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Salvando..." : "Salvar Configurações n8n"}
          </Button>
          {isDirty && (
            <Button variant="outline" onClick={handleDiscard} disabled={saving}>
              Descartar
            </Button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
