// src/pages/PropostaDetalhesPage.tsx
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Copy, Check, FileText, Edit, Trash2, Archive, ExternalLink, ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useProposal } from "@/hooks/useProposal";
import { useProposals } from "@/hooks/useProposals";
import { useOrganization } from "@/hooks/useOrganization";
import { ProposalToContractButton } from "@/components/contracts/ProposalToContractButton";
import { PropostaAnalyticsPanel } from "@/components/propostas/PropostaAnalyticsPanel";
import type { ProposalStatus } from "@/types/proposals";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

const STATUS_LABELS: Record<ProposalStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  visualizada: "Visualizada",
  aprovada: "Aprovada",
  recusada: "Recusada",
  expirada: "Expirada",
};

const STATUS_COLORS: Record<ProposalStatus, string> = {
  rascunho: "bg-slate-100 text-slate-600",
  enviada: "bg-blue-100 text-blue-700",
  visualizada: "bg-amber-100 text-amber-700",
  aprovada: "bg-emerald-100 text-emerald-700",
  recusada: "bg-red-100 text-red-700",
  expirada: "bg-slate-100 text-slate-500",
};

export default function PropostaDetalhesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orgId = useOrganization();
  const { detail, isLoading } = useProposal(id);
  const proposal = detail?.proposal;
  const { duplicateProposal, archiveProposal, deleteProposal, sendProposal } = useProposals(orgId);

  const baseUrl =
    (import.meta.env as Record<string, string>).VITE_PROPOSAL_BASE_URL ?? window.location.origin;

  const handleCopyLink = async () => {
    if (!proposal) return;
    const link = `${baseUrl}/proposta/${proposal.public_slug}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const handleDuplicate = async () => {
    if (!proposal) return;
    try {
      const newId = await duplicateProposal.mutateAsync(proposal);
      toast.success("Proposta duplicada!");
      navigate(`/comercial/propostas/${newId}`);
    } catch {
      toast.error("Erro ao duplicar proposta.");
    }
  };

  const handleArchive = async () => {
    if (!proposal) return;
    try {
      await archiveProposal.mutateAsync({ id: proposal.id });
      toast.success("Proposta arquivada!");
      navigate("/comercial/propostas");
    } catch {
      toast.error("Erro ao arquivar proposta.");
    }
  };

  const handleDelete = async () => {
    if (!proposal) return;
    if (!confirm("Tem certeza que deseja excluir esta proposta?")) return;
    try {
      await deleteProposal.mutateAsync({ id: proposal.id });
      toast.success("Proposta excluída!");
      navigate("/comercial/propostas");
    } catch {
      toast.error("Erro ao excluir proposta.");
    }
  };

  const handleSend = async () => {
    if (!proposal) return;
    try {
      await sendProposal.mutateAsync({ id: proposal.id, channel: "link" });
      toast.success("Proposta enviada!");
    } catch {
      toast.error("Erro ao enviar proposta.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Carregando proposta...</p>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p>Proposta não encontrada.</p>
        <Button onClick={() => navigate("/comercial/propostas")}>
          Voltar para listagem
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/comercial/propostas")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{proposal.title}</h1>
            <p className="text-sm text-muted-foreground">
              Criada em {fmtDate(proposal.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_COLORS[proposal.status]}>
            {STATUS_LABELS[proposal.status]}
          </Badge>
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate(`/comercial/propostas/${proposal.id}`)}>
          <Edit className="h-4 w-4 mr-2" />
          Editar
        </Button>
        {proposal.status === "rascunho" && (
          <Button onClick={handleSend}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Enviar
          </Button>
        )}
        <Button variant="outline" onClick={handleCopyLink}>
          <Copy className="h-4 w-4 mr-2" />
          Copiar Link
        </Button>
        <Button variant="outline" onClick={handleDuplicate}>
          <FileText className="h-4 w-4 mr-2" />
          Duplicar
        </Button>
        {proposal.status !== "aprovada" && (
          <Button variant="outline" onClick={handleArchive}>
            <Archive className="h-4 w-4 mr-2" />
            Arquivar
          </Button>
        )}
        {proposal.status === "aprovada" && proposal.client_id && (
          <ProposalToContractButton
            proposalId={proposal.id}
            clientId={proposal.client_id}
            clientName={proposal.hero_title ?? proposal.title}
            size="default"
            variant="default"
          />
        )}
        <Button variant="destructive" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir
        </Button>
      </div>

      {/* Informações principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Valor</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtCurrency(proposal.plan_value)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Visualizações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{proposal.total_views}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Último Acesso</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">{fmtDate(proposal.last_accessed_at)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Panel */}
      <PropostaAnalyticsPanel proposalId={proposal.id} />
    </div>
  );
}
