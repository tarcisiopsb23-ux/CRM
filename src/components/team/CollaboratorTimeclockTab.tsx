import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil, Trash2, Calendar, Clock } from "lucide-react";
import {
  useRepPPunches,
  useRepPAdminVoidPunch,
  useRepPAdminCorrectPunch,
  type RepPPunchType,
  type RepPPunchRow,
} from "@/hooks/useTimeClock";
import { useOrganization } from "@/hooks/useOrganization";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PUNCH_LABELS: Record<string, string> = {
  entrada: "Entrada",
  saida_intervalo: "Saída Intervalo",
  retorno_intervalo: "Retorno Intervalo",
  saida_final: "Saída Final",
};

const PUNCH_COLORS: Record<string, string> = {
  entrada: "bg-emerald-100 text-emerald-700",
  saida_intervalo: "bg-amber-100 text-amber-700",
  retorno_intervalo: "bg-blue-100 text-blue-700",
  saida_final: "bg-slate-100 text-slate-700",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  anulado: "bg-red-100 text-red-600 line-through",
  corrigido: "bg-purple-100 text-purple-700",
};

type Period = "today" | "week" | "month" | "last_month" | "last_3_months" | "custom";

function getPeriodRange(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  switch (period) {
    case "today":
      return {
        from: format(now, "yyyy-MM-dd") + "T00:00:00",
        to: format(now, "yyyy-MM-dd") + "T23:59:59",
      };
    case "week":
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
        to: endOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      };
    case "month":
      return {
        from: startOfMonth(now).toISOString(),
        to: endOfMonth(now).toISOString(),
      };
    case "last_month":
      return {
        from: startOfMonth(subMonths(now, 1)).toISOString(),
        to: endOfMonth(subMonths(now, 1)).toISOString(),
      };
    case "last_3_months":
      return {
        from: startOfMonth(subMonths(now, 2)).toISOString(),
        to: endOfMonth(now).toISOString(),
      };
    case "custom":
      return {
        from: customFrom ? customFrom + "T00:00:00" : startOfMonth(now).toISOString(),
        to: customTo ? customTo + "T23:59:59" : endOfMonth(now).toISOString(),
      };
  }
}

interface Props {
  profileId: string;
}

export function CollaboratorTimeclockTab({ profileId }: Props) {
  const organizationId = useOrganization();
  const timeclockPerm = usePermissionForScope("team", "timeclock");
  // Permissão específica para editar/excluir registros de ponto anteriores
  const timeclockEditPerm = usePermissionForScope("team", "timeclock_edit");

  const canEditPunch = timeclockEditPerm.canEdit || timeclockPerm.canEdit;
  const canDeletePunch = timeclockEditPerm.canDelete || timeclockPerm.canDelete;

  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const { from, to } = getPeriodRange(period, customFrom, customTo);

  const { data: punches = [], isLoading } = useRepPPunches({
    organizationId: organizationId ?? undefined,
    userId: profileId,
    fromIso: from,
    toIso: to,
    status: "all",
  });

  // Agrupar por dia
  const punchByDate = useMemo(() => {
    const map: Record<string, RepPPunchRow[]> = {};
    for (const p of punches) {
      const day = p.occurred_at.slice(0, 10);
      if (!map[day]) map[day] = [];
      map[day].push(p);
    }
    return map;
  }, [punches]);

  const days = useMemo(
    () => Object.keys(punchByDate).sort((a, b) => b.localeCompare(a)),
    [punchByDate]
  );

  // Dialogs
  const [editOpen, setEditOpen] = useState(false);
  const [editPunch, setEditPunch] = useState<RepPPunchRow | null>(null);
  const [editForm, setEditForm] = useState({ date: "", time: "", type: "entrada" as RepPPunchType, justification: "" });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePunch, setDeletePunch] = useState<RepPPunchRow | null>(null);
  const [deleteJustification, setDeleteJustification] = useState("");

  const voidPunch = useRepPAdminVoidPunch();
  const correctPunch = useRepPAdminCorrectPunch();

  const openEdit = (punch: RepPPunchRow) => {
    setEditPunch(punch);
    const dt = new Date(punch.occurred_at);
    setEditForm({
      date: format(dt, "yyyy-MM-dd"),
      time: format(dt, "HH:mm"),
      type: punch.punch_type,
      justification: "",
    });
    setEditOpen(true);
  };

  const openDelete = (punch: RepPPunchRow) => {
    setDeletePunch(punch);
    setDeleteJustification("");
    setDeleteOpen(true);
  };

  const submitEdit = async () => {
    if (!editPunch) return;
    if (!editForm.justification.trim()) { toast.error("Justificativa obrigatória"); return; }
    try {
      const newOccurredAtIso = new Date(`${editForm.date}T${editForm.time}:00`).toISOString();
      await correctPunch.mutateAsync({
        punchId: editPunch.id,
        newOccurredAtIso,
        newType: editForm.type,
        justification: editForm.justification,
      });
      toast.success("Registro corrigido com sucesso");
      setEditOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao corrigir registro");
    }
  };

  const submitDelete = async () => {
    if (!deletePunch) return;
    if (!deleteJustification.trim()) { toast.error("Justificativa obrigatória"); return; }
    try {
      await voidPunch.mutateAsync({ punchId: deletePunch.id, justification: deleteJustification });
      toast.success("Registro anulado com sucesso");
      setDeleteOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao anular registro");
    }
  };

  if (!timeclockPerm.canView) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Clock className="h-8 w-8 opacity-30" />
        <p className="text-sm">Sem permissão para visualizar registros de ponto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="last_month">Mês anterior</SelectItem>
              <SelectItem value="last_3_months">Últimos 3 meses</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {period === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">De</Label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Até</Label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-36"
              />
            </div>
          </>
        )}

        <div className="text-xs text-muted-foreground self-end pb-2">
          {punches.length} registro{punches.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Registros */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Clock className="h-8 w-8 opacity-30" />
          <p className="text-sm">Nenhum registro no período selecionado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const dayPunches = punchByDate[day].sort((a, b) =>
              a.occurred_at.localeCompare(b.occurred_at)
            );
            return (
              <div key={day} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    {format(new Date(day + "T12:00:00"), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                      .replace(/^\w/, (c) => c.toUpperCase())}
                  </span>
                </div>
                <div className="space-y-2">
                  {dayPunches.map((punch) => (
                    <div
                      key={punch.id}
                      className={cn(
                        "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                        punch.status === "anulado" ? "opacity-50 bg-muted/30" : "bg-background"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full", PUNCH_COLORS[punch.punch_type])}>
                          {PUNCH_LABELS[punch.punch_type] ?? punch.punch_type}
                        </span>
                        <span className="font-mono text-sm font-medium">
                          {format(new Date(punch.occurred_at), "HH:mm")}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1.5 py-0.5", STATUS_COLORS[punch.status])}
                        >
                          {punch.status}
                        </Badge>
                        {punch.justificativa && (
                          <span className="text-xs text-muted-foreground italic truncate max-w-[200px]">
                            {punch.justificativa}
                          </span>
                        )}
                      </div>
                      {punch.status === "ativo" && (
                        <div className="flex items-center gap-1 shrink-0">
                          {canEditPunch && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEdit(punch)}
                              title="Corrigir registro"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDeletePunch && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => openDelete(punch)}
                              title="Anular registro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: corrigir registro */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corrigir registro de ponto</DialogTitle>
            <DialogDescription>
              Altere a data, hora ou tipo do registro. O registro original será marcado como corrigido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input
                  type="time"
                  value={editForm.time}
                  onChange={(e) => setEditForm((f) => ({ ...f, time: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de registro</Label>
              <Select
                value={editForm.type}
                onValueChange={(v) => setEditForm((f) => ({ ...f, type: v as RepPPunchType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida_intervalo">Saída Intervalo</SelectItem>
                  <SelectItem value="retorno_intervalo">Retorno Intervalo</SelectItem>
                  <SelectItem value="saida_final">Saída Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Justificativa</Label>
              <Input
                value={editForm.justification}
                onChange={(e) => setEditForm((f) => ({ ...f, justification: e.target.value }))}
                placeholder="Motivo da correção..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={submitEdit} disabled={correctPunch.isPending}>
              {correctPunch.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: anular registro */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular registro de ponto</DialogTitle>
            <DialogDescription>
              O registro será marcado como anulado e não contará no cálculo da jornada.
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {deletePunch && (
            <div className="rounded-lg border border-border p-3 bg-muted/30 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full", PUNCH_COLORS[deletePunch.punch_type])}>
                  {PUNCH_LABELS[deletePunch.punch_type]}
                </span>
                <span className="font-mono font-medium">
                  {format(new Date(deletePunch.occurred_at), "dd/MM/yyyy HH:mm")}
                </span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Justificativa</Label>
            <Input
              value={deleteJustification}
              onChange={(e) => setDeleteJustification(e.target.value)}
              placeholder="Motivo da anulação..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={submitDelete} disabled={voidPunch.isPending}>
              {voidPunch.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Anular registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
