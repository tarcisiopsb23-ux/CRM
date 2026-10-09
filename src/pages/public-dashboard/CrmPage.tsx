import { useRef, useState } from "react";
import { Plus, Search, Upload, FileSpreadsheet, Pencil, Trash2,
  Loader2, Users, AlertCircle, CheckCircle2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useCrmContacts, type CrmContact, type CrmContactInput } from "@/hooks/useCrmContacts";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { useDynamicClient } from "@/hooks/useDynamicClient";

// ─── Helpers de importação ────────────────────────────────────────────────────

interface ImportRow extends CrmContactInput {
  _error?: string;
}

function parseContactRows(rows: Record<string, unknown>[]): ImportRow[] {
  return rows.map((row, i) => {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase());
        if (found !== undefined) return String(row[found] ?? "").trim();
      }
      return "";
    };
    const name   = get("nome", "name", "contato", "contact");
    const phone  = get("telefone", "phone", "celular", "whatsapp") || null;
    const email  = get("email", "e-mail") || null;
    const source = get("origem", "source", "canal") || "import";
    const errors: string[] = [];
    if (!name) errors.push("nome obrigatório");
    return { title: `(linha ${i + 2})`, name: name || `(linha ${i + 2})`, phone, email, source,
      _error: errors.length > 0 ? errors.join(", ") : undefined } as ImportRow;
  });
}

function downloadContactTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { nome: "João Silva", telefone: "11999998888", email: "joao@email.com", origem: "instagram" },
    { nome: "Maria Santos", telefone: "11988887777", email: "", origem: "whatsapp" },
  ], { header: ["nome", "telefone", "email", "origem"] });
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 28 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, "Contatos");
  XLSX.writeFile(wb, "modelo_contatos.xlsx");
}

// ─── Formulário de contato ────────────────────────────────────────────────────

interface ContactFormProps {
  initial?: Partial<CrmContact>;
  onSave: (data: CrmContactInput) => void;
  onCancel: () => void;
  saving: boolean;
}

function ContactForm({ initial, onSave, onCancel, saving }: ContactFormProps) {
  const [name, setName]   = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [source, setSource] = useState(initial?.source ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Nome é obrigatório."); return; }
    onSave({ name: name.trim(), phone: phone.trim() || null,
      email: email.trim() || null, source: source.trim() || null });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="grid gap-2">
        <Label>Nome <span className="text-destructive">*</span></Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>Telefone/WhatsApp</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-8888" />
        </div>
        <div className="grid gap-2">
          <Label>E-mail</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@dominio.com" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Origem</Label>
        <Input value={source} onChange={e => setSource(e.target.value)} placeholder="whatsapp, instagram, indicação..." />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving} className="bg-gradient-ember text-primary-foreground shadow-glow">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function CrmPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id;
  const userRole = auth?.user?.role ?? "viewer";
  const canEdit = ["owner", "admin", "manager", "member"].includes(userRole);

  const { data: contacts = [], isLoading, create, update, remove, importBatch } = useCrmContacts(clientId);

  const [search, setSearch]       = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]     = useState<CrmContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrmContact | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!dc) return <CredentialsErrorState />;

  const filtered = contacts.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function processFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      toast.error("Use .xlsx, .xls ou .csv"); return;
    }
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        if (!rows.length) { toast.error("Planilha vazia."); return; }
        setImportRows(parseContactRows(rows));
        setImportOpen(true);
      } catch { toast.error("Erro ao processar arquivo."); }
    };
    reader.readAsArrayBuffer(file);
  }

  const handleImport = async () => {
    const valid = importRows.filter(r => !r._error);
    if (!valid.length || !clientId) return;
    try {
      const rows = valid.map(({ _error: _e, ...r }) => ({ ...r, client_id: clientId }));
      await importBatch.mutateAsync(rows as Array<CrmContactInput & { client_id: string }>);
      toast.success(`${valid.length} contato(s) importado(s)!`);
      setImportOpen(false); setImportRows([]); setImportFileName("");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSave = async (data: CrmContactInput) => {
    if (!clientId) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...data });
        toast.success("Contato atualizado.");
      } else {
        await create.mutateAsync({ ...data, client_id: clientId });
        toast.success("Contato criado.");
      }
      setDialogOpen(false); setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Contato removido."); setDeleteTarget(null);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Clientes"
        description={`${contacts.length} contato${contacts.length !== 1 ? "s" : ""} cadastrado${contacts.length !== 1 ? "s" : ""}`}
        action={canEdit ? (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" onClick={downloadContactTemplate} className="border-border gap-2 text-muted-foreground">
              <Download className="h-4 w-4" /> Modelo
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="border-border gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Importar
            </Button>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}
              className="bg-gradient-ember text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4" /> Novo Contato
            </Button>
          </div>
        ) : undefined}
      />

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, telefone ou e-mail..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            {search ? "Nenhum contato encontrado." : "Nenhum contato cadastrado ainda."}
          </p>
          {canEdit && !search && (
            <Button variant="outline" onClick={() => setDialogOpen(true)} className="border-border">
              <Plus className="h-4 w-4 mr-2" /> Adicionar primeiro contato
            </Button>
          )}
        </div>
      ) : (
        <Card className="card-surface overflow-hidden">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Cadastrado</TableHead>
                  {canEdit && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id} className="border-border/60 hover:bg-secondary/20">
                    <TableCell className="font-semibold text-foreground">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell>
                      {c.source && (
                        <Badge variant="outline" className="text-[10px] capitalize">{c.source}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(parseISO(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => { setEditing(c); setDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteTarget(c)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="divide-y divide-border md:hidden">
            {filtered.map(c => (
              <div key={c.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{c.name}</p>
                  {c.source && <Badge variant="outline" className="text-[10px] capitalize">{c.source}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{c.phone ?? c.email ?? "—"}</p>
                {canEdit && (
                  <div className="flex gap-1 pt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => { setEditing(c); setDialogOpen(true); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive"
                      onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Remover
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="border-border bg-card sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Editar Contato" : "Novo Contato"}</DialogTitle>
          </DialogHeader>
          <ContactForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => { setDialogOpen(false); setEditing(null); }}
            saving={create.isPending || update.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog confirmação exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover Contato</DialogTitle>
            <DialogDescription>
              Deseja remover <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog importação */}
      <Dialog open={importOpen} onOpenChange={open => { if (!open) { setImportOpen(false); setImportRows([]); setImportFileName(""); } }}>
        <DialogContent className="border-border bg-card sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" /> Importar Contatos
            </DialogTitle>
            <DialogDescription>
              {importFileName} · {importRows.length} linha(s)
              {importRows.some(r => r._error) && (
                <span className="text-destructive ml-1"> · {importRows.filter(r => r._error).length} com erro</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span><strong className="text-foreground">Colunas:</strong> nome/name, telefone/phone, email, origem/source</span>
            <Button variant="outline" size="sm" onClick={downloadContactTemplate} className="shrink-0 gap-1.5 h-7 px-2 text-xs">
              <Download className="h-3.5 w-3.5" /> Modelo
            </Button>
          </div>
          <div className="flex-1 overflow-auto rounded-md border border-border min-h-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((r, i) => (
                  <TableRow key={i} className={cn("border-border/60", r._error ? "bg-destructive/5" : "")}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium max-w-[160px] truncate">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.source ?? "—"}</TableCell>
                    <TableCell>
                      {r._error
                        ? <span className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" />{r._error}</span>
                        : <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" />Ok</span>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="gap-2 pt-2">
            {importRows.some(r => r._error) && (
              <p className="text-xs text-muted-foreground mr-auto">Linhas com erro serão ignoradas.</p>
            )}
            <Button variant="ghost" onClick={() => { setImportOpen(false); setImportRows([]); }}>Cancelar</Button>
            <Button
              onClick={handleImport}
              disabled={importBatch.isPending || importRows.filter(r => !r._error).length === 0}
              className="bg-gradient-ember text-primary-foreground shadow-glow">
              {importBatch.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
                : <><Upload className="h-4 w-4 mr-2" />Importar {importRows.filter(r => !r._error).length} contato(s)</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
