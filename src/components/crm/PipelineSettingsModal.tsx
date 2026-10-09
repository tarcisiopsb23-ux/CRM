import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown,
  Loader2, Star, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmData, CrmPipeline, CrmStage } from "./types";
import { STAGE_COLOR_OPTIONS } from "./types";

interface PipelineSettingsModalProps {
  open: boolean;
  onClose: () => void;
  crmData: CrmData;
  onRefresh: () => Promise<void>;
}

function getSession() {
  try { return JSON.parse(localStorage.getItem("client_auth") ?? "{}"); } catch { return {}; }
}

const cls = "bg-slate-900 border-slate-700 text-white placeholder:text-slate-600";

// ─── Sub-componente: edição inline de um stage ────────────────────────────────
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
      p_client_id: clientId,
      p_action:    "update",
      p_stage_id:  stage.id,
      p_name:      name.trim(),
      p_color:     color,
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao salvar etapa"); return; }
    toast.success("Etapa atualizada");
    setEditing(false);
    await onRefresh();
  };

  const cancel = () => { setName(stage.name); setColor(stage.color); setEditing(false); };

  const remove = async () => {
    if (!confirm(`Excluir a etapa "${stage.name}"? Os leads nela precisam ser movidos antes.`)) return;
    setDeleting(true);
    const { data, error } = await supabase.rpc("manage_crm_stage", {
      p_client_id: clientId,
      p_action:    "delete",
      p_stage_id:  stage.id,
    });
    setDeleting(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao excluir etapa"); return; }
    toast.success("Etapa excluída");
    await onRefresh();
  };

  const move = async (direction: "up" | "down") => {
    const newOrder = direction === "up" ? index - 1 : index + 1;
    const { data, error } = await supabase.rpc("manage_crm_stage", {
      p_client_id: clientId,
      p_action:    "reorder",
      p_stage_id:  stage.id,
      p_order:     newOrder,
    });
    if (error || !data?.success) { toast.error("Erro ao reordenar"); return; }
    await onRefresh();
  };

  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2",
      deleting && "opacity-50"
    )}>
      {/* Cor */}
      <span
        className="w-3 h-3 rounded-full shrink-0 ring-1 ring-slate-600"
        style={{ backgroundColor: editing ? color : stage.color }}
      />

      {editing ? (
        <div className="flex-1 flex flex-col gap-2">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className={cn(cls, "h-8 text-sm")}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            autoFocus
          />
          {/* Seletor de cor */}
          <div className="flex gap-1 flex-wrap">
            {STAGE_COLOR_OPTIONS.map(opt => (
              <button
                key={opt.value}
                title={opt.label}
                onClick={() => setColor(opt.value)}
                className={cn(
                  "w-5 h-5 rounded-full ring-offset-slate-900 transition-all",
                  color === opt.value ? "ring-2 ring-white ring-offset-2" : "opacity-70 hover:opacity-100"
                )}
                style={{ backgroundColor: opt.value }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} className="h-7 text-xs text-slate-400 gap-1">
              <X className="h-3 w-3" /> Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <span className="flex-1 text-sm text-slate-200">{stage.name}</span>
      )}

      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => move("up")}
            disabled={index === 0}
            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => move("down")}
            disabled={index === total - 1}
            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={remove}
            disabled={deleting}
            className="p-1 rounded hover:bg-red-900/40 text-slate-400 hover:text-red-400"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function PipelineSettingsModal({
  open, onClose, crmData, onRefresh,
}: PipelineSettingsModalProps) {
  const session = getSession();
  const clientId = session?.client_id as string;

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [addingStage, setAddingStage] = useState(false);

  // Campos para novo funil
  const [newPipelineName, setNewPipelineName] = useState("");
  const [showNewPipeline, setShowNewPipeline] = useState(false);

  // Campos para nova etapa
  const [newStageName, setNewStageName]   = useState("");
  const [newStageColor, setNewStageColor] = useState("#6366f1");

  // Pipeline selecionado (ou o default)
  const activePipeline: CrmPipeline | undefined =
    crmData.pipelines.find(p => p.id === (selectedPipelineId ?? crmData.pipelines.find(p => p.is_default)?.id))
    ?? crmData.pipelines[0];

  const stages: CrmStage[] = activePipeline
    ? crmData.stages.filter(s => s.pipeline_id === activePipeline.id).sort((a, b) => a.order - b.order)
    : [];

  const MAX_STAGES = 12;
  const canAddStage = stages.length < MAX_STAGES;

  // ── Criar novo pipeline ──
  const createPipeline = async () => {
    if (!newPipelineName.trim()) { toast.error("Nome do funil é obrigatório"); return; }
    setSaving(true);
    const isFirst = crmData.pipelines.length === 0;
    const { data, error } = await supabase.rpc("manage_crm_pipeline", {
      p_client_id:  clientId,
      p_action:     "create",
      p_name:       newPipelineName.trim(),
      p_is_default: isFirst,
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao criar funil"); return; }
    toast.success("Funil criado");
    setNewPipelineName("");
    setShowNewPipeline(false);
    if (data.pipeline_id) setSelectedPipelineId(data.pipeline_id);
    await onRefresh();
  };

  // ── Definir como default ──
  const setDefault = async (pipelineId: string) => {
    const { data, error } = await supabase.rpc("manage_crm_pipeline", {
      p_client_id:  clientId,
      p_action:     "update",
      p_pipeline_id: pipelineId,
      p_is_default: true,
    });
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao definir padrão"); return; }
    toast.success("Funil padrão atualizado");
    await onRefresh();
  };

  // ── Excluir pipeline ──
  const deletePipeline = async (pipeline: CrmPipeline) => {
    if (!confirm(`Excluir o funil "${pipeline.name}"? Todos os leads precisam ser movidos antes.`)) return;
    const { data, error } = await supabase.rpc("manage_crm_pipeline", {
      p_client_id:  clientId,
      p_action:     "delete",
      p_pipeline_id: pipeline.id,
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
      p_client_id:   clientId,
      p_action:      "create",
      p_pipeline_id: activePipeline.id,
      p_name:        newStageName.trim(),
      p_color:       newStageColor,
    });
    setAddingStage(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao adicionar etapa"); return; }
    toast.success("Etapa adicionada");
    setNewStageName("");
    setNewStageColor("#6366f1");
    await onRefresh();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1E293B] border-slate-700 text-slate-100 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-black flex items-center gap-2">
            Configurar Pipeline
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* ── Lista de Funis ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Funis</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNewPipeline(v => !v)}
                className="h-7 text-xs border-slate-600 text-slate-300 hover:bg-slate-700 gap-1"
              >
                <Plus className="h-3 w-3" /> Novo Funil
              </Button>
            </div>

            {/* Formulário novo funil */}
            {showNewPipeline && (
              <div className="flex gap-2 rounded-lg border border-slate-600 bg-slate-900/50 p-3">
                <Input
                  value={newPipelineName}
                  onChange={e => setNewPipelineName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createPipeline(); if (e.key === "Escape") setShowNewPipeline(false); }}
                  className={cn(cls, "flex-1")}
                  placeholder="Nome do funil (ex: Vendas B2B)"
                  autoFocus
                />
                <Button size="sm" onClick={createPipeline} disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-1 shrink-0">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewPipeline(false)}
                  className="text-slate-400 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {crmData.pipelines.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">Nenhum funil criado ainda.</p>
            ) : (
              <div className="space-y-2">
                {crmData.pipelines.map(pipeline => (
                  <div
                    key={pipeline.id}
                    onClick={() => setSelectedPipelineId(pipeline.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                      (selectedPipelineId ?? crmData.pipelines.find(p => p.is_default)?.id) === pipeline.id
                        ? "border-[#7C3AED] bg-[#7C3AED]/10"
                        : "border-slate-700 bg-slate-900/30 hover:border-slate-500"
                    )}
                  >
                    <span className="flex-1 text-sm font-bold text-slate-200">{pipeline.name}</span>
                    {pipeline.is_default && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400" /> Padrão
                      </span>
                    )}
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {!pipeline.is_default && (
                        <button
                          onClick={() => setDefault(pipeline.id)}
                          className="p-1 rounded hover:bg-amber-900/30 text-slate-500 hover:text-amber-400"
                          title="Definir como padrão"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {crmData.pipelines.length > 1 && (
                        <button
                          onClick={() => deletePipeline(pipeline)}
                          className="p-1 rounded hover:bg-red-900/40 text-slate-500 hover:text-red-400"
                          title="Excluir funil"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Etapas do Funil Selecionado ── */}
          {activePipeline && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Etapas — {activePipeline.name}
                  <span className={cn(
                    "ml-2 font-bold",
                    stages.length >= MAX_STAGES ? "text-red-400" : "text-slate-600"
                  )}>
                    {stages.length}/{MAX_STAGES}
                  </span>
                </p>
              </div>

              {/* Alerta de limite */}
              {stages.length >= MAX_STAGES && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300">Limite máximo de 12 etapas atingido. Exclua uma para adicionar outra.</p>
                </div>
              )}

              {/* Lista de stages */}
              {stages.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">
                  Nenhuma etapa. Adicione a primeira abaixo.
                </p>
              ) : (
                <div className="space-y-2">
                  {stages.map((stage, i) => (
                    <StageRow
                      key={stage.id}
                      stage={stage}
                      index={i}
                      total={stages.length}
                      clientId={clientId}
                      onRefresh={onRefresh}
                    />
                  ))}
                </div>
              )}

              {/* Formulário nova stage */}
              {canAddStage && (
                <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/30 p-3">
                  <Label className="text-slate-400 text-xs uppercase font-black tracking-widest">
                    Nova Etapa
                  </Label>
                  <Input
                    value={newStageName}
                    onChange={e => setNewStageName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addStage(); }}
                    className={cls}
                    placeholder="Nome da etapa (ex: Contato Feito)"
                  />
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1 flex-wrap flex-1">
                      {STAGE_COLOR_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          title={opt.label}
                          onClick={() => setNewStageColor(opt.value)}
                          className={cn(
                            "w-5 h-5 rounded-full ring-offset-slate-900 transition-all",
                            newStageColor === opt.value ? "ring-2 ring-white ring-offset-2" : "opacity-60 hover:opacity-100"
                          )}
                          style={{ backgroundColor: opt.value }}
                        />
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={addStage}
                      disabled={addingStage || !newStageName.trim()}
                      className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-1 shrink-0"
                    >
                      {addingStage
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Plus className="h-3.5 w-3.5" />
                      }
                      Adicionar
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
