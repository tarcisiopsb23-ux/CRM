import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, CalendarDays, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";

interface AiEvent {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  location: string | null;
  created_at: string;
}

interface FormState {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
}

const defaultForm: FormState = {
  title: "",
  description: "",
  date: "",
  time: "",
  location: "",
};

export function EventosPage() {
  const dc = useDynamicClient();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AiEvent | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<AiEvent | null>(null);

  if (!dc) return <CredentialsErrorState />;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ai_events"],
    queryFn: async () => {
      const { data, error } = await dc
        .from("ai_events")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AiEvent[];
    },
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<AiEvent, "id" | "created_at">) => {
      const { error } = await dc.from("ai_events").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_events"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Omit<AiEvent, "id" | "created_at">> }) => {
      const { error } = await dc.from("ai_events").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_events"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dc.from("ai_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_events"] }),
    onError: (e: any) => toast.error(e.message),
  });

  function openCreate() {
    setEditingItem(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(item: AiEvent) {
    setEditingItem(item);
    setForm({
      title: item.title,
      description: item.description ?? "",
      date: item.date,
      time: item.time ?? "",
      location: item.location ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.title.trim()) { toast.error("O título é obrigatório."); return; }
    if (!form.date.trim()) { toast.error("A data é obrigatória."); return; }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      date: form.date,
      time: form.time.trim() || null,
      location: form.location.trim() || null,
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Eventos Especiais"
        description="Programações sazonais, festivais e datas comemorativas."
        action={
          <Button onClick={openCreate} className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-95">
            <Plus className="h-4 w-4" /> Novo Evento
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
          <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">Nenhum evento cadastrado ainda.</p>
          <Button variant="outline" onClick={openCreate} className="border-border">
            <Plus className="h-4 w-4 mr-2" /> Cadastrar primeiro evento
          </Button>
        </div>
      )}

      {/* Timeline */}
      {!isLoading && items.length > 0 && (
        <div className="relative space-y-4 border-l-2 border-border pl-6">
          {items.map((item) => {
            const d = new Date(item.date + "T00:00:00");
            return (
              <div key={item.id} className="relative">
                {/* Ponto da timeline */}
                <span className="absolute -left-[31px] top-5 flex h-4 w-4 items-center justify-center">
                  <span className="absolute h-4 w-4 rounded-full bg-primary/20" />
                  <span className="relative h-2 w-2 rounded-full bg-primary shadow-glow" />
                </span>

                <div className="card-surface rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-elevated">
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                      {/* Bloco de data */}
                      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-ember text-primary-foreground shadow-glow">
                        <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
                          {d.toLocaleDateString("pt-BR", { month: "short" })}
                        </span>
                        <span className="font-display text-2xl font-bold leading-none">
                          {d.getDate()}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-display text-lg font-semibold text-foreground">{item.title}</h3>
                        {item.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {item.time && (
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="h-3 w-3" />{item.time}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3 w-3" />
                            {d.toLocaleDateString("pt-BR")}
                          </span>
                          {item.location && (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" />{item.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-4 shrink-0">
                      <Button variant="outline" size="sm" className="border-border hover:bg-secondary" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editingItem ? "Editar Evento" : "Novo Evento Especial"}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editingItem ? "Atualize as informações do evento." : "Cadastre um festival, data comemorativa ou programação sazonal."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Noite do Vinho" />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descreva o evento..." rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Data <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="[color-scheme:dark]" />
              </div>
              <div className="grid gap-2">
                <Label>Horário</Label>
                <Input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className="[color-scheme:dark]" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Localização</Label>
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Ex: Salão Principal" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-90">
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
        itemName={deleteTarget?.title}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
