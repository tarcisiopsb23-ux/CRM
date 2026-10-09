/**
 * CrmSettingsPanel
 *
 * Painel unificado de configurações do CRM, exibido como aba dentro do módulo.
 * Contém duas seções:
 *   1. Pipeline — gerenciar funis e etapas
 *   2. Campos Personalizados — criar/editar/remover campos extras no formulário de lead
 *
 * Não abre modais separados: tudo inline dentro do próprio painel.
 */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
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
  Type, Hash, Calendar, List, ToggleLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmData, CrmPipeline, CrmStage, CrmCustomField, CustomFieldType } from "./types";
import { STAGE_COLOR_OPTIONS } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSession() {
  try { return JSON.parse(localStorage.getItem("client_auth") ?? "{}"); } catch { return {}; }
}

const cls = "bg-slate-800 border-slate-700 text-white placeholder:text-slate-600";

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string; icon: React.ReactNode }[] = [
  { value: "text",    label: "Texto",   icon: <Type className="h-3.5 w-3.5" /> },
  { value: "number",  label: "Número",  icon: <Hash className="h-3.5 w-3.5" /> },
  { value: "date",    label: "Data",    icon: <Calendar className="h-3.5 w-3.5" /> },
  { value: "select",  label: "Seleção", icon: <List className="h-3.5 w-3.5" /> },
  { value: "boolean", label: "Sim/Não", icon: <ToggleLeft className="h-3.5 w-3.5" /> },
];

// ─── Sub: linha de etapa ──────────────────────────────────────────────────────

function StageRow({
  stage, index, total, clientId, onRefresh,
}: {
  stage: CrmStage;
  index: number;
  total: number;
  clientId: string;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState(stage.name);
  const [color, setColor]       = useState(stage.color);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Nome da etapa é obrigatório"); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("manage_crm_stage", {
      p_client_id: clientId, p_action: "update",
      p_stage_id: stage.id, p_name: name.trim(), p_color: color,
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao salvar etapa"); return; }
    toast.success("Etapa atualizada");
    setEditing(false);
    await onRefresh();
  };

  const cancel = () => { setName(stage.name); setColor(stage.color); setEditing(false); };

  const remove = async () => {
    if (!confirm(`Excluir a etapa "${stage.name}"? Leads nela precisam ser movidos antes.`)) return;
    setDeleting(true);
    const { data, error } = await supabase.rpc("manage_crm_stage", {
      p_client_id: clientId, p_action: "delete", p_stage_id: stage.id,
    });
    setDeleting(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao excluir etapa"); return; }
    toast.success("Etapa excluída");
    await onRefresh();
  };

  const move = async (dir: "up" | "down") => {
    const { data, error } = await supabase.rpc("manage_crm_stage", {
      p_client_id: clientId, p_action: "reorder",
      p_stage_id: stage.id, p_order: dir === "up" ? index - 1 : index + 1,
    });
    if (error || !data?.success) { toast.error("Erro ao reordenar"); return; }
    await onRefresh();
  };

  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2",
      deleting && "opacity-40"
    )}>
      <span className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: editing ? color : stage.color }} />

      {editing ? (
        <div className="flex-1 space-y-2">
          <Input value={name} onChange={e => setName(e.target.value)} className={cn(cls, "h-8 text-sm")}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }} autoFocus />
          <div className="flex gap-1 flex-wrap">
            {STAGE_COLOR_OPTIONS.map(opt => (
              <button key={opt.value} title={opt.label} onClick={() => setColor(opt.value)}
                className={cn("w-5 h-5 rounded-full ring-offset-slate-900 transition-all",
                  color === opt.value ? "ring-2 ring-white ring-offset-2" : "opacity-60 hover:opacity-100")}
                style={{ backgroundColor: opt.value }} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} className="h-7 text-xs text-slate-400 gap-1">
              <X className="h-3 w-3" />Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <span className="flex-1 text-sm text-slate-200">{stage.name}</span>
      )}

      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => move("up")} disabled={index === 0}
            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => move("down")} disabled={index === total - 1}
            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={remove} disabled={deleting}
            className="p-1 rounded hover:bg-red-900/40 text-slate-400 hover:text-red-400">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub: linha de campo personalizado ───────────────────────────────────────

function FieldRow({
  field, index, total, clientId, onRefresh,
}: {
  field: CrmCustomField;
  index: number;
  total: number;
  clientId: string;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing]     = useState(false);
  const [name, setName]           = useState(field.name);
  const [type, setType]           = useState<CustomFieldType>(field.field_type);
  const [required, setRequired]   = useState(field.required);
  const [optionsRaw, setOptionsRaw] = useState((field.options ?? []).join(", "));
  const [saving, setSaving]       = useState(false);

  const typeLabel = FIELD_TYPE_OPTIONS.find(o => o.value === field.field_type)?.label ?? field.field_type;
  const typeIcon  = FIELD_TYPE_OPTIONS.find(o => o.value === field.field_type)?.icon;

  const save = async () => {
    if (!name.trim()) { toast.error("Nome do campo é obrigatório"); return; }
    const options = type === "select"
      ? optionsRaw.split(",").map(o => o.trim()).filter(Boolean) : null;
    setSaving(true);
    const { data, error } = await supabase.rpc("manage_crm_custom_field", {
      p_client_id: clientId, p_action: "update", p_field_id: field.id,
      p_name: name.trim(), p_field_type: type,
      p_options: options ? JSON.stringify(options) : null, p_required: required,
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao salvar campo"); return; }
    toast.success("Campo atualizado");
    setEditing(false);
    await onRefresh();
  };

  const cancel = () => {
    setName(field.name); setType(field.field_type);
    setRequired(field.required); setOptionsRaw((field.options ?? []).join(", "));
    setEditing(false);
  };

  const remove = async () => {
    if (!confirm(`Desativar o campo "${field.name}"? Valores existentes serão preservados.`)) return;
    const { data, error } = await supabase.rpc("manage_crm_custom_field", {
      p_client_id: clientId, p_action: "delete", p_field_id: field.id,
    });
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao remover campo"); return; }
    toast.success("Campo desativado");
    await onRefresh();
  };

  const move = async (dir: "up" | "down") => {
    const { data, error } = await supabase.rpc("manage_crm_custom_field", {
      p_client_id: clientId, p_action: "reorder", p_field_id: field.id,
      p_order: dir === "up" ? index - 1 : index + 1,
    });
    if (error || !data?.success) { toast.error("Erro ao reordenar"); return; }
    await onRefresh();
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)}
                className={cn(cls, "h-8 text-sm")} autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Tipo</Label>
              <Select value={type} onValueChange={v => setType(v as CustomFieldType)}>
                <SelectTrigger className={cn(cls, "h-8 text-sm")}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-white">
                  {FIELD_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">{opt.icon} {opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {type === "select" && (
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Opções (separadas por vírgula)</Label>
              <Input value={optionsRaw} onChange={e => setOptionsRaw(e.target.value)}
                className={cn(cls, "text-sm")} placeholder="Opção A, Opção B, Opção C" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={required} onCheckedChange={setRequired} />
              <span className="text-xs text-slate-400">Obrigatório</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel} className="h-7 text-xs text-slate-400 gap-1">
                <X className="h-3 w-3" />Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-slate-500 shrink-0">{typeIcon}</span>
          <span className="flex-1 text-sm text-slate-200">{field.name}</span>
          <span className="text-[10px] text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded font-mono shrink-0">
            {typeLabel}
          </span>
          {field.required && <span className="text-[10px] text-red-400 font-bold shrink-0">*</span>}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => move("up")} disabled={index === 0}
              className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => move("down")} disabled={index === total - 1}
              className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={remove}
              className="p-1 rounded hover:bg-red-900/40 text-slate-400 hover:text-red-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
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
}

type SettingsSection = "pipeline" | "fields";

export function CrmSettingsPanel({ crmData, onRefresh }: CrmSettingsPanelProps) {
  const session   = getSession();
  const clientId  = session?.client_id as string;

  const [section, setSection] = useState<SettingsSection>("pipeline");

  // ── Pipeline ──
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [showNewPipeline, setShowNewPipeline]         = useState(false);
  const [newPipelineName, setNewPipelineName]         = useState("");
  const [savingPipeline, setSavingPipeline]           = useState(false);
  const [newStageName, setNewStageName]               = useState("");
  const [newStageColor, setNewStageColor]             = useState("#6366f1");
  const [addingStage, setAddingStage]                 = useState(false);

  // ── Campos ──
  const [newFieldName, setNewFieldName]       = useState("");
  const [newFieldType, setNewFieldType]       = useState<CustomFieldType>("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [addingField, setAddingField]         = useState(false);

  const activePipeline: CrmPipeline | undefined =
    crmData.pipelines.find(p => p.id === (selectedPipelineId ?? crmData.pipelines.find(p => p.is_default)?.id))
    ?? crmData.pipelines[0];

  const stages: CrmStage[] = activePipeline
    ? crmData.stages.filter(s => s.pipeline_id === activePipeline.id).sort((a, b) => a.order - b.order)
    : [];

  const MAX_STAGES = 12;
  const canAddStage = stages.length < MAX_STAGES;

  // ── Criar funil ──
  const createPipeline = async () => {
    if (!newPipelineName.trim()) { toast.error("Nome do funil é obrigatório"); return; }
    setSavingPipeline(true);
    const isFirst = crmData.pipelines.length === 0;
    const { data, error } = await supabase.rpc("manage_crm_pipeline", {
      p_client_id: clientId, p_action: "create",
      p_name: newPipelineName.trim(), p_is_default: isFirst,
    });
    setSavingPipeline(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao criar funil"); return; }
    toast.success("Funil criado");
    setNewPipelineName(""); setShowNewPipeline(false);
    if (data.pipeline_id) setSelectedPipelineId(data.pipeline_id);
    await onRefresh();
  };

  // ── Definir funil default ──
  const setDefault = async (pipelineId: string) => {
    const { data, error } = await supabase.rpc("manage_crm_pipeline", {
      p_client_id: clientId, p_action: "update",
      p_pipeline_id: pipelineId, p_is_default: true,
    });
    if (error || !data?.success) { toast.error(data?.error ?? "Erro"); return; }
    toast.success("Funil padrão atualizado");
    await onRefresh();
  };

  // ── Excluir funil ──
  const deletePipeline = async (pipeline: CrmPipeline) => {
    if (!confirm(`Excluir o funil "${pipeline.name}"? Leads precisam ser movidos antes.`)) return;
    const { data, error } = await supabase.rpc("manage_crm_pipeline", {
      p_client_id: clientId, p_action: "delete", p_pipeline_id: pipeline.id,
    });
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao excluir funil"); return; }
    toast.success("Funil excluído");
    if (selectedPipelineId === pipeline.id) setSelectedPipelineId(null);
    await onRefresh();
  };

  // ── Adicionar etapa ──
  const addStage = async () => {
    if (!newStageName.trim()) { toast.error("Nome da etapa é obrigatório"); return; }
    if (!activePipeline) return;
    setAddingStage(true);
    const { data, error } = await supabase.rpc("manage_crm_stage", {
      p_client_id: clientId, p_action: "create",
      p_pipeline_id: activePipeline.id,
      p_name: newStageName.trim(), p_color: newStageColor,
    });
    setAddingStage(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao adicionar etapa"); return; }
    toast.success("Etapa adicionada");
    setNewStageName(""); setNewStageColor("#6366f1");
    await onRefresh();
  };

  // ── Criar campo ──
  const createField = async () => {
    if (!newFieldName.trim()) { toast.error("Nome do campo é obrigatório"); return; }
    const options = newFieldType === "select"
      ? newFieldOptions.split(",").map(o => o.trim()).filter(Boolean) : null;
    if (newFieldType === "select" && (!options || options.length === 0)) {
      toast.error("Adicione pelo menos uma opção para campo de seleção"); return;
    }
    setAddingField(true);
    const { data, error } = await supabase.rpc("manage_crm_custom_field", {
      p_client_id: clientId, p_action: "create",
      p_name: newFieldName.trim(), p_field_type: newFieldType,
      p_options: options ? JSON.stringify(options) : null, p_required: newFieldRequired,
    });
    setAddingField(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao criar campo"); return; }
    toast.success("Campo criado");
    setNewFieldName(""); setNewFieldType("text"); setNewFieldRequired(false); setNewFieldOptions("");
    await onRefresh();
  };

  return (
    <div className="space-y-6">

      {/* ── Sub-navegação Pipeline / Campos ── */}
      <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1 w-fit">
        <button
          onClick={() => setSection("pipeline")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
            section === "pipeline"
              ? "bg-[#7C3AED] text-white shadow"
              : "text-slate-400 hover:text-white"
          )}
        >
          <Columns3 className="h-4 w-4" /> Pipeline
        </button>
        <button
          onClick={() => setSection("fields")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
            section === "fields"
              ? "bg-[#7C3AED] text-white shadow"
              : "text-slate-400 hover:text-white"
          )}
        >
          <Settings2 className="h-4 w-4" /> Campos
        </button>
      </div>

      {/* ══ SEÇÃO: PIPELINE ══════════════════════════════════════════════════ */}
      {section === "pipeline" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Coluna esquerda: funis */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Funis</p>
              <Button size="sm" variant="outline"
                onClick={() => setShowNewPipeline(v => !v)}
                className="h-7 text-xs border-slate-600 text-slate-300 hover:bg-slate-700 gap-1">
                <Plus className="h-3 w-3" /> Novo Funil
              </Button>
            </div>

            {showNewPipeline && (
              <div className="flex gap-2 rounded-lg border border-slate-600 bg-slate-900/50 p-3">
                <Input value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createPipeline(); if (e.key === "Escape") setShowNewPipeline(false); }}
                  className={cn(cls, "flex-1")} placeholder="Nome do funil (ex: Vendas B2B)" autoFocus />
                <Button size="sm" onClick={createPipeline} disabled={savingPipeline}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-1 shrink-0">
                  {savingPipeline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewPipeline(false)}
                  className="text-slate-400 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {crmData.pipelines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 py-8 text-center">
                <p className="text-slate-500 text-sm">Nenhum funil ainda.</p>
                <p className="text-slate-600 text-xs mt-1">Crie o primeiro funil acima.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {crmData.pipelines.map(pipeline => (
                  <div key={pipeline.id}
                    onClick={() => setSelectedPipelineId(pipeline.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                      activePipeline?.id === pipeline.id
                        ? "border-[#7C3AED] bg-[#7C3AED]/10"
                        : "border-slate-700 bg-slate-900/30 hover:border-slate-500"
                    )}>
                    <span className="flex-1 text-sm font-bold text-slate-200">{pipeline.name}</span>
                    {pipeline.is_default && (
                      <span className="text-[10px] font-black uppercase text-amber-400 flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400" /> Padrão
                      </span>
                    )}
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {!pipeline.is_default && (
                        <button onClick={() => setDefault(pipeline.id)}
                          className="p-1 rounded hover:bg-amber-900/30 text-slate-500 hover:text-amber-400"
                          title="Definir como padrão">
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {crmData.pipelines.length > 1 && (
                        <button onClick={() => deletePipeline(pipeline)}
                          className="p-1 rounded hover:bg-red-900/40 text-slate-500 hover:text-red-400"
                          title="Excluir funil">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coluna direita: etapas do funil selecionado */}
          {activePipeline ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Etapas — <span className="text-slate-400">{activePipeline.name}</span>
                  <span className={cn("ml-2 font-bold",
                    stages.length >= MAX_STAGES ? "text-red-400" : "text-slate-600")}>
                    {stages.length}/{MAX_STAGES}
                  </span>
                </p>
              </div>

              {stages.length >= MAX_STAGES && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300">Limite de 12 etapas atingido. Remova uma para adicionar outra.</p>
                </div>
              )}

              {stages.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">
                  Nenhuma etapa. Adicione a primeira abaixo.
                </p>
              ) : (
                <div className="space-y-2">
                  {stages.map((stage, i) => (
                    <StageRow key={stage.id} stage={stage} index={i} total={stages.length}
                      clientId={clientId} onRefresh={onRefresh} />
                  ))}
                </div>
              )}

              {canAddStage && (
                <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/30 p-3">
                  <Label className="text-slate-400 text-xs uppercase font-black tracking-widest">Nova Etapa</Label>
                  <Input value={newStageName} onChange={e => setNewStageName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addStage(); }}
                    className={cls} placeholder="Nome da etapa (ex: Contato Feito)" />
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1 flex-wrap flex-1">
                      {STAGE_COLOR_OPTIONS.map(opt => (
                        <button key={opt.value} title={opt.label} onClick={() => setNewStageColor(opt.value)}
                          className={cn("w-5 h-5 rounded-full ring-offset-slate-900 transition-all",
                            newStageColor === opt.value ? "ring-2 ring-white ring-offset-2" : "opacity-60 hover:opacity-100")}
                          style={{ backgroundColor: opt.value }} />
                      ))}
                    </div>
                    <Button size="sm" onClick={addStage} disabled={addingStage || !newStageName.trim()}
                      className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-1 shrink-0">
                      {addingStage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Adicionar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-700 py-12">
              <p className="text-slate-500 text-sm">Selecione um funil para ver as etapas.</p>
            </div>
          )}
        </div>
      )}

      {/* ══ SEÇÃO: CAMPOS PERSONALIZADOS ═════════════════════════════════════ */}
      {section === "fields" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Coluna esquerda: campos existentes */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              Campos Ativos
              <span className="ml-2 text-slate-600 font-bold">
                {crmData.custom_fields.length} configurado{crmData.custom_fields.length !== 1 ? "s" : ""}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              Aparecem no formulário de lead abaixo dos campos padrão.
            </p>

            {crmData.custom_fields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 py-8 text-center">
                <p className="text-slate-500 text-sm">Nenhum campo personalizado ainda.</p>
                <p className="text-slate-600 text-xs mt-1">Adicione à direita para começar.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {crmData.custom_fields.map((field, i) => (
                  <FieldRow key={field.id} field={field} index={i}
                    total={crmData.custom_fields.length} clientId={clientId} onRefresh={onRefresh} />
                ))}
              </div>
            )}
          </div>

          {/* Coluna direita: adicionar novo campo */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Novo Campo</p>
            <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Nome</Label>
                  <Input value={newFieldName} onChange={e => setNewFieldName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createField(); }}
                    className={cls} placeholder="Ex: CPF, Instagram, Segmento" />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Tipo</Label>
                  <Select value={newFieldType} onValueChange={v => { setNewFieldType(v as CustomFieldType); setNewFieldOptions(""); }}>
                    <SelectTrigger className={cls}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      {FIELD_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">{opt.icon} {opt.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newFieldType === "select" && (
                <div className="space-y-1">
                  <Label className="text-slate-300">Opções (separadas por vírgula)</Label>
                  <Input value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)}
                    className={cls} placeholder="Pequeno, Médio, Grande" />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={newFieldRequired} onCheckedChange={setNewFieldRequired} />
                  <span className="text-sm text-slate-400">Obrigatório</span>
                </div>
                <Button onClick={createField} disabled={addingField || !newFieldName.trim()}
                  className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2">
                  {addingField ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar Campo
                </Button>
              </div>
            </div>

            {/* Referência de tipos */}
            <div className="rounded-lg bg-slate-900/50 border border-slate-700 px-4 py-3 space-y-1.5">
              <p className="text-xs font-bold text-slate-400">Tipos disponíveis</p>
              {FIELD_TYPE_OPTIONS.map(opt => (
                <div key={opt.value} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="text-slate-400 shrink-0">{opt.icon}</span>
                  <span className="font-bold text-slate-400 w-14 shrink-0">{opt.label}</span>
                  <span>
                    {opt.value === "text"    && "texto livre"}
                    {opt.value === "number"  && "valor numérico"}
                    {opt.value === "date"    && "data (calendário)"}
                    {opt.value === "select"  && "lista de opções fixas"}
                    {opt.value === "boolean" && "sim / não"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
