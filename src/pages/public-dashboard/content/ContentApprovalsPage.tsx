/**
 * ContentApprovalsPage — página de aprovações do portal do cliente.
 * Lista todos os itens aguardando aprovação ou com histórico de decisão.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock } from "lucide-react";
import { useClientAuth } from "@/hooks/useClientAuth";
import {
  useClientContentItems,
  type ClientApprovalDecision,
  type ClientContentItem,
} from "@/hooks/useClientContent";
import { ClientContentCard }   from "@/components/content/ClientContentCard";
import { ClientApprovalPanel } from "@/components/content/ClientApprovalPanel";

export function ContentApprovalsPage() {
  const { auth } = useClientAuth();
  const clientId    = auth?.id       ?? "";
  const accessToken = auth?.session?.access_token ?? "";

  const { items, loading, approve } = useClientContentItems(clientId);
  const [panelItem, setPanelItem] = useState<ClientContentItem | null>(null);

  const pending  = items.filter(i => i.status === "aguardando_aprovacao");
  const decided  = items.filter(i =>
    ["aprovado", "reprovado"].includes(i.status) ||
    i.approval_status === "alteracao_solicitada",
  );

  async function handleDecision(
    itemId:   string,
    decision: ClientApprovalDecision,
    notes:    string,
  ) {
    await approve({ itemId, decision, notes, accessToken });
    setPanelItem(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-black text-white tracking-tight">Aprovações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revise e aprove os conteúdos enviados pela agência.
        </p>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList className="bg-[#1E293B] border-[#334155]">
          <TabsTrigger value="pendentes" className="text-xs data-[state=active]:bg-[#0F172A]">
            Pendentes
            {pending.length > 0 && (
              <Badge className="ml-1.5 bg-violet-600 text-white text-[10px] h-4 px-1.5">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historico" className="text-xs data-[state=active]:bg-[#0F172A]">
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Pendentes */}
        <TabsContent value="pendentes" className="mt-4">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
            </div>
          ) : pending.length === 0 ? (
            <div className="rounded-xl border border-[#1E293B] bg-[#0F172A]/50 p-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">Tudo em dia!</p>
              <p className="text-xs text-slate-500 mt-1">Nenhum conteúdo aguardando sua aprovação.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pending.map(item => (
                <ClientContentCard
                  key={item.id}
                  item={item}
                  onClick={setPanelItem}
                  onApprove={setPanelItem}
                  onRequestChange={setPanelItem}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Histórico */}
        <TabsContent value="historico" className="mt-4">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          ) : decided.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-10">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Nenhuma aprovação registrada ainda.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {decided.map(item => (
                <ClientContentCard
                  key={item.id}
                  item={item}
                  onClick={setPanelItem}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClientApprovalPanel
        item={panelItem}
        open={!!panelItem}
        onClose={() => setPanelItem(null)}
        onDecision={handleDecision}
      />
    </div>
  );
}
