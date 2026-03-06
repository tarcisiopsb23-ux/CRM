import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CompleteRegistrationPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";

  const [token, setToken] = useState(tokenFromUrl);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { signUp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  useEffect(() => {
    const t = token.trim();
    if (t.length < 20) {
      setTokenValid(null);
      setOrgName(null);
      setEmail("");
      return;
    }
    setValidating(true);
    setTokenValid(null);
    (async () => {
      try {
        const { data } = await (supabase as any).rpc("validate_invitation_token", {
          token_input: t,
        });
        const result = (data ?? {}) as { valid: boolean; email?: string; organization_name?: string };
        setTokenValid(result?.valid ?? false);
        setOrgName(result?.organization_name ?? null);
        if (result?.valid && result?.email) setEmail(result.email);
      } catch {
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const t = token.trim();
    if (!t) {
      setErr("Link inválido. Acesse o link recebido por e-mail.");
      return;
    }
    if (!fullName.trim()) {
      setErr("Nome completo é obrigatório");
      return;
    }
    if (!tokenValid) {
      setErr("Convite inválido ou expirado. Solicite um novo convite.");
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, fullName.trim(), t);
      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <p className="text-green-600 font-medium">
              Conta criada com sucesso! Redirecionando...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasValidToken = token.trim().length >= 20;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold text-gray-dark">Completar cadastro</h1>
          <p className="text-gray-500 text-sm mt-1">
            Acesse o link enviado por e-mail para criar sua conta (válido por 24h)
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!hasValidToken ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cole o link recebido por e-mail
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="https://.../complete-registration?token=..."
                  className={cn(
                    "w-full px-3 py-2 rounded-md border text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  )}
                />
              </div>
            ) : (
              <>
                {validating && (
                  <p className="text-sm text-gray-500">Validando convite...</p>
                )}
                {!validating && tokenValid === true && orgName && (
                  <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
                    ✓ Convite válido. Organização: {orgName}
                  </p>
                )}
                {!validating && tokenValid === false && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                    Convite inválido ou expirado. Solicite um novo.
                  </p>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome completo *
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                    className={cn(
                      "w-full px-3 py-2 rounded-md border border-gray-300",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    )}
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">Definido no convite</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senha *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={cn(
                      "w-full px-3 py-2 rounded-md border border-gray-300",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    )}
                  />
                  <p className="text-xs text-gray-500 mt-1">Mínimo de 6 caracteres</p>
                </div>
              </>
            )}

            {err && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{err}</p>
            )}

            {hasValidToken && (
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !tokenValid || !fullName.trim()}
              >
                {loading ? "Cadastrando..." : "Criar conta"}
              </Button>
            )}

            <p className="text-center text-sm text-gray-500">
              Já tem conta?{" "}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Entrar
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
