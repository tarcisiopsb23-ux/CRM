/**
 * ContentItemDetailPage — detalhe completo de um item de conteúdo.
 * Tabs: Conteúdo | Assets | Comentários | Histórico
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Edit, Send, CheckCircle2, ExternalLink, Loader2,
  Paperclip, MessageSquare, History, FileText, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useContentItem, useContentItems } from "@/hooks/useContentItems";
import { useOrganization } from "@/hooks/useOrganization";
import {
  ContentStatusBadge,
  ContentApprovalBadge,
  ContentPlatformBadge,
  ContentPriorityBadge,
  CONTENT_TYPE_LABELS,
} from "@/components/content/ContentStatusBadge";
import { ContentCommentThread }      from "@/components/content/ContentCommentThread";
import { ContentItemForm }           from "@/components/content/ContentItemForm";
import { ContentApprovalHistoryLog } from "@/components/content/ContentApprovalHistoryLog";

export function ContentItemDetailPage() {
  const { itemId }    = useParams<{ itemId: string }>();
  const navigate      = useNavigate();
  const organizationId = useOrganization();

  const { data: item, isLoading } = useContentItem(itemId);
  const { update, sendForApproval, markPublished } = useContentItems(organizationId);

  const [editOpen,      setEditOpen]      = useState(false);
  const [publishOpen,   setPublishOpen]   = useState(false);
  const [pubUrl,        setPubUrl]        = useState("");
  const [sendingApproval, setSendingApproval] = useState(false);
  const [markingPublished, setMarkingPublished] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Item não encontrado.
        <Button variant="link" onClick={() => navigate("/content/itens")}>Voltar</Button>
      </div>
    );
  }

  async function handleSendForApproval() {
    if (!item) return;
    setSendingApproval(true);
    try {
      await sendForApproval(item.id);
      toast.success("Item enviado para aprovação do cliente");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar para aprovação");
    } finally {
      setSendingApproval(false);
    }
  }

  async function handleMarkPublished() {
    if (!item) return;
    setMarkingPublished(true);
    try {
      await markPublished({ itemId: item.id, url: pubUrl || undefined });
      setPublishOpen(false);
      toast.success("Item marcado como publicado");
    } catch {
      toast.error("Falha ao marcar como publicado");
    } finally {
      setMarkingPublished(false);
    }
  }

  async function handleUpdate(values: Parameters<typeof update>[0]) {
    try {
      await update({ id: item!.id, ...values });
      setEditOpen(false);
      toast.success("Item atualizado");
    } catch {
      toast.error("Falha ao salvar alterações");
    }
  }

  const canSendForApproval = ["briefing", "producao", "revisao_interna", "reprovado"].includes(item.status);
  const canMarkPublished   = ["aprovado", "aguardando_aprovacao"].includes(item.status);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {item.content_type && (
              <Badge variant="secondary" className="text-xs">
                {CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}
              </Badge>
            )}
            <ContentPlatformBadge platform={item.platform} />
            <ContentStatusBadge  status={item.status} />
            {item.is_visible_to_client && (
              <ContentApprovalBadge status={item.approval_status} />
            )}
            <ContentPriorityBadge priority={item.priority} />
          </div>
          <h1 className="font-display text-xl font-bold text-foreground leading-tight">
            {item.title}
          </h1>
          {item.client_name && (
            <p className="text-sm text-muted-foreground mt-0.5">{item.client_name}</p>
          )}
        </div>

        {/* Ações principais */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
          {canSendForApproval && (
            <Button size="sm" onClick={handleSendForApproval} disabled={sendingApproval}>
              {sendingApproval
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <Send className="h-3.5 w-3.5 mr-1" />
              }
              Enviar para Aprovação
            </Button>
          )}
          {canMarkPublished && (
            <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => setPublishOpen(true)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Marcar Publicado
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="conteudo">
        <TabsList>
          <TabsTrigger value="conteudo"><FileText className="h-3.5 w-3.5 mr-1.5" />Conteúdo</TabsTrigger>
          <TabsTrigger value="assets"><Paperclip className="h-3.5 w-3.5 mr-1.5" />Assets</TabsTrigger>
          <TabsTrigger value="comentarios"><MessageSquare className="h-3.5 w-3.5 mr-1.5" />Comentários</TabsTrigger>
          <TabsTrigger value="historico"><History className="h-3.5 w-3.5 mr-1.5" />Histórico</TabsTrigger>
        </TabsList>

        {/* ── Aba: Conteúdo ── */}
        <TabsContent value="conteudo" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Coluna principal */}
            <div className="lg:col-span-2 space-y-4">
              {item.copy_text && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Copy / Legenda</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{item.copy_text}</p>
                  </CardContent>
                </Card>
              )}
              {item.hashtags?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Hashtags</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {item.hashtags.map(h => (
                      <Badge key={h} variant="secondary" className="text-xs">#{h}</Badge>
                    ))}
                  </CardContent>
                </Card>
              )}
              {item.description && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Notas / Briefing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
                  </CardContent>
                </Card>
              )}
              {item.publication_url && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Link da Publicação</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <a
                      href={item.publication_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {item.publication_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar de metadados */}
            <div className="space-y-3">
              <Card>
                <CardContent className="p-4 space-y-3 text-sm">
                  <MetaRow label="Status">
                    <ContentStatusBadge status={item.status} size="sm" />
                  </MetaRow>
                  {item.is_visible_to_client && (
                    <MetaRow label="Aprovação">
                      <ContentApprovalBadge status={item.approval_status} />
                    </MetaRow>
                  )}
                  <MetaRow label="Versão">
                    <span className="text-muted-foreground">v{item.version}</span>
                  </MetaRow>
                  {item.production_deadline && (
                    <MetaRow label="Prazo Produção">
                      <span className="text-muted-foreground">
                        {format(parseISO(item.production_deadline), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </MetaRow>
                  )}
                  {item.scheduled_date && (
                    <MetaRow label="Publicação">
                      <span className="text-muted-foreground">
                        {format(parseISO(item.scheduled_date), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </MetaRow>
                  )}
                  {item.published_at && (
                    <MetaRow label="Publicado em">
                      <span className="text-muted-foreground">
                        {format(parseISO(item.published_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </MetaRow>
                  )}
                  {item.campaign_title && (
                    <MetaRow label="Campanha">
                      <span className="text-muted-foreground truncate">{item.campaign_title}</span>
                    </MetaRow>
                  )}
                  <MetaRow label="Criado em">
                    <span className="text-muted-foreground">
                      {format(parseISO(item.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </MetaRow>
                  {item.approval_notes && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Nota do cliente</p>
                        <p className="text-sm text-foreground">{item.approval_notes}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Aba: Assets ── */}
        <TabsContent value="assets" className="mt-4">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Upload de assets disponível na Fase 3 (integração n8n → Drive/Vimeo).</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Comentários ── */}
        <TabsContent value="comentarios" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <ContentCommentThread itemId={item.id} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Histórico ── */}
        <TabsContent value="historico" className="mt-4">
          <ContentApprovalHistoryLog itemId={item.id} />
        </TabsContent>
      </Tabs>

      {/* ── Dialog: editar ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Item</DialogTitle>
          </DialogHeader>
          <ContentItemForm
            initial={item}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Dialog: marcar publicado ── */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como Publicado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm font-medium block mb-1">URL da publicação (opcional)</label>
              <input
                type="url"
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                placeholder="https://www.instagram.com/p/..."
                value={pubUrl}
                onChange={e => setPubUrl(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPublishOpen(false)}>Cancelar</Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={handleMarkPublished}
                disabled={markingPublished}
              >
                {markingPublished && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Confirmar Publicação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
