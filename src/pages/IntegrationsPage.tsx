import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, Share2, Facebook, Chrome, Settings2 } from "lucide-react";
import { useState } from "react";
import { AdIntegrationDialog } from "@/components/integrations/AdIntegrationDialog";
import type { ClientIntegration } from "@/types/hub_performance";

export default function IntegrationsPage() {
  const organizationId = useOrganization();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: string, name: string } | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<'meta' | 'google' | null>(null);
  const [existingInteg, setExistingInteg] = useState<ClientIntegration | undefined>(undefined);

  const { data: clientsWithIntegrations, isLoading } = useQuery({
    queryKey: ["all_clients_integrations", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, company")
        .eq("organization_id", organizationId);
      
      if (clientsError) throw clientsError;

      const { data: integrations, error: integError } = await supabase
        .from("client_integrations")
        .select("*")
        .eq("organization_id", organizationId);
      
      if (integError) throw integError;

      return clients.map(c => ({
        ...c,
        integrations: (integrations || []).filter(i => i.client_id === c.id) as ClientIntegration[]
      }));
    },
    enabled: !!organizationId,
  });

  const handleConnect = (client: { id: string, name: string }, platform: 'meta' | 'google', integration?: ClientIntegration) => {
    setSelectedClient(client);
    setSelectedPlatform(platform);
    setExistingInteg(integration);
    setModalOpen(true);
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando integrações...</div>;

  return (
    <div className="p-8 space-y-8 bg-slate-50/50 min-h-screen">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Gestão de Integrações</h1>
          <p className="text-slate-500 mt-1">Conecte e gerencie as contas de anúncios de seus clientes</p>
        </div>
        <Button className="gap-2" variant="outline" asChild>
          <a href="/settings?tab=integrations">
            <Settings2 className="h-4 w-4" />
            Configurações Globais
          </a>
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clientsWithIntegrations?.map(client => {
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
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                      <Facebook className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Meta Ads</p>
                      <p className="text-[10px] text-slate-500 font-medium">Facebook & Instagram</p>
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

                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white shadow-sm">
                      <Chrome className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Google Ads</p>
                      <p className="text-[10px] text-slate-500 font-medium">Search, Display & YouTube</p>
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
