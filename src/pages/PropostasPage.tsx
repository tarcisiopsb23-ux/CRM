// src/pages/PropostasPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Copy, Check, FileText, TrendingUp, Send, Eye, DollarSign } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useProposals } from "@/hooks/useProposals";
import { useAuth } from "@/contexts/AuthContext";
import type { ProposalStatus, ProposalFilters } from "@/types/proposals";
import { ProposalToContractButton } from "@/components/contracts/ProposalToContractButton";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yy", { locale: ptBR }) : "—";

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

export default function PropostasPage() {
  const navigate = useNavigate();
  const { organizationId } = useAuth();
  const [filters, setFilters] = useState<ProposalFilters>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { proposals, summary, isLoading } = useProposals(
    organizationId ?? undefined,
    filters
  );

  const baseUrl =
    (import.meta.env as Record<string, string>).VITE_PROPOSAL_BASE_URL ??
    window.location.origin;

  const handleCopyLink = (
    e: React.MouseEvent,
    slug: string,
    id: string
  ) => {
    e.stopPropagation();
    const link = `${baseUrl}/proposta/${slug}`;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopiedId(id);
        toast.success("Link copiado!");
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(() => toast.error("Não foi possível copiar o link."));
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Propostas</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie todas as propostas comerciais
          </p>
        </div>
        <Button onClick={() => navigate("/comercial/propostas/nova")}>
          <Plus className="h-4 w-4 mr-2" /> Nova Proposta
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> Total
            </p>
            <p className="text-2xl font-bold mt-1">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Send className="h-3 w-3" /> Enviadas
            </p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{summary.sent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="h-3 w-3" /> Aprovadas
            </p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">
              {summary.approved}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Taxa
            </p>
            <p className="text-2xl font-bold mt-1">
              {summary.approvalRate !== null
                ? `${summary.approvalRate.toFixed(1)}%`
                : "N/A"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Valor Aprovado
            </p>
            <p className="text-xl font-bold mt-1 text-emerald-600">
              {fmtCurrency(summary.totalApprovedValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select
          value={filters.status ?? "all"}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              status: v === "all" ? undefined : (v as ProposalStatus),
            }))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {(Object.keys(STATUS_LABELS) as ProposalStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-40"
          value={filters.date_from ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              date_from: e.target.value || undefined,
            }))
          }
          placeholder="De"
        />
        <Input
          type="date"
          className="w-40"
          value={filters.date_to ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              date_to: e.target.value || undefined,
            }))
          }
          placeholder="Até"
        />
        {(filters.status || filters.date_from || filters.date_to) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
            Limpar
          </Button>
        )}
      </div>

      {/* Table / Empty State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Carregando...
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <FileText className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-center">
            Nenhuma proposta encontrada.
            <br />
            Crie sua primeira proposta para começar.
          </p>
          <Button onClick={() => navigate("/comercial/propostas/nova")}>
            <Plus className="h-4 w-4 mr-2" /> Nova Proposta
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-center">Views</TableHead>
                <TableHead className="text-center">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() =>
                    navigate(`/comercial/propostas/${p.id}/detalhes`)
                  }
                >
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {p.campaign_origin ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmtCurrency(p.plan_value)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(p.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(p.last_accessed_at)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="flex items-center justify-center gap-1 text-sm">
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.total_views}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Copiar link"
                        onClick={(e) => handleCopyLink(e, p.public_slug, p.id)}
                      >
                        {copiedId === p.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {p.status === "aprovada" && p.client_id && (
                        <ProposalToContractButton
                          proposalId={p.id}
                          clientId={p.client_id}
                          clientName={p.title}
                          size="sm"
                          variant="outline"
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
