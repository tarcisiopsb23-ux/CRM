// FormsConfigPage
import {
  useState, useCallback, useRef, useEffect, useMemo, type DragEvent,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Trash2, GripVertical, ChevronLeft, Copy, ExternalLink,
  Eye, EyeOff, Settings2, Save, Loader2, Code2, ToggleLeft,
  ToggleRight, AlertCircle, CheckCircle2, FileText, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";
import { PageHeader } from "./components/PageHeader";
import { cn } from "@/lib/utils";

// --- Tipos --------------------------------------------------------------------

export type FieldType =
  | "text" | "email" | "phone" | "textarea"
  | "select" | "radio" | "checkbox"
  | "date" | "number"
  | "divider" | "html" | "consent";

export interface FieldLogic {
  show_if?: { field_id: string; operator: string; value: string };
}

export interface FormField {
  id:          string;
  type:        FieldType;
  label:       string;
  placeholder?: string;
  required?:   boolean;
  options?:    string[];     // para select, radio, checkbox
  html_content?: string;     // para type=html
  logic?:      FieldLogic;
}

interface LeadForm {
  id:                string;
  name:              string;
  slug:              string;
  active:            boolean;
  title:             string;
  description?:      string;
  primary_color:     string;
  logo_url?:         string;
  background_color:  string;
  button_text:       string;
  fields:            FormField[];
  success_message:   string;
  redirect_url?:     string;
  pipeline_stage_id?: string;
  auto_create_deal:  boolean;
  trigger_event:     string;
  submission_count:  number;
  created_at:        string;
  updated_at:        string;
}

interface PipelineStage {
  id:   string;
  name: string;
}

// --- Catlogo de tipos de campo -----------------------------------------------

const FIELD_CATALOG: { type: FieldType; label: string; icon: string; description: string }[] = [
  { type: "text",     label: "Texto curto",     icon: "T",  description: "Nome, empresa, etc." },
  { type: "email",    label: "E-mail",           icon: "@",  description: "Campo de e-mail validado" },
  { type: "phone",    label: "Telefone",         icon: "??", description: "Com mscara de telefone" },
  { type: "textarea", label: "Texto longo",      icon: "",  description: "Mensagem, observaes" },
  { type: "select",   label: "Seleo nica",    icon: "?",  description: "Dropdown de opes" },
  { type: "radio",    label: "Mltipla escolha", icon: "?",  description: "Radio buttons" },
  { type: "checkbox", label: "Checkboxes",       icon: "?",  description: "Seleo mltipla" },
  { type: "date",     label: "Data",             icon: "??", description: "Seletor de data" },
  { type: "number",   label: "Nmero",           icon: "#",  description: "Valor numrico" },
  { type: "consent",  label: "Consentimento",    icon: "?",  description: "Checkbox LGPD" },
  { type: "divider",  label: "Separador",        icon: "",  description: "Linha divisria" },
  { type: "html",     label: "Texto HTML",       icon: "<>", description: "Contedo livre em HTML" },
];

function newField(type: FieldType): FormField {
  const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const defaults: Partial<FormField> = {
    text:     { label: "Nome", placeholder: "Digite seu nome" },
    email:    { label: "E-mail", placeholder: "seu@email.com", required: true },
    phone:    { label: "Telefone", placeholder: "(11) 99999-9999" },
    textarea: { label: "Mensagem", placeholder: "Escreva aqui..." },
    select:   { label: "Opo", options: ["Opo 1", "Opo 2", "Opo 3"] },
    radio:    { label: "Escolha", options: ["Sim", "não"] },
    checkbox: { label: "Selecione", options: ["Item 1", "Item 2"] },
    date:     { label: "Data" },
    number:   { label: "Nmero", placeholder: "0" },
    consent:  { label: "Concordo com a poltica de privacidade e uso dos meus dados.", required: true },
    divider:  { label: "" },
    html:     { label: "", html_content: "<p>Texto informativo aqui.</p>" },
  }[type] as Partial<FormField>;

  return { id, type, label: "", ...defaults };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// --- Componente: Preview do formulário ----------------------------------------

function FormPreview({ form }: { form: Partial<LeadForm> }) {
  const fields = (form.fields ?? []) as FormField[];
  const color  = form.primary_color ?? "#6366f1";

  return (
    <div
      className="rounded-xl overflow-hidden shadow-2xl border border-white/10"
      style={{ background: form.background_color ?? "#0F172A" }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {form.logo_url && (
          <img src={form.logo_url} alt="Logo" className="h-8 mb-3 object-contain" />
        )}
        <h2 className="text-lg font-bold text-white">{form.title || "título do formulário"}</h2>
        {form.description && (
          <p className="text-sm text-white/60 mt-1">{form.description}</p>
        )}
      </div>
      {/* Campos */}
      <div className="px-6 py-4 space-y-3">
        {fields.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/30 text-sm">Arraste campos para o formulário</p>
          </div>
        ) : (
          fields.map((field) => (
            <PreviewField key={field.id} field={field} color={color} />
          ))
        )}
        {fields.length > 0 && (
          <button
            disabled
            className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold text-white cursor-default"
            style={{ background: color }}
          >
            {form.button_text || "Enviar"}
          </button>
        )}
      </div>
    </div>
  );
}

function PreviewField({ field, color }: { field: FormField; color: string }) {
  if (field.type === "divider") {
    return <hr className="border-white/10" />;
  }
  if (field.type === "html") {
    return (
      <div
        className="text-white/70 text-sm"
        dangerouslySetInnerHTML={{ __html: field.html_content ?? "" }}
      />
    );
  }
  if (field.type === "consent") {
    return (
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" disabled className="mt-0.5 rounded" style={{ accentColor: color }} />
        <span className="text-white/70 text-xs">{field.label}</span>
        {field.required && <span className="text-red-400 text-xs">*</span>}
      </label>
    );
  }
  if (field.type === "radio" || field.type === "checkbox") {
    return (
      <div className="space-y-1.5">
        <label className="text-white/80 text-xs font-medium">
          {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <div className="space-y-1">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-white/60 text-xs">
              <input
                type={field.type === "radio" ? "radio" : "checkbox"}
                disabled
                style={{ accentColor: color }}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div className="space-y-1">
        <label className="text-white/80 text-xs font-medium">
          {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <select
          disabled
          className="w-full px-3 py-2 rounded-lg text-sm text-white/50 bg-white/5 border border-white/10"
        >
          <option>{field.placeholder || "Selecione..."}</option>
        </select>
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <div className="space-y-1">
        <label className="text-white/80 text-xs font-medium">
          {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <textarea
          disabled
          placeholder={field.placeholder}
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-sm text-white/50 bg-white/5 border border-white/10 resize-none"
        />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <label className="text-white/80 text-xs font-medium">
        {field.label || <span className="italic opacity-40">Sem rtulo</span>}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        disabled
        type={field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm text-white/50 bg-white/5 border border-white/10"
      />
    </div>
  );
}

// --- Componente: Card de campo no canvas --------------------------------------

function FieldCard({
  field,
  allFields,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  field:       FormField;
  allFields:   FormField[];
  onUpdate:    (id: string, patch: Partial<FormField>) => void;
  onRemove:    (id: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver:  (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDrop:      (e: DragEvent<HTMLDivElement>, id: string) => void;
  isDragging:  boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showLogic, setShowLogic] = useState(false);
  const catalogEntry = FIELD_CATALOG.find((c) => c.type === field.type);
  const otherFields  = allFields.filter((f) => f.id !== field.id && f.type !== "divider" && f.type !== "html");

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, field.id)}
      onDragOver={(e) => onDragOver(e, field.id)}
      onDrop={(e) => onDrop(e, field.id)}
      className={cn(
        "group rounded-lg border border-border bg-card/50 transition-all",
        isDragging && "opacity-40 scale-[0.98]"
      )}
    >
      {/* Header do card */}
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab active:cursor-grabbing shrink-0" />
        <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
          {catalogEntry?.icon ?? "?"}
        </span>
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          {field.label || <span className="italic text-muted-foreground">Sem rtulo</span>}
        </span>
        <Badge variant="outline" className="text-[10px] shrink-0">{catalogEntry?.label}</Badge>
        {field.required && (
          <Badge className="bg-destructive/15 text-destructive border-destructive/20 text-[10px] shrink-0">
            obrigatório
          </Badge>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onRemove(field.id)}
          className="text-muted-foreground hover:text-destructive transition-colors p-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* configurações expandidas */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/40 pt-3">
          {/* Campos bsicos */}
          {field.type !== "divider" && (
            <div className="grid gap-2">
              <Label className="text-xs">Rtulo (label)</Label>
              <Input
                value={field.label}
                onChange={(e) => onUpdate(field.id, { label: e.target.value })}
                placeholder="Rtulo do campo"
                className="h-7 text-xs"
              />
            </div>
          )}
          {["text", "email", "phone", "textarea", "number", "select"].includes(field.type) && (
            <div className="grid gap-2">
              <Label className="text-xs">Placeholder</Label>
              <Input
                value={field.placeholder ?? ""}
                onChange={(e) => onUpdate(field.id, { placeholder: e.target.value })}
                placeholder="Texto de exemplo"
                className="h-7 text-xs"
              />
            </div>
          )}
          {field.type === "html" && (
            <div className="grid gap-2">
              <Label className="text-xs">Contedo HTML</Label>
              <Textarea
                value={field.html_content ?? ""}
                onChange={(e) => onUpdate(field.id, { html_content: e.target.value })}
                rows={3}
                className="text-xs font-mono"
                placeholder="<p>Texto aqui</p>"
              />
            </div>
          )}
          {/* Opes para select, radio, checkbox */}
          {["select", "radio", "checkbox"].includes(field.type) && (
            <div className="grid gap-2">
              <Label className="text-xs">Opes (uma por linha)</Label>
              <Textarea
                value={(field.options ?? []).join("\n")}
                onChange={(e) =>
                  onUpdate(field.id, {
                    options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean),
                  })
                }
                rows={3}
                className="text-xs"
                placeholder={"Opo 1\nOpo 2\nOpo 3"}
              />
            </div>
          )}
          {/* obrigatório */}
          {!["divider", "html"].includes(field.type) && (
            <div className="flex items-center gap-2">
              <Switch
                id={`req-${field.id}`}
                checked={!!field.required}
                onCheckedChange={(v) => onUpdate(field.id, { required: v })}
              />
              <Label htmlFor={`req-${field.id}`} className="text-xs cursor-pointer">
                Campo obrigatório
              </Label>
            </div>
          )}
          {/* Lgica condicional */}
          {!["divider", "html"].includes(field.type) && otherFields.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowLogic((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showLogic ? <ToggleRight className="h-3.5 w-3.5 text-primary" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                Lgica condicional
              </button>
              {showLogic && (
                <div className="grid gap-2 rounded-md border border-border/40 p-2 bg-muted/10">
                  <p className="text-xs text-muted-foreground">
                    Mostrar este campo somente se:
                  </p>
                  <div className="flex gap-2 items-center flex-wrap">
                    <Select
                      value={field.logic?.show_if?.field_id ?? "none"}
                      onValueChange={(v) =>
                        onUpdate(field.id, {
                          logic: v === "none" ? undefined : {
                            show_if: { field_id: v, operator: field.logic?.show_if?.operator ?? "equals", value: field.logic?.show_if?.value ?? "" },
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs flex-1 min-w-[120px]">
                        <SelectValue placeholder="Nenhum campo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sempre mostrar</SelectItem>
                        {otherFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.label || f.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.logic?.show_if && (
                      <>
                        <Select
                          value={field.logic.show_if.operator}
                          onValueChange={(v) =>
                            onUpdate(field.id, {
                              logic: { show_if: { ...field.logic!.show_if!, operator: v } },
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">igual a</SelectItem>
                            <SelectItem value="not_equals">diferente de</SelectItem>
                            <SelectItem value="contains">contm</SelectItem>
                            <SelectItem value="not_empty">não est vazio</SelectItem>
                          </SelectContent>
                        </Select>
                        {field.logic.show_if.operator !== "not_empty" && (
                          <Input
                            value={field.logic.show_if.value}
                            onChange={(e) =>
                              onUpdate(field.id, {
                                logic: { show_if: { ...field.logic!.show_if!, value: e.target.value } },
                              })
                            }
                            placeholder="valor"
                            className="h-7 text-xs flex-1 min-w-[80px]"
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- formulário de criao/edio ---------------------------------------------

function FormEditor({
  form: initialForm,
  clientId,
  organizationId,
  slug,
  pipelineStages,
  onSaved,
  onBack,
}: {
  form:            Partial<LeadForm> | null;
  clientId:        string;
  organizationId:  string;
  slug:            string;
  pipelineStages:  PipelineStage[];
  onSaved:         (form: LeadForm) => void;
  onBack:          () => void;
}) {
  const isNew = !initialForm?.id;
  const [tab, setTab] = useState<"campos" | "config" | "preview">("campos");
  const [saving, setSaving] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Form state
  const [name,             setName]             = useState(initialForm?.name             ?? "Novo formulário");
  const [formSlug,         setFormSlug]         = useState(initialForm?.slug             ?? "");
  const [title,            setTitle]            = useState(initialForm?.title            ?? "Fale conosco");
  const [description,      setDescription]      = useState(initialForm?.description      ?? "");
  const [primaryColor,     setPrimaryColor]     = useState(initialForm?.primary_color    ?? "#6366f1");
  const [bgColor,          setBgColor]          = useState(initialForm?.background_color ?? "#0F172A");
  const [buttonText,       setButtonText]       = useState(initialForm?.button_text      ?? "Enviar");
  const [logoUrl,          setLogoUrl]          = useState(initialForm?.logo_url         ?? "");
  const [successMsg,       setSuccessMsg]       = useState(initialForm?.success_message  ?? "Obrigado! Entraremos em contato em breve.");
  const [redirectUrl,      setRedirectUrl]      = useState(initialForm?.redirect_url     ?? "");
  const [stageId,          setStageId]          = useState(initialForm?.pipeline_stage_id ?? "none");
  const [autoCreateDeal,   setAutoCreateDeal]   = useState(initialForm?.auto_create_deal ?? false);
  const [triggerEvent,     setTriggerEvent]     = useState(initialForm?.trigger_event    ?? "Lead");
  const [active,           setActive]           = useState(initialForm?.active           ?? true);
  const [fields,           setFields]           = useState<FormField[]>(initialForm?.fields ?? []);

  // Auto-gera slug a partir do name quando novo
  useEffect(() => {
    if (isNew) setFormSlug(slugify(name));
  }, [name, isNew]);

  // DnD state
  const draggingId = useRef<string | null>(null);

  const addField = useCallback((type: FieldType) => {
    setFields((prev) => [...prev, newField(type)]);
  }, []);

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, id: string) => {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, _id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    const srcId = draggingId.current;
    if (!srcId || srcId === targetId) return;
    setFields((prev) => {
      const srcIdx = prev.findIndex((f) => f.id === srcId);
      const tgtIdx = prev.findIndex((f) => f.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, moved);
      return next;
    });
    draggingId.current = null;
  }, []);

  const publicUrl = `${window.location.origin}/form/${slug}/${formSlug}`;
  const embedCode = `<script src="${window.location.origin}/embed.js" data-form="${slug}/${formSlug}"></script>\n<div id="c8-form"></div>`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setLinkCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setEmbedCopied(true);
    toast.success("Cdigo embed copiado!");
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  const currentFormData = useMemo((): Partial<LeadForm> => ({
    title, description, primary_color: primaryColor, background_color: bgColor,
    button_text: buttonText, logo_url: logoUrl || undefined, fields,
    success_message: successMsg,
  }), [title, description, primaryColor, bgColor, buttonText, logoUrl, fields, successMsg]);

  const save = async () => {
    if (!name.trim() || !formSlug.trim()) {
      toast.error("Nome e slug são obrigatórios");
      return;
    }
    if (fields.length === 0) {
      toast.error("Adicione pelo menos um campo ao formulário");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        client_id:         clientId,
        organization_id:   organizationId,
        name:              name.trim(),
        slug:              formSlug.trim(),
        active,
        title:             title.trim(),
        description:       description.trim() || null,
        primary_color:     primaryColor,
        background_color:  bgColor,
        button_text:       buttonText.trim() || "Enviar",
        logo_url:          logoUrl.trim()    || null,
        fields,
        success_message:   successMsg.trim(),
        redirect_url:      redirectUrl.trim() || null,
        pipeline_stage_id: stageId !== "none" ? stageId : null,
        auto_create_deal:  autoCreateDeal,
        trigger_event:     triggerEvent,
      };

      let result: LeadForm;
      if (isNew) {
        const { data, error } = await supabase
          .from("client_lead_forms")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        result = data as LeadForm;
        toast.success("formulário criado com sucesso!");
      } else {
        const { data, error } = await supabase
          .from("client_lead_forms")
          .update(payload)
          .eq("id", initialForm!.id!)
          .select()
          .single();
        if (error) throw error;
        result = data as LeadForm;
        toast.success("formulário salvo!");
      }
      onSaved(result);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar formulário");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Topbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> formulários
        </Button>
        <div className="flex-1 min-w-0">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm font-semibold max-w-xs"
            placeholder="Nome do formulário"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Switch
            id="form-active"
            checked={active}
            onCheckedChange={setActive}
          />
          <Label htmlFor="form-active" className="text-xs cursor-pointer">
            {active ? "Ativo" : "Inativo"}
          </Label>
        </div>
        {!isNew && (
          <>
            <Button
              variant="outline" size="sm"
              className="gap-1.5 text-xs border-border"
              onClick={copyLink}
            >
              <Copy className="h-3.5 w-3.5" />
              {linkCopied ? "Copiado!" : "Copiar link"}
            </Button>
            <Button
              variant="outline" size="sm"
              className="gap-1.5 text-xs border-border"
              onClick={() => setShowEmbed(true)}
            >
              <Code2 className="h-3.5 w-3.5" /> Embed
            </Button>
            <Button
              variant="outline" size="sm"
              className="gap-1.5 text-xs border-border"
              onClick={() => window.open(publicUrl, "_blank", "noopener")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver
            </Button>
          </>
        )}
        <Button size="sm" onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isNew ? "Criar formulário" : "Salvar"}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="bg-muted/50 border border-border w-fit">
          <TabsTrigger value="campos" className="text-xs">Campos</TabsTrigger>
          <TabsTrigger value="config"  className="text-xs">configurações</TabsTrigger>
          <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
        </TabsList>

        {/* -- Tab: Campos -- */}
        <TabsContent value="campos" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">

            {/* Paleta de campos */}
            <Card className="card-surface h-fit">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Adicionar campo</CardTitle>
                <CardDescription className="text-xs">
                  Clique ou arraste para o canvas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 p-3">
                {FIELD_CATALOG.map(({ type, label, icon, description }) => (
                  <button
                    key={type}
                    onClick={() => addField(type)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted/50 transition-colors text-left group"
                  >
                    <span className="w-6 text-center text-xs font-mono text-primary shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{label}</p>
                      <p className="text-[10px] text-muted-foreground">{description}</p>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary ml-auto shrink-0 transition-colors" />
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Canvas de campos */}
            <div className="space-y-2">
              {fields.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/40 py-16">
                  <FileText className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhum campo adicionado</p>
                  <p className="text-xs text-muted-foreground">
                    Clique em um tipo de campo  esquerda para adicionar
                  </p>
                </div>
              ) : (
                fields.map((field) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    allFields={fields}
                    onUpdate={updateField}
                    onRemove={removeField}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    isDragging={draggingId.current === field.id}
                  />
                ))
              )}
            </div>
          </div>
        </TabsContent>

        {/* -- Tab: configurações -- */}
        <TabsContent value="config" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">

            <Card className="card-surface">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Aparncia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">título do formulário</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrio / subtítulo</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Texto do botão de envio</Label>
                  <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">URL do logo</Label>
                  <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className="text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cor primria</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-8 w-8 rounded cursor-pointer border border-border" />
                      <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="text-xs font-mono h-8 flex-1" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cor de fundo</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-8 w-8 rounded cursor-pointer border border-border" />
                      <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="text-xs font-mono h-8 flex-1" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="card-surface">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Ps-envio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mensagem de sucesso</Label>
                    <Textarea
                      value={successMsg}
                      onChange={(e) => setSuccessMsg(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Redirecionar para URL aps envio</Label>
                    <Input
                      value={redirectUrl}
                      onChange={(e) => setRedirectUrl(e.target.value)}
                      placeholder="https://... (opcional)"
                      className="text-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="card-surface">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">integração e rastreamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Evento de conversão disparado</Label>
                    <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Lead">Lead</SelectItem>
                        <SelectItem value="CompleteRegistration">CompleteRegistration</SelectItem>
                        <SelectItem value="Contact">Contact</SelectItem>
                        <SelectItem value="Schedule">Schedule</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator className="bg-border/40" />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Etapa do pipeline (novo lead entra aqui)</Label>
                    <Select value={stageId} onValueChange={setStageId}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="não definido" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">não adicionar ao pipeline</SelectItem>
                        {pipelineStages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {stageId !== "none" && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="auto-deal"
                        checked={autoCreateDeal}
                        onCheckedChange={setAutoCreateDeal}
                      />
                      <Label htmlFor="auto-deal" className="text-xs cursor-pointer">
                        Criar negociao automaticamente
                      </Label>
                    </div>
                  )}
                  <Separator className="bg-border/40" />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Slug da URL pblica</Label>
                    <div className="flex items-center gap-1 rounded-md border border-border overflow-hidden">
                      <span className="text-xs text-muted-foreground px-2 bg-muted/30 h-full flex items-center py-1.5 shrink-0 border-r border-border">
                        /form/{slug}/
                      </span>
                      <Input
                        value={formSlug}
                        onChange={(e) => setFormSlug(slugify(e.target.value))}
                        className="border-0 rounded-none h-auto text-xs font-mono shadow-none focus-visible:ring-0"
                        placeholder="meu-formulario"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* -- Tab: Preview -- */}
        <TabsContent value="preview" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 items-start">
            <FormPreview form={currentFormData} />
            <div className="space-y-3">
              <Card className="card-surface">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Link público</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/10 px-3 py-2 overflow-hidden">
                    <span className="text-xs font-mono flex-1 truncate text-foreground">{publicUrl}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5 text-xs border-border">
                      <Copy className="h-3 w-3" />{linkCopied ? "Copiado!" : "Copiar"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(publicUrl, "_blank", "noopener")} className="gap-1.5 text-xs border-border">
                      <ExternalLink className="h-3 w-3" /> Abrir
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card className="card-surface">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resumo dos campos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {fields.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-xs">
                        <span className="text-primary font-mono w-4 text-center shrink-0">
                          {FIELD_CATALOG.find((c) => c.type === f.type)?.icon ?? "?"}
                        </span>
                        <span className="text-foreground flex-1 truncate">{f.label || <span className="italic text-muted-foreground">Sem rtulo</span>}</span>
                        {f.required && <Badge className="text-[9px] bg-destructive/10 text-destructive border-destructive/20 shrink-0">*</Badge>}
                        {f.logic?.show_if && <Badge variant="outline" className="text-[9px] shrink-0">condicional</Badge>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog embed */}
      <Dialog open={showEmbed} onOpenChange={setShowEmbed}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cdigo Embed</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cole este cdigo no HTML do seu site para incorporar o formulário:
            </p>
            <pre className="rounded-md bg-muted/30 border border-border p-3 text-xs font-mono whitespace-pre-wrap break-all text-foreground">
              {embedCode}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmbed(false)}>Fechar</Button>
            <Button onClick={copyEmbed} className="gap-2">
              <Copy className="h-3.5 w-3.5" />
              {embedCopied ? "Copiado!" : "Copiar cdigo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- página principal ---------------------------------------------------------

export function FormsConfigPage() {
  const { slug } = useParams<{ slug: string }>();
  const { auth } = useClientAuth();
  const queryClient = useQueryClient();
  const clientId      = (auth?.user as any)?.client_id       as string | undefined;
  const organizationId = (auth?.user as any)?.organization_id as string | undefined;

  const [editingForm, setEditingForm] = useState<Partial<LeadForm> | null | "new">(null);

  // -- Carrega formulários ------------------------------------------------
  const { data: forms, isLoading } = useQuery({
    queryKey: ["client_lead_forms", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data } = await supabase
        .from("client_lead_forms")
        .select("id, name, slug, active, title, trigger_event, submission_count, created_at, updated_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Partial<LeadForm>[];
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  // -- Carrega etapas do pipeline -----------------------------------------
  const { data: pipelineStages } = useQuery({
    queryKey: ["client_crm_pipeline_stages", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data } = await supabase
        .from("client_crm_pipeline_stages")
        .select("id, name")
        .eq("client_id", clientId)
        .order("order", { ascending: true });
      return (data ?? []) as PipelineStage[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60_000,
  });

  // -- Toggle ativo/inativo -----------------------------------------------
  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("client_lead_forms").update({ active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["client_lead_forms", clientId] });
  };

  // -- Deletar formulário -------------------------------------------------
  const deleteForm = async (id: string) => {
    if (!confirm("Excluir este formulário? Esta ao não pode ser desfeita.")) return;
    await supabase.from("client_lead_forms").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["client_lead_forms", clientId] });
    toast.success("formulário excludo.");
  };

  // Carrega formulário completo para edio
  const openEdit = async (formId: string) => {
    const { data } = await supabase
      .from("client_lead_forms")
      .select("*")
      .eq("id", formId)
      .single();
    if (data) setEditingForm(data as LeadForm);
  };

  // -- Se estiver editando, mostra o editor ------------------------------
  if (editingForm !== null) {
    return (
      <div className="mx-auto max-w-5xl">
        <FormEditor
          form={editingForm === "new" ? null : editingForm as Partial<LeadForm>}
          clientId={clientId!}
          organizationId={organizationId!}
          slug={slug!}
          pipelineStages={pipelineStages ?? []}
          onSaved={(saved) => {
            queryClient.invalidateQueries({ queryKey: ["client_lead_forms", clientId] });
            setEditingForm(null);
          }}
          onBack={() => setEditingForm(null)}
        />
      </div>
    );
  }

  // -- Lista de formulários -----------------------------------------------
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="formulários de Leads"
        description="Crie formulários de captura publicveis em campanhas ou incorporveis em qualquer site."
      />

      <div className="flex justify-end">
        <Button
          onClick={() => setEditingForm("new")}
          className="gap-2"
          disabled={!clientId}
        >
          <Plus className="h-4 w-4" /> Novo formulário
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !forms || forms.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30" />
          <div>
            <p className="text-base font-semibold text-foreground">Nenhum formulário criado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crie seu primeiro formulário para comear a capturar leads.
            </p>
          </div>
          <Button onClick={() => setEditingForm("new")} className="gap-2">
            <Plus className="h-4 w-4" /> Criar formulário
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => {
            const publicUrl = `${window.location.origin}/form/${slug}/${form.slug}`;
            return (
              <Card key={form.id} className="card-surface">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{form.name}</p>
                      <Badge
                        className={form.active
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]"
                          : "bg-muted/30 text-muted-foreground text-[10px]"
                        }
                      >
                        {form.active ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{form.trigger_event}</Badge>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs font-mono text-muted-foreground truncate max-w-[280px]">{publicUrl}</p>
                      <p className="text-xs text-muted-foreground shrink-0">
                        {form.submission_count ?? 0} {form.submission_count === 1 ? "submissão" : "submisses"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0"
                      title={form.active ? "Desativar" : "Ativar"}
                      onClick={() => toggleActive(form.id!, !!form.active)}
                    >
                      {form.active
                        ? <ToggleRight className="h-4 w-4 text-emerald-400" />
                        : <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                      }
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Copiar link"
                      onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copiado!"); }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Ver formulário"
                      onClick={() => window.open(publicUrl, "_blank", "noopener")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-7 px-2 text-xs border-border gap-1.5"
                      onClick={() => openEdit(form.id!)}
                    >
                      <Settings2 className="h-3 w-3" /> Editar
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Excluir"
                      onClick={() => deleteForm(form.id!)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
