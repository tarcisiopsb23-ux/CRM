/**
 * SetPasswordPage — Dashboard Público
 *
 * Exibida após login com senha temporária (force_password_change = true).
 * O usuário DEVE definir uma senha permanente antes de acessar o dashboard.
 * Não pode ser ignorada — PublicDashboardLayout bloqueia o acesso enquanto
 * force_password_change estiver ativo na sessão.
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KeyRound, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClientSupabase } from "@/lib/createClientSupabase";

// Regras de validação da senha
const RULES = [
  { id: "len",   label: "Mínimo 8 caracteres",          test: (p: string) => p.length >= 8 },
  { id: "upper", label: "Pelo menos uma letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "Pelo menos uma letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { id: "num",   label: "Pelo menos um número",          test: (p: string) => /\d/.test(p) },
];

export function SetPasswordPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate  = useNavigate();

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPwd,   setShowPwd]   = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState(false);

  // Força tema dark
  useEffect(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }, []);

  // Verifica que há uma sessão ativa com force_password_change
  useEffect(() => {
    if (!slug) return;
    const raw = sessionStorage.getItem(`client_auth_v2_${slug}`);
    if (!raw) {
      navigate(`/${slug}/login`, { replace: true });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.force_password_change) {
        // Já definiu senha — vai para o dashboard
        navigate(`/${slug}`, { replace: true });
      }
    } catch {
      navigate(`/${slug}/login`, { replace: true });
    }
  }, [slug, navigate]);

  const rules       = RULES.map(r => ({ ...r, ok: r.test(password) }));
  const allRulesOk  = rules.every(r => r.ok);
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit   = allRulesOk && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !slug) return;
    setError(null);
    setLoading(true);

    try {
      const raw    = sessionStorage.getItem(`client_auth_v2_${slug}`);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed?.session?.access_token) throw new Error("Sessão não encontrada.");

      // Usa o cliente do Banco A — injeta a sessão e atualiza a senha
      const BANK_A_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const BANK_A_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const bankA      = createClientSupabase(BANK_A_URL, BANK_A_KEY);

      await bankA.auth.setSession({
        access_token:  parsed.session.access_token,
        refresh_token: parsed.session.refresh_token,
      });

      const { error: updateErr } = await bankA.auth.updateUser({
        password,
        data: { force_password_change: false },
      });

      if (updateErr) throw new Error(updateErr.message);

      // Remove o flag da sessão e redireciona
      const updated = { ...parsed, force_password_change: false };
      sessionStorage.setItem(`client_auth_v2_${slug}`, JSON.stringify(updated));
      setSuccess(true);
      setTimeout(() => navigate(`/${slug}`, { replace: true }), 2000);

    } catch (err: any) {
      setError(err.message ?? "Erro ao definir senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="h-16 w-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Senha definida com sucesso!</h2>
          <p className="text-slate-400 text-sm">Redirecionando para o dashboard...</p>
          <Loader2 className="h-5 w-5 text-slate-400 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Ícone e título */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="h-16 w-16 bg-violet-600/20 rounded-2xl flex items-center justify-center shadow-xl shadow-violet-600/20">
            <ShieldCheck className="h-9 w-9 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Defina sua senha permanente</h1>
            <p className="text-slate-400 text-sm mt-1">
              Você está usando uma senha temporária. Por segurança, defina uma senha permanente antes de continuar.
            </p>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-slate-300 text-sm">Nova senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Digite sua nova senha"
                className="bg-[#1E293B] border-slate-700 text-white placeholder:text-slate-500 pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-slate-300 text-sm">Confirmar senha</Label>
            <div className="relative">
              <Input
                id="confirm"
                type={showConf ? "text" : "password"}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Confirme sua nova senha"
                className="bg-[#1E293B] border-slate-700 text-white placeholder:text-slate-500 pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConf(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showConf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirm && !passwordsMatch && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> As senhas não coincidem
              </p>
            )}
            {confirm && passwordsMatch && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Senhas coincidem
              </p>
            )}
          </div>

          {/* Regras de validação */}
          {password && (
            <div className="bg-[#1E293B] rounded-lg p-3 space-y-1.5">
              {rules.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  {r.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    : <XCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  }
                  <span className={`text-xs ${r.ok ? "text-emerald-400" : "text-slate-500"}`}>
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold h-11"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
            Definir senha permanente
          </Button>
        </form>
      </div>
    </div>
  );
}
