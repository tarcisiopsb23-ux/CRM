import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EditCollaboratorDialog } from "./EditCollaboratorDialog";
import type { TeamRow } from "@/hooks/useTeams";
import type { TeamMemberRow } from "@/hooks/useTeams";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import type { ProfileRow } from "@/hooks/useProfiles";
import { usePayrollsByProfile } from "@/hooks/usePayrolls";
import { Trash2, Camera, Search, Plus, Loader2, Pencil, Clock, ShieldCheck, Timer } from "lucide-react";
import {
  useRepPAdminAuthorizeLimit,
  useRepPAdminAuthorizeReentry,
  useRepPAdminCreatePunch,
  type RepPPunchType,
} from "@/hooks/useTimeClock";
import { fetchAddressByCep } from "@/lib/viacep";
import { useAuth } from "@/contexts/AuthContext";
import { useSupplierExpenses } from "@/hooks/useFinancial";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneBR, formatBRL, formatCpfCnpj } from "@/lib/formatters";
import { useNavigate } from "react-router-dom";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { getDriveFoldersFromOrganizationSettings, useOrganizationSettings } from "@/hooks/useSettings";
import { DocumentsCard } from "@/components/documents/DocumentsCard";
import { CollaboratorTimeclockTab } from "./CollaboratorTimeclockTab";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Props {
  profiles: ProfileRow[];
  teams: TeamRow[];
  members: TeamMemberRow[];
  selectedProfileId?: string | null;
  loading?: boolean;
}

export function TeamProfilesList({ profiles, teams, members, selectedProfileId, loading }: Props) {
  const organizationId = useOrganization();
  const orgSettings = useOrganizationSettings(organizationId);
  const driveFolders = getDriveFoldersFromOrganizationSettings(orgSettings.data);
  const { update, remove } = useProfiles(organizationId);
  const { profile: me } = useAuth();
  const isAdmin = me?.role === "owner" || me?.role === "admin";
  const expenses = useSupplierExpenses(organizationId);
  const employeesPermission = usePermissionForScope("team", "employees");
  const navigate = useNavigate();
  const [allPaymentsOpen, setAllPaymentsOpen] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<ProfileRow | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<ProfileRow | null>(null);

  // Dialogs de ponto
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitForm, setLimitForm] = useState<{ authType: "late_break" | "late_return"; justification: string }>({ authType: "late_break", justification: "" });
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [overtimeForm, setOvertimeForm] = useState<{ authorizedMinutes: number; justification: string }>({ authorizedMinutes: 60, justification: "" });
  const [manualPunchOpen, setManualPunchOpen] = useState(false);
  const [manualPunchForm, setManualPunchForm] = useState<{ date: string; time: string; type: RepPPunchType; justification: string }>({
    date: format(new Date(), "yyyy-MM-dd"),
    time: format(new Date(), "HH:mm"),
    type: "entrada",
    justification: "",
  });

  const authorizeLimit = useRepPAdminAuthorizeLimit();
  const createPunch = useRepPAdminCreatePunch();

  const submitLimit = async () => {
    if (!viewing) return;
    try {
      if (!limitForm.justification.trim()) { toast.error("Justificativa obrigatória"); return; }
      await authorizeLimit.mutateAsync({
        userId: viewing.id,
        forDate: format(new Date(), "yyyy-MM-dd"),
        authType: limitForm.authType,
        justification: limitForm.justification,
      });
      toast.success("Autorização concedida — colaborador tem 5 minutos para registrar");
      setLimitOpen(false);
      setLimitForm((p) => ({ ...p, justification: "" }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao autorizar");
    }
  };

  const submitOvertime = async () => {
    if (!viewing) return;
    try {
      if (!overtimeForm.justification.trim()) { toast.error("Justificativa obrigatória"); return; }
      if (overtimeForm.authorizedMinutes <= 0) { toast.error("Informe os minutos autorizados"); return; }
      await authorizeLimit.mutateAsync({
        userId: viewing.id,
        forDate: format(new Date(), "yyyy-MM-dd"),
        authType: "overtime",
        justification: overtimeForm.justification,
        authorizedMinutes: overtimeForm.authorizedMinutes,
      });
      toast.success(`Hora extra autorizada: ${overtimeForm.authorizedMinutes} min`);
      setOvertimeOpen(false);
      setOvertimeForm((p) => ({ ...p, justification: "" }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao autorizar hora extra");
    }
  };

  const submitManualPunch = async () => {
    if (!viewing) return;
    try {
      if (!manualPunchForm.justification.trim()) { toast.error("Justificativa obrigatória"); return; }
      const occurredAtIso = new Date(`${manualPunchForm.date}T${manualPunchForm.time}:00`).toISOString();
      await createPunch.mutateAsync({
        userId: viewing.id,
        occurredAtIso,
        type: manualPunchForm.type,
        justification: manualPunchForm.justification,
      });
      toast.success("Registro de ponto incluído");
      setManualPunchOpen(false);
      setManualPunchForm((p) => ({ ...p, justification: "" }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar ponto");
    }
  };

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [form, setForm] = useState<{ full_name: string; email: string; phone: string; role: string; is_active: boolean; avatar_url: string | null }>({
    full_name: "",
    email: "",
    phone: "",
    role: "member",
    is_active: true,
    avatar_url: null,
  });
  const [extraForm, setExtraForm] = useState<{
    display_name: string;
    cpf: string;
    rg: string;
    pix_key: string;
    address_street: string;
    address_city: string;
    address_state: string;
    address_zip: string;
    education_level: string;
    graduation: string;
    job_title: string;
    base_salary: string;
    commission_percent: string;
    overtime_factor: string;
    notes: string;
  }>({
    display_name: "",
    cpf: "",
    rg: "",
    pix_key: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    education_level: "fundamental",
    graduation: "",
    job_title: "",
    base_salary: "",
    commission_percent: "",
    overtime_factor: "",
    notes: "",
  });

  const [uploading, setUploading] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    try {
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const timestamp = new Date().getTime();
      const filePath = `${editing.id}/${timestamp}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setForm((f) => ({ ...f, avatar_url: publicUrl }));
      toast.success("Foto carregada. Salve para confirmar.");
    } catch (err) {
      const error = err as Error;
      if (error.message === "Bucket not found") {
        toast.error("Configuração pendente: O bucket 'avatars' não foi encontrado no Supabase.");
      } else {
        toast.error(error.message || "Erro ao fazer upload da foto");
      }
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = () => {
    setForm((f) => ({ ...f, avatar_url: null }));
    toast.success("Foto removida. Salve para confirmar.");
  };

  const getTeamName = (profileId: string) => {
    const m = members.find((x) => x.profile_id === profileId);
    if (!m) return null;
    return teams.find((t) => t.id === m.team_id)?.name ?? null;
  };

  const openEdit = (p: ProfileRow) => {
    if (!employeesPermission.canEdit) return;
    setEditing(p);
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    setExtraForm({
      display_name: (meta.display_name as string) ?? "",
      cpf: (meta.cpf as string) ?? "",
      rg: (meta.rg as string) ?? "",
      pix_key: (meta.pix_key as string) ?? "",
      address_street: (meta.address_street as string) ?? "",
      address_city: (meta.address_city as string) ?? "",
      address_state: (meta.address_state as string) ?? "",
      address_zip: (meta.address_zip as string) ?? "",
      education_level: (meta.education_level as string) ?? "fundamental",
      graduation: (meta.graduation as string) ?? "",
      job_title: (meta.job_title as string) ?? "",
      base_salary: String((meta.base_salary as number | string | undefined) ?? ""),
      commission_percent: String((meta.commission_percent as number | string | undefined) ?? ""),
      overtime_factor: String((meta.overtime_factor as number | string | undefined) ?? ""),
      notes: (meta.notes as string) ?? "",
    });
    setForm({
      full_name: p.full_name,
      email: p.email,
      phone: p.phone ?? "",
      role: p.role,
      is_active: !!p.is_active,
      avatar_url: p.avatar_url,
    });
  };

  const handleCepSearch = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      setSearchingCep(true);
      try {
        const address = await fetchAddressByCep(cleanCep);
        if (address) {
          setExtraForm((f) => ({
            ...f,
            address_street: `${address.logradouro}${address.bairro ? `, ${address.bairro}` : ""}`,
            address_city: address.localidade,
            address_state: address.uf,
            address_zip: address.cep,
          }));
          toast.success("Endereço preenchido pelo CEP!");
        } else {
          toast.error("CEP não encontrado.");
        }
      } catch {
        toast.error("Erro ao buscar CEP.");
      } finally {
        setSearchingCep(false);
      }
    }
  };

  const handleSave = async () => {
    if (!employeesPermission.canEdit) return;
    if (!editing) return;
    const metadata = {
      ...(editing.metadata ?? {}),
      display_name: extraForm.display_name || null,
      cpf: extraForm.cpf || null,
      rg: extraForm.rg || null,
      pix_key: extraForm.pix_key || null,
      address_street: extraForm.address_street || null,
      address_city: extraForm.address_city || null,
      address_state: extraForm.address_state || null,
      address_zip: extraForm.address_zip || null,
      education_level: extraForm.education_level || null,
      graduation: extraForm.graduation || null,
      job_title: extraForm.job_title || null,
      base_salary: Number(extraForm.base_salary) || 0,
      commission_percent: Number(extraForm.commission_percent) || 0,
      overtime_factor: Number(extraForm.overtime_factor) || 1.5,
      notes: extraForm.notes || null,
    };
    try {
      await update.mutateAsync({ id: editing.id, ...form, metadata });
      setEditing(null);
      setViewing(null);
      toast.success("Colaborador salvo com sucesso");
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Erro ao salvar colaborador");
    }
  };

  const payrollByMonth = (() => {
    if (!editing) return [];
    const meta = (editing.metadata ?? {}) as Record<string, unknown>;
    const base = Number((meta.base_salary as number | string | undefined) ?? 0);
    const grouped: Record<string, { base: number; commission: number; bonus: number; overtime: number; total: number }> = {};
    for (const e of expenses.data ?? []) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      if (m.kind !== "payroll" || m.profile_id !== editing.id) continue;
      const key = e.due_date.slice(0, 7);
      grouped[key] ||= { base: 0, commission: 0, bonus: 0, overtime: 0, total: 0 };
      const type = m.type as string;
      const val = Number(e.value ?? 0);
      if (type === "commission") grouped[key].commission += val;
      else if (type === "bonus") grouped[key].bonus += val;
      else if (type === "overtime") grouped[key].overtime += val;
    }
    return Object.keys(grouped).sort().reverse().slice(0, 6).map((k) => {
      const r = grouped[k];
      r.base = base;
      r.total = r.base + r.commission + r.bonus + r.overtime;
      return { month: k, ...r };
    });
  })();

  const payrollEntries = usePayrollsByProfile(organizationId, viewing?.id);
  const payrollSorted = useMemo(() => {
    const list = payrollEntries.data ?? [];
    return [...list].sort((a, b) => String(b.reference_date).localeCompare(String(a.reference_date)));
  }, [payrollEntries.data]);
  const payrollLatest12 = useMemo(() => payrollSorted.slice(0, 12), [payrollSorted]);
  const payrollHasMore = payrollSorted.length > 12;

  useEffect(() => {
    const id = selectedProfileId ?? null;
    if (!id) { setViewing(null); setEditing(null); return; }
    const found = profiles.find((p) => String(p.id) === String(id)) ?? null;
    setViewing(found);
    setEditing(null);
  }, [profiles, selectedProfileId]);

  const canResetPassword = (me?.role === "admin" || me?.role === "owner") && employeesPermission.canEdit;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canResetPassword) return;
    if (!viewing?.id) return;
    if (!newPassword || newPassword.length < 6) { toast.error("Senha deve ter no mínimo 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { toast.error("As senhas não conferem"); return; }
    setChangingPassword(true);
    try {
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) throw refreshErr;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? "";
      if (!accessToken || accessToken.split(".").length !== 3) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const { data, error } = await supabase.functions.invoke("set-user-password", {
        body: { user_id: viewing.id, password: newPassword },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error(String((data as any).error));
      toast.success("Senha alterada com sucesso");
      setPasswordOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao alterar senha";
      const raw = typeof err === "object" && err ? (err as any) : null;
      const status = raw?.context?.status ?? raw?.status ?? null;
      const serviceMsg = raw?.context?.body ? String(raw.context.body) : "";
      const combined = [msg, serviceMsg].filter(Boolean).join(" ");
      if (combined.includes("Invalid JWT") || combined.includes("JWT") || status === 401) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      toast.error(combined || "Erro ao alterar senha");
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  if (!profiles.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Nenhum colaborador na organização. Usuários convidados aparecerão aqui.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Dialog: alterar senha */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>Defina uma nova senha para este colaborador.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />
            </div>
            <div className="space-y-2">
              <Label>Confirmar senha</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)} disabled={changingPassword}>Cancelar</Button>
              <Button type="submit" disabled={changingPassword || !canResetPassword}>
                {changingPassword ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Salvar senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar exclusão */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{profileToDelete?.full_name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!profileToDelete) return;
                try {
                  await remove.mutateAsync(profileToDelete.id);
                  toast.success("Colaborador excluído");
                  setDeleteConfirmOpen(false);
                  setProfileToDelete(null);
                  setViewing(null);
                  navigate("/team");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Erro ao excluir");
                }
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: autorizar entrada/saída fora do horário */}
      <Dialog open={limitOpen} onOpenChange={setLimitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Autorizar entrada/saída fora do horário</DialogTitle>
            <DialogDescription>Concede autorização temporária (5 min) para o colaborador registrar o ponto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de autorização</Label>
              <Select value={limitForm.authType} onValueChange={(v) => setLimitForm((p) => ({ ...p, authType: v as "late_break" | "late_return" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="late_break">Saída para intervalo fora do horário</SelectItem>
                  <SelectItem value="late_return">Retorno do intervalo fora do horário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Justificativa</Label>
              <Input value={limitForm.justification} onChange={(e) => setLimitForm((p) => ({ ...p, justification: e.target.value }))} placeholder="Descreva o motivo..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitOpen(false)}>Cancelar</Button>
            <Button onClick={submitLimit} disabled={authorizeLimit.isPending}>
              {authorizeLimit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Autorizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: autorizar hora extra */}
      <Dialog open={overtimeOpen} onOpenChange={setOvertimeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Autorizar hora extra</DialogTitle>
            <DialogDescription>Permite que o colaborador trabalhe além do horário normal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Minutos autorizados</Label>
              <Input type="number" min={1} value={overtimeForm.authorizedMinutes} onChange={(e) => setOvertimeForm((p) => ({ ...p, authorizedMinutes: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Justificativa</Label>
              <Input value={overtimeForm.justification} onChange={(e) => setOvertimeForm((p) => ({ ...p, justification: e.target.value }))} placeholder="Descreva o motivo..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOvertimeOpen(false)}>Cancelar</Button>
            <Button onClick={submitOvertime} disabled={authorizeLimit.isPending}>
              {authorizeLimit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Autorizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: registrar ponto manual */}
      <Dialog open={manualPunchOpen} onOpenChange={setManualPunchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar ponto manual</DialogTitle>
            <DialogDescription>Registre uma batida de ponto informando data, hora e tipo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={manualPunchForm.date} onChange={(e) => setManualPunchForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={manualPunchForm.time} onChange={(e) => setManualPunchForm((p) => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de registro</Label>
              <Select value={manualPunchForm.type} onValueChange={(v) => setManualPunchForm((p) => ({ ...p, type: v as RepPPunchType }))}>
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
              <Input value={manualPunchForm.justification} onChange={(e) => setManualPunchForm((p) => ({ ...p, justification: e.target.value }))} placeholder="Ex: colaborador fez visita externa antes de chegar..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualPunchOpen(false)}>Cancelar</Button>
            <Button onClick={submitManualPunch} disabled={createPunch.isPending}>
              {createPunch.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <EditCollaboratorDialog
          open={editDialogOpen}
          onClose={() => { setEditDialogOpen(false); setEditing(null); }}
          profile={editing}
        />
      )}

      {/* Lista de colaboradores */}
      {!selectedProfileId
        ? profiles.map((p) => (
            <Card key={p.id}>
              <button type="button" className="w-full text-left" onClick={() => navigate(`/team/employees/${p.id}`)}>
                <CardContent className="flex items-center gap-4 p-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={p.avatar_url || ""} alt={p.full_name} />
                    <AvatarFallback className="text-sm">
                      {p.full_name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.full_name}</div>
                    <p className="text-sm text-muted-foreground truncate">{p.email}</p>
                    {(() => {
                      const meta = (p.metadata ?? {}) as Record<string, unknown>;
                      const cargo = String((meta.job_title ?? meta.cargo ?? "") as string).trim();
                      return cargo ? <p className="text-xs text-muted-foreground truncate">Cargo: {cargo}</p> : null;
                    })()}
                    {getTeamName(p.id) ? <p className="text-xs text-muted-foreground truncate">Equipe: {getTeamName(p.id)}</p> : null}
                    {p.phone ? <p className="text-xs text-muted-foreground truncate">{formatPhoneBR(p.phone)}</p> : null}
                  </div>
                  <Badge variant={p.is_active ? "default" : "secondary"}>
                    {(() => {
                      const meta = (p.metadata ?? {}) as Record<string, unknown>;
                      const cargo = String((meta.job_title ?? meta.cargo ?? "") as string).trim();
                      return cargo || "Sem cargo";
                    })()}
                  </Badge>
                </CardContent>
              </button>
            </Card>
          ))
        : null}

      {/* Detalhe do colaborador */}
      {viewing ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              {/* Avatar + nome */}
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={viewing.avatar_url || ""} alt={viewing.full_name} />
                  <AvatarFallback className="text-xl gradient-primary text-primary-foreground">
                    {viewing.full_name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <CardTitle className="text-lg truncate">{viewing.full_name}</CardTitle>
                  <div className="text-sm text-muted-foreground truncate">{viewing.email}</div>
                </div>
              </div>

              {/* Botões — duas linhas */}
              <div className="flex flex-col items-end gap-2">
                {/* Linha 1: botões de ponto (somente admin/owner) */}
                {isAdmin && (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button size="sm" variant="outline" onClick={() => setLimitOpen(true)}>
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Autorizar entrada/saída
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setOvertimeOpen(true)}>
                      <Timer className="h-3.5 w-3.5 mr-1" /> Hora extra
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setManualPunchOpen(true)}>
                      <Clock className="h-3.5 w-3.5 mr-1" /> Registrar ponto
                    </Button>
                  </div>
                )}
                {/* Linha 2: gestão do colaborador */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Button size="sm" variant="outline" onClick={() => setPasswordOpen(true)} disabled={!canResetPassword}>
                    Alterar senha
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(viewing); setEditDialogOpen(true); }} disabled={!employeesPermission.canEdit}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => { setProfileToDelete(viewing); setDeleteConfirmOpen(true); }}
                    disabled={!employeesPermission.canDelete}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate("/team")}>
                    Fechar
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{viewing.full_name}</div>
                  <div className="text-sm text-muted-foreground truncate">{viewing.email}</div>
                  <div className="text-sm text-muted-foreground">{viewing.phone ? formatPhoneBR(viewing.phone) : "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={viewing.is_active ? "default" : "secondary"}>
                    {(() => {
                      const meta = (viewing.metadata ?? {}) as Record<string, unknown>;
                      const cargo = String((meta.job_title ?? meta.cargo ?? "") as string).trim();
                      return cargo || "Sem cargo";
                    })()}
                  </Badge>
                  {getTeamName(viewing.id) ? <Badge variant="outline">{getTeamName(viewing.id)}</Badge> : null}
                </div>
              </div>

              <Tabs defaultValue="dados" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="dados">Dados cadastrais</TabsTrigger>
                  <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
                  <TabsTrigger value="ponto">Folha de Ponto</TabsTrigger>
                  <TabsTrigger value="documentos">Documentos</TabsTrigger>
                </TabsList>

                <TabsContent value="dados">
                  {(() => {
                    const meta = (viewing.metadata ?? {}) as Record<string, unknown>;
                    const cpf = (meta.cpf as string | undefined) ?? "";
                    const rg = (meta.rg as string | undefined) ?? "";
                    const pixKey = (meta.pix_key as string | undefined) ?? "";
                    const jobTitle = String((meta.job_title ?? meta.cargo ?? "") as string).trim();
                    const baseSalary = Number((meta.base_salary as number | string | undefined) ?? 0);
                    const displayName = (meta.display_name as string | undefined) ?? "";
                    const addressStreet = (meta.address_street as string | undefined) ?? "";
                    const addressCity = (meta.address_city as string | undefined) ?? "";
                    const addressState = (meta.address_state as string | undefined) ?? "";
                    const addressZip = (meta.address_zip as string | undefined) ?? "";
                    const educationLevel = (meta.education_level as string | undefined) ?? "";
                    const graduation = (meta.graduation as string | undefined) ?? "";
                    const commissionPercent = Number((meta.commission_percent as number | string | undefined) ?? 0);
                    const overtimeFactor = Number((meta.overtime_factor as number | string | undefined) ?? 0);
                    const notes = (meta.notes as string | undefined) ?? "";
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Cargo</span>
                          <span className="font-medium truncate max-w-[220px]">{jobTitle || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Ativo</span>
                          <span className="font-medium">{viewing.is_active ? "Sim" : "Não"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Nome de apresentação</span>
                          <span className="font-medium">{displayName || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">CPF</span>
                          <span className="font-medium">{cpf ? formatCpfCnpj(cpf) : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">RG</span>
                          <span className="font-medium">{rg || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Chave PIX</span>
                          <span className="font-medium">{pixKey || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Endereço</span>
                          <span className="font-medium truncate max-w-[220px]">{addressStreet || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Cidade</span>
                          <span className="font-medium">{addressCity || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Estado</span>
                          <span className="font-medium">{addressState || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">CEP</span>
                          <span className="font-medium">{addressZip || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Escolaridade</span>
                          <span className="font-medium">{educationLevel || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Formação</span>
                          <span className="font-medium">{graduation || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Salário base</span>
                          <span className="font-medium">{baseSalary ? formatBRL(baseSalary) : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Comissão (%)</span>
                          <span className="font-medium">{commissionPercent ? `${commissionPercent}%` : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded border p-3">
                          <span className="text-muted-foreground">Fator hora extra</span>
                          <span className="font-medium">{overtimeFactor ? `${overtimeFactor}x` : "—"}</span>
                        </div>
                        {notes && (
                          <div className="col-span-full flex items-start justify-between rounded border p-3 gap-4">
                            <span className="text-muted-foreground shrink-0">Observações</span>
                            <span className="font-medium text-right">{notes}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="pagamentos">
                  {payrollEntries.isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : payrollLatest12.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento registrado.</p>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Competência</TableHead>
                            <TableHead className="text-right">Salário Base</TableHead>
                            <TableHead className="text-right">Comissão</TableHead>
                            <TableHead className="text-right">Bônus</TableHead>
                            <TableHead className="text-right">Descontos</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payrollLatest12.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">
                                {format(new Date(p.reference_date + "-01"), "MMMM yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
                              </TableCell>
                              <TableCell className="text-right">{formatBRL(p.base_salary)}</TableCell>
                              <TableCell className="text-right text-emerald-600">{formatBRL(p.commission)}</TableCell>
                              <TableCell className="text-right text-emerald-600">{formatBRL(p.bonus)}</TableCell>
                              <TableCell className="text-right text-rose-600">-{formatBRL(p.discounts)}</TableCell>
                              <TableCell className="text-right font-bold">{formatBRL(p.total_value)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={p.status === "paid" ? "default" : "secondary"}>
                                  {p.status === "paid" ? "Pago" : "Pendente"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {payrollHasMore && (
                        <div className="mt-3 text-center">
                          <Button variant="outline" size="sm" onClick={() => setAllPaymentsOpen(true)}>
                            Ver todos ({payrollSorted.length})
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="documentos">
                  <DocumentsCard
                    folderValue={driveFolders?.team ?? null}
                    canEdit={isAdmin}
                  />
                </TabsContent>

                <TabsContent value="ponto">
                  <CollaboratorTimeclockTab profileId={viewing.id} />
                </TabsContent>
              </Tabs>            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Dialog: todos os pagamentos */}
      <Dialog open={allPaymentsOpen} onOpenChange={setAllPaymentsOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico completo de pagamentos</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Salário Base</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Bônus</TableHead>
                <TableHead className="text-right">Descontos</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollSorted.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {format(new Date(p.reference_date + "-01"), "MMMM yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
                  </TableCell>
                  <TableCell className="text-right">{formatBRL(p.base_salary)}</TableCell>
                  <TableCell className="text-right text-emerald-600">{formatBRL(p.commission)}</TableCell>
                  <TableCell className="text-right text-emerald-600">{formatBRL(p.bonus)}</TableCell>
                  <TableCell className="text-right text-rose-600">-{formatBRL(p.discounts)}</TableCell>
                  <TableCell className="text-right font-bold">{formatBRL(p.total_value)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={p.status === "paid" ? "default" : "secondary"}>
                      {p.status === "paid" ? "Pago" : "Pendente"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
