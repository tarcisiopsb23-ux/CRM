import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown,
  Loader2, Type, Hash, Calendar, List, ToggleLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmCustomField, CustomFieldType } from "./types";

interface CustomFieldsSettingsModalProps {
  open: boolean;
  onClose: () => void;
  customFields: CrmCustomField[];
  onRefresh: () => Promise<void>;
}

function getSession() {
  try { return JSON.parse(localStorage.getItem("client_auth") ?? "{}"); } catch { return {}; }
}

const cls = "bg-slate-900 border-slate-700 text-white placeholder:text-slate-600";

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string; icon: React.ReactNode }[] = [
  { value: "text",    label: "Texto",    icon: <Type className="h-3.5 w-3.5" /> },
  { value: "number",  label: "Número",   icon: <Hash className="h-3.5 w-3.5" /> },
  { value: "date",    label: "Data",     icon: <Calendar className="h-3.5 w-3.5" /> },
  { value: "select",  label: "Seleção",  icon: <List className="h-3.5 w-3.5" /> },
  { value: "boolean", label: "Sim/Não",  icon: <ToggleLeft className="h-3.5 w-3.5" /> },
];

function fieldTypeIcon(type: CustomFieldType) {
  const opt = FIELD_TYPE_OPTIONS.find(o => o.value === type);
  return opt?.icon ?? <Type className="h-3.5 w-3.5" />;
}

function fieldTypeLabel(type: CustomFieldType) {
  return FIELD_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

// ─── Sub-componente: edição inline de um campo ────────────────────────────────
function FieldRow({
  field, index, total, clientId, onRefresh,
}: {
  field: CrmCustomField;
  index: number;
  total: number;
  clientId: string;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState(field.name);
  const [type, setType]         = useState<CustomFieldType>(field.field_type);
  const [required, setRequired] = useState(field.required);
  const [optionsRaw, setOptionsRaw] = useState(
    (field.options ?? []).join(", ")
  );
  const [saving, setSaving]     = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Nome do campo é obrigatório"); return; }
    const options = type === "select"
      ? optionsRaw.split(",").map(o => o.trim()).filter(Boolean)
      : null;
    setSaving(true);
    const { data, error } = await supabase.rpc("manage_crm_custom_field", {
      p_client_id:  clientId,
      p_action:     "update",
      p_field_id:   field.id,
      p_name:       name.trim(),
      p_field_type: type,
      p_options:    options ? JSON.stringify(options) : null,
      p_required:   required,
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao salvar campo"); return; }
    toast.success("Campo atualizado");
    setEditing(false);
    await onRefresh();
  };

  const cancel = () => {
    setName(field.name); setType(field.field_type);
    setRequired(field.required);
    setOptionsRaw((field.options ?? []).join(", "));
    setEditing(false);
  };

  const remove = async () => {
    if (!confirm(`Desativar o campo "${field.name}"? Os valores existentes serão preservados.`)) return;
    const { data, error } = await supabase.rpc("manage_crm_custom_field", {
      p_client_id: clientId,
      p_action:    "delete",
      p_field_id:  field.id,
    });
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao remover campo"); return; }
    toast.success("Campo desativado");
    await onRefresh();
  };

  const move = async (direction: "up" | "down") => {
    const newOrder = direction === "up" ? index - 1 : index + 1;
    const { data, error } = await supabase.rpc("manage_crm_custom_field", {
      p_client_id: clientId,
      p_action:    "reorder",
      p_field_id:  field.id,
      p_order:     newOrder,
    });
    if (error || !data?.success) { toast.error("Erro ao reordenar"); return; }
    await onRefresh();
  };

  return (
    <div className={cn(
      "rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2",
    )}>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Nome do Campo</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className={cn(cls, "h-8 text-sm")}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Tipo</Label>
              <Select value={type} onValueChange={v => setType(v as CustomFieldType)}>
                <SelectTrigger className={cn(cls, "h-8 text-sm")}>
                  <SelectValue />
                </SelectTrigger>
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
              <Input
                value={optionsRaw}
                onChange={e => setOptionsRaw(e.target.value)}
                className={cn(cls, "h-8 text-sm")}
                placeholder="Opção A, Opção B, Opção C"
              />
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
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel} className="h-7 text-xs text-slate-400 gap-1">
                <X className="h-3 w-3" /> Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-slate-500 shrink-0">{fieldTypeIcon(field.field_type)}</span>
          <span className="flex-1 text-sm text-slate-200">{field.name}</span>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded font-mono shrink-0">
            {fieldTypeLabel(field.field_type)}
          </span>
          {field.required && (
            <span className="text-[10px] text-red-400 font-bold shrink-0">*</span>
          )}
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
export function CustomFieldsSettingsModal({
  open, onClose, customFields, onRefresh,
}: CustomFieldsSettingsModalProps) {
  const session = getSession();
  const clientId = session?.client_id as string;

  const [newName, setNewName]         = useState("");
  const [newType, setNewType]         = useState<CustomFieldType>("text");
  const [newRequired, setNewRequired] = useState(false);
  const [newOptions, setNewOptions]   = useState("");
  const [adding, setAdding]           = useState(false);

  const createField = async () => {
    if (!newName.trim()) { toast.error("Nome do campo é obrigatório"); return; }
    const options = newType === "select"
      ? newOptions.split(",").map(o => o.trim()).filter(Boolean)
      : null;
    if (newType === "select" && (!options || options.length === 0)) {
      toast.error("Adicione pelo menos uma opção para o campo de seleção");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase.rpc("manage_crm_custom_field", {
      p_client_id:  clientId,
      p_action:     "create",
      p_name:       newName.trim(),
      p_field_type: newType,
      p_options:    options ? JSON.stringify(options) : null,
      p_required:   newRequired,
    });
    setAdding(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Erro ao criar campo"); return; }
    toast.success("Campo criado");
    setNewName(""); setNewType("text"); setNewRequired(false); setNewOptions("");
    await onRefresh();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1E293B] border-slate-700 text-slate-100 max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-black">
            Campos Personalizados
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* ── Campos existentes ── */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              Campos Ativos
              <span className="ml-2 text-slate-600 font-bold">{customFields.length} configurado{customFields.length !== 1 ? "s" : ""}</span>
            </p>

            <p className="text-xs text-slate-500">
              Estes campos aparecem no formulário de lead de todos os usuários, abaixo dos campos padrão.
            </p>

            {customFields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 py-8 text-center">
                <p className="text-slate-500 text-sm">Nenhum campo personalizado ainda.</p>
                <p className="text-slate-600 text-xs mt-1">Adicione abaixo para começar.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {customFields.map((field, i) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    index={i}
                    total={customFields.length}
                    clientId={clientId}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Adicionar novo campo ── */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              Novo Campo
            </p>

            <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Nome</Label>
                  <Input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createField(); }}
                    className={cls}
                    placeholder="Ex: CPF, Instagram, Segmento"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Tipo</Label>
                  <Select value={newType} onValueChange={v => { setNewType(v as CustomFieldType); setNewOptions(""); }}>
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

              {/* Opções para tipo select */}
              {newType === "select" && (
                <div className="space-y-1">
                  <Label className="text-slate-300">Opções (separadas por vírgula)</Label>
                  <Input
                    value={newOptions}
                    onChange={e => setNewOptions(e.target.value)}
                    className={cls}
                    placeholder="Pequeno, Médio, Grande"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={newRequired} onCheckedChange={setNewRequired} />
                  <span className="text-sm text-slate-400">Obrigatório</span>
                </div>
                <Button
                  onClick={createField}
                  disabled={adding || !newName.trim()}
                  className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2"
                >
                  {adding
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Plus className="h-4 w-4" />
                  }
                  Adicionar Campo
                </Button>
              </div>
            </div>
          </section>

          {/* ── Dicas ── */}
          <section className="rounded-lg bg-slate-900/50 border border-slate-700 px-4 py-3 space-y-1">
            <p className="text-xs font-bold text-slate-400">Tipos disponíveis</p>
            <ul className="space-y-1">
              {FIELD_TYPE_OPTIONS.map(opt => (
                <li key={opt.value} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="text-slate-400">{opt.icon}</span>
                  <span className="font-bold text-slate-400">{opt.label}</span>
                  <span>—</span>
                  <span>
                    {opt.value === "text"    && "campo de texto livre"}
                    {opt.value === "number"  && "valor numérico (ex: receita, funcionários)"}
                    {opt.value === "date"    && "data (ex: data de fundação)"}
                    {opt.value === "select"  && "lista de opções pré-definidas"}
                    {opt.value === "boolean" && "sim ou não (toggle)"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

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
