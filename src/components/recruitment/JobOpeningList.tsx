import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Pencil, Users, Settings2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { JobOpening, JobOpeningStatus, LocationType } from "@/types/recruitment";

const STATUS_LABELS: Record<JobOpeningStatus, string> = {
  aberta: "Aberta",
  pausada: "Pausada",
  encerrada: "Encerrada",
};

const STATUS_COLORS: Record<JobOpeningStatus, string> = {
  aberta: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  pausada: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  encerrada: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const LOCATION_LABELS: Record<LocationType, string> = {
  presencial: "Presencial",
  remoto: "Remoto",
  hibrido: "Híbrido",
};

interface Props {
  openings: (JobOpening & { candidate_count?: number; new_candidate_count?: number })[];
  isLoading: boolean;
  canCreate: boolean;
  /** Apenas owners podem excluir vagas */
  canDelete?: boolean;
  onNew: () => void;
  onEdit: (opening: JobOpening) => void;
  onManageForm: (opening: JobOpening) => void;
  onViewCandidates: (opening: JobOpening) => void;
  onDelete?: (id: string) => Promise<void>;
}

export function JobOpeningList({
  openings,
  isLoading,
  canCreate,
  canDelete = false,
  onNew,
  onEdit,
  onManageForm,
  onViewCandidates,
  onDelete,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobOpeningStatus | "all">("all");
  const [deleteTarget, setDeleteTarget] = useState<JobOpening | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = openings.filter((o) => {
    const matchSearch =
      !search ||
      o.title.toLowerCase().includes(search.toLowerCase()) ||
      (o.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (o.job_title ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      toast.success(`Vaga "${deleteTarget.title}" excluída.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir vaga.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Buscar vagas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as JobOpeningStatus | "all")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.entries(STATUS_LABELS) as [JobOpeningStatus, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate && (
            <Button onClick={onNew} className="ml-auto">
              <Plus className="h-4 w-4 mr-2" />
              Nova vaga
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Carregando vagas...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {openings.length === 0
              ? "Nenhuma vaga cadastrada."
              : "Nenhuma vaga encontrada com os filtros aplicados."}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vaga</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Candidatos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{o.title}</p>
                        {o.job_title && <p className="text-xs text-muted-foreground">{o.job_title}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.department ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {o.location_type ? LOCATION_LABELS[o.location_type] : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status]}`}>
                        {STATUS_LABELS[o.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-sm font-medium">{o.candidate_count ?? 0}</span>
                        {(o.new_candidate_count ?? 0) > 0 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-blue-100 text-blue-700">
                            {o.new_candidate_count} novo{(o.new_candidate_count ?? 0) !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Ver candidatos"
                          onClick={() => onViewCandidates(o)}
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Configurar formulário"
                          onClick={() => onManageForm(o)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        {canCreate && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Editar vaga"
                            onClick={() => onEdit(o)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && onDelete && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Excluir vaga"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(o)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialog de confirmação de exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir vaga</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a vaga{" "}
              <strong>"{deleteTarget?.title}"</strong>?
              <br />
              Todos os candidatos e formulários vinculados serão removidos. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir vaga"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
