import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useSuppliers } from "@/hooks/useSuppliers";
import { supabase } from "@/lib/supabase";
import { useIntegration, getDriveFoldersFromOrganizationSettings, useOrganizationSettings } from "@/hooks/useSettings";
import { DriveFolderButton } from "@/components/shared/DriveFolderButton";
import { DriveFolderStatusAlert } from "@/components/shared/DriveFolderStatusAlert";
import { useDriveFolder } from "@/hooks/useDriveFolder";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { usePinConfirm } from "@/hooks/usePinConfirm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil, Trash2, Search, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { fetchAddressByCep } from "@/lib/viacep";
import { toast } from "sonner";
import { DocumentsCard } from "@/components/documents/DocumentsCard";
import { DRIVE_AUTO_FOLDERS } from "@/constants/driveAutoFolders";
import type { Supplier, SupplierExpense } from "@/types/crm";
import { formatBRL, formatCpfCnpj, formatPhoneBR, formatEntityCode } from "@/lib/formatters";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useN8nConfig } from "@/hooks/useN8nConfig";

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
  const { pinProps, requirePin } = usePinConfirm();
  const { data: suppliers = [], isLoading, create, update, remove, deactivate, activate } = useSuppliers(organizationId);
  const { autoCreateFolder } = useDriveFolder(organizationId);
  const orgSettings = useOrganizationSettings(organizationId);
  const driveFolders = useMemo(() => getDriveFoldersFromOrganizationSettings(orgSettings.data), [orgSettings.data]);
  const n8nConfig = useN8nConfig(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<Supplier>>({
    name: "",
    document: "",
    email: "",
    phone: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    address_number: "",
    address_complement: "",
    address_neighborhood: "",
    service_category: "",
    pix: "",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = showInactive
      ? suppliers.filter((s) => (s as any).is_active === false)
      : suppliers.filter((s) => (s as any).is_active !== false);
    if (!q) return list;
    return list.filter((s) => {
      const hay = [s.name, s.document ?? "", s.email ?? "", s.phone ?? "", s.service_category ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [suppliers, search, showInactive]);

  const supplierExpenses = useQuery({
    queryKey: ["supplier-expenses", organizationId, viewing?.id],
    enabled: !!organizationId && !!viewing?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_expenses")
        .select("id, supplier_id, description, value, due_date, status")
        .eq("organization_id", organizationId)
        .eq("supplier_id", viewing!.id)
        .order("due_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Pick<SupplierExpense, "id" | "supplier_id" | "description" | "value" | "due_date" | "status">>;
    },
  });

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
      address_number: (s as any).address_number ?? "",
      address_complement: (s as any).address_complement ?? "",
      address_neighborhood: (s as any).address_neighborhood ?? "",
      service_category: s.service_category ?? "Outros",
      pix: s.pix ?? "",
    });
    setModalOpen(true);
  };

  const handleCepSearch = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      setSearchingCep(true);
      try {
        const address = await fetchAddressByCep(cleanCep);
        if (address) {
          setForm({
            ...form,
            address_street: address.logradouro || form.address_street,
            address_neighborhood: address.bairro || (form as any).address_neighborhood,
            address_city: address.localidade,
            address_state: address.uf,
            address_zip: address.cep,
          });
          toast.success("Endereço preenchido pelo CEP!");
        } else {
          toast.error("CEP não encontrado.");
        }
      } catch (error) {
        toast.error("Erro ao buscar CEP.");
      } finally {
        setSearchingCep(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !form.name?.trim()) return;
    try {
      if (editing) {
        await update.mutateAsync({ ...form, id: editing.id } as Partial<Supplier> & { id: string });
      } else {
        const created = await create.mutateAsync({ ...form, name: form.name! });
        autoCreateFolder("supplier", { id: created.id, name: created.name, company: created.name }, ["suppliers", organizationId]);
        setViewing(created);
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

      <DriveFolderStatusAlert
        organizationId={organizationId!}
        module="supplier"
        table="suppliers"
        queryKey="suppliers"
        records={suppliers.map((s) => ({ id: s.id, name: s.name, folder_id: s.folder_id, metadata: s.metadata, is_active: (s as any).is_active }))}
        canEdit
      />

      {viewing ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Fornecedor</CardTitle>
              <div className="mt-1 text-sm font-medium truncate">{viewing.name}</div>
              <div className="text-sm text-muted-foreground truncate">
                {(viewing.service_category || "—")}{viewing.email ? ` • ${viewing.email}` : ""}{viewing.phone ? ` • ${formatPhoneBR(viewing.phone)}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(viewing)}>
                <Pencil className="h-4 w-4 mr-1" /> Alterar
              </Button>
              <DriveFolderButton
                organizationId={organizationId!}
                module="supplier"
                record={{ id: viewing.id, name: viewing.name }}
                folderId={viewing.folder_id ?? null}
                folderUrl={viewing.folder_url ?? null}
                onFolderSaved={async (fId, fUrl) => {
                  const updated = await update.mutateAsync({ id: viewing.id, folder_id: fId, folder_url: fUrl ?? null });
                  setViewing(updated);
                }}
                onFolderCreated={() => {}}
              />
              {/* Toggle ativo/inativo */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={(viewing as any)?.is_active !== false}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      activate.mutate(viewing!.id);
                      setViewing(null);
                    } else {
                      requirePin(
                        "Desativar fornecedor",
                        `Desativar "${viewing!.name}"? Nenhum dado será apagado.`,
                        async () => { deactivate.mutate(viewing!.id); setViewing(null); }
                      );
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  {(viewing as any)?.is_active !== false ? "Ativo" : "Inativo"}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setViewing(null)}>
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="dados" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="dados">Dados cadastrais</TabsTrigger>
                <TabsTrigger value="despesas">Despesas</TabsTrigger>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">Nome</span>
                    <span className="font-medium truncate max-w-[220px]">{viewing.name}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">Categoria</span>
                    <span className="font-medium truncate max-w-[220px]">{viewing.service_category || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">CPF/CNPJ</span>
                    <span className="font-medium">{viewing.document ? formatCpfCnpj(viewing.document) : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">Código</span>
                    <span className="font-mono font-medium">{formatEntityCode("FOR", viewing.code)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">Telefone</span>
                    <span className="font-medium">{viewing.phone ? formatPhoneBR(viewing.phone) : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">E-mail</span>
                    <span className="font-medium truncate max-w-[220px]">{viewing.email || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">Pix</span>
                    <span className="font-medium truncate max-w-[220px]">{viewing.pix || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3 sm:col-span-2">
                    <span className="text-muted-foreground">Endereço</span>
                    <span className="font-medium truncate max-w-[420px]">{viewing.address_street || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">Cidade</span>
                    <span className="font-medium">{viewing.address_city || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">UF</span>
                    <span className="font-medium">{viewing.address_state || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <span className="text-muted-foreground">CEP</span>
                    <span className="font-medium">{viewing.address_zip || "—"}</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="despesas" className="space-y-4">
                <div className="rounded border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierExpenses.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                            Carregando...
                          </TableCell>
                        </TableRow>
                      ) : (supplierExpenses.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                            Nenhuma despesa para este fornecedor.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (supplierExpenses.data ?? []).map((e) => (
                          <TableRow key={e.id}>
                            <TableCell>{e.due_date ? format(parseISO(e.due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}</TableCell>
                            <TableCell className="font-medium">{e.description}</TableCell>
                            <TableCell className="capitalize">{e.status}</TableCell>
                            <TableCell className="text-right font-semibold text-red-500">{formatBRL(Number(e.value ?? 0))}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="documentos" className="space-y-4">
                <DocumentsCard
                  title="Documentos"
                  variant="folders"
                  folderId={viewing.folder_id ?? (() => {
                    const meta = (viewing.metadata ?? {}) as Record<string, unknown>;
                    return String(meta.drive_folder_id ?? meta.drive_folder ?? "").trim() || null;
                  })()}
                  folderValue={viewing.folder_url ?? (() => {
                    const meta = (viewing.metadata ?? {}) as Record<string, unknown>;
                    const raw = (meta.drive_folder ?? meta.drive_folder_url ?? meta.folder ?? meta.pasta ?? "") as string;
                    return String(raw ?? "").trim() || null;
                  })()}
                  canEdit
                  allowCreateFolder
                  autoFolderNames={[...DRIVE_AUTO_FOLDERS.supplier]}
                  createFolderParentValue={driveFolders.suppliers}
                  createFolderName={(viewing.name || "Fornecedor").trim()}
                  onSetFolderValue={async (next) => {
                    const folderId = next.match(/^[a-zA-Z0-9_-]{10,}$/) && !next.includes("http") ? next : (next.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? next);
                    const folderUrl = next.startsWith("http") ? next : `https://drive.google.com/drive/folders/${folderId}`;
                    const updated = await update.mutateAsync({ id: viewing.id, folder_id: folderId, folder_url: folderUrl });
                    setViewing(updated);
                  }}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Lista de fornecedores</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar fornecedor..."
                  className="pl-9"
                />
              </div>
              <Button
                variant={showInactive ? "default" : "outline"}
                size="sm"
                onClick={() => setShowInactive((v) => !v)}
              >
                {showInactive ? "Ver ativos" : `Ver inativos (${suppliers.filter((s) => (s as any).is_active === false).length})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground">Nenhum fornecedor cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => setViewing(s)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{formatEntityCode("FOR", s.code)}</span>
                        <p className="font-medium truncate">{s.name}</p>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {s.service_category && `${s.service_category} • `}
                        {s.email || s.phone || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewing(s);
                        }}
                        aria-label="Visualizar"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(s);
                        }}
                        aria-label="Alterar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Desativar "${s.name}"?`)) requirePin(
                            "Desativar fornecedor",
                            `Desativar "${s.name}"? Nenhum dado será apagado.`,
                            async () => { deactivate.mutate(s.id); }
                          );
                        }}
                        aria-label="Desativar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[75vw] max-w-[75vw] max-h-[90vh] overflow-y-auto">
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
            <div className="grid grid-cols-2 gap-4 items-end">
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
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="col-span-2 w-[40%]">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={form.address_zip ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm({ ...form, address_zip: val });
                      if (val.replace(/\D/g, "").length === 8) {
                        handleCepSearch(val);
                      }
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  {searchingCep && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <Label>Rua / Av.</Label>
                <Input
                  value={form.address_street ?? ""}
                  onChange={(e) => setForm({ ...form, address_street: e.target.value })}
                  placeholder="Nome da rua ou avenida"
                />
              </div>
              <div className="w-[40%]">
                <Label>Número</Label>
                <Input
                  value={(form as any).address_number ?? ""}
                  onChange={(e) => setForm({ ...form, address_number: e.target.value } as any)}
                  placeholder="Nº"
                />
              </div>
              <div>
                <Label>Complemento</Label>
                <Input
                  value={(form as any).address_complement ?? ""}
                  onChange={(e) => setForm({ ...form, address_complement: e.target.value } as any)}
                  placeholder="Apto, sala, bloco..."
                />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input
                  value={(form as any).address_neighborhood ?? ""}
                  onChange={(e) => setForm({ ...form, address_neighborhood: e.target.value } as any)}
                  placeholder="Bairro"
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
              <div>
                <Label>Estado</Label>
                <Select
                  value={form.address_state ?? ""}
                  onValueChange={(v) => setForm({ ...form, address_state: v })}
                >
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
      <PinAuthDialog {...pinProps} />
    </div>
  );
}
