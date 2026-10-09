/**
 * ContentPortalIndexPage — visão geral do módulo de conteúdo para o cliente.
 * Exibe itens pendentes de aprovação, calendário do mês e últimas campanhas.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, Megaphone, Send, ArrowRight } from "lucide-react";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useClientContentItems, type ClientApprovalDecision } from "@/hooks/useClientContent";
import { ClientContentCard }   from "@/components/content/ClientContentCard";
import { ClientApprovalPanel } from "@/components/content/ClientApprovalPanel";
import { ClientContentCalendar } from "@/components/content/ClientContentCalendar";
import type { ClientContentItem } from "@/hooks/useClientContent";

export function ContentPortalIndexPage() {
  const { auth, slug } = useClientAuth();
  const navigate = useNavigate();

  const clientId       = auth?.id       ?? "";
  const organizationId = auth?.organization_id ?? "";
  const accessToken    = auth?.session?.access_token ?? "";

  const { items, loading, approve } = useClientContentItems(clientId);

  const [panelItem, setPanelItem] = useState<ClientContentItem | null>(null);

  const pending   = items.filter(i => i.status === "aguardando_aprovacao");
  const approved  = items.filter(i => i.status === "aprovado");
  const published = items.filter(i => i.status === "publicado");

  async function handleDecision(
    itemId:   string,
    decision: ClientApprovalDecision,
    notes:    string,
  ) {
    await approve({ itemId, decision, notes, accessToken });
    setPanelItem(null);
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="font-display text-2xl font-black text-white tracking-tight">
          Gestão de Conteúdo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhe, aprove e visualize o calendário editorial da sua marca.
        </p>
      </div>

      {/* ── Cards de sumário ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Send className="h-5 w-5 text-violet-400" />}
          label="Aguardando aprovação"
          value={pending.length}
          highlight={pending.length > 0}
          onClick={() => navigate(`/${slug}/conteudo/aprovacoes`)}
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5 text-blue-400" />}
          label="Em produção"
          value={items.filter(i => i.status === "producao").length}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          label="Aprovados"
          value={approved.length}
        />
        <SummaryCard
          icon={<Megaphone className="h-5 w-5 text-green-400" />}
          label="Publicados"
          value={published.length}
        />
      </div>

      {/* ── Itens pendentes (destaque) ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : pending.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
              Aguardando sua aprovação ({pending.length})
            </h2>
            {pending.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-violet-400 hover:text-violet-300 h-7"
                onClick={() => navigate(`/${slug}/conteudo/aprovacoes`)}
              >
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pending.slice(0, 3).map(item => (
              <ClientContentCard
                key={item.id}
                item={item}
                onClick={setPanelItem}
                onApprove={setPanelItem}
                onRequestChange={setPanelItem}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1E293B] bg-[#0F172A]/50 p-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-medium">Nenhum conteúdo aguardando aprovação</p>
          <p className="text-xs text-slate-500 mt-1">Você está em dia!</p>
        </div>
      )}

      {/* ── Tabs: todos os itens + calendário ── */}
      <Tabs defaultValue="todos">
        <TabsList className="bg-[#1E293B] border-[#334155]">
          <TabsTrigger value="todos"     className="text-xs data-[state=active]:bg-[#0F172A]">Todos os itens</TabsTrigger>
          <TabsTrigger value="calendario" className="text-xs data-[state=active]:bg-[#0F172A]">Calendário</TabsTrigger>
        </TabsList>

        <TabsContent value="todos" className="mt-4">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-10">Nenhum conteúdo disponível ainda.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(item => (
                <ClientContentCard
                  key={item.id}
                  item={item}
                  onClick={setPanelItem}
                  onApprove={item.status === "aguardando_aprovacao" ? setPanelItem : undefined}
                  onRequestChange={item.status === "aguardando_aprovacao" ? setPanelItem : undefined}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendario" className="mt-4">
          <ClientContentCalendar
            clientId={clientId}
            organizationId={organizationId}
            onItemClick={itemId => {
              const found = items.find(i => i.id === itemId);
              if (found) setPanelItem(found);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* ── Painel de aprovação ── */}
      <ClientApprovalPanel
        item={panelItem}
        open={!!panelItem}
        onClose={() => setPanelItem(null)}
        onDecision={handleDecision}
      />
    </div>
  );
}

// ── SummaryCard helper ────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, highlight = false, onClick,
}: {
  icon:       React.ReactNode;
  label:      string;
  value:      number;
  highlight?: boolean;
  onClick?:   () => void;
}) {
  return (
    <Card
      className={`border cursor-default transition-colors ${
        highlight
          ? "border-violet-500/40 bg-violet-900/10 hover:bg-violet-900/20"
          : "border-[#1E293B] bg-[#0F172A] hover:bg-[#1E293B]/50"
      } ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          {icon}
          {highlight && value > 0 && (
            <Badge className="bg-violet-600 text-white text-[10px] h-4 px-1.5">{value}</Badge>
          )}
        </div>
        <p className="text-2xl font-black text-white">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
      </CardContent>
    </Card>
  );
}
