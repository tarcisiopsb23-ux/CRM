import { useState, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, parseISO, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Trash2, Plus, Loader2, Music2, CalendarDays, Star, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Download } from "lucide-react";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/StatusBadge";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "musica_ao_vivo" | "dia_especial";

interface AgendaItem {
  id: string;
  title: string;          // nome do artista ou nome do dia especial
  description: string | null;
  rules: string | null;   // regras específicas do evento (ex: dress code, entrada, restrições)
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
  rules: string;
  date: string;
  time: string;
  location: string;
  type: EventType | "";
  status: boolean;
}

const defaultForm: FormState = {
  title: "",
  description: "",
  rules: "",
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

// ─── Import helpers ───────────────────────────────────────────────────────────

/** Normaliza um valor de data vindo da planilha para YYYY-MM-DD */
function normalizeDate(raw: unknown): string | null {
  if (!raw) return null;
  // Número serial do Excel
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) {
      const month = String(d.m).padStart(2, "0");
      const day   = String(d.d).padStart(2, "0");
      return `${d.y}-${month}-${day}`;
    }
  }
  const s = String(raw).trim();
  // YYYY-MM-DD já ok
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const p = parse(s, "dd/MM/yyyy", new Date());
    if (isValid(p)) return format(p, "yyyy-MM-dd");
  }
  // MM/DD/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const p = parse(s, "MM/dd/yyyy", new Date());
    if (isValid(p)) return format(p, "yyyy-MM-dd");
  }
  return null;
}

/** Normaliza tipo para o enum esperado */
function normalizeType(raw: unknown): EventType | null {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s.includes("music") || s.includes("música") || s.includes("musica") || s === "musica_ao_vivo") return "musica_ao_vivo";
  if (s.includes("especial") || s.includes("special") || s === "dia_especial") return "dia_especial";
  return null;
}

interface ImportRow {
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  location: string | null;
  type: EventType;
  status: "active" | "inactive";
  _error?: string;
}

/** Parseia sheet rows para ImportRow[] */
function parseSheetRows(rows: Record<string, unknown>[]): ImportRow[] {
  return rows.map((row, i) => {
    // Aceita variações de cabeçalho em pt/en, case insensitive
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase());
        if (found !== undefined) return row[found];
      }
      return undefined;
    };

    const title = String(get("titulo", "title", "artista", "artist", "nome", "name") ?? "").trim();
    const date  = normalizeDate(get("data", "date"));
    const type  = normalizeType(get("tipo", "type"));
    const time  = String(get("horario", "horário", "hora", "time") ?? "").trim() || null;
    const desc  = String(get("descricao", "descrição", "description", "descr") ?? "").trim() || null;
    const loc   = String(get("local", "localizacao", "localização", "location") ?? "").trim() || null;
    const statusRaw = String(get("status", "ativo", "active") ?? "ativo").toLowerCase().trim();
    const status: "active" | "inactive" = statusRaw === "inativo" || statusRaw === "inactive" || statusRaw === "false" || statusRaw === "0" ? "inactive" : "active";

    const errors: string[] = [];
    if (!title)  errors.push("título obrigatório");
    if (!date)   errors.push("data inválida");
    if (!type)   errors.push(`tipo inválido ("${get("tipo","type") ?? ""}")`);

    return {
      title:       title || `(linha ${i + 2})`,
      description: desc,
      date:        date ?? "",
      time,
      location:    loc,
      type:        type ?? "dia_especial",
      status,
      _error:      errors.length > 0 ? errors.join(", ") : undefined,
    };
  });
}

// ─── Template download ────────────────────────────────────────────────────────

function downloadAgendaTemplate() {
  const wb = XLSX.utils.book_new();
  const rows = [
    {
      titulo:    "Banda Exemplo",
      data:      "15/07/2025",
      tipo:      "musica_ao_vivo",
      horario:   "21:00",
      descricao: "Show de rock ao vivo",
      local:     "Salão Principal",
      status:    "ativo",
    },
    {
      titulo:    "Dia das Mães",
      data:      "11/05/2025",
      tipo:      "dia_especial",
      horario:   "12:00",
      descricao: "Almoço especial com cardápio exclusivo",
      local:     "Terraço",
      status:    "ativo",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["titulo", "data", "tipo", "horario", "descricao", "local", "status"],
  });
  // Largura de colunas
  ws["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 18 },
    { wch: 10 }, { wch: 34 }, { wch: 22 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Agenda");
  XLSX.writeFile(wb, "modelo_agenda.xlsx");
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AgendaPage() {
  const dc = useDynamicClient();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<AgendaItem | null>(null);

  // ── Import state ───────────────────────────────────────────────────────────
  const [importOpen, setImportOpen]           = useState(false);
  const [importRows, setImportRows]           = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName]   = useState("");
  const fileInputRef                          = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: async (rows: ImportRow[]) => {
      const valid = rows.filter(r => !r._error);
      if (valid.length === 0) throw new Error("Nenhum registro válido para importar.");
      const payload = valid.map(({ _error: _e, ...r }) => r);
      const { error } = await dc!.from("ai_events").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_events"] });
      toast.success(`${importRows.filter(r => !r._error).length} evento(s) importado(s) com sucesso!`);
      setImportOpen(false);
      setImportRows([]);
      setImportFileName("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function processFile(file: File) {
    if (!file) return;
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
    // Normaliza time: banco legado retorna "21:30:00", formulário usa "21:30"
    const normalizedTime = (item.time ?? "").slice(0, 5);
    setForm({
      title: item.title,
      description: item.description ?? "",
      rules: item.rules ?? "",
      date: item.date,
      time: normalizedTime,
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
      rules: form.rules.trim() || null,
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
          <div className="flex items-center gap-2">
            {/* Input de arquivo oculto */}
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
              onClick={downloadAgendaTemplate}
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
              <Plus className="h-4 w-4" />
              Adicionar
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
                      <TableCell className="text-muted-foreground">{item.time ? item.time.slice(0, 5) : "—"}</TableCell>
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
                    {item.time ? ` · ${item.time.slice(0, 5)}` : ""}
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
        <DialogContent className="border-border bg-card sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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

            {/* Localização */}
            <div className="grid gap-2">
              <Label>Localização</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Ex: Salão Principal"
              />
            </div>

            {/* Descrição */}
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Informações adicionais sobre o evento (opcional)"
                rows={3}
                className="resize-y"
              />
            </div>

            {/* Regras para o Agente Virtual */}
            <div className="grid gap-2">
              <Label>Instruções para o Agente Virtual</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Defina o que o agente pode ou não informar ao responder perguntas sobre este evento.
              </p>
              <Textarea
                value={form.rules}
                onChange={(e) => setForm((f) => ({ ...f, rules: e.target.value }))}
                placeholder={
                  "Ex: Não informar o valor do cachê do artista.\n" +
                  "Confirmar presença somente após as 18h do dia do evento.\n" +
                  "Não divulgar o setlist antecipadamente.\n" +
                  "Informar que as mesas devem ser reservadas com antecedência."
                }
                rows={4}
                className="resize-y"
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

      {/* Dialog de importação */}
      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) { setImportOpen(false); setImportRows([]); setImportFileName(""); } }}>
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

          {/* Dica de colunas esperadas */}
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">Colunas esperadas:</strong>{" "}
              titulo/title, data/date (DD/MM/YYYY ou YYYY-MM-DD), tipo/type (musica_ao_vivo | dia_especial), horario/time, descricao/description, local/location, status (ativo/inativo)
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadAgendaTemplate}
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((row, i) => (
                  <TableRow key={i} className={cn("border-border/60", row._error ? "bg-destructive/5" : "")}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">{row.title}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{row.date || "—"}</TableCell>
                    <TableCell>
                      {row.type ? (
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                          row.type === "musica_ao_vivo"
                            ? "bg-primary/10 text-primary ring-primary/20"
                            : "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                        )}>
                          {TYPE_LABELS[row.type]}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{row.time ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "default" : "secondary"} className="text-xs">
                        {row.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
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
                Linhas com erro serão ignoradas na importação.
              </p>
            )}
            <Button variant="ghost" onClick={() => { setImportOpen(false); setImportRows([]); setImportFileName(""); }} disabled={importMutation.isPending}>
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
