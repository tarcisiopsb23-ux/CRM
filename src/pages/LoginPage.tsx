import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL não configurado");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/sign-in-with-lockout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        session?: { access_token: string; refresh_token: string };
      };

      if (!res.ok) {
        throw new Error(data?.error || `Erro ${res.status}: ${res.statusText}`);
      }

      const session = data.session;
      if (!session?.access_token || !session?.refresh_token) {
        throw new Error("Falha ao iniciar sessão");
      }

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (sessionErr) throw sessionErr;

      navigate(from, { replace: true });
    } catch (err: any) {
      console.error("Erro no login:", err);
      if (err.message?.includes("Invalid login credentials") || err.status === 400) {
        setErr("E-mail ou senha incorretos. Por favor, verifique seus dados.");
      } else if (err.message?.includes("Failed to fetch")) {
        setErr("Erro de conexão. Verifique sua internet ou desative extensões que possam bloquear o acesso.");
      } else {
        setErr(err.message || "Erro ao realizar login");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold text-gray-dark">Entrar</h1>
          <p className="text-gray-500 text-sm mt-1">
            Entre com email e senha para acessar o CRM
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={cn(
                  'w-full px-3 py-2 rounded-md border border-gray-300',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'
                )}
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={cn(
                  'w-full px-3 py-2 rounded-md border border-gray-300',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'
                )}
              />
            </div>
            {err && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                {err}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
            <p className="text-center text-sm text-gray-500">
              Recebeu um convite por e-mail?{' '}
              <Link to="/complete-registration" className="text-primary font-medium hover:underline">
                Completar cadastro
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
