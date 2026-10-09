/**
 * FacebookLoginDemoPage — /meta-review/facebook-login
 *
 * GRUPO 1 — FACEBOOK AUTHENTICATION
 * Permissões: public_profile, email
 *
 * Demonstração real:
 *   1. Botão Connect Facebook
 *   2. Fluxo OAuth Meta com scopes public_profile + email
 *   3. Callback retorna ao C8
 *   4. Chamada real a GET /me?fields=id,name,email,picture
 *   5. Exibição segura do usuário autenticado (sem token)
 *
 * NÃO exibe access_token em nenhum momento.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Facebook, CheckCircle2, Loader2, User,
  ArrowRight, RefreshCw, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";
import { LiveMetaIndicator } from "../shared/LiveMetaIndicator";
import { ApiRequestLog } from "../shared/ApiRequestLog";
import { ScreencastChecklist } from "../shared/ScreencastChecklist";
import { useMetaReviewProxy } from "@/hooks/useMetaReviewProxy";
import { useMetaReviewOrg } from "@/hooks/useMetaReviewOrg";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const META_APP_ID = import.meta.env.VITE_META_APP_ID as string;

// Scopes mínimos para demo: apenas identidade + email
const FB_LOGIN_SCOPES = "public_profile,email";

interface MetaUser {
  id: string;
  name: string;
  email?: string;
  picture?: { data: { url: string } };
}

// ── Steps da demonstração ─────────────────────────────────────────────────────
const STEPS = [
  "Connect Facebook",
  "Authorization",
  "Return to C8",
  "Retrieve User",
  "Display Account",
];

export function FacebookLoginDemoPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const organizationId = useMetaReviewOrg();
  const { call, loading: apiLoading } = useMetaReviewProxy();

  const [step, setStep] = useState(0);
  const [metaUser, setMetaUser] = useState<MetaUser | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  // Verifica se já há token Meta salvo para esta org
  useEffect(() => {
    if (!organizationId) return;
    setCheckingToken(true);

    supabase
      .from("oauth_tokens")
      .select("id, updated_at")
      .eq("provider", "meta")
      .in(
        "tenant_id",
        supabase
          .from("clients")
          .select("id")
          .eq("organization_id", organizationId)
          .then(() => []) as unknown as string[]
      )
      .maybeSingle()
      .then(({ data }) => {
        setHasToken(!!data?.id);
        if (data?.id) setStep(3); // já conectado, pula para "Retrieve"
      })
      .catch(() => {})
      .finally(() => setCheckingToken(false));

    // Alternativa mais simples: chama o proxy e vê se tem token
    call({
      permission: "public_profile",
      group_name: "GRUPO 1 — FACEBOOK AUTHENTICATION",
      endpoint: "/me",
      params: { fields: "id" },
    }).then((res) => {
      if (res?.success) {
        setHasToken(true);
        setStep(3);
        setTestMode("LIVE_META_TEST");
      }
    }).finally(() => setCheckingToken(false));
  }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inicia fluxo OAuth Meta para obter public_profile + email
  const handleConnect = () => {
    if (!META_APP_ID) {
      toast.error("META_APP_ID não configurado. Verifique o .env do C8 Control.");
      return;
    }
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const state = btoa(JSON.stringify({
      provider: "meta",
      clientId: slug,  // usado pelo OAuthCallbackPage para retornar aqui
      slug,
      returnTo: `/${slug}/meta-review/facebook-login`,
    }));

    const params = new URLSearchParams({
      client_id:     META_APP_ID,
      redirect_uri:  redirectUri,
      scope:         FB_LOGIN_SCOPES,
      response_type: "code",
      state,
      auth_type:     "rerequest", // força mostrar tela de permissão
    });

    setStep(1);
    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
  };

  // Chama GET /me com token real via proxy
  const handleRetrieveUser = async () => {
    setStep(3);
    const res = await call({
      permission: "public_profile",
      group_name: "GRUPO 1 — FACEBOOK AUTHENTICATION",
      endpoint: "/me",
      method: "GET",
      params: { fields: "id,name,email,picture.type(large)" },
    });

    if (res?.success && res.data) {
      setMetaUser(res.data as MetaUser);
      setTestMode("LIVE_META_TEST");
      setStep(4);
      toast.success("Usuário Meta recuperado com sucesso!");
    } else {
      toast.error(res?.error ?? "Erro ao recuperar dados do usuário Meta.");
    }
  };

  const handleDisconnect = () => {
    setMetaUser(null);
    setHasToken(false);
    setStep(0);
    setTestMode("DEVELOPMENT_MOCK");
  };

  return (
    <MetaReviewLayout
      permission="public_profile + email"
      useCase="Facebook Login — identify authenticated user and display connected account"
      group="GRUPO 1 — FACEBOOK AUTHENTICATION"
      groupNumber={1}
      steps={STEPS.length}
      currentStep={Math.max(step, 1)}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/facebook-login/web"
      currentAction={STEPS[step - 1]}
      permissionGranted={hasToken}
    >
      {/* ── Step Progress ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((label, i) => {
          const stepNum = i + 1;
          const done = step > stepNum;
          const active = step === stepNum;
          return (
            <div key={label} className="flex items-center gap-2 shrink-0">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border-2 transition-all",
                done   ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" :
                active ? "border-violet-500 bg-violet-500/20 text-violet-400 ring-2 ring-violet-500/20" :
                         "border-border text-muted-foreground/50"
              )}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
              </div>
              <span className={cn(
                "text-xs",
                active ? "font-semibold text-foreground" : "text-muted-foreground/60"
              )}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Coluna esquerda: fluxo de demonstração ── */}
        <div className="space-y-4">

          {/* Step 1 — Connect */}
          <Card className={cn("card-surface transition-all", step >= 1 && "border-violet-500/20")}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                    step >= 1 ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"
                  )}>1</span>
                  Connect Facebook
                </CardTitle>
                {step >= 1 && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              </div>
              <CardDescription className="text-xs">
                Inicia o fluxo oficial OAuth 2.0 com o Meta App C8 Control.
                Permissões solicitadas: <code className="font-mono">public_profile</code>, <code className="font-mono">email</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {checkingToken ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando conexão...
                </div>
              ) : hasToken ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-sm text-emerald-400">Conta Meta já conectada</span>
                </div>
              ) : (
                <Button
                  onClick={handleConnect}
                  className="gap-2 bg-[#1877F2] hover:bg-[#0f6de0] text-white w-full"
                  disabled={!META_APP_ID}
                >
                  <Facebook className="h-4 w-4" />
                  Connect Facebook
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Step 2 — Authorization */}
          <Card className={cn("card-surface transition-all", step >= 2 && "border-violet-500/20", step < 2 && "opacity-50")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  step >= 2 ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"
                )}>2</span>
                Authorization
              </CardTitle>
              <CardDescription className="text-xs">
                Usuário autoriza as permissões solicitadas no diálogo oficial do Meta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Permissões solicitadas:</p>
                {["public_profile — Nome e foto do perfil", "email — Endereço de e-mail"].map((p) => (
                  <div key={p} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    <code className="font-mono">{p}</code>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 3 — Return to C8 */}
          <Card className={cn("card-surface transition-all", step >= 3 && "border-violet-500/20", step < 3 && "opacity-50")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  step >= 3 ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"
                )}>3</span>
                Return to C8
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground space-y-1">
                <p>→ Meta redireciona para <code className="font-mono text-foreground/70">/oauth/callback</code></p>
                <p>→ C8 troca o código por token via Edge Function <code className="font-mono text-foreground/70">oauth-exchange</code></p>
                <p>→ Token salvo em <code className="font-mono text-foreground/70">oauth_tokens</code> (nunca exposto ao browser)</p>
                <p>→ Retorno para <code className="font-mono text-foreground/70">/meta-review/facebook-login</code></p>
              </div>
              {hasToken && step === 3 && (
                <Button
                  onClick={handleRetrieveUser}
                  disabled={apiLoading}
                  className="w-full gap-2"
                  size="sm"
                >
                  {apiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  Retrieve User — GET /me
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Step 4 — Retrieve + Step 5 — Display */}
          {step >= 4 && metaUser && (
            <Card className="card-surface border-emerald-500/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">5</span>
                    Connected Account
                  </CardTitle>
                  <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Perfil do usuário */}
                <div className="flex items-center gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  {metaUser.picture?.data.url ? (
                    <img
                      src={metaUser.picture.data.url}
                      alt={metaUser.name}
                      className="h-14 w-14 rounded-full border-2 border-emerald-500/30"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                      <User className="h-7 w-7 text-emerald-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{metaUser.name}</p>
                    {metaUser.email && (
                      <p className="text-sm text-muted-foreground">{metaUser.email}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                        Connected
                      </Badge>
                      <span className="text-[10px] text-muted-foreground/50 font-mono">
                        ID: {metaUser.id.slice(0, 8)}…
                      </span>
                    </div>
                  </div>
                </div>

                {/* Nota de segurança */}
                <div className="rounded-lg border border-border bg-secondary/20 p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Dados exibidos</p>
                  <div className="space-y-1">
                    {[
                      { label: "Name", value: metaUser.name, source: "public_profile" },
                      { label: "Email", value: metaUser.email ?? "Not granted", source: "email" },
                      { label: "User ID (app-scoped)", value: `${metaUser.id.slice(0, 8)}…`, source: "public_profile" },
                      { label: "Access Token", value: "NOT DISPLAYED — stored server-side only", source: "security" },
                    ].map(({ label, value, source }) => (
                      <div key={label} className="flex items-start justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">{label}:</span>
                        <div className="text-right space-y-0.5">
                          <span className={cn(
                            "font-mono",
                            source === "security" ? "text-amber-500/70" : "text-foreground/80"
                          )}>
                            {value}
                          </span>
                          <Badge variant="outline" className="ml-1 text-[9px] py-0">
                            {source}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground/50 italic">
                  "This list contains the authenticated Facebook user authorized to access the C8 Control app."
                </p>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-border flex-1"
                    onClick={handleRetrieveUser}
                    disabled={apiLoading}
                  >
                    <RefreshCw className={cn("h-3 w-3", apiLoading && "animate-spin")} />
                    Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    onClick={handleDisconnect}
                  >
                    <LogOut className="h-3 w-3" />
                    Reset Demo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Coluna direita: logs + checklist ── */}
        <div className="space-y-4">
          <ApiRequestLog permission="public_profile" limit={10} />
          <ScreencastChecklist
            permission="public_profile + email"
            autoChecked={[
              ...(hasToken ? ["test_account", "permission"] : []),
              ...(metaUser ? ["asset_selected", "api_called", "result_displayed", "no_secrets"] : []),
            ]}
          />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
