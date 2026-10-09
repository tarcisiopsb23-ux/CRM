/**
 * InstagramBasicPage — /meta-review/instagram-facebook-login/basic
 *
 * GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN
 * Permissão: instagram_basic
 *
 * Demonstração real:
 *   1. Facebook Page linked to Instagram professional account
 *   2. GET /{page-id}?fields=instagram_business_account
 *   3. GET /{ig-user-id}?fields=id,username,name,profile_picture_url,biography,followers_count
 *   4. Display Instagram account
 *   5. User confirms connection
 *
 * NÃO exibe access_token em nenhum momento.
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

interface FacebookPage { id: string; name: string; }
interface IgAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  biography?: string;
  followers_count?: number;
  media_count?: number;
  website?: string;
}

const STEPS = [
  "Facebook Page",
  "Linked Instagram Account",
  "Retrieve IG Profile",
  "Display Account",
  "Confirm Connection",
];

export function InstagramBasicPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();

  const [step, setStep] = useState(1);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<FacebookPage | null>(null);
  const [igAccountId, setIgAccountId] = useState<string | null>(null);
  const [igData, setIgData] = useState<IgAccount | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  // Carrega páginas disponíveis
  useEffect(() => {
    call({
      permission: "pages_show_list",
      group_name: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
      endpoint: "/me/accounts",
      params: { fields: "id,name" },
    }).then((res) => {
      if (res?.success) {
        const pgs = ((res.data as any)?.data ?? []) as FacebookPage[];
        setPages(pgs);
        if (pgs.length > 0) { setSelectedPage(pgs[0]); setStep(2); }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca conta Instagram vinculada à Página
  const handleFetchIgAccount = async () => {
    if (!selectedPage) { toast.error("Selecione uma Página primeiro."); return; }
    setStep(2);
    const res = await call({
      permission: "instagram_basic",
      group_name: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
      endpoint: `/${selectedPage.id}`,
      params: { fields: "instagram_business_account" },
      use_page_token: true,
      page_id: selectedPage.id,
    });

    if (res?.success) {
      const igId = (res.data as any)?.instagram_business_account?.id;
      if (!igId) {
        toast.error("Esta Página não tem conta Instagram profissional vinculada.");
        return;
      }
      setIgAccountId(igId);
      setTestMode("LIVE_META_TEST");
      // Busca perfil completo
      await handleFetchIgProfile(igId);
    } else {
      toast.error(res?.error ?? "Erro ao buscar conta Instagram.");
    }
  };

  const handleFetchIgProfile = async (igId: string) => {
    setStep(3);
    const res = await call({
      permission: "instagram_basic",
      group_name: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
      endpoint: `/${igId}`,
      params: {
        fields: "id,username,name,profile_picture_url,biography,followers_count,media_count,website",
      },
    });

    if (res?.success && (res.data as any)?.id) {
      setIgData(res.data as IgAccount);
      setStep(4);
    } else {
      toast.error(res?.error ?? "Erro ao recuperar perfil do Instagram.");
    }
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setStep(5);
    toast.success(`Instagram @${igData?.username} conectado ao C8 Control!`);
  };

  return (
    <MetaReviewLayout
      permission="instagram_basic"
      useCase="Access Instagram professional account linked to a Facebook Page"
      group="GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN"
      groupNumber={3}
      steps={STEPS.length}
      currentStep={step}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/instagram-api/getting-started"
      currentAction={STEPS[step - 1]}
      permissionGranted={!!igData}
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
                done ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" :
                active ? "border-pink-500 bg-pink-500/20 text-pink-400" :
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">

          {/* Step 1-2: Page selector */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  step > 2 ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground")}>1</span>
                Facebook Page → Linked Instagram Account
              </CardTitle>
              <CardDescription className="text-xs">
                O C8 busca a conta Instagram profissional vinculada à Página selecionada
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Conecte uma Página em{" "}
                  <a href={`/${slug}/meta-review/pages-show-list`} className="text-violet-400 hover:underline">
                    pages_show_list
                  </a>{" "}primeiro.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Página Facebook selecionada:</p>
                    <select
                      value={selectedPage?.id ?? ""}
                      onChange={(e) => {
                        const p = pages.find((pg) => pg.id === e.target.value);
                        if (p) { setSelectedPage(p); setIgData(null); setIgAccountId(null); setStep(2); }
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    >
                      {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <Button
                    onClick={handleFetchIgAccount}
                    disabled={loading || !selectedPage}
                    className="w-full gap-2"
                    size="sm"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Instagram className="h-3.5 w-3.5" />}
                    GET /{selectedPage?.id}/instagram_business_account
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Step 4: Perfil do Instagram */}
          {igData && step >= 4 && (
            <Card className="card-surface border-pink-500/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500/20 text-[10px] font-bold text-pink-400">4</span>
                    Instagram Account
                  </CardTitle>
                  <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Perfil */}
                <div className="flex items-center gap-4 rounded-xl border border-pink-500/20 bg-pink-500/5 p-4">
                  {igData.profile_picture_url ? (
                    <img
                      src={igData.profile_picture_url}
                      alt={igData.username}
                      className="h-16 w-16 rounded-full border-2 border-pink-500/30 object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                      <Instagram className="h-8 w-8 text-white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground">@{igData.username}</p>
                    {igData.name && <p className="text-sm text-muted-foreground">{igData.name}</p>}
                    {igData.biography && (
                      <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-1">{igData.biography}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-3">
                      <Badge className="bg-pink-500/15 text-pink-400 border-pink-500/20 text-[10px]">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />Professional Account
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Métricas */}
                {(igData.followers_count !== undefined || igData.media_count !== undefined) && (
                  <div className="grid grid-cols-2 gap-2">
                    {igData.followers_count !== undefined && (
                      <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                        <Users className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                        <p className="text-lg font-bold">{igData.followers_count.toLocaleString("pt-BR")}</p>
                        <p className="text-[10px] text-muted-foreground">Followers</p>
                      </div>
                    )}
                    {igData.media_count !== undefined && (
                      <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                        <Instagram className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                        <p className="text-lg font-bold">{igData.media_count}</p>
                        <p className="text-[10px] text-muted-foreground">Posts</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Dados exibidos */}
                <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Dados retornados pela API</p>
                  {[
                    { label: "Username", value: `@${igData.username}`, perm: "instagram_basic" },
                    { label: "IG User ID", value: `${igData.id.slice(0, 8)}…`, perm: "instagram_basic" },
                    { label: "Followers", value: igData.followers_count?.toLocaleString("pt-BR") ?? "—", perm: "instagram_basic" },
                    { label: "Access Token", value: "NOT DISPLAYED — server-side only", perm: "security" },
                  ].map(({ label, value, perm }) => (
                    <div key={label} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{label}:</span>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("font-mono", perm === "security" ? "text-amber-500/70" : "text-foreground/80")}>{value}</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1">{perm}</Badge>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Step 5: Confirmar */}
                {step === 4 && (
                  <Button onClick={handleConfirm} className="w-full gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white">
                    <Link2 className="h-3.5 w-3.5" />
                    Confirm Instagram Connection
                  </Button>
                )}

                {step === 5 && confirmed && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm text-emerald-400 font-semibold">
                      @{igData.username} connected to C8 Control
                    </span>
                  </div>
                )}

                <Button variant="ghost" size="sm" className="w-full gap-1.5 text-xs text-muted-foreground"
                  onClick={() => handleFetchIgProfile(igData.id)} disabled={loading}>
                  <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />Refresh
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <ApiRequestLog permission="instagram_basic" limit={10} />
          <ScreencastChecklist
            permission="instagram_basic"
            autoChecked={[
              ...(pages.length > 0 ? ["test_account", "permission"] : []),
              ...(igData ? ["asset_selected", "api_called", "result_displayed", "no_secrets"] : []),
              ...(confirmed ? ["flow_recorded", "meta_result"] : []),
            ]}
          />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
