import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, setDate, addMonths, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, ShieldOff, ShieldCheck, Plus, Trash2, KeyRound,
  Check, RefreshCcw, Package, Pencil, AlertTriangle, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useCrmClientPlan } from "@/hooks/useCrmClientPlan";
import { useCrmClientUsers } from "@/hooks/useCrmClientUsers";
import { useCreateContract } from "@/hooks/useContracts";

interface C8ControlTabProps {
  clientId: string;
  clientName: string;
  organizationId: string;
  c8ControlEnabled?: boolean;
}

interface PaymentRow {
  id: string;
  description: string;
  value: number;
  due_date: string | null;
  status: string | null;
  paid_at: string | null;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const STATUS_BADGE: Record<string, string> = {
  pago: "bg-emerald-100 text-emerald-700",
  pendente: "bg-yellow-100 text-yellow-700",
  atrasado: "bg-red-100 text-red-700",
  cancelado: "bg-slate-100 text-slate-600",
};

const SUBSCRIPTION_BADGE: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  bloqueado: "bg-red-100 text-red-700",
  inadimplente: "bg-yellow-100 text-yellow-700",
  cancelado: "bg-slate-100 text-slate-600",
};

function calcNextDueDate(dueDay: number): string {
  const today = startOfDay(new Date());
  let candidate = setDate(today, dueDay);
  if (isBefore(candidate, today)) candidate = setDate(addMonths(today, 1), dueDay);
  return format(candidate, "yyyy-MM-dd");
}

export function C8ControlTab({ clientId, clientName, organizationId, c8ControlEnabled = false }: C8ControlTabProps) {
  const { profile } = useAuth();
  const isAdminOrOwner = profile?.role === "admin" || profile?.role === "owner";
  const qc = useQueryClient();

  const { data: plan, isLoading: planLoading, updateStatus, upsertPlan } = useCrmClientPlan(clientId);
  const { data: users, isLoading: usersLoading, activeCount, inviteUser, removeUser } = useCrmClientUsers(clientId, organizationId);
  const createContract = useCreateContract(organizationId);

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [isEnabled, setIsEnabled] = useState(c8ControlEnabled);

  // Sync when prop changes (e.g. after cache invalidation)
  useEffect(() => { setIsEnabled(c8ControlEnabled); }, [c8ControlEnabled]);
  const [isActivating, setIsActivating] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);

  // Contract block state
  const [contractValue, setContractValue] = useState("");
  const [contractDuration, setContractDuration] = useState("12");
  const [contractDueDay, setContractDueDay] = useState("10");
  const [maxUsers, setMaxUsers] = useState("1");
  const [isSavingContract, setIsSavingContract] = useState(false);

  // Block/unblock
  const [isToggling, setIsToggling] = useState(false);

  // Invite user
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  // Remove user
  const [removeTarget, setRemoveTarget] = useState<{ id: string; email: string; name: string | null } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Reset password per user
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string; name: string | null } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Receive payment
  const [receiveTarget, setReceiveTarget] = useState<PaymentRow | null>(null);
  const [receiveValue, setReceiveValue] = useState("");
  const [receiveDate, setReceiveDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isReceiving, setIsReceiving] = useState(false);

  // Edit payment
  const [editTarget, setEditTarget] = useState<PaymentRow | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete payment (requires admin/owner password + justification)
  const [deleteTarget, setDeleteTarget] = useState<PaymentRow | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteJustification, setDeleteJustification] = useState("");
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);

  // Generate charge
  const [isGeneratingCharge, setIsGeneratingCharge] = useState(false);
  const [crmContractId, setCrmContractId] = useState<string | null>(null);

  // Sync plan values into contract block fields
  useEffect(() => {
    if (plan) {
      setContractValue(String(plan.plan_value ?? 0));
      setContractDueDay(String(plan.due_day ?? 10));
      setMaxUsers(String(plan.max_users ?? 1));
    }
  }, [plan]);

  const fetchPayments = async () => {
    setPaymentsLoading(true);
    // Buscar o contrato CRM deste cliente para usar como fonte única de pagamentos
    const { data: contracts } = await supabase
      .from("contracts")
      .select("id")
      .eq("client_id", clientId)
      .eq("service_contracted", "C8 Control CRM")
      .order("created_at", { ascending: false })
      .limit(1);

    const contractId = contracts?.[0]?.id ?? null;

    let query = supabase
      .from("payments")
      .select("id, description, value, due_date, status, paid_at")
      .eq("client_id", clientId)
      .order("due_date", { ascending: false })
      .limit(24);

    if (contractId) {
      // Fonte única: pagamentos vinculados ao contrato CRM
      query = query.eq("contract_id", contractId);
    } else {
      // Fallback: pagamentos avulsos com descrição C8 Control (sem contrato ainda)
      query = query.like("description", "Mensalidade C8 Control%").is("contract_id", null);
    }

    const { data } = await query;
    setPayments((data ?? []) as PaymentRow[]);
    setCrmContractId(contractId);
    setPaymentsLoading(false);
  };

  useEffect(() => { fetchPayments(); }, [clientId]);

  // ── Enable / Disable C8 Control ────────────────────────────────────────────
  const handleToggleEnabled = async (enable: boolean) => {
    if (!enable) {
      const { count } = await supabase
        .from("crm_client_users")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("active", true);
      if ((count ?? 0) > 0) { setDisableDialogOpen(true); return; }
    }
    await doToggleEnabled(enable);
  };

  const doToggleEnabled = async (enable: boolean) => {
    setIsActivating(true);
    setDisableDialogOpen(false);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ c8_control_enabled: enable })
        .eq("id", clientId);

      if (error) {
        // Se a coluna não existe ainda (migration pendente), mostrar instrução clara
        if (error.message?.includes("c8_control_enabled") || error.code === "42703") {
          toast.error("Migration pendente: aplique a migration 00117 no Supabase para habilitar esta funcionalidade.");
        } else {
          toast.error(`Erro ao salvar: ${error.message}`);
        }
        return;
      }

      if (enable) {
        const { data: existing } = await supabase.from("crm_client_plans").select("id").eq("client_id", clientId).maybeSingle();
        if (!existing) {
          const { error: planErr } = await supabase.from("crm_client_plans").insert({
            organization_id: organizationId, client_id: clientId,
            plan_value: 0, modules: [], max_users: 1, due_day: 10, subscription_status: "ativo",
          });
          if (planErr) { toast.error(`Erro ao criar plano: ${planErr.message}`); return; }
        }
        toast.success("C8 Control ativado!");
      } else {
        await supabase.from("crm_client_plans").update({ subscription_status: "cancelado" }).eq("client_id", clientId);
        toast.success("C8 Control desativado.");
      }
      setIsEnabled(enable);
      qc.invalidateQueries({ queryKey: ["clients", organizationId] });
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message ?? "tente novamente"}`);
    } finally {
      setIsActivating(false);
    }
  };

  // ── Block / Unblock ─────────────────────────────────────────────────────────
  const handleToggleBlock = async () => {
    if (!plan) return;
    const newStatus = plan.subscription_status === "bloqueado" ? "ativo" : "bloqueado";
    setIsToggling(true);
    try {
      await updateStatus.mutateAsync({ planId: plan.id, status: newStatus });
      toast.success(newStatus === "bloqueado" ? "Acesso bloqueado." : "Acesso liberado.");
    } catch { toast.error("Erro ao alterar status."); }
    finally { setIsToggling(false); }
  };

  // ── Save contract block (plan + optional contract) ──────────────────────────
  const handleSaveContract = async (createNewContract: boolean) => {
    const val = parseFloat(contractValue);
    const dur = parseInt(contractDuration);
    const day = parseInt(contractDueDay);
    const mu = parseInt(maxUsers);
    if (isNaN(val) || val < 0) { toast.error("Informe um valor válido."); return; }
    if (isNaN(mu) || mu < 1) { toast.error("Informe o número máximo de usuários."); return; }
    setIsSavingContract(true);
    try {
      await upsertPlan.mutateAsync({
        organization_id: organizationId, client_id: clientId,
        plan_value: val, modules: plan?.modules ?? [], max_users: mu,
        due_day: isNaN(day) ? 10 : Math.min(28, Math.max(1, day)),
      });
      if (createNewContract) {
        const today = format(new Date(), "yyyy-MM-dd");
        const dueDate = calcNextDueDate(isNaN(day) ? 10 : Math.min(28, Math.max(1, day)));
        await createContract.mutateAsync({
          client_id: clientId,
          title: `CRM — ${clientName}`,
          service_contracted: "C8 Control CRM",
          contract_date: today,
          duration_months: isNaN(dur) || dur < 1 ? 12 : dur,
          first_payment_value: val,
          first_payment_method: "boleto",
          first_payment_due_date: dueDate,
          recurring_value: val,
          recurring_due_date: dueDate,
          metadata: { source: "c8_control", max_users: mu },
        });
        toast.success("Plano e contrato CRM criados!");
      } else {
        toast.success("Plano atualizado!");
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar."); }
    finally { setIsSavingContract(false); }
  };

  // ── Generate charge ─────────────────────────────────────────────────────────
  const handleGenerateCharge = async () => {
    if (!plan) return;
    setIsGeneratingCharge(true);
    try {
      const { error } = await supabase.from("payments").insert({
        organization_id: organizationId,
        client_id: clientId,
        ...(crmContractId ? { contract_id: crmContractId } : {}),
        description: `Mensalidade C8 Control — ${clientName}`,
        value: plan.plan_value,
        due_date: calcNextDueDate(plan.due_day),
        status: "pendente",
      });
      if (error) throw error;
      toast.success("Cobrança gerada!");
      fetchPayments();
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    } catch { toast.error("Erro ao gerar cobrança."); }
    finally { setIsGeneratingCharge(false); }
  };

  // ── Receive payment ─────────────────────────────────────────────────────────
  const handleReceive = async () => {
    if (!receiveTarget) return;
    const val = parseFloat(receiveValue);
    if (isNaN(val) || val <= 0) { toast.error("Informe um valor válido."); return; }
    setIsReceiving(true);
    try {
      await supabase.from("payments").update({
        status: "pago", paid_at: new Date(receiveDate + "T12:00:00").toISOString(), value: val,
      }).eq("id", receiveTarget.id);
      toast.success("Recebimento registrado!");
      setReceiveTarget(null);
      fetchPayments();
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    } catch { toast.error("Erro ao registrar recebimento."); }
    finally { setIsReceiving(false); }
  };

  // ── Edit payment ────────────────────────────────────────────────────────────
  const handleEditPayment = async () => {
    if (!editTarget) return;
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) { toast.error("Informe um valor válido."); return; }
    setIsSavingEdit(true);
    try {
      await supabase.from("payments").update({ value: val, due_date: editDueDate }).eq("id", editTarget.id);
      toast.success("Cobrança atualizada!");
      setEditTarget(null);
      fetchPayments();
    } catch { toast.error("Erro ao atualizar cobrança."); }
    finally { setIsSavingEdit(false); }
  };

  // ── Delete payment (admin/owner password + justification) ───────────────────
  const handleDeletePayment = async () => {
    if (!deleteTarget) return;
    if (!deleteJustification.trim()) { toast.error("Informe a justificativa."); return; }
    if (!deletePassword.trim()) { toast.error("Informe a senha."); return; }
    setIsDeletingPayment(true);
    try {
      // Verify password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Usuário não autenticado.");
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: deletePassword });
      if (authErr) { toast.error("Senha incorreta."); setIsDeletingPayment(false); return; }
      await supabase.from("payments").delete().eq("id", deleteTarget.id);
      toast.success("Cobrança excluída.");
      setDeleteTarget(null);
      setDeletePassword("");
      setDeleteJustification("");
      fetchPayments();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao excluir cobrança."); }
    finally { setIsDeletingPayment(false); }
  };

  // ── Invite user ─────────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error("Informe o e-mail."); return; }
    setIsInviting(true);
    try {
      await inviteUser.mutateAsync({ email: inviteEmail.trim(), name: inviteName.trim() || undefined });
      toast.success("Usuário convidado!");
      setInviteOpen(false); setInviteEmail(""); setInviteName("");
    } catch (e: any) { toast.error(e?.message ?? "Erro ao convidar usuário."); }
    finally { setIsInviting(false); }
  };

  // ── Remove user ─────────────────────────────────────────────────────────────
  const handleRemove = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeUser.mutateAsync({ email: removeTarget.email, c8UserId: removeTarget.id });
      toast.success("Usuário removido.");
      setRemoveTarget(null);
    } catch { toast.error("Erro ao remover usuário."); }
    finally { setIsRemoving(false); }
  };

  // ── Reset password for specific user ───────────────────────────────────────
  const handleResetPassword = async () => {
    if (!resetTarget?.email) return;
    setIsResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetTarget.email);
      if (error) throw error;
      toast.success(`Link de redefinição enviado para ${resetTarget.email}`);
      setResetTarget(null);
    } catch { toast.error("Erro ao enviar e-mail de redefinição."); }
    finally { setIsResetting(false); }
  };

  if (planLoading || usersLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="h-5 w-5 animate-spin" /> Carregando C8 Control...</div>;
  }

  // ── Inactive state ──────────────────────────────────────────────────────────
  if (!isEnabled) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-200 flex items-center justify-center">
                  <Package className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <CardTitle className="text-base">C8 Control</CardTitle>
                  <p className="text-xs text-muted-foreground">CRM externo do cliente</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Inativo</span>
                {isActivating ? <Loader2 className="h-5 w-5 animate-spin text-violet-600" /> : (
                  <Switch checked={false} onCheckedChange={() => handleToggleEnabled(true)} />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Ative o C8 Control para gerenciar o acesso do cliente ao CRM externo, controlar usuários e mensalidades.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isBlocked = plan?.subscription_status === "bloqueado";
  const maxUsersNum = plan?.max_users ?? 1;
  const atLimit = activeCount >= maxUsersNum;

  return (
    <div className="space-y-6">

      {/* ── Header: status + block + toggle ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-violet-600 flex items-center justify-center">
                <Package className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">C8 Control</CardTitle>
                <p className="text-xs text-muted-foreground">CRM externo do cliente</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {plan?.subscription_status && (
                <Badge className={SUBSCRIPTION_BADGE[plan.subscription_status] ?? "bg-muted text-muted-foreground"}>
                  {plan.subscription_status}
                </Badge>
              )}
              <Button size="sm" variant={isBlocked ? "outline" : "destructive"} onClick={handleToggleBlock}
                disabled={isToggling || !plan}
                className={isBlocked ? "border-emerald-500 text-emerald-700 hover:bg-emerald-50" : ""}
              >
                {isToggling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : isBlocked ? <ShieldCheck className="h-4 w-4 mr-1" /> : <ShieldOff className="h-4 w-4 mr-1" />}
                {isBlocked ? "Liberar Acesso" : "Bloquear Acesso"}
              </Button>
              <div className="flex items-center gap-2 pl-2 border-l">
                <span className="text-xs text-muted-foreground">Ativo</span>
                {isActivating ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> : (
                  <Switch checked={true} onCheckedChange={() => handleToggleEnabled(false)} />
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        {plan && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><p className="text-muted-foreground text-xs">Valor</p><p className="font-semibold">{fmtCurrency(plan.plan_value)}</p></div>
              <div><p className="text-muted-foreground text-xs">Usuários</p><p className="font-semibold">{activeCount} / {plan.max_users}</p></div>
              <div><p className="text-muted-foreground text-xs">Vencimento</p><p className="font-semibold">Dia {plan.due_day}</p></div>
              <div><p className="text-muted-foreground text-xs">Módulos</p><p className="font-semibold">{plan.modules.length > 0 ? plan.modules.length : "—"}</p></div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Contract / Plan block ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Contrato CRM</CardTitle>
          <p className="text-xs text-muted-foreground">Configure o valor, duração, vencimento e limite de usuários. Crie ou renove o contrato vinculado.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Valor mensal (R$)</Label>
              <Input type="number" min={0} step={0.01} value={contractValue} onChange={e => setContractValue(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Duração (meses)</Label>
              <Input type="number" min={1} max={60} value={contractDuration} onChange={e => setContractDuration(e.target.value)} placeholder="12" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dia de vencimento (1–28)</Label>
              <Input type="number" min={1} max={28} value={contractDueDay} onChange={e => setContractDueDay(e.target.value)} placeholder="10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Máx. usuários</Label>
              <Input type="number" min={1} max={100} value={maxUsers} onChange={e => setMaxUsers(e.target.value)} placeholder="1" />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap pt-1">
            <Button size="sm" variant="outline" onClick={() => handleSaveContract(false)} disabled={isSavingContract}>
              {isSavingContract ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar alterações
            </Button>
            <Button size="sm" onClick={() => handleSaveContract(true)} disabled={isSavingContract}>
              {isSavingContract ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
              Criar / Renovar Contrato CRM
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Users ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Usuários do CRM</CardTitle>
              <p className="text-sm text-muted-foreground">{activeCount} de {maxUsersNum} usuários utilizados</p>
            </div>
            <Button size="sm" onClick={() => setInviteOpen(true)} disabled={atLimit} title={atLimit ? `Limite de ${maxUsersNum} usuários atingido` : undefined}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!users || users.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Nenhum usuário cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.last_access_at ? format(parseISO(u.last_access_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="text-slate-500 hover:text-slate-700"
                          onClick={() => setResetTarget({ id: u.id, email: u.email, name: u.name })}
                          title="Resetar senha"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                          onClick={() => setRemoveTarget({ id: u.id, email: u.email, name: u.name })}
                          title="Excluir usuário"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ── Payments ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Mensalidades</CardTitle>
            <Button size="sm" variant="outline" onClick={handleGenerateCharge} disabled={isGeneratingCharge || !plan}>
              {isGeneratingCharge ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
              Gerar Cobrança
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {paymentsLoading ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma mensalidade encontrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recebido em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.due_date ? format(parseISO(p.due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                    <TableCell className="font-semibold">{fmtCurrency(p.value)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[p.status ?? ""] ?? "bg-muted text-muted-foreground"}>{p.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>{p.paid_at ? format(parseISO(p.paid_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.status !== "pago" && (
                          <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => { setReceiveTarget(p); setReceiveValue(String(p.value)); setReceiveDate(p.due_date ? String(p.due_date).substring(0, 10) : format(new Date(), "yyyy-MM-dd")); }}
                            title="Registrar recebimento"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-slate-500 hover:text-slate-700"
                          onClick={() => { setEditTarget(p); setEditValue(String(p.value)); setEditDueDate(p.due_date ? String(p.due_date).substring(0, 10) : ""); }}
                          title="Alterar cobrança"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdminOrOwner && (
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                            onClick={() => setDeleteTarget(p)}
                            title="Excluir cobrança"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog: Invite user ── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Usuário</DialogTitle><DialogDescription>O usuário receberá um convite por e-mail.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>E-mail *</Label><Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="usuario@exemplo.com" /></div>
            <div className="space-y-1"><Label>Nome</Label><Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Nome do usuário" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={isInviting}>{isInviting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Enviar Convite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Remove user ── */}
      <Dialog open={!!removeTarget} onOpenChange={o => { if (!o) setRemoveTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Excluir Usuário</DialogTitle><DialogDescription>Tem certeza que deseja excluir <strong>{removeTarget?.name ?? removeTarget?.id}</strong>? O acesso será revogado imediatamente.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>{isRemoving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Reset password ── */}
      <Dialog open={!!resetTarget} onOpenChange={o => { if (!o) setResetTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Resetar Senha</DialogTitle><DialogDescription>Enviar link de redefinição para <strong>{resetTarget?.email}</strong>?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={isResetting}>{isResetting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}<KeyRound className="h-4 w-4 mr-2" />Enviar Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Receive payment ── */}
      <Dialog open={!!receiveTarget} onOpenChange={o => { if (!o) setReceiveTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Recebimento</DialogTitle><DialogDescription>Valor total: <strong>{receiveTarget ? fmtCurrency(receiveTarget.value) : ""}</strong></DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Valor recebido (R$)</Label><Input type="number" step="0.01" min="0.01" value={receiveValue} onChange={e => setReceiveValue(e.target.value)} /></div>
            <div className="space-y-1"><Label>Data do recebimento</Label><Input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveTarget(null)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleReceive} disabled={isReceiving}>{isReceiving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}<Check className="h-4 w-4 mr-2" />Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Edit payment ── */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Alterar Cobrança</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Valor (R$)</Label><Input type="number" step="0.01" min="0.01" value={editValue} onChange={e => setEditValue(e.target.value)} /></div>
            <div className="space-y-1"><Label>Vencimento</Label><Input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEditPayment} disabled={isSavingEdit}>{isSavingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Delete payment (admin/owner only) ── */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) { setDeleteTarget(null); setDeletePassword(""); setDeleteJustification(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />Excluir Cobrança</DialogTitle>
            <DialogDescription>Esta ação requer confirmação de senha de administrador e justificativa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Justificativa *</Label><Textarea value={deleteJustification} onChange={e => setDeleteJustification(e.target.value)} placeholder="Motivo da exclusão..." rows={3} /></div>
            <div className="space-y-1"><Label>Senha (admin/owner) *</Label><Input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="••••••••" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeletePassword(""); setDeleteJustification(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeletePayment} disabled={isDeletingPayment}>{isDeletingPayment && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Disable C8 Control ── */}
      <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Desativar C8 Control</DialogTitle><DialogDescription>Existem usuários ativos. Ao desativar, todos perderão acesso. Deseja continuar?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => doToggleEnabled(false)} disabled={isActivating}>{isActivating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Desativar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
