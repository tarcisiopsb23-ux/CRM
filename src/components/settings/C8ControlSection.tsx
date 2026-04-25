import { useState, useEffect } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";

interface C8ControlConfig {
  appUrl?: string;
  supportEmail?: string;
  crmDataApiUrl?: string;
  crmApiKey?: string;
  c8AnonKey?: string;
  // legado
  supabaseUrl?: string;
  supabaseServiceKey?: string;
}

export function C8ControlSection() {
  const organizationId = useOrganization();
  const { data: integration, isLoading, upsert } = useIntegration(organizationId, "c8control");

  const [values, setValues] = useState<C8ControlConfig>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (integration?.config) {
      setValues(integration.config as C8ControlConfig);
    }
  }, [integration]);

  const set = (key: keyof C8ControlConfig, val: string) => {
    setValues(p => ({ ...p, [key]: val }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await upsert.mutateAsync(values as any);
      setIsDirty(false);
      toast.success("Configurações do C8 Control salvas!");
    } catch {
      toast.error("Erro ao salvar configurações.");
    }
  };

  const handleDiscard = () => {
    setValues((integration?.config as C8ControlConfig) ?? {});
    setIsDirty(false);
  };

  if (isLoading) return null;

  return (
    <SettingsSection
      title="C8 Control"
      description="Configurações de conexão com o C8 Control CRM."
      icon={<Package className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Aplicação</h4>
          <SettingsInput
            label="URL do App C8 Control"
            value={values.appUrl ?? ""}
            onChange={(v) => set("appUrl", v)}
            placeholder="https://app.c8control.com.br"
          />
          <SettingsInput
            label="E-mail de Suporte"
            value={values.supportEmail ?? ""}
            onChange={(v) => set("supportEmail", v)}
            placeholder="suporte@agenciac8.com.br"
          />
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">API de Dados (crm-data-api)</h4>
          <p className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded p-2">
            Preencha com a URL e chave da <code>crm-data-api</code> do C8 Control. Estes valores são salvos no banco e usados para buscar usuários e contagens em tempo real.
          </p>
          <SettingsInput
            label="CRM Data API URL"
            value={values.crmDataApiUrl ?? ""}
            onChange={(v) => set("crmDataApiUrl", v)}
            placeholder="https://xcymhcqbyyuozkzhpxgi.supabase.co/functions/v1/crm-data-api"
          />
          <SettingsInput
            label="CRM API Key (x-crm-api-key)"
            value={values.crmApiKey ?? ""}
            onChange={(v) => set("crmApiKey", v)}
            placeholder="uuid-secreto-compartilhado"
          />
          <SettingsInput
            label="Anon Key do Supabase do C8 Control"
            value={values.c8AnonKey ?? ""}
            onChange={(v) => set("c8AnonKey", v)}
            placeholder="eyJ... (necessário para o gateway do Supabase)"
          />
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Supabase Direto (Legado)</h4>
          <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ Usado apenas pelas edge functions de provisionamento. Configure também nos Secrets do Supabase.
          </p>
          <SettingsInput
            label="URL do Supabase (CRM_URL)"
            value={values.supabaseUrl ?? ""}
            onChange={(v) => set("supabaseUrl", v)}
            placeholder="https://xcymhcqbyyuozkzhpxgi.supabase.co"
          />
          <SettingsInput
            label="Service Key (C8_SUPABASE_SERVICE_KEY)"
            value={values.supabaseServiceKey ?? ""}
            onChange={(v) => set("supabaseServiceKey", v)}
            placeholder="eyJ..."
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!isDirty || upsert.isPending} className="flex-1">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar Configurações C8 Control
          </Button>
          {isDirty && (
            <Button variant="outline" onClick={handleDiscard}>
              Descartar
            </Button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
