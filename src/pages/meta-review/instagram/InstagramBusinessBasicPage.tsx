/**
 * InstagramBusinessBasicPage — /meta-review/instagram-login/basic
 *
 * GRUPO 4 — INSTAGRAM LOGIN
 * Permissão: instagram_business_basic
 *
 * Demonstração real:
 *   1. Connect Instagram (Instagram Login direto — sem Facebook)
 *   2. Redirect para api.instagram.com/oauth/authorize
 *   3. Usuário autentica no Instagram
 *   4. Callback retorna ao C8
 *   5. GET /me?fields=id,username,name,profile_picture_url,biography,followers_count
 *   6. Exibe conta conectada
 *
 * Este fluxo NÃO começa pelo Facebook.
 * NÃO exibe access_token.
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Instagram, CheckCircle2, Loader2, Users,
  ArrowRight, RefreshCw, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";
import { LiveMetaIndicator } from "../shared/LiveMetaIndicator";
import { ApiRequestLog } from "../shared/ApiRequestLog";
import { ScreencastChecklist } from "../shared/ScreencastChecklist";
import { useMetaReviewProxy } from "@/hooks/useMetaReviewProxy";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const META_APP_ID = import.meta.env.VITE_META_APP_ID as string;

// Scopes do Instagram Login (diferentes do Facebook Login)
const IG_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

interface IgBusinessAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  biography?: string;
  followers_count?: number;
  media_count?: number;
  website?: string;
  account_type?: string;
}

const STEPS = [
  "Connect Instagram",
  "Instagram Authorization",
  "Return to C8",
  "Retrieve Account",
  "Display Account",
  "Account Connected",
];

export function InstagramBusinessBasicPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();

  const [step, setStep] = useState(1);
  const [igAccount, setIgAccount] = useState<IgBusinessAccount | null>(null);
  const [connected, setConnected] = useState(false);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  // Verifica se já há token Instagram
  useEffect(() => {
    call({
      permission: "instagram_business_basic",
      group_name: "GRUPO 4 — INSTAGRAM LOGIN",
      endpoint: "/me",
      params: { fields: "id,username,name,profile_picture_url,biography,followers_count,media_count,website,account_type" },
    }).then((res) => {
      if (res?.success && (res.data as any)?.id) {
        setIgAccount(res.data as IgBusinessAccount);
        setTestMode("LIVE_META_TEST");
        setStep(5);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Inicia Instagram Login (fluxo independente do Facebook)
  const handleConnect = () => {
    if (!META_APP_ID) {
      toast.error("META_APP_ID não configurado no .env do C8 Control.");
      return;
    }
    setStep(2);

    const redirectUri = `${window.location.origin}/oauth/callback`;
    const state = btoa(JSON.stringify({
      provider:  "instagram_login", // diferencia do fluxo Meta/Facebook
      clientId:  slug,
      slug,
      returnTo:  `/${slug}/meta-review/instagram-login/basic`,
      flow:      "instagram_business_login",
    }));

    const params = new URLSearchParams({
      client_id:     META_APP_ID,
      redirect_uri:  redirectUri,
      scope:         IG_LOGIN_SCOPES,
      response_type: "code",
      state,
    });

    // Instagram Login usa api.instagram.com, não facebook.com
    window.location.href = `https://api.instagram.com/oauth/authorize?${params}`;
  };

  // Busca perfil completo após callback
  const handleRetrieveAccount = async () => {
    setStep(4);
    const res = await call({
      permission: "instagram_business_basic",
      group_name: "GRUPO 4 — INSTAGRAM LOGIN",
      endpoint: "/me",
      params: {
        fields: "id,username,name,profile_picture_url,biography,followers_count,media_count,website,account_type",
      },
    });

    if (res?.success && (res.data as any)?.id) {
      setIgAccount(res.data as IgBusinessAccount);
      setTestMode("LIVE_META_TEST");
      setStep(5);
    } else {
      toast.error(res?.error ?? "Erro ao recuperar conta Instagram.");
    }
  };

  const handleConfirmConnection = () => {
    setConnected(true);
    setStep(6);
    toast.success(`Instagram @${igAccount?.username} conectado via Instagram Login!`);
  };

  return (
    <MetaReviewLayout
      permission="instagram_business_basic"
      useCase="Connect Instagram professional account directly via Instagram Login (no Facebook required)"
      group="GRUPO 4 — INSTAGRAM LOGIN"
      groupNumber={4}
      steps={STEPS.length}
      currentStep={step}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login-for-instagram"
      currentAction={STEPS[step - 1]}
      permissionGranted={!!igAccount}
    >
      {/* Step progress */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-wrap">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const active = step === n;
          return (
            <div key={label} className="flex items-center gap-1.5 shrink-0">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold border-2 transition-all",
                done   ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" :
                active ? "border-orange-500 bg-orange-500/20 text-orange-400" :
                         "border-border/50 text-muted-foreground/40"
              )}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
              </div>
              <span className={cn("text-[11px]",
                active ? "font-semibold text-foreground" : "text-muted-foreground/50"
              )}>{label}</span>
              {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/20 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Nota de diferença */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
        <p className="text-xs text-orange-400 font-semibold mb-1">Instagram Login — fluxo independente</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Este fluxo não obriga o usuário a ter ou usar uma conta Facebook.
          A autenticação ocorre diretamente em <code className="font-mono">api.instagram.com/oauth/authorize</code>,
          demonstrando o uso de <code className="font-mono">instagram_business_basic</code> sem dependência do Facebook Login.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">

          {/* Step 1: Connect */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  step > 1 ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"
                )}>1</span>
                Connect Instagram
              </CardTitle>
              <CardDescription className="text-xs">
                Inicia o fluxo OAuth via <code className="font-mono">api.instagram.com</code> —
                o usuário autentica no Instagram diretamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-1.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground/70">Scopes solicitados:</p>
                {IG_LOGIN_SCOPES.split(",").map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    <code className="font-mono">{s}</code>
                  </div>
                ))}
              </div>
              {igAccount ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />Conta Instagram conectada
                </div>
              ) : (
                <Button
                  onClick={handleConnect}
                  disabled={!META_APP_ID}
                  className="w-full gap-2 bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600 hover:opacity-90 text-white"
                >
                  <Instagram className="h-4 w-4" />
                  Connect Instagram
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Steps 2-3 explicados */}
          <Card className={cn("card-surface", step < 2 && "opacity-50")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  step > 3 ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"
                )}>2–3</span>
                Authorization → Return to C8
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border bg-secondary/10 p-3 text-xs text-muted-foreground space-y-1">
                <p>→ <code className="font-mono">api.instagram.com/oauth/authorize</code></p>
                <p>→ Usuário faz login com conta Instagram</p>
                <p>→ Concede permissões <code className="font-mono">instagram_business_*</code></p>
                <p>→ Callback retorna código para <code className="font-mono">/oauth/callback</code></p>
                <p>→ Edge Function troca código por token de longa duração</p>
                <p>→ Token salvo em <code className="font-mono">oauth_tokens</code> (nunca exposto)</p>
                <p>→ Retorno para <code className="font-mono">/meta-review/instagram-login/basic</code></p>
              </div>
              {step >= 3 && step < 5 && (
                <Button onClick={handleRetrieveAccount} disabled={loading}
                  className="w-full mt-3 gap-2" size="sm">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  Retrieve Account — GET /me
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Step 5-6: Conta conectada */}
          {igAccount && step >= 5 && (
            <Card className="card-surface border-orange-500/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">5</span>
                    Instagram Account Connected
                  </CardTitle>
                  <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Perfil */}
                <div className="flex items-center gap-4 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                  {igAccount.profile_picture_url ? (
                    <img src={igAccount.profile_picture_url} alt={igAccount.username}
                      className="h-16 w-16 rounded-full border-2 border-orange-500/30 object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600">
                      <Instagram className="h-8 w-8 text-white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground">@{igAccount.username}</p>
                    {igAccount.name && <p className="text-sm text-muted-foreground">{igAccount.name}</p>}
                    {igAccount.biography && (
                      <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-1">{igAccount.biography}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/20 text-[10px]">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                        {igAccount.account_type ?? "Professional"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] border-pink-500/30 text-pink-400">
                        Instagram Login
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Métricas */}
                {(igAccount.followers_count !== undefined || igAccount.media_count !== undefined) && (
                  <div className="grid grid-cols-2 gap-2">
                    {igAccount.followers_count !== undefined && (
                      <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                        <Users className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                        <p className="text-lg font-bold">{igAccount.followers_count.toLocaleString("pt-BR")}</p>
                        <p className="text-[10px] text-muted-foreground">Followers</p>
                      </div>
                    )}
                    {igAccount.media_count !== undefined && (
                      <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                        <Instagram className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                        <p className="text-lg font-bold">{igAccount.media_count}</p>
                        <p className="text-[10px] text-muted-foreground">Posts</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Dados retornados */}
                <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Retornado por GET /me — instagram_business_basic
                  </p>
                  {[
                    { label: "Username",    value: `@${igAccount.username}` },
                    { label: "IG User ID",  value: `${igAccount.id.slice(0, 8)}…` },
                    { label: "Account Type",value: igAccount.account_type ?? "—" },
                    { label: "Auth method", value: "Instagram Login (no Facebook)" },
                    { label: "Access Token",value: "NOT DISPLAYED — server-side only" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{label}:</span>
                      <span className={cn("font-mono text-right",
                        label === "Access Token" ? "text-amber-500/70" : "text-foreground/80"
                      )}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Confirmar + Refresh */}
                <div className="flex gap-2">
                  {step === 5 && (
                    <Button onClick={handleConfirmConnection}
                      className="flex-1 gap-2 bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600 hover:opacity-90 text-white">
                      <Link2 className="h-3.5 w-3.5" />Confirm Connection
                    </Button>
                  )}
                  {step === 6 && connected && (
                    <div className="flex-1 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm text-emerald-400 font-semibold">
                        @{igAccount.username} connected
                      </span>
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground"
                    onClick={handleRetrieveAccount} disabled={loading}>
                    <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <ApiRequestLog permission="instagram_business_basic" limit={10} />
          <ScreencastChecklist
            permission="instagram_business_basic"
            autoChecked={[
              ...(igAccount ? ["test_account", "permission", "asset_selected", "api_called", "result_displayed", "no_secrets"] : []),
              ...(connected ? ["flow_recorded", "meta_result"] : []),
            ]}
          />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
