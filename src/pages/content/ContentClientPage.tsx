/**
 * ContentClientPage — Hub completo de gestão de conteúdo por cliente.
 * Rota: /content/cliente/:clientId
 *
 * Fluxo de criação por aba:
 *   Campanhas    → Dialog "Nova Campanha"
 *   Briefing     → Dialog "Novo Briefing"
 *   Planejamento → Dialog "Novo Item" + calendário
 *   Conteúdos    → Dialog "Novo Item" + kanban
 *   Visão Geral  → Atalhos para as outras abas
 */

import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress }  from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle, Plus, Send, FileText, Megaphone,
  ImagePlay, CheckCircle2, ArrowRight, Link2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useOrganization }                   from "@/hooks/useOrganization";
import { useClients }                        from "@/hooks/useClients";
import { useContentItems, useContentDashboardSummary } from "@/hooks/useContentItems";
import { useContentCampaigns }               from "@/hooks/useContentCampaigns";
import { useContentBriefs }                  from "@/hooks/useContentBriefs";
import { useContentDeliverables }            from "@/hooks/useContentDeliverables";
import { usePartnerUsers }                   from "@/hooks/usePartnerUsers";
import { useContentClients }                 from "@/hooks/useContentClients";
import { ContentClientHeader, type ContentClientTab } from "@/components/content/ContentClientHeader";
import { ContentDashboardSummary }           from "@/components/content/ContentDashboardSummary";
import { ContentPlannedVsPublishedChart }    from "@/components/content/ContentPlannedVsPublishedChart";
import { ContentStatusDistributionTable }    from "@/components/content/ContentStatusDistributionTable";
import { ContentNextActionsTable }           from "@/components/content/ContentNextActionsTable";
import { ContentWeekCalendar }               from "@/components/content/ContentWeekCalendar";
import { ContentKanbanBoard }                from "@/components/content/ContentKanbanBoard";
import { ContentCalendar }                   from "@/components/content/ContentCalendar";
import { ContentItemForm }                   from "@/components/content/ContentItemForm";
import { ContentBriefForm }                  from "@/components/content/ContentBriefForm";
import { ContentApprovalHistoryLog }         from "@/components/content/ContentApprovalHistoryLog";
import { ContentAssetGallery }               from "@/components/content/ContentAssetGallery";
import { ContentStatusBadge, ContentPlatformBadge } from "@/components/content/ContentStatusBadge";
import type { ContentItem, ContentStatus }   from "@/hooks/useContentItems";
import type { ContentBriefInsert }           from "@/hooks/useContentBriefs";

// ── Schema para nova campanha ─────────────────────────────────────────────────

const campaignSchema = z.object({
  title:       z.string().min(1, "Título obrigatório"),
  objective:   z.string().optional(),
  description: z.string().optional(),
  start_date:  z.string().optional(),
  end_date:    z.string().optional(),
});
type CampaignFormValues = z.infer<typeof campaignSchema>;

const OBJECTIVES = [
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "lead_gen",        label: "Geração de Leads" },
  { value: "engagement",      label: "Engajamento" },
  { value: "retention",       label: "Retenção" },
  { value: "lancamento",      label: "Lançamento" },
  { value: "outro",           label: "Outro" },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  rascunho:  { label: "Rascunho",  className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  ativa:     { label: "Ativa",     className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  concluida: { label: "Concluída", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  arquivada: { label: "Arquivada", className: "bg-gray-100 text-gray-400" },
};

// ── Componente principal ──────────────────────────────────────────────────────

export function ContentClientPage() {
  const { clientId }   = useParams<{ clientId: string }>();
  const navigate       = useNavigate();
  const organizationId = useOrganization();

  const [activeTab,       setActiveTab]       = useState<ContentClientTab>("visao-geral");
  const [showNewItem,     setShowNewItem]      = useState(false);
  const [showNewCampaign, setShowNewCampaign]  = useState(false);
  const [showNewBrief,    setShowNewBrief]     = useState(false);

  // ── Dados ─────────────────────────────────────────────────────────────────
  const { data: clients = [], isLoading: clientsLoading } = useClients(organizationId);
  const client = clients.find(c => c.id === clientId);

  const { items, loading: itemsLoading, create, update, isCreating, sendForApproval } =
    useContentItems(organizationId, { clientId: clientId! });

  const { data: summary, isLoading: summaryLoading } =
    useContentDashboardSummary(organizationId, clientId);

  const { campaigns, loading: campaignsLoading, create: createCampaign, isCreating: isCreatingCampaign } =
    useContentCampaigns(organizationId, clientId);

  const { briefs, loading: briefsLoading, create: createBrief, send: sendBrief, isCreating: isCreatingBrief } =
    useContentBriefs(organizationId, clientId);

  const { deliverables, loading: deliverablesLoading } =
    useContentDeliverables(organizationId, clientId);

  const { partners } = usePartnerUsers();
  const { linkedIds, link, isLinking, loading: contentClientsLoading } = useContentClients(organizationId);
  const isLinked = clientId ? linkedIds.has(clientId) : false;

  const clientPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    items
      .filter(i => i.assigned_to_type === "partner" && i.assigned_to)
      .forEach(i => ids.add(i.assigned_to!));
    return ids;
  }, [items]);

  const clientPartners = partners.filter(p => clientPartnerIds.has(p.id));
  const pendingApprovals = items.filter(i => i.status === "aguardando_aprovacao");

  // ── Form: nova campanha ───────────────────────────────────────────────────
  const campaignForm = useForm<CampaignFormValues>({ resolver: zodResolver(campaignSchema) });

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleCreateItem(values: Parameters<typeof create>[0]) {
    try {
      const created = await create({ ...values, client_id: clientId! });
      setShowNewItem(false);
      toast.success("Item criado");
      navigate(`/content/itens/${created.id}`);
    } catch {
      toast.error("Falha ao criar item");
    }
  }

  async function handleCreateCampaign(values: CampaignFormValues) {
    try {
      await createCampaign({
        client_id:   clientId!,
        title:       values.title,
        description: values.description ?? null,
        objective:   (values.objective === "__none__" ? null : values.objective) as any,
        status:      "rascunho",
        start_date:  values.start_date ?? null,
        end_date:    values.end_date   ?? null,
        metadata:    {},
        created_by:  null,
      });
      setShowNewCampaign(false);
      campaignForm.reset();
      toast.success("Campanha criada");
    } catch {
      toast.error("Falha ao criar campanha");
    }
  }

  async function handleCreateBrief(values: Omit<ContentBriefInsert, "organization_id">) {
    try {
      await createBrief({ ...values, client_id: clientId! });
      setShowNewBrief(false);
      toast.success("Briefing criado");
    } catch {
      toast.error("Falha ao criar briefing");
    }
  }

  async function handleStatusChange(itemId: string, newStatus: ContentStatus) {
    try {
      await update({ id: itemId, status: newStatus });
    } catch {
      toast.error("Falha ao atualizar status");
    }
  }

  // ── Resumo ─────────────────────────────────────────────────────────────────
  const summaryData = summary
    ? {
        total_items:        Number(summary.total_items ?? 0),
        in_production:      Number(summary.in_production ?? 0),
        awaiting_approval:  Number(summary.awaiting_approval ?? 0),
        published:          Number(summary.published ?? 0),
        overdue_production: Number(summary.overdue_production ?? 0),
        published_prev_month: undefined,
        monthly_goal:       undefined,
      }
    : null;

  // ── Guards de carregamento ────────────────────────────────────────────────
  if (!clientsLoading && !client) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>Cliente não encontrado.</p>
        <Button variant="link" onClick={() => navigate("/content")}>Voltar</Button>
      </div>
    );
  }

  if (clientsLoading && !client) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  // ── Guard: cliente não vinculado ao módulo ────────────────────────────────
  if (!isLinked && !contentClientsLoading) {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto">
          <Link2 className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-lg">{client?.company || client?.name}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Este cliente ainda não está vinculado ao módulo de Gestão de Conteúdo.
          </p>
        </div>
        <Button
          onClick={async () => {
            if (!clientId) return;
            try {
              await link({ client_id: clientId });
              toast.success("Cliente vinculado ao módulo");
            } catch {
              toast.error("Falha ao vincular cliente");
            }
          }}
          disabled={isLinking}
        >
          {isLinking
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <Link2 className="h-4 w-4 mr-2" />
          }
          Vincular ao módulo de conteúdo
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate("/content?tab=clientes")}>
          Voltar para Clientes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <ContentClientHeader
        client={{
          id:          client!.id,
          name:        client!.name,
          company:     client!.company ?? null,
          favicon_url: (client as any).favicon_url ?? null,
          city:        (client as any).city ?? null,
          state:       (client as any).state ?? null,
        }}
        activeTab={activeTab}
        onTabChange={tab => {
          setActiveTab(tab);
          // Abre o dialog de criação ao clicar em abas que precisam de um item inicial
          // (evita abas vazias sem contexto)
        }}
        onNewContent={() => setShowNewItem(true)}
      />

      {/* ── Conteúdo das abas ── */}
      <div className="pt-2">

        {/* ════ VISÃO GERAL ════ */}
        {activeTab === "visao-geral" && (
          <div className="space-y-5">

            {/* Atalhos de início rápido quando não há conteúdo */}
            {summaryData?.total_items === 0 && !summaryLoading && (
              <div className="rounded-xl border border-dashed border-border/60 p-6">
                <p className="text-sm font-semibold text-foreground mb-1">
                  Nenhum conteúdo ainda. Por onde começar?
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  O fluxo recomendado: crie uma campanha → defina o briefing → adicione os itens de conteúdo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => { setActiveTab("campanhas"); setShowNewCampaign(true); }}>
                    <Megaphone className="h-3.5 w-3.5 mr-1.5" />1. Nova Campanha
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setActiveTab("briefing"); setShowNewBrief(true); }}>
                    <FileText className="h-3.5 w-3.5 mr-1.5" />2. Novo Briefing
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setActiveTab("conteudos"); setShowNewItem(true); }}>
                    <ImagePlay className="h-3.5 w-3.5 mr-1.5" />3. Novo Item
                  </Button>
                </div>
              </div>
            )}

            <ContentDashboardSummary data={summaryData} loading={summaryLoading} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card className="border-border/60">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold">Planejado vs. Publicado</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <ContentPlannedVsPublishedChart items={items} loading={itemsLoading} />
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold">Distribuição e Status</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <ContentStatusDistributionTable items={items} loading={itemsLoading} />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card className="border-border/60">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold">Próximas ações</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <ContentNextActionsTable items={items} loading={itemsLoading} max={6} />
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold">Calendário da semana</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <ContentWeekCalendar
                    items={items}
                    onItemClick={item => navigate(`/content/itens/${item.id}`)}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ════ ESTRATÉGIA ════ */}
        {activeTab === "estrategia" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Estratégia de Conteúdo</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Defina campanhas e briefings antes de criar os itens.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowNewBrief(true)}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" />Novo Briefing
                </Button>
                <Button size="sm" onClick={() => setShowNewCampaign(true)}>
                  <Megaphone className="h-3.5 w-3.5 mr-1.5" />Nova Campanha
                </Button>
              </div>
            </div>

            {/* Campanhas ativas */}
            {campaigns.filter(c => c.status === "ativa").length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                  Campanhas ativas
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {campaigns.filter(c => c.status === "ativa").map(camp => (
                    <Card key={camp.id} className="border-border/60">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-semibold text-sm">{camp.title}</p>
                          <Badge variant="outline" className={cn("text-xs border-0", STATUS_LABELS["ativa"]?.className)}>Ativa</Badge>
                        </div>
                        {camp.objective && (
                          <p className="text-xs text-muted-foreground">
                            {OBJECTIVES.find(o => o.value === camp.objective)?.label ?? camp.objective}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{camp.items_count ?? 0} iten{(camp.items_count ?? 0) !== 1 ? "s" : ""}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Briefings enviados */}
            {briefs.filter(b => b.status !== "rascunho").length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                  Briefings enviados ao cliente
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {briefs.filter(b => b.status !== "rascunho").map(brief => (
                    <Card key={brief.id} className="border-border/60">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">{brief.title}</p>
                          <Badge variant="outline" className="text-xs shrink-0">{brief.status}</Badge>
                        </div>
                        {brief.objective && <p className="text-xs text-muted-foreground">{brief.objective}</p>}
                        {brief.key_messages.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {brief.key_messages.slice(0, 3).map((msg, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">
                                {msg.slice(0, 30)}{msg.length > 30 ? "…" : ""}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {campaigns.length === 0 && briefs.length === 0 && (
              <div className="text-center py-14 text-muted-foreground border border-dashed rounded-xl">
                <p className="text-sm font-medium mb-1">Nenhuma estratégia definida</p>
                <p className="text-xs mb-4">Crie uma campanha ou um briefing para estruturar o conteúdo.</p>
                <div className="flex justify-center gap-2">
                  <Button size="sm" onClick={() => setShowNewCampaign(true)}>
                    <Megaphone className="h-3.5 w-3.5 mr-1.5" />Nova Campanha
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowNewBrief(true)}>
                    <FileText className="h-3.5 w-3.5 mr-1.5" />Novo Briefing
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ BRIEFING ════ */}
        {activeTab === "briefing" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {briefs.length} briefing{briefs.length !== 1 ? "s" : ""}
              </p>
              <Button size="sm" onClick={() => setShowNewBrief(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Novo Briefing
              </Button>
            </div>

            {briefsLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : briefs.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground border border-dashed rounded-xl">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Nenhum briefing criado</p>
                <p className="text-xs mb-4">Briefings definem objetivos, público e tom de voz do conteúdo.</p>
                <Button size="sm" onClick={() => setShowNewBrief(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Criar primeiro briefing
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {briefs.map(brief => {
                  const doneTasks  = brief.client_tasks.filter(t => t.status === "concluido").length;
                  const totalTasks = brief.client_tasks.length;
                  return (
                    <Card key={brief.id} className="border-border/60">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] shrink-0">{brief.status}</Badge>
                              {brief.deadline && (
                                <span className="text-[11px] text-muted-foreground">
                                  Prazo: {format(parseISO(brief.deadline), "dd/MM/yyyy", { locale: ptBR })}
                                </span>
                              )}
                            </div>
                            <p className="font-medium text-sm truncate">{brief.title}</p>
                            {brief.objective && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{brief.objective}</p>
                            )}
                            {totalTasks > 0 && (
                              <div className="space-y-1 pt-1">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Tarefas do cliente</span>
                                  <span>{doneTasks}/{totalTasks}</span>
                                </div>
                                <Progress value={totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0} className="h-1.5" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {brief.status === "rascunho" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={async () => {
                                  try {
                                    await sendBrief(brief.id);
                                    toast.success("Briefing enviado ao cliente");
                                  } catch {
                                    toast.error("Falha ao enviar");
                                  }
                                }}
                              >
                                <Send className="h-3 w-3 mr-1" />Enviar
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ CAMPANHAS ════ */}
        {activeTab === "campanhas" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""}
              </p>
              <Button size="sm" onClick={() => setShowNewCampaign(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Nova Campanha
              </Button>
            </div>

            {campaignsLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : campaigns.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground border border-dashed rounded-xl">
                <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Nenhuma campanha criada</p>
                <p className="text-xs mb-4">Agrupe seus itens de conteúdo por campanha para organizar melhor o planejamento.</p>
                <Button size="sm" onClick={() => setShowNewCampaign(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Criar primeira campanha
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaigns.map(camp => {
                  const statusCfg = STATUS_LABELS[camp.status] ?? STATUS_LABELS["rascunho"];
                  return (
                    <Card key={camp.id} className="border-border/60 hover:shadow-sm transition-shadow">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm leading-snug">{camp.title}</p>
                          <Badge variant="outline" className={cn("text-xs border-0 shrink-0", statusCfg.className)}>
                            {statusCfg.label}
                          </Badge>
                        </div>
                        {camp.objective && (
                          <p className="text-xs text-muted-foreground">
                            {OBJECTIVES.find(o => o.value === camp.objective)?.label ?? camp.objective}
                          </p>
                        )}
                        {(camp.start_date || camp.end_date) && (
                          <p className="text-xs text-muted-foreground">
                            {camp.start_date && format(parseISO(camp.start_date), "dd/MM/yy", { locale: ptBR })}
                            {camp.start_date && camp.end_date && " → "}
                            {camp.end_date && format(parseISO(camp.end_date), "dd/MM/yy", { locale: ptBR })}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground/70">
                            {camp.items_count ?? 0} iten{(camp.items_count ?? 0) !== 1 ? "s" : ""}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => { setShowNewItem(true); }}
                          >
                            <Plus className="h-3 w-3 mr-1" />Add item
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ PLANEJAMENTO ════ */}
        {activeTab === "planejamento" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Calendário editorial mensal</p>
              <Button size="sm" onClick={() => setShowNewItem(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Novo Item
              </Button>
            </div>
            <ContentCalendar
              organizationId={organizationId}
              clientId={clientId}
              onItemClick={item => navigate(`/content/itens/${item.id}`)}
            />
          </div>
        )}

        {/* ════ CONTEÚDOS (Kanban) ════ */}
        {activeTab === "conteudos" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {items.filter(i => i.status !== "arquivado").length} iten{items.filter(i => i.status !== "arquivado").length !== 1 ? "s" : ""} em produção
              </p>
              <Button size="sm" onClick={() => setShowNewItem(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Novo Item
              </Button>
            </div>

            {itemsLoading ? (
              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground border border-dashed rounded-xl">
                <ImagePlay className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Nenhum item de conteúdo</p>
                <p className="text-xs mb-4">Crie posts, reels, stories, roteiros, banners e outros tipos de conteúdo.</p>
                <Button size="sm" onClick={() => setShowNewItem(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Criar primeiro item
                </Button>
              </div>
            ) : (
              <ContentKanbanBoard
                items={items}
                onItemClick={item => navigate(`/content/itens/${item.id}`)}
                onStatusChange={handleStatusChange}
              />
            )}
          </div>
        )}

        {/* ════ CALENDÁRIO (Semanal) ════ */}
        {activeTab === "calendario" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Calendário semanal de publicações</p>
              <Button size="sm" onClick={() => setShowNewItem(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Novo Item
              </Button>
            </div>
            <Card className="border-border/60">
              <CardContent className="p-5">
                <ContentWeekCalendar
                  items={items}
                  onItemClick={item => navigate(`/content/itens/${item.id}`)}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════ APROVAÇÕES ════ */}
        {activeTab === "aprovacoes" && (
          <div className="space-y-5">
            {pendingApprovals.length > 0 ? (
              <div className="rounded-xl border border-violet-300/40 bg-violet-50/30 dark:bg-violet-900/10 p-4">
                <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
                  {pendingApprovals.length} ite{pendingApprovals.length !== 1 ? "ns aguardam" : "m aguarda"} aprovação do cliente
                </p>
                <div className="space-y-2">
                  {pendingApprovals.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/40 hover:bg-accent/20 cursor-pointer transition-colors"
                      onClick={() => navigate(`/content/itens/${item.id}`)}
                    >
                      <ContentPlatformBadge platform={item.platform} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        {item.scheduled_date && (
                          <p className="text-xs text-muted-foreground">
                            Publicação: {format(parseISO(item.scheduled_date), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        )}
                      </div>
                      <ContentStatusBadge status={item.status} size="sm" />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 p-6 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-70" />
                <p className="text-sm font-medium">Nenhuma aprovação pendente</p>
                <p className="text-xs mt-1">Todos os itens foram avaliados pelo cliente.</p>
              </div>
            )}

            {/* Histórico */}
            {items.filter(i => !["briefing", "producao"].includes(i.status)).length > 0 && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Histórico de decisões
                </p>
                {items
                  .filter(i => !["briefing", "producao"].includes(i.status))
                  .slice(0, 5)
                  .map(item => (
                    <Card key={item.id} className="border-border/60">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <div className="flex items-center gap-2">
                          <ContentPlatformBadge platform={item.platform} />
                          <CardTitle className="text-sm font-medium flex-1 truncate">{item.title}</CardTitle>
                          <ContentStatusBadge status={item.status} size="sm" />
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <ContentApprovalHistoryLog itemId={item.id} />
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ════ BIBLIOTECA ════ */}
        {activeTab === "biblioteca" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Assets por item de conteúdo</p>
              <Button size="sm" onClick={() => setShowNewItem(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Novo Item
              </Button>
            </div>
            {itemsLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : items.filter(i => i.status !== "arquivado").length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                <p className="text-sm">Nenhum item com assets ainda.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {items.filter(i => i.status !== "arquivado").slice(0, 10).map(item => (
                  <div key={item.id}>
                    <div
                      className="flex items-center gap-2 mb-2 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/content/itens/${item.id}`)}
                    >
                      <ContentPlatformBadge platform={item.platform} />
                      <p className="text-sm font-medium truncate flex-1">{item.title}</p>
                      <ContentStatusBadge status={item.status} size="sm" />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                    <ContentAssetGallery itemId={item.id} />
                    <Separator className="mt-4" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ ENTREGÁVEIS ════ */}
        {activeTab === "entregaveis" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Relatórios formais de desempenho</p>
            {deliverablesLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : deliverables.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                <p className="text-sm">Nenhum entregável ainda.</p>
                <p className="text-xs mt-1">Os entregáveis são gerados ao concluir um ciclo de conteúdo.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deliverables.map(d => (
                  <Card key={d.id} className="border-border/60">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm leading-snug">{d.title}</p>
                        <Badge variant="outline" className={`text-xs border-0 ${d.is_visible_to_client ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {d.is_visible_to_client ? "Visível" : "Oculto"}
                        </Badge>
                      </div>
                      {(d.period_start || d.period_end) && (
                        <p className="text-xs text-muted-foreground">
                          {d.period_start && format(parseISO(d.period_start), "dd/MM/yy", { locale: ptBR })}
                          {d.period_start && d.period_end && " – "}
                          {d.period_end && format(parseISO(d.period_end), "dd/MM/yy", { locale: ptBR })}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span><strong>{d.items_count}</strong> iten{d.items_count !== 1 ? "s" : ""}</span>
                        {d.reach_total > 0 && (
                          <span><strong>{d.reach_total.toLocaleString("pt-BR")}</strong> alcance</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ PARCEIROS ════ */}
        {activeTab === "parceiros" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Parceiros/terceirizados com itens atribuídos neste cliente.
            </p>
            {clientPartners.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                <p className="text-sm">Nenhum parceiro atribuído a itens deste cliente.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/content/parceiros")}>
                  Gerenciar parceiros
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {clientPartners.map(partner => {
                  const partnerItems = items.filter(i => i.assigned_to === partner.id);
                  return (
                    <Card key={partner.id} className="border-border/60">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">{partner.full_name ?? "(sem nome)"}</p>
                          {partner.specialty && (
                            <Badge variant="secondary" className="text-xs capitalize">{partner.specialty}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{partner.real_email}</p>
                        <p className="text-xs text-muted-foreground">
                          {partnerItems.length} ite{partnerItems.length !== 1 ? "ns" : "m"} atribuído{partnerItems.length !== 1 ? "s" : ""}
                        </p>
                        {partnerItems.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {partnerItems.slice(0, 3).map(i => (
                              <Badge
                                key={i.id}
                                variant="outline"
                                className="text-[10px] cursor-pointer hover:bg-accent"
                                onClick={() => navigate(`/content/itens/${i.id}`)}
                              >
                                {i.title.slice(0, 20)}{i.title.length > 20 ? "…" : ""}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ════ DIALOGS DE CRIAÇÃO ════ */}

      {/* Novo item de conteúdo */}
      <Dialog open={showNewItem} onOpenChange={setShowNewItem}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Item de Conteúdo — {client?.company || client?.name}</DialogTitle>
          </DialogHeader>
          <ContentItemForm
            initial={{ client_id: clientId }}
            onSubmit={handleCreateItem}
            onCancel={() => setShowNewItem(false)}
            loading={isCreating}
          />
        </DialogContent>
      </Dialog>

      {/* Nova campanha */}
      <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Campanha — {client?.company || client?.name}</DialogTitle>
          </DialogHeader>
          <Form {...campaignForm}>
            <form onSubmit={campaignForm.handleSubmit(handleCreateCampaign)} className="space-y-4 pt-1">
              <FormField control={campaignForm.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl><Input placeholder="Ex: Campanha de Lançamento — Produto X" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={campaignForm.control} name="objective" render={({ field }) => (
                <FormItem>
                  <FormLabel>Objetivo</FormLabel>
                  <Select
                    value={field.value ?? "__none__"}
                    onValueChange={v => field.onChange(v === "__none__" ? undefined : v)}
                  >
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Não especificado</SelectItem>
                      {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={campaignForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Contexto, metas e informações relevantes..."
                      className="resize-none min-h-[80px]"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={campaignForm.control} name="start_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Início</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={campaignForm.control} name="end_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fim</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setShowNewCampaign(false)}>Cancelar</Button>
                <Button type="submit" disabled={isCreatingCampaign}>
                  {isCreatingCampaign && <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-background border-t-transparent" />}
                  Criar Campanha
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Novo briefing */}
      <Dialog open={showNewBrief} onOpenChange={setShowNewBrief}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Briefing — {client?.company || client?.name}</DialogTitle>
          </DialogHeader>
          <ContentBriefForm
            onSubmit={handleCreateBrief}
            onCancel={() => setShowNewBrief(false)}
            loading={isCreatingBrief}
          />
        </DialogContent>
      </Dialog>

    </div>
  );
}
