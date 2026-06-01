import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Trash2, Plus, Loader2, Music2, CalendarDays, Star } from "lucide-react";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/StatusBadge";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "musica_ao_vivo" | "dia_especial";

interface AgendaItem {
  id: string;
  title: string;          // nome do artista ou nome do dia especial
  description: string | null;
  date: string;           // YYYY-MM-DD
  time: string | null;
  location: string | null;
  type: EventType | null;
  status: "active" | "inactive";
  created_at: string;
}

interface FormState {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  type: EventType | "";
  status: boolean;
}

const defaultForm: FormState = {
  title: "",
  description: "",
  date: "",
  time: "",
  location: "",
  type: "",
  status: true,
};

const TYPE_LABELS: Record<EventType, string> = {
  musica_ao_vivo: "Música ao Vivo",
  dia_especial:   "Dia Especial",
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function AgendaPage() {
  const dc = useDynamicClient();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<AgendaItem | null>(null);

  if (!dc) return <CredentialsErrorState />;

  // ── Query ──────────────────────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ai_events"],
    queryFn: async () => {
      const { data, error } = await dc
        .from("ai_events")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgendaItem[];
    },
    staleTime: 60_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload: Omit<AgendaItem, "id" | "created_at">) => {
      const { error } = await dc.from("ai_events").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_events"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Omit<AgendaItem, "id" | "created_at">> }) => {
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

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) => {
      const { error } = await dc.from("ai_events").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_events"] }),
    onError: (e: any) => toast.error(e.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingItem(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(item: AgendaItem) {
    setEditingItem(item);
    setForm({
      title: item.title,
      description: item.description ?? "",
      date: item.date,
      time: item.time ?? "",
      location: item.location ?? "",
      type: (item.type as EventType) ?? "",
      status: item.status === "active",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.title.trim()) { toast.error("O título é obrigatório."); return; }
    if (!form.date) { toast.error("A data é obrigatória."); return; }
    if (!form.type) { toast.error("O tipo é obrigatório."); return; }

    const payload: Omit<AgendaItem, "id" | "created_at"> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      date: form.date,
      time: form.time.trim() || null,
      location: form.location.trim() || null,
      type: form.type as EventType,
      status: form.status ? "active" : "inactive",
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Agenda"
        description="Atrações musicais ao vivo e datas especiais do estabelecimento."
        action={
          <Button
            onClick={openCreate}
            className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Adicionar
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
          <p className="text-muted-foreground text-sm">Nenhum item cadastrado ainda.</p>
          <Button variant="outline" onClick={openCreate} className="border-border">
            <Plus className="h-4 w-4 mr-2" /> Cadastrar primeiro item
          </Button>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <Card className="card-surface overflow-hidden">
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Data</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const Icon = item.type === "musica_ao_vivo" ? Music2 : Star;
                  return (
                    <TableRow key={item.id} className="border-border/60 transition-colors hover:bg-secondary/30">
                      <TableCell className="font-medium whitespace-nowrap">
                        {format(parseISO(item.date), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-md",
                            item.type === "musica_ao_vivo" ? "bg-primary/10" : "bg-amber-500/10"
                          )}>
                            <Icon className={cn(
                              "h-4 w-4",
                              item.type === "musica_ao_vivo" ? "text-primary" : "text-amber-500"
                            )} />
                          </div>
                          <span className="font-medium text-foreground">{item.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                          item.type === "musica_ao_vivo"
                            ? "bg-primary/10 text-primary ring-primary/20"
                            : "bg-amber-500/10 text-amber-600 ring-amber-500/20"
                        )}>
                          {item.type ? TYPE_LABELS[item.type] : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.time ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {item.description ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell>
                        <TooltipProvider delayDuration={150}>
                          <div className="flex items-center justify-end gap-1">
                            <Switch
                              checked={item.status === "active"}
                              onCheckedChange={() =>
                                toggleStatusMutation.mutate({
                                  id: item.id,
                                  status: item.status === "active" ? "inactive" : "active",
                                })
                              }
                              disabled={toggleStatusMutation.isPending}
                            />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget(item)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Excluir</TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="divide-y divide-border md:hidden">
            {items.map((item) => (
              <div key={item.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type ? TYPE_LABELS[item.type as EventType] : ""}{item.description ? ` · ${item.description}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {format(parseISO(item.date), "dd/MM/yyyy", { locale: ptBR })}
                    {item.time ? ` · ${item.time}` : ""}
                  </span>
                  <div className="flex gap-1">
                    <Switch
                      checked={item.status === "active"}
                      onCheckedChange={() =>
                        toggleStatusMutation.mutate({
                          id: item.id,
                          status: item.status === "active" ? "inactive" : "active",
                        })
                      }
                      disabled={toggleStatusMutation.isPending}
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Dialog criar / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingItem ? "Editar Item da Agenda" : "Novo Item da Agenda"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editingItem
                ? "Atualize as informações do item."
                : "Cadastre uma atração musical ou data especial."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Tipo */}
            <div className="grid gap-2">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as EventType }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="musica_ao_vivo">
                    <span className="flex items-center gap-2">
                      <Music2 className="h-3.5 w-3.5 text-primary" />
                      Música ao Vivo
                    </span>
                  </SelectItem>
                  <SelectItem value="dia_especial">
                    <span className="flex items-center gap-2">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      Dia Especial
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Título */}
            <div className="grid gap-2">
              <Label>
                {form.type === "musica_ao_vivo" ? "Artista / Banda" : "Nome do evento"}
                {" "}<span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={
                  form.type === "musica_ao_vivo"
                    ? "Ex: Banda Fulana"
                    : "Ex: Dia das Mães"
                }
              />
            </div>

            {/* Data + Horário */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Data <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="[color-scheme:dark]"
                />
              </div>
              <div className="grid gap-2">
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  className="[color-scheme:dark]"
                />
              </div>
            </div>

            {/* Descrição */}
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Informações adicionais (opcional)"
              />
            </div>

            {/* Localização */}
            <div className="grid gap-2">
              <Label>Localização</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Ex: Salão Principal"
              />
            </div>

            {/* Status */}
            <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
              <div className="space-y-0.5">
                <Label className="text-sm">Ativo</Label>
                <p className="text-xs text-muted-foreground">Visível para o agente IA</p>
              </div>
              <Switch
                checked={form.status}
                onCheckedChange={(v) => setForm((f) => ({ ...f, status: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-90"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingItem ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
          }
        }}
        itemName={deleteTarget?.title}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
