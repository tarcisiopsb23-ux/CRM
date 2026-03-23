import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Lead } from "@/types/database";
import { ETAPAS_KANBAN } from "@/types/database";
import { formatBRL, formatPhoneBR } from "@/lib/formatters";
import { useTeams } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

interface LeadDetailsModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (lead: Lead) => void;
  onDelete?: (leadId: string) => void;
  onLeadUpdated?: () => void;
}

export function LeadDetailsModal({
  lead,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onLeadUpdated,
}: LeadDetailsModalProps) {
  const orgId = useOrganization();
  const { profile } = useAuth();
  const { data: teams = [] } = useTeams(orgId);
  const { data: profiles = [] } = useProfiles(orgId);

  const isAdminOrOwner = profile?.role === "admin" || profile?.role === "owner";
  const isManager = profile?.role === "manager";
  const isMember = profile?.role === "member";

  const canEditTeam = isAdminOrOwner || isManager;
  const canEditSdr = isAdminOrOwner || isManager;
  const canEditCloser = isAdminOrOwner || isManager || isMember;

  const isQualificados = lead?.etapa_kanban === "qualificados";

  const [teamId, setTeamId] = useState<string>("");
  const [sdrId, setSdrId] = useState<string>("");
  const [closerId, setCloserId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setTeamId(lead.team_id ?? "");
      setSdrId(lead.sdr_id ?? "");
      setCloserId(lead.closer_id ?? "");
    }
  }, [lead]);

  if (!lead) return null;

  const etapaLabel =
    ETAPAS_KANBAN.find((e) => e.id === lead.etapa_kanban)?.label ??
    lead.etapa_kanban;

  const activeProfiles = profiles.filter((p) => p.is_active);

  const handleSaveAssignments = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({
          team_id: teamId || null,
          sdr_id: sdrId || null,
          closer_id: closerId || null,
        })
        .eq("id", lead.id);
      if (error) throw error;
      toast.success("Lead atualizado");
      onLeadUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const hasAssignmentChanges =
    (teamId || null) !== (lead.team_id ?? null) ||
    (sdrId || null) !== (lead.sdr_id ?? null) ||
    (closerId || null) !== (lead.closer_id ?? null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Detalhes do Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <span className="font-medium text-gray-500">Empresa</span>
            <p className="text-gray-dark">{lead.company ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Nome</span>
            <p className="text-gray-dark">{lead.name}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Email</span>
            <p className="text-gray-dark">{lead.email ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Telefone</span>
            <p className="text-gray-dark">{lead.phone ? formatPhoneBR(lead.phone) : "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Nicho</span>
            <p className="text-gray-dark">{lead.nicho ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Prioridade</span>
            <p className="text-gray-dark">
              {PRIORIDADE_LABEL[lead.prioridade ?? "media"] ?? lead.prioridade}
            </p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Etapa</span>
            <p className="text-gray-dark">{etapaLabel}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Origem</span>
            <p className="text-gray-dark">{lead.source ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Valor estimado</span>
            <p className="text-gray-dark">
              {lead.value != null ? formatBRL(Number(lead.value)) : "—"}
            </p>
          </div>
          {lead.notes && (
            <div>
              <span className="font-medium text-gray-500">Observações</span>
              <p className="text-gray-dark whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {/* Atribuição de equipe/SDR/Closer — visível em qualificados */}
          {isQualificados && (canEditTeam || canEditCloser) && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atribuição</p>

              {canEditTeam && (
                <div className="space-y-1">
                  <Label className="text-xs">Equipe</Label>
                  <Select value={teamId} onValueChange={setTeamId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar equipe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {canEditSdr && (
                <div className="space-y-1">
                  <Label className="text-xs">SDR</Label>
                  {!teamId ? (
                    <p className="text-xs text-muted-foreground">Selecione uma equipe primeiro</p>
                  ) : (
                    <Select value={sdrId} onValueChange={setSdrId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar SDR" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhum</SelectItem>
                        {activeProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {canEditCloser && (
                <div className="space-y-1">
                  <Label className="text-xs">Closer</Label>
                  {!teamId ? (
                    <p className="text-xs text-muted-foreground">Selecione uma equipe primeiro</p>
                  ) : (
                    <Select value={closerId} onValueChange={setCloserId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar Closer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhum</SelectItem>
                        {activeProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {hasAssignmentChanges && (
                <Button size="sm" onClick={handleSaveAssignments} disabled={saving} className="w-full">
                  {saving ? "Salvando..." : "Salvar Atribuição"}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          {onEdit && (
            <Button variant="outline" onClick={() => onEdit(lead)}>
              Editar
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => onDelete(lead.id)}
            >
              Excluir
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
