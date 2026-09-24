import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useCiclos, useCloseCiclo } from "@/hooks/useAvaliacao360";
import { useAuth } from "@/contexts/AuthContext";
import { CiclosList } from "@/components/avaliacao360/CiclosList";
import { CicloForm } from "@/components/avaliacao360/CicloForm";
import { CicloDetail } from "@/components/avaliacao360/CicloDetail";
import type { CicloAvaliacao, CicloTipo } from "@/types/avaliacao360";

const TIPO_TABS: { value: CicloTipo; label: string }[] = [
  { value: '360',        label: '360° Semestral' },
  { value: 'checkin',    label: 'Check-in' },
  { value: 'probatorio', label: 'Probatório' },
];

export default function Avaliacao360Page() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id ?? "";
  const { data: ciclos = [], isLoading } = useCiclos(organizationId || undefined);
  const closeCiclo = useCloseCiclo();

  const [formOpen, setFormOpen] = useState(false);
  const [selectedCiclo, setSelectedCiclo] = useState<CicloAvaliacao | null>(null);
  const [activeTab, setActiveTab] = useState<CicloTipo>('360');

  const canManage = profile?.role === "admin" || profile?.role === "owner";

  const handleClose = async (ciclo: CicloAvaliacao) => {
    if (!confirm(`Encerrar o ciclo "${ciclo.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await closeCiclo.mutateAsync({ cicloId: ciclo.id, organizationId });
      toast.success("Ciclo encerrado e resultados consolidados");
      if (selectedCiclo?.id === ciclo.id) setSelectedCiclo(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao encerrar ciclo");
    }
  };

  if (!organizationId) return null;

  const ciclosByTipo = (tipo: CicloTipo) => ciclos.filter((c) => c.tipo === tipo);
  const ativosByTipo = (tipo: CicloTipo) => ciclosByTipo(tipo).filter((c) => c.status === 'ativo').length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Avaliações</h1>
          <p className="text-sm text-muted-foreground">
            360° semestral, check-ins contínuos e avaliações de período probatório.
          </p>
        </div>
        {canManage && !selectedCiclo && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Ciclo
          </Button>
        )}
      </div>

      {selectedCiclo ? (
        <CicloDetail
          ciclo={selectedCiclo}
          onBack={() => setSelectedCiclo(null)}
          currentProfileId={profile!.id}
          canManage={canManage}
        />
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CicloTipo)}>
          <TabsList>
            {TIPO_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1.5">
                {tab.label}
                {ativosByTipo(tab.value) > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                    {ativosByTipo(tab.value)}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {TIPO_TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              <CiclosList
                ciclos={ciclosByTipo(tab.value)}
                isLoading={isLoading}
                onSelect={setSelectedCiclo}
                onClose={handleClose}
                canManage={canManage}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {canManage && (
        <CicloForm
          open={formOpen}
          onOpenChange={setFormOpen}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}
