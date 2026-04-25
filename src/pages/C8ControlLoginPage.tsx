import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Mail, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type CrmClientInfo = {
  client_id: string;
  name: string;
  logo_url: string | null;
  subscription_status: string;
};

export function C8ControlLoginPage() {
  const { slug } = useParams<{ slug: string }>();

  const [clientInfo, setClientInfo] = useState<CrmClientInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [suspended, setSuspended] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);

  useEffect(() => {
    const fetchClient = async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_crm_client_by_slug",
        { p_slug: slug }
      );

      if (rpcError || !data || data.length === 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const client = data[0] as CrmClientInfo & {
        c8_control_enabled: boolean;
      };

      if (!client.c8_control_enabled) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (client.subscription_status === "bloqueado") {
        setSuspended(true);
        setLoading(false);
        return;
      }

      setClientInfo({
        client_id: client.client_id,
        name: client.name,
        logo_url: client.logo_url,
        subscription_status: client.subscription_status,
      });
      setLoading(false);
    };

    fetchClient();
  }, [slug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientInfo) return;

    setError(null);
    setLoading(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError || !authData.session) {
        setError("E-mail ou senha incorretos.");
        setLoading(false);
        return;
      }

      const { user, access_token } = authData.session;

      const { data: edgeData, error: edgeError } =
        await supabase.functions.invoke("crm-validate-access", {
          body: {
            action: "create_session",
            client_id: clientInfo.client_id,
            user_id: user.id,
          },
          headers: {
            "x-crm-api-key": import.meta.env.VITE_CRM_API_KEY ?? "",
            Authorization: `Bearer ${access_token}`,
          },
        });

      if (edgeError || !edgeData?.session_token) {
        setError("Erro ao iniciar sessão. Tente novamente.");
        setLoading(false);
        return;
      }

      const c8Url = import.meta.env.VITE_C8_CONTROL_URL ?? "";
      window.location.href = `${c8Url}/auth?session_token=${edgeData.session_token}&slug=${slug}`;
    } catch {
      setError("Erro ao iniciar sessão. Tente novamente.");
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(recoveryEmail);

      if (resetError) {
        setError("Erro ao enviar e-mail de recuperação. Tente novamente.");
      } else {
        setRecoverySent(true);
      }
    } catch {
      setError("Erro ao enviar e-mail de recuperação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // ── Loading inicial ──────────────────────────────────────────────────────────
  if (loading && !clientInfo && !notFound && !suspended) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#2D8CC7] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          {clientInfo?.logo_url ? (
            <img
              src={clientInfo.logo_url}
              alt={clientInfo.name}
              className="h-16 w-auto object-contain mb-4"
            />
          ) : (
            <div className="h-16 w-16 bg-[#2D8CC7] rounded-2xl flex items-center justify-center shadow-xl shadow-[#2D8CC7]/20 mb-4">
              <Lock className="h-8 w-8 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
            {notFound || suspended ? "C8 Control" : (clientInfo?.name ?? "C8 Control")}
          </h1>
          <p className="text-slate-400 font-medium italic text-sm">
            Powered by Agência C8
          </p>
        </div>

        {/* Card */}
        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#2D8CC7]">
          {/* Estado: não encontrado */}
          {(notFound) && (
            <>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  Acesso não encontrado
                </CardTitle>
                <CardDescription className="text-slate-400 text-sm">
                  O endereço acessado não corresponde a nenhum cliente ativo no
                  C8 Control.
                </CardDescription>
              </CardHeader>
            </>
          )}

          {/* Estado: suspenso */}
          {suspended && (
            <>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-400" />
                  Acesso suspenso
                </CardTitle>
                <CardDescription className="text-slate-400 text-sm">
                  Acesso temporariamente suspenso. Entre em contato com a
                  agência.
                </CardDescription>
              </CardHeader>
            </>
          )}

          {/* Estado: recuperação enviada */}
          {!notFound && !suspended && recoveryMode && recoverySent && (
            <>
              <CardHeader>
                <CardTitle className="text-white">E-mail enviado</CardTitle>
                <CardDescription className="text-slate-400 text-sm">
                  Verifique sua caixa de entrada para redefinir sua senha.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  variant="link"
                  className="text-slate-400 text-xs w-full"
                  onClick={() => {
                    setRecoveryMode(false);
                    setRecoverySent(false);
                    setRecoveryEmail("");
                  }}
                >
                  Voltar ao login
                </Button>
              </CardFooter>
            </>
          )}

          {/* Estado: modo recuperação */}
          {!notFound && !suspended && recoveryMode && !recoverySent && (
            <>
              <CardHeader>
                <CardTitle className="text-white">Recuperar senha</CardTitle>
                <CardDescription className="text-slate-400 text-sm">
                  Informe seu e-mail para receber o link de redefinição.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRecovery} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-md px-3 py-2">
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
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 h-12 font-bold"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      "Enviar link de recuperação"
                    )}
                  </Button>
                </form>
              </CardContent>
              <CardFooter>
                <Button
                  variant="link"
                  className="text-slate-400 text-xs w-full"
                  onClick={() => {
                    setRecoveryMode(false);
                    setError(null);
                  }}
                >
                  Voltar ao login
                </Button>
              </CardFooter>
            </>
          )}

          {/* Estado: formulário de login */}
          {!notFound && !suspended && !recoveryMode && clientInfo && (
            <>
              <CardHeader>
                <CardTitle className="text-white">Entrar no C8 Control</CardTitle>
                <CardDescription className="text-slate-400 text-sm">
                  Use suas credenciais para acessar o painel.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-md px-3 py-2">
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
                        onChange={(e) => setEmail(e.target.value)}
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
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 h-12 font-bold"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      "Entrar no C8 Control"
                    )}
                  </Button>
                </form>
              </CardContent>
              <CardFooter>
                <Button
                  variant="link"
                  className="text-slate-400 text-xs w-full"
                  onClick={() => {
                    setRecoveryMode(true);
                    setError(null);
                    setRecoveryEmail(email);
                  }}
                >
                  Esqueceu sua senha?
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
