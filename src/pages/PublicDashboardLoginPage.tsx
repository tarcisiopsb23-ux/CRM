/**
 * PublicDashboardLoginPage — Banco A unificado
 *
 * Autenticação via Edge Function client-dashboard-auth.
 * Todos os clientes operam no Banco A.
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle,
  CardDescription, CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Activity, Lock, Mail, Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { ClientAuth } from "@/contexts/ClientAuthContext";
import type { DynamicUser } from "@/hooks/useDynamicAuth";

// ─── Rate limiting client-side ────────────────────────────────────────────────

const RL_MAX = 5;
const RL_WINDOW = 15 * 60 * 1000;

function checkRateLimit(slug: string): boolean {
  const key = `rl_login_${slug}`;
  const raw = sessionStorage.getItem(key);
  const now = Date.now();
  const entry = raw ? JSON.parse(raw) : { count: 0, start: now };
  if (now - entry.start > RL_WINDOW) return true;
  return entry.count < RL_MAX;
}

function incrementRateLimit(slug: string): void {
  const key = `rl_login_${slug}`;
  const raw = sessionStorage.getItem(key);
  const now = Date.now();
  const entry = raw ? JSON.parse(raw) : { count: 0, start: now };
  if (now - entry.start > RL_WINDOW) {
    sessionStorage.setItem(key, JSON.stringify({ count: 1, start: now }));
  } else {
    sessionStorage.setItem(key, JSON.stringify({ ...entry, count: entry.count + 1 }));
  }
}

function resetRateLimit(slug: string): void {
  sessionStorage.removeItem(`rl_login_${slug}`);
}

// ─── Componente ───────────────────────────────────────────────────────────────

type View = "login" | "recovery" | "recovery_sent";

export function PublicDashboardLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Força tema dark
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.removeAttribute("data-sidebar-color");
  }, []);

  // Redireciona se já autenticado
  useEffect(() => {
    const key = `client_auth_v2_${slug}`;
    const raw = sessionStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.authenticated && parsed?.session?.access_token) {
          const exp = parsed.session.expires_at;
          if (!exp || Date.now() / 1000 < exp) {
            navigate(`/public/dashboard/${slug}`, { replace: true });
          }
        }
      } catch { /* sessão inválida, segue para login */ }
    }
  }, [slug, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Quando não há slug na URL (login geral), a EF resolve o slug pelo e-mail
    if (slug && !slug.trim()) {
      setError("URL inválida.");
      return;
    }

    const effectiveSlug = slug?.trim() ?? "";

    if (effectiveSlug && !checkRateLimit(effectiveSlug)) {
      setError("Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.");
      return;
    }

    setLoading(true);
    if (effectiveSlug) incrementRateLimit(effectiveSlug);

    try {
      // ── Autenticação via Edge Function ──────────────────────────────────────
      const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-dashboard-auth`;
      const anonKey   = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

      const resp = await fetch(edgeFnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        anonKey,
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          ...(effectiveSlug ? { slug: effectiveSlug } : {}),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await resp.json();

      if (resp.status === 429) {
        setError(data.error ?? "Muitas tentativas. Aguarde antes de tentar novamente.");
        return;
      }

      if (!resp.ok || !data.session) {
        setError(data.error ?? "E-mail ou senha inválidos.");
        return;
      }

      const session       = data.session as import("@supabase/supabase-js").Session;
      const bankAClientInfo = data.client_info;
      const bankAUser     = data.user;

      if (!bankAClientInfo || !bankAUser) {
        setError("Erro ao obter dados do dashboard. Tente novamente.");
        return;
      }

      resetRateLimit(effectiveSlug);

      // Slug resolvido: usa o da URL ou o retornado pela EF (login sem slug)
      const resolvedSlug = effectiveSlug || (data.slug as string) || "";

      if (!resolvedSlug) {
        setError("Não foi possível identificar o cliente. Tente acessar pelo link direto.");
        return;
      }

      const dynamicUser: DynamicUser = {
        id:        bankAUser.id,
        email:     bankAUser.email,
        full_name: bankAUser.full_name ?? null,
        role:      bankAUser.role ?? "member",
        client_id: bankAClientInfo.id,
        avatar_url: null,
      };

      const auth: ClientAuth = {
        id:              bankAClientInfo.id,
        organization_id: bankAClientInfo.organization_id,
        name:            bankAClientInfo.client_name ?? "",
        company:         bankAClientInfo.client_company ?? null,
        favicon_url:     null,
        authenticated:   true,
        show_ia_content: bankAClientInfo.show_ia_content ?? false,
        modules_config:  (bankAClientInfo.modules_config as import("@/contexts/ClientAuthContext").ModulesConfig) ?? undefined,
        metadata: {
          dashboard_performance: bankAClientInfo.metadata?.dashboard_performance ?? true,
          dashboard_atendimento: bankAClientInfo.metadata?.dashboard_atendimento ?? false,
          conversion_metrics:   bankAClientInfo.metadata?.conversion_metrics,
          dashboard_kpis:       bankAClientInfo.metadata?.dashboard_kpis,
          geral_dashboard_cards: bankAClientInfo.metadata?.geral_dashboard_cards,
        },
        user:    dynamicUser,
        session: session,
      };

      sessionStorage.setItem(`client_auth_v2_${resolvedSlug}`, JSON.stringify(auth));
      localStorage.removeItem(`client_auth_${resolvedSlug}`);

      // Verifica force_password_change (definido pela edge function nos user_metadata)
      if (data.force_password_change) {
        const withFlag = { ...auth, force_password_change: true };
        sessionStorage.setItem(`client_auth_v2_${resolvedSlug}`, JSON.stringify(withFlag));
        navigate(`/public/dashboard/${resolvedSlug}/set-password`, { replace: true });
        return;
      }

      navigate(`/public/dashboard/${resolvedSlug}`, { replace: true });
    } catch (err) {
      setError("Erro ao conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!slug?.trim()) { setError("URL inválida."); return; }
    if (!email.trim()) { setError("Informe o e-mail."); return; }
    setLoading(true);
    try {
      // Dispara resetPasswordForEmail via Banco A diretamente
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/public/dashboard/${slug}/set-password`,
      });
      // Sempre mostra sucesso — não revela existência do e-mail
      setView("recovery_sent");
    } catch {
      setView("recovery_sent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">

        {/* Logo / título */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-16 w-16 bg-[#2D8CC7] rounded-2xl flex items-center justify-center shadow-xl shadow-[#2D8CC7]/20 mb-4">
            <Activity className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            C8 Control
          </h1>
          <p className="text-slate-400 font-medium italic text-sm">Powered by Agência C8</p>
        </div>

        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#2D8CC7]">

          {/* ── Login ── */}
          {view === "login" && (
            <>
              <CardHeader>
                <CardTitle className="text-white">Entrar no C8 Control</CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Use o e-mail e senha configurados pelo administrador.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-slate-300">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        type="password"
                        placeholder="••••••••"
                        className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 h-12 font-bold"
                    disabled={loading}
                  >
                    {loading
                      ? <><Loader2 className="h-5 w-5 animate-spin mr-2" />Entrando...</>
                      : "Entrar no C8 Control"
                    }
                  </Button>
                </form>
              </CardContent>
              <CardFooter>
                <Button
                  variant="link"
                  className="text-slate-500 text-xs w-full"
                  onClick={() => { setError(null); setView("recovery"); }}
                >
                  Esqueceu sua senha? Recuperar acesso
                </Button>
              </CardFooter>
            </>
          )}

          {/* ── Recuperação de senha ── */}
          {view === "recovery" && (
            <>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-slate-400"
                    onClick={() => { setError(null); setView("login"); }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  Recuperar Senha
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Enviaremos um link de redefinição para o seu e-mail.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRecovery} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-slate-300">E-mail cadastrado</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 h-12 font-bold"
                    disabled={loading}
                  >
                    {loading
                      ? <><Loader2 className="h-5 w-5 animate-spin mr-2" />Enviando...</>
                      : "Enviar link de recuperação"
                    }
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {/* ── E-mail enviado ── */}
          {view === "recovery_sent" && (
            <>
              <CardHeader>
                <CardTitle className="text-white">E-mail enviado</CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  variant="link"
                  className="text-slate-400 text-xs w-full"
                  onClick={() => { setError(null); setView("login"); }}
                >
                  Voltar ao login
                </Button>
              </CardFooter>
            </>
          )}
        </Card>

        <footer className="text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
          <p>&copy; {new Date().getFullYear()} Agência C8. Todos os Direitos Reservados.</p>
        </footer>
      </div>
    </div>
  );
}
