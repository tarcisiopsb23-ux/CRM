import { useRef, useCallback, useEffect, useState } from "react";
import EmailEditor, { type EditorRef, type EmailEditorProps } from "react-email-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useOrganization } from "@/hooks/useOrganization";
import type { EmailTemplate } from "@/hooks/useEmailTemplates";

interface UnlayerEditorProps {
  template: Partial<EmailTemplate> & { slug: string; name: string };
  onSave: (data: {
    subject:     string;
    html_body:   string;
    design_json: Record<string, unknown>;
    name:        string;
  }) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

// Variáveis de preview para substituição visual no editor
const PREVIEW_MERGE_TAGS = {
  client_name:   { name: "Nome do cliente",       value: "Cantinho do Churrasco" },
  user_name:     { name: "Nome do usuário",        value: "Diego Silva" },
  user_email:    { name: "E-mail do usuário",      value: "diego@cantinho.com.br" },
  admin_email:   { name: "E-mail do admin",        value: "diego@cantinho.com.br" },
  temp_password: { name: "Senha temporária",       value: "xk7m-p3qz-w9nf" },
  dashboard_url: { name: "URL do dashboard",       value: "https://app.agenciac8.com.br/dashboard/cantinho" },
  plan_name:     { name: "Nome do plano",          value: "Starter" },
  max_users:     { name: "Máx. usuários",          value: "3" },
};

// Configuração do Unlayer
const UNLAYER_OPTIONS: EmailEditorProps["options"] = {
  displayMode:   "email",
  locale:        "pt-BR",
  appearance: {
    theme: "modern_light",
    panels: { tools: { dock: "left" } },
  },
  features: {
    stockImages: { enabled: true },
    userUploads:  true,
    ai:           false,
  },
  mergeTags: Object.fromEntries(
    Object.entries(PREVIEW_MERGE_TAGS).map(([k, v]) => [
      k,
      { name: v.name, value: `{{${k}}}`, sample: v.value },
    ])
  ),
  mergeTagsConfig: {
    autocompleteTriggerChar: "{",
    sort: false,
  },
  tools: {
    button:  { enabled: true },
    image:   { enabled: true },
    divider: { enabled: true },
    social:  { enabled: false },
    video:   { enabled: false },
    timer:   { enabled: false },
  },
};

export function UnlayerEditor({ template, onSave, onClose, isSaving }: UnlayerEditorProps) {
  const organizationId = useOrganization();
  const editorRef      = useRef<EditorRef>(null);
  const [editorReady,  setEditorReady]  = useState(false);
  const [subject,      setSubject]      = useState(template.subject ?? "");
  const [name,         setName]         = useState(template.name ?? "");
  const [previewMode,  setPreviewMode]  = useState(false);

  // Carrega design existente quando o editor estiver pronto
  const handleReady: EmailEditorProps["onReady"] = useCallback(() => {
    setEditorReady(true);
    if (template.design_json && editorRef.current) {
      editorRef.current.editor?.loadDesign(template.design_json as never);
    }
  }, [template.design_json]);

  // Upload de imagem para Supabase Storage
  const handleImageUpload: EmailEditorProps["onImageUpload"] = useCallback(
    async (file, done) => {
      if (!organizationId) { done({ progress: 0 }); return; }
      try {
        const ext      = file.name.split(".").pop() ?? "png";
        const path     = `email-templates/${organizationId}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("public").upload(path, file, { upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from("public").getPublicUrl(path);
        done({ progress: 100, url: publicUrl });
        toast.success("Imagem enviada com sucesso!");
      } catch (e: unknown) {
        toast.error("Erro ao enviar imagem.");
        done({ progress: 0 });
      }
    },
    [organizationId]
  );

  const handleSave = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.editor?.exportHtml(async ({ design, html }) => {
      if (!subject.trim()) { toast.error("Assunto é obrigatório."); return; }
      if (!name.trim())    { toast.error("Nome do template é obrigatório."); return; }
      await onSave({
        subject,
        html_body:   html,
        design_json: design as unknown as Record<string, unknown>,
        name,
      });
    });
  }, [subject, name, onSave]);

  const handleTogglePreview = useCallback(() => {
    if (!editorRef.current?.editor) return;
    if (previewMode) {
      editorRef.current.editor.hidePreview();
    } else {
      editorRef.current.editor.showPreview({ device: "desktop" });
    }
    setPreviewMode(v => !v);
  }, [previewMode]);

  const handleResetDesign = useCallback(() => {
    if (!editorRef.current?.editor) return;
    editorRef.current.editor.loadBlank({
      backgroundColor: "#ffffff",
      contentWidth:    "600px",
    });
  }, []);

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {/* Barra superior */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">Nome do template</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Convite de Usuário"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">
                Assunto — use{" "}
                <code className="text-[10px] bg-muted px-1 rounded">{"{{variavel}}"}</code>
              </Label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Assunto do e-mail"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={handleResetDesign} title="Começar do zero">
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleTogglePreview}>
              {previewMode ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
              {previewMode ? "Editar" : "Preview"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !editorReady} className="gap-1.5">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar
            </Button>
          </div>
        </div>

        {/* Painel de variáveis disponíveis */}
        <div className="flex items-center gap-2 flex-wrap py-1 border-t border-dashed pt-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
            Variáveis:
          </span>
          {Object.entries(PREVIEW_MERGE_TAGS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => {
                navigator.clipboard.writeText(`{{${k}}}`);
                toast.success(`{{${k}}} copiado!`);
              }}
              className="inline-flex items-center rounded bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-mono px-2 py-0.5 hover:bg-violet-100 transition-colors"
              title={`${v.name} — exemplo: "${v.value}"`}
            >
              {`{{${k}}}`}
            </button>
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">
            Clique para copiar · No editor, digite <code className="bg-muted px-0.5 rounded">{"{"}</code> para autocompletar
          </span>
        </div>
      </div>

      {/* Editor Unlayer — ocupa todo o espaço restante */}
      {!editorReady && (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando editor...</span>
        </div>
      )}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ display: editorReady ? "flex" : "none", flexDirection: "column" }}
      >
        <EmailEditor
          ref={editorRef}
          onReady={handleReady}
          onImageUpload={handleImageUpload}
          options={UNLAYER_OPTIONS}
          style={{ flex: 1, minHeight: 0 }}
        />
      </div>
    </div>
  );
}
