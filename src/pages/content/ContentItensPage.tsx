/**
 * ContentItensPage — listagem de itens de conteúdo.
 * Suporta três views: Kanban (padrão), Lista e Calendário.
 * Filtros: cliente, campanha, status, plataforma.
 */

import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutGrid, List, Calendar, Plus, Search, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import {
  useContentItems,
  type ContentItem,
  type ContentStatus,
} from "@/hooks/useContentItems";
import { useContentCampaigns } from "@/hooks/useContentCampaigns";
import { ContentKanbanBoard } from "@/components/content/ContentKanbanBoard";
import { ContentItemCard }    from "@/components/content/ContentItemCard";
import { ContentItemForm }    from "@/components/content/ContentItemForm";
import { ContentStatusBadge } from "@/components/content/ContentStatusBadge";

const ContentCalendar = lazy(() =>
  import("@/components/content/ContentCalendar").then(m => ({ default: m.ContentCalendar }))
);

type ViewMode = "kanban" | "list" | "calendar";

export function ContentItensPage() {
  const navigate      = useNavigate();
  const organizationId = useOrganization();

  // Filtros
  const [clientFilter,   setClientFilter]   = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [search,         setSearch]         = useState("");
  const [viewMode,       setViewMode]       = useState<ViewMode>("kanban");
  const [showForm,       setShowForm]       = useState(false);

  const { data: clients = [] } = useClients(organizationId);
  const { campaigns }          = useContentCampaigns(
    organizationId,
    clientFilter !== "all" ? clientFilter : undefined,
  );

  const { items, loading, create, update, isCreating } = useContentItems(
    organizationId,
    {
      clientId:   clientFilter   !== "all" ? clientFilter   : undefined,
      campaignId: campaignFilter !== "all" ? campaignFilter : undefined,
    },
  );

  // Filtro de busca local
  const filtered = search.trim()
    ? items.filter(i =>
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        i.copy_text?.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  async function handleCreate(values: Parameters<typeof create>[0]) {
    try {
      const created = await create(values);
      setShowForm(false);
      toast.success("Item criado com sucesso");
      navigate(`/content/itens/${created.id}`);
    } catch {
      toast.error("Falha ao criar item");
    }
  }

  async function handleStatusChange(itemId: string, newStatus: ContentStatus) {
    try {
      await update({ id: itemId, status: newStatus });
      toast.success("Status atualizado");
    } catch {
      toast.error("Falha ao atualizar status");
    }
  }

  function handleItemClick(item: ContentItem) {
    navigate(`/content/itens/${item.id}`);
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Itens de Conteúdo</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} ite{filtered.length !== 1 ? "ns" : "m"}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Item
        </Button>
      </div>

      {/* ── Filtros + view toggle ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar itens..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Select value={clientFilter} onValueChange={v => { setClientFilter(v); setCampaignFilter("all"); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {campaigns.length > 0 && (
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Todas as campanhas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as campanhas</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)} className="ml-auto">
          <TabsList className="h-8">
            <TabsTrigger value="kanban"   className="px-2 h-7"><LayoutGrid className="h-3.5 w-3.5" /></TabsTrigger>
            <TabsTrigger value="list"     className="px-2 h-7"><List       className="h-3.5 w-3.5" /></TabsTrigger>
            <TabsTrigger value="calendar" className="px-2 h-7"><Calendar   className="h-3.5 w-3.5" /></TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {viewMode === "kanban" && (
            <ContentKanbanBoard
              items={filtered}
              onItemClick={handleItemClick}
              onStatusChange={handleStatusChange}
            />
          )}

          {viewMode === "list" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.length === 0 ? (
                <p className="col-span-full text-center text-muted-foreground py-12">
                  Nenhum item encontrado.
                </p>
              ) : (
                filtered.map(item => (
                  <ContentItemCard
                    key={item.id}
                    item={item}
                    onClick={handleItemClick}
                    showCounts
                  />
                ))
              )}
            </div>
          )}

          {viewMode === "calendar" && (
            <Suspense fallback={<Skeleton className="h-[500px] rounded-lg" />}>
              <ContentCalendar
                organizationId={organizationId}
                clientId={clientFilter !== "all" ? clientFilter : undefined}
                onItemClick={handleItemClick}
              />
            </Suspense>
          )}
        </>
      )}

      {/* ── Dialog: novo item ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Item de Conteúdo</DialogTitle>
          </DialogHeader>
          <ContentItemForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            loading={isCreating}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
