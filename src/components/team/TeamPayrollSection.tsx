import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useSupplierExpenses } from "@/hooks/useFinancial";
import { useSuppliers } from "@/hooks/useSuppliers";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type ExtraType = "commission" | "bonus" | "overtime";

export function TeamPayrollSection() {
  const orgId = useOrganization();
  const { data: profiles = [] } = useProfiles(orgId);
  const { data: teams = [] } = useTeams(orgId);
  const { data: members = [] } = useTeamMembers(orgId);
  const expenses = useSupplierExpenses(orgId);
  const suppliers = useSuppliers(orgId);

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // yyyy-MM
  const [filterTeam, setFilterTeam] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [filterProfile, setFilterProfile] = useState("all");

  const range = useMemo(() => {
    const from = startOfMonth(parseISO(`${month}-01`));
    const to = endOfMonth(from);
    return { from, to };
  }, [month]);

  const teamNameByProfile = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      const t = teams.find((x) => x.id === m.team_id);
      if (t) map.set(m.profile_id, t.name);
    }
    return map;
  }, [members, teams]);

  const byProfile = useMemo(() => {
    const rows = profiles
      .filter((p) => filterRole === "all" || p.role === filterRole)
      .filter((p) => filterTeam === "all" || teamNameByProfile.get(p.id) === teams.find((t) => t.id === filterTeam)?.name)
      .filter((p) => filterProfile === "all" || p.id === filterProfile)
      .map((p) => {
        const meta = (p.metadata ?? {}) as Record<string, unknown>;
        const base = Number((meta.base_salary as number | string | undefined) ?? 0);
        const exps = (expenses.data ?? []).filter((e) => {
          const m = (e.metadata ?? {}) as Record<string, unknown>;
          const isPayroll = m.kind === "payroll" && m.profile_id === p.id;
          const inMonth = isWithinInterval(new Date(e.due_date), { start: range.from, end: range.to });
          return isPayroll && inMonth;
        });
        const sumByType = (type: ExtraType) =>
          exps
            .filter((e) => ((e.metadata ?? {}) as Record<string, unknown>).type === type)
            .reduce((s, r) => s + Number(r.value ?? 0), 0);
        const commission = sumByType("commission");
        const bonus = sumByType("bonus");
        const overtime = sumByType("overtime");
        const total = base + commission + bonus + overtime;
        return {
          id: p.id,
          name: p.full_name,
          role: p.role,
          team: teamNameByProfile.get(p.id) ?? "",
          base,
          commission,
          bonus,
          overtime,
          total,
        };
      });
    return rows;
  }, [profiles, expenses.data, range, filterTeam, filterRole, filterProfile, teamNameByProfile, teams]);

  const [extraOpen, setExtraOpen] = useState(false);
  const [extraForm, setExtraForm] = useState<{ profile_id: string; supplier_id: string; type: ExtraType; description: string; value: string; date: string }>({
    profile_id: "",
    supplier_id: "",
    type: "commission",
    description: "",
    value: "",
    date: new Date().toISOString().slice(0, 10),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label>Mês</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div>
            <Label>Equipe</Label>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger><SelectValue placeholder="Equipe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Função</Label>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger><SelectValue placeholder="Função" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Gestor</SelectItem>
                <SelectItem value="member">Membro</SelectItem>
                <SelectItem value="viewer">Visualizador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Colaborador</Label>
            <Select value={filterProfile} onValueChange={setFilterProfile}>
              <SelectTrigger><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => setExtraOpen(true)}>Adicionar comissão/bonificação</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Bônus</TableHead>
                <TableHead className="text-right">Hora extra</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byProfile.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.role}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.team}</TableCell>
                  <TableCell className="text-right">{r.base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell className="text-right">{r.commission.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell className="text-right">{r.bonus.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell className="text-right">{r.overtime.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell className="text-right font-medium">{r.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                </TableRow>
              ))}
              {byProfile.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sem colaboradores para os filtros</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={extraOpen} onOpenChange={setExtraOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar extra (comissão/bonificação)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Colaborador</Label>
              <Select value={extraForm.profile_id} onValueChange={(v) => setExtraForm({ ...extraForm, profile_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={extraForm.type} onValueChange={(v) => setExtraForm({ ...extraForm, type: v as ExtraType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="commission">Comissão</SelectItem>
                    <SelectItem value="bonus">Bônus</SelectItem>
                    <SelectItem value="overtime">Hora extra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Select value={extraForm.supplier_id} onValueChange={(v) => setExtraForm({ ...extraForm, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={extraForm.description} onChange={(e) => setExtraForm({ ...extraForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor</Label>
                <CurrencyInput value={extraForm.value} onChange={(v) => setExtraForm({ ...extraForm, value: v })} />
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={extraForm.date} onChange={(e) => setExtraForm({ ...extraForm, date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraOpen(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!extraForm.profile_id || !extraForm.supplier_id || !extraForm.value) return;
                await expenses.create.mutateAsync({
                  supplier_id: extraForm.supplier_id,
                  description: extraForm.description || `${extraForm.type} - ${profiles.find((p) => p.id === extraForm.profile_id)?.full_name ?? ""}`,
                  value: Number(extraForm.value),
                  due_date: extraForm.date,
                  metadata: { kind: "payroll", type: extraForm.type, profile_id: extraForm.profile_id },
                });
                setExtraOpen(false);
              }}
              disabled={expenses.create.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
