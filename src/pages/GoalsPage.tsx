import { useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useGoals, type GoalIndicator, type GoalPeriod } from "@/hooks/useGoalsCRUD";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Target } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const INDICATORS: { value: GoalIndicator; label: string }[] = [
  { value: "inadimplencia", label: "Inadimplência" },
  { value: "efetivacoes", label: "Efetivações de contrato" },
  { value: "faturamento", label: "Faturamento" },
  { value: "numero_contatos", label: "Número de contatos" },
  { value: "outro", label: "Outro" },
];

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "anual", label: "Anual" },
];

export default function GoalsPage() {
  const organizationId = useOrganization();
  const { data: goals = [], isLoading, create } = useGoals(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    indicator: "faturamento" as GoalIndicator,
    period: "mensal" as GoalPeriod,
    target_value: "",
    period_start: "",
    period_end: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = form.period_start || new Date().toISOString().slice(0, 10);
    const end = form.period_end || start;
    try {
      await create.mutateAsync({
        title: form.title,
        indicator: form.indicator,
        period: form.period,
        target_value: Number(form.target_value) || 0,
        period_start: start,
        period_end: end,
        current_value: 0,
        unit: "R$",
      });
      setModalOpen(false);
      setForm({ title: "", indicator: "faturamento", period: "mensal", target_value: "", period_start: "", period_end: "" });
    } catch (err) {
      console.error(err);
    }
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  const getIndicatorLabel = (v: string | null) => INDICATORS.find((i) => i.value === v)?.label ?? v;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Metas</h1>
          <p className="text-sm text-muted-foreground">
            Metas individuais, por equipe e da agência. Indicadores: inadimplência, efetivações, faturamento, contatos.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova meta
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de metas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : goals.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma meta cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {goals.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <Target className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{g.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {getIndicatorLabel(g.indicator)} • {g.period} • {format(new Date(g.period_start), "dd/MM/yyyy", { locale: ptBR })} – {format(new Date(g.period_end), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{g.current_value} / {g.target_value} {g.unit ?? ""}</p>
                    <p className="text-xs text-muted-foreground">{Math.round((g.current_value / g.target_value) * 100)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova meta</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Meta de faturamento"
                required
              />
            </div>
            <div>
              <Label>Indicador</Label>
              <Select value={form.indicator} onValueChange={(v) => setForm({ ...form, indicator: v as GoalIndicator })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDICATORS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Período</Label>
              <Select value={form.period} onValueChange={(v) => setForm({ ...form, period: v as GoalPeriod })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor meta *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.target_value}
                onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                placeholder="0"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data início</Label>
                <Input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                />
              </div>
              <div>
                <Label>Data fim</Label>
                <Input
                  type="date"
                  value={form.period_end}
                  onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
