import { useState } from "react";
import { format, parseISO, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, Plus, Search, AlertTriangle, Pencil,
  PauseCircle, XCircle, PlayCircle, MoreHorizontal, Trash2, RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useC8Tenants, type C8Tenant } from "@/hooks/useC8Tenants";
import { useC8TenantActions } from "@/hooks/useC8TenantActions";
import { supabase } from "@/lib/supabase";
import { C8TenantForm } from "./C8TenantForm";
import { C8TenantDetail } from "./C8TenantDetail";

interface C8TenantListProps {
  organizationId: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const STATUS_BADGE: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  bloqueado: "bg-red-100 text-red-700",
  suspenso: "bg-yellow-100 text-yellow-700",
  cancelado: "bg-slate-100 text-slate-600",
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  bloqueado: "Bloqueado",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};

export function C8TenantList({
  organizationId,
  canCreate,
  canEdit,
  canDelete,
}: C8TenantListProps) {
  const { data: tenants, isLoading } = useC8Tenants(organizationId);
  const actions = useC8TenantActions(organizationId);
  const { pinProps, requirePin } = usePinConfirm();

  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<C8Tenant | null>(null);
  const [detailTenant, setDetailTenant] = useState<C8Tenant | null>(null);

  // Quick-action dialogs
  const [suspendTarget, setSuspendTarget] = useState<C8Tenant | null>(null);
  const [isSuspending, setIsSuspending] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<C8Tenant | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const [blockTarget, setBlockTarget] = useState<C8Tenant | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [isBlocking, setIsBlocking] = useState(false);

  // Delete tenant state
  const [deleteTarget, setDeleteTarget] = useState<C8Tenant | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingTenant, setIsDeletingTenant] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("c8-sync-tenants", {
        body: {},
      });
      if (error) throw error;
      toast.success(`Sync concluído: ${data.synced} sincronizado(s)${data.failed > 0 ? ` · ${data.failed} erro(s)` : ""}`);
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao sincronizar.");
    } finally {
      setIsSyncing(false);
    }
  };

  const today = startOfDay(new Date());
  const overdueThreshold = subDays(today, 5);

  const overdueTenants = (tenants ?? []).filter((t) => {
    if (t.active_users_count === 0) return false;
    if (!t.contract_end) return false;
    const nextDue = parseISO(t.contract_end);
    return nextDue < overdueThreshold;
  });

  const filtered = (tenants ?? []).filter((t) => {
    if (statusFilter !== "todos" && t.subscription_status !== statusFilter) return false;
    if (search.trim() && !t.client_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const handleOpenCreate = () => {
    setEditingTenant(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (tenant: C8Tenant) => {
    setDetailTenant(null);
    setEditingTenant(tenant);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingTenant(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando clientes...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overdue section */}
      {overdueTenants.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-4 w-4" />
              Inadimplentes ({overdueTenants.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {overdueTenants.map((t) => (
                <button
                  key={t.client_id}
                  className="text-xs bg-yellow-100 border border-yellow-300 text-yellow-800 rounded px-2 py-1 hover:bg-yellow-200 transition-colors"
                  onClick={() => setDetailTenant(t)}
                >
                  {t.client_name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="bloqueado">Bloqueado</SelectItem>
            <SelectItem value="suspenso">Suspenso</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        {canCreate && (
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" /> Novo Cliente C8 Control
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={handleSyncAll} disabled={isSyncing} title="Sincronizar todos os contratos com o C8 Control">
          {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
          Sincronizar C8 Control
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum cliente encontrado.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usuários</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor Mensal</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow
                  key={t.client_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetailTenant(t)}
                >
                  <TableCell className="font-medium">{t.client_name}</TableCell>
                  <TableCell>{t.plan_name}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[t.subscription_status] ?? "bg-muted text-muted-foreground"}>
                      {STATUS_LABELS[t.subscription_status] ?? t.subscription_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{t.active_users_count}</span>
                      <span className="text-muted-foreground text-xs">ativos</span>
                      {t.total_users_count > t.active_users_count && (
                        <span className="text-[10px] text-muted-foreground">({t.total_users_count} cadastrados)</span>
                      )}
                      <span className="text-muted-foreground text-xs">/ {t.max_users}</span>
                    </div>
                  </TableCell>
                  <TableCell>{fmtDate(t.contract_end)}</TableCell>
                  <TableCell>{fmtCurrency(t.plan_value)}</TableCell>
                  <TableCell className="text-right">
                    {(canEdit || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(t);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                            </DropdownMenuItem>
                          )}
                          {canEdit && t.subscription_status === "ativo" && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSuspendTarget(t); }}>
                              <PauseCircle className="h-3.5 w-3.5 mr-2 text-yellow-600" />
                              Suspender
                            </DropdownMenuItem>
                          )}
                          {canEdit && t.subscription_status !== "ativo" && (
                            <DropdownMenuItem
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await actions.reactivateTenant.mutateAsync({ clientId: t.client_id, organizationId });
                                  toast.success("Cliente reativado.");
                                } catch {
                                  toast.error("Erro ao reativar cliente.");
                                }
                              }}
                            >
                              <PlayCircle className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                              Reativar
                            </DropdownMenuItem>
                          )}
                          {canDelete && t.subscription_status !== "cancelado" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700"
                                onClick={(e) => { e.stopPropagation(); setCancelTarget(t); }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-2" />
                                Cancelar Contrato
                              </DropdownMenuItem>
                            </>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-700 focus:text-red-800 font-medium"
                                onClick={(e) => { e.stopPropagation(); setDeletePassword(""); setDeleteTarget(t); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Excluir do C8 Control
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit form dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) { setFormOpen(false); setEditingTenant(null); } }}>
        <DialogContent className="w-1/2 max-w-[50vw] max-h-[90vh] min-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTenant ? "Editar Cliente" : "Novo Cliente C8 Control"}
            </DialogTitle>
          </DialogHeader>
          <C8TenantForm
            organizationId={organizationId}
            editingTenant={editingTenant}
            onSuccess={handleFormSuccess}
            onCancel={() => { setFormOpen(false); setEditingTenant(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      {detailTenant && (
        <C8TenantDetail
          tenant={detailTenant}
          organizationId={organizationId}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setDetailTenant(null)}
          onEdit={() => handleOpenEdit(detailTenant)}
        />
      )}

      {/* Quick suspend dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={(open) => { if (!open) setSuspendTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspender Cliente</DialogTitle>
            <DialogDescription>
              Confirma a suspensão do acesso para {suspendTarget?.client_name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={isSuspending}
              onClick={() => {
                if (!suspendTarget) return;
                requirePin(
                  "Suspender cliente",
                  `Suspender acesso de ${suspendTarget.client_name}? Digite seu PIN para confirmar.`,
                  async () => {
                    setIsSuspending(true);
                    try {
                      await actions.suspendTenant.mutateAsync({ clientId: suspendTarget!.client_id, organizationId });
                      toast.success("Cliente suspenso.");
                      setSuspendTarget(null);
                    } finally { setIsSuspending(false); }
                  }
                );
              }}
            >
              {isSuspending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Pausa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick block dialog */}
      <Dialog open={!!blockTarget} onOpenChange={(open) => { if (!open) { setBlockTarget(null); setBlockReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Cliente</DialogTitle>
            <DialogDescription>
              Informe o motivo do bloqueio de {blockTarget?.client_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Motivo *</Label>
            <Textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBlockTarget(null); setBlockReason(""); }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!blockReason.trim() || isBlocking}
              onClick={() => {
                if (!blockTarget) return;
                requirePin(
                  "Bloquear cliente",
                  `Bloquear ${blockTarget.client_name}? Digite seu PIN para confirmar.`,
                  async () => {
                    setIsBlocking(true);
                    try {
                      await actions.blockTenant.mutateAsync({ clientId: blockTarget!.client_id, reason: blockReason, organizationId });
                      toast.success("Cliente bloqueado.");
                      setBlockTarget(null);
                      setBlockReason("");
                    } finally { setIsBlocking(false); }
                  }
                );
              }}
            >
              {isBlocking && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Bloqueio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Contrato</DialogTitle>
            <DialogDescription>
              Esta ação cancelará o contrato de {cancelTarget?.client_name}. Não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {(cancelTarget?.active_users_count ?? 0) > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {cancelTarget?.active_users_count} usuário(s) ativo(s) perderão acesso.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={isCancelling}
              onClick={() => {
                if (!cancelTarget) return;
                requirePin(
                  "Cancelar contrato C8",
                  `Cancelar contrato de ${cancelTarget.client_name}? Esta ação não pode ser desfeita.`,
                  async () => {
                    setIsCancelling(true);
                    try {
                      await actions.cancelTenant.mutateAsync({ clientId: cancelTarget!.client_id, organizationId });
                      toast.success("Contrato cancelado.");
                      setCancelTarget(null);
                    } finally { setIsCancelling(false); }
                  }
                );
              }}
            >
              {isCancelling && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete tenant dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir do C8 Control</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget?.client_name}</strong> do C8 Control e cancela o contrato CRM. O cliente não será excluído. Esta ação é irreversível.
            </DialogDescription>
          </DialogHeader>
          {(deleteTarget?.active_users_count ?? 0) > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {deleteTarget?.active_users_count} usuário(s) ativo(s) perderão acesso imediatamente.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={isDeletingTenant}
              onClick={() => {
                if (!deleteTarget) return;
                requirePin(
                  "Excluir do C8 Control",
                  `Remover ${deleteTarget.client_name} do C8 Control? Esta ação é irreversível.`,
                  async () => {
                    setIsDeletingTenant(true);
                    try {
                      await actions.deleteTenant.mutateAsync({ clientId: deleteTarget!.client_id, organizationId });
                      toast.success(`${deleteTarget!.client_name} removido do C8 Control.`);
                      setDeleteTarget(null);
                    } finally { setIsDeletingTenant(false); }
                  }
                );
              }}
            >
              {isDeletingTenant && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <Trash2 className="h-4 w-4 mr-1" />
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PinAuthDialog {...pinProps} />
    </div>
  );
}

