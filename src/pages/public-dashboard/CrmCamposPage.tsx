/**
 * CrmCamposPage — Configuração de Campos do CRM
 *
 * Mostra TODOS os campos de cada entidade:
 *   1. Campos Padrão — fixos do sistema, com toggle para ativar/desativar.
 *      Campos obrigatórios ficam sempre ativos (toggle desabilitado).
 *   2. Campos Personalizados — criados pelo cliente.
 *
 * Acessível apenas por owner e admin.
 */
import { useState, useCallback, useEffect } from "react";
import { Loader2, Users, GitMerge, Package, List, Lock, Eye, EyeOff, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { CrmSettingsPanel, type CrmData, type CustomFieldEntity } from "./components/CrmSettingsPanel";

// ─── Definição dos campos padrão por entidade ─────────────────────────────────
// required: true = obrigatório estrutural, toggle sempre desabilitado
// required: false = opcional, tenant pode desativar

interface DefaultField {
  field_key:    string;
  label:        string;
  description?: string;
  required:     boolean;  // estruturalmente obrigatório (não pode ser desativado)
}

const DEFAULT_FIELDS: Record<CustomFieldEntity, DefaultField[]> = {
  contact: [
    { field_key: "name",             label: "Nome",              required: true },
    { field_key: "last_name",        label: "Sobrenome",         required: false },
    { field_key: "contact_type",     label: "Tipo de cadastro",  required: false, description: "Pessoa Física / Jurídica" },
    { field_key: "cpf",              label: "CPF",               required: false },
    { field_key: "cnpj",             label: "CNPJ",              required: false },
    { field_key: "birthdate",        label: "Data de nascimento", required: false },
    { field_key: "company",          label: "Empresa",           required: false },
    { field_key: "job_title",        label: "Cargo",             required: false },
    { field_key: "whatsapp",         label: "WhatsApp",          required: false },
    { field_key: "phone",            label: "Telefone",          required: false },
    { field_key: "phone2",           label: "Telefone 2",        required: false },
    { field_key: "email",            label: "E-mail",            required: false },
    { field_key: "email2",           label: "E-mail 2",          required: false },
    { field_key: "zip_code",         label: "CEP",               required: false },
    { field_key: "street",           label: "Logradouro",        required: false },
    { field_key: "street_number",    label: "Número",            required: false },
    { field_key: "complement",       label: "Complemento",       required: false },
    { field_key: "neighborhood",     label: "Bairro",            required: false },
    { field_key: "city",             label: "Cidade",            required: false },
    { field_key: "state",            label: "Estado (UF)",       required: false },
    { field_key: "origin_recent",    label: "Origem",            required: false },
    { field_key: "utm_source",       label: "UTM Source",        required: false },
    { field_key: "utm_medium",       label: "UTM Medium",        required: false },
    { field_key: "utm_campaign",     label: "UTM Campaign",      required: false },
    { field_key: "client_status",    label: "Status do cliente", required: false },
    { field_key: "notes",            label: "Observações",       required: false },
  ],
  deal: [
    { field_key: "title",              label: "Título",                required: false },
    { field_key: "contact_id",         label: "Contato",               required: false },
    { field_key: "product_id",         label: "Produto / Serviço",     required: false },
    { field_key: "value",              label: "Valor",                 required: false },
    { field_key: "discount",           label: "Desconto",              required: false },
    { field_key: "status",             label: "Status",                required: true },
    { field_key: "stage_id",           label: "Etapa do funil",        required: true },
    { field_key: "probability",        label: "Probabilidade (%)",     required: false },
    { field_key: "expected_close_date",label: "Previsão de fechamento",required: false },
    { field_key: "lost_reason",        label: "Motivo da perda",       required: false },
    { field_key: "notes",              label: "Observações",           required: false },
  ],
  product: [
    { field_key: "name",         label: "Nome",            required: true },
    { field_key: "product_type", label: "Tipo",            required: false, description: "Produto / Serviço" },
    { field_key: "sku",          label: "SKU / Código",    required: false },
    { field_key: "category",     label: "Categoria",       required: false },
    { field_key: "description",  label: "Descrição",       required: false },
    { field_key: "price",        label: "Preço padrão",    required: false },
    { field_key: "unit",         label: "Unidade",         required: false },
  ],
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FieldConfig {
  field_key:      string;
  active:         boolean;
  required:       boolean;
  order:          number;
  label_override: string | null;
}

type EntityTab = CustomFieldEntity | "all";

const ENTITY_TABS: { value: EntityTab; label: string; icon: React.ReactNode }[] = [
  { value: "all",     label: "Todos",            icon: <List className="h-3.5 w-3.5" /> },
  { value: "contact", label: "Clientes",          icon: <Users className="h-3.5 w-3.5" /> },
  { value: "deal",    label: "Oportunidades",     icon: <GitMerge className="h-3.5 w-3.5" /> },
  { value: "product", label: "Produtos/Serviços", icon: <Package className="h-3.5 w-3.5" /> },
];

// ─── Componente de linha de campo padrão ──────────────────────────────────────

function DefaultFieldRow({
  field,
  config,
  onToggle,
  saving,
}: {
  field: DefaultField;
  config: FieldConfig | undefined;
  onToggle: (fieldKey: string, active: boolean) => void;
  saving: boolean;
}) {
  const isActive = config?.active ?? true;  // padrão: ativo quando não configurado
  const isLocked = field.required;          // campos obrigatórios não podem ser desativados

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
      isActive ? "border-border/60 bg-muted/10" : "border-border/30 bg-muted/5 opacity-60"
    )}>
      {/* Ícone de cadeado para campos obrigatórios */}
      {isLocked ? (
        <Lock className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" title="Campo obrigatório — não pode ser desativado" />
      ) : (
        <div className="w-3.5 shrink-0" /> // espaçador de alinhamento
      )}

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
          {field.label}
          {isLocked && (
            <span className="ml-1.5 text-[10px] font-black text-amber-400/70 uppercase">obrigatório</span>
          )}
        </p>
        {field.description && (
          <p className="text-[10px] text-muted-foreground/60">{field.description}</p>
        )}
      </div>

      {/* Toggle — desabilitado para campos obrigatórios */}
      <div className="flex items-center gap-2 shrink-0">
        {!isActive && <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40" />}
        {isActive  && <Eye    className="h-3.5 w-3.5 text-muted-foreground/40" />}
        <Switch
          checked={isActive}
          onCheckedChange={v => !isLocked && onToggle(field.field_key, v)}
          disabled={isLocked || saving}
          className={cn(isLocked && "opacity-30 cursor-not-allowed")}
        />
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function CrmCamposPage() {
  const dc        = useDynamicClient();
  const { auth }  = useClientAuth();
  const clientId  = auth?.user?.client_id ?? "";
  const canManage = ["owner", "admin"].includes(auth?.user?.role ?? "");

  const [crmData,    setCrmData]    = useState<CrmData>({ pipelines: [], stages: [], custom_fields: [], contact_fields: [], deal_fields: [], product_fields: [] });
  const [fieldConfig, setFieldConfig] = useState<Record<CustomFieldEntity, FieldConfig[]>>({ contact: [], deal: [], product: [] });
  const [loading,    setLoading]    = useState(true);
  const [savingKey,  setSavingKey]  = useState<string | null>(null);
  const [activeTab,      setActiveTab]      = useState<EntityTab>("all");
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  const fetchData = useCallback(async () => {
    if (!dc || !clientId) return;
    setLoading(true);

    const [crmRes, cfContact, cfDeal, cfProduct] = await Promise.all([
      dc.rpc("get_crm_data",        { p_client_id: clientId }),
      dc.rpc("get_crm_field_config", { p_client_id: clientId, p_entity_type: "contact" }),
      dc.rpc("get_crm_field_config", { p_client_id: clientId, p_entity_type: "deal" }),
      dc.rpc("get_crm_field_config", { p_client_id: clientId, p_entity_type: "product" }),
    ]);

    if (!crmRes.error && crmRes.data) setCrmData(crmRes.data as CrmData);
    setFieldConfig({
      contact: (cfContact.data?.fields ?? []) as FieldConfig[],
      deal:    (cfDeal.data?.fields    ?? []) as FieldConfig[],
      product: (cfProduct.data?.fields ?? []) as FieldConfig[],
    });
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (dc) fetchData(); }, [fetchData, !!dc]);

  const handleToggle = async (entity: CustomFieldEntity, fieldKey: string, active: boolean) => {
    if (!dc || !clientId) return;
    const key = `${entity}:${fieldKey}`;
    setSavingKey(key);
    try {
      await dc.rpc("upsert_crm_field_config", {
        p_client_id:   clientId,
        p_entity_type: entity,
        p_field_key:   fieldKey,
        p_active:      active,
      });
      // Atualiza localmente sem re-fetch
      setFieldConfig(prev => {
        const list = prev[entity] ?? [];
        const exists = list.find(f => f.field_key === fieldKey);
        if (exists) {
          return { ...prev, [entity]: list.map(f => f.field_key === fieldKey ? { ...f, active } : f) };
        }
        return { ...prev, [entity]: [...list, { field_key: fieldKey, active, required: false, order: 0, label_override: null }] };
      });
    } catch { /* silencioso */ }
    finally { setSavingKey(null); }
  };

  if (!dc) return <CredentialsErrorState />;

  if (!canManage) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-20 gap-3 text-center">
        <p className="text-muted-foreground font-semibold">Acesso restrito</p>
        <p className="text-muted-foreground/70 text-sm">Somente owner e admin podem configurar campos.</p>
      </div>
    );
  }

  // Renderiza o conteúdo de uma entidade
  const renderEntity = (entity: CustomFieldEntity) => {
    const defaults     = DEFAULT_FIELDS[entity];
    const configs      = fieldConfig[entity] ?? [];
    const customFields = (() => {
      if (entity === "contact") return crmData.contact_fields ?? crmData.custom_fields.filter(f => f.entity_type === "contact");
      if (entity === "deal")    return crmData.deal_fields    ?? crmData.custom_fields.filter(f => f.entity_type === "deal");
      return crmData.product_fields ?? crmData.custom_fields.filter(f => f.entity_type === "product");
    })();

    const entityLabel = ENTITY_TABS.find(t => t.value === entity)?.label ?? entity;

    return (
      <div key={entity} className="space-y-4">
        {activeTab === "all" && (
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">
              {ENTITY_TABS.find(t => t.value === entity)?.icon}
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">
              {entityLabel}
            </span>
            <div className="flex-1 h-px bg-border/40" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Campos padrão */}
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Campos Padrão
              <span className="ml-2 font-bold text-muted-foreground/50 normal-case">
                {defaults.filter(d => {
                  const cfg = configs.find(c => c.field_key === d.field_key);
                  return cfg ? cfg.active : true;
                }).length}/{defaults.length} ativos
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              Campos com cadeado são obrigatórios e não podem ser desativados.
            </p>
            <div className="space-y-1.5">
              {defaults.map(field => (
                <DefaultFieldRow
                  key={field.field_key}
                  field={field}
                  config={configs.find(c => c.field_key === field.field_key)}
                  onToggle={(key, active) => handleToggle(entity, key, active)}
                  saving={savingKey === `${entity}:${field.field_key}`}
                />
              ))}
            </div>
          </div>

          {/* Campos personalizados */}
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Campos Personalizados
              <span className="ml-2 font-bold text-muted-foreground/50 normal-case">
                {customFields.length} campo{customFields.length !== 1 ? "s" : ""}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              Campos extras criados para este cliente.
            </p>
            {customFields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 py-6 text-center">
                <p className="text-muted-foreground/60 text-xs">Nenhum campo personalizado.</p>
                <p className="text-muted-foreground/40 text-[10px] mt-0.5">
                  Crie campos personalizados usando o botão abaixo.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {customFields.map(field => (
                  <div key={field.id} className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 border-border/60 bg-muted/10"
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{field.name}</p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono">{field.field_type}</p>
                    </div>
                    {field.required && (
                      <span className="text-[10px] text-red-400 font-bold shrink-0">*</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const entitiesToShow: CustomFieldEntity[] = activeTab === "all"
    ? ["contact", "deal", "product"]
    : [activeTab as CustomFieldEntity];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Campos"
        description="Configure quais campos aparecem nos formulários de Clientes, Oportunidades e Produtos."
      />

      {/* Abas de entidade */}
      <div className="flex gap-1 rounded-xl bg-muted/30 p-1 w-fit flex-wrap">
        {ENTITY_TABS.map(tab => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
              activeTab === tab.value
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {entitiesToShow.map(entity => renderEntity(entity))}

          {/* Seção de adição de campos personalizados */}
          <div className="border-t border-border/40 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">Adicionar Campos Personalizados</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Crie campos extras específicos para o seu negócio.
                </p>
              </div>
              <Button
                onClick={() => {
                  // Abre o CrmSettingsPanel em modal — redireciona para a seção de criação
                  setShowCreatePanel(true);
                }}
                className="bg-gradient-ember text-primary-foreground shadow-glow gap-2"
              >
                <Plus className="h-4 w-4" /> Novo Campo
              </Button>
            </div>
          </div>

          {/* Painel de criação de campos personalizados (inline) */}
          {showCreatePanel && (
            <div className="rounded-xl border border-border bg-card/80 p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold">Novo Campo Personalizado</p>
                <button onClick={() => setShowCreatePanel(false)} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>
              <CrmSettingsPanel
                crmData={crmData}
                onRefresh={async () => { await fetchData(); setShowCreatePanel(false); }}
                initialSection="fields"
                hidePipelineTab
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
