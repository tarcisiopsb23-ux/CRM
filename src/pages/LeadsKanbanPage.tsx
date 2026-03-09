import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { KanbanBoard, LeadDetailsModal } from "@/components/kanban";
import { NovoLeadDialog } from "@/components/kanban/NovoLeadDialog";
import { useLeadsKanban, type CreateLeadInput } from "@/hooks/useLeadsKanban";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Loader2, Upload } from "lucide-react";
import { parseLeadsFromExcel } from "@/lib/parseLeadsExcel";
import type { Lead, EtapaKanban } from "@/types/database";

export function LeadsKanbanPage() {
  const organizationId = useOrganization();
  const { leads, loading, error, updateEtapaKanban, createLead, importLeadsBatch } =
    useLeadsKanban(organizationId);
  const { data: profiles = [] } = useProfiles(organizationId);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [novoLeadOpen, setNovoLeadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(
    null
  );

  const handleDetalhes = (lead: Lead) => {
    setSelectedLead(lead);
    setModalOpen(true);
  };

  const handleEtapaChange = async (leadId: string, etapa: EtapaKanban) => {
    await updateEtapaKanban(leadId, etapa);
  };

  const handleCreateLead = async (form: CreateLeadInput) => {
    try {
      await createLead(form);
    } catch (err) {
      // Error handled and displayed in NovoLeadDialog component
      throw err;
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setImportResult({ created: 0, errors: ["Arquivo deve ser .xlsx ou .xls"] });
      setImportOpen(true);
      return;
    }
    setImportOpen(true);
    setImporting(true);
    setImportResult(null);
    try {
      const items = await parseLeadsFromExcel(file);
      if (items.length === 0) {
        setImportResult({ created: 0, errors: ["Nenhum lead válido encontrado (empresa obrigatória)."] });
        setImporting(false);
        return;
      }
      const profileByName = (name: string) => {
        const n = name.trim().toLowerCase();
        const p = profiles.find(
          (x) => x.full_name?.toLowerCase() === n || x.full_name?.toLowerCase().includes(n)
        );
        return p?.id ?? null;
      };
      const result = await importLeadsBatch(items, profileByName);
      setImportResult(result);
    } catch (err) {
      setImportResult({
        created: 0,
        errors: [err instanceof Error ? err.message : "Erro ao processar arquivo"],
      });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Carregando leads...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-destructive">Erro ao carregar: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Kanban de Leads</h1>
          <p className="text-sm text-muted-foreground">
            Arraste os cards entre as colunas para atualizar a etapa
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <label className="cursor-pointer flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importar Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportExcel}
              />
            </label>
          </Button>
          <Button onClick={() => setNovoLeadOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Lead
          </Button>
        </div>
      </div>
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

      <NovoLeadDialog
        open={novoLeadOpen}
        onOpenChange={setNovoLeadOpen}
        onSubmit={handleCreateLead}
        profiles={profiles}
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar Leads via Excel</DialogTitle>
          </DialogHeader>
          {importing ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Processando arquivo...
            </div>
          ) : importResult ? (
            <div className="space-y-4">
              <p className="text-sm">
                <strong>{importResult.created}</strong> lead(s) importado(s) com sucesso.
              </p>
              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-destructive mb-2">
                    {importResult.errors.length} erro(s):
                  </p>
                  <ul className="text-sm text-muted-foreground max-h-40 overflow-y-auto space-y-1">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={() => setImportOpen(false)}>Fechar</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
