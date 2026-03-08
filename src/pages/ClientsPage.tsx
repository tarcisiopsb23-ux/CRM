import { useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, UserCheck, Loader2 } from "lucide-react";
import type { Client } from "@/types/crm";

const REGISTRATION_TYPES = [
  { value: "prospeccao", label: "Prospecção" },
  { value: "cliente", label: "Cliente" },
];

export default function ClientsPage() {
  const organizationId = useOrganization();
  const { data: clients = [], isLoading, error: fetchError, create, update, remove } = useClients(organizationId);
  const { leads } = useLeadsKanban(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [fromLeadId, setFromLeadId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Partial<Client>>({
    name: "",
    company: "",
    document: "",
    email: "",
    phone: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    niche: "",
    origin: "",
    registration_type: "cliente",
    responsible_name: "",
    responsible_phone: "",
  });

  const efetivados = leads.filter((l) => l.etapa_kanban === "efetivados");

  const openNew = () => {
    setEditing(null);
    setFromLeadId(null);
    setForm({
      name: "",
      company: "",
      document: "",
      email: "",
      phone: "",
      address_street: "",
      address_city: "",
      address_state: "",
      address_zip: "",
      niche: "",
      origin: "",
      registration_type: "cliente",
      responsible_name: "",
      responsible_phone: "",
    });
    setModalOpen(true);
  };

  const openFromLead = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setFromLeadId(leadId);
    setEditing(null);
    setForm({
      lead_id: leadId,
      name: lead.name,
      company: lead.company ?? undefined,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      niche: lead.nicho ?? undefined,
      origin: lead.source ?? undefined,
      revenue: lead.value ?? undefined,
      responsible_name: undefined,
      responsible_phone: undefined,
      registration_type: "cliente",
    });
    setModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setFromLeadId(null);
    setForm({
      name: c.name,
      company: c.company ?? "",
      document: c.document ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address_street: c.address_street ?? "",
      address_city: c.address_city ?? "",
      address_state: c.address_state ?? "",
      address_zip: c.address_zip ?? "",
      niche: c.niche ?? "",
      origin: c.origin ?? "",
      registration_type: (c.registration_type as "prospeccao" | "cliente") ?? "cliente",
      responsible_name: c.responsible_name ?? "",
      responsible_phone: c.responsible_phone ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !form.name?.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (editing) {
        await update.mutateAsync({ ...form, id: editing.id } as Partial<Client> & { id: string });
      } else {
        await create.mutateAsync({ ...form, name: form.name! });
      }
      setModalOpen(false);
      setSubmitError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setSubmitError(msg);
      console.error("[ClientsPage] handleSubmit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada. Faça login novamente.</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-destructive">Erro ao carregar clientes: {fetchError.message || "Erro desconhecido"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro manual ou conversão a partir do Kanban (etapa Efetivados)
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          Novo cliente
        </Button>
      </div>

      {efetivados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Converter do Kanban (Efetivados)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Clique em um lead para preencher o cadastro automaticamente
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {efetivados.map((l) => (
                <Button
                  key={l.id}
                  variant="outline"
                  size="sm"
                  onClick={() => openFromLead(l.id)}
                >
                  <UserCheck className="h-4 w-4 mr-1" />
                  {l.company || l.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de clientes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : clients.length === 0 ? (
            <p className="text-muted-foreground">Nenhum cliente cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {clients.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => openEdit(c)}
                >
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.company} {c.email && `• ${c.email}`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.registration_type === "prospeccao" ? "Prospecção" : "Cliente"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => {setModalOpen(open); if (!open) setSubmitError(null);}}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar cliente" : fromLeadId ? "Converter lead em cliente" : "Novo cliente"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={form.registration_type ?? "cliente"}
                  onValueChange={(v) => setForm({ ...form, registration_type: v as "prospeccao" | "cliente" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGISTRATION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nome *</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome do responsável"
                  required
                />
              </div>
              <div>
                <Label>Empresa</Label>
                <Input
                  value={form.company ?? ""}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Nome da empresa"
                />
              </div>
              <div>
                <Label>CPF/CNPJ</Label>
                <Input
                  value={form.document ?? ""}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                  placeholder="CPF ou CNPJ"
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="E-mail"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Telefone"
                />
              </div>
              <div>
                <Label>Nicho</Label>
                <Input
                  value={form.niche ?? ""}
                  onChange={(e) => setForm({ ...form, niche: e.target.value })}
                  placeholder="Ex: SaaS, Marketing"
                />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input
                  value={form.address_city ?? ""}
                  onChange={(e) => setForm({ ...form, address_city: e.target.value })}
                  placeholder="Cidade"
                />
              </div>
              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input
                  value={form.address_street ?? ""}
                  onChange={(e) => setForm({ ...form, address_street: e.target.value })}
                  placeholder="Rua, número, bairro"
                />
              </div>
              <div>
                <Label>Responsável</Label>
                <Input
                  value={form.responsible_name ?? ""}
                  onChange={(e) => setForm({ ...form, responsible_name: e.target.value })}
                  placeholder="Nome do responsável"
                />
              </div>
              <div>
                <Label>Tel. responsável</Label>
                <Input
                  value={form.responsible_phone ?? ""}
                  onChange={(e) => setForm({ ...form, responsible_phone: e.target.value })}
                  placeholder="Telefone do responsável"
                />
              </div>
              <div>
                <Label>Origem</Label>
                <Input
                  value={form.origin ?? ""}
                  onChange={(e) => setForm({ ...form, origin: e.target.value })}
                  placeholder="Ex: Google Ads, Indicação"
                />
              </div>
              <div>
                <Label>Faturamento (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.revenue ?? ""}
                  onChange={(e) => setForm({ ...form, revenue: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="0,00"
                />
              </div>
            </div>
            <DialogFooter>
              {submitError && (
                <div className="col-span-full bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2 rounded-md">
                  {submitError}
                </div>
              )}
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || create.isPending || update.isPending}>
                {(submitting || create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
