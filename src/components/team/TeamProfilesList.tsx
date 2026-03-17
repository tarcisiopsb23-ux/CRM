import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import type { ProfileRow } from "@/hooks/useProfiles";
import type { TeamRow } from "@/hooks/useTeams";
import type { TeamMemberRow } from "@/hooks/useTeams";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { usePayrollsByProfile } from "@/hooks/usePayrolls";
import { Trash2, Camera, Search, Plus, Loader2, Pencil } from "lucide-react";
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
  const expenses = useSupplierExpenses(organizationId);
  const employeesPermission = usePermissionForScope("team", "employees");
  const navigate = useNavigate();
  const [allPaymentsOpen, setAllPaymentsOpen] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [viewing, setViewing] = useState<ProfileRow | null>(null);
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
      // O bucket 'avatars' DEVE ser público no Supabase para que getPublicUrl funcione.
      const timestamp = new Date().getTime();
      const filePath = `${editing.id}/${timestamp}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      setForm((f) => ({ ...f, avatar_url: publicUrl }));
      toast.success("Foto carregada. Salve para confirmar.");
    } catch (err) {
      const error = err as Error;
      console.error("Erro no upload:", error);
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
      } catch (error) {
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
      await update.mutateAsync({
        id: editing.id,
        ...form,
        metadata,
      });
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
    return Object.keys(grouped)
      .sort()
      .reverse()
      .slice(0, 6)
      .map((k) => {
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
    if (!id) {
      setViewing(null);
      setEditing(null);
      return;
    }
    const found = profiles.find((p) => String(p.id) === String(id)) ?? null;
    setViewing(found);
    setEditing(null);
  }, [profiles, selectedProfileId]);

  const canResetPassword = (me?.role === "admin" || me?.role === "owner") && employeesPermission.canEdit;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canResetPassword) return;
    if (!viewing?.id) return;
    if (!newPassword || newPassword.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }

    setChangingPassword(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Sessão expirada. Faça login novamente.");

      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      const accessToken = refreshed.session?.access_token ?? sessionData.session.access_token;
      if (refreshErr || !accessToken) throw new Error("Sessão expirada. Faça login novamente.");

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
      toast.error(msg.includes("Invalid JWT") ? "Sessão expirada. Faça login novamente." : msg);
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

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
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>Defina uma nova senha para este colaborador.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)} disabled={changingPassword}>
                Cancelar
              </Button>
              <Button type="submit" disabled={changingPassword || !canResetPassword}>
                {changingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  "Salvar senha"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {!selectedProfileId
        ? profiles.map((p) => (
            <Card key={p.id}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => navigate(`/team/employees/${p.id}`)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={p.avatar_url || ""} alt={p.full_name} />
                    <AvatarFallback className="text-sm">
                      {p.full_name
                        .split(" ")
                        .filter(Boolean)
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.full_name}</div>
                    <p className="text-sm text-muted-foreground truncate">{p.email}</p>
                    {(() => {
                      const meta = (p.metadata ?? {}) as Record<string, unknown>;
                      const cargo = String((meta.job_title ?? meta.cargo ?? "") as string).trim();
                      return cargo ? (
                        <p className="text-xs text-muted-foreground truncate">Cargo: {cargo}</p>
                      ) : null;
                    })()}
                    {getTeamName(p.id) ? (
                      <p className="text-xs text-muted-foreground truncate">Equipe: {getTeamName(p.id)}</p>
                    ) : null}
                    {p.phone ? (
                      <p className="text-xs text-muted-foreground truncate">{formatPhoneBR(p.phone)}</p>
                    ) : null}
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

      {viewing ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={viewing.avatar_url || ""} alt={viewing.full_name} />
                  <AvatarFallback className="text-xl gradient-primary text-primary-foreground">
                    {viewing.full_name
                      .split(" ")
                      .filter(Boolean)
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <CardTitle className="text-lg truncate">{viewing.full_name}</CardTitle>
                  <div className="text-sm text-muted-foreground truncate">{viewing.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate(`/team/edit/${viewing.id}`)} disabled={!employeesPermission.canEdit}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPasswordOpen(true)}
                  disabled={!canResetPassword}
                >
                  Alterar senha
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    const meta = (viewing.metadata ?? {}) as Record<string, unknown>;
                    const cargo = String((meta.job_title ?? meta.cargo ?? "") as string).trim();
                    const label = cargo ? `${viewing.full_name} (${cargo})` : viewing.full_name;
                    if (!window.confirm(`Excluir o colaborador ${label}?`)) return;
                    remove.mutate(viewing.id);
                    navigate("/team");
                  }}
                  disabled={!employeesPermission.canDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/team")}>
                  Fechar
                </Button>
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
                      <span className="text-muted-foreground">UF</span>
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
                      <span className="text-muted-foreground">Graduação/Curso</span>
                      <span className="font-medium">{graduation || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded border p-3">
                      <span className="text-muted-foreground">Cargo</span>
                      <span className="font-medium">{jobTitle || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded border p-3">
                      <span className="text-muted-foreground">Salário base (cadastro)</span>
                      <span className="font-medium">{formatBRL(baseSalary)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded border p-3">
                      <span className="text-muted-foreground">Comissão (cadastro)</span>
                      <span className="font-medium">{commissionPercent ? `${commissionPercent}%` : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded border p-3">
                      <span className="text-muted-foreground">Fator hora extra</span>
                      <span className="font-medium">{overtimeFactor ? String(overtimeFactor) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded border p-3 sm:col-span-2">
                      <span className="text-muted-foreground">Observações</span>
                      <span className="font-medium truncate max-w-[420px]">{notes || "—"}</span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Pagamentos</CardTitle>
              {payrollHasMore ? (
                <Button size="sm" variant="outline" onClick={() => setAllPaymentsOpen(true)}>
                  Ver todos
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referência</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead className="text-right">Salário</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                      <TableHead className="text-right">Bônus</TableHead>
                      <TableHead className="text-right">H. Extra</TableHead>
                      <TableHead className="text-right">Desc.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollEntries.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                          Carregando...
                        </TableCell>
                      </TableRow>
                    ) : payrollSorted.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                          Nenhum pagamento lançado para este colaborador.
                        </TableCell>
                      </TableRow>
                    ) : (
                      payrollLatest12.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{format(new Date(r.reference_date), "MMM/yy", { locale: ptBR })}</TableCell>
                          <TableCell>{r.payment_date ? format(new Date(r.payment_date), "dd/MM/yy", { locale: ptBR }) : "—"}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.base_salary)}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.commission)}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.bonus)}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.overtime)}</TableCell>
                          <TableCell className="text-right">-{formatBRL(r.discounts)}</TableCell>
                          <TableCell className="text-right font-medium">{formatBRL(r.total_value)}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "paid" ? "default" : "outline"} className={r.status === "paid" ? "bg-emerald-600" : ""}>
                              {r.status === "paid" ? "Pago" : "Pendente"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <DocumentsCard
            title="Documentos"
            folderValue={(() => {
              const meta = (viewing.metadata ?? {}) as Record<string, unknown>;
              const raw = (meta.drive_folder ?? meta.drive_folder_url ?? meta.folder ?? meta.pasta ?? "") as string;
              const v = String(raw ?? "").trim();
              return v || driveFolders.team || null;
            })()}
            canEdit={employeesPermission.canEdit}
          />

          <Dialog open={allPaymentsOpen} onOpenChange={setAllPaymentsOpen}>
            <DialogContent className="max-w-5xl w-full max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Todos os pagamentos</DialogTitle>
                <DialogDescription>
                  Histórico completo de pagamentos efetuados para este colaborador.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referência</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead className="text-right">Salário</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                      <TableHead className="text-right">Bônus</TableHead>
                      <TableHead className="text-right">H. Extra</TableHead>
                      <TableHead className="text-right">Desc.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollEntries.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                          Carregando...
                        </TableCell>
                      </TableRow>
                    ) : payrollSorted.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                          Nenhum pagamento lançado para este colaborador.
                        </TableCell>
                      </TableRow>
                    ) : (
                      payrollSorted.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{format(new Date(r.reference_date), "MMM/yy", { locale: ptBR })}</TableCell>
                          <TableCell>{r.payment_date ? format(new Date(r.payment_date), "dd/MM/yy", { locale: ptBR }) : "—"}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.base_salary)}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.commission)}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.bonus)}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.overtime)}</TableCell>
                          <TableCell className="text-right">-{formatBRL(r.discounts)}</TableCell>
                          <TableCell className="text-right font-medium">{formatBRL(r.total_value)}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "paid" ? "default" : "outline"} className={r.status === "paid" ? "bg-emerald-600" : ""}>
                              {r.status === "paid" ? "Pago" : "Pendente"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : selectedProfileId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Colaborador não encontrado.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
