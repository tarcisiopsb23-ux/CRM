import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, Share2, Facebook, Chrome, Settings2, RefreshCcw, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdIntegrationDialog } from "@/components/integrations/AdIntegrationDialog";
import { useAllClientIntegrations } from "@/hooks/useHubPerformance";
import type { ClientIntegration } from "@/types/hub_performance";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function SyncBadge({ status, lastSyncAt }: { status?: string | null; lastSyncAt?: string | null }) {
  if (!status || status === 'pending') return <Badge className="bg-slate-100 text-slate-500 text-[10px]"><Clock className="h-2.5 w-2.5 mr-1" />Pendente</Badge>;
  if (status === 'syncing') return <Badge className="bg-blue-100 text-blue-700 text-[10px]"><Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />Sincronizando</Badge>;
  if (status === 'error') return <Badge className="bg-red-100 text-red-700 text-[10px]"><AlertCircle className="h-2.5 w-2.5 mr-1" />Erro</Badge>;
  if (status === 'success' && lastSyncAt) return (
    <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
      <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
      {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: ptBR })}
    </Badge>
  );
  return null;
}

export default function IntegrationsPage() {
  const organizationId = useOrganization();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: string, name: string } | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<'meta' | 'google' | null>(null);
  const [existingInteg, setExistingInteg] = useState<ClientIntegration | undefined>(undefined);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const { data: allIntegrations = [], isLoading } = useAllClientIntegrations(organizationId);

  // Group by client
  const clientsWithIntegrations = useQuery({
    queryKey: ["all_clients_integrations_grouped", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, company")
        .eq("organization_id", organizationId)
        .order("name");
      return (clients || []).map(c => ({
        ...c,
        integrations: allIntegrations.filter(i => i.client_id === c.id),
      }));
    },
    enabled: !!organizationId && allIntegrations.length >= 0,
  });

  const handleConnect = (client: { id: string, name: string }, platform: 'meta' | 'google', integration?: ClientIntegration) => {
    setSelectedClient(client);
    setSelectedPlatform(platform);
    setExistingInteg(integration);
    setModalOpen(true);
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    try {
      const { data: n8nRow } = await supabase
        .from("organization_integrations")
        .select("config")
        .eq("organization_id", organizationId)
        .eq("integration_type", "n8n")
        .maybeSingle();
      const webhookUrl =
        (n8nRow?.config as Record<string, string> | null)?.adsWebhookUrl
        ?? import.meta.env.VITE_N8N_WEBHOOK_SYNC_ADS;
      if (!webhookUrl) {
        toast.error("Webhook de sync de Ads não configurado. Acesse Configurações → n8n → Ads.");
        return;
      }
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      toast.success("Sincronização de todos os clientes iniciada!");
    } catch {
      toast.error("Erro ao iniciar sincronização.");
    } finally {
      setIsSyncingAll(false);
    }
  };

  const connectedCount = allIntegrations.length;
  const syncedCount = allIntegrations.filter(i => i.sync_status === 'success').length;
  const errorCount = allIntegrations.filter(i => i.sync_status === 'error').length;

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando integrações...</div>;

  return (
    <div className="p-8 space-y-8 bg-slate-50/50 min-h-screen">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Gestão de Integrações</h1>
          <p className="text-slate-500 mt-1">Conecte e gerencie as contas de anúncios de seus clientes</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-sm text-slate-500 mr-2">
            <span><span className="font-bold text-slate-800">{connectedCount}</span> conectadas</span>
            <span><span className="font-bold text-emerald-600">{syncedCount}</span> sincronizadas</span>
            {errorCount > 0 && <span><span className="font-bold text-red-600">{errorCount}</span> com erro</span>}
          </div>
          <Button className="gap-2" onClick={handleSyncAll} disabled={isSyncingAll} variant="default">
            {isSyncingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Sincronizar Todos
          </Button>
          <Button className="gap-2" variant="outline" asChild>
            <a href="/settings?tab=integrations">
              <Settings2 className="h-4 w-4" />
              Configurações
            </a>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(clientsWithIntegrations.data ?? []).map(client => {
          const metaInteg = client.integrations.find(i => i.platform === 'meta');
          const googleInteg = client.integrations.find(i => i.platform === 'google');

          return (
            <Card key={client.id} className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden hover:ring-primary/20 transition-all">
              <CardHeader className="pb-3 border-b border-slate-100 bg-white">
                <CardTitle className="text-lg font-bold text-slate-800 truncate" title={client.company || client.name}>
                  {client.company || client.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 bg-white/50">
                {/* Meta Ads */}
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                      <Facebook className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Meta Ads</p>
                      {metaInteg
                        ? <SyncBadge status={metaInteg.sync_status} lastSyncAt={metaInteg.last_sync_at} />
                        : <p className="text-[10px] text-slate-400">Não conectado</p>
                      }
                    </div>
                  </div>
                  <Button
                    variant={metaInteg ? "outline" : "secondary"}
                    size="sm"
                    className="h-7 text-[10px] font-bold uppercase tracking-wider"
                    onClick={() => handleConnect({ id: client.id, name: client.company || client.name }, 'meta', metaInteg)}
                  >
                    {metaInteg ? "Configurar" : "Conectar"}
                  </Button>
                </div>

                {/* Google Ads */}
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white shadow-sm">
                      <Chrome className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Google Ads</p>
                      {googleInteg
                        ? <SyncBadge status={googleInteg.sync_status} lastSyncAt={googleInteg.last_sync_at} />
                        : <p className="text-[10px] text-slate-400">Não conectado</p>
                      }
                    </div>
                  </div>
                  <Button
                    variant={googleInteg ? "outline" : "secondary"}
                    size="sm"
                    className="h-7 text-[10px] font-bold uppercase tracking-wider"
                    onClick={() => handleConnect({ id: client.id, name: client.company || client.name }, 'google', googleInteg)}
                  >
                    {googleInteg ? "Configurar" : "Conectar"}
                  </Button>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <Button variant="ghost" className="w-full text-[10px] font-bold text-slate-400 h-8 hover:bg-primary/5 hover:text-primary transition-colors uppercase tracking-widest" asChild>
                    <a href={`/clients/${client.id}`}>Acessar Perfil do Cliente</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedClient && (
        <AdIntegrationDialog
          open={modalOpen}
          onOpenChange={setModalOpen}
          organizationId={organizationId || ""}
          clientId={selectedClient.id}
          platform={selectedPlatform}
          existingIntegration={existingInteg}
        />
      )}
    </div>
  );
}
