import { useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Trash2 } from "lucide-react";
import type { Supplier } from "@/types/crm";

const SUPPLIER_CATEGORIES = [
  "Serviços Terceirizados",
  "Material de Escritório",
  "Despesas Prediais",
  "Impostos",
  "Contratos",
  "Eletro/Eletrônicos",
  "Móveis",
  "Tecnologia",
  "Assinaturas",
  "Despesas de Serviço",
  "Materiais Sanitários",
  "Copa",
  "Marketing",
  "Outros",
] as const;

export default function SuppliersPage() {
  const organizationId = useOrganization();
  const { data: suppliers = [], isLoading, create, update, remove } = useSuppliers(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>({
    name: "",
    document: "",
    email: "",
    phone: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    service_category: "",
    pix: "",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      document: "",
      email: "",
      phone: "",
      address_street: "",
      address_city: "",
      address_state: "",
      address_zip: "",
      service_category: "Outros",
      pix: "",
    });
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      document: s.document ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address_street: s.address_street ?? "",
      address_city: s.address_city ?? "",
      address_state: s.address_state ?? "",
      address_zip: s.address_zip ?? "",
      service_category: s.service_category ?? "Outros",
      pix: s.pix ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !form.name?.trim()) return;
    try {
      if (editing) {
        await update.mutateAsync({ ...form, id: editing.id } as Partial<Supplier> & { id: string });
      } else {
        await create.mutateAsync({ ...form, name: form.name! });
      }
      setModalOpen(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">
            Nome, CPF/CNPJ, Endereço, telefone, e-mail, categoria, Pix, observações
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          Novo fornecedor
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de fornecedores</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : suppliers.length === 0 ? (
            <p className="text-muted-foreground">Nenhum fornecedor cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {suppliers.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => openEdit(s)}
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.service_category && `${s.service_category} • `}
                      {s.email || s.phone}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm("Excluir este fornecedor?")) {
                        remove.mutate(s.id);
                      }
                    }}
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do fornecedor"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CPF/CNPJ</Label>
                <Input
                  value={form.document ?? ""}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                  placeholder="CPF ou CNPJ"
                />
              </div>
              <div>
                <Label>Categoria do serviço</Label>
                <Select value={String(form.service_category ?? "Outros")} onValueChange={(v) => setForm({ ...form, service_category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label>Pix</Label>
                <Input
                  value={form.pix ?? ""}
                  onChange={(e) => setForm({ ...form, pix: e.target.value })}
                  placeholder="Chave Pix"
                />
              </div>
            </div>
            <div>
              <Label>Endereço</Label>
              <Input
                value={form.address_street ?? ""}
                onChange={(e) => setForm({ ...form, address_street: e.target.value })}
                placeholder="Rua, número, bairro"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cidade</Label>
                <Input
                  value={form.address_city ?? ""}
                  onChange={(e) => setForm({ ...form, address_city: e.target.value })}
                  placeholder="Cidade"
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Input
                  value={form.address_state ?? ""}
                  onChange={(e) => setForm({ ...form, address_state: e.target.value })}
                  placeholder="UF"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
