/**
 * WhatsAppTemplatesPage
 *
 * Gerencia templates WhatsApp Business (HSM) da WABA conectada.
 * Rota: /:slug/mensagens/templates
 *
 * ATENÇÃO: Esta página está no dashboard público do cliente (C8 Control).
 * Usa APENAS useClientAuth — nunca useAuth/useOrganization do CRM/AuthContext.
 * Todos os dados são buscados diretamente via supabase (Banco A).
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, RefreshCw, Plus, Loader2, AlertCircle,
  CheckCircle2, Clock, XCircle, PauseCircle, ChevronDown,
  ChevronUp, Info, Trash2, Link2,
} from "lucide-react";
import { toast }   from "sonner";
import { Button }  from "@/components/ui/button";
import { Badge }   from "@/components/ui/badge";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/pages/public-dashboard/components/PageHeader";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase }      from "@/lib/supabase";

// ── Tipos locais ──────────────────────────────────────────────────────────────

type TemplateStatus   = "APPROVED"|"PENDING"|"REJECTED"|"PAUSED"|"DISABLED"|"IN_APPEAL"|"DELETED";
type TemplateCategory = "UTILITY"|"MARKETING"|"AUTHENTICATION";

interface TemplateComponent {
  type:    "HEADER"|"BODY"|"FOOTER"|"BUTTONS";
  format?: "TEXT"|"IMAGE"|"VIDEO"|"DOCUMENT";
  text?:   string;
}

interface WaTemplate {
  id:               string;
  organization_id:  string;
  meta_template_id: string | null;
  waba_id:          string;
  connection_id:    string | null;
  name:             string;
  category:         TemplateCategory;
  language:         string;
  status:           TemplateStatus;
  status_meta:      string | null;
  rejection_reason: string | null;
  components:       TemplateComponent[];
  variable_mapping: Record<string,string>;
  variable_examples:Record<string,string>;
  last_synced_at:   string | null;
  created_at:       string;
}

interface WaConnection {
  id:                           string;
  waba_id:                      string | null;
  client_id:                    string | null;
  status:                       string;
  display_name:                 string | null;
  whatsapp_display_phone_number:string | null;
  provider:                     string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const STATUS_LABEL: Record<TemplateStatus, string> = {
  APPROVED:"Aprovado", PENDING:"Em análise", REJECTED:"Rejeitado",
  PAUSED:"Pausado", DISABLED:"Desabilitado", IN_APPEAL:"Em recurso", DELETED:"Excluído",
};
const STATUS_COLOR: Record<TemplateStatus, string> = {
  APPROVED:"bg-emerald-100 text-emerald-700 border-emerald-200",
  PENDING:"bg-amber-100 text-amber-700 border-amber-200",
  REJECTED:"bg-red-100 text-red-700 border-red-200",
  PAUSED:"bg-yellow-100 text-yellow-700 border-yellow-200",
  DISABLED:"bg-slate-100 text-slate-600 border-slate-200",
  IN_APPEAL:"bg-blue-100 text-blue-700 border-blue-200",
  DELETED:"bg-red-50 text-red-400 border-red-100",
};

const VARIABLE_FIELDS = [
  { value:"customer.name",          label:"Nome do cliente" },
  { value:"customer.phone",         label:"Telefone do cliente" },
  { value:"appointment.date",       label:"Data do agendamento" },
  { value:"appointment.time",       label:"Horário do agendamento" },
  { value:"appointment.weekday",    label:"Dia da semana" },
  { value:"appointment.service",    label:"Nome do serviço" },
  { value:"appointment.professional",label:"Nome do profissional" },
  { value:"company.name",           label:"Nome do estabelecimento" },
];

// ── Componente ────────────────────────────────────────────────────────────────

export function WhatsAppTemplatesPage() {
  const { auth }       = useClientAuth();
  const organizationId = auth?.organization_id as string | undefined;
  const navigate       = useNavigate();
  const slug           = auth?.slug ?? "";
  const userRole       = auth?.user?.role ?? "viewer";
  const canEdit        = ["owner","admin","manager"].includes(userRole);

  const [connection,  setConnection]  = useState<WaConnection | null>(null);
  const [templates,   setTemplates]   = useState<WaTemplate[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [showCreate,  setShowCreate]  = useState(false);
  const [mappingTpl,  setMappingTpl]  = useState<WaTemplate | null>(null);
  const [expanded,    setExpanded]    = useState<string | null>(null);

  // Carrega conexão WhatsApp ativa e templates
  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // auth.id É o client_id neste contexto (ClientInfo.id = clients.id)
      const clientId = auth?.id;

      let conn: WaConnection | null = null;

      if (clientId) {
        const { data: clientConns } = await supabase
          .from("meta_connections_safe")
          .select("id, waba_id, status, display_name, whatsapp_display_phone_number, provider, client_id")
          .eq("organization_id", organizationId)
          .eq("client_id", clientId)
          .in("provider", ["whatsapp","meta_multi"])
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);

        conn = (clientConns?.[0] ?? null) as WaConnection | null;
      }

      if (!conn) {
        // Fallback: conexão global da organização (client_id IS NULL)
        const { data: globalConns } = await supabase
          .from("meta_connections_safe")
          .select("id, waba_id, status, display_name, whatsapp_display_phone_number, provider, client_id")
          .eq("organization_id", organizationId)
          .is("client_id", null)
          .in("provider", ["whatsapp","meta_multi"])
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);

        conn = (globalConns?.[0] ?? null) as WaConnection | null;
      }

      setConnection(conn);

      if (!conn) { setLoading(false); return; }

      // Busca templates do banco local
      const { data: tpls } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");

      setTemplates((tpls ?? []) as WaTemplate[]);
    } catch (e) {
      console.error("[WhatsAppTemplatesPage] load:", e);
    } finally {
      setLoading(false);
    }
  }, [organizationId, auth?.id]);

  useEffect(() => { load(); }, [load]);

  // Chama a EF whatsapp-template-service
  async function callTemplateService(action: string, extra: Record<string,unknown> = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Não autenticado");

    const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-template-service`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey":        ANON_KEY,
      },
      body: JSON.stringify({ action, organization_id: organizationId, connection_id: connection?.id, ...extra }),
    });
    const json = await res.json() as Record<string,unknown>;
    if (!res.ok) throw new Error((json.error as string) ?? `HTTP ${res.status}`);
    return json;
  }

  const handleSync = async () => {
    if (!connection) return;
    setSyncing(true);
    try {
      const r = await callTemplateService("sync") as { synced: number };
      toast.success(`${r.synced} templates sincronizados.`);
      await load();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSyncing(false); }
  };

  const handleImport = async () => {
    if (!connection) return;
    setSyncing(true);
    try {
      const r = await callTemplateService("list") as { synced: number };
      toast.success(`${r.synced} templates importados da Meta.`);
      await load();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSyncing(false); }
  };

  const handleDelete = async (tpl: WaTemplate) => {
    if (!confirm(`Excluir template "${tpl.name}"?`)) return;
    try {
      await callTemplateService("delete", { template_id: tpl.id });
      toast.success("Template excluído.");
      await load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const filtered = templates.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filter === "all" || t.status === filter;
    return matchSearch && matchStatus;
  });

  // ── Estado vazio: sem WhatsApp ───────────────────────────────────────────
  if (!loading && !connection) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Templates WhatsApp" description="Gerencie templates para envio de mensagens automáticas." />
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <div>
            <p className="text-sm font-medium">Nenhuma conta WhatsApp Business conectada</p>
            <p className="text-xs text-muted-foreground mt-1">
              A agência precisa configurar a conexão WhatsApp no painel administrativo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Conexão encontrada mas sem WABA ID (templates requerem WABA) ─────────
  const hasWaba = !!connection?.waba_id;
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Templates WhatsApp" description="Templates HSM aprovados pela Meta para envio automatizado." />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* WABA info */}
          {connection && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-700">
                <strong>{connection.display_name ?? "WhatsApp Business"}</strong> conectado
                {connection.whatsapp_display_phone_number && ` — ${connection.whatsapp_display_phone_number}`}
              </p>
            </div>
          )}

          {/* Aviso: sem WABA ID (templates não disponíveis) */}
          {connection && !hasWaba && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700">WABA ID não configurado</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Para gerenciar templates HSM, a conexão precisa ter um WABA ID (WhatsApp Business Account).
                  Entre em contato com a agência para configurar.
                </p>
              </div>
            </div>
          )}

          {/* Barra de ações */}
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Buscar template..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-48 text-sm" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="APPROVED">Aprovados</SelectItem>
                <SelectItem value="PENDING">Em análise</SelectItem>
                <SelectItem value="REJECTED">Rejeitados</SelectItem>
                <SelectItem value="PAUSED">Pausados</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleImport} disabled={syncing || !hasWaba}>
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Importar da Meta
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleSync} disabled={syncing || !hasWaba}>
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sincronizar status
              </Button>
              {canEdit && (
                <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowCreate(true)} disabled={!hasWaba}>
                  <Plus className="h-3.5 w-3.5" /> Criar template
                </Button>
              )}
            </div>
          </div>

          {/* Lista */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
              <MessageCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                {templates.length === 0 ? "Nenhum template encontrado. Importe ou crie um." : "Nenhum template corresponde ao filtro."}
              </p>
              {templates.length === 0 && canEdit && (
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={handleImport} disabled={syncing}>
                    <RefreshCw className="h-3.5 w-3.5" /> Importar da Meta
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
                    <Plus className="h-3.5 w-3.5" /> Criar template
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(tpl => {
                const isOpen = expanded === tpl.id;
                const body   = tpl.components.find(c => c.type === "BODY");
                const vars   = (body?.text?.match(/\{\{(\d+)\}\}/g) ?? []).filter((v,i,a)=>a.indexOf(v)===i).sort();
                return (
                  <div key={tpl.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpanded(isOpen ? null : tpl.id)}>
                      <MessageCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium font-mono">{tpl.name}</span>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${STATUS_COLOR[tpl.status]}`}>
                            {tpl.status === "APPROVED"  && <CheckCircle2 className="h-3 w-3" />}
                            {tpl.status === "PENDING"   && <Clock className="h-3 w-3" />}
                            {tpl.status === "REJECTED"  && <XCircle className="h-3 w-3" />}
                            {(tpl.status === "PAUSED" || tpl.status === "DISABLED") && <PauseCircle className="h-3 w-3" />}
                            {STATUS_LABEL[tpl.status]}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">{tpl.category}</Badge>
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">{tpl.language}</Badge>
                        </div>
                        {body?.text && <p className="text-xs text-muted-foreground mt-0.5 truncate">{body.text}</p>}
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>
                    {isOpen && (
                      <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/10">
                        {tpl.components.map((c,i) => (
                          <div key={i} className="space-y-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{c.type}</span>
                            <p className="text-xs text-foreground bg-background rounded border border-border px-2 py-1.5 whitespace-pre-wrap">
                              {c.text ?? `[${c.format ?? c.type}]`}
                            </p>
                          </div>
                        ))}
                        {vars.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Variáveis</span>
                              {canEdit && (
                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setMappingTpl(tpl)}>
                                  Editar mapeamento
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              {vars.map(v => {
                                const n = v.replace(/\{+|\}+/g,"");
                                const f = VARIABLE_FIELDS.find(x => x.value === tpl.variable_mapping?.[n]);
                                return (
                                  <div key={v} className="flex items-center gap-1.5 text-xs">
                                    <code className="bg-muted px-1 rounded text-[10px]">{v}</code>
                                    <span className="text-muted-foreground">→</span>
                                    <span className={f ? "text-foreground" : "text-amber-500 italic"}>{f?.label ?? tpl.variable_mapping?.[n] ?? "Não mapeado"}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {tpl.status === "REJECTED" && tpl.rejection_reason && (
                          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span><strong>Rejeitado:</strong> {tpl.rejection_reason}</span>
                          </div>
                        )}
                        {tpl.last_synced_at && (
                          <p className="text-[10px] text-muted-foreground">Sincronizado em {new Date(tpl.last_synced_at).toLocaleString("pt-BR")}</p>
                        )}
                        {canEdit && (
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1" onClick={() => handleDelete(tpl)}>
                              <Trash2 className="h-3.5 w-3.5" /> Excluir
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Dialog: Criar template */}
      {showCreate && connection && (
        <CreateTemplateDialog
          open onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await load(); }}
          organizationId={organizationId ?? ""}
          connectionId={connection.id}
          callService={callTemplateService}
        />
      )}

      {/* Dialog: Mapeamento de variáveis */}
      {mappingTpl && connection && (
        <MappingDialog
          template={mappingTpl}
          onClose={() => setMappingTpl(null)}
          onSaved={async (updated) => { setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t)); setMappingTpl(null); }}
          callService={callTemplateService}
        />
      )}
    </div>
  );
}

// ── Dialog: Criar template ────────────────────────────────────────────────────

function CreateTemplateDialog({ open, onClose, onCreated, organizationId, connectionId, callService }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  organizationId: string; connectionId: string;
  callService: (action: string, extra?: Record<string,unknown>) => Promise<Record<string,unknown>>;
}) {
  const [name,       setName]       = useState("");
  const [category,   setCategory]   = useState<TemplateCategory>("UTILITY");
  const [language,   setLanguage]   = useState("pt_BR");
  const [headerText, setHeaderText] = useState("");
  const [bodyText,   setBodyText]   = useState("");
  const [footerText, setFooterText] = useState("");
  const [saving,     setSaving]     = useState(false);

  const handleSubmit = async () => {
    if (!name || !bodyText) { toast.error("Nome e corpo são obrigatórios."); return; }
    const comps: TemplateComponent[] = [];
    if (headerText.trim()) comps.push({ type: "HEADER", format: "TEXT", text: headerText.trim() });
    comps.push({ type: "BODY", text: bodyText.trim() });
    if (footerText.trim()) comps.push({ type: "FOOTER", text: footerText.trim() });
    setSaving(true);
    try {
      await callService("create", {
        name: name.toLowerCase().replace(/[^a-z0-9_]/g,""),
        category, language, components: comps,
      });
      toast.success("Template submetido para aprovação da Meta!");
      onCreated();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Criar Template</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="lembrete_agendamento" className="font-mono" />
            <p className="text-[10px] text-muted-foreground">Apenas letras minúsculas, números e underscore.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={v => setCategory(v as TemplateCategory)}>
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
          <div className="space-y-1.5">
            <Label>Cabeçalho <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="Ex: Lembrete de Agendamento" />
          </div>
          <div className="space-y-1.5">
            <Label>Corpo *</Label>
            <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={4}
              placeholder={"Olá {{1}}, seu agendamento de {{2}} está marcado para {{3}} às {{4}}."}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
            <p className="text-[10px] text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 shrink-0 mt-0.5" /> Use {"{{1}}"}, {"{{2}}"} etc. para variáveis.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Rodapé <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Ex: Para cancelar, responda CANCELAR." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enviar para aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog: Mapeamento de variáveis ───────────────────────────────────────────

function MappingDialog({ template, onClose, onSaved, callService }: {
  template: WaTemplate; onClose: () => void;
  onSaved: (updated: WaTemplate) => void;
  callService: (action: string, extra?: Record<string,unknown>) => Promise<Record<string,unknown>>;
}) {
  const [mapping,  setMapping]  = useState<Record<string,string>>(template.variable_mapping  ?? {});
  const [examples, setExamples] = useState<Record<string,string>>(template.variable_examples ?? {});
  const [saving,   setSaving]   = useState(false);

  const body = template.components.find(c => c.type === "BODY");
  const vars = (body?.text?.match(/\{\{(\d+)\}\}/g) ?? [])
    .map(v => v.replace(/\{+|\}+/g,"")).filter((v,i,a) => a.indexOf(v)===i).sort((a,b)=>Number(a)-Number(b));

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await callService("update_mapping", {
        template_id:       template.id,
        variable_mapping:  mapping,
        variable_examples: examples,
      }) as { template: WaTemplate };
      toast.success("Mapeamento salvo!");
      onSaved(r.template ?? { ...template, variable_mapping: mapping, variable_examples: examples });
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mapeamento — <code className="text-sm">{template.name}</code></DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">Associe cada variável do template a um campo do agendamento.</p>
          {vars.length === 0 && <p className="text-sm text-muted-foreground italic">Este template não possui variáveis.</p>}
          {vars.map(n => (
            <div key={n} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{`{{${n}}}`}</code>
                <span className="text-xs text-muted-foreground">→</span>
                <Select value={mapping[n] ?? ""} onValueChange={v => setMapping(p => ({ ...p, [n]: v }))}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {VARIABLE_FIELDS.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="pl-16">
                <Input value={examples[n] ?? ""} onChange={e => setExamples(p => ({ ...p, [n]: e.target.value }))}
                  placeholder={`Exemplo para {{${n}}}...`} className="h-7 text-xs" />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
