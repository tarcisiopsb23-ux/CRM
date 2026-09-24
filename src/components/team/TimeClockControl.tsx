import { useMemo, useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useRepPAdminActions,
  useRepPAdminAuthorizeReentry,
  useRepPAdminCorrectPunch,
  useRepPAdminCreatePunch,
  useRepPAdminVoidPunch,
  useRepPAdminAuthorizeLimit,
  useRepPPunches,
  type RepPPunchRow,
  type RepPPunchType,
} from "@/hooks/useTimeClock";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/components/ui/sonner";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";

const TYPE_OPTIONS: Array<{ value: RepPPunchType; label: string }> = [
  { value: "entrada", label: "Entrada" },
  { value: "saida_intervalo", label: "Sa�da para intervalo" },
  { value: "retorno_intervalo", label: "Retorno do intervalo" },
  { value: "saida_final", label: "Sa�da final" },
];

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return { date: format(d, "dd/MM/yyyy"), time: format(d, "HH:mm:ss") };
  } catch {
    return { date: iso, time: "" };
  }
}

function shortHash(h?: string | null) {
  if (!h) return "-";
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}�${h.slice(-6)}`;
}

type RepPWeeklyRow = {
  user_id: string;
  week_start: string;
  weekly_worked_hours: number;
  weekly_delay_minutes: number;
  weekly_approved_overtime_minutes: number;
  expected_weekly_hours: number;
  weekly_balance_hours: number;
  has_negative_hours: boolean;
};

type RepPMonthlyRow = {
  organization_id: string;
  user_id: string;
  month_ref: string;
  days_count: number;
  total_worked_hours: number;
  inconsistencies_count: number;
  total_delay_minutes: number;
  total_approved_overtime_minutes: number;
  total_pending_overtime_minutes: number;
};

export function TimeClockControl() {
  const orgId = useOrganization();
  const { profile: me } = useAuth();
  const { data: profiles = [] } = useProfiles(orgId);

  const { canView: canEditTimeclock, isAdminOrOwner: isAdmin } = usePermissionForScope("team", "timeclock_edit");

  // Excluir owners e admins das listas de ponto � eles s�o isentos
  const timeclockProfiles = useMemo(
    () => profiles.filter((p) => p.role !== "owner" && p.role !== "admin"),
    [profiles]
  );

  const [filterUser, setFilterUser] = useState<string>(isAdmin ? "all" : me?.id ?? "all");
  const [filterFrom, setFilterFrom] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [filterTo, setFilterTo] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [filterStatus, setFilterStatus] = useState<"all" | "ativo" | "anulado" | "corrigido">("all");
  const [filterType, setFilterType] = useState<"all" | RepPPunchType>("all");

  const fromIso = useMemo(() => {
    if (!filterFrom) return undefined;
    return new Date(`${filterFrom}T00:00:00`).toISOString();
  }, [filterFrom]);

  const toIso = useMemo(() => {
    if (!filterTo) return undefined;
    return new Date(`${filterTo}T23:59:59`).toISOString();
  }, [filterTo]);

  const effectiveUserId = useMemo(() => {
    if (!isAdmin) return me?.id;
    return filterUser === "all" ? undefined : filterUser;
  }, [filterUser, isAdmin, me?.id]);

  const weeklyBalance = useQuery({
    queryKey: ["rep_p", "weekly_balance", orgId, effectiveUserId, filterFrom, filterTo],
    queryFn: async () => {
      if (!orgId) return [] as RepPWeeklyRow[];
      let q = supabase
        .from("rep_p_weekly_report" as never)
        .select("*")
        .eq("organization_id", orgId)
        .order("week_start", { ascending: false });
      
      if (effectiveUserId) q = q.eq("user_id", effectiveUserId);
      
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepPWeeklyRow[];
    },
    enabled: !!orgId,
  });

  const monthlyReport = useQuery({
    queryKey: ["rep_p", "monthly_report", orgId, effectiveUserId],
    queryFn: async () => {
      if (!orgId) return [] as RepPMonthlyRow[];
      let q = supabase
        .from("rep_p_monthly_report" as never)
        .select("*")
        .eq("organization_id", orgId)
        .order("month_ref", { ascending: false });
      
      if (effectiveUserId) q = q.eq("user_id", effectiveUserId);
      
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepPMonthlyRow[];
    },
    enabled: !!orgId,
  });

  const punches = useRepPPunches({
    organizationId: orgId ?? undefined,
    userId: effectiveUserId,
    fromIso,
    toIso,
    status: filterStatus,
    type: filterType,
  });

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) map.set(p.id, p.full_name);
    return map;
  }, [profiles]);

  const [selected, setSelected] = useState<RepPPunchRow | null>(null);
  const selectedActions = useRepPAdminActions(selected?.id ?? null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    userId: string;
    date: string;
    time: string;
    type: RepPPunchType;
    justification: string;
  }>({
    userId: me?.id ?? "",
    date: format(new Date(), "yyyy-MM-dd"),
    time: format(new Date(), "HH:mm"),
    type: "entrada",
    justification: "",
  });

  const createPunch = useRepPAdminCreatePunch();

  const submitCreate = async () => {
    try {
      if (!createForm.userId) throw new Error("Selecione um colaborador");
      if (!createForm.date || !createForm.time) throw new Error("Informe data e hor�rio");
      if (!createForm.justification.trim()) throw new Error("Justificativa obrigat�ria");
      const occurredAtIso = new Date(`${createForm.date}T${createForm.time}:00`).toISOString();
      await createPunch.mutateAsync({
        userId: createForm.userId,
        occurredAtIso,
        type: createForm.type,
        justification: createForm.justification,
      });
      toast.success("Registro inclu�do");
      setCreateOpen(false);
      setCreateForm((p) => ({ ...p, justification: "" }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao incluir registro");
    }
  };

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidJust, setVoidJust] = useState("");
  const voidPunch = useRepPAdminVoidPunch();
  const submitVoid = async () => {
    if (!selected) return;
    if (!voidJust.trim()) { toast.error("Justificativa obrigatoria"); return; }
    requirePin(
      "Anular registro de ponto",
      "Digite seu PIN de 8 digitos para confirmar o cancelamento.",
      async () => {
        await voidPunch.mutateAsync({ punchId: selected.id, justification: voidJust });
        toast.success("Registro anulado");
        setVoidOpen(false);
        setVoidJust("");
        setSelected((s) => (s ? { ...s, status: "anulado" } : s));
      }
    );
  };

  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctForm, setCorrectForm] = useState<{ date: string; time: string; type: RepPPunchType; justification: string }>(() => {
    const now = new Date();
    return { date: format(now, "yyyy-MM-dd"), time: format(now, "HH:mm"), type: "entrada", justification: "" };
  });
  const correctPunch = useRepPAdminCorrectPunch();
  const submitCorrect = async () => {
    if (!selected) return;
    if (!correctForm.justification.trim()) { toast.error("Justificativa obrigatoria"); return; }
    requirePin(
      "Corrigir registro de ponto",
      "Digite seu PIN de 8 digitos para confirmar a correcao.",
      async () => {
        const newOccurredAtIso = new Date(`${correctForm.date}T${correctForm.time}:00`).toISOString();
        await correctPunch.mutateAsync({
          punchId: selected.id,
          newOccurredAtIso,
          newType: correctForm.type,
          justification: correctForm.justification,
        });
        toast.success("Correcao registrada");
        setCorrectOpen(false);
        setCorrectForm((p) => ({ ...p, justification: "" }));
      }
    );
  };

  const [authOpen, setAuthOpen] = useState(false);
  const [authForm, setAuthForm] = useState<{ userId: string; forDate: string; justification: string }>(() => ({
    userId: "",
    forDate: format(new Date(), "yyyy-MM-dd"),
    justification: "",
  }));
  const authorize = useRepPAdminAuthorizeReentry();
  const submitAuth = async () => {
    if (!authForm.userId) { toast.error("Selecione um colaborador"); return; }
    if (!authForm.justification.trim()) { toast.error("Justificativa obrigatoria"); return; }
    requirePin(
      "Autorizar nova entrada",
      "Digite seu PIN de 8 digitos para confirmar a autorizacao.",
      async () => {
        await authorize.mutateAsync({ userId: authForm.userId, forDate: authForm.forDate, justification: authForm.justification });
        toast.success("Autorizacao registrada");
        setAuthOpen(false);
        setAuthForm((p) => ({ ...p, justification: "" }));
      }
    );
  };

  // -- Autorizar limite (intervalo tardio / retorno tardio) ------------------
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitForm, setLimitForm] = useState<{
    userId: string;
    forDate: string;
    authType: "late_break" | "late_return";
    justification: string;
  }>({
    userId: "",
    forDate: format(new Date(), "yyyy-MM-dd"),
    authType: "late_break",
    justification: "",
  });
  const authorizeLimit = useRepPAdminAuthorizeLimit();
  const submitLimit = async () => {
    if (!limitForm.userId) { toast.error("Selecione um colaborador"); return; }
    if (!limitForm.justification.trim()) { toast.error("Justificativa obrigatoria"); return; }
    requirePin(
      "Autorizar entrada/saida fora do horario",
      "Digite seu PIN de 8 digitos para confirmar a autorizacao.",
      async () => {
        await authorizeLimit.mutateAsync({
          userId: limitForm.userId,
          forDate: limitForm.forDate,
          authType: limitForm.authType,
          justification: limitForm.justification,
        });
        toast.success("Autorizacao concedida - colaborador tem 5 minutos para registrar");
        setLimitOpen(false);
        setLimitForm((p) => ({ ...p, justification: "" }));
      }
    );
  };


  // -- Relat�rio de Auditoria ------------------------------------------------
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditFrom, setAuditFrom] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [auditTo, setAuditTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [auditUser, setAuditUser] = useState("all");

  const auditPunches = useRepPPunches({
    organizationId: auditOpen ? (orgId ?? undefined) : undefined,
    userId: auditUser === "all" ? undefined : auditUser,
    fromIso: auditOpen ? new Date(`${auditFrom}T00:00:00`).toISOString() : undefined,
    toIso: auditOpen ? new Date(`${auditTo}T23:59:59`).toISOString() : undefined,
    status: "all",
  });

  const exportAuditCSV = useCallback(() => {
    const rows = auditPunches.data ?? [];
    if (!rows.length) { toast.error("Nenhum registro no per�odo selecionado"); return; }
    const header = ["id", "colaborador", "data", "hora", "tipo", "status", "origem", "ip", "prev_hash", "integrity_hash"];
    const lines = rows.map((r) => {
      const dt = fmtDateTime(r.occurred_at);
      const name = profileNameById.get(r.user_id) ?? r.user_id;
      const typeLabel = TYPE_OPTIONS.find((t) => t.value === r.punch_type)?.label ?? r.punch_type;
      return [
        r.id,
        `"${name}"`,
        dt.date,
        dt.time,
        typeLabel,
        r.status,
        r.origin,
        r.ip ?? "",
        r.prev_hash ?? "",
        r.integrity_hash,
      ].join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_ponto_${auditFrom}_${auditTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relat�rio exportado com sucesso");
  }, [auditPunches.data, auditFrom, auditTo, profileNameById]);

  // -- Autorizar hora extra --------------------------------------------------
  const [overtimeOpen, setOvertimeOpen] = useState(false);  const [overtimeForm, setOvertimeForm] = useState<{
    userId: string;
    forDate: string;
    authorizedMinutes: number;
    justification: string;
  }>({
    userId: "",
    forDate: format(new Date(), "yyyy-MM-dd"),
    authorizedMinutes: 60,
    justification: "",
  });
  // PIN auth state
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [pinTitle, setPinTitle] = useState("Autorizar acao");
  const [pinDescription, setPinDescription] = useState("Digite seu PIN de 8 digitos para confirmar.");

  const requirePin = (title: string, description: string, action: () => Promise<void>) => {
    setPinTitle(title);
    setPinDescription(description);
    setPendingAction(() => action);
    setPinOpen(true);
  };

  const submitOvertime = async () => {
    if (!overtimeForm.userId) { toast.error("Selecione um colaborador"); return; }
    if (!overtimeForm.justification.trim()) { toast.error("Justificativa obrigatoria"); return; }
    if (overtimeForm.authorizedMinutes <= 0) { toast.error("Informe a quantidade de minutos autorizados"); return; }
    requirePin(
      "Autorizar hora extra",
      "Digite seu PIN de 8 digitos para confirmar a autorizacao.",
      async () => {
        await authorizeLimit.mutateAsync({
          userId: overtimeForm.userId,
          forDate: overtimeForm.forDate,
          authType: "overtime",
          justification: overtimeForm.justification,
          authorizedMinutes: overtimeForm.authorizedMinutes,
        });
        toast.success(`Hora extra autorizada: ${overtimeForm.authorizedMinutes} min - colaborador tem 5 minutos para registrar saida`);
        setOvertimeOpen(false);
        setOvertimeForm((p) => ({ ...p, justification: "" }));
      }
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Controle de Ponto</h2>
          <p className="text-sm text-muted-foreground">Registros imut�veis com hist�rico e rastreabilidade.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="outline" onClick={() => setAuditOpen(true)}>
              <Shield className="h-4 w-4 mr-1" /> Relat�rio de Auditoria
            </Button>
            <Button variant="outline" onClick={() => setLimitOpen(true)}>
              Autorizar entrada fora do hor�rio
            </Button>
            <Button variant="outline" onClick={() => setOvertimeOpen(true)}>
              Autorizar hora extra
            </Button>
            <Button variant="outline" onClick={() => setAuthOpen(true)}>
              Autorizar nova entrada
            </Button>
            <Button onClick={() => setCreateOpen(true)}>Incluir registro</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {(filterUser !== "all" || !isAdmin) && (
          <>
            <StatCard 
              label="Total Horas Trabalhadas" 
              value={`${(weeklyBalance.data ?? []).reduce((s, w) => s + Number(w.weekly_worked_hours), 0).toFixed(1)}h`} 
            />
            <StatCard 
              label="Saldo Total de Horas" 
              value={`${(weeklyBalance.data ?? []).reduce((s, w) => s + Number(w.weekly_balance_hours), 0).toFixed(1)}h`} 
              accent={(weeklyBalance.data ?? []).reduce((s, w) => s + Number(w.weekly_balance_hours), 0) < 0 ? "text-destructive" : "text-emerald-600"}
            />
          </>
        )}
        <StatCard 
          label="Total Atrasos (Intervalo)" 
          value={`${(weeklyBalance.data ?? []).reduce((s, w) => s + Number(w.weekly_delay_minutes), 0)} min`} 
          accent="text-destructive"
        />
        <StatCard 
          label="H. Extras Aprovadas" 
          value={`${((monthlyReport.data ?? []).reduce((s, m) => s + Number(m.total_approved_overtime_minutes), 0) / 60).toFixed(1)}h`} 
          accent="text-primary"
        />
        <StatCard 
          label="Horas Negativas" 
          value={`${(weeklyBalance.data ?? []).filter(w => w.weekly_balance_hours < 0).reduce((s, w) => s + Math.abs(Number(w.weekly_balance_hours)), 0).toFixed(1)}h`} 
          accent="text-destructive"
        />
      </div>

      {weeklyBalance.data && weeklyBalance.data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {weeklyBalance.data.slice(0, 4).map((w, idx) => (
            <Card key={`${w.user_id}_${w.week_start}_${idx}`} className={w.has_negative_hours ? "border-destructive/50 bg-destructive/5" : ""}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Semana {format(parseISO(w.week_start), "dd/MM")}</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className="text-lg font-bold">{w.weekly_worked_hours.toFixed(1)}h</p>
                    <p className="text-[10px] text-muted-foreground">Meta: {w.expected_weekly_hours}h</p>
                  </div>
                  <Badge variant={w.has_negative_hours ? "destructive" : "default"} className="text-[10px]">
                    {w.weekly_balance_hours > 0 ? `+${w.weekly_balance_hours}` : w.weekly_balance_hours}h
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Filtros</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label>Colaborador</Label>
            <Select value={isAdmin ? filterUser : me?.id ?? "all"} onValueChange={setFilterUser} disabled={!isAdmin}>
              <SelectTrigger>
                <SelectValue placeholder="Colaborador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {timeclockProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Data inicial</Label>
            <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Data final</Label>
            <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="anulado">Anulado</SelectItem>
                <SelectItem value="corrigido">Corrigido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">A��es</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {punches.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : punches.data?.length ? (
                punches.data.map((r) => {
                  const dt = fmtDateTime(r.occurred_at);
                  const name = profileNameById.get(r.user_id) ?? r.user_id;
                  const typeLabel = TYPE_OPTIONS.find((t) => t.value === r.punch_type)?.label ?? r.punch_type;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{dt.date}</TableCell>
                      <TableCell className="text-sm font-medium">{dt.time}</TableCell>
                      <TableCell className="text-sm">{name}</TableCell>
                      <TableCell className="text-sm">{typeLabel}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "ativo" ? "default" : "outline"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.origin}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSelected(r)}>
                            Ver
                          </Button>
                          {isAdmin && r.status === "ativo" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelected(r);
                                  setCorrectForm(() => {
                                    const d = new Date(r.occurred_at);
                                    return {
                                      date: format(d, "yyyy-MM-dd"),
                                      time: format(d, "HH:mm"),
                                      type: r.punch_type,
                                      justification: "",
                                    };
                                  });
                                  setCorrectOpen(true);
                                }}
                              >
                                Corrigir
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setSelected(r);
                                  setVoidJust("");
                                  setVoidOpen(true);
                                }}
                              >
                                Anular
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do registro</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-4 space-y-1">
                    <p className="text-xs text-muted-foreground">Colaborador</p>
                    <p className="text-sm font-medium">{profileNameById.get(selected.user_id) ?? selected.user_id}</p>
                    <p className="text-xs text-muted-foreground mt-2">Tipo</p>
                    <p className="text-sm">{TYPE_OPTIONS.find((t) => t.value === selected.punch_type)?.label ?? selected.punch_type}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 space-y-1">
                    <p className="text-xs text-muted-foreground">Data/Hora</p>
                    <p className="text-sm font-medium">{fmtDateTime(selected.occurred_at).date} {fmtDateTime(selected.occurred_at).time}</p>
                    <p className="text-xs text-muted-foreground mt-2">Origem</p>
                    <p className="text-sm">{selected.origin}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 space-y-1">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-sm font-medium">{selected.status}</p>
                    <p className="text-xs text-muted-foreground mt-2">Origem</p>
                    <p className="text-sm">{selected.origin}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <p className="text-sm font-medium">Hist�rico de altera��es</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedActions.isLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                  ) : selectedActions.data?.length ? (
                    <div className="space-y-2">
                      {selectedActions.data.map((a) => (
                        <div key={a.id} className="rounded border p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{a.action_type}</p>
                            <p className="text-xs text-muted-foreground">{fmtDateTime(a.action_at).date} {fmtDateTime(a.action_at).time}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{a.justification}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Alert>
                      <AlertTitle>Sem altera��es</AlertTitle>
                      <AlertDescription>Este registro n�o possui a��es administrativas.</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Incluir registro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Colaborador</Label>
              <Select value={createForm.userId} onValueChange={(v) => setCreateForm((p) => ({ ...p, userId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {timeclockProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={createForm.date} onChange={(e) => setCreateForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Hor�rio</Label>
                <Input type="time" value={createForm.time} onChange={(e) => setCreateForm((p) => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={createForm.type} onValueChange={(v) => setCreateForm((p) => ({ ...p, type: v as RepPPunchType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Justificativa</Label>
              <Input
                value={createForm.justification}
                onChange={(e) => setCreateForm((p) => ({ ...p, justification: e.target.value }))}
                placeholder="Obrigat�ria para inclus�o/altera��o administrativa"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createPunch.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={createPunch.isPending}>
              {createPunch.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular registro</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">A anula��o n�o apaga o registro; cria uma a��o administrativa imut�vel.</p>
            <div className="space-y-1">
              <Label>Justificativa</Label>
              <Input value={voidJust} onChange={(e) => setVoidJust(e.target.value)} placeholder="Obrigat�ria" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voidPunch.isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={submitVoid} disabled={voidPunch.isPending}>
              {voidPunch.isPending ? "Anulando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir registro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={correctForm.date} onChange={(e) => setCorrectForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Hor�rio</Label>
                <Input type="time" value={correctForm.time} onChange={(e) => setCorrectForm((p) => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={correctForm.type} onValueChange={(v) => setCorrectForm((p) => ({ ...p, type: v as RepPPunchType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Justificativa</Label>
              <Input value={correctForm.justification} onChange={(e) => setCorrectForm((p) => ({ ...p, justification: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectOpen(false)} disabled={correctPunch.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitCorrect} disabled={correctPunch.isPending}>
              {correctPunch.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorizar nova entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Colaborador</Label>
              <Select value={authForm.userId} onValueChange={(v) => setAuthForm((p) => ({ ...p, userId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {timeclockProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={authForm.forDate} onChange={(e) => setAuthForm((p) => ({ ...p, forDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Justificativa</Label>
              <Input value={authForm.justification} onChange={(e) => setAuthForm((p) => ({ ...p, justification: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthOpen(false)} disabled={authorize.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitAuth} disabled={authorize.isPending}>
              {authorize.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Autorizar entrada fora do hor�rio */}
      <Dialog open={limitOpen} onOpenChange={setLimitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorizar entrada fora do hor�rio</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Concede ao colaborador 5 minutos para registrar a marca��o fora do limite permitido.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Colaborador</Label>
              <Select value={limitForm.userId} onValueChange={(v) => setLimitForm((p) => ({ ...p, userId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {timeclockProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={limitForm.forDate} onChange={(e) => setLimitForm((p) => ({ ...p, forDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Tipo de autoriza��o</Label>
              <Select
                value={limitForm.authType}
                onValueChange={(v) => setLimitForm((p) => ({ ...p, authType: v as "late_break" | "late_return" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="late_break">Sa�da para intervalo ap�s 6h30</SelectItem>
                  <SelectItem value="late_return">Retorno do intervalo ap�s 2h</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Justificativa</Label>
              <Input
                value={limitForm.justification}
                onChange={(e) => setLimitForm((p) => ({ ...p, justification: e.target.value }))}
                placeholder="Obrigat�ria"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitOpen(false)} disabled={authorizeLimit.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitLimit} disabled={authorizeLimit.isPending}>
              {authorizeLimit.isPending ? "Autorizando..." : "Autorizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Relat�rio de Auditoria */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Relat�rio de Auditoria
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Gera um CSV com todos os campos t�cnicos dos registros, incluindo hashes de integridade, para fins de auditoria e fiscaliza��o.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Colaborador</Label>
              <Select value={auditUser} onValueChange={setAuditUser}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {timeclockProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Data inicial</Label>
                <Input type="date" value={auditFrom} onChange={(e) => setAuditFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Data final</Label>
                <Input type="date" value={auditTo} onChange={(e) => setAuditTo(e.target.value)} />
              </div>
            </div>
            {auditPunches.isLoading && <p className="text-xs text-muted-foreground">Carregando registros...</p>}
            {!auditPunches.isLoading && (
              <p className="text-xs text-muted-foreground">
                {auditPunches.data?.length ?? 0} registro(s) encontrado(s) no per�odo.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditOpen(false)}>Cancelar</Button>
            <Button onClick={exportAuditCSV} disabled={auditPunches.isLoading || !auditPunches.data?.length}>
              <Shield className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Autorizar hora extra */}
      <Dialog open={overtimeOpen} onOpenChange={setOvertimeOpen}>        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorizar hora extra</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Permite que o colaborador registre sa�da ap�s 8h48. Informe quantos minutos extras est�o autorizados.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Colaborador</Label>
              <Select value={overtimeForm.userId} onValueChange={(v) => setOvertimeForm((p) => ({ ...p, userId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {timeclockProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={overtimeForm.forDate} onChange={(e) => setOvertimeForm((p) => ({ ...p, forDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Minutos extras autorizados</Label>
              <Input
                type="number"
                min={1}
                max={480}
                value={overtimeForm.authorizedMinutes}
                onChange={(e) => setOvertimeForm((p) => ({ ...p, authorizedMinutes: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                {overtimeForm.authorizedMinutes > 0
                  ? `${Math.floor(overtimeForm.authorizedMinutes / 60)}h${overtimeForm.authorizedMinutes % 60 > 0 ? ` ${overtimeForm.authorizedMinutes % 60}min` : ""} extras`
                  : "Informe a quantidade"}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Justificativa</Label>
              <Input
                value={overtimeForm.justification}
                onChange={(e) => setOvertimeForm((p) => ({ ...p, justification: e.target.value }))}
                placeholder="Obrigat�ria"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOvertimeOpen(false)} disabled={authorizeLimit.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitOvertime} disabled={authorizeLimit.isPending}>
              {authorizeLimit.isPending ? "Autorizando..." : "Autorizar hora extra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PinAuthDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        title={pinTitle}
        description={pinDescription}
        onConfirm={async () => { if (pendingAction) await pendingAction(); }}
      />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}







