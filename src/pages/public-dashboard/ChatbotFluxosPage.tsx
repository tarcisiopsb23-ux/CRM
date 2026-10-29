/**
 * ChatbotFluxosPage — Chatbot → Fluxos
 *
 * Listagem funcional de chatbot_flows (Banco A) com criação e ativação.
 * CRUD via RPCs da migration 158 (useChatbotFlows).
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  GitBranch, Plus, Pencil, Power, RotateCcw, Loader2, Globe, Radio,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useClientAuth } from "@/hooks/useClientAuth";
import {
  useFlowList, useUpsertFlow, useSetFlowStatus,
} from "@/hooks/useChatbotFlows";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import {
  CHANNEL_LABELS, type ChannelType, type ChatbotFlow, type FlowStatus,
} from "./flow-builder/flowTypes";

// ─── Helpers de UI ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FlowStatus }) {
  const map: Record<FlowStatus, { label: string; cls: string }> = {
    draft:    { label: "Rascunho", cls: "border-transparent bg-secondary text-secondary-foreground" },
    active:   { label: "Ativo",    cls: "border-transparent bg-emerald-500/15 text-emerald-400" },
    archived: { label: "Arquivado", cls: "border-transparent bg-destructive/15 text-destructive" },
  };
  const s = map[status];
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
}

function ScopeTag({ flow }: { flow: ChatbotFlow }) {
  if (flow.scope === "general") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Globe className="h-3 w-3" /> Geral (todos os canais)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Radio className="h-3 w-3" /> {CHANNEL_LABELS[flow.channel_type as ChannelType] ?? flow.channel_type}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

// ─── Dialog: Novo Flow ───────────────────────────────────────────────────────

function NewFlowDialog({
  open, onOpenChange, creating, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creating: boolean;
  onCreate: (data: { name: string; description: string; scope: "general" | "channel"; channelType: ChannelType | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"general" | "channel">("general");
  const [channelType, setChannelType] = useState<ChannelType>("whatsapp");

  function reset() {
    setName("");
    setDescription("");
    setScope("general");
    setChannelType("whatsapp");
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Informe o nome do flow.");
      return;
    }
    await onCreate({
      name: name.trim(),
      description: description.trim(),
      scope,
      channelType: scope === "channel" ? channelType : null,
    });
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!creating) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Flow</DialogTitle>
          <DialogDescription>Crie um novo flow conversacional para os seus canais.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Boas-vindas WhatsApp"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Flow de boas-vindas para novos contatos"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Escopo</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "general" | "channel")}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Geral (todos os canais)</SelectItem>
                  <SelectItem value="channel">Canal específico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "channel" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Canal</Label>
                <Select value={channelType} onValueChange={(v) => setChannelType(v as ChannelType)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram_dm">Instagram DM</SelectItem>
                    <SelectItem value="instagram_comment">Comentário IG</SelectItem>
                    <SelectItem value="facebook_dm">Facebook DM</SelectItem>
                    <SelectItem value="facebook_comment">Comentário FB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar e editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card de flow ─────────────────────────────────────────────────────────────

interface FlowCardProps {
  flow: ChatbotFlow;
  slug: string;
  onActivate: (flow: ChatbotFlow) => void;
  onDeactivate: (flow: ChatbotFlow) => void;
  onReactivate: (flow: ChatbotFlow) => void;
  statusLoadingId: string | null;
}

function FlowCard({ flow, slug, onActivate, onDeactivate, onReactivate, statusLoadingId }: FlowCardProps) {
  const navigate = useNavigate();
  const busy = statusLoadingId === flow.id;

  function editFlow() {
    navigate(`/${slug}/chatbot/flows/${flow.id}`);
  }

  return (
    <Card className="card-surface">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">{flow.name}</h3>
              <StatusBadge status={flow.status} />
            </div>
            {flow.description ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{flow.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">Sem descrição</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              <ScopeTag flow={flow} />
              <span className="text-xs text-muted-foreground/70">
                Atualizado em {formatDate(flow.updated_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={editFlow} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>

          {flow.status === "draft" && (
            <Button
              size="sm"
              onClick={() => onActivate(flow)}
              disabled={busy}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-600/90"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              Ativar
            </Button>
          )}

          {flow.status === "active" && (
            <Button size="sm" variant="secondary" onClick={() => onDeactivate(flow)} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              Desativar
            </Button>
          )}

          {flow.status === "archived" && (
            <Button size="sm" variant="outline" onClick={() => onReactivate(flow)} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Reativar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function ChatbotFluxosPage() {
  const { auth, slug } = useClientAuth();
  const clientId = auth?.id ?? "";
  const orgId = auth?.organization_id ?? "";

  const { flows, loading, refetch } = useFlowList(clientId);
  const upsertFlow = useUpsertFlow();
  const setFlowStatus = useSetFlowStatus();
  const navigate = useNavigate();

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);

  // confirmação de ativação quando há outro flow ativo no mesmo escopo/canal
  const [activateTarget, setActivateTarget] = useState<ChatbotFlow | null>(null);
  const [conflictName, setConflictName] = useState<string | null>(null);

  const sortedFlows = useMemo(() => {
    // active primeiro, depois draft, depois archived; dentro de cada um por updated_at desc
    const order: Record<FlowStatus, number> = { active: 0, draft: 1, archived: 2 };
    return [...flows].sort((a, b) => {
      const o = order[a.status] - order[b.status];
      if (o !== 0) return o;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [flows]);

  /** Encontra um flow ativo concorrente (mesmo escopo/canal), diferente do atual. */
  function findActiveConflict(flow: ChatbotFlow): ChatbotFlow | undefined {
    return flows.find(
      (f) =>
        f.id !== flow.id &&
        f.status === "active" &&
        f.scope === flow.scope &&
        (flow.scope === "general" || f.channel_type === flow.channel_type),
    );
  }

  // ── Criar flow ─────────────────────────────────────────────────────────────
  async function handleCreate(data: {
    name: string; description: string; scope: "general" | "channel"; channelType: ChannelType | null;
  }) {
    if (!clientId || !orgId) {
      toast.error("Usuário não identificado.");
      return;
    }
    setCreating(true);
    try {
      const newId = await upsertFlow({
        id: null,
        organization_id: orgId,
        client_id: clientId,
        name: data.name,
        description: data.description || null,
        scope: data.scope,
        channel_type: data.channelType,
      });
      if (!newId) throw new Error("Não foi possível criar o flow.");
      toast.success("Flow criado!");
      setNewDialogOpen(false);
      await refetch();
      navigate(`/${slug}/chatbot/flows/${newId}`);
    } catch (e: unknown) {
      toast.error("Erro ao criar flow: " + ((e as Error)?.message ?? "erro desconhecido"));
    } finally {
      setCreating(false);
    }
  }

  // ── Ativar flow (com confirmação se houver conflito) ────────────────────────
  function requestActivate(flow: ChatbotFlow) {
    const conflict = findActiveConflict(flow);
    if (conflict) {
      setActivateTarget(flow);
      setConflictName(conflict.name);
    } else {
      void doSetStatus(flow, "active");
    }
  }

  async function doSetStatus(flow: ChatbotFlow, status: FlowStatus) {
    setStatusLoadingId(flow.id);
    try {
      await setFlowStatus(flow.id, clientId, status);
      toast.success(
        status === "active" ? "Flow ativado!" : status === "archived" ? "Flow desativado." : "Flow reativado.",
      );
      await refetch();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "";
      // Conflito de ativação concorrente: unique constraint do Banco A (migration 156)
      if (status === "active" && (msg.includes("uq_cf_active") || msg.includes("unique") || msg.includes("duplicate"))) {
        toast.warning("Outro flow foi ativado por outra sessão — recarregando.");
        await refetch();
      } else {
        toast.error("Erro ao alterar status: " + (msg || "erro desconhecido"));
      }
    } finally {
      setStatusLoadingId(null);
    }
  }

  function confirmActivate() {
    if (!activateTarget) return;
    const target = activateTarget;
    setActivateTarget(null);
    setConflictName(null);
    void doSetStatus(target, "active");
  }

  if (!auth) return <CredentialsErrorState />;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Flows Personalizados"
        description="Configure flows conversacionais determinísticos para seus canais."
        action={
          <Button onClick={() => setNewDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Flow
          </Button>
        }
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Lista */}
      {!loading && sortedFlows.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sortedFlows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              slug={slug}
              statusLoadingId={statusLoadingId}
              onActivate={requestActivate}
              onDeactivate={(f) => doSetStatus(f, "archived")}
              onReactivate={(f) => requestActivate(f)}
            />
          ))}
        </div>
      )}

      {/* Estado vazio */}
      {!loading && sortedFlows.length === 0 && (
        <Card className="card-surface border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <GitBranch className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Nenhum flow criado.</p>
              <p className="text-sm text-muted-foreground">
                Clique em <span className="font-medium text-foreground">Novo Flow</span> para começar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog Novo Flow */}
      <NewFlowDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        creating={creating}
        onCreate={handleCreate}
      />

      {/* Confirmação de ativação com conflito */}
      <AlertDialog open={!!activateTarget} onOpenChange={(v) => { if (!v) { setActivateTarget(null); setConflictName(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar este flow?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p>
                  Isso vai arquivar o flow <span className="font-medium text-foreground">{conflictName}</span>.
                  Continuar?
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Só pode haver um flow ativo por escopo/canal. O flow atualmente ativo será arquivado automaticamente.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmActivate}
              className="bg-emerald-600 hover:bg-emerald-600/90"
            >
              Ativar e arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
