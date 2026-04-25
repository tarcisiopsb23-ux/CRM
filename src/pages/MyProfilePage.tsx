import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { usePayrollsByProfile } from "@/hooks/usePayrolls";
import { useRepPPunches, useTimeClockState, useRegisterPunch } from "@/hooks/useTimeClock";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Loader2, User, DollarSign, Clock,
  CheckCircle2, AlertCircle, Calendar, LogIn, LogOut, Users, Camera, Star, ClipboardCheck,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useResultadoDoColaborador, useAvaliacoesPendentes } from "@/hooks/useAvaliacao360";
import { useAvaliacoesTecnicas } from "@/hooks/useAvaliacoesTecnicas";
import { AvaliacaoForm } from "@/components/avaliacao360/AvaliacaoForm";
import { useEmployeeEvaluations } from "@/hooks/useEmployeeEvaluations";
import { useCommissionEntries } from "@/hooks/useCommissionEntries";
import { useGoals } from "@/hooks/useGoalsCRUD";
import { ManagerPinSection } from "@/components/profile/ManagerPinSection";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

type Tab = "perfil" | "pagamentos" | "ponto" | "equipe" | "avaliacoes";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}

export default function MyProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, loading, signOut, refetchProfile } = useAuth();
  const organizationId = useOrganization();

  const { data: teams = [] } = useTeams(organizationId);
  const { data: teamMembers = [] } = useTeamMembers(organizationId);
  const { data: profiles = [] } = useProfiles(organizationId);

  const myTeam = useMemo(() => {
    const membership = teamMembers.find((m) => m.profile_id === profile?.id);
    if (!membership) return null;
    return teams.find((t) => t.id === membership.team_id) ?? null;
  }, [teams, teamMembers, profile?.id]);

  const myTeamMembers = useMemo(() => {
    if (!myTeam) return [];
    return teamMembers
      .filter((m) => m.team_id === myTeam.id)
      .map((m) => profiles.find((p) => p.id === m.profile_id))
      .filter(Boolean);
  }, [myTeam, teamMembers, profiles]);

  const teamLead = useMemo(() => {
    if (!myTeam?.lead_id) return null;
    return profiles.find((p) => p.id === myTeam.lead_id) ?? null;
  }, [myTeam, profiles]);

  const initialTab: Tab = searchParams.get("tab") === "senha" ? "perfil" : "perfil";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Password dialog
  const [open, setOpen] = useState(searchParams.get("tab") === "senha");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  // Profile edit state
  const [displayName, setDisplayName] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName((profile.metadata?.display_name as string) || "");
    }
  }, [profile]);

  const { canView: isExempt } = usePermissionForScope("team", "timeclock");
  const { data: clockState, isLoading: clockLoading } = useTimeClockState();
  const registerPunch = useRegisterPunch();

  const nextAllowed = clockState?.next_allowed ?? [];
  const canEnter = nextAllowed.includes("entrada");
  const canExit  = nextAllowed.includes("saida_final");
  const canBreak  = nextAllowed.includes("saida_intervalo");
  const canReturn = nextAllowed.includes("retorno_intervalo");

  const handlePunch = async () => {
    let type: "entrada" | "saida_intervalo" | "retorno_intervalo" | "saida_final";
    if (canEnter)       type = "entrada";
    else if (canBreak)  type = "saida_intervalo";
    else if (canReturn) type = "retorno_intervalo";
    else if (canExit)   type = "saida_final";
    else { toast.error("Nenhuma batida permitida no momento."); return; }
    try {
      await registerPunch.mutateAsync({ type });
      toast.success(`${PUNCH_LABELS[type]} registrada com sucesso!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar ponto");
    }
  };

  const punchButtonLabel = () => {
    if (clockLoading) return "Carregando...";
    if (canEnter)  return "Registrar Entrada";
    if (canBreak)  return "Saída Intervalo";
    if (canReturn) return "Retorno Intervalo";
    if (canExit)   return "Registrar Saída";
    return "Ponto Encerrado";
  };
  const punchButtonVariant = canEnter ? "default" : canExit ? "destructive" : "secondary";
  const PunchIcon = canEnter ? LogIn : LogOut;

  const { data: payrolls = [], isLoading: payrollLoading } = usePayrollsByProfile(organizationId, profile?.id);

  // Avaliações
  const { data: resultados360 = [], isLoading: loadingResultados } = useResultadoDoColaborador(profile?.id);
  const { data: pendentes360 = [], isLoading: loadingPendentes } = useAvaliacoesPendentes(profile?.id);
  const { data: avaliacoesTecnicas = [], isLoading: loadingTecnicas } = useAvaliacoesTecnicas(profile?.id);
  const { data: evaluations = [] } = useEmployeeEvaluations(profile?.id);
  const { data: goals = [] } = useGoals(organizationId);
  const { data: commissionEntries = [] } = useCommissionEntries(profile?.id);

  const [avaliacaoFormOpen, setAvaliacaoFormOpen] = useState(false);
  const [selectedAvaliacao, setSelectedAvaliacao] = useState<(typeof pendentes360)[number] | null>(null);

  const score = useMemo(() => {
    if (evaluations.length === 0) return null;
    const avgNota = evaluations.reduce((s, e) => s + e.nota_final, 0) / evaluations.length;
    const avgComportamento = evaluations.reduce((s, e) => s + e.comportamento, 0) / evaluations.length;
    const profileGoals = goals.filter((g) => g.assigned_to === profile?.id && g.target_value > 0);
    const avgGoalPct = profileGoals.length > 0
      ? profileGoals.reduce((s, g) => s + Math.min((g.current_value / g.target_value) * 100, 150), 0) / profileGoals.length
      : 0;
    return Math.round((avgNota * 0.5 + avgGoalPct / 10 * 0.3 + avgComportamento * 0.2) * 10) / 10;
  }, [evaluations, goals, profile?.id]);
  const fromIso = startOfMonth(subMonths(new Date(), 2)).toISOString();
  const toIso   = endOfMonth(new Date()).toISOString();
  const { data: punches = [], isLoading: punchLoading } = useRepPPunches({
    organizationId: organizationId ?? undefined,
    userId: profile?.id,
    fromIso,
    toIso,
    status: "ativo",
  });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) { toast.error("Senha deve ter no mínimo 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { toast.error("As senhas não conferem"); return; }
    setChanging(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-my-password", { body: { password: newPassword } });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error(String((data as any).error));
      toast.success("Senha alterada com sucesso");
      setOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      await signOut();
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar senha");
    } finally {
      setChanging(false);
    }
  };

  const handleUpdateDisplayName = async () => {
    if (!profile) return;
    try {
      setUploading(true);
      const { error } = await supabase
        .from("profiles")
        .update({ metadata: { ...profile.metadata, display_name: displayName } })
        .eq("id", profile.id);
      if (error) throw error;
      await refetchProfile();
      toast.success("Nome de exibição atualizado");
    } catch (err) {
      toast.error((err as Error).message || "Erro ao atualizar");
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    try {
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const filePath = `${profile.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", profile.id);
      if (updateError) throw updateError;
      await refetchProfile();
      toast.success("Foto atualizada com sucesso");
    } catch (err) {
      const error = err as Error;
      if (error.message === "Bucket not found") {
        toast.error("Bucket 'avatars' não encontrado no Supabase.");
      } else {
        toast.error(error.message || "Erro ao fazer upload da foto");
      }
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!profile) return;
    try {
      setUploading(true);
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
      if (error) throw error;
      await refetchProfile();
      toast.success("Foto removida");
    } catch (err) {
      toast.error((err as Error).message || "Erro ao remover foto");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!user || !profile) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const meta = (profile.metadata ?? {}) as Record<string, unknown>;
  const str  = (k: string) => String((meta[k] ?? "") as string).trim() || null;

  const avatarUrl = profile.avatar_url || null;
  const initials = profile.full_name
    ?.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase() ?? "?";

  const punchByDate = punches.reduce<Record<string, typeof punches>>((acc, p) => {
    const day = p.occurred_at.slice(0, 10);
    if (!acc[day]) acc[day] = [];
    acc[day].push(p);
    return acc;
  }, {});
  const punchDays = Object.keys(punchByDate).sort((a, b) => b.localeCompare(a));

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "perfil",      label: "Perfil",            icon: User },
    { key: "pagamentos",  label: "Pagamentos",          icon: DollarSign },
    { key: "ponto",       label: "Controle de Ponto",   icon: Clock },
    { key: "equipe",      label: "Equipe",               icon: Users },
    { key: "avaliacoes",  label: "Avaliações",           icon: ClipboardCheck },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarImage src={avatarUrl || ""} alt={profile.full_name} />
              <AvatarFallback className="text-lg gradient-primary text-primary-foreground font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Meu Perfil</p>
              <h1 className="text-2xl font-bold">{profile.full_name}</h1>
              <p className="text-sm text-muted-foreground">{str("job_title") ?? "Colaborador"}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExempt ? (
            <span className="text-xs text-muted-foreground italic px-2">Isento de registro de ponto</span>
          ) : (
            <Button
              size="sm"
              variant={punchButtonVariant}
              onClick={handlePunch}
              disabled={clockLoading || registerPunch.isPending || (!canEnter && !canExit && !canBreak && !canReturn)}
              className="gap-2"
            >
              {registerPunch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PunchIcon className="h-4 w-4" />}
              {punchButtonLabel()}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Alterar senha
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-xl border border-border w-full">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === key
                ? "bg-background text-primary shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── Perfil ── */}
      {activeTab === "perfil" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Foto e Nome de Exibição</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={avatarUrl || ""} alt={profile.full_name} />
                    <AvatarFallback className="text-2xl gradient-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <Camera className="h-6 w-6" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                  </label>
                </div>
                <p className="text-sm font-medium">{profile.full_name}</p>
                {avatarUrl && (
                  <Button variant="ghost" size="sm" onClick={removeAvatar} disabled={uploading} className="text-destructive h-7">
                    Remover foto
                  </Button>
                )}
              </div>
              {/* Display name */}
              <div className="space-y-2">
                <Label htmlFor="display_name">Nome de exibição</Label>
                <Input
                  id="display_name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Como seu nome aparece para outros usuários"
                />
                <p className="text-[10px] text-muted-foreground">Deixe em branco para usar o nome completo.</p>
              </div>
              <Button onClick={handleUpdateDisplayName} disabled={uploading} className="w-full">
                {uploading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Informações Pessoais</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Field label="Nome completo" value={profile.full_name} />
              <Field label="E-mail"        value={profile.email} />
              <Field label="Telefone"      value={profile.phone} />
              <Field label="CPF"           value={str("cpf")} />
              <Field label="RG"            value={str("rg")} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Dados Profissionais</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Field label="Cargo"         value={str("job_title")} />
              <Field label="Departamento"  value={str("department")} />
              <Field label="Data de admissão" value={str("hired_at") ? format(new Date(str("hired_at")!), "dd/MM/yyyy") : null} />
              <Field label="Nível de escolaridade" value={str("education_level")} />
              <Field label="Formação"      value={str("graduation")} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Field label="Logradouro"    value={str("address_street")} />
              <Field label="Cidade"        value={str("address_city")} />
              <Field label="Estado"        value={str("address_state")} />
              <Field label="CEP"           value={str("address_zip")} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Dados Bancários</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Field label="Chave PIX"     value={str("pix_key")} />
              <Field label="Banco"         value={str("bank_name")} />
              <Field label="Agência"       value={str("bank_agency")} />
              <Field label="Conta"         value={str("bank_account")} />
            </CardContent>
          </Card>

          <ManagerPinSection />
        </div>
      )}

      {/* ── Pagamentos ── */}
      {activeTab === "pagamentos" && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Histórico de Pagamentos</CardTitle></CardHeader>
          <CardContent>
            {payrollLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : payrolls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <DollarSign className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhum pagamento registrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 text-[10px] uppercase text-muted-foreground font-bold">Competência</th>
                      <th className="text-right py-2 px-3 text-[10px] uppercase text-muted-foreground font-bold">Salário Base</th>
                      <th className="text-right py-2 px-3 text-[10px] uppercase text-muted-foreground font-bold">Comissão</th>
                      <th className="text-right py-2 px-3 text-[10px] uppercase text-muted-foreground font-bold">Bônus</th>
                      <th className="text-right py-2 px-3 text-[10px] uppercase text-muted-foreground font-bold">Descontos</th>
                      <th className="text-right py-2 px-3 text-[10px] uppercase text-muted-foreground font-bold">Total</th>
                      <th className="text-center py-2 px-3 text-[10px] uppercase text-muted-foreground font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payrolls.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3 font-medium">
                          {format(new Date(p.reference_date + "-01"), "MMMM yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
                        </td>
                        <td className="py-3 px-3 text-right">{fmt(p.base_salary)}</td>
                        <td className="py-3 px-3 text-right text-emerald-600">{fmt(p.commission)}</td>
                        <td className="py-3 px-3 text-right text-emerald-600">{fmt(p.bonus)}</td>
                        <td className="py-3 px-3 text-right text-rose-600">-{fmt(p.discounts)}</td>
                        <td className="py-3 px-3 text-right font-bold">{fmt(p.total_value)}</td>
                        <td className="py-3 px-3 text-center">
                          {p.status === "paid" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> Pago
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                              <AlertCircle className="h-3 w-3" /> Pendente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Controle de Ponto ── */}
      {activeTab === "ponto" && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Controle de Ponto — Últimos 3 meses</CardTitle></CardHeader>
          <CardContent>
            {punchLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : punchDays.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Clock className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhum registro de ponto encontrado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {punchDays.map((day) => {
                  const dayPunches = punchByDate[day].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
                  return (
                    <div key={day} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">
                          {format(new Date(day + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {dayPunches.map((punch) => (
                          <div key={punch.id} className="flex items-center gap-1.5">
                            <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full", PUNCH_COLORS[punch.punch_type])}>
                              {PUNCH_LABELS[punch.punch_type] ?? punch.punch_type}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {format(new Date(punch.occurred_at), "HH:mm")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Equipe ── */}
      {activeTab === "equipe" && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Minha Equipe</CardTitle></CardHeader>
          <CardContent>
            {!myTeam ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Users className="h-8 w-8 opacity-30" />
                <p className="text-sm">Você não está vinculado a nenhuma equipe.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Nome da equipe</span>
                    <span className="text-sm font-semibold">{myTeam.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tipo</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted capitalize">{myTeam.type}</span>
                  </div>
                  {myTeam.is_portfolio && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Carteira de clientes</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Sim</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Responsável</p>
                  {teamLead ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={teamLead.avatar_url || ""} alt={teamLead.full_name} />
                        <AvatarFallback className="text-sm">
                          {teamLead.full_name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{teamLead.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{teamLead.email}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem responsável definido.</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Integrantes ({myTeamMembers.length})
                  </p>
                  <div className="space-y-2">
                    {myTeamMembers.map((member) => {
                      if (!member) return null;
                      const isMe = member.id === profile?.id;
                      const isLead = member.id === myTeam.lead_id;
                      const memberMeta = (member.metadata ?? {}) as Record<string, unknown>;
                      const cargo = String(memberMeta.job_title ?? memberMeta.cargo ?? "").trim();
                      return (
                        <div key={member.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.avatar_url || ""} alt={member.full_name} />
                            <AvatarFallback className="text-xs">
                              {member.full_name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{member.full_name}</p>
                              {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Você</span>}
                              {isLead && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Responsável</span>}
                            </div>
                            {cargo && <p className="text-xs text-muted-foreground truncate">{cargo}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Avaliações ── */}
      {activeTab === "avaliacoes" && (
        <div className="space-y-6">
          {/* Score */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Meu Score</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-col items-center py-4 gap-2">
                {loadingResultados ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : score !== null ? (
                  <>
                    <span className="text-5xl font-bold text-foreground">{score.toFixed(1)}</span>
                    <p className="text-xs text-muted-foreground text-center">
                      Composição: 50% desempenho · 30% metas · 20% comportamento
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem avaliações suficientes para calcular o score.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Avaliações pendentes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Avaliações Pendentes</CardTitle>
                {pendentes360.length > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                    {pendentes360.length} pendente{pendentes360.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingPendentes ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : pendentes360.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-1 text-center">
                  <ClipboardCheck className="h-8 w-8 opacity-20 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nenhuma avaliação pendente no momento.</p>
                  <p className="text-xs text-muted-foreground">As avaliações aparecem aqui quando um ciclo ativo for iniciado pelo gestor.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendentes360.map((a) => {
                    const TIPO_LABEL: Record<string, string> = {
                      autoavaliacao: "Autoavaliação",
                      gestor: "Avaliação de Gestor",
                      pares: "Avaliação de Par",
                      liderado: "Avaliação de Liderado",
                    };
                    return (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">{TIPO_LABEL[a.tipo] ?? a.tipo}</p>
                          <p className="text-xs text-muted-foreground">
                            {(a as any).ciclo?.nome ?? "Ciclo"}{" "}
                            {(a as any).ciclo?.data_fim
                              ? `· Prazo: ${new Date((a as any).ciclo.data_fim).toLocaleDateString("pt-BR")}`
                              : ""}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSelectedAvaliacao(a); setAvaliacaoFormOpen(true); }}
                        >
                          Responder
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Avaliações 360 concluídas */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Avaliações 360° Concluídas</CardTitle></CardHeader>
            <CardContent>
              {loadingResultados ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : resultados360.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado registrado.</p>
              ) : (
                <div className="space-y-3">
                  {resultados360.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-medium text-sm">{(r as any).ciclo?.nome ?? "Ciclo"}</p>
                          <p className="text-xs text-muted-foreground">
                            {(r as any).ciclo?.data_inicio
                              ? new Date((r as any).ciclo.data_inicio).toLocaleDateString("pt-BR")
                              : ""}{" "}
                            –{" "}
                            {(r as any).ciclo?.data_fim
                              ? new Date((r as any).ciclo.data_fim).toLocaleDateString("pt-BR")
                              : ""}
                          </p>
                        </div>
                        {r.score_final !== null && (
                          <Badge variant="secondary" className="text-xs">
                            Score: {r.score_final.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                        <div>Geral: <strong className="text-foreground">{r.media_geral?.toFixed(2) ?? "—"}</strong></div>
                        <div>Auto: <strong className="text-foreground">{r.media_autoavaliacao?.toFixed(2) ?? "—"}</strong></div>
                        <div>Pares: <strong className="text-foreground">{r.media_pares?.toFixed(2) ?? "—"}</strong></div>
                        <div>Gestor: <strong className="text-foreground">{r.media_gestor?.toFixed(2) ?? "—"}</strong></div>
                      </div>
                      {r.feedback_final && (
                        <div className="p-2 bg-muted/50 rounded text-xs">
                          <p className="font-medium mb-0.5">Feedback do Gestor</p>
                          <p className="text-muted-foreground">{r.feedback_final}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Avaliações Técnicas */}
          {avaliacoesTecnicas.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Avaliações Técnicas</CardTitle></CardHeader>
              <CardContent>
                {loadingTecnicas ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="space-y-3">
                    {avaliacoesTecnicas.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="font-medium text-sm">{a.titulo}</p>
                            <p className="text-xs text-muted-foreground">{new Date(a.data).toLocaleDateString("pt-BR")}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {[1,2,3,4,5].map((n) => (
                              <Star key={n} className={`h-3.5 w-3.5 ${n <= a.nota_geral ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                            ))}
                            <span className="text-xs text-muted-foreground ml-1">{a.nota_geral}/5</span>
                          </div>
                        </div>
                        {a.observacoes && (
                          <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{a.observacoes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Dialog responder avaliação pendente */}
      {selectedAvaliacao && (
        <AvaliacaoForm
          avaliacao={selectedAvaliacao}
          cicloTipo={(selectedAvaliacao as any).ciclo?.tipo ?? '360'}
          open={avaliacaoFormOpen}
          onOpenChange={(o) => { setAvaliacaoFormOpen(o); if (!o) setSelectedAvaliacao(null); }}
          avaliadoNome={
            selectedAvaliacao.avaliado_id === profile?.id
              ? profile?.full_name ?? "Você"
              : profiles.find((p) => p.id === selectedAvaliacao.avaliado_id)?.full_name
          }
        />
      )}

      {/* Dialog alterar senha */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>Defina uma nova senha para sua conta.</DialogDescription>
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={changing}>Cancelar</Button>
              <Button type="submit" disabled={changing}>
                {changing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Salvar senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
