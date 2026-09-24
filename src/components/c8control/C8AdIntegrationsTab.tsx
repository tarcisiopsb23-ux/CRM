import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, RefreshCcw, AlertCircle, CheckCircle2, Clock, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdIntegrationDialog } from "@/components/integrations/AdIntegrationDialog";
import { useClientIntegrations } from "@/hooks/useHubPerformance";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function SyncStatusBadge({ status, lastSyncAt, records, error }: {
  status?: string | null; lastSyncAt?: string | null;
  records?: number | null; error?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!status || status === "pending")
    return <Badge className="bg-slate-100 text-slate-500 text-xs">Nunca sincronizado</Badge>;
  if (status === "syncing")
    return <Badge className="bg-blue-100 text-blue-700 text-xs flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Sincronizando...</Badge>;
  if (status === "error")
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1 w-fit">
          <AlertCircle className="h-3 w-3" />Erro na sync
        </Badge>
        {error && (
          <p onClick={() => setExpanded(v => !v)}
            className={`text-[10px] text-red-500 cursor-pointer max-w-[260px] ${expanded ? "whitespace-normal break-words" : "truncate"}`}>
            {error}
          </p>
        )}
      </div>
    );
  if ((status === "success" || status === "no_data") && lastSyncAt)
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className={`text-xs flex items-center gap-1 w-fit ${status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {status === "success" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: ptBR })}
        </Badge>
        {records != null && records > 0 && <span className="text-[10px] text-muted-foreground">{records} registros</span>}
        {status === "no_data" && <span className="text-[10px] text-muted-foreground">Sem dados no período</span>}
      </div>
    );
  return null;
}

type ClientRow = { id: string; name: string; company: string | null };

interface C8AdIntegrationsTabProps {
  organizationId: string;
  /** Se fornecido, filtra direto para este cliente sem exibir o seletor. */
  initialClientId?: string;
}

export function C8AdIntegrationsTab({ organizationId, initialClientId }: C8AdIntegrationsTabProps) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [platform, setPlatform] = useState<"meta" | "google" | null>(null);

  const { data: integrations = [], isLoading, remove, triggerSync } =
    useClientIntegrations(organizationId, selectedClientId ?? undefined);

  // Carrega clientes com C8 Control habilitado
  useEffect(() => {
    if (initialClientId) return; // seletor não necessário
    const load = async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, company")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("company");
      setClients((data ?? []) as ClientRow[]);
    };
    load();
  }, [organizationId, initialClientId]);

  // Reset stale syncing
  useEffect(() => {
    const stale = (integrations as any[]).filter(i => {
      if (i.sync_status !== "syncing") return false;
      if (!i.updated_at) return true;
      return new Date(i.updated_at).getTime() < Date.now() - 2 * 60 * 1000;
    });
    stale.forEach(async (i: any) => {
      await supabase.from("client_integrations")
        .update({ sync_status: "error", sync_error: "Sync interrompido — tente novamente." })
        .eq("id", i.id);
    });
  }, [integrations]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remover integração com ${name}?`)) return;
    try { await remove.mutateAsync(id); toast.success(`Integração com ${name} removida.`); }
    catch { toast.error("Erro ao remover integração."); }
  };

  const handleOpenConnect = (p: "meta" | "google") => { setPlatform(p); setModalOpen(true); };

  const filteredClients = clients.filter(c =>
    `${c.company ?? ""} ${c.name}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const metaIntegration   = (integrations as any[]).find(i => i.platform === "meta");
  const googleIntegration = (integrations as any[]).find(i => i.platform === "google");

  return (
    <div className="space-y-6">

      {/* Seletor de cliente — oculto quando initialClientId é fornecido */}
      {!initialClientId && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
            {filteredClients.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedClientId(c.id)}
                className={`text-left p-3 rounded-lg border-2 text-sm transition-all ${
                  selectedClientId === c.id
                    ? "border-primary bg-primary/5 font-semibold"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <p className="font-medium truncate">{c.company || c.name}</p>
                {c.company && <p className="text-xs text-muted-foreground truncate">{c.name}</p>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Painel de integrações do cliente selecionado */}
      {!selectedClientId ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Selecione um cliente para gerenciar as integrações de anúncios.
        </p>
      ) : (
        <div className="space-y-4">
          {!initialClientId && selectedClient && (
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-700">
                {selectedClient.company || selectedClient.name}
              </p>
              <Badge className="bg-slate-100 text-slate-600 text-xs">
                {(integrations as any[]).length} integraç{(integrations as any[]).length === 1 ? "ão" : "ões"}
              </Badge>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Carregando...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">

              {/* Meta Ads */}
              <div className="p-4 border rounded-xl flex items-center justify-between bg-white shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shrink-0">M</div>
                  <div>
                    <p className="font-bold text-slate-800">Meta Ads (Facebook/Instagram)</p>
                    <p className="text-sm text-slate-500">{metaIntegration ? `ID: ${metaIntegration.account_id}` : "Não conectado"}</p>
                    {metaIntegration && (
                      <div className="mt-1">
                        <SyncStatusBadge status={metaIntegration.sync_status} lastSyncAt={metaIntegration.last_sync_at} records={metaIntegration.last_sync_records} error={metaIntegration.sync_error} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {metaIntegration && (
                    <>
                      <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 gap-1"
                        disabled={triggerSync.isPending || metaIntegration.sync_status === "syncing"}
                        onClick={() => triggerSync.mutate(metaIntegration.id, {
                          onSuccess: () => toast.success("Sincronização iniciada!"),
                          onError: e => toast.error(`Erro: ${(e as Error).message}`),
                        })}>
                        {triggerSync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                        Sync
                      </Button>
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500"
                        onClick={() => handleDelete(metaIntegration.id, "Meta Ads")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button variant={metaIntegration ? "outline" : "default"} size="sm"
                    onClick={() => handleOpenConnect("meta")}>
                    {metaIntegration ? "Editar" : "Conectar Conta"}
                  </Button>
                </div>
              </div>

              {/* Google Ads */}
              <div className="p-4 border rounded-xl flex items-center justify-between bg-white shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold text-lg shrink-0">G</div>
                  <div>
                    <p className="font-bold text-slate-800">Google Ads</p>
                    <p className="text-sm text-slate-500">{googleIntegration ? `ID: ${googleIntegration.account_id}` : "Não conectado"}</p>
                    {googleIntegration && (
                      <div className="mt-1">
                        <SyncStatusBadge status={googleIntegration.sync_status} lastSyncAt={googleIntegration.last_sync_at} records={googleIntegration.last_sync_records} error={googleIntegration.sync_error} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {googleIntegration && (
                    <>
                      <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700 gap-1"
                        disabled={triggerSync.isPending || googleIntegration.sync_status === "syncing"}
                        onClick={() => triggerSync.mutate(googleIntegration.id, {
                          onSuccess: () => toast.success("Sincronização iniciada!"),
                          onError: e => toast.error(`Erro: ${(e as Error).message}`),
                        })}>
                        {triggerSync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                        Sync
                      </Button>
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500"
                        onClick={() => handleDelete(googleIntegration.id, "Google Ads")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button variant={googleIntegration ? "outline" : "default"} size="sm"
                    onClick={() => handleOpenConnect("google")}>
                    {googleIntegration ? "Editar" : "Conectar Conta"}
                  </Button>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      <AdIntegrationDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        organizationId={organizationId}
        clientId={selectedClientId ?? ""}
        platform={platform}
        existingIntegration={(integrations as any[]).find((i: any) => i.platform === platform)}
      />
    </div>
  );
}
