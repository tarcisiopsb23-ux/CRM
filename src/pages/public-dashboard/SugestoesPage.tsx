import { useEffect, useRef, useState } from "react";
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
import { Pencil, Trash2, Plus, Loader2, UtensilsCrossed, ImagePlus, X } from "lucide-react";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/StatusBadge";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiSuggestion {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  rules: string | null;
  status: "active" | "inactive";
  created_at: string;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  image_url: string;
  rules: string;
  status: boolean;
}

const defaultForm: FormState = {
  name: "",
  description: "",
  price: "",
  image_url: "",
  rules: "",
  status: true,
};

const BUCKET = "branding";

// ─── Componente de upload de imagem ──────────────────────────────────────────

interface ImageUploaderProps {
  currentUrl: string;
  onChange: (url: string) => void;
  dc: ReturnType<typeof useDynamicClient>;
}

function ImageUploader({ currentUrl, onChange, dc }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>(currentUrl);

  useEffect(() => { setPreview(currentUrl); }, [currentUrl]);

  const handleFile = async (file: File) => {
    if (!dc) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A imagem deve ter no máximo 5 MB."); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `suggestions/${Date.now()}.${ext}`;

      const { error: uploadError } = await dc.storage
        .from(BUCKET)
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        if ((uploadError as any).statusCode === "404" || uploadError.message.includes("Bucket not found")) {
          throw new Error('Bucket "branding" não encontrado. Execute o SQL de migration no Supabase do cliente.');
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = dc.storage.from(BUCKET).getPublicUrl(filePath);

      setPreview(publicUrl);
      onChange(publicUrl);
      toast.success("Imagem carregada. Salve para confirmar.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview("");
    onChange("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {/* Preview */}
      {preview ? (
        <div className="relative h-40 w-full overflow-hidden rounded-lg border border-border bg-secondary/20">
          <img src={preview} alt="Preview" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
            title="Remover imagem"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {/* URL pública copiável */}
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
            <p className="truncate text-[10px] text-white/70">{preview}</p>
          </div>
        </div>
      ) : (
        <div
          className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/10 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/20"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-8 w-8 opacity-40" />
          <p className="text-xs">Clique para enviar uma imagem</p>
          <p className="text-[10px] opacity-60">PNG, JPG, WEBP · máx. 5 MB</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="border-border flex-1"
        >
          {uploading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Enviando...</>
          ) : (
            <><ImagePlus className="h-3.5 w-3.5 mr-2" />{preview ? "Trocar imagem" : "Enviar imagem"}</>
          )}
        </Button>
        {preview && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { navigator.clipboard.writeText(preview); toast.success("URL copiada!"); }}
            className="text-xs text-muted-foreground"
            title="Copiar URL pública"
          >
            Copiar URL
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function SugestoesPage() {
  const dc = useDynamicClient();
  const queryClient = useQueryClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? "";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AiSuggestion | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<AiSuggestion | null>(null);

  if (!dc) return <CredentialsErrorState />;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ai_suggestions", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await dc.from("client_ai_suggestions").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiSuggestion[];
    },
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<AiSuggestion, "id" | "created_at">) => {
      const { error } = await dc.from("client_ai_suggestions").insert({ ...payload, client_id: clientId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_suggestions", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Omit<AiSuggestion, "id" | "created_at">> }) => {
      const { error } = await dc.from("client_ai_suggestions").update(payload).eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_suggestions", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dc.from("client_ai_suggestions").delete().eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_suggestions", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) => {
      const { error } = await dc.from("client_ai_suggestions").update({ status }).eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_suggestions", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  function openCreate() { setEditingItem(null); setForm(defaultForm); setDialogOpen(true); }

  function openEdit(item: AiSuggestion) {
    setEditingItem(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      price: item.price !== null ? String(item.price) : "",
      image_url: item.image_url ?? "",
      rules: item.rules ?? "",
      status: item.status === "active",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("O campo nome é obrigatório."); return; }
    const parsedPrice = form.price.trim() !== "" ? parseFloat(form.price) : null;
    if (parsedPrice !== null && isNaN(parsedPrice)) { toast.error("O preço informado é inválido."); return; }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: parsedPrice,
      image_url: form.image_url.trim() || null,
      rules: form.rules.trim() || null,
      status: form.status ? ("active" as const) : ("inactive" as const),
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  }

  function formatPrice(price: number | null): string {
    return price !== null ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Sugestões da Semana"
        description="Pratos em destaque que a IA recomenda nas conversas."
        action={
          <Button onClick={openCreate} className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-95">
            <Plus className="h-4 w-4" /> Nova Sugestão
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
          <p className="text-muted-foreground text-sm">Nenhuma sugestão cadastrada ainda.</p>
          <Button variant="outline" onClick={openCreate} className="border-border">
            <Plus className="h-4 w-4 mr-2" /> Cadastrar primeira sugestão
          </Button>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="card-surface group overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-elevated p-0">
              {/* Área de imagem */}
              <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-violet-900/40 via-purple-800/30 to-stone-900">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                    <UtensilsCrossed className="h-12 w-12" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
                <div className="absolute right-3 top-3">
                  <StatusBadge status={item.status} />
                </div>
              </div>

              {/* Conteúdo */}
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-foreground">{item.name}</h3>
                  {item.price !== null && (
                    <span className="font-display text-base font-semibold text-primary shrink-0">
                      {formatPrice(item.price)}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">{item.description}</p>
                )}
                {/* URL pública para compartilhamento */}
                {item.image_url && (
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(item.image_url!); toast.success("URL da imagem copiada!"); }}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                    title="Copiar URL da imagem para compartilhar"
                  >
                    <ImagePlus className="h-3 w-3" />
                    Copiar URL da imagem
                  </button>
                )}
                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <Switch
                    checked={item.status === "active"}
                    onCheckedChange={() => toggleStatusMutation.mutate({ id: item.id, status: item.status === "active" ? "inactive" : "active" })}
                    disabled={toggleStatusMutation.isPending}
                  />
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog criar / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingItem ? "Editar Sugestão" : "Nova Sugestão"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editingItem ? "Atualize as informações da sugestão." : "Preencha os dados para cadastrar uma nova sugestão."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Imagem */}
            <div className="space-y-1.5">
              <Label className="text-foreground/90">Imagem</Label>
              <ImageUploader
                currentUrl={form.image_url}
                onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
                dc={dc}
              />
            </div>

            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-foreground/90">
                Nome <span className="text-red-400">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome da sugestão"
                className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-foreground/90">Descrição</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição da sugestão (opcional)"
                className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Preço */}
            <div className="space-y-1.5">
              <Label htmlFor="price" className="text-foreground/90">Preço</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0,00"
                className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Instruções para o Agente Virtual */}
            <div className="space-y-1.5">
              <Label className="text-foreground/90">Instruções para o Agente Virtual</Label>
              <p className="text-xs text-muted-foreground">
                Defina o que o agente pode ou não informar sobre esta sugestão.
              </p>
              <Textarea
                value={form.rules}
                onChange={(e) => setForm((f) => ({ ...f, rules: e.target.value }))}
                placeholder={"Ex: Não informar a margem de lucro do prato.\nInformar que pode ser feito sem glúten mediante pedido."}
                rows={3}
                className="resize-y bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Status */}
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div className="space-y-0.5">
                <Label className="text-foreground/90 text-sm">Status ativo</Label>
                <p className="text-xs text-muted-foreground">Sugestão visível para o agente IA</p>
              </div>
              <Switch
                checked={form.status}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, status: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={isSaving}
              className="text-foreground/90 hover:text-foreground hover:bg-secondary">
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}
              className="bg-gradient-ember hover:opacity-90 text-primary-foreground shadow-glow">
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingItem ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}
        itemName={deleteTarget?.name}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
