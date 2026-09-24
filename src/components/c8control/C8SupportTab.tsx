import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, RefreshCcw, Search, Copy, Check, Eye, EyeOff,
  ShieldCheck, ExternalLink, Trash2, CheckCircle2, XCircle, HelpCircle, User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";

interface SupportPassword {
  id: string;
  client_id: string;
  support_email: string;
  password: string;
  c8_user_id: string | null;
  updated_at: string;
  clients: { name: string; company: string | null; dashboard_slug: string | null } | null;
}

interface CheckResult {
  exists: boolean | null;  // null = não foi possível verificar (secrets não configurados)
  last_sign_in: string | null;
  confirmed: boolean;
  c8_user_id?: string;
  reason?: string;
}

// "idle" = ainda não verificado, "checking" = em andamento
type CheckStatus = "idle" | "checking" | CheckResult;

interface C8SupportTabProps {
  organizationId: string;
  canEdit: boolean;
}

export function C8SupportTab({ organizationId, canEdit }: C8SupportTabProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<SupportPassword | null>(null);
  const [selectedCheckStatus, setSelectedCheckStatus] = useState<CheckStatus>("idle");
  const [isSyncingSupport, setIsSyncingSupport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SupportPassword | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  // Map: client_id → CheckStatus
  const [statusMap, setStatusMap] = useState<Record<string, CheckStatus>>({});

  const { data: entries = [], isLoading, refetch } = useQuery<SupportPassword[]>({
    queryKey: ["c8_support_passwords", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("c8_support_passwords")
        .select("*, clients(name, company, dashboard_slug)")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportPassword[];
    },
    enabled: !!organizationId,
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["c8_tenants_all_for_support", organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_client_plans")
        .select("client_id, clients(name, company)")
        .eq("organization_id", organizationId)
        .neq("subscription_status", "cancelado");
      return data ?? [];
    },
    enabled: !!organizationId,
  });

  const supportedIds = new Set(entries.map(e => e.client_id));
  const tenantsWithoutSupport = allTenants.filter(
    (t: { client_id: string }) => !supportedIds.has(t.client_id)
  );

  // ── Tarefa 1: check em lote ao carregar os entries ────────────────────────
  const checkOne = useCallback(async (clientId: string): Promise<CheckResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("c8-support-user", {
        body: { action: "check", client_id: clientId },
      });
      // Se a Edge Function retornar erro HTTP (ex: 400 por secrets não configurados),
      // supabase.functions.invoke coloca em `error`. Trata silenciosamente.
      if (error) return null;
      if (data?.error) return null;
      return data as CheckResult;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (entries.length === 0) return;
    // Marca todos como "checking" e dispara em paralelo (máx 5 simultâneos)
    const ids = entries.map(e => e.client_id);
    setStatusMap(prev => {
      const next = { ...prev };
      ids.forEach(id => { if (!next[id] || next[id] === "idle") next[id] = "checking"; });
      return next;
    });

    const BATCH = 5;
    let i = 0;
    const runBatch = async () => {
      const batch = ids.slice(i, i + BATCH);
      i += BATCH;
      await Promise.allSettled(
        batch.map(async id => {
          const result = await checkOne(id);
          if (result !== null) {
            // Só atualiza se a chamada teve sucesso; null = mantém "idle" (secrets não configurados)
            setStatusMap(prev => ({ ...prev, [id]: result }));
          } else {
            setStatusMap(prev => ({ ...prev, [id]: "idle" }));
          }
        })
      );
      if (i < ids.length) runBatch();
    };
    runBatch();
  // Só re-executa quando os entries mudarem (refetch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const handleCheckOne = async (clientId: string) => {
    setStatusMap(prev => ({ ...prev, [clientId]: "checking" }));
    const result = await checkOne(clientId);
    if (result !== null) {
      setStatusMap(prev => ({ ...prev, [clientId]: result }));
      return result;
    } else {
      // Volta para idle e mostra erro — secrets não configurados ou indisponível
      setStatusMap(prev => ({ ...prev, [clientId]: "idle" }));
      toast.error("Não foi possível verificar o status. Verifique se os secrets C8_SUPABASE_URL e C8_SUPABASE_SERVICE_KEY estão configurados na Edge Function.");
      return null;
    }
  };

  const handleProvision = async (clientId: string, clientName: string) => {
    setProvisioningId(clientId);
    try {
      const { error } = await supabase.functions.invoke("c8-support-user", {
        body: { action: "provision", client_id: clientId, client_name: clientName },
      });
      if (error) throw error;
      toast.success(`Suporte de ${clientName} atualizado.`);
      qc.invalidateQueries({ queryKey: ["c8_support_passwords", organizationId] });
      qc.invalidateQueries({ queryKey: ["c8_tenants_all_for_support", organizationId] });
      // Re-verifica após provisionar
      const checkResult = await handleCheckOne(clientId);
      if (checkResult) setStatusMap(prev => ({ ...prev, [clientId]: checkResult }));
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao atualizar suporte");
    } finally {
      setProvisioningId(null);
    }
  };

  const copyPassword = (id: string, password: string) => {
    navigator.clipboard.writeText(password);
    setCopiedId(id);
    toast.success("Senha copiada!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = entries.filter(e => {
    const name = (e.clients?.company || e.clients?.name || "").toLowerCase();
    return !search.trim() || name.includes(search.trim().toLowerCase());
  });

  const handleSyncSupport = async () => {
    setIsSyncingSupport(true);
    try {
      const { data, error } = await supabase.functions.invoke("c8-support-user", {
        body: { action: "reset_all" },
      });
      if (error) throw error;
      const ok = data?.results?.filter((r: { success: boolean }) => r.success).length ?? 0;
      const fail = data?.results?.filter((r: { success: boolean }) => !r.success).length ?? 0;
      toast.success(`Suporte atualizado: ${ok} registro(s)${fail > 0 ? ` · ${fail} erro(s)` : ""}`);
      refetch();
      qc.invalidateQueries({ queryKey: ["c8_tenants_all_for_support", organizationId] });
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao atualizar usuários de suporte.");
    } finally {
      setIsSyncingSupport(false);
    }
  };

  const handleResetOne = async (entry: SupportPassword) => {
    const name = entry.clients?.company || entry.clients?.name || entry.client_id;
    setProvisioningId(entry.client_id);
    try {
      const { error } = await supabase.functions.invoke("c8-support-user", {
        body: { action: "provision", client_id: entry.client_id, client_name: name },
      });
      if (error) throw error;
      toast.success(`Suporte de ${name} atualizado.`);
      refetch();
      await handleCheckOne(entry.client_id);
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao atualizar suporte");
    } finally {
      setProvisioningId(null);
    }
  };

  const handleDeleteSupport = async (entry: SupportPassword) => {
    const name = entry.clients?.company || entry.clients?.name || entry.client_id;
    setIsDeletingId(entry.client_id);
    try {
      // Se o email está no formato antigo (< 10 chars no local-part), o usuário
      // foi criado no modelo C8 Control centralizado (não existe no Banco B).
      // Passa local_only: true para apenas limpar o registro do Maestr.ia.
      const isLegacyEmail = entry.support_email.split("@")[0].length < 10;

      const { data, error } = await supabase.functions.invoke("c8-support-user", {
        body: {
          action: "remove",
          client_id: entry.client_id,
          local_only: isLegacyEmail,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Usuário de suporte de ${name} removido.`);
      setDeleteTarget(null);
      setStatusMap(prev => { const n = { ...prev }; delete n[entry.client_id]; return n; });
      qc.invalidateQueries({ queryKey: ["c8_support_passwords", organizationId] });
      qc.invalidateQueries({ queryKey: ["c8_tenants_all_for_support", organizationId] });
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao remover usuário de suporte");
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Gerencie o acesso de suporte por tenant. O usuário de suporte não contabiliza no limite de usuários.
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={handleSyncSupport} disabled={isSyncingSupport}
            title="Atualiza dados e senhas de todos os usuários de suporte no C8 Control">
            {isSyncingSupport
              ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
              : <RefreshCcw className="h-4 w-4 mr-1" />}
            Atualizar suporte
          </Button>
        )}
      </div>

      {/* Tenants without support */}
      {tenantsWithoutSupport.length > 0 && canEdit && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-800">
              {tenantsWithoutSupport.length} cliente(s) sem senha de suporte
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {tenantsWithoutSupport.map((t) => {
                const clientData = t.clients as unknown as { name: string; company: string | null } | null;
                const name = clientData?.company || clientData?.name || t.client_id;
                return (
                  <Button key={t.client_id} size="sm" variant="outline"
                    className="border-yellow-400 text-yellow-800 hover:bg-yellow-100 text-xs"
                    disabled={provisioningId === t.client_id}
                    onClick={() => handleProvision(t.client_id, name)}>
                    {provisioningId === t.client_id
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      : <ShieldCheck className="h-3 w-3 mr-1" />}
                    {name}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Filtrar por nome do cliente..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-6">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {search ? "Nenhum cliente encontrado." : "Nenhuma senha de suporte cadastrada ainda."}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>E-mail de Suporte</TableHead>
                <TableHead>Senha</TableHead>
                {/* Tarefa 2: coluna Status C8 */}
                <TableHead>Status no C8</TableHead>
                <TableHead>Atualizado em</TableHead>
                {canEdit && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => {
                const name = entry.clients?.company || entry.clients?.name || "—";
                const isVisible = visiblePasswords.has(entry.id);
                const isCopied = copiedId === entry.id;
                const isProvisioning = provisioningId === entry.client_id;
                const checkStatus = statusMap[entry.client_id] ?? "idle";

                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <button onClick={() => { setSelectedEntry(entry); setSelectedCheckStatus(checkStatus); }}
                        className="font-medium text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
                        title="Ver detalhes do usuário de suporte">
                        {name}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{entry.support_email}</span>
                        {/* Alerta: email no formato antigo (< 10 chars no local-part) */}
                        {entry.support_email.split("@")[0].length < 10 && (
                          <Badge variant="outline"
                            className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 px-1 py-0"
                            title="Email gerado no formato antigo (< 10 chars). Clique em Atualizar para corrigir.">
                            formato antigo
                          </Badge>
                        )}
                        <button onClick={() => { navigator.clipboard.writeText(entry.support_email); toast.success("E-mail copiado!"); }}
                          className="text-muted-foreground hover:text-foreground" title="Copiar e-mail">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{isVisible ? entry.password : "••••••••"}</span>
                        <button onClick={() => toggleVisibility(entry.id)} className="text-muted-foreground hover:text-foreground"
                          title={isVisible ? "Ocultar" : "Mostrar"}>
                          {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => copyPassword(entry.id, entry.password)}
                          className="text-muted-foreground hover:text-foreground" title="Copiar senha">
                          {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </TableCell>

                    {/* Tarefa 2: badge de status */}
                    <TableCell>
                      <StatusBadge status={checkStatus} />
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(entry.updated_at).toLocaleString("pt-BR")}
                    </TableCell>

                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Botão: abrir dashboard do cliente */}
                          {entry.clients?.dashboard_slug && (
                            <Button size="sm" variant="ghost" asChild
                              title="Abrir dashboard do cliente">
                              <a
                                href={`/public/dashboard/${entry.clients.dashboard_slug}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-violet-500" />
                              </a>
                            </Button>
                          )}
                          {/* Tarefa 3: botão verificar individual */}
                          <Button size="sm" variant="ghost"
                            disabled={checkStatus === "checking"}
                            onClick={(e) => { e.stopPropagation(); handleCheckOne(entry.client_id); }}
                            title="Verificar se o usuário existe no C8 Control">
                            {checkStatus === "checking"
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <HelpCircle className="h-3.5 w-3.5 text-slate-400" />}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={isProvisioning}
                            onClick={(e) => { e.stopPropagation(); handleResetOne(entry); }}
                            title="Atualizar dados e senha de suporte">
                            {isProvisioning
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCcw className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost"
                            disabled={isDeletingId === entry.client_id}
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry); }}
                            title="Remover usuário de suporte"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50">
                            {isDeletingId === entry.client_id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog confirmar exclusão */}
      {deleteTarget && (
        <Dialog open onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" /> Remover usuário de suporte
              </DialogTitle>
              <DialogDescription>
                Esta ação irá remover o usuário{" "}
                <span className="font-mono font-semibold">{deleteTarget.support_email}</span>{" "}
                do cliente{" "}
                <span className="font-semibold">
                  {deleteTarget.clients?.company || deleteTarget.clients?.name || deleteTarget.client_id}
                </span>
                {deleteTarget.support_email.split("@")[0].length < 10 ? (
                  <> do Maestr.ia <span className="text-amber-600">(registro do modelo antigo — o usuário não será removido do C8 Control centralizado)</span>.</>
                ) : (
                  <> tanto do Banco B do cliente quanto do Maestr.ia.</>
                )}{" "}
                Não é possível desfazer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={isDeletingId === deleteTarget.client_id}
                onClick={() => handleDeleteSupport(deleteTarget)}>
                {isDeletingId === deleteTarget.client_id
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Removendo...</>
                  : "Confirmar remoção"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de detalhes */}
      {selectedEntry && (
        <SupportDetailModal
          entry={selectedEntry}
          checkStatus={selectedCheckStatus}
          onClose={() => { setSelectedEntry(null); setSelectedCheckStatus("idle"); }}
          onReset={canEdit ? () => { handleResetOne(selectedEntry); setSelectedEntry(null); } : undefined}
          onCheck={async () => {
            setSelectedCheckStatus("checking");
            const result = await handleCheckOne(selectedEntry.client_id);
            setSelectedCheckStatus(result ?? "idle");
          }}
          isResetting={provisioningId === selectedEntry.client_id}
        />
      )}
    </div>
  );
}

// ── Componente auxiliar: badge de status ──────────────────────────────────────
function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === "idle") {
    return (
      <Badge variant="outline" className="text-xs text-slate-400 border-slate-200 gap-1">
        <HelpCircle className="h-3 w-3" /> Não verificado
      </Badge>
    );
  }
  if (status === "checking") {
    return (
      <Badge variant="outline" className="text-xs text-blue-500 border-blue-200 gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Verificando...
      </Badge>
    );
  }
  // exists: null = secrets não configurados, não foi possível verificar
  if (status.exists === null) {
    return (
      <Badge variant="outline" className="text-xs text-slate-400 border-slate-200 gap-1"
        title={status.reason}>
        <HelpCircle className="h-3 w-3" /> Não verificado
      </Badge>
    );
  }
  if (status.exists) {
    return (
      <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Ativo no C8
      </Badge>
    );
  }
  return (
    <Badge className="text-xs bg-red-100 text-red-700 border-red-200 gap-1"
      title={status.reason}>
      <XCircle className="h-3 w-3" /> Não encontrado
    </Badge>
  );
}

// ── Modal de detalhes ─────────────────────────────────────────────────────────
interface SupportDetailModalProps {
  entry: SupportPassword;
  checkStatus: CheckStatus;
  onClose: () => void;
  onReset?: () => void;
  onCheck: () => Promise<void>;
  isResetting: boolean;
}

function SupportDetailModal({
  entry, checkStatus, onClose, onReset, onCheck, isResetting,
}: SupportDetailModalProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const name = entry.clients?.company || entry.clients?.name || "—";

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado!`);
  };

  const Field = ({
    label, value, mono = false, copyable = false,
  }: { label: string; value: string; mono?: boolean; copyable?: boolean }) => (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-medium break-all ${mono ? "font-mono" : ""}`}>{value}</p>
        {copyable && (
          <button onClick={() => copy(value, label)} className="text-muted-foreground hover:text-foreground shrink-0">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  // Tarefa 4: exibe last_sign_in quando disponível
  const checkResult = typeof checkStatus === "object" ? checkStatus : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-4 w-4" /> Usuário de Suporte — {name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Cliente" value={name} />
          <Separator />
          <Field label="E-mail de Suporte" value={entry.support_email} mono copyable />

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Senha</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium font-mono">
                {passwordVisible ? entry.password : "••••••••"}
              </p>
              <button onClick={() => setPasswordVisible(v => !v)} className="text-muted-foreground hover:text-foreground">
                {passwordVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => copy(entry.password, "Senha")} className="text-muted-foreground hover:text-foreground">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <Separator />

          {/* Status no C8 Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Status no C8 Control</p>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                disabled={checkStatus === "checking"}
                onClick={onCheck}
                title="Verificar agora se o usuário existe no C8 Control">
                {checkStatus === "checking"
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  : <RefreshCcw className="h-3 w-3 mr-1" />}
                Verificar
              </Button>
            </div>
            <StatusBadge status={checkStatus} />
            {checkResult && !checkResult.exists && checkResult.reason && (
              <p className="text-xs text-red-500">{checkResult.reason}</p>
            )}
          </div>

          {/* Tarefa 4: last_sign_in */}
          {checkResult?.exists && (
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Último login: </span>
                  <span className="font-medium">
                    {checkResult.last_sign_in
                      ? new Date(checkResult.last_sign_in).toLocaleString("pt-BR")
                      : "Nunca"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">E-mail confirmado: </span>
                  <span className={checkResult.confirmed ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                    {checkResult.confirmed ? "Sim" : "Não"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <Separator />
          <Field label="Tenant ID (client_id)" value={entry.client_id} mono copyable />
          {(entry.c8_user_id || checkResult?.c8_user_id) && (
            <Field label="ID no C8 Control" value={(checkResult?.c8_user_id ?? entry.c8_user_id)!} mono copyable />
          )}
          <Field label="Última atualização" value={new Date(entry.updated_at).toLocaleString("pt-BR")} />
          <Separator />
          {entry.clients?.dashboard_slug && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Dashboard do Cliente</p>
              <a
                href={`/public/dashboard/${entry.clients.dashboard_slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:underline font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {window.location.origin}/public/dashboard/{entry.clients.dashboard_slug}
              </a>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          {onReset && (
            <Button size="sm" variant="outline" onClick={onReset} disabled={isResetting}>
              {isResetting
                ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                : <RefreshCcw className="h-4 w-4 mr-1" />}
              Gerar nova senha
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto">Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
