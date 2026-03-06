import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KanbanBoard, LeadDetailsModal } from "@/components/kanban";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import type { Lead, EtapaKanban } from "@/types/database";

export function LeadsKanbanPage() {
  const { profile, signOut } = useAuth();
  const organizationId = useOrganization();
  const navigate = useNavigate();
  const { leads, loading, error, updateEtapaKanban } = useLeadsKanban(organizationId);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleDetalhes = (lead: Lead) => {
    setSelectedLead(lead);
    setModalOpen(true);
  };

  const handleEtapaChange = async (leadId: string, etapa: EtapaKanban) => {
    await updateEtapaKanban(leadId, etapa);
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Carregando leads...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-red-500">Erro ao carregar: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-light min-h-screen">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-dark">Kanban de Leads</h1>
          <p className="text-gray-500 mt-1">
            Arraste os cards entre as colunas para atualizar a etapa
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <a href="/">Dashboard</a>
          </Button>
          {profile && (
            <span className="text-sm text-gray-600">
              {profile.full_name} <span className="text-gray-400">({profile.role})</span>
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>
      <KanbanBoard
        leads={leads}
        onDetalhes={handleDetalhes}
        onEtapaChange={handleEtapaChange}
      />
      <LeadDetailsModal
        lead={selectedLead}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
