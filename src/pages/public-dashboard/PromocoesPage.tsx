import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Loader2, Tag } from "lucide-react";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/StatusBadge";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
// TagIcon removed — use Tag from lucide-react

interface AiPromotion {
  id: string;
  title: string;
  description: string | null;
  validity: string | null;
  type: string | null;
  rules: string | null;
  status: "active" | "inactive";
  created_at: string;
}

interface FormState {
  title: string;
  description: string;
  validity: string;
  type: string;
  rules: string;
  status: boolean; // true = active
}

const defaultForm: FormState = {
  title: "",
  description: "",
  validity: "",
  type: "",
  rules: "",
  status: true,
};

export function PromocoesPage() {
  const dc = useDynamicClient();
  const queryClient = useQueryClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? "";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AiPromotion | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<AiPromotion | null>(null);

  if (!dc) return <CredentialsErrorState />;

  // ── Query ──────────────────────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ai_promotions", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await dc
        .from("client_ai_promotions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiPromotion[];
    },
    staleTime: 60_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload: Omit<AiPromotion, "id" | "created_at">) => {
      const { error } = await dc.from("client_ai_promotions").insert({ ...payload, client_id: clientId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_promotions", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Omit<AiPromotion, "id" | "created_at">> }) => {
      const { error } = await dc.from("client_ai_promotions").update(payload).eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_promotions", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dc.from("client_ai_promotions").delete().eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_promotions", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) => {
      const { error } = await dc.from("client_ai_promotions").update({ status }).eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_promotions", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingItem(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(item: AiPromotion) {
    setEditingItem(item);
    setForm({
      title: item.title,
      description: item.description ?? "",
      validity: item.validity ?? "",
      type: item.type ?? "",
      rules: item.rules ?? "",
      status: item.status === "active",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.title.trim()) {
      toast.error("O campo título é obrigatório.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      validity: form.validity.trim() || null,
      type: form.type.trim() || null,
      rules: form.rules.trim() || null,
      status: form.status ? ("active" as const) : ("inactive" as const),
    };

    if (editingItem) {
      updateMutation.mutate(
        { id: editingItem.id, payload },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  }

  function handleToggleStatus(item: AiPromotion) {
    const newStatus = item.status === "active" ? "inactive" : "active";
    toggleStatusMutation.mutate({ id: item.id, status: newStatus });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Promoções"
        description="Ofertas que a IA pode comunicar aos clientes em tempo real."
        action={
          <Button
            onClick={openCreate}
            className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Nova Promoção
          </Button>
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <p className="text-muted-foreground text-sm">Nenhuma promoção cadastrada ainda.</p>
          <Button variant="outline" onClick={openCreate} className="border-border">
            <Plus className="h-4 w-4 mr-2" /> Cadastrar primeira promoção
          </Button>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="card-surface group relative overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-elevated"
            >
              {/* Linha de gradiente no hover */}
              <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

              <div className="flex flex-row items-start justify-between space-y-0 p-6 pb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Tag className="h-4 w-4" />
                </div>
                <StatusBadge status={item.status} />
              </div>

              <div className="space-y-3 px-6 pb-6">
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                    {item.description ?? "—"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {item.type && (
                    <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                      {item.type}
                    </span>
                  )}
                  {item.validity && (
                    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                      {item.validity}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <Switch
                    checked={item.status === "active"}
                    onCheckedChange={() => handleToggleStatus(item)}
                    disabled={toggleStatusMutation.isPending}
                  />
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingItem ? "Editar Promoção" : "Nova Promoção"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editingItem
                ? "Atualize as informações da promoção."
                : "Preencha os dados para cadastrar uma nova promoção."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Título */}
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-foreground/90">
                Título <span className="text-red-400">*</span>
              </Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Nome da promoção"
                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-foreground/90">
                Descrição
              </Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Detalhes da promoção (opcional)"
                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
              />
            </div>

            {/* Validade */}
            <div className="space-y-1.5">
              <Label htmlFor="validity" className="text-foreground/90">
                Validade
              </Label>
              <Input
                id="validity"
                value={form.validity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validity: e.target.value }))
                }
                placeholder="ex: Seg a Qui, Fins de semana"
                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
              />
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <Label htmlFor="type" className="text-foreground/90">
                Tipo
              </Label>
              <Input
                id="type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                placeholder="ex: Bebida, Prato, Combo"
                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
              />
            </div>

            {/* Instruções para o Agente Virtual */}
            <div className="space-y-1.5">
              <Label className="text-foreground/90">Instruções para o Agente Virtual</Label>
              <p className="text-xs text-muted-foreground">
                Defina o que o agente pode ou não informar sobre esta promoção.
              </p>
              <Textarea
                value={form.rules}
                onChange={(e) => setForm((f) => ({ ...f, rules: e.target.value }))}
                placeholder={"Ex: Não informar o custo total do combo.\nInformar que a promoção é válida apenas no salão."}
                rows={3}
                className="resize-y bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Status */}
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div className="space-y-0.5">
                <Label className="text-foreground/90 text-sm">Status ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Promoção visível para o agente IA
                </p>
              </div>
              <Switch
                checked={form.status}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, status: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
              className="text-foreground/90 hover:text-foreground hover:bg-secondary"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-gradient-ember hover:opacity-90 text-primary-foreground shadow-glow"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingItem ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        itemName={deleteTarget?.title}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
