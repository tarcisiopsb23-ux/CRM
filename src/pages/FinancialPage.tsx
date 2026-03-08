import { useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { usePayments, useSupplierExpenses } from "@/hooks/useFinancial";
import { useClients } from "@/hooks/useClients";
import { useSuppliers } from "@/hooks/useSuppliers";
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
import { Loader2, Check, Plus, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function FinancialPage() {
  const organizationId = useOrganization();
  const payments = usePayments(organizationId);
  const expenses = useSupplierExpenses(organizationId);
  const clientsQuery = useClients(organizationId);
  const suppliersQuery = useSuppliers(organizationId);
  const { data: clients = [] } = clientsQuery;
  const { data: suppliers = [] } = suppliersQuery;
  const [modalReceber, setModalReceber] = useState(false);
  const [modalPagar, setModalPagar] = useState(false);
  const [formReceber, setFormReceber] = useState({ client_id: "", description: "", value: "", due_date: "" });
  const [formPagar, setFormPagar] = useState({ supplier_id: "", description: "", value: "", due_date: "" });
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: "", company: "" });
  const [newSupplierForm, setNewSupplierForm] = useState({ name: "" });

  const receivables = (payments.data ?? []).filter((p) => p.status !== "pago" && p.status !== "cancelado");
  const payables = (expenses.data ?? []).filter((e) => e.status !== "pago" && e.status !== "cancelado");

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const handleCreateReceber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReceber.client_id || !formReceber.description || !formReceber.value || !formReceber.due_date) return;
    try {
      await payments.create.mutateAsync({
        client_id: formReceber.client_id,
        description: formReceber.description,
        value: Number(formReceber.value.replace(",", ".")),
        due_date: formReceber.due_date,
      });
      setModalReceber(false);
      setFormReceber({ client_id: "", description: "", value: "", due_date: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar conta a receber");
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = (newClientForm.company || newClientForm.name).trim();
    if (!name) return;
    try {
      const c = await clientsQuery.create.mutateAsync({ name, company: newClientForm.company || newClientForm.name });
      setFormReceber((f) => ({ ...f, client_id: c.id }));
      setShowNewClient(false);
      setNewClientForm({ name: "", company: "" });
      toast.success("Cliente cadastrado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar cliente");
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSupplierForm.name.trim();
    if (!name) return;
    try {
      const s = await suppliersQuery.create.mutateAsync({ name });
      setFormPagar((f) => ({ ...f, supplier_id: s.id }));
      setShowNewSupplier(false);
      setNewSupplierForm({ name: "" });
      toast.success("Fornecedor cadastrado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar fornecedor");
    }
  };

  const handleCreatePagar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPagar.supplier_id || !formPagar.description || !formPagar.value || !formPagar.due_date) return;
    try {
      await expenses.create.mutateAsync({
        supplier_id: formPagar.supplier_id,
        description: formPagar.description,
        value: Number(formPagar.value.replace(",", ".")),
        due_date: formPagar.due_date,
      });
      setModalPagar(false);
      setFormPagar({ supplier_id: "", description: "", value: "", due_date: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar conta a pagar");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Contas a pagar e contas a receber. Clique para registrar pagamento ou recebimento.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setModalReceber(true)}>
            <Plus className="h-4 w-4 mr-2" /> Conta a receber
          </Button>
          <Button variant="outline" onClick={() => setModalPagar(true)}>
            <Plus className="h-4 w-4 mr-2" /> Conta a pagar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas a receber</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pagamentos futuros pendentes
            </p>
          </CardHeader>
          <CardContent>
            {payments.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : receivables.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma conta a receber pendente.</p>
            ) : (
              <div className="space-y-2">
                {receivables.map((p) => {
                  const clientName = (p as { clients?: { name: string; company: string } | null }).clients?.company
                    ?? (p as { clients?: { name: string; company: string } | null }).clients?.name
                    ?? "-";
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{clientName}</p>
                        <p className="text-sm text-muted-foreground">{p.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(p.due_date), "dd/MM/yyyy", { locale: ptBR })} • {formatCurrency(p.value)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => payments.registerPayment.mutate(p.id)}
                        disabled={payments.registerPayment.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Registrar
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas a pagar</CardTitle>
            <p className="text-sm text-muted-foreground">
              Despesas futuras pendentes
            </p>
          </CardHeader>
          <CardContent>
            {expenses.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : payables.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma conta a pagar pendente.</p>
            ) : (
              <div className="space-y-2">
                {payables.map((e) => {
                  const supplierName = (e as { suppliers?: { name: string } | null }).suppliers?.name ?? "-";
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{supplierName}</p>
                        <p className="text-sm text-muted-foreground">{e.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(e.due_date), "dd/MM/yyyy", { locale: ptBR })} • {formatCurrency(e.value)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => expenses.registerPayment.mutate(e.id)}
                        disabled={expenses.registerPayment.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Registrar
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Conta a receber */}
      <Dialog open={modalReceber} onOpenChange={setModalReceber}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conta a receber</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateReceber} className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>Cliente *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowNewClient(!showNewClient)}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  {showNewClient ? "Cancelar" : "Cadastrar novo"}
                </Button>
              </div>
              {showNewClient ? (
                <form onSubmit={handleCreateClient} className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <Input
                    placeholder="Nome ou empresa *"
                    value={newClientForm.name || newClientForm.company}
                    onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value, company: e.target.value })}
                    required
                  />
                  <Button type="submit" size="sm" disabled={clientsQuery.create.isPending}>
                    {clientsQuery.create.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Cadastrar
                  </Button>
                </form>
              ) : (
                <>
                  <Select
                    value={formReceber.client_id}
                    onValueChange={(v) => setFormReceber({ ...formReceber, client_id: v })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.company || c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {clients.length === 0 && !showNewClient && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Nenhum cliente. Clique em &quot;Cadastrar novo&quot; para criar.
                    </p>
                  )}
                </>
              )}
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input
                value={formReceber.description}
                onChange={(e) => setFormReceber({ ...formReceber, description: e.target.value })}
                placeholder="Ex: Mensalidade jan/2025"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="text"
                  value={formReceber.value}
                  onChange={(e) => setFormReceber({ ...formReceber, value: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input
                  type="date"
                  value={formReceber.due_date}
                  onChange={(e) => setFormReceber({ ...formReceber, due_date: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalReceber(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={payments.create.isPending || !formReceber.client_id || showNewClient}>
                {payments.create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Conta a pagar */}
      <Dialog open={modalPagar} onOpenChange={setModalPagar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conta a pagar</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePagar} className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>Fornecedor *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowNewSupplier(!showNewSupplier)}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  {showNewSupplier ? "Cancelar" : "Cadastrar novo"}
                </Button>
              </div>
              {showNewSupplier ? (
                <form onSubmit={handleCreateSupplier} className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <Input
                    placeholder="Nome do fornecedor *"
                    value={newSupplierForm.name}
                    onChange={(e) => setNewSupplierForm({ name: e.target.value })}
                    required
                  />
                  <Button type="submit" size="sm" disabled={suppliersQuery.create.isPending}>
                    {suppliersQuery.create.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Cadastrar
                  </Button>
                </form>
              ) : (
                <>
                  <Select
                    value={formPagar.supplier_id}
                    onValueChange={(v) => setFormPagar({ ...formPagar, supplier_id: v })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {suppliers.length === 0 && !showNewSupplier && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Nenhum fornecedor. Clique em &quot;Cadastrar novo&quot; para criar.
                    </p>
                  )}
                </>
              )}
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input
                value={formPagar.description}
                onChange={(e) => setFormPagar({ ...formPagar, description: e.target.value })}
                placeholder="Ex: Compra de material"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="text"
                  value={formPagar.value}
                  onChange={(e) => setFormPagar({ ...formPagar, value: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input
                  type="date"
                  value={formPagar.due_date}
                  onChange={(e) => setFormPagar({ ...formPagar, due_date: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalPagar(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={expenses.create.isPending || !formPagar.supplier_id || showNewSupplier}>
                {expenses.create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
