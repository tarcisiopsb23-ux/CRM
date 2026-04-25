import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCcw, Search, Copy, Check, Eye, EyeOff, ShieldCheck, ExternalLink, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
  clients: { name: string; company: string | null } | null;
}

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
  const [isSyncingSupport, setIsSyncingSupport] = useState(false);

  // Fetch support passwords with client names
  const { data: entries = [], isLoading, refetch } = useQuery<SupportPassword[]>({
    queryKey: ["c8_support_passwords", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("c8_support_passwords")
        .select("*, clients(name, company)")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportPassword[];
    },
    enabled: !!organizationId,
  });

  // Fetch ALL active tenants and compute "without support" from the same data
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

  // Derive tenants without support from both queries (no stale closure issue)
  const supportedIds = new Set(entries.map(e => e.client_id));
  const tenantsWithoutSupport = allTenants.filter(
    (t: { client_id: string }) => !supportedIds.has(t.client_id)
  );

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

  // handleResetOne agora faz a mesma coisa que o sync — provisiona dados e gera nova senha
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
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao atualizar suporte");
    } finally {
      setProvisioningId(null);
    }
  };

  const c8Url = "https://c8control.agenciac8.com.br/login";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Gerencie o acesso de suporte por tenant. O usuário de suporte não contabiliza no limite de usuários.
          </p>
          <a
            href={c8Url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {c8Url}
          </a>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncSupport}
            disabled={isSyncingSupport}
            title="Atualiza dados e senhas de todos os usuários de suporte no C8 Control"
          >
            {isSyncingSupport
              ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
              : <RefreshCcw className="h-4 w-4 mr-1" />
            }
            Atualizar suporte
          </Button>
        )}
      </div>

      {/* Tenants without support password */}
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
                  <Button
                    key={t.client_id}
                    size="sm"
                    variant="outline"
                    className="border-yellow-400 text-yellow-800 hover:bg-yellow-100 text-xs"
                    disabled={provisioningId === t.client_id}
                    onClick={() => handleProvision(t.client_id, name)}
                  >
                    {provisioningId === t.client_id
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      : <ShieldCheck className="h-3 w-3 mr-1" />
                    }
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
        <Input
          className="pl-8"
          placeholder="Filtrar por nome do cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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

                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <button
                        onClick={() => setSelectedEntry(entry)}
                        className="font-medium text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
                        title="Ver detalhes do usuário de suporte"
                      >
                        {name}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{entry.support_email}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(entry.support_email); toast.success("E-mail copiado!"); }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Copiar e-mail"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">
                          {isVisible ? entry.password : "••••••••"}
                        </span>
                        <button
                          onClick={() => toggleVisibility(entry.id)}
                          className="text-muted-foreground hover:text-foreground"
                          title={isVisible ? "Ocultar" : "Mostrar"}
                        >
                          {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => copyPassword(entry.id, entry.password)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Copiar senha"
                        >
                          {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(entry.updated_at).toLocaleString("pt-BR")}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isProvisioning}
                          onClick={(e) => { e.stopPropagation(); handleResetOne(entry); }}
                          title="Atualizar dados e senha de suporte"
                        >
                          {isProvisioning
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCcw className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal de detalhes do usuário de suporte */}
      {selectedEntry && (
        <SupportDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onReset={canEdit ? () => { handleResetOne(selectedEntry); setSelectedEntry(null); } : undefined}
          isResetting={provisioningId === selectedEntry.client_id}
          c8Url={c8Url}
        />
      )}
    </div>
  );
}

interface SupportDetailModalProps {
  entry: SupportPassword;
  onClose: () => void;
  onReset?: () => void;
  isResetting: boolean;
  c8Url: string;
}

function SupportDetailModal({ entry, onClose, onReset, isResetting, c8Url }: SupportDetailModalProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const name = entry.clients?.company || entry.clients?.name || "—";

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado!`);
  };

  const Field = ({ label, value, mono = false, copyable = false }: { label: string; value: string; mono?: boolean; copyable?: boolean }) => (
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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Usuário de Suporte — {name}
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
          <Field label="Tenant ID (client_id)" value={entry.client_id} mono copyable />
          {entry.c8_user_id && (
            <Field label="ID do Usuário no C8 Control" value={entry.c8_user_id} mono copyable />
          )}
          <Field
            label="Última atualização"
            value={new Date(entry.updated_at).toLocaleString("pt-BR")}
          />
          <Separator />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">URL de Acesso</p>
            <a
              href={c8Url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-mono"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {c8Url}
            </a>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          {onReset && (
            <Button size="sm" variant="outline" onClick={onReset} disabled={isResetting}>
              {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
              Gerar nova senha
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto">Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
