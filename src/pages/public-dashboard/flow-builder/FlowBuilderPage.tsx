// ── FlowBuilderPage.tsx — editor visual de flows ──────────────────────────────
// Wrapper: carrega o flow pelo :id, gerencia nodes/edges, auto-save (debounce 2s)
// e ativação. Renderiza Toolbar + Canvas + PropertiesPanel dentro de ReactFlowProvider.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import {
  ReactFlowProvider, addEdge,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react";

import { useClientAuth } from "@/hooks/useClientAuth";
import {
  useFlowDetail, useFlowList, useUpsertFlow, useSetFlowStatus,
} from "@/hooks/useChatbotFlows";
import { CredentialsErrorState } from "../components/CredentialsErrorState";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { FlowToolbar } from "./FlowToolbar";
import { FlowCanvas } from "./FlowCanvas";
import { FlowPropertiesPanel } from "./FlowPropertiesPanel";
import type {
  ChannelType, FlowDefinition, FlowStatus, NodeData, NodeType,
} from "./flowTypes";

export function FlowBuilderPage() {
  const { id: flowId } = useParams<{ id: string }>();
  const { auth, slug } = useClientAuth();
  const clientId = auth?.id ?? "";
  const orgId = auth?.organization_id ?? "";
  const navigate = useNavigate();

  const { flow, loading } = useFlowDetail(flowId, clientId);
  const { flows, refetch: refetchFlows } = useFlowList(clientId);
  const upsertFlow = useUpsertFlow();
  const setFlowStatus = useSetFlowStatus();

  // Estado local React Flow
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<Edge>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [status, setStatus] = useState<FlowStatus>("draft");
  const [scope, setScope] = useState<"general" | "channel">("general");
  const [channelType, setChannelType] = useState<ChannelType | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateConflict, setActivateConflict] = useState<string | null>(null);

  const interactedRef = useRef(false);
  const markInteracted = useCallback(() => { interactedRef.current = true; }, []);

  // ── Inicializar a partir do flow carregado ──────────────────────────────────
  useEffect(() => {
    if (flow && !initialized) {
      const def = (flow.definition ?? { nodes: [], edges: [] }) as FlowDefinition;
      setNodes(
        def.nodes.map((n): Node<NodeData> => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
      );
      setEdges(
        def.edges.map((e): Edge => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
        })),
      );
      setName(flow.name);
      setDescription(flow.description ?? null);
      setStatus(flow.status);
      setScope(flow.scope);
      setChannelType(flow.channel_type as ChannelType | null);
      setInitialized(true);
    }
  }, [flow, initialized, setNodes, setEdges]);

  // ── Constrói a definition a partir do estado atual ──────────────────────────
  const buildDefinition = useCallback((): FlowDefinition => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeType,
      position: n.position,
      data: n.data as NodeData,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
    })),
  }), [nodes, edges]);

  // ── Salvar ──────────────────────────────────────────────────────────────────
  const doSave = useCallback(async () => {
    if (!flowId || !clientId || !orgId) return;
    setSaving(true);
    setSaved(false);
    try {
      await upsertFlow({
        id: flowId,
        organization_id: orgId,
        client_id: clientId,
        name,
        description: description ?? undefined,
        scope,
        channel_type: channelType,
        definition: buildDefinition(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      toast.error("Erro ao salvar: " + ((e as Error)?.message ?? "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }, [flowId, clientId, orgId, name, description, scope, channelType, buildDefinition, upsertFlow]);

  // ── Auto-save (debounce 2s) — só após o usuário interagir ───────────────────
  useEffect(() => {
    if (!initialized) return;
    const t = setTimeout(() => {
      if (!interactedRef.current) return;
      void doSave();
    }, 2000);
    return () => clearTimeout(t);
  }, [nodes, edges, name, description, initialized, doSave]);

  // ── Handlers do canvas (marcam interação para auto-save) ─────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    markInteracted();
    onNodesChangeRaw(changes);
  }, [onNodesChangeRaw, markInteracted]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    markInteracted();
    onEdgesChangeRaw(changes);
  }, [onEdgesChangeRaw, markInteracted]);

  const onConnect = useCallback((connection: Connection) => {
    markInteracted();
    setEdges((eds) => addEdge(connection, eds));
  }, [setEdges, markInteracted]);

  function handleNameChange(v: string) {
    markInteracted();
    setName(v);
  }

  // ── Atualizar dados do nó selecionado (via painel) ───────────────────────────
  const updateNodeData = useCallback((patch: Partial<NodeData>) => {
    if (!selectedNodeId) return;
    markInteracted();
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  }, [selectedNodeId, setNodes, markInteracted]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // ── Ativar flow (com confirmação se houver conflito) ────────────────────────
  function requestActivate() {
    if (!flowId) return;
    const conflict = flows.find(
      (f) =>
        f.id !== flowId &&
        f.status === "active" &&
        f.scope === scope &&
        (scope === "general" || f.channel_type === channelType),
    );
    if (conflict) {
      setActivateConflict(conflict.name);
    } else {
      void doActivate();
    }
  }

  async function doActivate() {
    if (!flowId || !clientId) return;
    setActivating(true);
    try {
      await setFlowStatus(flowId, clientId, "active");
      setStatus("active");
      toast.success("Flow ativado!");
      await refetchFlows();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "";
      // Conflito de ativação concorrente: unique constraint do Banco A (migration 156)
      if (msg.includes("uq_cf_active") || msg.includes("unique") || msg.includes("duplicate")) {
        toast.warning("Outro flow foi ativado por outra sessão — recarregando.");
        await refetchFlows();
      } else {
        toast.error("Erro ao ativar: " + (msg || "erro desconhecido"));
      }
    } finally {
      setActivating(false);
      setActivateConflict(null);
    }
  }

  // ── Guards de render ─────────────────────────────────────────────────────────
  if (!auth) return <CredentialsErrorState />;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flow && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-[60vh] text-center">
        <p className="text-sm font-semibold">Flow não encontrado</p>
        <p className="text-sm text-muted-foreground">O flow solicitado não existe ou você não tem acesso.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(`/${slug}/chatbot/fluxos`)}>
          <ArrowLeft className="h-4 w-4" /> Voltar para fluxos
        </Button>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      {/* Break-out do padding do <main> para editor full-bleed sob o header (h-16 = 4rem) */}
      <div className="-mx-4 -my-6 md:-mx-8 md:-my-8 flex h-[calc(100vh-4rem)] flex-col">
        <FlowToolbar
          name={name}
          onNameChange={handleNameChange}
          status={status}
          saving={saving}
          saved={saved}
          onManualSave={() => void doSave()}
          onActivate={requestActivate}
          activating={activating}
          onBack={() => navigate(`/${slug}/chatbot/fluxos`)}
        />

        <div className="flex min-h-0 flex-1">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            setNodes={setNodes}
            onNodeSelect={setSelectedNodeId}
            onInteract={markInteracted}
          />

          <div className="w-72 shrink-0 border-l border-border bg-card">
            <FlowPropertiesPanel
              node={selectedNode}
              onUpdate={updateNodeData}
              availableFlows={flows.filter((f) => f.id !== flowId)}
            />
          </div>
        </div>
      </div>

      {/* Confirmação de ativação com conflito */}
      <AlertDialog open={!!activateConflict} onOpenChange={(v) => { if (!v) setActivateConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar este flow?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p>
                  Isso vai arquivar o flow <span className="font-medium text-foreground">{activateConflict}</span>.
                  Continuar?
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Só pode haver um flow ativo por escopo/canal.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doActivate()} className="bg-emerald-600 hover:bg-emerald-600/90">
              Ativar e arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ReactFlowProvider>
  );
}
