import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function extractCodeOrToken(value: string): { value: string; isCode: boolean } {
  const t = value.trim();
  try {
    if (t.startsWith("http") || t.includes("?")) {
      const url = new URL(t.startsWith("http") ? t : `https://x?${t.split("?")[1] ?? t}`);
      const code = url.searchParams.get("code");
      const tokenParam = url.searchParams.get("token");
      if (code) return { value: code, isCode: true };
      if (tokenParam) return { value: tokenParam, isCode: false };
    }
  } catch {
    /* ignore */
  }
  const looksLikeCode = /^[A-Z0-9]+-[A-Z0-9]+$/i.test(t) && t.length < 30;
  return { value: t, isCode: looksLikeCode };
}

export function CompleteRegistrationPage() {
  const [searchParams] = useSearchParams();
  const codeParam = searchParams.get("code");
  const tokenParam = searchParams.get("token");
  const tokenFromUrl = codeParam ?? tokenParam ?? "";

  const [token, setToken] = useState(tokenFromUrl);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { value: normalizedToken, isCode: isCodeFlow } = extractCodeOrToken(token);
  const isCodeFlowResolved = codeParam !== null ? true : tokenParam !== null ? false : isCodeFlow;

  const { signUp, signUpWithCode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  useEffect(() => {
    const t = normalizedToken;
    const minLen = isCodeFlowResolved ? 5 : 20;
    if (t.length < minLen) {
      setTokenValid(null);
      setOrgName(null);
      if (!isCodeFlowResolved) setEmail("");
      return;
    }
    setValidating(true);
    setTokenValid(null);
    (async () => {
      try {
        if (isCodeFlowResolved) {
          const { data } = await supabase.rpc("validate_registration_code", { code_input: t });
          const result = (data ?? {}) as { valid: boolean; organization_name?: string };
          setTokenValid(result?.valid ?? false);
          setOrgName(result?.organization_name ?? null);
        } else {
          const { data } = await supabase.rpc("validate_invitation_token", { token_input: t });
          const result = (data ?? {}) as { valid: boolean; email?: string; organization_name?: string };
          setTokenValid(result?.valid ?? false);
          setOrgName(result?.organization_name ?? null);
          if (result?.valid && result?.email) setEmail(result.email);
        }
      } catch {
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    })();
  }, [normalizedToken, isCodeFlowResolved]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const t = normalizedToken;
    if (!t) {
      setErr(isCodeFlowResolved ? "Código inválido." : "Link inválido. Acesse o link recebido.");
      return;
    }
    if (!fullName.trim()) {
      setErr("Nome completo é obrigatório");
      return;
    }
    if (!email.trim()) {
      setErr("E-mail é obrigatório");
      return;
    }
    if (password.length < 6) {
      setErr("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setErr("As senhas não coincidem");
      return;
    }

    if (!tokenValid) {
      setErr(isCodeFlowResolved ? "Código inválido ou expirado." : "Convite inválido ou expirado.");
      return;
    }
    setLoading(true);

    try {
      if (isCodeFlowResolved) {
        await signUpWithCode(email, password, fullName.trim(), t);
      } else {
        await signUp(email, password, fullName.trim(), t);
      }
      setSuccess(true);
      // O ProtectedRoute redirecionará para /profile-setup se o perfil estiver incompleto
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

  const hasValidToken = normalizedToken.length >= (isCodeFlowResolved ? 5 : 20);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold text-gray-dark">Completar cadastro</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isCodeFlowResolved
              ? "Use o link compartilhado para criar sua conta (válido por 72h)"
              : "Acesse o link enviado por e-mail para criar sua conta"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!hasValidToken ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isCodeFlowResolved ? "Cole o link ou o código recebido" : "Cole o link recebido por e-mail"}
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={isCodeFlowResolved ? "https://.../complete-registration?code=..." : "https://.../complete-registration?token=..."}
                  className={cn(
                    "w-full px-3 py-2 rounded-md border text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  )}
                />
              </div>
            ) : (
              <>
                {validating && (
                  <p className="text-sm text-gray-500">Validando {isCodeFlowResolved ? "código" : "convite"}...</p>
                )}
                {!validating && tokenValid === true && orgName && (
                  <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
                    ✓ {isCodeFlowResolved ? "Código" : "Convite"} válido. Organização: {orgName}
                  </p>
                )}
                {!validating && tokenValid === false && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                    {isCodeFlowResolved ? "Código" : "Convite"} inválido ou expirado.
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
                      "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    )}
                    placeholder="Seu nome"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mail *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={!isCodeFlowResolved}
                    required
                    className={cn(
                      "w-full px-3 py-2 rounded-md border text-sm",
                      isCodeFlowResolved
                        ? "border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
                        : "border-gray-200 bg-gray-50 text-gray-600"
                    )}
                    placeholder={isCodeFlowResolved ? "seu@email.com" : undefined}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Definir Senha *
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className={cn(
                        "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirmar Senha *
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className={cn(
                        "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      )}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500">Mínimo de 6 caracteres</p>
              </>
            )}

            {err && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{err}</p>
            )}

            {hasValidToken && (
              <Button
                type="submit"
                className="w-full"
                disabled={
                  loading ||
                  !tokenValid ||
                  !fullName.trim() ||
                  !email.trim() ||
                  !password ||
                  password !== confirmPassword
                }
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
