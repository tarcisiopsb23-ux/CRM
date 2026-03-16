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
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [educationLevel, setEducationLevel] = useState("fundamental");
  const [graduation, setGraduation] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [notes, setNotes] = useState("");
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
    if (!phone.trim()) {
      setErr("Telefone é obrigatório");
      return;
    }
    if (!displayName.trim()) {
      setErr("Nome de exibição é obrigatório");
      return;
    }
    if (!cpf.trim()) {
      setErr("CPF é obrigatório");
      return;
    }
    if (!rg.trim()) {
      setErr("RG é obrigatório");
      return;
    }
    if (!pixKey.trim()) {
      setErr("Chave PIX é obrigatória");
      return;
    }
    if (!addressStreet.trim()) {
      setErr("Endereço é obrigatório");
      return;
    }
    if (!addressCity.trim()) {
      setErr("Cidade é obrigatória");
      return;
    }
    if (!addressState.trim()) {
      setErr("Estado é obrigatório");
      return;
    }
    if (!addressZip.trim()) {
      setErr("CEP é obrigatório");
      return;
    }
    if (!jobTitle.trim()) {
      setErr("Cargo é obrigatório");
      return;
    }

    if (!tokenValid) {
      setErr(isCodeFlowResolved ? "Código inválido ou expirado." : "Convite inválido ou expirado.");
      return;
    }
    setLoading(true);

    const extraMetadata = {
      phone,
      display_name: displayName,
      cpf,
      rg,
      pix_key: pixKey,
      address_street: addressStreet,
      address_city: addressCity,
      address_state: addressState,
      address_zip: addressZip,
      education_level: educationLevel,
      graduation,
      job_title: jobTitle,
      notes,
    };

    try {
      if (isCodeFlowResolved) {
        await signUpWithCode(email, password, fullName.trim(), t, extraMetadata);
      } else {
        await signUp(email, password, fullName.trim(), t, extraMetadata);
      }
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
                    Nome de exibição *
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className={cn(
                      "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    )}
                    placeholder="Como você quer ser chamado"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telefone *
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className={cn(
                        "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      )}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CPF *
                    </label>
                    <input
                      type="text"
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      required
                      className={cn(
                        "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      )}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      RG *
                    </label>
                    <input
                      type="text"
                      value={rg}
                      onChange={(e) => setRg(e.target.value)}
                      required
                      className={cn(
                        "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      )}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chave PIX *
                  </label>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    required
                    className={cn(
                      "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    )}
                    placeholder="E-mail, CPF, Telefone ou Aleatória"
                  />
                </div>

                <div className="space-y-4 pt-2 border-t">
                  <h3 className="text-sm font-semibold text-gray-900">Endereço</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rua e Número *
                    </label>
                    <input
                      type="text"
                      value={addressStreet}
                      onChange={(e) => setAddressStreet(e.target.value)}
                      required
                      className={cn(
                        "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cidade *
                      </label>
                      <input
                        type="text"
                        value={addressCity}
                        onChange={(e) => setAddressCity(e.target.value)}
                        required
                        className={cn(
                          "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                          "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estado *
                      </label>
                      <input
                        type="text"
                        value={addressState}
                        onChange={(e) => setAddressState(e.target.value)}
                        required
                        className={cn(
                          "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                          "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        )}
                        placeholder="Ex: SP"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CEP *
                    </label>
                    <input
                      type="text"
                      value={addressZip}
                      onChange={(e) => setAddressZip(e.target.value)}
                      required
                      className={cn(
                        "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      )}
                      placeholder="00000-000"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-2 border-t">
                  <h3 className="text-sm font-semibold text-gray-900">Formação e Cargo</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Escolaridade *
                      </label>
                      <select
                        value={educationLevel}
                        onChange={(e) => setEducationLevel(e.target.value)}
                        className={cn(
                          "w-full px-3 py-2 rounded-md border border-gray-300 text-sm bg-white",
                          "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        )}
                      >
                        <option value="fundamental">Fundamental</option>
                        <option value="medio">Médio</option>
                        <option value="superior">Superior</option>
                        <option value="pos">Pós-graduação</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Graduação
                      </label>
                      <input
                        type="text"
                        value={graduation}
                        onChange={(e) => setGraduation(e.target.value)}
                        className={cn(
                          "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                          "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        )}
                        placeholder="Ex: Marketing"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cargo *
                    </label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      required
                      className={cn(
                        "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observações
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={cn(
                      "w-full px-3 py-2 rounded-md border border-gray-300 text-sm",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    )}
                    placeholder="Informações adicionais..."
                    rows={3}
                  />
                </div>

                <div className="pt-2 border-t">
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
                disabled={
                  loading ||
                  !tokenValid ||
                  !fullName.trim() ||
                  !email.trim() ||
                  !phone.trim() ||
                  !displayName.trim() ||
                  !cpf.trim() ||
                  !rg.trim() ||
                  !pixKey.trim() ||
                  !addressStreet.trim() ||
                  !addressCity.trim() ||
                  !addressState.trim() ||
                  !addressZip.trim() ||
                  !jobTitle.trim()
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
