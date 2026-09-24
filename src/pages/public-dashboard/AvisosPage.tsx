import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, BellRing, Megaphone, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/StatusBadge";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiNotice {
  id: string;
  message: string;
  priority: "alta" | "média" | "baixa";
  valid_from: string | null;
  valid_to:   string | null;
  rules: string | null;
  status: "active" | "inactive";
  created_at: string;
}

interface FormState {
  message: string;
  priority: "alta" | "média" | "baixa" | "";
  validityFrom: string;
  validityTo: string;
  rules: string;
  status: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPeriod(from: string | null, to: string | null): string {
  if (!from && !to) return "";
  try {
    const parts: string[] = [];
    if (from) parts.push(format(parseISO(from), "dd/MM/yyyy", { locale: ptBR }));
    if (to)   parts.push(format(parseISO(to),   "dd/MM/yyyy", { locale: ptBR }));
    return parts.join(" até ");
  } catch {
    return "";
  }
}

const defaultForm: FormState = {
  message: "",
  priority: "",
  validityFrom: "",
  validityTo: "",
  rules: "",
  status: true,
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function AvisosPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? "";
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AiNotice | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<AiNotice | null>(null);

  if (!dc) return <CredentialsErrorState />;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ai_notices", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await dc
        .from("client_ai_notices")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiNotice[];
    },
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<AiNotice, "id" | "created_at">) => {
      const { error } = await dc.from("client_ai_notices").insert({ ...payload, client_id: clientId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_notices", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Omit<AiNotice, "id" | "created_at">> }) => {
      const { error } = await dc.from("client_ai_notices").update(payload).eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_notices", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dc.from("client_ai_notices").delete().eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_notices", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) => {
      const { error } = await dc.from("client_ai_notices").update({ status }).eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_notices", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  function openCreate() {
    setEditingItem(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(item: AiNotice) {
    setEditingItem(item);
    setForm({
      message: item.message,
      priority: item.priority,
      validityFrom: item.valid_from ?? "",
      validityTo:   item.valid_to   ?? "",
      rules: item.rules ?? "",
      status: item.status === "active",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.message.trim()) { toast.error("O campo mensagem é obrigatório."); return; }
    if (!form.priority) { toast.error("O campo prioridade é obrigatório."); return; }
    if (form.validityFrom && form.validityTo && form.validityFrom > form.validityTo) {
      toast.error("A data de início não pode ser posterior à data de fim.");
      return;
    }

    const payload = {
      message:    form.message.trim(),
      priority:   form.priority as AiNotice["priority"],
      valid_from: form.validityFrom || null,
      valid_to:   form.validityTo   || null,
      rules:      form.rules.trim() || null,
      status:     form.status ? ("active" as const) : ("inactive" as const),
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  }

  function handleToggleStatus(item: AiNotice) {
    toggleStatusMutation.mutate({
      id: item.id,
      status: item.status === "active" ? "inactive" : "active",
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Avisos"
        description="Mensagens rápidas que a IA usa para comunicar mudanças imediatas."
        action={
          <Button onClick={openCreate} className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-95">
            <Plus className="h-4 w-4" /> Novo Aviso
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
          <BellRing className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">Nenhum aviso cadastrado ainda.</p>
          <Button variant="outline" onClick={openCreate} className="border-border">
            <Plus className="h-4 w-4 mr-2" /> Cadastrar primeiro aviso
          </Button>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="card-surface divide-y divide-border rounded-xl">
          {items.map((n) => {
            const period = formatPeriod(n.valid_from, n.valid_to);
            return (
              <div
                key={n.id}
                className="flex flex-col gap-3 p-5 transition-colors hover:bg-secondary/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1",
                        n.priority === "alta"  && "bg-destructive/15 text-destructive ring-destructive/30",
                        n.priority === "média" && "bg-warning/15 text-warning-foreground ring-warning/30",
                        n.priority === "baixa" && "bg-muted text-muted-foreground ring-border",
                      )}>
                        Prioridade {n.priority}
                      </span>
                      {period && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarRange className="h-3 w-3" />
                          {period}
                        </span>
                      )}
                      <StatusBadge status={n.status} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:ml-4">
                  <Switch
                    checked={n.status === "active"}
                    onCheckedChange={() => handleToggleStatus(n)}
                    disabled={toggleStatusMutation.isPending}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(n)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(n)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog criar / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-card sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingItem ? "Editar Aviso" : "Novo Aviso"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editingItem
                ? "Atualize as informações do aviso."
                : "Cadastre um comunicado para o agente IA."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Mensagem */}
            <div className="grid gap-2">
              <Label>Mensagem <span className="text-destructive">*</span></Label>
              <textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Ex: Hoje não teremos delivery."
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* Prioridade */}
            <div className="grid gap-2">
              <Label>Prioridade <span className="text-destructive">*</span></Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((f) => ({ ...f, priority: v as AiNotice["priority"] }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="média">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Período de vigência */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                Período de vigência
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">De</Label>
                  <Input
                    type="date"
                    value={form.validityFrom}
                    onChange={(e) => setForm((f) => ({ ...f, validityFrom: e.target.value }))}
                    className="h-9 text-sm [color-scheme:dark]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Até</Label>
                  <Input
                    type="date"
                    value={form.validityTo}
                    min={form.validityFrom || undefined}
                    onChange={(e) => setForm((f) => ({ ...f, validityTo: e.target.value }))}
                    className="h-9 text-sm [color-scheme:dark]"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Opcional — deixe em branco para aviso sem prazo.</p>
            </div>

            {/* Instruções para o Agente Virtual */}
            <div className="grid gap-2">
              <Label>Instruções para o Agente Virtual</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Defina o que o agente pode ou não informar ao comunicar este aviso.
              </p>
              <textarea
                value={form.rules}
                onChange={(e) => setForm((f) => ({ ...f, rules: e.target.value }))}
                placeholder={"Ex: Não mencionar o motivo do fechamento.\nInformar que a operação retorna na próxima segunda-feira."}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* Status */}
            <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
              <Label className="text-sm">Ativo</Label>
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
              {editingItem ? "Salvar alterações" : "Publicar"}
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
        itemName={
          deleteTarget
            ? deleteTarget.message.slice(0, 60) + (deleteTarget.message.length > 60 ? "…" : "")
            : undefined
        }
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
