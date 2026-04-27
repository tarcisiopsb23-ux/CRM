import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ExternalLink, Trash2, Star, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useTalentPool } from "@/hooks/useTalentPool";
import type { TalentPool, ApplicationStatus } from "@/types/recruitment";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  contratado: "Contratado",
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  novo: "bg-blue-100 text-blue-700",
  em_analise: "bg-yellow-100 text-yellow-700",
  aprovado: "bg-emerald-100 text-emerald-700",
  reprovado: "bg-red-100 text-red-700",
  contratado: "bg-violet-100 text-violet-700",
};

function ScoreBadge({ percent }: { percent: number }) {
  const color = percent >= 70 ? "text-emerald-600" : percent >= 40 ? "text-yellow-600" : "text-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percent}%`,
            backgroundColor: percent >= 70 ? "#10b981" : percent >= 40 ? "#f59e0b" : "#ef4444",
          }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums ${color}`}>{Math.round(percent)}%</span>
    </div>
  );
}

interface Props {
  organizationId: string;
  canEdit?: boolean;
}

export function TalentPoolTab({ organizationId, canEdit = false }: Props) {
  const { data: pool = [], isLoading, updateStatus, remove } = useTalentPool(organizationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [selected, setSelected] = useState<TalentPool | null>(null);
  const [notes, setNotes] = useState("");
  const [newStatus, setNewStatus] = useState<ApplicationStatus>("novo");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TalentPool | null>(null);
  const [expandedReqs, setExpandedReqs] = useState<string | null>(null);

  const filtered = pool.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.desired_role ?? "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openDetail = (p: TalentPool) => {
    setSelected(p);
    setNotes(p.notes ?? "");
    setNewStatus(p.status);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateStatus.mutateAsync({ id: selected.id, status: newStatus, notes });
      toast.success("Perfil atualizado.");
      setSelected(null);
    } catch { toast.error("Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Perfil removido.");
      setDeleteTarget(null);
    } catch { toast.error("Erro ao remover."); }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail ou cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApplicationStatus | "all")}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.entries(STATUS_LABELS) as [ApplicationStatus, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="ml-auto">{filtered.length} perfil{filtered.length !== 1 ? "is" : ""}</Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground border-2 border-dashed rounded-xl">
            <Star className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum perfil no banco de talentos</p>
            <p className="text-sm mt-1">Candidatos espontâneos aparecerão aqui.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Cargo desejado</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Requisitos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const checkedReqs = (p.requirements_match ?? []).filter((r: any) => r.checked);
                  const totalReqs = (p.requirements_match ?? []).length;
                  const isExpanded = expandedReqs === p.id;

                  return (
                    <>
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openDetail(p)}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{p.full_name}</p>
                            <p className="text-xs text-muted-foreground">{p.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.desired_role || "—"}</TableCell>
                        <TableCell><ScoreBadge percent={p.score_percent} /></TableCell>
                        <TableCell>
                          {totalReqs > 0 ? (
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); setExpandedReqs(isExpanded ? null : p.id); }}
                            >
                              {checkedReqs.length}/{totalReqs}
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>
                            {STATUS_LABELS[p.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(parseISO(p.created_at), "dd/MM/yy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {p.linkedin_url && (
                              <Button size="sm" variant="ghost" asChild title="LinkedIn">
                                <a href={p.linkedin_url} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            {canEdit && (
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(p)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && totalReqs > 0 && (
                        <TableRow key={`${p.id}-reqs`}>
                          <TableCell colSpan={7} className="bg-muted/20 py-2 px-6">
                            <div className="flex flex-wrap gap-2">
                              {(p.requirements_match as any[]).map((r: any) => (
                                <span
                                  key={r.id}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${r.checked ? "bg-violet-100 text-violet-700 border-violet-200" : "bg-muted text-muted-foreground border-border"}`}
                                >
                                  {r.checked ? "✓ " : "✗ "}{r.label}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialog: detalhe do perfil */}
      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.full_name}</DialogTitle>
            <DialogDescription>{selected?.email} · {selected?.phone}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              {selected.desired_role && (
                <div><p className="text-xs text-muted-foreground">Cargo desejado</p><p className="font-medium">{selected.desired_role}</p></div>
              )}
              {selected.cover_letter && (
                <div><p className="text-xs text-muted-foreground">Apresentação</p><p className="text-sm whitespace-pre-line">{selected.cover_letter}</p></div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Score total</p><p className="font-bold">{Math.round(selected.score_percent)}% ({selected.score_total}/{selected.score_max} pts)</p></div>
                <div><p className="text-xs text-muted-foreground">Requisitos</p><p className="font-bold">{(selected.requirements_match ?? []).filter((r: any) => r.checked).length}/{(selected.requirements_match ?? []).length} marcados</p></div>
              </div>
              {selected.linkedin_url && (
                <a href={selected.linkedin_url} target="_blank" rel="noreferrer" className="text-sm text-violet-600 hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3.5 w-3.5" /> LinkedIn
                </a>
              )}
              {canEdit && (
                <>
                  <div>
                    <Label>Status</Label>
                    <Select value={newStatus} onValueChange={(v) => setNewStatus(v as ApplicationStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(STATUS_LABELS) as [ApplicationStatus, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Observações internas</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notas sobre o candidato..." />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
            {canEdit && (
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover do banco de talentos</DialogTitle>
            <DialogDescription>Remover <strong>{deleteTarget?.full_name}</strong>? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
