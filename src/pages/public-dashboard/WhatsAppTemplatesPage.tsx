/**
 * WhatsAppTemplatesPage
 *
 * Gerencia templates WhatsApp Business da WABA conectada.
 * Localização no menu: Agenda → Templates WhatsApp
 *
 * Funcionalidades:
 *   - Listar templates (lidos do banco local, sincronizados com Meta)
 *   - Sincronizar status com Meta
 *   - Criar novo template e submeter para aprovação
 *   - Atualizar mapeamento de variáveis (semântico)
 *   - Estado vazio: sem WhatsApp conectado / sem templates
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, RefreshCw, Plus, Loader2, AlertCircle,
  CheckCircle2, Clock, XCircle, PauseCircle, ChevronDown,
  ChevronUp, Info, Trash2, Link2,
} from "lucide-react";
import { toast } from "sonner";

import { Button }           from "@/components/ui/button";
import { Badge }            from "@/components/ui/badge";
import { Input }            from "@/components/ui/input";
import { Label }            from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader }       from "@/pages/public-dashboard/components/PageHeader";
import { useClientAuth }    from "@/hooks/useClientAuth";
import { useMetaConnections } from "@/hooks/useMetaConnections";
import {
  useWhatsAppTemplates,
  TEMPLATE_VARIABLE_FIELDS,
  type WhatsAppTemplate,
  type TemplateComponent,
  type CreateTemplateInput,
} from "@/hooks/useWhatsAppTemplates";

// ── Ícone por status ──────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "APPROVED":  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "PENDING":
    case "IN_APPEAL": return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    case "REJECTED":  return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "PAUSED":
    case "DISABLED":  return <PauseCircle className="h-3.5 w-3.5 text-slate-400" />;
    default:           return <AlertCircle className="h-3.5 w-3.5 text-slate-400" />;
  }
}

// ── Card de template ──────────────────────────────────────────────────────────
function TemplateCard({
  template,
  statusLabel,
  statusColor,
  extractVariables,
  onUpdateMapping,
  onDelete,
  canEdit,
}: {
  template: WhatsAppTemplate;
  statusLabel: (s: string) => string;
  statusColor: (s: string) => string;
  extractVariables: (t: WhatsAppTemplate) => string[];
  onUpdateMapping: (t: WhatsAppTemplate) => void;
  onDelete: (t: WhatsAppTemplate) => void;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyComponent = template.components.find(c => c.type === "BODY");
  const variables     = extractVariables(template);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header do card */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <MessageCircle className="h-4 w-4 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium font-mono">{template.name}</span>
            <Badge variant="outline" className={`text-[10px] gap-1 ${statusColor(template.status)}`}>
              <StatusIcon status={template.status} />
              {statusLabel(template.status)}
            </Badge>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {template.category}
            </Badge>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {template.language}
            </Badge>
          </div>
          {bodyComponent?.text && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {bodyComponent.text}
            </p>
          )}
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </div>

      {/* Conteúdo expandido */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/10">
          {/* Componentes */}
          <div className="space-y-2">
            {template.components.map((comp, i) => (
              <div key={i} className="space-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {comp.type}
                </span>
                <p className="text-xs text-foreground bg-background rounded border border-border px-2 py-1.5 whitespace-pre-wrap">
                  {comp.text ?? `[${comp.format ?? comp.type}]`}
                </p>
              </div>
            ))}
          </div>

          {/* Mapeamento de variáveis */}
          {variables.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Variáveis mapeadas
                </span>
                {canEdit && (
                  <Button
                    size="sm" variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => onUpdateMapping(template)}
                  >
                    Editar mapeamento
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {variables.map(v => {
                  const varNum = v.replace(/\{+|\}+/g, "");
                  const mapped = template.variable_mapping?.[varNum];
                  const field  = TEMPLATE_VARIABLE_FIELDS.find(f => f.value === mapped);
                  return (
                    <div key={v} className="flex items-center gap-1.5 text-xs">
                      <code className="bg-muted px-1 rounded text-[10px]">{v}</code>
                      <span className="text-muted-foreground">→</span>
                      <span className={field ? "text-foreground" : "text-amber-500 italic"}>
                        {field?.label ?? (mapped ?? "Não mapeado")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rejeição */}
          {template.status === "REJECTED" && template.rejection_reason && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span><strong>Motivo de rejeição:</strong> {template.rejection_reason}</span>
            </div>
          )}

          {/* Última sincronização */}
          {template.last_synced_at && (
            <p className="text-[10px] text-muted-foreground">
              Sincronizado em {new Date(template.last_synced_at).toLocaleString("pt-BR")}
            </p>
          )}

          {/* Ações */}
          {canEdit && (
            <div className="flex justify-end">
              <Button
                size="sm" variant="ghost"
                className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                onClick={() => onDelete(template)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Dialog: Criar template ────────────────────────────────────────────────────
function CreateTemplateDialog({
  open,
  onClose,
  connectionId,
  onCreated,
  create,
}: {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  onCreated: () => void;
  create: ReturnType<typeof useWhatsAppTemplates>["create"];
}) {
  const [name,     setName]     = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING" | "AUTHENTICATION">("UTILITY");
  const [language, setLanguage] = useState("pt_BR");
  const [bodyText, setBodyText] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");

  const handleSubmit = async () => {
    if (!name || !bodyText) {
      toast.error("Nome e corpo do template são obrigatórios.");
      return;
    }

    const components: TemplateComponent[] = [];
    if (headerText.trim()) components.push({ type: "HEADER", format: "TEXT", text: headerText.trim() });
    components.push({ type: "BODY", text: bodyText.trim() });
    if (footerText.trim()) components.push({ type: "FOOTER", text: footerText.trim() });

    try {
      await create.mutateAsync({
        connection_id: connectionId,
        name:          name.toLowerCase().replace(/\s+/g, "_"),
        category,
        language,
        components,
      } as CreateTemplateInput);
      toast.success("Template submetido para aprovação da Meta!");
      onCreated();
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao criar template.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Criar Template WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Nome <span className="text-red-500">*</span></Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="lembrete_agendamento"
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Apenas letras minúsculas, números e underscore. Único por WABA.
            </p>
          </div>

          {/* Categoria + Idioma */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={v => setCategory(v as typeof category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTILITY">Utility</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en_US">English (US)</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cabeçalho (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-header">Cabeçalho <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input
              id="tpl-header"
              value={headerText}
              onChange={e => setHeaderText(e.target.value)}
              placeholder="Ex: Lembrete de Agendamento"
            />
          </div>

          {/* Corpo */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Corpo <span className="text-red-500">*</span></Label>
            <textarea
              id="tpl-body"
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              rows={4}
              placeholder="Olá {{1}}, seu agendamento de {{2}} está marcado para {{3}} às {{4}}."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Use {"{{1}}"}, {"{{2}}"}, etc. para variáveis. Após criar, configure o mapeamento.
            </p>
          </div>

          {/* Rodapé (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-footer">Rodapé <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input
              id="tpl-footer"
              value={footerText}
              onChange={e => setFooterText(e.target.value)}
              placeholder="Ex: Para cancelar, responda CANCELAR."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={create.isPending} className="gap-1.5">
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enviar para aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog: Mapeamento de variáveis ───────────────────────────────────────────
function MappingDialog({
  template,
  connectionId,
  onClose,
  updateMapping,
}: {
  template: WhatsAppTemplate | null;
  connectionId: string;
  onClose: () => void;
  updateMapping: ReturnType<typeof useWhatsAppTemplates>["updateMapping"];
}) {
  const [mapping,  setMapping]  = useState<Record<string, string>>(template?.variable_mapping ?? {});
  const [examples, setExamples] = useState<Record<string, string>>(template?.variable_examples ?? {});

  if (!template) return null;

  const bodyComponent = template.components.find(c => c.type === "BODY");
  const variables     = (bodyComponent?.text?.match(/\{\{(\d+)\}\}/g) ?? [])
    .map(v => v.replace(/\{+|\}+/g, ""))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => Number(a) - Number(b));

  const handleSave = async () => {
    try {
      await updateMapping.mutateAsync({
        template_id:       template.id,
        connection_id:     connectionId,
        variable_mapping:  mapping,
        variable_examples: examples,
      });
      toast.success("Mapeamento salvo!");
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao salvar mapeamento.");
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mapeamento de Variáveis — <code className="text-sm">{template.name}</code></DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            Associe cada variável do template a um campo do agendamento.
            Isso permite que o sistema preencha automaticamente os valores corretos.
          </p>

          {variables.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Este template não possui variáveis.</p>
          )}

          {variables.map(varNum => (
            <div key={varNum} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{`{{${varNum}}}`}</code>
                <span className="text-xs text-muted-foreground">→</span>
                <Select
                  value={mapping[varNum] ?? ""}
                  onValueChange={v => setMapping(p => ({ ...p, [varNum]: v }))}
                >
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Selecione o campo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_VARIABLE_FIELDS.map(f => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pl-16">
                <Input
                  value={examples[varNum] ?? ""}
                  onChange={e => setExamples(p => ({ ...p, [varNum]: e.target.value }))}
                  placeholder={`Exemplo para {{${varNum}}}...`}
                  className="h-7 text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={updateMapping.isPending} className="gap-1.5">
            {updateMapping.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar mapeamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export function WhatsAppTemplatesPage() {
  const { auth }       = useClientAuth();
  const organizationId = auth?.organization_id as string | undefined;
  const navigate       = useNavigate();
  const slug           = auth?.id ? window.location.pathname.split("/")[3] : "";
  const userRole       = auth?.user?.role ?? "viewer";
  const canEdit        = ["owner","admin","manager"].includes(userRole);

  // Busca conexão WhatsApp ativa — passa organizationId explicitamente
  // para evitar usar useOrganization() que depende do AuthProvider da agência
  const { connections } = useMetaConnections(organizationId);
  const waConn = connections?.find(c =>
    (c.provider === "whatsapp" || c.provider === "meta_multi") &&
    c.status === "active" && c.waba_id
  );
  const connectionId = waConn?.id ?? "";

  const {
    templates, isLoading, sync, listFromMeta, create,
    updateMapping, remove, statusLabel, statusColor, extractVariables,
  } = useWhatsAppTemplates(connectionId, organizationId);

  const [showCreate,      setShowCreate]      = useState(false);
  const [mappingTemplate, setMappingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [search,          setSearch]          = useState("");
  const [filterStatus,    setFilterStatus]    = useState<string>("all");

  const filteredTemplates = templates.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleSync = async () => {
    if (!connectionId) return;
    try {
      const result = await sync.mutateAsync();
      toast.success(`${result.synced} templates sincronizados.`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao sincronizar.");
    }
  };

  const handleListFromMeta = async () => {
    if (!connectionId) return;
    try {
      const result = await listFromMeta.mutateAsync();
      toast.success(`${result.synced} templates importados da Meta.`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao importar.");
    }
  };

  const handleDelete = async (template: WhatsAppTemplate) => {
    if (!confirm(`Excluir template "${template.name}"? Esta ação é irreversível.`)) return;
    try {
      await remove.mutateAsync({ templateId: template.id });
      toast.success("Template excluído.");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao excluir.");
    }
  };

  // Estado: sem WhatsApp conectado
  if (!waConn) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Templates WhatsApp" description="Gerencie templates para envio de mensagens automáticas." />
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <div>
            <p className="text-sm font-medium">Nenhuma conta WhatsApp Business conectada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Conecte sua conta WhatsApp Business para gerenciar templates.
            </p>
          </div>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
          >
            <Link2 className="h-3.5 w-3.5" /> Conectar WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Templates WhatsApp"
        description="Templates HSM aprovados pela Meta para envio automatizado de mensagens."
      />

      {/* Info WABA */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <p className="text-xs text-emerald-700">
          <strong>{waConn.display_name ?? "WhatsApp Business"}</strong> conectado
          {waConn.whatsapp_display_phone_number && ` — ${waConn.whatsapp_display_phone_number}`}
        </p>
      </div>

      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar template..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 w-48 text-sm"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="APPROVED">Aprovados</SelectItem>
            <SelectItem value="PENDING">Em análise</SelectItem>
            <SelectItem value="REJECTED">Rejeitados</SelectItem>
            <SelectItem value="PAUSED">Pausados</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
            onClick={handleListFromMeta}
            disabled={listFromMeta.isPending || sync.isPending}
            title="Importar todos os templates da WABA"
          >
            {listFromMeta.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />
            }
            Importar da Meta
          </Button>
          <Button
            size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
            onClick={handleSync}
            disabled={sync.isPending || listFromMeta.isPending}
            title="Sincronizar status dos templates existentes"
          >
            {sync.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />
            }
            Sincronizar status
          </Button>
          {canEdit && (
            <Button
              size="sm" className="gap-1.5 h-8 text-xs"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Criar template
            </Button>
          )}
        </div>
      </div>

      {/* Lista de templates */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <MessageCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <div>
            <p className="text-sm font-medium">
              {templates.length === 0 ? "Nenhum template encontrado" : "Nenhum template corresponde ao filtro"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {templates.length === 0
                ? "Importe os templates da Meta ou crie um novo."
                : "Tente ajustar a busca ou o filtro de status."
              }
            </p>
          </div>
          {templates.length === 0 && canEdit && (
            <div className="flex justify-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleListFromMeta} disabled={listFromMeta.isPending}>
                {listFromMeta.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Importar da Meta
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" /> Criar primeiro template
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
            {filterStatus !== "all" && ` · ${statusLabel(filterStatus as never)}`}
          </p>
          {filteredTemplates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              statusLabel={statusLabel}
              statusColor={statusColor}
              extractVariables={extractVariables}
              onUpdateMapping={setMappingTemplate}
              onDelete={handleDelete}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {showCreate && (
        <CreateTemplateDialog
          open
          onClose={() => setShowCreate(false)}
          connectionId={connectionId}
          onCreated={() => {}}
          create={create}
        />
      )}
      {mappingTemplate && (
        <MappingDialog
          template={mappingTemplate}
          connectionId={connectionId}
          onClose={() => setMappingTemplate(null)}
          updateMapping={updateMapping}
        />
      )}
    </div>
  );
}
