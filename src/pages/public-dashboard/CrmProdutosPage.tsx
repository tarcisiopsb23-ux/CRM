import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useCrmProducts, type CrmProduct } from "@/hooks/useCrmProducts";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { useDynamicClient } from "@/hooks/useDynamicClient";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface ProductFormProps {
  initial?: Partial<CrmProduct>;
  onSave: (d: {
    name: string; description: string | null; price: number; unit: string;
    sku: string | null; product_type: "product" | "service"; category: string | null;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}

function ProductForm({ initial, onSave, onCancel, saving }: ProductFormProps) {
  const [name,        setName]        = useState(initial?.name         ?? "");
  const [desc,        setDesc]        = useState(initial?.description  ?? "");
  const [price,       setPrice]       = useState(String(initial?.price ?? ""));
  const [unit,        setUnit]        = useState(initial?.unit         ?? "unidade");
  const [sku,         setSku]         = useState(initial?.sku          ?? "");
  const [productType, setProductType] = useState<"product"|"service">(initial?.product_type ?? "service");
  const [category,    setCategory]    = useState(initial?.category     ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Nome obrigatório."); return; }
    onSave({
      name: name.trim(), description: desc.trim() || null,
      price: parseFloat(price) || 0, unit: unit.trim() || "unidade",
      sku: sku.trim() || null, product_type: productType,
      category: category.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      {/* Tipo */}
      <div className="flex gap-2">
        {(["service","product"] as const).map(t => (
          <button key={t} type="button" onClick={() => setProductType(t)}
            className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
              productType === t
                ? "border-violet-500 bg-violet-600 text-white shadow-md"
                : "border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
            }`}>
            {t === "service" ? "Serviço" : "Produto"}
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        <Label>Nome <span className="text-destructive">*</span></Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Gestão de Tráfego" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>SKU / Código</Label>
          <Input value={sku} onChange={e => setSku(e.target.value)} placeholder="GTF-001" />
        </div>
        <div className="grid gap-2">
          <Label>Categoria</Label>
          <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Marketing, Assessoria..." />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Descrição</Label>
        <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrição resumida (opcional)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>Preço padrão (R$)</Label>
          <Input type="number" min="0" step="0.01" value={price}
            onChange={e => setPrice(e.target.value)} placeholder="0,00" />
        </div>
        <div className="grid gap-2">
          <Label>Unidade</Label>
          <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="unidade, hora, mês..." />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving} className="bg-gradient-ember text-primary-foreground shadow-glow">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
        </Button>
      </div>
    </form>
  );
}

export function CrmProdutosPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id;
  const canEdit = ["owner", "admin", "manager"].includes(auth?.user?.role ?? "");

  const { data: products = [], isLoading, create, update, toggleActive, remove } = useCrmProducts(clientId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<CrmProduct | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrmProduct | null>(null);
  const [search, setSearch]         = useState("");

  const [searchParams, setSearchParams] = useSearchParams();

  // Abre dialog automaticamente se vier de ?new=1 (ex: link da AgendaConfigPage)
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, []);

  if (!dc) return <CredentialsErrorState />;

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (d: {
    name: string; description: string | null; price: number; unit: string;
    sku: string | null; product_type: "product" | "service"; category: string | null;
  }) => {
    if (!clientId) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...d });
        toast.success("Produto atualizado.");
      } else {
        await create.mutateAsync({ client_id: clientId, ...d });
        toast.success("Produto criado.");
      }
      setDialogOpen(false); setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Produto removido."); setDeleteTarget(null);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Produtos e Serviços"
        description="Catálogo de produtos e serviços oferecidos."
        action={canEdit ? (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}
            className="bg-gradient-ember text-primary-foreground shadow-glow">
            <Plus className="h-4 w-4" /> Novo Produto
          </Button>
        ) : undefined}
      />

      <Input className="max-w-sm" placeholder="Buscar por nome..."
        value={search} onChange={e => setSearch(e.target.value)} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Package className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">Nenhum produto cadastrado.</p>
          {canEdit && (
            <Button variant="outline" onClick={() => setDialogOpen(true)} className="border-border">
              <Plus className="h-4 w-4 mr-2" /> Adicionar primeiro produto
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Card key={p.id} className="card-surface border border-border/60 hover:border-border transition-colors bg-card/80"  >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-foreground truncate">{p.name}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {p.product_type === "product" ? "Produto" : "Serviço"}
                      </Badge>
                    </div>
                    {p.category && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{p.category}</p>}
                    {p.sku && <p className="text-[10px] text-muted-foreground/50 font-mono">SKU: {p.sku}</p>}
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                    )}
                  </div>
                  <Badge variant={p.active ? "default" : "secondary"} className="shrink-0 text-[10px]">
                    {p.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-black text-foreground">{fmtCurrency(p.price)}</p>
                  <span className="text-xs text-muted-foreground">/{p.unit}</span>
                </div>
                {canEdit && (
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.active}
                        onCheckedChange={v => toggleActive.mutate({ id: p.id, active: v })}
                        disabled={toggleActive.isPending}
                      />
                      <span className="text-xs text-muted-foreground">{p.active ? "Visível" : "Oculto"}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditing(p); setDialogOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteTarget(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="border-border bg-card sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <ProductForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => { setDialogOpen(false); setEditing(null); }}
            saving={create.isPending || update.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover Produto</DialogTitle>
            <DialogDescription>Remover <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
