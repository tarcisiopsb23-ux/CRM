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
import { SecretQuestionForm } from "@/components/auth/SecretQuestionForm";

const TENANT_STATUS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-status`;
const SECRET_QUESTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secret-question`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function parseJwtPayload(token: string): Record<string, any> {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return {}; }
}

const STATUS_MESSAGES: Record<string, string> = {
  bloqueado: "Acesso bloqueado",
  suspenso:  "Acesso suspenso. Entre em contato com a agência.",
  cancelado: "Contrato cancelado. Entre em contato com a agência.",
};

type View = "login" | "forgot-question" | "forgot-reset";

export function PublicDashboardLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [view, setView] = useState<View>("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot — shared email field
  const [forgotEmail, setForgotEmail] = useState("");

  // Forgot — secret question flow
  const [secretQuestion, setSecretQuestion] = useState<string | null>(null);
  const [secretAnswer, setSecretAnswer] = useState("");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);

  // Reset password (after secret question verified)
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetActionLink, setResetActionLink] = useState<string | null>(null);

  // Force password change dialog
  const [showForceChange, setShowForceChange] = useState(false);
  const [forceStep, setForceStep] = useState<"password" | "question">("password");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  useEffect(() => {
    const blocked = searchParams.get("blocked");
    if (blocked) setError(decodeURIComponent(blocked));
  }, [searchParams]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await supabaseAuth.auth.signInWithPassword({
        email: email.trim(), password,
      });
      if (authError || !data.session) { setError("E-mail ou senha incorretos."); return; }

      const payload = parseJwtPayload(data.session.access_token);
      const role     = payload.role     ?? payload.user_metadata?.role     ?? "member";
      const tenantId = payload.tenant_id ?? payload.user_metadata?.tenant_id ?? null;

      if (role === "viewer") {
        await supabaseAuth.auth.signOut();
        setError("Seu perfil não tem permissão de acesso ao C8 Control.");
        return;
      }
      if (role === "agency" || role === "support") { navigate("/dashboard"); return; }
      if (!tenantId) {
        await supabaseAuth.auth.signOut();
        setError("Usuário sem tenant configurado. Entre em contato com a agência.");
        return;
      }

      // Verificar status do tenant
      const { data: cached } = await supabaseCrm
        .from("tenant_config_cache").select("status, blocked_reason, synced_at")
        .eq("tenant_id", tenantId).maybeSingle();
      let status = cached?.status ?? null;
      let blockedReason = cached?.blocked_reason ?? null;
      const isStale = !cached?.synced_at ||
        (Date.now() - new Date(cached.synced_at).getTime()) > 60 * 60 * 1000;
      if (!status || isStale) {
        try {
          const res = await fetch(TENANT_STATUS_URL, {
            method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
          if (res.ok) { const fresh = await res.json(); status = fresh.status ?? "ativo"; blockedReason = fresh.blocked_reason ?? null; }
        } catch { status = status ?? "ativo"; }
      }
      if (status && status !== "ativo") {
        await supabaseAuth.auth.signOut();
        const baseMsg = STATUS_MESSAGES[status] ?? "Acesso negado.";
        setError(status === "bloqueado" && blockedReason ? `${baseMsg}: ${blockedReason}` : baseMsg);
        return;
      }

      // Verificar senha temporária
      const forceChange =
        payload.user_metadata?.force_password_change ??
        data.session.user.user_metadata?.force_password_change ?? false;
      if (forceChange) { setShowForceChange(true); return; }

      navigate("/dashboard");
    } catch { setError("E-mail ou senha incorretos."); }
    finally { setLoading(false); }
  };

  // ── Force password change ─────────────────────────────────────────────────
  const handleForcePasswordChange = async () => {
    setChangeError(null);
    if (!newPassword.trim() || newPassword.length < 6) { setChangeError("A senha deve ter pelo menos 6 caracteres."); return; }
    if (newPassword !== confirmPassword) { setChangeError("As senhas não coincidem."); return; }
    setChangeLoading(true);
    try {
      const { error: pwErr } = await supabaseAuth.auth.updateUser({ password: newPassword });
      if (pwErr) { setChangeError("Erro ao atualizar senha. Tente novamente."); return; }
      await supabaseAuth.auth.updateUser({ data: { force_password_change: false } });
      // Avança para o passo de pergunta secreta
      setForceStep("question");
    } catch { setChangeError("Erro ao atualizar senha. Tente novamente."); }
    finally { setChangeLoading(false); }
  };

  // ── Forgot: go to secret question ────────────────────────────────────────
  const goToForgot = () => {
    setForgotEmail(email);
    setQuestionError(null);
    setSecretQuestion(null);
    setSecretAnswer("");
    setView("forgot-question");
  };

  // ── Forgot: load secret question ──────────────────────────────────────────
  const handleLoadQuestion = async (emailValue: string) => {
    setQuestionLoading(true);
    setQuestionError(null);
    try {
      const res = await fetch(SECRET_QUESTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: "get-question", email: emailValue.trim() }),
      });
      const data = await res.json();
      if (!data.has_question) {
        setQuestionError("Nenhuma pergunta secreta cadastrada para este e-mail. Entre em contato com a agência.");
        return;
      }
      setSecretQuestion(data.question);
    } catch { setQuestionError("Erro ao buscar pergunta. Tente novamente."); }
    finally { setQuestionLoading(false); }
  };

  // ── Forgot: verify answer ─────────────────────────────────────────────────
  const handleVerifyAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuestionLoading(true);
    setQuestionError(null);
    try {
      const res = await fetch(SECRET_QUESTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: "verify-answer", email: forgotEmail.trim(), answer: secretAnswer }),
      });
      const data = await res.json();
      if (!data.correct) { setQuestionError("Resposta incorreta. Tente novamente."); return; }
      // Resposta correta — redirecionar para o link de reset gerado no servidor
      // O link abre a sessão de recovery no Supabase e redireciona para /login?reset=1
      // Mas como queremos mostrar a tela de nova senha inline, usamos o action_link
      // para autenticar e depois updateUser
      setResetActionLink(data.action_link);
      setResetPassword("");
      setResetConfirm("");
      setResetError(null);
      setView("forgot-reset");
    } catch { setQuestionError("Erro ao verificar resposta. Tente novamente."); }
    finally { setQuestionLoading(false); }
  };

  // ── Forgot: set new password after secret question ────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (!resetPassword.trim() || resetPassword.length < 6) { setResetError("A senha deve ter pelo menos 6 caracteres."); return; }
    if (resetPassword !== resetConfirm) { setResetError("As senhas não coincidem."); return; }
    if (!resetActionLink) { setResetError("Link de recuperação inválido. Recomece o processo."); return; }
    setResetLoading(true);
    try {
      // Extrair token do action_link e autenticar via OTP
      const url = new URL(resetActionLink);
      const token = url.searchParams.get("token") ?? url.hash.match(/access_token=([^&]+)/)?.[1] ?? null;
      const tokenHash = url.searchParams.get("token_hash") ?? null;
      const type = (url.searchParams.get("type") ?? "recovery") as any;

      let sessionError: any = null;
      if (tokenHash) {
        const { error } = await supabaseAuth.auth.verifyOtp({ token_hash: tokenHash, type });
        sessionError = error;
      } else if (token) {
        const { error } = await supabaseAuth.auth.verifyOtp({ token_hash: token, type });
        sessionError = error;
      } else {
        // Fallback: abrir o link diretamente (redireciona para /login?reset=1 com hash)
        window.location.href = resetActionLink;
        return;
      }

      if (sessionError) { setResetError("Link expirado. Recomece o processo."); return; }

      const { error: pwErr } = await supabaseAuth.auth.updateUser({ password: resetPassword });
      if (pwErr) { setResetError("Erro ao atualizar senha. Tente novamente."); return; }

      await supabaseAuth.auth.signOut();
      setView("login");
      setError(null);
      setPassword("");
      // Pequeno feedback visual
      setTimeout(() => setError("Senha atualizada com sucesso. Faça login."), 100);
    } catch { setResetError("Erro ao redefinir senha. Tente novamente."); }
    finally { setResetLoading(false); }
  };

  const backToLogin = () => { setView("login"); setError(null); };

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
              <CardDescription className="text-slate-400 text-xs">Informe seu e-mail e senha para visualizar os resultados.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input type="email" placeholder="seu@email.com" className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                      value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Senha de Acesso</Label>
                    <button type="button" onClick={goToForgot}
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
                {error && (
                  <p className={`text-sm font-medium ${error.startsWith("Senha atualizada") ? "text-emerald-400" : "text-red-400"}`}>{error}</p>
                )}
                <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold" disabled={loading}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Entrar no Dashboard"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── ESQUECI MINHA SENHA — pergunta secreta ── */}
        {view === "forgot-question" && (
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#7C3AED]">
            <CardHeader>
              <CardTitle className="text-white">Recuperar Senha</CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Informe seu e-mail e responda a pergunta secreta para redefinir sua senha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Campo de e-mail + botão buscar pergunta */}
                <div className="space-y-2">
                  <Label className="text-slate-300">E-mail</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input type="email" placeholder="seu@email.com"
                        className="w-full bg-slate-900/50 border border-slate-700 text-white pl-10 h-12 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50"
                        value={forgotEmail}
                        onChange={e => { setForgotEmail(e.target.value); setSecretQuestion(null); setQuestionError(null); }}
                        onBlur={e => { if (e.target.value.trim()) handleLoadQuestion(e.target.value); }}
                      />
                    </div>
                    <button type="button"
                      onClick={() => handleLoadQuestion(forgotEmail)}
                      disabled={!forgotEmail.trim() || questionLoading}
                      className="h-12 px-4 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-bold transition-colors disabled:opacity-50">
                      {questionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                    </button>
                  </div>
                </div>

                {/* Pergunta + resposta — aparece após buscar */}
                {secretQuestion && (
                  <form onSubmit={handleVerifyAnswer} className="space-y-4">
                    <div className="rounded-lg bg-slate-900/50 border border-slate-700 p-4">
                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Sua pergunta secreta</p>
                      <p className="text-slate-200 font-bold text-sm">{secretQuestion}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Sua resposta</Label>
                      <input type="text" placeholder="Digite sua resposta" autoComplete="off"
                        className="w-full bg-slate-900/50 border border-slate-700 text-white h-12 rounded-md px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50"
                        value={secretAnswer} onChange={e => setSecretAnswer(e.target.value)} required />
                      <p className="text-[10px] text-slate-500">Não diferencia maiúsculas/minúsculas ou acentos.</p>
                    </div>
                    {questionError && <p className="text-red-400 text-sm font-medium">{questionError}</p>}
                    <button type="submit" disabled={questionLoading || !secretAnswer.trim()}
                      className="w-full h-12 rounded-md bg-[#7C3AED] hover:bg-[#7C3AED]/90 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {questionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar e Continuar"}
                    </button>
                  </form>
                )}

                {questionError && !secretQuestion && (
                  <p className="text-red-400 text-sm font-medium">{questionError}</p>
                )}

                <button onClick={backToLogin}
                  className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors pt-1">
                  <ArrowLeft className="h-4 w-4" /> Voltar ao login
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── NOVA SENHA (após pergunta secreta) ── */}
        {view === "forgot-reset" && (
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="text-white">Criar Nova Senha</CardTitle>
              <CardDescription className="text-slate-400 text-xs">Resposta correta. Defina sua nova senha de acesso.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Nova senha</Label>
                  <div className="relative">
                    <Input type={showResetPwd ? "text" : "password"} placeholder="Mínimo 6 caracteres"
                      className="bg-slate-900/50 border-slate-700 text-white pr-10 h-12"
                      value={resetPassword} onChange={e => setResetPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowResetPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Confirmar nova senha</Label>
                  <Input type="password" placeholder="Repita a senha" className="bg-slate-900/50 border-slate-700 text-white h-12"
                    value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} required />
                </div>
                {resetError && <p className="text-red-400 text-sm font-medium">{resetError}</p>}
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-600/90 h-12 font-bold" disabled={resetLoading}>
                  {resetLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Salvar Nova Senha"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <footer className="text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
          <p>&copy; {new Date().getFullYear()} Agência C8. Todos os Direitos Reservados.</p>
        </footer>
      </div>

      {/* ── DIALOG: TROCA DE SENHA OBRIGATÓRIA (senha temporária) ── */}
      <Dialog open={showForceChange} onOpenChange={() => {}}>
        <DialogContent className="bg-[#1E293B] border-slate-800 text-slate-100 sm:max-w-md"
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>

          {/* Passo 1: definir nova senha */}
          {forceStep === "password" && (<>
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
                <Input type="password" placeholder="Repita a senha" className="bg-slate-900 border-slate-700 text-white h-12"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              {changeError && <p className="text-red-400 text-sm font-medium">{changeError}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleForcePasswordChange} disabled={changeLoading}
                className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold">
                {changeLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Continuar →"}
              </Button>
            </DialogFooter>
          </>)}

          {/* Passo 2: configurar pergunta secreta */}
          {forceStep === "question" && (<>
            <DialogHeader>
              <DialogTitle className="text-white">Configure sua pergunta secreta</DialogTitle>
              <DialogDescription className="text-slate-400 text-sm">
                Use para recuperar o acesso sem depender de e-mail. Você pode pular e configurar depois no perfil.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <SecretQuestionForm
                onSaved={() => { setShowForceChange(false); navigate("/dashboard"); }}
                onSkip={() => { setShowForceChange(false); navigate("/dashboard"); }}
              />
            </div>
          </>)}

        </DialogContent>
      </Dialog>
    </div>
  );
}
