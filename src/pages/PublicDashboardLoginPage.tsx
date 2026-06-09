/**
 * PublicDashboardLoginPage — Fase 1 (T-1.1)
 *
 * Migração hard: autenticação por email + senha via Supabase Auth do Banco B.
 * A senha única antiga foi removida. Todos os usuários precisam ser
 * recadastrados pelo C8 Control antes de acessar.
 *
 * Fluxo:
 * 1. Busca dados do cliente no Banco A via RPC get_client_by_slug
 * 2. Autentica o usuário no Banco B (Supabase do cliente) via signInWithPassword
 * 3. Carrega role do usuário em crm_users no Banco B
 * 4. Salva sessão JWT no ClientAuthContext (sessionStorage, não localStorage)
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
import { createClientSupabase } from "@/lib/createClientSupabase";
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

// ─── Tipo da RPC ──────────────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  dashboard_slug: string;
  organization_id: string;
  favicon_url: string | null;
  dashboard_performance: boolean;
  dashboard_atendimento: boolean;
  show_ia_content: boolean;
  client_supabase_url: string | null;
  client_supabase_anon_key: string | null;
  conversion_metrics?: { lead_fields?: string[]; sale_fields?: string[] } | null;
  dashboard_kpis?: string[] | null;
  geral_dashboard_cards?: string[] | null;
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

    if (!slug?.trim()) {
      setError("URL inválida.");
      return;
    }

    if (!checkRateLimit(slug)) {
      setError("Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.");
      return;
    }

    setLoading(true);
    incrementRateLimit(slug);

    try {
      // 1. Busca dados do cliente no Banco A
      const { data: clients, error: fetchError } = await supabase
        .rpc("get_client_by_slug", { p_slug: slug.trim() });

      if (fetchError || !clients?.length) {
        setError("Dashboard não encontrado. Verifique o endereço de acesso.");
        return;
      }

      const client = clients[0] as ClientRow;

      if (!client.client_supabase_url || !client.client_supabase_anon_key) {
        setError("Este dashboard ainda não foi configurado. Contate o administrador.");
        return;
      }

      // 2. Autentica no Banco B do cliente
      const bankB = createClientSupabase(
        client.client_supabase_url,
        client.client_supabase_anon_key
      );

      const { data: authData, error: authError } = await bankB.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !authData.session) {
        setError("E-mail ou senha inválidos.");
        return;
      }

      // 3. Carrega role do usuário no Banco B
      const { data: userData, error: userError } = await bankB
        .from("crm_users")
        .select("id, email, full_name, role, client_id, avatar_url")
        .eq("id", authData.user.id)
        .eq("active", true)
        .maybeSingle();

      if (userError || !userData) {
        await bankB.auth.signOut();
        setError("Usuário não encontrado ou sem acesso. Contate o administrador.");
        return;
      }

      resetRateLimit(slug);

      // 4. Monta o auth completo e salva na sessão (sem senha, sem anon_key)
      const dynamicUser: DynamicUser = {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name ?? null,
        role: userData.role,
        client_id: userData.client_id,
        avatar_url: userData.avatar_url ?? null,
      };

      const auth: ClientAuth = {
        id: client.id,
        organization_id: client.organization_id,
        name: client.name,
        company: client.company ?? null,
        favicon_url: client.favicon_url ?? null,
        authenticated: true,
        show_ia_content: client.show_ia_content ?? false,
        // anon_key NÃO é persistida — só usada na sessão em memória
        client_supabase_url: client.client_supabase_url,
        client_supabase_anon_key: null,
        metadata: {
          dashboard_performance: client.dashboard_performance ?? true,
          dashboard_atendimento: client.dashboard_atendimento ?? false,
          ...(client.conversion_metrics && Object.keys(client.conversion_metrics).length > 0
            ? { conversion_metrics: client.conversion_metrics }
            : {}),
          ...(Array.isArray(client.dashboard_kpis) && client.dashboard_kpis.length > 0
            ? { dashboard_kpis: client.dashboard_kpis }
            : {}),
          ...(Array.isArray(client.geral_dashboard_cards) && client.geral_dashboard_cards.length > 0
            ? { geral_dashboard_cards: client.geral_dashboard_cards }
            : {}),
        },
        user: dynamicUser,
        session: authData.session,
      };

      // Salva no sessionStorage (sem anon_key)
      const safeAuth = { ...auth, client_supabase_anon_key: null };
      sessionStorage.setItem(`client_auth_v2_${slug}`, JSON.stringify(safeAuth));
      // Limpa formato antigo de senha única
      localStorage.removeItem(`client_auth_${slug}`);

      // Guarda a anon_key apenas em memória via sessionStorage temporário
      // para o useDynamicClient usar nesta sessão
      sessionStorage.setItem(`client_anon_${slug}`, client.client_supabase_anon_key);

      navigate(`/public/dashboard/${slug}`, { replace: true });
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
      const { data: clients } = await supabase
        .rpc("get_client_by_slug", { p_slug: slug.trim() });

      const client = (clients?.[0] as ClientRow | undefined);
      if (!client?.client_supabase_url || !client?.client_supabase_anon_key) {
        // Não revela se cliente existe
        setView("recovery_sent");
        return;
      }

      const bankB = createClientSupabase(
        client.client_supabase_url,
        client.client_supabase_anon_key
      );

      const redirectTo = `${window.location.origin}/public/dashboard/${slug}/login`;
      await bankB.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });

      setView("recovery_sent");
    } catch {
      // Sempre mostra sucesso para não revelar existência do e-mail
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
            Dashboard de Performance
          </h1>
          <p className="text-slate-400 font-medium italic text-sm">Powered by Agência C8</p>
        </div>

        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#2D8CC7]">

          {/* ── Login ── */}
          {view === "login" && (
            <>
              <CardHeader>
                <CardTitle className="text-white">Entrar no Dashboard</CardTitle>
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
                      : "Entrar no Dashboard"
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
