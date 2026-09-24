import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, Send, Info } from "lucide-react";
import { toast } from "sonner";
import { addMonths, addYears, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useC8TenantActions, type C8TenantFormValues } from "@/hooks/useC8TenantActions";
import { useClients } from "@/hooks/useClients";
import { useC8Plans, BILLING_CYCLE_LABELS, type C8Plan } from "@/hooks/useC8Plans";
import type { C8Tenant } from "@/hooks/useC8Tenants";
import { supabase } from "@/lib/supabase";

const CUSTOM_PLAN_ID = "__custom__";

interface C8TenantFormProps {
  organizationId: string;
  editingTenant?: C8Tenant | null;
  onSuccess: () => void;
  onCancel: () => void;
}

/** Calculate contract_end from start + billing_cycle */
function calcContractEnd(start: string, cycle: C8Plan["billing_cycle"]): string {
  const d = new Date(start);
  switch (cycle) {
    case "trimestral": return format(addMonths(d, 3), "yyyy-MM-dd");
    case "semestral":  return format(addMonths(d, 6), "yyyy-MM-dd");
    case "anual":      return format(addYears(d, 1), "yyyy-MM-dd");
    default:           return format(addMonths(d, 1), "yyyy-MM-dd"); // mensal
  }
}

export function C8TenantForm({
  organizationId,
  editingTenant,
  onSuccess,
  onCancel,
}: C8TenantFormProps) {
  const isEditing = !!editingTenant;
  const { saveTenant } = useC8TenantActions(organizationId);
  const { data: allClients } = useClients(organizationId);
  const { data: plans = [] } = useC8Plans(organizationId);
  const activePlans = plans.filter(p => p.is_active);

  const availableClients = (allClients ?? []).filter(
    (c) => !(c as unknown as { c8_control_enabled?: boolean }).c8_control_enabled
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [clientId, setClientId] = useState(editingTenant?.client_id ?? "");
  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => {
    if (!isEditing) return "";
    // When editing, check if plan_name matches a known plan
    const match = plans.find(p => p.name === editingTenant?.plan_name);
    return match ? match.id : CUSTOM_PLAN_ID;
  });
  const isCustom = selectedPlanId === CUSTOM_PLAN_ID;
  const selectedPlan = activePlans.find(p => p.id === selectedPlanId);

  const [planName, setPlanName] = useState(editingTenant?.plan_name ?? "");
  const [planValue, setPlanValue] = useState(String(editingTenant?.plan_value ?? 0));
  const [maxUsers, setMaxUsers] = useState(String(editingTenant?.max_users ?? 1));
  const [dueDay, setDueDay] = useState(String(editingTenant?.due_day ?? 10));
  const [contractStart, setContractStart] = useState(editingTenant?.contract_start ?? "");
  const [contractEnd, setContractEnd] = useState(editingTenant?.contract_end ?? "");
  const [primaryUserEmail, setPrimaryUserEmail] = useState(editingTenant?.primary_user_email ?? "");
  const [primaryEmailFromClient, setPrimaryEmailFromClient] = useState(false);
  const [notes, setNotes] = useState(editingTenant?.notes ?? "");
  const [sendCredentials, setSendCredentials] = useState(!isEditing);
  const [maxUsersError, setMaxUsersError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);

  // ── Auto-preenche email do usuário principal a partir do cadastro do cliente ──
  useEffect(() => {
    if (isEditing) return; // na edição, não sobrescrever o que já está salvo
    if (!clientId) {
      if (primaryEmailFromClient) {
        setPrimaryUserEmail("");
        setPrimaryEmailFromClient(false);
      }
      return;
    }
    const client = (allClients ?? []).find((c) => c.id === clientId);
    const clientEmail = client?.email ?? "";
    if (clientEmail) {
      setPrimaryUserEmail(clientEmail);
      setPrimaryEmailFromClient(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, allClients]);

  // ── When plan selected, auto-fill fields and compute contract_end ──────────
  const handlePlanSelect = (planId: string) => {
    setSelectedPlanId(planId);
    if (planId === CUSTOM_PLAN_ID) {
      // Keep current values, allow editing
      return;
    }
    const plan = activePlans.find(p => p.id === planId);
    if (plan) {
      setPlanName(plan.name);
      setPlanValue(String(plan.monthly_value));
      setMaxUsers(String(plan.max_users));
      // Auto-compute contract_end if start is set
      if (contractStart) {
        setContractEnd(calcContractEnd(contractStart, plan.billing_cycle));
      }
    }
  };

  // When contractStart changes and a plan is selected, recompute end
  useEffect(() => {
    if (!contractStart || !selectedPlan || isCustom) return;
    setContractEnd(calcContractEnd(contractStart, selectedPlan.billing_cycle));
  }, [contractStart, selectedPlan?.id]);

  useEffect(() => {
    if (maxUsers === "") { setMaxUsersError(""); return; }
    const v = parseInt(maxUsers);
    if (isNaN(v) || v < 1 || v > 100) setMaxUsersError("Deve ser entre 1 e 100");
    else setMaxUsersError("");
  }, [maxUsers]);

  const planValueNum = parseFloat(planValue) || 0;
  const maxUsersNum = parseInt(maxUsers);
  const maxUsersValid = !isNaN(maxUsersNum) && maxUsersNum >= 1 && maxUsersNum <= 100;

  // ── Derived: renewal info ─────────────────────────────────────────────────
  const renewalInfo = (() => {
    if (!selectedPlan || isCustom || !contractStart) return null;
    const label = BILLING_CYCLE_LABELS[selectedPlan.billing_cycle];
    return `Renova automaticamente a cada período ${label.toLowerCase()} até ser encerrado.`;
  })();

  const checkActiveContract = async (): Promise<boolean> => {
    if (!clientId || planValueNum <= 0) return false;
    const { data } = await supabase
      .from("contracts").select("id")
      .eq("client_id", clientId)
      .eq("service_contracted", "C8 Control CRM")
      .eq("status", "ativo").limit(1);
    return (data ?? []).length > 0;
  };

  const doSave = async () => {
    if (!clientId) { toast.error("Selecione um cliente."); return; }
    if (!contractStart) { toast.error("Informe a data de início do contrato."); return; }
    if (!maxUsersValid) { toast.error("Número máximo de usuários inválido (1–100)."); return; }
    if (!planName.trim()) { toast.error("Informe o nome do plano."); return; }
    if (!primaryUserEmail.trim()) { toast.error("Informe o e-mail do usuário principal."); return; }

    const values: C8TenantFormValues = {
      client_id: clientId,
      plan_name: planName.trim(),
      plan_value: planValueNum,
      max_users: maxUsersNum,
      due_day: Math.min(28, Math.max(1, parseInt(dueDay) || 10)),
      billing_cycle: selectedPlan?.billing_cycle ?? "mensal",
      contract_start: contractStart,
      contract_end: contractEnd || undefined,
      primary_user_email: primaryUserEmail || undefined,
      notes: notes || undefined,
      organization_id: organizationId,
      send_credentials: sendCredentials && !!primaryUserEmail,
    };

    setIsSaving(true);
    try {
      await saveTenant.mutateAsync(values);
      toast.success(isEditing ? "Cliente atualizado!" : "Cliente criado!");
      onSuccess();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao salvar cliente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!clientId) { toast.error("Selecione um cliente."); return; }
    if (!contractStart) { toast.error("Informe a data de início do contrato."); return; }
    if (!maxUsersValid) { toast.error("Número máximo de usuários inválido (1–100)."); return; }
    if (!planName.trim()) { toast.error("Informe o nome do plano."); return; }

    if (planValueNum > 0) {
      const active = await checkActiveContract();
      if (active) { setContractDialogOpen(true); return; }
    }
    await doSave();
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <>
      <div className="space-y-4">
        {/* Client */}
        <div className="space-y-1">
          <Label className="text-xs">Cliente *</Label>
          {isEditing ? (
            <Input value={editingTenant?.client_name ?? ""} disabled />
          ) : (
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Selecione um cliente..." /></SelectTrigger>
              <SelectContent>
                {availableClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Plan selector */}
        <div className="space-y-1">
          <Label className="text-xs">Plano *</Label>
          <Select value={selectedPlanId} onValueChange={handlePlanSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um plano..." />
            </SelectTrigger>
            <SelectContent>
              {activePlans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {fmtCurrency(p.monthly_value)} · {p.max_users} usuário{p.max_users !== 1 ? "s" : ""} · {BILLING_CYCLE_LABELS[p.billing_cycle]}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_PLAN_ID}>
                Personalizado — definir manualmente
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Renewal info badge */}
        {renewalInfo && (
          <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {renewalInfo} O cliente mantém acesso até o fim do período contratado mesmo após solicitar encerramento.
          </div>
        )}

        {/* Plan name — editable only for custom */}
        <div className="space-y-1">
          <Label className="text-xs">Nome do Plano</Label>
          <Input
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="Ex: Starter, Pro..."
            disabled={!!selectedPlanId && !isCustom}
          />
        </div>

        {/* Plan value — editable only for custom */}
        <div className="space-y-1">
          <Label className="text-xs">Valor {selectedPlan ? `(${BILLING_CYCLE_LABELS[selectedPlan.billing_cycle]})` : "Mensal"} (R$)</Label>
          <Input
            type="number" min={0} step={0.01}
            value={planValue}
            onChange={(e) => setPlanValue(e.target.value)}
            placeholder="0,00"
            disabled={!!selectedPlanId && !isCustom}
          />
          {planValueNum === 0 && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800 mt-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Acesso gratuito — sem lançamentos financeiros e sem bloqueio por inadimplência
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Max users — editable only for custom */}
          <div className="space-y-1">
            <Label className="text-xs">Máx. Usuários (1–100) *</Label>
            <Input
              type="number" min={1} max={100}
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
              placeholder="1"
              disabled={!!selectedPlanId && !isCustom}
            />
            {maxUsersError && <p className="text-xs text-red-500">{maxUsersError}</p>}
            <p className="text-[10px] text-muted-foreground">Inclui o usuário principal.</p>
          </div>

          {/* Due day */}
          <div className="space-y-1">
            <Label className="text-xs">Dia de Vencimento (1–28)</Label>
            <Input
              type="number" min={1} max={28}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="10"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Contract start */}
          <div className="space-y-1">
            <Label className="text-xs">Início do Contrato *</Label>
            <Input
              type="date"
              value={contractStart}
              onChange={(e) => setContractStart(e.target.value)}
            />
          </div>

          {/* Contract end — auto-filled for plans, editable for custom */}
          <div className="space-y-1">
            <Label className="text-xs">
              Fim do 1º Período
              {selectedPlan && !isCustom && (
                <span className="text-muted-foreground ml-1">(calculado automaticamente)</span>
              )}
            </Label>
            <Input
              type="date"
              value={contractEnd}
              onChange={(e) => setContractEnd(e.target.value)}
              disabled={!!selectedPlanId && !isCustom}
            />
            {selectedPlan && !isCustom && contractEnd && (
              <p className="text-[10px] text-muted-foreground">
                Renova por mais {BILLING_CYCLE_LABELS[selectedPlan.billing_cycle].toLowerCase()} automaticamente.
              </p>
            )}
          </div>
        </div>

        {/* Primary user email */}
        <div className="space-y-1">
          <Label className="text-xs">E-mail do Usuário Principal *</Label>
          <Input
            type="email"
            value={primaryUserEmail}
            onChange={(e) => { setPrimaryUserEmail(e.target.value); setPrimaryEmailFromClient(false); }}
            placeholder="usuario@empresa.com"
            required
          />
          {primaryEmailFromClient && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Preenchido automaticamente pelo e-mail do cadastro do cliente. Você pode alterar se necessário.
            </p>
          )}
        </div>

        {/* Send credentials */}
        {!isEditing && primaryUserEmail && (
          <div className="flex items-start gap-3 rounded-md bg-blue-50 border border-blue-200 px-3 py-3">
            <Checkbox
              id="send_credentials"
              checked={sendCredentials}
              onCheckedChange={(v) => setSendCredentials(!!v)}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="send_credentials" className="text-sm font-medium text-blue-800 cursor-pointer flex items-center gap-1">
                <Send className="h-3.5 w-3.5" />
                Enviar credenciais de acesso por e-mail
              </label>
              <p className="text-[10px] text-blue-600 mt-0.5">
                Envia e-mail para {primaryUserEmail} com a URL e informações do plano.
              </p>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1">
          <Label className="text-xs">Observações (opcional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações sobre o cliente..."
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSaving || !!maxUsersError || !selectedPlanId}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {isEditing ? "Salvar Alterações" : "Criar Cliente"}
          </Button>
        </div>
      </div>

      {/* Contract conflict dialog */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contrato CRM Ativo Encontrado</DialogTitle>
            <DialogDescription>
              Este cliente já possui um contrato C8 Control CRM ativo. Como deseja prosseguir?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setContractDialogOpen(false); doSave(); }} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Renovar contrato existente
            </Button>
            <Button onClick={() => { setContractDialogOpen(false); doSave(); }} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Criar novo contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
