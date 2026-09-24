/**
 * CrmSettingsPanel — versão public-dashboard
 *
 * Painel de configurações do CRM (Pipeline + Campos Personalizados)
 * Suporta entity_type: 'contact' | 'deal' | 'product'
 * Suporta 15 tipos de campo (v2 — migration 095)
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown,
  Loader2, Star, AlertTriangle, Columns3, Settings2,
  Type, Hash, Calendar, List, ToggleLeft, AlignLeft,
  DollarSign, Percent, Clock, CheckSquare, Phone,
  Mail, Link, CreditCard, Building2, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Tipos inline (equivalentes aos do CrmSection) ───────────────────────────

export interface CrmPipeline {
  id: string; name: string; description: string | null;
  is_default: boolean; created_at: string;
}
export interface CrmStage {
  id: string; pipeline_id: string; name: string; order: number; color: string;
}
export type CustomFieldType =
  | "text" | "number" | "date" | "select" | "boolean"
  | "textarea" | "currency" | "percent" | "datetime" | "multiselect"
  | "phone" | "email" | "url" | "cpf" | "cnpj";

export type CustomFieldEntity = "contact" | "deal" | "product";

export interface CrmCustomField {
  id: string;
  name: string;
  field_key: string;
  field_type: CustomFieldType;
  entity_type: CustomFieldEntity;
  options: string[] | null;
  required: boolean;
  visible: boolean;
  order: number;
  description?: string | null;
  placeholder?: string | null;
  default_value?: string | null;
  section?: string | null;
  max_length?: number | null;
}
export interface CrmData {
  pipelines: CrmPipeline[];
  stages: CrmStage[];
  custom_fields: CrmCustomField[];
  contact_fields?: CrmCustomField[];
  deal_fields?: CrmCustomField[];
  product_fields?: CrmCustomField[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const cls = "bg-background border-border text-foreground placeholder:text-muted-foreground";

const STAGE_COLOR_OPTIONS = [
  { label: "Roxo",     value: "#6366f1" }, { label: "Azul",     value: "#3b82f6" },
  { label: "Ciano",    value: "#06b6d4" }, { label: "Âmbar",    value: "#f59e0b" },
  { label: "Laranja",  value: "#f97316" }, { label: "Rosa",     value: "#ec4899" },
  { label: "Verde",    value: "#10b981" }, { label: "Vermelho", value: "#ef4444" },
  { label: "Cinza",    value: "#64748b" }, { label: "Lima",     value: "#84cc16" },
];

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string; icon: React.ReactNode; group: string }[] = [
  // Texto
  { value: "text",        label: "Texto curto",    icon: <Type className="h-3.5 w-3.5" />,        group: "Texto" },
  { value: "textarea",    label: "Texto longo",    icon: <AlignLeft className="h-3.5 w-3.5" />,   group: "Texto" },
  // Número
  { value: "number",      label: "Número",         icon: <Hash className="h-3.5 w-3.5" />,         group: "Número" },
  { value: "currency",    label: "Moeda",          icon: <DollarSign className="h-3.5 w-3.5" />,  group: "Número" },
  { value: "percent",     label: "Porcentagem",    icon: <Percent className="h-3.5 w-3.5" />,     group: "Número" },
  // Data
  { value: "date",        label: "Data",           icon: <Calendar className="h-3.5 w-3.5" />,    group: "Data" },
  { value: "datetime",    label: "Data e hora",    icon: <Clock className="h-3.5 w-3.5" />,       group: "Data" },
  // Seleção
  { value: "select",      label: "Seleção única",  icon: <List className="h-3.5 w-3.5" />,        group: "Seleção" },
  { value: "multiselect", label: "Seleção múltipla", icon: <CheckSquare className="h-3.5 w-3.5" />, group: "Seleção" },
  { value: "boolean",     label: "Sim / Não",      icon: <ToggleLeft className="h-3.5 w-3.5" />,  group: "Seleção" },
  // Contato
  { value: "phone",       label: "Telefone",       icon: <Phone className="h-3.5 w-3.5" />,       group: "Contato" },
  { value: "email",       label: "E-mail",         icon: <Mail className="h-3.5 w-3.5" />,        group: "Contato" },
  { value: "url",         label: "URL",            icon: <Link className="h-3.5 w-3.5" />,        group: "Contato" },
  // Documentos
  { value: "cpf",         label: "CPF",            icon: <CreditCard className="h-3.5 w-3.5" />, group: "Documento" },
  { value: "cnpj",        label: "CNPJ",           icon: <Building2 className="h-3.5 w-3.5" />,  group: "Documento" },
];

const ENTITY_OPTIONS: { value: CustomFieldEntity | "all"; label: string; icon: React.ReactNode }[] = [
  { value: "all",     label: "Todos",            icon: <List className="h-3.5 w-3.5" /> },
  { value: "contact", label: "Clientes",          icon: <Users className="h-3.5 w-3.5" /> },
  { value: "deal",    label: "Oportunidades",     icon: <Columns3 className="h-3.5 w-3.5" /> },
  { value: "product", label: "Produtos/Serviços", icon: <Hash className="h-3.5 w-3.5" /> },
];

// ─── Sub: linha de etapa ──────────────────────────────────────────────────────

function StageRow({ stage, index, total, clientId, dc, onRefresh }: {
  stage: CrmStage; index: number; total: number;
  clientId: string; dc: SupabaseClient; onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(stage.name);
  const [color, setColor]     = useState(stage.color);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Nome da etapa é obrigatório"); return; }
    setSaving(true);
    const { data, error } = await dc.rpc("manage_crm_stage", {
      p_client_id: clientId, p_action: "update",
      p_stage_id: stage.id, p_name: name.trim(), p_color: color,
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao salvar etapa"); return; }
    toast.success("Etapa atualizada"); setEditing(false); await onRefresh();
  };

  const cancel = () => { setName(stage.name); setColor(stage.color); setEditing(false); };

  const remove = async () => {
    if (!confirm(`Excluir a etapa "${stage.name}"? Leads nela precisam ser movidos antes.`)) return;
    setDeleting(true);
    const { data, error } = await dc.rpc("manage_crm_stage", {
      p_client_id: clientId, p_action: "delete", p_stage_id: stage.id,
    });
    setDeleting(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao excluir etapa"); return; }
    toast.success("Etapa excluída"); await onRefresh();
  };

  const move = async (dir: "up" | "down") => {
    const { data, error } = await dc.rpc("manage_crm_stage", {
      p_client_id: clientId, p_action: "reorder",
      p_stage_id: stage.id, p_order: dir === "up" ? index - 1 : index + 1,
    });
    if (error || !data?.success) { toast.error("Erro ao reordenar"); return; }
    await onRefresh();
  };

  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2", deleting && "opacity-40")}>
      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: editing ? color : stage.color }} />
      {editing ? (
        <div className="flex-1 space-y-2">
          <Input value={name} onChange={e => setName(e.target.value)} className={cn(cls, "h-8 text-sm")}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }} autoFocus />
          <div className="flex gap-1 flex-wrap">
            {STAGE_COLOR_OPTIONS.map(opt => (
              <button key={opt.value} title={opt.label} onClick={() => setColor(opt.value)}
                className={cn("w-5 h-5 rounded-full ring-offset-background transition-all",
                  color === opt.value ? "ring-2 ring-ring ring-offset-2" : "opacity-60 hover:opacity-100")}
                style={{ backgroundColor: opt.value }} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} className="h-7 text-xs text-muted-foreground gap-1">
              <X className="h-3 w-3" /> Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <span className="flex-1 text-sm">{stage.name}</span>
      )}
      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => move("up")} disabled={index === 0} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button onClick={() => move("down")} disabled={index === total - 1} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"><ChevronDown className="h-3.5 w-3.5" /></button>
          <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={remove} disabled={deleting} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub: linha de campo personalizado ───────────────────────────────────────

function FieldRow({ field, index, total, clientId, dc, onRefresh }: {
  field: CrmCustomField; index: number; total: number;
  clientId: string; dc: SupabaseClient; onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState(field.name);
  const [type, setType]         = useState<CustomFieldType>(field.field_type);
  const [required, setRequired] = useState(field.required);
  const [visible, setVisible]   = useState(field.visible ?? true);
  const [optionsRaw, setOptionsRaw] = useState((field.options ?? []).join(", "));
  const [description, setDescription] = useState(field.description ?? "");
  const [saving, setSaving]     = useState(false);

  const typeOpt  = FIELD_TYPE_OPTIONS.find(o => o.value === field.field_type);
  const typeIcon  = typeOpt?.icon;
  const typeLabel = typeOpt?.label ?? field.field_type;
  const hasOptions = ["select","multiselect"].includes(type);

  const save = async () => {
    if (!name.trim()) { toast.error("Nome do campo é obrigatório"); return; }
    const options = hasOptions ? optionsRaw.split(",").map(o => o.trim()).filter(Boolean) : null;
    if (hasOptions && (!options || options.length === 0)) {
      toast.error("Adicione pelo menos uma opção"); return;
    }
    setSaving(true);
    const { data, error } = await dc.rpc("manage_crm_custom_field", {
      p_client_id: clientId, p_action: "update", p_field_id: field.id,
      p_name: name.trim(), p_field_type: type,
      p_options: options ? JSON.stringify(options) : null,
      p_required: required, p_visible: visible,
      p_description: description.trim() || null,
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao salvar campo"); return; }
    toast.success("Campo atualizado"); setEditing(false); await onRefresh();
  };

  const cancel = () => {
    setName(field.name); setType(field.field_type);
    setRequired(field.required); setVisible(field.visible ?? true);
    setOptionsRaw((field.options ?? []).join(", "));
    setDescription(field.description ?? "");
    setEditing(false);
  };

  const remove = async () => {
    if (!confirm(`Desativar o campo "${field.name}"? Valores existentes serão preservados.`)) return;
    const { data, error } = await dc.rpc("manage_crm_custom_field", {
      p_client_id: clientId, p_action: "delete", p_field_id: field.id,
    });
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao remover campo"); return; }
    toast.success("Campo desativado"); await onRefresh();
  };

  const move = async (dir: "up" | "down") => {
    const { data, error } = await dc.rpc("manage_crm_custom_field", {
      p_client_id: clientId, p_action: "reorder", p_field_id: field.id,
      p_order: dir === "up" ? index - 1 : index + 1,
    });
    if (error || !data?.success) { toast.error("Erro ao reordenar"); return; }
    await onRefresh();
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className={cn(cls, "h-8 text-sm")} autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Tipo</Label>
              <Select value={type} onValueChange={v => { setType(v as CustomFieldType); setOptionsRaw(""); }}>
                <SelectTrigger className={cn(cls, "h-8 text-sm")}><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {/* Agrupa por group */}
                  {Array.from(new Set(FIELD_TYPE_OPTIONS.map(o => o.group))).map(group => (
                    <div key={group}>
                      <p className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{group}</p>
                      {FIELD_TYPE_OPTIONS.filter(o => o.group === group).map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">{opt.icon} {opt.label}</span>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasOptions && (
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Opções (separadas por vírgula)</Label>
              <Input value={optionsRaw} onChange={e => setOptionsRaw(e.target.value)} className={cn(cls, "text-sm")} placeholder="Opção A, Opção B, Opção C" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Descrição / Ajuda (opcional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className={cn(cls, "text-sm")} placeholder="Exibida abaixo do campo como dica" />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={required} onCheckedChange={setRequired} id={`req-${field.id}`} />
                <label htmlFor={`req-${field.id}`} className="text-xs text-muted-foreground cursor-pointer">Obrigatório</label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={visible} onCheckedChange={setVisible} id={`vis-${field.id}`} />
                <label htmlFor={`vis-${field.id}`} className="text-xs text-muted-foreground cursor-pointer">Visível</label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel} className="h-7 text-xs text-muted-foreground gap-1">
                <X className="h-3 w-3" /> Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground shrink-0">{typeIcon}</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm">{field.name}</span>
            {field.description && <p className="text-[10px] text-muted-foreground/60 truncate">{field.description}</p>}
          </div>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">{typeLabel}</span>
          {field.required  && <span className="text-[10px] text-red-400 font-bold shrink-0">*</span>}
          {!field.visible  && <span className="text-[10px] text-muted-foreground/40 shrink-0">oculto</span>}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => move("up")} disabled={index === 0} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"><ChevronUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => move("down")} disabled={index === total - 1} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"><ChevronDown className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={remove} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

interface CrmSettingsPanelProps {
  crmData: CrmData;
  onRefresh: () => Promise<void>;
  /** Aba inicial: 'pipeline' (padrão) ou 'fields' */
  initialSection?: SettingsSection;
  /** Oculta a aba Pipeline — útil quando exibido fora do contexto de pipeline */
  hidePipelineTab?: boolean;
}

type SettingsSection = "pipeline" | "fields";

export function CrmSettingsPanel({
  crmData,
  onRefresh,
  initialSection = "pipeline",
  hidePipelineTab = false,
}: CrmSettingsPanelProps) {
  const { auth } = useClientAuth();
  const dc = useDynamicClient();
  const clientId = auth?.user?.client_id ?? auth?.id ?? "";

  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [fieldEntity, setFieldEntity] = useState<CustomFieldEntity | "all">("all");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [savingPipeline, setSavingPipeline]   = useState(false);
  const [newStageName, setNewStageName]       = useState("");
  const [newStageColor, setNewStageColor]     = useState("#6366f1");
  const [addingStage, setAddingStage]         = useState(false);
  // Novo campo
  const [newFieldName, setNewFieldName]         = useState("");
  const [newFieldType, setNewFieldType]         = useState<CustomFieldType>("text");
  const [newFieldEntity, setNewFieldEntity]     = useState<CustomFieldEntity>("contact");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldVisible, setNewFieldVisible]   = useState(true);
  const [newFieldOptions, setNewFieldOptions]   = useState("");
  const [newFieldDescription, setNewFieldDescription] = useState("");
  const [addingField, setAddingField]           = useState(false);

  if (!dc) return <div className="text-muted-foreground text-sm p-4">Carregando...</div>;

  const activePipeline = crmData.pipelines.find(p =>
    p.id === (selectedPipelineId ?? crmData.pipelines.find(p => p.is_default)?.id)
  ) ?? crmData.pipelines[0];

  const stages = activePipeline
    ? crmData.stages.filter(s => s.pipeline_id === activePipeline.id).sort((a, b) => a.order - b.order)
    : [];

  const MAX_STAGES = 12;
  const canAddStage = stages.length < MAX_STAGES;

  // Campos por entidade — "all" mostra todos juntos
  type FieldEntityFilter = CustomFieldEntity | "all";
  const fieldsForEntity = (entity: FieldEntityFilter): CrmCustomField[] => {
    if (entity === "all")    return crmData.custom_fields;
    if (entity === "contact" && crmData.contact_fields) return crmData.contact_fields;
    if (entity === "deal"    && crmData.deal_fields)    return crmData.deal_fields;
    if (entity === "product" && crmData.product_fields) return crmData.product_fields;
    return crmData.custom_fields.filter(f => (f.entity_type ?? "deal") === entity);
  };

  const activeFields = fieldsForEntity(fieldEntity as FieldEntityFilter);

  const createPipeline = async () => {
    if (!newPipelineName.trim()) { toast.error("Nome do funil é obrigatório"); return; }
    setSavingPipeline(true);
    const { data, error } = await dc.rpc("manage_crm_pipeline", {
      p_client_id: clientId, p_action: "create",
      p_name: newPipelineName.trim(), p_is_default: crmData.pipelines.length === 0,
    });
    setSavingPipeline(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao criar funil"); return; }
    toast.success("Funil criado");
    setNewPipelineName(""); setShowNewPipeline(false);
    if (data.pipeline_id) setSelectedPipelineId(data.pipeline_id);
    await onRefresh();
  };

  const setDefault = async (pipelineId: string) => {
    const { data, error } = await dc.rpc("manage_crm_pipeline", {
      p_client_id: clientId, p_action: "update", p_pipeline_id: pipelineId, p_is_default: true,
    });
    if (error || !data?.success) { toast.error(data?.error ?? "Erro"); return; }
    toast.success("Funil padrão atualizado"); await onRefresh();
  };

  const deletePipeline = async (pipeline: CrmPipeline) => {
    if (!confirm(`Excluir o funil "${pipeline.name}"? Leads precisam ser movidos antes.`)) return;
    const { data, error } = await dc.rpc("manage_crm_pipeline", {
      p_client_id: clientId, p_action: "delete", p_pipeline_id: pipeline.id,
    });
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao excluir funil"); return; }
    toast.success("Funil excluído");
    if (selectedPipelineId === pipeline.id) setSelectedPipelineId(null);
    await onRefresh();
  };

  const addStage = async () => {
    if (!newStageName.trim() || !activePipeline) { toast.error("Nome da etapa é obrigatório"); return; }
    setAddingStage(true);
    const { data, error } = await dc.rpc("manage_crm_stage", {
      p_client_id: clientId, p_action: "create",
      p_pipeline_id: activePipeline.id, p_name: newStageName.trim(), p_color: newStageColor,
    });
    setAddingStage(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao adicionar etapa"); return; }
    toast.success("Etapa adicionada"); setNewStageName(""); setNewStageColor("#6366f1"); await onRefresh();
  };

  const createField = async () => {
    if (!newFieldName.trim()) { toast.error("Nome do campo é obrigatório"); return; }
    const hasOptions = ["select","multiselect"].includes(newFieldType);
    const options = hasOptions ? newFieldOptions.split(",").map(o => o.trim()).filter(Boolean) : null;
    if (hasOptions && (!options || options.length === 0)) {
      toast.error("Adicione pelo menos uma opção"); return;
    }
    setAddingField(true);
    const { data, error } = await dc.rpc("manage_crm_custom_field", {
      p_client_id:   clientId,
      p_action:      "create",
      p_name:        newFieldName.trim(),
      p_field_type:  newFieldType,
      p_entity_type: newFieldEntity,
      p_options:     options ? JSON.stringify(options) : null,
      p_required:    newFieldRequired,
      p_visible:     newFieldVisible,
      p_description: newFieldDescription.trim() || null,
    });
    setAddingField(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao criar campo"); return; }
    toast.success("Campo criado");
    setNewFieldName(""); setNewFieldType("text"); setNewFieldRequired(false);
    setNewFieldVisible(true); setNewFieldOptions(""); setNewFieldDescription("");
    // Muda para a aba da entidade recém-criada
    setFieldEntity(newFieldEntity);
    await onRefresh();
  };

  return (
    <div className="space-y-6">

      {/* Sub-navegação: Pipeline / Campos — oculta aba Pipeline quando hidePipelineTab */}
      {!hidePipelineTab && (
        <div className="flex gap-1 border-b border-border pb-0">
          <button onClick={() => setSection("pipeline")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
              section === "pipeline" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <Columns3 className="h-4 w-4" /> Pipeline
          </button>
          <button onClick={() => setSection("fields")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
              section === "fields" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
          <Settings2 className="h-4 w-4" /> Campos Personalizados
        </button>
      </div>
      )}

      {/* ══ Pipeline ══════════════════════════════════════════════════════ */}
      {section === "pipeline" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Funis */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Funis</p>
              <Button size="sm" variant="outline" onClick={() => setShowNewPipeline(v => !v)} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Novo Funil
              </Button>
            </div>
            {showNewPipeline && (
              <div className="flex gap-2 rounded-lg border border-border p-3">
                <Input value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createPipeline(); if (e.key === "Escape") setShowNewPipeline(false); }}
                  className={cn(cls, "flex-1")} placeholder="Nome do funil" autoFocus />
                <Button size="sm" onClick={createPipeline} disabled={savingPipeline} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                  {savingPipeline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewPipeline(false)} className="shrink-0"><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}
            {crmData.pipelines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <p className="text-muted-foreground text-sm">Nenhum funil ainda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {crmData.pipelines.map(pipeline => (
                  <div key={pipeline.id} onClick={() => setSelectedPipelineId(pipeline.id)}
                    className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all",
                      activePipeline?.id === pipeline.id
                        ? "border-primary bg-primary/20 ring-1 ring-primary/30 text-foreground"
                        : "border-border/60 bg-muted/20 hover:bg-muted/30 hover:border-border text-muted-foreground hover:text-foreground")}>
                    <span className="flex-1 text-sm font-bold">{pipeline.name}</span>
                    {pipeline.is_default && (
                      <span className="text-[10px] font-black uppercase text-amber-400 flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400" /> Padrão
                      </span>
                    )}
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {!pipeline.is_default && (
                        <button onClick={() => setDefault(pipeline.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-amber-400" title="Definir como padrão">
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {crmData.pipelines.length > 1 && (
                        <button onClick={() => deletePipeline(pipeline)} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Etapas */}
          {activePipeline ? (
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Etapas — <span className="text-foreground/70">{activePipeline.name}</span>
                <span className={cn("ml-2 font-bold", stages.length >= MAX_STAGES ? "text-red-400" : "text-muted-foreground/60")}>
                  {stages.length}/{MAX_STAGES}
                </span>
              </p>
              {stages.length >= MAX_STAGES && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300">Limite de 12 etapas atingido.</p>
                </div>
              )}
              {stages.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">Nenhuma etapa. Adicione abaixo.</p>
              ) : (
                <div className="space-y-2">
                  {stages.map((stage, i) => (
                    <StageRow key={stage.id} stage={stage} index={i} total={stages.length}
                      clientId={clientId} dc={dc} onRefresh={onRefresh} />
                  ))}
                </div>
              )}
              {canAddStage && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
                  <Label className="text-muted-foreground text-xs uppercase font-black tracking-widest">Nova Etapa</Label>
                  <Input value={newStageName} onChange={e => setNewStageName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addStage(); }}
                    className={cls} placeholder="Nome da etapa" />
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1 flex-wrap flex-1">
                      {STAGE_COLOR_OPTIONS.map(opt => (
                        <button key={opt.value} title={opt.label} onClick={() => setNewStageColor(opt.value)}
                          className={cn("w-5 h-5 rounded-full ring-offset-background transition-all",
                            newStageColor === opt.value ? "ring-2 ring-ring ring-offset-2" : "opacity-60 hover:opacity-100")}
                          style={{ backgroundColor: opt.value }} />
                      ))}
                    </div>
                    <Button size="sm" onClick={addStage} disabled={addingStage || !newStageName.trim()} className="bg-primary hover:bg-primary/90 gap-1 shrink-0">
                      {addingStage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-12">
              <p className="text-muted-foreground text-sm">Selecione um funil.</p>
            </div>
          )}
        </div>
      )}

      {/* ══ Campos Personalizados ════════════════════════════════════════ */}
      {section === "fields" && (
        <div className="space-y-4">
          {/* Selector de entidade */}
          <div className="flex gap-1 rounded-xl bg-muted/30 p-1 w-fit">
            {ENTITY_OPTIONS.map(e => (
              <button key={e.value} onClick={() => setFieldEntity(e.value as CustomFieldEntity | "all")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  fieldEntity === e.value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                )}>
                {e.icon} {e.label}
                <span className={cn("h-4 min-w-4 px-1 rounded-full text-[10px] font-black flex items-center justify-center",
                  fieldEntity === e.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {fieldsForEntity(e.value as CustomFieldEntity | "all").length}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lista de campos da entidade selecionada */}
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                {fieldEntity === "all"
                  ? `Todos os campos (${activeFields.length})`
                  : `Campos de ${ENTITY_OPTIONS.find(e => e.value === fieldEntity)?.label}`
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {fieldEntity === "all"
                  ? "Todos os campos personalizados criados."
                  : "Aparecem no formulário abaixo dos campos padrão."
                }
              </p>
              {activeFields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-8 text-center">
                  <p className="text-muted-foreground text-sm">Nenhum campo personalizado ainda.</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Crie o primeiro campo ao lado.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeFields.map((field, i) => (
                    <div key={field.id}>
                      {/* Quando mostrando "Todos", exibe separador por entidade */}
                      {fieldEntity === "all" && (i === 0 || activeFields[i - 1].entity_type !== field.entity_type) && (
                        <div className="flex items-center gap-2 pt-2 pb-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                            {ENTITY_OPTIONS.find(e => e.value === field.entity_type)?.label ?? field.entity_type}
                          </span>
                          <div className="flex-1 h-px bg-border/40" />
                        </div>
                      )}
                      <FieldRow field={field} index={i} total={activeFields.length}
                        clientId={clientId} dc={dc} onRefresh={onRefresh} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Formulário novo campo */}
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Novo Campo</p>
              <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">

                {/* Entidade */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Pertence a</Label>
                  <Select value={newFieldEntity} onValueChange={v => setNewFieldEntity(v as CustomFieldEntity)}>
                    <SelectTrigger className={cls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ENTITY_OPTIONS.filter(e => e.value !== "all").map(e => (
                        <SelectItem key={e.value} value={e.value}>
                          <span className="flex items-center gap-2">{e.icon} {e.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Nome + Tipo */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nome do campo</Label>
                    <Input value={newFieldName} onChange={e => setNewFieldName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") createField(); }}
                      className={cls} placeholder="Ex: CPF, Segmento" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tipo</Label>
                    <Select value={newFieldType} onValueChange={v => { setNewFieldType(v as CustomFieldType); setNewFieldOptions(""); }}>
                      <SelectTrigger className={cls}><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {Array.from(new Set(FIELD_TYPE_OPTIONS.map(o => o.group))).map(group => (
                          <div key={group}>
                            <p className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{group}</p>
                            {FIELD_TYPE_OPTIONS.filter(o => o.group === group).map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className="flex items-center gap-2">{opt.icon} {opt.label}</span>
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Opções (select/multiselect) */}
                {["select","multiselect"].includes(newFieldType) && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Opções (separadas por vírgula)</Label>
                    <Input value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)}
                      className={cls} placeholder="Opção A, Opção B, Opção C" />
                  </div>
                )}

                {/* Descrição */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Descrição / Ajuda (opcional)</Label>
                  <Input value={newFieldDescription} onChange={e => setNewFieldDescription(e.target.value)}
                    className={cls} placeholder="Texto de ajuda exibido abaixo do campo" />
                </div>

                {/* Switches */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Switch checked={newFieldRequired} onCheckedChange={setNewFieldRequired} id="new-req" />
                    <label htmlFor="new-req" className="text-sm text-muted-foreground cursor-pointer">Obrigatório</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={newFieldVisible} onCheckedChange={setNewFieldVisible} id="new-vis" />
                    <label htmlFor="new-vis" className="text-sm text-muted-foreground cursor-pointer">Visível</label>
                  </div>
                </div>

                <Button onClick={createField} disabled={addingField || !newFieldName.trim()}
                  className="w-full bg-primary hover:bg-primary/90 gap-2">
                  {addingField ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar Campo
                </Button>
              </div>

              {/* Referência de tipos */}
              <div className="rounded-lg bg-muted/10 border border-border/60 p-3 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest mb-2">Tipos disponíveis</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {FIELD_TYPE_OPTIONS.map(opt => (
                    <div key={opt.value} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                      <span className="text-muted-foreground/50 shrink-0">{opt.icon}</span>
                      <span className="font-semibold text-muted-foreground/70">{opt.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}