/**
 * PublicDashboardLoginPage
 *
 * Tela única de login do C8 Control — Banco A (multi-tenant).
 *
 * Fluxo:
 *   1. Usuário preenche e-mail + senha e clica "Entrar"
 *   2. App chama lookup-clients-by-email → descobre os slugs vinculados ao e-mail
 *   3a. Se 1 cliente → autentica direto via client-dashboard-auth
 *   3b. Se múltiplos clientes → mostra seletor inline (mesma tela, sem redirecionar)
 *   3c. Se nenhum → "Usuário não cadastrado"
 *   4. client-dashboard-auth recebe {slug, email, password} → retorna session JWT do Banco A
 *   5. App chama supabase.auth.setSession() com o token recebido
 *
 * O slug nunca é exibido na tela — o usuário só vê o nome/empresa do cliente.
 * Suporte a query param ?client=slug para pré-selecionar o cliente (link de boas-vindas).
 */

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
import { Activity, Lock, Loader2, Mail, Eye, EyeOff, ArrowLeft, Building2, CheckCircle2 } from "lucide-react";
import { supabaseAuth } from "@/lib/supabase-auth";
import { SecretQuestionForm } from "@/components/auth/SecretQuestionForm";
import { cn } from "@/lib/utils";

// ─── URLs das Edge Functions ──────────────────────────────────────────────────
const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const LOOKUP_URL       = `${SUPABASE_URL}/functions/v1/lookup-clients-by-email`;
const AUTH_URL         = `${SUPABASE_URL}/functions/v1/client-dashboard-auth`;
const SECRET_QUESTION_URL = `${SUPABASE_URL}/functions/v1/secret-question`;

// ─── Lockout client-side (chave = e-mail real) ────────────────────────────────
// O rate limiting principal é feito no servidor (client-dashboard-auth).
// Este é apenas um guard local para evitar submissões repetidas após bloqueio.
const MAX_ATTEMPTS   = 5;
const WINDOW_MS      = 15 * 60 * 1000; // 15 minutos
const LOCKOUT_PREFIX = "c8_lockout_";

interface LockoutData { attempts: number; windowStart: number; lockedAt: number | null; }

function lockoutKey(email: string) { return LOCKOUT_PREFIX + email.trim().toLowerCase(); }
function getLockout(email: string): LockoutData {
  try { const r = localStorage.getItem(lockoutKey(email)); if (r) return JSON.parse(r); } catch {}
  return { attempts: 0, windowStart: Date.now(), lockedAt: null };
}
function saveLockout(email: string, d: LockoutData) {
  localStorage.setItem(lockoutKey(email), JSON.stringify(d));
}
function clearLockout(email: string) { localStorage.removeItem(lockoutKey(email)); }
function isLocked(d: LockoutData) { return d.lockedAt !== null; }
function recordFailedAttempt(email: string): { locked: boolean; remaining: number } {
  const now = Date.now();
  let d = getLockout(email);
  if (now - d.windowStart > WINDOW_MS) d = { attempts: 0, windowStart: now, lockedAt: null };
  d.attempts += 1;
  if (d.attempts >= MAX_ATTEMPTS) { d.lockedAt = now; saveLockout(email, d); return { locked: true, remaining: 0 }; }
  saveLockout(email, d);
  return { locked: false, remaining: MAX_ATTEMPTS - d.attempts };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseJwtPayload(token: string): Record<string, any> {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return {}; }
}

interface ClientOption { slug: string; name: string; role: string; }

// ─── Views ────────────────────────────────────────────────────────────────────
type View = "login" | "forgot-question" | "forgot-reset";

// ─── Componente ───────────────────────────────────────────────────────────────
export function PublicDashboardLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── Formulário ──
  const [view, setView]               = useState<View>("login");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);

  // ── Seletor de cliente (inline, aparece só quando necessário) ──
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [selectedSlug, setSelectedSlug]   = useState<string | null>(null);

  // ── Force password change ──
  const [showForceChange, setShowForceChange]   = useState(false);
  const [forceStep, setForceStep]               = useState<"password" | "question">("password");
  const [newPassword, setNewPassword]           = useState("");
  const [confirmPassword, setConfirmPassword]   = useState("");
  const [showNewPwd, setShowNewPwd]             = useState(false);
  const [changeLoading, setChangeLoading]       = useState(false);
  const [changeError, setChangeError]           = useState<string | null>(null);

  // ── Forgot ──
  const [forgotEmail, setForgotEmail]       = useState("");
  const [forgotSlug, setForgotSlug]         = useState<string | null>(null);
  const [secretQuestion, setSecretQuestion] = useState<string | null>(null);
  const [secretAnswer, setSecretAnswer]     = useState("");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError]   = useState<string | null>(null);
  const [resetPassword, setResetPassword]   = useState("");
  const [resetConfirm, setResetConfirm]     = useState("");
  const [showResetPwd, setShowResetPwd]     = useState(false);
  const [resetLoading, setResetLoading]     = useState(false);
  const [resetError, setResetError]         = useState<string | null>(null);
  const [resetActionLink, setResetActionLink] = useState<string | null>(null);

  // ── Inicia com lockout checado e cliente pré-selecionado por ?client= ──
  useEffect(() => {
    const blocked = searchParams.get("blocked");
    if (blocked) setError(decodeURIComponent(blocked));
    const reason = searchParams.get("reason");
    if (reason === "inatividade") setError("Sessão encerrada por inatividade. Faça login novamente.");

    // ?client=slug pré-seleciona o cliente (link de boas-vindas por e-mail)
    const preselect = searchParams.get("client");
    if (preselect) setSelectedSlug(preselect.trim().toLowerCase());
  }, [searchParams]);

  // Atualiza estado de lockout ao mudar o e-mail
  const handleEmailChange = (val: string) => {
    setEmail(val);
    setClientOptions([]);   // limpa seletor se e-mail mudar
    setSelectedSlug(null);
    if (val.trim()) {
      const d = getLockout(val.trim());
      setIsLockedOut(isLocked(d));
    } else {
      setIsLockedOut(false);
    }
  };

  // ── Submit principal ──────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const realEmail = email.trim().toLowerCase();
    if (!realEmail || !password) return;

    if (isLocked(getLockout(realEmail))) {
      setIsLockedOut(true);
      setError("Acesso bloqueado após várias tentativas. Redefina sua senha para desbloquear.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ── PASSO ÚNICO: autenticar via client-dashboard-auth ─────────────
      // A Edge Function resolve o slug automaticamente pelo e-mail.
      // Se o e-mail tiver múltiplos clientes e nenhum slug foi selecionado,
      // retorna 409 e o frontend faz o lookup para mostrar o seletor.
      const authRes = await fetch(AUTH_URL, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          email:    realEmail,
          password,
          ...(selectedSlug ? { slug: selectedSlug } : {}),
        }),
      });

      const authData = await authRes.json().catch(() => ({})) as {
        error?: string;
        blocked?: boolean;
        multiple?: boolean;
        session?: { access_token: string; refresh_token: string };
        user?: { id: string; email: string; full_name: string; role: string };
        client_info?: Record<string, any>;
        slug?: string;
        mode?: string;
      };

      // Múltiplos clientes — precisa do seletor
      if (authRes.status === 409 && authData.multiple) {
        const lookupRes = await fetch(LOOKUP_URL, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey":        SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email: realEmail }),
        });
        const { clients } = await lookupRes.json() as { clients: ClientOption[] };
        setClientOptions(clients ?? []);
        setSelectedSlug(null);
        setLoading(false);
        return;
      }

      if (!authRes.ok) {
        if (authRes.status === 429) {
          setError(authData.error ?? "Muitas tentativas. Aguarde alguns minutos.");
          return;
        }
        const result = recordFailedAttempt(realEmail);
        if (result.locked) {
          setIsLockedOut(true);
          setError("Acesso bloqueado após várias tentativas incorretas. Use 'Esqueci minha senha' para desbloquear.");
        } else {
          setError(
            authData.error === "E-mail ou senha inválidos"
              ? `Senha incorreta. ${result.remaining} tentativa${result.remaining !== 1 ? "s" : ""} restante${result.remaining !== 1 ? "s" : ""}.`
              : (authData.error ?? "E-mail ou senha incorretos.")
          );
        }
        return;
      }

      if (!authData.session?.access_token || !authData.session?.refresh_token) {
        setError("Falha ao iniciar sessão. Tente novamente.");
        return;
      }

      // Slug resolvido: vem da resposta ou do que foi selecionado
      const resolvedSlug = authData.slug ?? selectedSlug ?? "";
      // Persiste para uso no navigate do forceChange dialog
      if (resolvedSlug) setSelectedSlug(resolvedSlug);

      // ── PASSO 3: salvar sessão no sessionStorage e navegar ───────────────

      // Monta o objeto ClientAuth no formato que o PublicDashboardLayout espera
      // e salva no sessionStorage com a chave client_auth_v2_${slug}
      const clientInfo = authData.client_info ?? {};
      const clientAuthPayload = {
        // Identificação do cliente
        id:              clientInfo.id      ?? "",
        organization_id: clientInfo.organization_id ?? "",
        name:            clientInfo.name    ?? "",
        company:         clientInfo.company ?? null,
        favicon_url:     clientInfo.favicon_url ?? null,
        // Flags
        authenticated:       true,
        show_ia_content:     clientInfo.show_ia_content     ?? false,
        c8_control_enabled:  clientInfo.c8_control_enabled  ?? true,
        migration_completed: clientInfo.migration_completed ?? true,
        mode:                authData.mode ?? "bank_a",
        // Banco A: sem credenciais do Banco B
        client_supabase_url:      null,
        client_supabase_anon_key: null,
        // Módulos e metadata
        modules_config: clientInfo.modules_config ?? {},
        metadata: {
          dashboard_performance: clientInfo.metadata?.dashboard_performance ?? true,
          dashboard_atendimento: clientInfo.metadata?.dashboard_atendimento ?? false,
          conversion_metrics:    clientInfo.metadata?.conversion_metrics,
          dashboard_kpis:        clientInfo.metadata?.dashboard_kpis,
          geral_dashboard_cards: clientInfo.metadata?.geral_dashboard_cards,
        },
        // Usuário
        user: {
          id:        authData.user?.id        ?? "",
          email:     authData.user?.email     ?? realEmail,
          full_name: authData.user?.full_name ?? "",
          role:      authData.user?.role      ?? "member",
          client_id: clientInfo.id            ?? "",
          avatar_url: null,
        },
        // Sessão JWT
        session: authData.session,
      };

      // Salva no sessionStorage (nunca armazena anon_key)
      sessionStorage.setItem(
        `client_auth_v2_${resolvedSlug}`,
        JSON.stringify({ ...clientAuthPayload, client_supabase_anon_key: null })
      );

      // Login bem-sucedido — limpa lockout local
      clearLockout(realEmail);
      setIsLockedOut(false);

      // Verifica se precisa trocar senha temporária
      const payload   = parseJwtPayload(authData.session.access_token);
      const userMeta  = payload.user_metadata ?? authData.user ?? {};
      const forceChange = userMeta.force_password_change === true;
      if (forceChange) {
        setShowForceChange(true);
        return;
      }

      // Navega para o dashboard do cliente usando o slug descoberto no lookup
      navigate(`/${resolvedSlug}`);

    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // ── Seleção de cliente no seletor inline ──────────────────────────────────
  const handleSelectClient = (slug: string) => {
    setSelectedSlug(slug);
    setError(null);
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
      setForceStep("question");
    } catch { setChangeError("Erro ao atualizar senha. Tente novamente."); }
    finally { setChangeLoading(false); }
  };

  // ── Forgot: abre fluxo de recuperação ─────────────────────────────────────
  const goToForgot = () => {
    setForgotEmail(email);
    setForgotSlug(selectedSlug);
    setQuestionError(null);
    setSecretQuestion(null);
    setSecretAnswer("");
    setView("forgot-question");
  };

  // ── Forgot: busca a pergunta secreta ──────────────────────────────────────
  // Para buscar a pergunta, precisamos do e-mail interno (email::slug@c8.internal).
  // Se não há slug conhecido ainda, faz o lookup primeiro.
  const handleLoadQuestion = async (emailValue: string) => {
    setQuestionLoading(true);
    setQuestionError(null);
    try {
      let slug = forgotSlug;

      if (!slug) {
        const lookupRes = await fetch(LOOKUP_URL, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey":        SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body:    JSON.stringify({ email: emailValue.trim().toLowerCase() }),
        });
        const { clients } = await lookupRes.json() as { clients: ClientOption[] };
        if (!clients || clients.length === 0) {
          setQuestionError("E-mail não cadastrado. Entre em contato com a agência.");
          return;
        }
        // Se múltiplos, usa o primeiro (para o forgot basta um slug válido)
        slug = clients[0].slug;
        setForgotSlug(slug);
      }

      const internalEmail = `${emailValue.trim().toLowerCase()}::${slug}@c8.internal`;
      const res = await fetch(SECRET_QUESTION_URL, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body:    JSON.stringify({ action: "get-question", email: internalEmail }),
      });
      const data = await res.json();
      if (!data.has_question) {
        setQuestionError("Nenhuma pergunta secreta cadastrada. Entre em contato com a agência.");
        return;
      }
      setSecretQuestion(data.question);
    } catch { setQuestionError("Erro ao buscar pergunta. Tente novamente."); }
    finally { setQuestionLoading(false); }
  };

  // ── Forgot: verifica resposta ─────────────────────────────────────────────
  const handleVerifyAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuestionLoading(true);
    setQuestionError(null);
    try {
      const internalEmail = `${forgotEmail.trim().toLowerCase()}::${forgotSlug}@c8.internal`;
      const res = await fetch(SECRET_QUESTION_URL, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body:    JSON.stringify({ action: "verify-answer", email: internalEmail, answer: secretAnswer }),
      });
      const data = await res.json();
      if (!data.correct) { setQuestionError("Resposta incorreta. Tente novamente."); return; }
      setResetActionLink(data.action_link);
      setResetPassword(""); setResetConfirm(""); setResetError(null);
      setView("forgot-reset");
    } catch { setQuestionError("Erro ao verificar resposta. Tente novamente."); }
    finally { setQuestionLoading(false); }
  };

  // ── Forgot: salva nova senha ──────────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (!resetPassword.trim() || resetPassword.length < 6) { setResetError("A senha deve ter pelo menos 6 caracteres."); return; }
    if (resetPassword !== resetConfirm) { setResetError("As senhas não coincidem."); return; }
    if (!resetActionLink) { setResetError("Link de recuperação inválido. Recomece o processo."); return; }
    setResetLoading(true);
    try {
      const url = new URL(resetActionLink);
      const tokenHash = url.searchParams.get("token_hash") ?? null;
      const token     = url.searchParams.get("token") ?? url.hash.match(/access_token=([^&]+)/)?.[1] ?? null;
      const type      = (url.searchParams.get("type") ?? "recovery") as any;
      let sessionError: any = null;
      if (tokenHash) {
        const { error } = await supabaseAuth.auth.verifyOtp({ token_hash: tokenHash, type });
        sessionError = error;
      } else if (token) {
        const { error } = await supabaseAuth.auth.verifyOtp({ token_hash: token, type });
        sessionError = error;
      } else {
        window.location.href = resetActionLink; return;
      }
      if (sessionError) { setResetError("Link expirado. Recomece o processo."); return; }
      const { error: pwErr } = await supabaseAuth.auth.updateUser({ password: resetPassword });
      if (pwErr) { setResetError("Erro ao atualizar senha. Tente novamente."); return; }
      await supabaseAuth.auth.signOut();
      setView("login");
      clearLockout(forgotEmail.trim() || email.trim());
      setIsLockedOut(false);
      setError(null);
      setPassword("");
      setTimeout(() => setError("Senha atualizada com sucesso. Faça login."), 100);
    } catch { setResetError("Erro ao redefinir senha. Tente novamente."); }
    finally { setResetLoading(false); }
  };

  const backToLogin = () => { setView("login"); setError(null); };

  // ── Render ────────────────────────────────────────────────────────────────
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

        {/* ══ LOGIN ═════════════════════════════════════════════════════════ */}
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

                {/* E-mail */}
                <div className="space-y-2">
                  <Label className="text-slate-300">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      type="email"
                      placeholder="seu@email.com"
                      className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                      value={email}
                      onChange={e => handleEmailChange(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Senha */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Senha de Acesso</Label>
                    <button
                      type="button"
                      onClick={goToForgot}
                      className="text-[11px] text-[#7C3AED] hover:text-[#7C3AED]/80 font-bold transition-colors"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="bg-slate-900/50 border-slate-700 text-white pl-10 pr-10 h-12"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* ── Seletor de cliente (aparece inline quando necessário) ── */}
                {clientOptions.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400 font-semibold">
                      Seu e-mail está vinculado a mais de uma empresa. Selecione qual acessar:
                    </p>
                    <div className="space-y-2">
                      {clientOptions.map(c => (
                        <button
                          key={c.slug}
                          type="button"
                          onClick={() => handleSelectClient(c.slug)}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                            selectedSlug === c.slug
                              ? "border-[#7C3AED] bg-[#7C3AED]/10 text-white"
                              : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500 hover:text-white"
                          )}
                        >
                          <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="flex-1 text-sm font-semibold">{c.name}</span>
                          {selectedSlug === c.slug && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#7C3AED]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Erro */}
                {error && (
                  <p className={cn(
                    "text-sm font-medium",
                    error.startsWith("Senha atualizada") ? "text-emerald-400" : "text-red-400"
                  )}>
                    {error}
                  </p>
                )}

                {/* Lockout */}
                {isLockedOut && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 space-y-1">
                    <p className="text-red-400 text-xs font-bold">Conta bloqueada por segurança.</p>
                    <p className="text-slate-400 text-xs">
                      Use "Esqueci minha senha" para redefinir e desbloquear o acesso.
                    </p>
                  </div>
                )}

                {/* Botão */}
                <Button
                  type="submit"
                  className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold"
                  disabled={
                    loading ||
                    isLockedOut ||
                    (clientOptions.length > 1 && !selectedSlug)
                  }
                >
                  {loading
                    ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    : "Entrar no Dashboard"
                  }
                </Button>

              </form>
            </CardContent>
          </Card>
        )}

        {/* ══ ESQUECI MINHA SENHA — pergunta secreta ════════════════════════ */}
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
                {/* E-mail + botão buscar */}
                <div className="space-y-2">
                  <Label className="text-slate-300">E-mail</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        placeholder="seu@email.com"
                        className="w-full bg-slate-900/50 border border-slate-700 text-white pl-10 h-12 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50"
                        value={forgotEmail}
                        onChange={e => { setForgotEmail(e.target.value); setSecretQuestion(null); setQuestionError(null); setForgotSlug(null); }}
                        onBlur={e => { if (e.target.value.trim()) handleLoadQuestion(e.target.value); }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoadQuestion(forgotEmail)}
                      disabled={!forgotEmail.trim() || questionLoading}
                      className="h-12 px-4 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-bold transition-colors disabled:opacity-50"
                    >
                      {questionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                    </button>
                  </div>
                </div>

                {/* Pergunta + resposta */}
                {secretQuestion && (
                  <form onSubmit={handleVerifyAnswer} className="space-y-4">
                    <div className="rounded-lg bg-slate-900/50 border border-slate-700 p-4">
                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">
                        Sua pergunta secreta
                      </p>
                      <p className="text-slate-200 font-bold text-sm">{secretQuestion}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Sua resposta</Label>
                      <input
                        type="text"
                        placeholder="Digite sua resposta"
                        autoComplete="off"
                        className="w-full bg-slate-900/50 border border-slate-700 text-white h-12 rounded-md px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50"
                        value={secretAnswer}
                        onChange={e => setSecretAnswer(e.target.value)}
                        required
                      />
                      <p className="text-[10px] text-slate-500">Não diferencia maiúsculas/minúsculas ou acentos.</p>
                    </div>
                    {questionError && <p className="text-red-400 text-sm font-medium">{questionError}</p>}
                    <button
                      type="submit"
                      disabled={questionLoading || !secretAnswer.trim()}
                      className="w-full h-12 rounded-md bg-[#7C3AED] hover:bg-[#7C3AED]/90 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {questionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar e Continuar"}
                    </button>
                  </form>
                )}

                {questionError && !secretQuestion && (
                  <p className="text-red-400 text-sm font-medium">{questionError}</p>
                )}

                <button
                  onClick={backToLogin}
                  className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors pt-1"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar ao login
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══ NOVA SENHA (após pergunta secreta) ═══════════════════════════ */}
        {view === "forgot-reset" && (
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="text-white">Criar Nova Senha</CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Resposta correta. Defina sua nova senha de acesso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Nova senha</Label>
                  <div className="relative">
                    <Input
                      type={showResetPwd ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      className="bg-slate-900/50 border-slate-700 text-white pr-10 h-12"
                      value={resetPassword}
                      onChange={e => setResetPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Confirmar nova senha</Label>
                  <Input
                    type="password"
                    placeholder="Repita a senha"
                    className="bg-slate-900/50 border-slate-700 text-white h-12"
                    value={resetConfirm}
                    onChange={e => setResetConfirm(e.target.value)}
                    required
                  />
                </div>
                {resetError && <p className="text-red-400 text-sm font-medium">{resetError}</p>}
                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-600/90 h-12 font-bold"
                  disabled={resetLoading}
                >
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

      {/* ══ DIALOG: TROCA DE SENHA OBRIGATÓRIA ════════════════════════════ */}
      <Dialog open={showForceChange} onOpenChange={() => {}}>
        <DialogContent
          className="bg-[#1E293B] border-slate-800 text-slate-100 sm:max-w-md"
          onPointerDownOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
        >
          {/* Passo 1: nova senha */}
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
                  <Input
                    type={showNewPwd ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    className="bg-slate-900 border-slate-700 text-white pr-10 h-12"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Confirmar nova senha</Label>
                <Input
                  type="password"
                  placeholder="Repita a senha"
                  className="bg-slate-900 border-slate-700 text-white h-12"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
              {changeError && <p className="text-red-400 text-sm font-medium">{changeError}</p>}
            </div>
            <DialogFooter>
              <Button
                onClick={handleForcePasswordChange}
                disabled={changeLoading}
                className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold"
              >
                {changeLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Continuar →"}
              </Button>
            </DialogFooter>
          </>)}

          {/* Passo 2: pergunta secreta obrigatória */}
          {forceStep === "question" && (<>
            <DialogHeader>
              <DialogTitle className="text-white">Configure sua pergunta secreta</DialogTitle>
              <DialogDescription className="text-slate-400 text-sm">
                Necessário para recuperar o acesso caso esqueça a senha. Não é possível pular esta etapa.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <SecretQuestionForm
                required
                onSaved={() => { setShowForceChange(false); navigate(`/${selectedSlug || ""}`); }}
              />
            </div>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
