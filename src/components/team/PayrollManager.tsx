import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import type { TablesInsert, TablesUpdate } from "@/types/supabase";
import { useCreatePayroll, useDeletePayroll, usePayrolls, useUpdatePayroll, type PayrollEntry, type PayrollUpsertInput } from "@/hooks/usePayrolls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Calendar, Eye, Pencil, Trash2, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PayrollManager() {
  const organizationId = useOrganization();
  const qc = useQueryClient();
  const payrollsQuery = usePayrolls(organizationId);
  const createPayroll = useCreatePayroll(organizationId);
  const updatePayroll = useUpdatePayroll(organizationId);
  const deletePayroll = useDeletePayroll(organizationId);
  const { data: profiles = [] } = useProfiles(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollEntry | null>(null);
  const [viewing, setViewing] = useState<PayrollEntry | null>(null);

  // Form states
  const [profileId, setProfileId] = useState("");
  const [referenceDate, setReferenceDate] = useState(format(new Date(), "yyyy-MM-01"));
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [baseSalary, setBaseSalary] = useState("0");
  const [commission, setCommission] = useState("0");
  const [bonus, setBonus] = useState("0");
  const [overtime, setOvertime] = useState("0");
  const [discounts, setDiscounts] = useState("0");
  const [payrollStatus, setPayrollStatus] = useState<"pending" | "paid">("pending");

  const [filterPayMonth, setFilterPayMonth] = useState<string>("all"); // yyyy-MM
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "paid">("all");
  const payrolls = useMemo(() => payrollsQuery.data ?? [], [payrollsQuery.data]);
  const isLoading = payrollsQuery.isLoading;

  const totalValue =
    Number(baseSalary) +
    Number(commission) +
    Number(bonus) +
    Number(overtime) -
    Number(discounts);

  const paymentMonthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of payrolls) {
      const d = p.payment_date ? String(p.payment_date) : "";
      if (d.length >= 7) set.add(d.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [payrolls]);

  const filteredPayrolls = useMemo(() => {
    const nameNeedle = filterName.trim().toLowerCase();
    return payrolls.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterPayMonth !== "all") {
        const m = p.payment_date ? String(p.payment_date).slice(0, 7) : "";
        if (m !== filterPayMonth) return false;
      }
      if (nameNeedle) {
        const fullName = (p.profiles?.full_name ?? "").toLowerCase();
        if (!fullName.includes(nameNeedle)) return false;
      }
      return true;
    });
  }, [payrolls, filterName, filterPayMonth, filterStatus]);

  const openNew = () => {
    setEditing(null);
    setProfileId("");
    setReferenceDate(format(new Date(), "yyyy-MM-01"));
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setBaseSalary("0");
    setCommission("0");
    setBonus("0");
    setOvertime("0");
    setDiscounts("0");
    setPayrollStatus("pending");
    setModalOpen(true);
  };

  const openEdit = (p: PayrollEntry) => {
    setEditing(p);
    setProfileId(p.profile_id);
    setReferenceDate(p.reference_date);
    setPaymentDate(p.payment_date ?? "");
    setBaseSalary(String(p.base_salary ?? 0));
    setCommission(String(p.commission ?? 0));
    setBonus(String(p.bonus ?? 0));
    setOvertime(String(p.overtime ?? 0));
    setDiscounts(String(p.discounts ?? 0));
    setPayrollStatus(p.status ?? "pending");
    setModalOpen(true);
  };


  const save = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Sem org");
      const profileName = profiles.find((p) => p.id === profileId)?.full_name ?? "—";
      const payload: PayrollUpsertInput = {
        organization_id: organizationId,
        profile_id: profileId,
        reference_date: referenceDate,
        payment_date: paymentDate || null,
        base_salary: Number(baseSalary),
        commission: Number(commission),
        bonus: Number(bonus),
        overtime: Number(overtime),
        discounts: Number(discounts),
        status: payrollStatus,
      };

      if (editing) {
        await updatePayroll.mutateAsync({ id: editing.id, payload });
        return;
      }

      await createPayroll.mutateAsync(payload);
    },
    onSuccess: () => {
      setModalOpen(false);
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Sem org");
      await deletePayroll.mutateAsync(id);
    },
  });



  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Folha de Pagamento</h2>
          <p className="text-sm text-muted-foreground">Gerencie salários, comissões e bônus da equipe.</p>
        </div>
        <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setEditing(null); setModalOpen(o); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={openNew}>
              <Plus className="h-4 w-4" /> Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Pagamento" : "Lançar Pagamento"}</DialogTitle>
              <DialogDescription>
                Preencha os detalhes do pagamento para o colaborador.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2">
                <Label>Colaborador</Label>
                <Select value={profileId} onValueChange={setProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Mês de Referência</Label>
                <div className="relative">
                    <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        type="date" 
                        className="pl-9"
                        value={referenceDate} 
                        onChange={(e) => setReferenceDate(e.target.value)} 
                    />
                </div>
              </div>

              <div>
                <Label>Data do Pagamento</Label>
                <div className="relative">
                    <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        type="date" 
                        className="pl-9"
                        value={paymentDate} 
                        onChange={(e) => setPaymentDate(e.target.value)} 
                    />
                </div>
              </div>

              <div className="col-span-2">
                <Label>Status</Label>
                <Select value={payrollStatus} onValueChange={(v) => setPayrollStatus(v as "pending" | "paid")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 border-t my-2"></div>

              <div>
                <Label>Salário Base (R$)</Label>
                <CurrencyInput value={baseSalary} onChange={(v) => setBaseSalary(v)} />
              </div>

              <div>
                <Label>Comissão (R$)</Label>
                <CurrencyInput value={commission} onChange={(v) => setCommission(v)} />
              </div>

              <div>
                <Label>Bônus / Premiação (R$)</Label>
                <CurrencyInput value={bonus} onChange={(v) => setBonus(v)} />
              </div>

              <div>
                <Label>Hora Extra (R$)</Label>
                <CurrencyInput value={overtime} onChange={(v) => setOvertime(v)} />
              </div>

              <div className="col-span-2">
                <Label className="text-red-500">Descontos (R$)</Label>
                <CurrencyInput className="border-red-200 focus-visible:ring-red-500" value={discounts} onChange={(v) => setDiscounts(v)} />
              </div>

              <div className="col-span-2 bg-muted p-4 rounded-lg flex justify-between items-center mt-2">
                <span className="font-medium text-sm text-muted-foreground">Valor Líquido a Pagar</span>
                <span className="text-xl font-bold text-emerald-600">{fmt(totalValue)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !profileId}>
                {save.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lançamentos</CardTitle>
          <CardDescription>Filtre por mês do pagamento, nome e status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Mês do pagamento</Label>
              <Select value={filterPayMonth} onValueChange={setFilterPayMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {paymentMonthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {format(new Date(`${m}-01`), "MMMM yyyy", { locale: ptBR })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Buscar colaborador..." />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={filterStatus}
                onValueChange={(v) =>
                  setFilterStatus(v === "all" || v === "pending" || v === "paid" ? v : "all")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Ref.</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Salário</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Extras</TableHead>
                <TableHead className="text-red-500">Desc.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center">Carregando...</TableCell>
                </TableRow>
              ) : filteredPayrolls.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">Nenhum pagamento encontrado.</TableCell>
                </TableRow>
              ) : (
                filteredPayrolls.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.profiles?.full_name || "—"}</TableCell>
                    <TableCell>{format(new Date(p.reference_date), "MMM/yy", { locale: ptBR })}</TableCell>
                    <TableCell>{p.payment_date ? format(new Date(p.payment_date), "dd/MM/yy") : "—"}</TableCell>
                    <TableCell>{fmt(p.base_salary)}</TableCell>
                    <TableCell className="text-blue-600">{fmt(p.commission)}</TableCell>
                    <TableCell className="text-emerald-600">{fmt(p.bonus + p.overtime)}</TableCell>
                    <TableCell className="text-red-500">-{fmt(p.discounts)}</TableCell>
                    <TableCell className="text-right font-bold">{fmt(p.total_value)}</TableCell>
                    <TableCell>
                      <span className={p.status === "paid" ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                        {p.status === "paid" ? "Pago" : "Pendente"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setViewing(p)} aria-label="Visualizar">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm("Excluir este lançamento?")) remove.mutate(p.id);
                          }}
                          disabled={remove.isPending}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {viewing ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <CardTitle className="text-base">Visualizar lançamento</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { openEdit(viewing); setViewing(null); }}>
                Alterar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setViewing(null)}>
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <span className="text-muted-foreground">Colaborador</span>
                <div className="font-medium">{viewing.profiles?.full_name ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Referência</span>
                <div className="font-medium">{format(new Date(viewing.reference_date), "MMMM yyyy", { locale: ptBR })}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Pagamento</span>
                <div className="font-medium">{viewing.payment_date ? format(new Date(viewing.payment_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Salário base</span>
                <div className="font-medium">{fmt(viewing.base_salary)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Comissão</span>
                <div className="font-medium">{fmt(viewing.commission)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Bônus</span>
                <div className="font-medium">{fmt(viewing.bonus)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Hora extra</span>
                <div className="font-medium">{fmt(viewing.overtime)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Descontos</span>
                <div className="font-medium text-destructive">-{fmt(viewing.discounts)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Total</span>
                <div className="font-medium">{fmt(viewing.total_value)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <div className="font-medium">{viewing.status === "paid" ? "Pago" : "Pendente"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
