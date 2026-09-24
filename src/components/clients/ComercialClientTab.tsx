import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, ExternalLink, Copy, Check, FileText, Edit, Trash2,
  Archive, Download, Clock, Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProposalToContractButton } from "@/components/contracts/ProposalToContractButton";
import { useProposals } from "@/hooks/useProposals";
import type { Proposal, ProposalStatus, ProposalAcceptance } from "@/types/proposals";

const sb = () => supabase as unknown as SupabaseClient;

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null | undefined) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const fmtDateTime = (d: string | null | undefined) =>
  d ? format(parseISO(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const maskCpf = (cpf: string): string => {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
  }
  // already masked or partial
  return cpf.replace(/\d{3}\.\d{3}\.\d{3}/, (m) => {
    const parts = m.split(".");
    return `${parts[0]}.***.***`;
  }) || cpf;
};

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProposalStatus, string> = {
  rascunho: "bg-slate-100 text-slate-600",
  enviada: "bg-blue-100 text-blue-700",
  visualizada: "bg-amber-100 text-amber-700",
  aprovada: "bg-emerald-100 text-emerald-700",
  recusada: "bg-red-100 text-red-700",
  expirada: "bg-slate-100 text-slate-500",
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  visualizada: "Visualizada",
  aprovada: "Aprovada",
  recusada: "Recusada",
  expirada: "Expirada",
};

const CONTRACT_STATUS_COLORS: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  suspenso: "bg-yellow-100 text-yellow-700",
  cancelado: "bg-red-100 text-red-700",
  encerrado: "bg-slate-100 text-slate-500",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContractWithPdf {
  id: string;
  title: string;
  contract_date: string | null;
  status: string | null;
  value: number;
  contract_version: number | null;
  pdf_url: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  occurred_at: string;
  proposal_id: string;
  proposal_title?: string;
  metadata: Record<string, unknown> | null;
}

interface AcceptanceWithTitle extends ProposalAcceptance {
  proposal_title?: string;
}

interface FileEntry {
  id: string;
  name: string;
  date: string;
  version: number;
  url: string;
  type: "proposal" | "contract";
}

interface Props {
  clientId: string;
  organizationId: string;
  /** Nome/razão social do cliente — usado para pré-preencher o ContractGenerator */
  clientName?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComercialClientTab({ clientId, organizationId, clientName = "" }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Proposal | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Proposal | null>(null);

  const baseUrl =
    (import.meta.env as Record<string, string>).VITE_PROPOSAL_BASE_URL ??
    window.location.origin;

  // ── Proposals ───────────────────────────────────────────────────────────────
  const { proposals, isLoading: proposalsLoading, deleteProposal, archiveProposal } =
    useProposals(organizationId);
  const clientProposals = proposals.filter((p) => p.client_id === clientId);

  // ── Contracts ───────────────────────────────────────────────────────────────
  const contractsQuery = useQuery({
    queryKey: ["contracts_comercial", organizationId, clientId],
    queryFn: async (): Promise<ContractWithPdf[]> => {
      const { data, error } = await sb()
        .from("contracts")
        .select("id, title, contract_date, status, value, contract_version, pdf_url")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("contract_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        contract_date: (r.contract_date as string | null) ?? null,
        status: (r.status as string | null) ?? null,
        value: Number(r.value ?? 0),
        contract_version: r.contract_version ? Number(r.contract_version) : null,
        pdf_url: (r.pdf_url as string | null) ?? null,
      }));
    },
    enabled: !!organizationId && !!clientId,
  });

  // ── Timeline (audit log joined with proposal titles) ────────────────────────
  const timelineQuery = useQuery({
    queryKey: ["proposal_timeline", organizationId, clientId],
    queryFn: async (): Promise<AuditEntry[]> => {
      // Fetch proposal ids for this client first
      const { data: propData } = await sb()
        .from("proposals")
        .select("id, title")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .is("deleted_at", null);

      const propMap: Record<string, string> = {};
      for (const p of (propData ?? []) as { id: string; title: string }[]) {
        propMap[p.id] = p.title;
      }
      const propIds = Object.keys(propMap);
      if (propIds.length === 0) return [];

      const { data, error } = await sb()
        .from("proposal_audit_log")
        .select("id, action, occurred_at, proposal_id, metadata")
        .eq("organization_id", organizationId)
        .in("proposal_id", propIds)
        .order("occurred_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        action: String(r.action ?? ""),
        occurred_at: String(r.occurred_at ?? ""),
        proposal_id: String(r.proposal_id ?? ""),
        proposal_title: propMap[String(r.proposal_id)] ?? "",
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      }));
    },
    enabled: !!organizationId && !!clientId,
  });

  // ── Acceptances ─────────────────────────────────────────────────────────────
  const acceptancesQuery = useQuery({
    queryKey: ["proposal_acceptances", organizationId, clientId],
    queryFn: async (): Promise<AcceptanceWithTitle[]> => {
      const { data: propData } = await sb()
        .from("proposals")
        .select("id, title")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId);

      const propMap: Record<string, string> = {};
      for (const p of (propData ?? []) as { id: string; title: string }[]) {
        propMap[p.id] = p.title;
      }
      const propIds = Object.keys(propMap);
      if (propIds.length === 0) return [];

      const { data, error } = await sb()
        .from("proposal_acceptances")
        .select("*")
        .eq("organization_id", organizationId)
        .in("proposal_id", propIds)
        .order("accepted_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        proposal_id: String(r.proposal_id ?? ""),
        organization_id: String(r.organization_id ?? ""),
        approver_name: String(r.approver_name ?? ""),
        approver_cpf: String(r.approver_cpf ?? ""),
        ip_address: String(r.ip_address ?? ""),
        user_agent: (r.user_agent as string | null) ?? null,
        accepted_at: String(r.accepted_at ?? ""),
        proposal_snapshot: (r.proposal_snapshot as Record<string, unknown>) ?? {},
        snapshot_hash: String(r.snapshot_hash ?? ""),
        proposal_title: propMap[String(r.proposal_id)] ?? "",
      }));
    },
    enabled: !!organizationId && !!clientId,
  });

  // ── Files (PDFs) ─────────────────────────────────────────────────────────────
  const filesQuery = useQuery({
    queryKey: ["comercial_files", organizationId, clientId],
    queryFn: async (): Promise<FileEntry[]> => {
      const files: FileEntry[] = [];

      // Contracts with PDF
      const { data: contracts } = await sb()
        .from("contracts")
        .select("id, title, contract_date, contract_version, pdf_url")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .not("pdf_url", "is", null);

      for (const r of (contracts ?? []) as Record<string, unknown>[]) {
        if (r.pdf_url) {
          files.push({
            id: String(r.id),
            name: `Contrato — ${r.title ?? ""}`,
            date: (r.contract_date as string) ?? "",
            version: Number(r.contract_version ?? 1),
            url: String(r.pdf_url),
            type: "contract",
          });
        }
      }

      return files.sort((a, b) => b.date.localeCompare(a.date));
    },
    enabled: !!organizationId && !!clientId,
  });

  // ── Duplicate proposal mutation ───────────────────────────────────────────────
  const duplicateMutation = useMutation({
    mutationFn: async (proposal: Proposal) => {
      // Generate a new slug
      const { generateUniqueSlug } = await import("@/lib/proposalSlug");
      const newSlug = await generateUniqueSlug(sb());

      const { id: _id, public_slug: _slug, created_at: _ca, updated_at: _ua,
        deleted_at: _da, status: _st, total_views: _tv, total_accesses: _ta,
        avg_session_secs: _as, first_accessed_at: _fa, last_accessed_at: _la,
        ...rest } = proposal;

      const { data, error } = await sb()
        .from("proposals")
        .insert({
          ...rest,
          organization_id: organizationId,
          public_slug: newSlug,
          status: "rascunho",
          title: `${proposal.title} (cópia)`,
          total_views: 0,
          total_accesses: 0,
          avg_session_secs: 0,
          first_accessed_at: null,
          last_accessed_at: null,
          deleted_at: null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Duplicate services
      const { data: services } = await sb()
        .from("proposal_services")
        .select("*")
        .eq("proposal_id", proposal.id);

      if (services && services.length > 0) {
        const newServices = (services as Record<string, unknown>[]).map(
          ({ id: _sid, proposal_id: _pid, created_at: _sca, ...s }) => ({
            ...s,
            proposal_id: (data as Record<string, unknown>).id,
            organization_id: organizationId,
          })
        );
        await sb().from("proposal_services").insert(newServices);
      }

      // Duplicate sections
      const { data: sections } = await sb()
        .from("proposal_sections")
        .select("*")
        .eq("proposal_id", proposal.id);

      if (sections && sections.length > 0) {
        const newSections = (sections as Record<string, unknown>[]).map(
          ({ id: _sid, proposal_id: _pid, created_at: _sca, updated_at: _sua, ...s }) => ({
            ...s,
            proposal_id: (data as Record<string, unknown>).id,
            organization_id: organizationId,
          })
        );
        await sb().from("proposal_sections").insert(newSections);
      }

      return (data as Record<string, unknown>).id as string;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["proposals", organizationId] });
      toast.success("Proposta duplicada!");
      navigate(`/comercial/propostas/${newId}`);
    },
    onError: () => toast.error("Erro ao duplicar proposta."),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleCopy = (slug: string, id: string) => {
    navigator.clipboard
      .writeText(`${baseUrl}/proposta/${slug}`)
      .then(() => {
        setCopiedId(id);
        toast.success("Link copiado!");
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(() => toast.error("Não foi possível copiar o link."));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProposal.mutateAsync({ id: deleteTarget.id });
      toast.success("Proposta excluída.");
    } catch {
      toast.error("Erro ao excluir proposta.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveProposal.mutateAsync({ id: archiveTarget.id });
      toast.success("Proposta arquivada.");
    } catch {
      toast.error("Erro ao arquivar proposta.");
    } finally {
      setArchiveTarget(null);
    }
  };

  const ACTION_LABELS: Record<string, string> = {
    criacao: "Proposta criada",
    edicao: "Proposta editada",
    envio: "Proposta enviada",
    aprovacao: "Proposta aprovada digitalmente",
    contrato_gerado: "Contrato gerado automaticamente",
    exclusao: "Proposta excluída",
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Comercial</h3>
        <Button
          size="sm"
          onClick={() => navigate(`/comercial/propostas/nova?client_id=${clientId}`)}
        >
          <Plus className="h-4 w-4 mr-1" /> Nova Proposta
        </Button>
      </div>

      <Tabs defaultValue="propostas">
        <TabsList>
          <TabsTrigger value="propostas">Propostas</TabsTrigger>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="aprovacoes">Aprovações</TabsTrigger>
          <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
        </TabsList>

        {/* ── Propostas ── */}
        <TabsContent value="propostas" className="mt-4">
          {proposalsLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando propostas...
            </div>
          ) : clientProposals.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-10 w-10 text-muted-foreground/30" />}
              message="Nenhuma proposta criada para este cliente ainda."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/comercial/propostas/nova?client_id=${clientId}`)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Criar proposta
                </Button>
              }
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Visualizações</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientProposals.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">
                        {p.title || "(sem título)"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}
                        >
                          {STATUS_LABELS[p.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmtCurrency(p.plan_value)}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {p.total_views ?? 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(p.last_accessed_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(p.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <ProposalActions
                            proposal={p}
                            copiedId={copiedId}
                            onEdit={() => navigate(`/comercial/propostas/${p.id}`)}
                            onView={() =>
                              window.open(`${baseUrl}/proposta/${p.public_slug}`, "_blank")
                            }
                            onCopy={() => handleCopy(p.public_slug, p.id)}
                            onDuplicate={() => duplicateMutation.mutate(p)}
                            onArchive={() => setArchiveTarget(p)}
                            onDelete={() => setDeleteTarget(p)}
                            isDuplicating={
                              duplicateMutation.isPending &&
                              duplicateMutation.variables?.id === p.id
                            }
                          />
                          {/* Botão "Gerar Contrato" — aparece somente para propostas aprovadas */}
                          {p.status === "aprovada" && (
                            <ProposalToContractButton
                              proposalId={p.id}
                              clientId={clientId}
                              clientName={clientName}
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
        </TabsContent>

        {/* ── Contratos ── */}
        <TabsContent value="contratos" className="mt-4">
          {contractsQuery.isLoading ? (
            <LoadingRow />
          ) : (contractsQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon={<FileText className="h-10 w-10 text-muted-foreground/30" />}
              message="Nenhum contrato vinculado a este cliente ainda."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Versão</TableHead>
                    <TableHead className="text-right">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(contractsQuery.data ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-sm">{c.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(c.contract_date)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                            CONTRACT_STATUS_COLORS[c.status ?? ""] ??
                            "bg-muted text-muted-foreground"
                          }`}
                        >
                          {c.status ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmtCurrency(c.value)}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        v{c.contract_version ?? 1}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.pdf_url ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <a href={c.pdf_url} target="_blank" rel="noopener noreferrer" title="Baixar PDF">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Timeline ── */}
        <TabsContent value="timeline" className="mt-4">
          {timelineQuery.isLoading ? (
            <LoadingRow />
          ) : (timelineQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Clock className="h-10 w-10 text-muted-foreground/30" />}
              message="Nenhum evento registrado para este cliente ainda."
            />
          ) : (
            <div className="space-y-1">
              {(timelineQuery.data ?? []).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-card text-sm"
                >
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    {entry.proposal_title && (
                      <p className="text-muted-foreground text-xs truncate">
                        {entry.proposal_title}
                      </p>
                    )}
                    {entry.metadata?.channel && (
                      <p className="text-muted-foreground text-xs">
                        Canal: {String(entry.metadata.channel)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {fmtDateTime(entry.occurred_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Aprovações ── */}
        <TabsContent value="aprovacoes" className="mt-4">
          {acceptancesQuery.isLoading ? (
            <LoadingRow />
          ) : (acceptancesQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Check className="h-10 w-10 text-muted-foreground/30" />}
              message="Nenhum aceite digital registrado para este cliente ainda."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proposta</TableHead>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Aprovador</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-right">Comprovante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(acceptancesQuery.data ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm font-medium max-w-[160px] truncate">
                        {a.proposal_title ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(a.accepted_at)}
                      </TableCell>
                      <TableCell className="text-sm">{a.approver_name}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {maskCpf(a.approver_cpf)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {a.ip_address}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          PDF em breve
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Arquivos ── */}
        <TabsContent value="arquivos" className="mt-4">
          {filesQuery.isLoading ? (
            <LoadingRow />
          ) : (filesQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon={<FileText className="h-10 w-10 text-muted-foreground/30" />}
              message="Nenhum arquivo disponível para este cliente ainda."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-center">Versão</TableHead>
                    <TableHead className="text-right">Download</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filesQuery.data ?? []).map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-sm font-medium">{f.name}</TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                          {f.type === "contract" ? "Contrato" : "Proposta"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(f.date)}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        v{f.version}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <a href={f.url} target="_blank" rel="noopener noreferrer" title="Baixar">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              A proposta <strong>{deleteTarget?.title}</strong> será excluída. Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Archive confirmation ── */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              A proposta <strong>{archiveTarget?.title}</strong> será marcada como expirada e
              não aparecerá no pipeline ativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Arquivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── ProposalActions sub-component ─────────────────────────────────────────────

interface ProposalActionsProps {
  proposal: Proposal;
  copiedId: string | null;
  onEdit: () => void;
  onView: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  isDuplicating: boolean;
  onGenerateContract?: () => void;
}

function ProposalActions({
  proposal, copiedId, onEdit, onView, onCopy, onDuplicate, onArchive, onDelete, isDuplicating, onGenerateContract,
}: ProposalActionsProps) {
  const { status } = proposal;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {/* rascunho: editar + excluir */}
      {status === "rascunho" && (
        <>
          <ActionBtn title="Editar" onClick={onEdit}><Edit className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Excluir" onClick={onDelete} danger><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
        </>
      )}

      {/* enviada / visualizada: visualizar + duplicar + copiar link + arquivar */}
      {(status === "enviada" || status === "visualizada") && (
        <>
          <ActionBtn title="Visualizar proposta" onClick={onView}><ExternalLink className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Duplicar" onClick={onDuplicate} loading={isDuplicating}>
            {isDuplicating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </ActionBtn>
          <ActionBtn title="Copiar link" onClick={onCopy}>
            {copiedId === proposal.id
              ? <Check className="h-3.5 w-3.5 text-emerald-600" />
              : <Copy className="h-3.5 w-3.5" />}
          </ActionBtn>
          <ActionBtn title="Arquivar" onClick={onArchive}><Archive className="h-3.5 w-3.5" /></ActionBtn>
        </>
      )}

      {/* aprovada: visualizar + duplicar + gerar contrato */}
      {status === "aprovada" && (
        <>
          <ActionBtn title="Visualizar proposta" onClick={onView}><ExternalLink className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Duplicar" onClick={onDuplicate} loading={isDuplicating}>
            {isDuplicating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </ActionBtn>
          {onGenerateContract && (
            <ActionBtn title="Gerar contrato" onClick={onGenerateContract}>
              <FileText className="h-3.5 w-3.5 text-violet-600" />
            </ActionBtn>
          )}
        </>
      )}

      {/* expirada / recusada: duplicar */}
      {(status === "expirada" || status === "recusada") && (
        <ActionBtn title="Duplicar" onClick={onDuplicate} loading={isDuplicating}>
          {isDuplicating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
        </ActionBtn>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

interface ActionBtnProps {
  title: string;
  onClick: () => void;
  danger?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}

function ActionBtn({ title, onClick, danger, loading, children }: ActionBtnProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-7 w-7 ${danger ? "hover:text-destructive hover:bg-destructive/10" : ""}`}
      title={title}
      onClick={onClick}
      disabled={loading}
    >
      {children}
    </Button>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  message: string;
  action?: React.ReactNode;
}

function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-10 gap-3">
      {icon}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
    </div>
  );
}
