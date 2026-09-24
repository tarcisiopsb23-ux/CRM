import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

export function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setValidating(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase.rpc("validate_set_password_token", {
          token_input: token,
        });
        const result = (data ?? {}) as { valid: boolean; email?: string; full_name?: string };
        setTokenValid(result.valid ?? false);
        if (result.valid) {
          setUserEmail(result.email ?? "");
          setUserName(result.full_name ?? "");
        }
      } catch {
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/set-password-by-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? `Erro ${res.status}`);
      }

      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao definir senha.");
    } finally {
      setLoading(false);
    }
  }

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link inválido ou expirado</CardTitle>
            <CardDescription>
              Este link de definição de senha não é mais válido. Solicite um novo link ao administrador.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Senha definida com sucesso!
            </CardTitle>
            <CardDescription>
              Sua senha foi criada. Agora você pode fazer login com seu e-mail e senha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Ir para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Defina sua senha</CardTitle>
          <CardDescription>
            {userName ? `Olá, ${userName}! ` : ""}
            Crie uma senha para acessar sua conta{userEmail ? ` (${userEmail})` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  required
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500">As senhas não coincidem.</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password || !confirmPassword || password !== confirmPassword}
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
              ) : (
                "Definir senha"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
