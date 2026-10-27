/**
 * ContentIndexPage — Dashboard da agência para o módulo de Gestão de Conteúdo.
 *
 * Aba "Visão Geral": métricas consolidadas, gráficos, próximas ações, calendário semanal.
 * Aba "Clientes":    todos os clientes da agência — vinculados aparecem com métricas,
 *                    não vinculados aparecem com botão "+ Vincular ao módulo".
 *
 * URL: /content        → aba Visão Geral
 * URL: /content?tab=clientes → aba Clientes
 */

import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Badge }    from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, LayoutGrid, BarChart3, Link2, Link2Off,
  AlertCircle, CheckCircle2, ArrowRight, Loader2, Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOrganization }             from "@/hooks/useOrganization";
import { useClients }                  from "@/hooks/useClients";
import { useProfiles }                 from "@/hooks/useProfiles";
import { useContentItems, useContentDashboardSummary } from "@/hooks/useContentItems";
import { useContentClients }           from "@/hooks/useContentClients";
import { ContentDashboardSummary }     from "@/components/content/ContentDashboardSummary";
import { ContentPlannedVsPublishedChart } from "@/components/content/ContentPlannedVsPublishedChart";
import { ContentStatusDistributionTable } from "@/components/content/ContentStatusDistributionTable";
import { ContentNextActionsTable }     from "@/components/content/ContentNextActionsTable";
import { ContentWeekCalendar }         from "@/components/content/ContentWeekCalendar";
import { ContentItemForm }             from "@/components/content/ContentItemForm";

// ── Helper ────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

// ── Página ────────────────────────────────────────────────────────────────────

export function ContentIndexPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const organizationId = useOrganization();

  const defaultTab = searchParams.get("tab") === "clientes" ? "clientes" : "visao-geral";

  const [activeTab,        setActiveTab]        = useState(defaultTab);
  const [clientSearch,     setClientSearch]      = useState("");
  const [showNewItem,      setShowNewItem]        = useState(false);
  const [showAddClients,   setShowAddClients]    = useState(false);
  const [addSearch,        setAddSearch]         = useState("");
  const [linkingClientId,  setLinkingClientId]   = useState<string | null>(null);
  const [linkResponsible,  setLinkResponsible]   = useState("__none__");

  // Sincroniza aba com query string (ex: navegação via sidebar)
  useEffect(() => {
    const tab = searchParams.get("tab") === "clientes" ? "clientes" : "visao-geral";
    setActiveTab(tab);
  }, [searchParams]);

  // ── Dados ────────────────────────────────────────────────────────────────────
  const { data: allClients = [], isLoading: clientsLoading } = useClients(organizationId);
  const { data: profiles   = [] }                            = useProfiles(organizationId);

  const { items, loading: itemsLoading, create, isCreating } =
    useContentItems(organizationId);

  const { data: summary, isLoading: summaryLoading } =
    useContentDashboardSummary(organizationId);

  const {
    activeClients: linkedClients,
    contentClients,
    linkedIds,
    loading:  contentClientsLoading,
    link,     isLinking,
    unlink,
  } = useContentClients(organizationId);

  // ── Agrupamento de clientes ───────────────────────────────────────────────

  // Items por cliente (para mostrar métricas nos cards)
  const itemsByClient = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      if (!map.has(item.client_id)) map.set(item.client_id, []);
      map.get(item.client_id)!.push(item);
    }
    return map;
  }, [items]);

  // Clientes vinculados com dados
  const linkedWithData = useMemo(() =>
    linkedClients.map(cc => ({
      cc,
      client:  allClients.find(c => c.id === cc.client_id),
      items:   itemsByClient.get(cc.client_id) ?? [],
    })).filter(r => !!r.client),
  [linkedClients, allClients, itemsByClient]);

  // Clientes NÃO vinculados
  const unlinkedClients = useMemo(() =>
    allClients.filter(c => !linkedIds.has(c.id)),
  [allClients, linkedIds]);

  // Filtro de busca
  const filteredLinked = clientSearch.trim()
    ? linkedWithData.filter(({ client }) =>
        (client!.name + " " + (client!.company ?? ""))
          .toLowerCase().includes(clientSearch.toLowerCase()),
      )
    : linkedWithData;

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleCreate(values: Parameters<typeof create>[0]) {
    try {
      const created = await create(values);
      setShowNewItem(false);
      toast.success("Item criado");
      navigate(`/content/itens/${created.id}`);
    } catch {
      toast.error("Falha ao criar item");
    }
  }

  async function handleLink(clientId: string) {
    try {
      await link({
        client_id:      clientId,
        responsible_id: linkResponsible === "__none__" ? undefined : linkResponsible,
      });
      setLinkingClientId(null);
      setLinkResponsible("__none__");
      toast.success("Cliente vinculado ao módulo de conteúdo");
    } catch {
      toast.error("Falha ao vincular cliente");
    }
  }

  async function handleUnlink(clientId: string) {
    try {
      await unlink(clientId);
      toast.success("Cliente desvinculado");
    } catch {
      toast.error("Falha ao desvincular cliente");
    }
  }

  // ── Resumo ────────────────────────────────────────────────────────────────
  const summaryData = summary
    ? {
        total_items:        Number(summary.total_items        ?? 0),
        in_production:      Number(summary.in_production      ?? 0),
        awaiting_approval:  Number(summary.awaiting_approval  ?? 0),
        published:          Number(summary.published_this_month ?? 0),
        overdue_production: Number(summary.overdue_production  ?? 0),
        published_prev_month: undefined,
        monthly_goal:       undefined,
      }
    : null;

  // ── Cliente sendo vinculado (lookup) ─────────────────────────────────────
  const linkingClient = allClients.find(c => c.id === linkingClientId);

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Gestão de Conteúdo
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Planejamento, produção e aprovação de conteúdo{" "}
            {linkedClients.length > 0 && (
              <span>para <strong>{linkedClients.length}</strong> cliente{linkedClients.length !== 1 ? "s" : ""}.</span>
            )}
          </p>
        </div>
        {/* Botão contextual: muda conforme a aba ativa */}
        {activeTab === "clientes" ? (
          <Button onClick={() => { setAddSearch(""); setShowAddClients(true); }}>
            <Plus className="h-4 w-4 mr-1.5" />Incluir Cliente
          </Button>
        ) : (
          <Button onClick={() => setShowNewItem(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Novo conteúdo
          </Button>
        )}
      </div>

      {/* ── Abas ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="visao-geral" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />Visão Geral
          </TabsTrigger>
          <TabsTrigger value="clientes" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />Clientes
            {linkedClients.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/15 text-primary px-1.5 py-0 rounded-full font-semibold">
                {linkedClients.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ════ VISÃO GERAL ════ */}
        <TabsContent value="visao-geral" className="mt-5 space-y-6">

          {/* Atalhos quando vazio */}
          {summaryData?.total_items === 0 && !summaryLoading && linkedClients.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 p-6">
              <p className="text-sm font-semibold mb-1">Nenhum cliente vinculado ao módulo ainda.</p>
              <p className="text-xs text-muted-foreground mb-4">
                Vá para a aba <strong>Clientes</strong> e vincule os clientes que terão
                conteúdo gerenciado neste módulo.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/content?tab=clientes")}
              >
                <Link2 className="h-3.5 w-3.5 mr-1.5" />Ir para Clientes
              </Button>
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
        </TabsContent>

        {/* ════ CLIENTES ════ */}
        <TabsContent value="clientes" className="mt-5 space-y-6">

          {/* Busca */}
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              className="pl-8"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
            />
          </div>

          {/* ── Clientes vinculados ── */}
          {(contentClientsLoading || clientsLoading) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : filteredLinked.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                Clientes no módulo ({filteredLinked.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredLinked.map(({ cc, client, items: clientItems }) => {
                  const pending   = clientItems.filter(i => i.status === "aguardando_aprovacao").length;
                  const published = clientItems.filter(i => i.status === "publicado").length;
                  const overdue   = clientItems.filter(i => {
                    const d = i.production_deadline ?? i.scheduled_date;
                    return d && new Date(d) < new Date() && !["publicado","arquivado"].includes(i.status);
                  }).length;

                  return (
                    <Card
                      key={cc.content_client_id}
                      className="border-border/60 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
                      onClick={() => navigate(`/content/cliente/${client!.id}`)}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            {cc.favicon_url ? (
                              <img src={cc.favicon_url} alt={cc.client_name} className="object-contain" />
                            ) : (
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                {initials(cc.client_company || cc.client_name)}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                              {cc.client_company || cc.client_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {clientItems.length} ite{clientItems.length !== 1 ? "ns" : "m"}
                              {cc.responsible_name && ` · ${cc.responsible_name}`}
                            </p>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                        </div>

                        {/* Métricas */}
                        <div className="grid grid-cols-3 gap-2">
                          <MetricBox
                            value={pending}
                            label="Aprovação"
                            highlight={pending > 0}
                          />
                          <MetricBox value={published} label="Publicados" />
                          <MetricBox
                            value={overdue}
                            label="Atrasados"
                            alert={overdue > 0}
                          />
                        </div>

                        {/* Botão desvincular */}
                        <div className="flex justify-end pt-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                            onClick={e => {
                              e.stopPropagation();
                              handleUnlink(client!.id);
                            }}
                          >
                            <Link2Off className="h-3 w-3 mr-1" />Desvincular
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Empty state total */}
          {!contentClientsLoading && !clientsLoading &&
           filteredLinked.length === 0 && (
            <div className="text-center py-16 text-muted-foreground space-y-3">
              <LayoutGrid className="h-12 w-12 mx-auto opacity-20" />
              <div>
                <p className="font-medium">Nenhum cliente vinculado ao módulo</p>
                <p className="text-sm mt-1">
                  Clique em <strong>Incluir Cliente</strong> para adicionar clientes
                  ao módulo de Gestão de Conteúdo.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => { setAddSearch(""); setShowAddClients(true); }}
              >
                <Link2 className="h-4 w-4 mr-2" />Incluir Cliente
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: novo item ── */}
      <Dialog open={showNewItem} onOpenChange={setShowNewItem}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Item de Conteúdo</DialogTitle>
          </DialogHeader>
          <ContentItemForm
            onSubmit={handleCreate}
            onCancel={() => setShowNewItem(false)}
            loading={isCreating}
          />
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Incluir Cliente ── */}
      <Dialog open={showAddClients} onOpenChange={v => !v && setShowAddClients(false)}>
        <DialogContent className="max-w-md flex flex-col gap-0 p-0 max-h-[80vh]">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
            <DialogTitle>Incluir Cliente</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Selecione um cliente para vincular ao módulo de Gestão de Conteúdo.
            </p>
          </DialogHeader>

          {/* Busca */}
          <div className="px-4 py-3 border-b border-border/60 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar pelo nome..."
                className="pl-8 h-9"
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Lista scrollável */}
          <div className="overflow-y-auto flex-1 py-1">
            {(() => {
              const filtered = unlinkedClients.filter(c =>
                !addSearch.trim() ||
                (c.name + " " + (c.company ?? ""))
                  .toLowerCase()
                  .includes(addSearch.toLowerCase()),
              );

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-10 text-muted-foreground">
                    <p className="text-sm">
                      {addSearch ? "Nenhum cliente encontrado." : "Todos os clientes já estão vinculados."}
                    </p>
                  </div>
                );
              }

              return filtered.map(client => (
                <button
                  key={client.id}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors text-left"
                  disabled={isLinking && linkingClientId === client.id}
                  onClick={async () => {
                    setLinkingClientId(client.id);
                    try {
                      await link({ client_id: client.id });
                      toast.success(`${client.company || client.name} vinculado`);
                      // Remove da lista filtrada — o invalidateQueries já atualiza o cache
                      // Se não há mais clientes para vincular, fecha o dialog
                      if (unlinkedClients.filter(c => c.id !== client.id).length === 0) {
                        setShowAddClients(false);
                      }
                    } catch {
                      toast.error("Falha ao vincular cliente");
                    } finally {
                      setLinkingClientId(null);
                    }
                  }}
                >
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {initials(client.company || client.name)}
                  </div>

                  {/* Nome */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {client.company || client.name}
                    </p>
                    {client.company && client.name !== client.company && (
                      <p className="text-xs text-muted-foreground truncate">{client.name}</p>
                    )}
                  </div>

                  {/* Ação */}
                  {isLinking && linkingClientId === client.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  ) : (
                    <span className="text-xs text-primary font-medium shrink-0 flex items-center gap-1">
                      <Link2 className="h-3.5 w-3.5" />Vincular
                    </span>
                  )}
                </button>
              ));
            })()}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border/60 shrink-0">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAddClients(false)}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: vincular cliente (com responsável — chamado da lista inline) ── */}
      <Dialog
        open={!!linkingClientId && !showAddClients}
        onOpenChange={v => !v && setLinkingClientId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Vincular ao módulo de conteúdo</DialogTitle>
          </DialogHeader>
          {linkingClient && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {initials(linkingClient.company || linkingClient.name)}
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {linkingClient.company || linkingClient.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Será adicionado ao módulo de Gestão de Conteúdo
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Responsável pelo conteúdo
                </label>
                <Select value={linkResponsible} onValueChange={setLinkResponsible}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável definido</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name ?? p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Pode ser definido depois.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setLinkingClientId(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => linkingClientId && handleLink(linkingClientId)}
                  disabled={isLinking}
                >
                  {isLinking && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />Vincular
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ── MetricBox helper ──────────────────────────────────────────────────────────

function MetricBox({
  value, label, highlight = false, alert = false,
}: {
  value: number; label: string; highlight?: boolean; alert?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg p-2 text-center",
      highlight ? "bg-violet-50 dark:bg-violet-900/20" :
      alert     ? "bg-red-50 dark:bg-red-900/20" :
      "bg-muted/40",
    )}>
      <p className={cn(
        "text-base font-black tabular-nums",
        highlight ? "text-violet-600 dark:text-violet-300" :
        alert     ? "text-red-600 dark:text-red-300" :
        "text-foreground",
      )}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
    </div>
  );
}
