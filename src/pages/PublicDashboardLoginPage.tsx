import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Activity, Lock, Loader2, Mail, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { supabaseAuth } from "@/lib/supabase-auth";
import { supabaseCrm } from "@/lib/supabase";

const TENANT_STATUS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-status`;

function parseJwtPayload(token: string): Record<string, any> {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return {};
  }
}

const STATUS_MESSAGES: Record<string, string> = {
  bloqueado: "Acesso bloqueado",
  suspenso:  "Acesso suspenso. Entre em contato com a agência.",
  cancelado: "Contrato cancelado. Entre em contato com a agência.",
};

type View = "login" | "forgot" | "forgot-sent";

export function PublicDashboardLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Login state
  const [view, setView] = useState<View>("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Force password change dialog
  const [showForceChange, setShowForceChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  useEffect(() => {
    const blocked = searchParams.get("blocked");
    if (blocked) setError(decodeURIComponent(blocked));
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !data.session) {
        setError("E-mail ou senha incorretos.");
        return;
      }

      const payload = parseJwtPayload(data.session.access_token);
      const role     = payload.role     ?? payload.user_metadata?.role     ?? "member";
      const tenantId = payload.tenant_id ?? payload.user_metadata?.tenant_id ?? null;

      // Viewer do Maestr.ia: sem acesso ao CRM
      if (role === "viewer") {
        await supabaseAuth.auth.signOut();
        setError("Seu perfil não tem permissão de acesso ao C8 Control.");
        return;
      }

      if (role === "agency" || role === "support") {
        navigate("/dashboard");
        return;
      }

      if (!tenantId) {
        await supabaseAuth.auth.signOut();
        setError("Usuário sem tenant configurado. Entre em contato com a agência.");
        return;
      }

      // ── Verificar status do tenant ─────────────────────────────────────────
      const { data: cached } = await supabaseCrm
        .from("tenant_config_cache")
        .select("status, blocked_reason, synced_at")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      let status        = cached?.status        ?? null;
      let blockedReason = cached?.blocked_reason ?? null;

      const isStale = !cached?.synced_at ||
        (Date.now() - new Date(cached.synced_at).getTime()) > 60 * 60 * 1000;

      if (!status || isStale) {
        try {
          const res = await fetch(TENANT_STATUS_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
          if (res.ok) {
            const fresh = await res.json();
            status        = fresh.status        ?? "ativo";
            blockedReason = fresh.blocked_reason ?? null;
          }
        } catch {
          status = status ?? "ativo";
        }
      }

      if (status && status !== "ativo") {
        await supabaseAuth.auth.signOut();
        const baseMsg = STATUS_MESSAGES[status] ?? "Acesso negado.";
        const fullMsg = status === "bloqueado" && blockedReason
          ? `${baseMsg}: ${blockedReason}`
          : baseMsg;
        setError(fullMsg);
        return;
      }

      // ── Verificar se precisa trocar senha temporária ───────────────────────
      const forceChange =
        payload.user_metadata?.force_password_change ??
        data.session.user.user_metadata?.force_password_change ??
        false;

      if (forceChange) {
        setShowForceChange(true);
        return; // não navega ainda — aguarda troca
      }

      navigate("/dashboard");

    } catch {
      setError("E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

  const handleForcePasswordChange = async () => {
    setChangeError(null);
    if (!newPassword.trim() || newPassword.length < 6) {
      setChangeError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError("As senhas não coincidem.");
      return;
    }
    setChangeLoading(true);
    try {
      // Atualiza a senha
      const { error: pwErr } = await supabaseAuth.auth.updateUser({ password: newPassword });
      if (pwErr) { setChangeError("Erro ao atualizar senha. Tente novamente."); return; }

      // Remove o flag force_password_change do user_metadata
      await supabaseAuth.auth.updateUser({
        data: { force_password_change: false },
      });

      setShowForceChange(false);
      navigate("/dashboard");
    } catch {
      setChangeError("Erro ao atualizar senha. Tente novamente.");
    } finally {
      setChangeLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);
    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(
        forgotEmail.trim(),
        { redirectTo: `${window.location.origin}/login?reset=1` }
      );
      if (error) {
        setForgotError("Não foi possível enviar o e-mail. Verifique o endereço informado.");
        return;
      }
      setView("forgot-sent");
    } catch {
      setForgotError("Erro ao enviar e-mail. Tente novamente.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">

        {/* Logo */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-16 w-16 bg-[#7C3AED] rounded-2xl flex items-center justify-center shadow-xl shadow-[#7C3AED]/20 mb-4">
            <Activity className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">C8 Control</h1>
          <p className="text-slate-400 font-medium italic">Powered by Agência C8</p>
        </div>

        {/* ── LOGIN ── */}
        {view === "login" && (
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#7C3AED]">
            <CardHeader>
              <CardTitle className="text-white">Acesso ao Dashboard</CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Informe seu e-mail e senha para visualizar os resultados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input type="email" placeholder="seu@email.com"
                      className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                      value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Senha de Acesso</Label>
                    <button type="button" onClick={() => { setForgotEmail(email); setView("forgot"); setError(null); }}
                      className="text-[11px] text-[#7C3AED] hover:text-[#7C3AED]/80 font-bold transition-colors">
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input type={showPassword ? "text" : "password"} placeholder="••••••••"
                      className="bg-slate-900/50 border-slate-700 text-white pl-10 pr-10 h-12"
                      value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm font-medium">{error}</p>}
                <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold" disabled={loading}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Entrar no Dashboard"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── ESQUECI MINHA SENHA ── */}
        {view === "forgot" && (
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#7C3AED]">
            <CardHeader>
              <CardTitle className="text-white">Recuperar Senha</CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input type="email" placeholder="seu@email.com"
                      className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                      value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                  </div>
                </div>
                {forgotError && <p className="text-red-400 text-sm font-medium">{forgotError}</p>}
                <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold" disabled={forgotLoading}>
                  {forgotLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Enviar Link de Recuperação"}
                </Button>
                <button type="button" onClick={() => { setView("login"); setForgotError(null); }}
                  className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors pt-1">
                  <ArrowLeft className="h-4 w-4" /> Voltar ao login
                </button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── LINK ENVIADO ── */}
        {view === "forgot-sent" && (
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="text-white">E-mail enviado</CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Verifique sua caixa de entrada e clique no link para redefinir sua senha.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300 text-sm">
                Enviamos um link de recuperação para <span className="text-white font-bold">{forgotEmail}</span>.
                O link expira em 1 hora.
              </p>
              <p className="text-slate-500 text-xs">Não recebeu? Verifique a pasta de spam ou tente novamente.</p>
              <button onClick={() => { setView("forgot"); setForgotError(null); }}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors">
                <ArrowLeft className="h-4 w-4" /> Tentar novamente
              </button>
            </CardContent>
          </Card>
        )}

        <footer className="text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
          <p>&copy; {new Date().getFullYear()} Agência C8. Todos os Direitos Reservados.</p>
        </footer>
      </div>

      {/* ── DIALOG: TROCA DE SENHA OBRIGATÓRIA ── */}
      <Dialog open={showForceChange} onOpenChange={() => {}}>
        <DialogContent className="bg-[#1E293B] border-slate-800 text-slate-100 sm:max-w-md"
          onPointerDownOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-white">Defina sua senha permanente</DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Você está usando uma senha temporária. Por segurança, crie uma senha permanente antes de continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-slate-300">Nova senha</Label>
              <div className="relative">
                <Input type={showNewPwd ? "text" : "password"} placeholder="Mínimo 6 caracteres"
                  className="bg-slate-900 border-slate-700 text-white pr-10 h-12"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                <button type="button" onClick={() => setShowNewPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Confirmar nova senha</Label>
              <Input type="password" placeholder="Repita a senha"
                className="bg-slate-900 border-slate-700 text-white h-12"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            {changeError && <p className="text-red-400 text-sm font-medium">{changeError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={handleForcePasswordChange} disabled={changeLoading}
              className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold">
              {changeLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Salvar senha e entrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
