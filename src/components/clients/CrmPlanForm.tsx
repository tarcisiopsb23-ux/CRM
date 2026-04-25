import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setDate, addMonths, isBefore, startOfDay, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useCrmClientPlan } from "@/hooks/useCrmClientPlan";
import { CRM_MODULES } from "@/lib/crmModules";
import { supabase } from "@/lib/supabase";

interface CrmPlanFormProps {
  clientId: string;
  clientName: string;
  organizationId: string;
}

const STATUS_BADGE: Record<string, string> = {
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

export function CrmPlanForm({ clientId, clientName, organizationId }: CrmPlanFormProps) {
  const { data: plan, isLoading, upsertPlan } = useCrmClientPlan(clientId);

  const [planValue, setPlanValue] = useState(0);
  const [modules, setModules] = useState<string[]>([]);
  const [maxUsers, setMaxUsers] = useState(1);
  const [dueDay, setDueDay] = useState(10);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  // Inicializar com dados existentes
  useEffect(() => {
    if (plan) {
      setPlanValue(plan.plan_value ?? 0);
      setModules(plan.modules ?? []);
      setMaxUsers(plan.max_users ?? 1);
      setDueDay(plan.due_day ?? 10);
    }
  }, [plan]);

  const valueChanged = plan ? planValue !== plan.plan_value : planValue !== 0;

  const handleSave = () => {
    if (valueChanged && planValue > 0) {
      setConfirmOpen(true);
    } else {
      doSave(false);
    }
  };

  const doSave = async (generatePayment: boolean) => {
    setIsSaving(true);
    setConfirmOpen(false);
    try {
      await upsertPlan.mutateAsync({
        organization_id: organizationId,
        client_id: clientId,
        plan_value: planValue,
        modules,
        max_users: maxUsers,
        due_day: dueDay,
      });

      if (generatePayment) {
        const { error } = await supabase.from("payments").insert({
          organization_id: organizationId,
          client_id: clientId,
          description: `Mensalidade C8 Control — ${clientName}`,
          value: planValue,
          due_date: calcNextDueDate(dueDay),
          status: "pendente",
        });
        if (error) throw error;
        toast.success("Plano salvo e lançamento financeiro gerado!");
      } else {
        toast.success("Plano salvo com sucesso!");
      }
    } catch {
      toast.error("Erro ao salvar plano.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleModule = (id: string) => {
    setModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando plano...
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-3">
            Configuração do Plano
            {plan?.subscription_status && (
              <Badge className={STATUS_BADGE[plan.subscription_status] ?? "bg-muted text-muted-foreground"}>
                {plan.subscription_status}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Valor do plano */}
          <div className="space-y-1">
            <Label>Valor do Plano (R$)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={planValue}
              onChange={e => setPlanValue(parseFloat(e.target.value) || 0)}
              placeholder="0,00"
            />
          </div>

          {/* Módulos */}
          <div className="space-y-2">
            <Label>Módulos Disponibilizados</Label>
            <div className="grid grid-cols-2 gap-2">
              {CRM_MODULES.map(mod => (
                <div key={mod.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`mod-${mod.id}`}
                    checked={modules.includes(mod.id)}
                    onCheckedChange={() => toggleModule(mod.id)}
                  />
                  <Label htmlFor={`mod-${mod.id}`} className="font-normal cursor-pointer">
                    {mod.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Máx. usuários e dia de vencimento */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Máx. Usuários (1–50)</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxUsers}
                onChange={e => setMaxUsers(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
              />
            </div>
            <div className="space-y-1">
              <Label>Dia de Vencimento (1–28)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={dueDay}
                onChange={e => setDueDay(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar Plano
          </Button>
        </CardContent>
      </Card>

      {/* Dialog de confirmação de lançamento financeiro */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Lançamento Financeiro?</DialogTitle>
            <DialogDescription>
              O valor do plano foi alterado para{" "}
              <strong>
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(planValue)}
              </strong>
              . Deseja gerar um lançamento de mensalidade para este cliente?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => doSave(false)}>
              Não, apenas salvar
            </Button>
            <Button onClick={() => doSave(true)}>
              Sim, gerar lançamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
