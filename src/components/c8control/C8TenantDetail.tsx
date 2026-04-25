import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2,
  ShieldOff,
  ShieldCheck,
  Trash2,
  RefreshCcw,
  AlertTriangle,
  Pencil,
  Check,
  PauseCircle,
  KeyRound,
  Users,
  FileText,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useC8TenantActions } from "@/hooks/useC8TenantActions";
import { useC8Payments } from "@/hooks/useC8Payments";
import { CrmUsersList } from "@/components/clients/CrmUsersList";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import type { C8Tenant } from "@/hooks/useC8Tenants";
import type { Payment } from "@/types/crm";
import { useInvoices } from "@/hooks/useInvoices";
import { useModulePermission } from "@/hooks/usePermissions";
import { InvoiceStatusBadge } from "@/components/fiscal/InvoiceStatusBadge";
import { InvoiceEmitModal } from "@/components/fiscal/InvoiceEmitModal";
import { InvoiceViewModal } from "@/components/fiscal/InvoiceViewModal";
import type { Invoice } from "@/types/fiscal";

interface C8TenantDetailProps {
  tenant: C8Tenant;
  organizationId: string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
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

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  pago: "bg-emerald-100 text-emerald-700",
  pendente: "bg-yellow-100 text-yellow-700",
  atrasado: "bg-red-100 text-red-700",
  cancelado: "bg-slate-100 text-slate-600",
};

export function C8TenantDetail({
  tenant,
  organizationId,
  canEdit,
  canDelete,
  onClose,
  onEdit,
}: C8TenantDetailProps) {
  const actions = useC8TenantActions(organizationId);
  const qc = useQueryClient();
  const { payments, legacyPayments, isLoading: paymentsLoading } = useC8Payments({
    organizationId,
    clientId: tenant.client_id,
  });

  // Payment cancel state
  const [cancelPaymentTarget, setCancelPaymentTarget] = useState<Payment | null>(null);
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);

  // ── Fiscal permissions ────────────────────────────────────────────────────
  const fiscalPerms = useModulePermission("fiscal" as any);

  // ── Invoices for this tenant (filtered by client_id) ─────────────────────
  // The tenant's contract_id is not directly available on C8Tenant, so we
  // filter by client_id and let the "Notas Fiscais" tab show all invoices for
  // this client. The emit modal can be pre-filled with contract_id when known.
  const invoicesQuery = useInvoices(
    fiscalPerms.canView ? organizationId : undefined,
    fiscalPerms.canView ? { client_id: tenant.client_id } : undefined
  );
  const tenantInvoices = invoicesQuery.data ?? [];

  // ── Fiscal modal state ────────────────────────────────────────────────────
  const [emitModalOpen, setEmitModalOpen] = useState(false);
  const [emitDefaultPaymentId, setEmitDefaultPaymentId] = useState<string | undefined>(undefined);
  const [viewModalInvoice, setViewModalInvoice] = useState<Invoice | null>(null);

  /** Opens the emit modal pre-filled for a specific payment */
  const openEmitForPayment = (paymentId: string) => {
    setEmitDefaultPaymentId(paymentId);
    setEmitModalOpen(true);
  };

  /** Opens the emit modal pre-filled for the tenant (no specific payment) */
  const openEmitForTenant = () => {
    setEmitDefaultPaymentId(undefined);
    setEmitModalOpen(true);
  };

  // Block dialog
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [isBlocking, setIsBlocking] = useState(false);

  // Unblock dialog
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);

  // Suspend dialog
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Renew contract dialog
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [newEndDate, setNewEndDate] = useState(tenant.contract_end ?? "");
  const [isRenewing, setIsRenewing] = useState(false);

  // Password reset state
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);

  // Inline edit state
  const [editPlanName, setEditPlanName] = useState(tenant.plan_name);
  const [editPlanValue, setEditPlanValue] = useState(String(tenant.plan_value));
  const [editDueDay, setEditDueDay] = useState(String(tenant.due_day));
  const [editMaxUsers, setEditMaxUsers] = useState(String(tenant.max_users));
  const [isSavingQuick, setIsSavingQuick] = useState(false);

  const handleQuickSave = async () => {
    const planValue = parseFloat(editPlanValue) || 0;
    const dueDay = Math.min(28, Math.max(1, parseInt(editDueDay) || 10));
    const maxUsers = Math.min(100, Math.max(1, parseInt(editMaxUsers) || 1));
    const planName = editPlanName.trim() || tenant.plan_name;

    // Só salva se houve mudança
    if (
      planName === tenant.plan_name &&
      planValue === tenant.plan_value &&
      dueDay === tenant.due_day &&
      maxUsers === tenant.max_users
    ) return;

    setIsSavingQuick(true);
    try {
      const { error } = await supabase
        .from("crm_client_plans")
        .update({ plan_name: planName, plan_value: planValue, due_day: dueDay, max_users: maxUsers })
        .eq("client_id", tenant.client_id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["c8_tenants", organizationId] });
      toast.success("Plano atualizado.");
    } catch {
      toast.error("Erro ao salvar alterações.");
    } finally {
      setIsSavingQuick(false);
    }
  };

  // Sync tenant state
  const [isSyncingTenant, setIsSyncingTenant] = useState(false);

  const handleSyncTenant = async () => {
    setIsSyncingTenant(true);
    try {
      const { data, error } = await supabase.functions.invoke("c8-sync-tenants", {
        body: { client_id: tenant.client_id },
      });
      if (error) throw error;
      if (data?.failed > 0) {
        toast.warning(`Sincronização com aviso: ${data.results?.[0]?.error ?? "verifique os dados"}`);
      } else {
        toast.success("Cliente sincronizado com o C8 Control.");
      }
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao sincronizar.");
    } finally {
      setIsSyncingTenant(false);
    }
  };

  const status = tenant.subscription_status;

  const invalidatePayments = () => {
    qc.invalidateQueries({ queryKey: ["c8_payments", organizationId] });
    qc.invalidateQueries({ queryKey: ["payments", organizationId] });
  };

  const handleCancelPayment = async () => {
    if (!cancelPaymentTarget) return;
    setIsCancellingPayment(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({ status: "cancelado" })
        .eq("id", cancelPaymentTarget.id);
      if (error) throw error;
      toast.success("Lançamento cancelado.");
      setCancelPaymentTarget(null);
      invalidatePayments();
    } catch {
      toast.error("Erro ao cancelar lançamento.");
    } finally {
      setIsCancellingPayment(false);
    }
  };

  const handleBlock = async () => {
    if (!blockReason.trim()) return;
    setIsBlocking(true);
    try {
      await actions.blockTenant.mutateAsync({ clientId: tenant.client_id, reason: blockReason, organizationId });
      toast.success("Cliente bloqueado.");
      setBlockDialogOpen(false);
      setBlockReason("");
    } catch {
      toast.error("Erro ao bloquear cliente.");
    } finally {
      setIsBlocking(false);
    }
  };

  const handleUnblock = async () => {
    setIsUnblocking(true);
    try {
      await actions.unblockTenant.mutateAsync({ clientId: tenant.client_id, organizationId });
      toast.success("Cliente liberado.");
      setUnblockDialogOpen(false);
    } catch {
      toast.error("Erro ao liberar cliente.");
    } finally {
      setIsUnblocking(false);
    }
  };

  const handleSuspend = async () => {
    setIsSuspending(true);
    try {
      await actions.suspendTenant.mutateAsync({ clientId: tenant.client_id, organizationId });
      toast.success("Cliente suspenso.");
      setSuspendDialogOpen(false);
    } catch {
      toast.error("Erro ao suspender cliente.");
    } finally {
      setIsSuspending(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await actions.cancelTenant.mutateAsync({ clientId: tenant.client_id, organizationId });
      toast.success("Contrato cancelado.");
      setCancelDialogOpen(false);
      onClose();
    } catch {
      toast.error("Erro ao cancelar contrato.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRenew = async () => {
    if (!newEndDate) { toast.error("Informe a nova data de fim."); return; }
    setIsRenewing(true);
    try {
      await actions.renewContract.mutateAsync({ clientId: tenant.client_id, newEndDate, organizationId });
      toast.success("Contrato renovado!");
      setRenewDialogOpen(false);
    } catch {
      toast.error("Erro ao renovar contrato.");
    } finally {
      setIsRenewing(false);
    }
  };

  const handleSendReset = async () => {
    if (!tenant.primary_user_email) {
      toast.error("Nenhum e-mail de usuário principal cadastrado.");
      return;
    }
    setIsSendingReset(true);
    setResetLink(null);
    try {
      // Obter o token da sessão atual para autenticar a Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão inválida. Faça login novamente.");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/c8-reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: tenant.primary_user_email,
          client_name: tenant.client_name,
          client_id: tenant.client_id,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);

      if (data?.reset_link) setResetLink(data.reset_link);
      if (data?.warning) {
        toast.warning(data.warning);
      } else if (data?.is_new_user) {
        toast.success(`Usuário criado e e-mail de boas-vindas enviado para ${tenant.primary_user_email}`);
      } else {
        toast.success(`Link de redefinição enviado para ${tenant.primary_user_email}`);
      }
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao enviar link de reset.");
    } finally {
      setIsSendingReset(false);
    }
  };

  const allPayments = [
    ...payments.map((p) => ({ ...p, isLegacy: false })),
    ...legacyPayments.map((p) => ({ ...p, isLegacy: true })),
  ].sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));

  return (
    <>
      <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              {tenant.client_name}
              <Badge className={STATUS_BADGE[status] ?? "bg-muted text-muted-foreground"}>
                {status}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="plano">
            <TabsList className="mb-4">
              <TabsTrigger value="plano">Plano</TabsTrigger>
              <TabsTrigger value="usuarios">
                <Users className="h-3.5 w-3.5 mr-1" />
                Usuários
              </TabsTrigger>
              <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
              {fiscalPerms.canView && (
                <TabsTrigger value="notas-fiscais">Notas Fiscais</TabsTrigger>
              )}
            </TabsList>

            {/* ── Plano ── */}
            <TabsContent value="plano" className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Plano — editável */}
                <div>
                  <p className="text-xs text-muted-foreground">Plano</p>
                  {canEdit ? (
                    <Input
                      className="h-7 text-sm mt-0.5"
                      value={editPlanName}
                      onChange={e => setEditPlanName(e.target.value)}
                      onBlur={() => handleQuickSave()}
                    />
                  ) : <p className="font-medium">{tenant.plan_name}</p>}
                </div>
                {/* Valor — editável */}
                <div>
                  <p className="text-xs text-muted-foreground">Valor Mensal (R$)</p>
                  {canEdit ? (
                    <Input
                      className="h-7 text-sm mt-0.5"
                      type="number" min={0} step={0.01}
                      value={editPlanValue}
                      onChange={e => setEditPlanValue(e.target.value)}
                      onBlur={() => handleQuickSave()}
                    />
                  ) : <p className="font-medium">{fmtCurrency(tenant.plan_value)}</p>}
                </div>
                {/* Dia de vencimento — editável */}
                <div>
                  <p className="text-xs text-muted-foreground">Dia de Vencimento</p>
                  {canEdit ? (
                    <Input
                      className="h-7 text-sm mt-0.5"
                      type="number" min={1} max={28}
                      value={editDueDay}
                      onChange={e => setEditDueDay(e.target.value)}
                      onBlur={() => handleQuickSave()}
                    />
                  ) : <p className="font-medium">Dia {tenant.due_day}</p>}
                </div>
                {/* Máx. usuários — editável */}
                <div>
                  <p className="text-xs text-muted-foreground">Máx. Usuários</p>
                  {canEdit ? (
                    <Input
                      className="h-7 text-sm mt-0.5"
                      type="number" min={1} max={100}
                      value={editMaxUsers}
                      onChange={e => setEditMaxUsers(e.target.value)}
                      onBlur={() => handleQuickSave()}
                    />
                  ) : <p className="font-medium">{tenant.max_users}</p>}
                </div>
                <div><p className="text-xs text-muted-foreground">Início do Contrato</p><p className="font-medium">{fmtDate(tenant.contract_start)}</p></div>
                <div><p className="text-xs text-muted-foreground">Fim do Contrato</p><p className="font-medium">{fmtDate(tenant.contract_end)}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className={STATUS_BADGE[status] ?? "bg-muted text-muted-foreground"}>{status}</Badge>
                    {status === "bloqueado" && tenant.blocked_reason && (
                      <span className="text-xs text-muted-foreground">— {tenant.blocked_reason}</span>
                    )}
                  </div>
                </div>
                {tenant.primary_user_email && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">E-mail do Usuário Principal</p>
                    <p className="font-medium">{tenant.primary_user_email}</p>
                  </div>
                )}
              </div>

              {/* Contadores de usuários */}
              <div className="grid grid-cols-3 gap-3 text-sm pt-2 border-t">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{tenant.active_users_count}</p>
                  <p className="text-xs text-emerald-600">Ativos</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                  <p className="text-2xl font-bold text-slate-700">{tenant.total_users_count}</p>
                  <p className="text-xs text-slate-500">Cadastrados</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
                  <p className="text-2xl font-bold text-blue-700">{tenant.max_users}</p>
                  <p className="text-xs text-blue-600">Limite</p>
                </div>
              </div>

              {/* Reset link */}
              {resetLink && (
                <div className="rounded-md bg-violet-50 border border-violet-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-violet-800 flex items-center gap-1">
                    <KeyRound className="h-3.5 w-3.5" /> Link de redefinição gerado
                  </p>
                  <p className="text-[11px] text-violet-600 break-all font-mono">{resetLink}</p>
                  <button className="text-xs text-violet-700 underline" onClick={() => { navigator.clipboard.writeText(resetLink); toast.success("Link copiado!"); }}>
                    Copiar link
                  </button>
                </div>
              )}

              {/* Ações */}
              {(canEdit || canDelete) && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                  {canEdit && <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={onEdit}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>}
                  {canEdit && status === "bloqueado" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50" onClick={() => setUnblockDialogOpen(true)}><ShieldCheck className="h-3 w-3 mr-1" /> Liberar</Button>
                  )}
                  {canEdit && status === "ativo" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-yellow-500 text-yellow-700 hover:bg-yellow-50" onClick={() => setSuspendDialogOpen(true)}>Suspender</Button>
                  )}
                  {canEdit && status === "suspenso" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50" onClick={() => setUnblockDialogOpen(true)}><ShieldCheck className="h-3 w-3 mr-1" /> Reativar</Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setRenewDialogOpen(true)}><RefreshCcw className="h-3 w-3 mr-1" /> Renovar</Button>
                  )}
                  {canEdit && tenant.primary_user_email && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-violet-400 text-violet-700 hover:bg-violet-50" onClick={handleSendReset} disabled={isSendingReset}>
                      {isSendingReset ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <KeyRound className="h-3 w-3 mr-1" />}
                      Reset Senha
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-blue-400 text-blue-700 hover:bg-blue-50" onClick={handleSyncTenant} disabled={isSyncingTenant}>
                      {isSyncingTenant ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
                      Sincronizar
                    </Button>
                  )}
                  {canDelete && status !== "cancelado" && (
                    <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={() => setCancelDialogOpen(true)}><Trash2 className="h-3 w-3 mr-1" /> Cancelar</Button>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── Usuários ── */}
            <TabsContent value="usuarios">
              <CrmUsersList
                clientId={tenant.client_id}
                organizationId={organizationId}
                maxUsers={tenant.max_users}
              />
            </TabsContent>

            {/* ── Pagamentos ── */}
            <TabsContent value="pagamentos">
              {paymentsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : allPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">Nenhum pagamento encontrado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Recebido em</TableHead>
                      {(canEdit || fiscalPerms.canView) && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allPayments.map((p) => {
                      // Busca qualquer invoice vinculado (não só autorizada)
                      const linkedInvoice = fiscalPerms.canView
                        ? tenantInvoices.find(inv => inv.payment_id === p.id) ?? null
                        : null;
                      const isAutorizada  = linkedInvoice?.status === "autorizada";
                      const isPendente    = linkedInvoice?.status === "pendente";
                      const isProcessando = linkedInvoice?.status === "processando";

                      return (
                        <TableRow key={p.id}>
                          <TableCell>{fmtDate(p.due_date)}</TableCell>
                          <TableCell className="font-medium">{fmtCurrency(p.value)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge className={PAYMENT_STATUS_BADGE[p.status ?? ""] ?? "bg-muted text-muted-foreground"}>{p.status ?? "—"}</Badge>
                              {p.isLegacy && <Badge className="bg-slate-100 text-slate-500 text-xs">Legado</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>{fmtDate(p.paid_at)}</TableCell>
                          {(canEdit || fiscalPerms.canView) && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {fiscalPerms.canView && (
                                  <>
                                    {/* Nota autorizada — visualizar */}
                                    {isAutorizada && (
                                      <Button
                                        size="sm" variant="ghost"
                                        title="Ver NFS-e autorizada"
                                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                        onClick={() => setViewModalInvoice(linkedInvoice)}
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {/* Nota em processamento */}
                                    {isProcessando && (
                                      <Button size="sm" variant="ghost" title="Nota em processamento" className="text-blue-500 cursor-default" disabled>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      </Button>
                                    )}
                                    {/* Nota pendente — enviar */}
                                    {isPendente && fiscalPerms.canCreate && (
                                      <Button
                                        size="sm" variant="ghost"
                                        title="Enviar NFS-e para emissão"
                                        className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                        onClick={() => openEmitForPayment(p.id)}
                                      >
                                        <Receipt className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {/* Sem invoice — emitir */}
                                    {!linkedInvoice && fiscalPerms.canCreate && (
                                      <Button
                                        size="sm" variant="ghost"
                                        title="Emitir NFS-e para este lançamento"
                                        className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                        onClick={() => openEmitForPayment(p.id)}
                                      >
                                        <Receipt className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                )}
                                {canEdit && p.status !== "pago" && p.status !== "cancelado" && (
                                  <Button size="sm" variant="ghost" className="text-yellow-600 hover:text-yellow-700" title="Cancelar lançamento" onClick={() => setCancelPaymentTarget(p)}>
                                    <PauseCircle className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            {/* ── Notas Fiscais tab (req 5.1, 5.2, 5.3, 5.4) ── */}
            {fiscalPerms.canView && (
              <TabsContent value="notas-fiscais" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Notas Fiscais</h3>
                  {fiscalPerms.canCreate && (
                    <Button size="sm" onClick={openEmitForTenant}>
                      <Receipt className="h-4 w-4 mr-1" /> Emitir NFS-e
                    </Button>
                  )}
                </div>

                {invoicesQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando notas fiscais...
                  </div>
                ) : tenantInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    Nenhuma nota fiscal emitida para este cliente.
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nº Nota</TableHead>
                          <TableHead>Competência</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">PDF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tenantInvoices.map((inv) => {
                          const competencia = inv.competencia
                            ? (() => { const [y, m] = inv.competencia!.split("-"); return `${m}/${y}`; })()
                            : "—";
                          return (
                            <TableRow key={inv.id}>
                              <TableCell className="font-mono text-sm">
                                {inv.numero ? (
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                    {inv.numero}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>{competencia}</TableCell>
                              <TableCell className="text-right font-medium">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(inv.valor_servico)}
                              </TableCell>
                              <TableCell>
                                <InvoiceStatusBadge status={inv.status} />
                              </TableCell>
                              <TableCell className="text-right">
                                {inv.status === "autorizada" && inv.pdf_url ? (
                                  <Button variant="ghost" size="sm" asChild title="Baixar PDF">
                                    <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                                      <FileText className="h-4 w-4" />
                                    </a>
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
          {/* ── Fiscal modals ── */}
          {fiscalPerms.canView && (
            <>
              {/* Emit modal: pre-filled with client data from tenant */}
              <InvoiceEmitModal
                open={emitModalOpen}
                onOpenChange={(open) => {
                  setEmitModalOpen(open);
                  if (!open) setEmitDefaultPaymentId(undefined);
                }}
                organizationId={organizationId}
                defaultClientId={tenant.client_id}
                defaultPaymentId={emitDefaultPaymentId}
              />

              {/* View modal: shows invoice details */}
              <InvoiceViewModal
                open={!!viewModalInvoice}
                onOpenChange={(open) => { if (!open) setViewModalInvoice(null); }}
                invoice={viewModalInvoice}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Cliente</DialogTitle>
            <DialogDescription>
              Informe o motivo do bloqueio. O acesso será revogado imediatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Motivo *</Label>
            <Textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Descreva o motivo do bloqueio..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleBlock}
              disabled={!blockReason.trim() || isBlocking}
            >
              {isBlocking && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Bloqueio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock dialog */}
      <Dialog open={unblockDialogOpen} onOpenChange={setUnblockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar Cliente</DialogTitle>
            <DialogDescription>
              Confirma a liberação do acesso para {tenant.client_name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnblockDialogOpen(false)}>Cancelar</Button>
            <Button
              className="border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleUnblock}
              disabled={isUnblocking}
            >
              {isUnblocking && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Liberação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspender Cliente</DialogTitle>
            <DialogDescription>
              Confirma a suspensão do acesso para {tenant.client_name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleSuspend}
              disabled={isSuspending}
            >
              {isSuspending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Suspensão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel contract dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Contrato</DialogTitle>
            <DialogDescription>
              Esta ação cancelará o contrato de {tenant.client_name}.
            </DialogDescription>
          </DialogHeader>
          {tenant.active_users_count > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {tenant.active_users_count} usuário(s) ativo(s) perderão acesso ao C8 Control.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew contract dialog */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar Contrato</DialogTitle>
            <DialogDescription>
              Informe a nova data de fim do contrato para {tenant.client_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nova Data de Fim *</Label>
            <Input
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleRenew} disabled={!newEndDate || isRenewing}>
              {isRenewing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <Check className="h-4 w-4 mr-1" />
              Confirmar Renovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel payment dialog */}
      <Dialog open={!!cancelPaymentTarget} onOpenChange={(open) => { if (!open) setCancelPaymentTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Lançamento</DialogTitle>
            <DialogDescription>
              Confirma o cancelamento do lançamento de{" "}
              {cancelPaymentTarget ? fmtCurrency(cancelPaymentTarget.value) : ""}{" "}
              com vencimento em {fmtDate(cancelPaymentTarget?.due_date)}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelPaymentTarget(null)}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={handleCancelPayment}
              disabled={isCancellingPayment}
            >
              {isCancellingPayment && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
