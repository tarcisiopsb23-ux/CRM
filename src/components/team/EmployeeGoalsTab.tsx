import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useGoals, type GoalSource, type GoalIndicator } from "@/hooks/useGoalsCRUD";
import type { ProfileRow } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  profile: ProfileRow;
}

type IndicatorOption = { label: string; value: string; indicator: GoalIndicator; unit: "R$" | "Qtd" };

const INDICATORS: IndicatorOption[] = [
  // Vendas / CRM
  { label: "Número de contatos (Leads)", value: "numero_contatos", indicator: "numero_contatos", unit: "Qtd" },
  { label: "Efetivações de contrato", value: "efetivacoes", indicator: "efetivacoes", unit: "Qtd" },
  // Financeiro
  { label: "Faturamento (recebido)", value: "faturamento", indicator: "faturamento", unit: "R$" },
  { label: "Inadimplência (vencidos)", value: "inadimplencia", indicator: "inadimplencia", unit: "R$" },
  // Clientes / Projetos
  { label: "Novos clientes", value: "clientes_novos", indicator: "outro", unit: "Qtd" },
  { label: "Projetos iniciados", value: "projetos_iniciados", indicator: "outro", unit: "Qtd" },
  { label: "Projetos concluídos", value: "projetos_concluidos", indicator: "outro", unit: "Qtd" },
  // Campanhas
  { label: "Investimento em campanhas (gasto)", value: "marketing_gasto", indicator: "outro", unit: "R$" },
  // RH / Operacional
  { label: "Treinamentos concluídos", value: "treinamentos_concluidos", indicator: "outro", unit: "Qtd" },
  { label: "Presença (%)", value: "presenca_pct", indicator: "outro", unit: "Qtd" },
  // Comissão / Bônus
  { label: "Meta atingida (%)", value: "meta_atingida_pct", indicator: "outro", unit: "Qtd" },
  { label: "Outro", value: "outro", indicator: "outro", unit: "Qtd" },
];

const EMPTY_FORM = {
  title: "",
  target_value: "",
  period_start: "",
  period_end: "",
  source: "manual" as GoalSource,
  indicator_value: "efetivacoes",
};

export function EmployeeGoalsTab({ profile }: Props) {
  const orgId = useOrganization();
  const { profile: currentProfile } = useAuth();
  const isAdminOrOwner = currentProfile?.role === "admin" || currentProfile?.role === "owner";
  const isManager = currentProfile?.role === "manager";

  const { data: allGoals = [], isLoading, create } = useGoals(orgId);

  // Filtrar goals do colaborador (assigned_to) ou da equipe dele
  const goals = allGoals.filter(
    (g) => g.assigned_to === profile.id || (g.team_id && g.source !== "manual")
  );

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const handleCreate = async () => {
    if (!form.title || !form.target_value || !form.period_start || !form.period_end) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (form.period_end < form.period_start) {
      toast.error("Data fim não pode ser anterior à data início");
      return;
    }

    const opt = INDICATORS.find((i) => i.value === form.indicator_value) ?? INDICATORS[0];

    await create.mutateAsync({
      title: form.title,
      target_value: Number(form.target_value),
      current_value: 0,
      period: "mensal",
      period_start: form.period_start,
      period_end: form.period_end,
      source: form.source,
      indicator: opt.indicator,
      unit: opt.unit,
      assigned_to: form.source === "manual" ? profile.id : null,
      team_id: form.source !== "manual" ? (profile as any).team_id ?? null : null,
      metadata: { indicator_key: opt.value, indicator_label: opt.label },
    });
    toast.success("Meta criada");
    setOpen(false);
    setForm(EMPTY_FORM);
  };

  const canCreate = isAdminOrOwner || isManager;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Metas</p>
        {canCreate && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Meta
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : goals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma meta vinculada</p>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const pct = g.target_value > 0 ? Math.min((g.current_value / g.target_value) * 100, 100) : 0;
            const meta = (g.metadata ?? {}) as Record<string, unknown>;
            const indicatorLabel = typeof meta.indicator_label === "string"
              ? meta.indicator_label
              : INDICATORS.find((i) => i.indicator === g.indicator)?.label ?? g.indicator ?? "—";
            return (
              <div key={g.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{g.title}</span>
                  <Badge variant="secondary" className="text-xs">
                    {g.source === "manual" ? "Individual" : g.source === "team_sales" ? "Equipe" : "Diretoria"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{indicatorLabel}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{g.current_value} / {g.target_value} {g.unit ?? ""}</span>
                  <span>·</span>
                  <span>{pct.toFixed(1)}% atingido</span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Título</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Indicador</Label>
              <Select value={form.indicator_value} onValueChange={(v) => setForm((f) => ({ ...f, indicator_value: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDICATORS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Valor Alvo</Label>
              {INDICATORS.find((i) => i.value === form.indicator_value)?.unit === "R$" ? (
                <CurrencyInput value={form.target_value}
                  onChange={(v) => setForm((f) => ({ ...f, target_value: v }))} />
              ) : (
                <Input type="number" min={0} value={form.target_value}
                  onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))} />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Início</Label>
                <Input type="date" value={form.period_start}
                  onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Fim</Label>
                <Input type="date" value={form.period_end}
                  onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))} />
              </div>
            </div>
            {isAdminOrOwner && (
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v as GoalSource }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Individual</SelectItem>
                    <SelectItem value="team_sales">Equipe (vendas)</SelectItem>
                    <SelectItem value="board_revenue">Diretoria (faturamento)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
