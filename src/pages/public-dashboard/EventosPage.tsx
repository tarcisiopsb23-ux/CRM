import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Loader2, CalendarDays, Clock, MapPin,
  FileSpreadsheet, Upload, AlertCircle, CheckCircle2, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format, parse, isValid } from "date-fns";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useClientAuth } from "@/hooks/useClientAuth";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AiEvent {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  date: string;
  time: string | null;
  location: string | null;
  status: "active" | "inactive";
  created_at: string;
}

interface FormState {
  title: string;
  description: string;
  rules: string;
  date: string;
  time: string;
  location: string;
  status: boolean; // true = active
}

const defaultForm: FormState = {
  title: "",
  description: "",
  rules: "",
  date: "",
  time: "",
  location: "",
  status: true,
};

// ─── Import helpers ────────────────────────────────────────────────────────────

/** Normaliza valor de data para YYYY-MM-DD */
function normalizeDate(raw: unknown): string | null {
  if (!raw) return null;
  // Número serial do Excel
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const p = parse(s, "dd/MM/yyyy", new Date());
    if (isValid(p)) return format(p, "yyyy-MM-dd");
  }
  return null;
}

interface ImportRow {
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  location: string | null;
  _error?: string;
}

function parseSheetRows(rows: Record<string, unknown>[]): ImportRow[] {
  return rows.map((row, i) => {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase());
        if (found !== undefined) return row[found];
      }
      return undefined;
    };

    const title = String(get("titulo", "title", "nome", "name") ?? "").trim();
    const date  = normalizeDate(get("data", "date"));
    const time  = String(get("horario", "horário", "hora", "time") ?? "").trim() || null;
    const desc  = String(get("descricao", "descrição", "description", "descr") ?? "").trim() || null;
    const loc   = String(get("local", "localizacao", "localização", "location") ?? "").trim() || null;

    const errors: string[] = [];
    if (!title) errors.push("título obrigatório");
    if (!date)  errors.push("data inválida");

    return {
      title:       title || `(linha ${i + 2})`,
      description: desc,
      date:        date ?? "",
      time,
      location:    loc,
      _error:      errors.length > 0 ? errors.join(", ") : undefined,
    };
  });
}

// ─── Template download ────────────────────────────────────────────────────────

function downloadEventosTemplate() {
  const wb = XLSX.utils.book_new();
  const rows = [
    {
      titulo:    "Festival de Verão",
      data:      "20/01/2025",
      horario:   "19:00",
      descricao: "Grande festival com atrações variadas",
      local:     "Praça Central",
    },
    {
      titulo:    "Noite do Vinho",
      data:      "14/02/2025",
      horario:   "20:00",
      descricao: "Degustação especial de vinhos importados",
      local:     "Salão VIP",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["titulo", "data", "horario", "descricao", "local"],
  });
  ws["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 38 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Eventos");
  XLSX.writeFile(wb, "modelo_eventos_especiais.xlsx");
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function EventosPage() {
  const dc = useDynamicClient();
  const queryClient = useQueryClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? "";

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editingItem, setEditingItem]   = useState<AiEvent | null>(null);
  const [form, setForm]                 = useState<FormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<AiEvent | null>(null);

  // ── Import state ─────────────────────────────────────────────────────────────
  const [importOpen, setImportOpen]         = useState(false);
  const [importRows, setImportRows]         = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const fileInputRef                        = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: async (rows: ImportRow[]) => {
      const valid = rows.filter(r => !r._error);
      if (valid.length === 0) throw new Error("Nenhum registro válido para importar.");
      const payload = valid.map(({ _error: _e, ...r }) => ({ ...r, client_id: clientId }));
      const { error } = await dc!.from("client_ai_events").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_events", clientId] });
      toast.success(`${importRows.filter(r => !r._error).length} evento(s) importado(s) com sucesso!`);
      closeImport();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function closeImport() {
    setImportOpen(false);
    setImportRows([]);
    setImportFileName("");
  }

  function processFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      toast.error("Formato não suportado. Use .xlsx, .xls ou .csv");
      return;
    }
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        if (rows.length === 0) { toast.error("A planilha está vazia."); return; }
        setImportRows(parseSheetRows(rows));
        setImportOpen(true);
      } catch {
        toast.error("Erro ao processar o arquivo. Verifique o formato.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  if (!dc) return <CredentialsErrorState />;

  // ── Query ─────────────────────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ai_events", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await dc
        .from("client_ai_events")
        .select("*")
        .eq("client_id", clientId)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AiEvent[];
    },
    staleTime: 60_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload: Omit<AiEvent, "id" | "created_at">) => {
      const { error } = await dc.from("client_ai_events").insert({ ...payload, client_id: clientId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_events", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Omit<AiEvent, "id" | "created_at">> }) => {
      const { error } = await dc.from("client_ai_events").update(payload).eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_events", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dc.from("client_ai_events").delete().eq("id", id).eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai_events", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingItem(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(item: AiEvent) {
    setEditingItem(item);
    setForm({
      title:       item.title,
      description: item.description ?? "",
      rules:       item.rules ?? "",
      date:        item.date,
      time:        item.time ?? "",
      location:    item.location ?? "",
      status:      item.status === "active",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.title.trim()) { toast.error("O título é obrigatório."); return; }
    if (!form.date.trim())  { toast.error("A data é obrigatória.");   return; }

    const payload = {
      title:       form.title.trim(),
      description: form.description.trim() || null,
      rules:       form.rules.trim() || null,
      date:        form.date,
      time:        form.time.trim() || null,
      location:    form.location.trim() || null,
      status:      form.status ? ("active" as const) : ("inactive" as const),
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Eventos Especiais"
        description="Programações sazonais, festivais e datas comemorativas."
        action={
          <div className="flex items-center gap-2">
            {/* Input oculto para upload de arquivo */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={downloadEventosTemplate}
              className="border-border gap-2 text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" />
              Modelo
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="border-border gap-2"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              Importar
            </Button>
            <Button
              onClick={openCreate}
              className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-95"
            >
              <Plus className="h-4 w-4" /> Novo Evento
            </Button>
          </div>
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="border-border">
              <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-400" /> Importar planilha
            </Button>
            <Button variant="outline" onClick={openCreate} className="border-border">
              <Plus className="h-4 w-4 mr-2" /> Cadastrar primeiro evento
            </Button>
          </div>
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
                        {item.rules && (
                          <p className="mt-1 text-xs text-muted-foreground/70 italic border-l-2 border-border pl-2">
                            {item.rules}
                          </p>
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
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border",
                            item.status === "active"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-border bg-muted/40 text-muted-foreground"
                          )}>
                            {item.status === "active" ? "Ativo" : "Inativo"}
                          </span>
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

      {/* ── Dialog criar / editar ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-card sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingItem ? "Editar Evento" : "Novo Evento Especial"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editingItem
                ? "Atualize as informações do evento."
                : "Cadastre um festival, data comemorativa ou programação sazonal."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Black Friday"
              />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Informações sobre o evento para consulta da automação.
              </p>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descreva o evento, contexto e relevância para campanhas..."
                rows={3}
                className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="grid gap-2">
              <Label>Instruções para o Agente Virtual</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Defina o que o agente pode ou não mencionar sobre este evento.
              </p>
              <Textarea
                value={form.rules}
                onChange={e => setForm(f => ({ ...f, rules: e.target.value }))}
                placeholder={"Ex: Mencionar que a data é próxima e criar senso de urgência.\nNão informar valores de desconto sem confirmar com o responsável."}
                rows={3}
                className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Data <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="[color-scheme:dark]"
                />
              </div>
              <div className="grid gap-2">
                <Label>Horário <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                <Input
                  type="time"
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  className="[color-scheme:dark]"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Localização <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Ex: Online, Nacional, São Paulo"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Status ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Evento visível para o agente IA
                </p>
              </div>
              <Switch
                checked={form.status}
                onCheckedChange={checked => setForm(f => ({ ...f, status: checked }))}
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

      {/* ── Dialog de importação ──────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) closeImport(); }}>
        <DialogContent className="border-border bg-card sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              Importar Eventos
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Arquivo: <span className="text-foreground font-medium">{importFileName}</span>
              {" · "}{importRows.length} linha(s) encontrada(s)
              {importRows.some(r => r._error) && (
                <span className="text-destructive ml-1">
                  · {importRows.filter(r => r._error).length} com erro
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Dica de colunas */}
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">Colunas esperadas:</strong>{" "}
              titulo/title, data/date (DD/MM/YYYY ou YYYY-MM-DD), horario/time, descricao/description, local/location
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadEventosTemplate}
              className="shrink-0 border-border gap-1.5 text-xs h-7 px-2"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar modelo
            </Button>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-auto rounded-md border border-border min-h-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((row, i) => (
                  <TableRow key={i} className={cn("border-border/60", row._error ? "bg-destructive/5" : "")}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{row.title}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{row.date || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{row.time ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[140px] truncate">{row.location ?? "—"}</TableCell>
                    <TableCell>
                      {row._error ? (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {row._error}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-emerald-500">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ok
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2 pt-2">
            {importRows.some(r => r._error) && (
              <p className="text-xs text-muted-foreground mr-auto">
                Linhas com erro serão ignoradas.
              </p>
            )}
            <Button variant="ghost" onClick={closeImport} disabled={importMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => importMutation.mutate(importRows)}
              disabled={importMutation.isPending || importRows.filter(r => !r._error).length === 0}
              className="bg-gradient-ember text-primary-foreground shadow-glow hover:opacity-90"
            >
              {importMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
                : <><Upload className="h-4 w-4 mr-2" />Importar {importRows.filter(r => !r._error).length} evento(s)</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
        itemName={deleteTarget?.title}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
