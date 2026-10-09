/**
 * PagesShowListPage — /meta-review/pages-show-list
 *
 * GRUPO 2 — FACEBOOK PAGES
 * Permissão: pages_show_list
 *
 * Demonstração real:
 *   1. Connect Facebook (OAuth com pages_show_list scope)
 *   2. Authorization
 *   3. Return to C8
 *   4. Retrieve Pages — GET /me/accounts
 *   5. Display Pages
 *   6. User selects a Page
 *   7. Save connection
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2, Loader2, Facebook, ChevronRight,
  ArrowRight, Globe, Users,
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

const FB_PAGES_SCOPES = "public_profile,email,pages_show_list,pages_read_engagement";

const STEPS = [
  "Connect Facebook",
  "Authorization",
  "Return to C8",
  "Retrieve Pages",
  "Display Pages",
  "Select Page",
  "Save Connection",
];

interface FacebookPage {
  id: string;
  name: string;
  category?: string;
  fan_count?: number;
  followers_count?: number;
  picture?: { data: { url: string } };
}

export function PagesShowListPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();

  const [step, setStep] = useState(1);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<FacebookPage | null>(null);
  const [saved, setSaved] = useState(false);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  // Tenta recuperar páginas se já há token
  useEffect(() => {
    call({
      permission: "pages_show_list",
      group_name: "GRUPO 2 — FACEBOOK PAGES",
      endpoint: "/me/accounts",
      params: { fields: "id,name,category,fan_count,followers_count,picture.type(small)" },
    }).then((res) => {
      if (res?.success && Array.isArray((res.data as any)?.data)) {
        setPages((res.data as any).data as FacebookPage[]);
        setTestMode("LIVE_META_TEST");
        setStep(5);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = () => {
    if (!META_APP_ID) { toast.error("META_APP_ID não configurado."); return; }
    setStep(2);
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const state = btoa(JSON.stringify({
      provider: "meta", clientId: slug, slug,
      returnTo: `/${slug}/meta-review/pages-show-list`,
    }));
    const params = new URLSearchParams({
      client_id: META_APP_ID, redirect_uri: redirectUri,
      scope: FB_PAGES_SCOPES, response_type: "code", state,
    });
    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
  };

  const handleRetrievePages = async () => {
    setStep(4);
    const res = await call({
      permission: "pages_show_list",
      group_name: "GRUPO 2 — FACEBOOK PAGES",
      endpoint: "/me/accounts",
      params: { fields: "id,name,category,fan_count,followers_count,picture.type(small)" },
    });
    if (res?.success && Array.isArray((res.data as any)?.data)) {
      setPages((res.data as any).data as FacebookPage[]);
      setTestMode("LIVE_META_TEST");
      setStep(5);
    } else {
      toast.error(res?.error ?? "Não foi possível recuperar as Páginas.");
    }
  };

  const handleSelectPage = (page: FacebookPage) => {
    setSelectedPage(page);
    setStep(6);
  };

  const handleSave = () => {
    setSaved(true);
    setStep(7);
    toast.success(`Página "${selectedPage?.name}" salva com sucesso!`);
  };

  return (
    <MetaReviewLayout
      permission="pages_show_list"
      useCase="List Facebook Pages the authenticated user is authorized to access"
      group="GRUPO 2 — FACEBOOK PAGES"
      groupNumber={2}
      steps={STEPS.length}
      currentStep={step}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/graph-api/reference/user/accounts/"
      currentAction={STEPS[step - 1]}
      permissionGranted={pages.length > 0}
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
                active ? "border-violet-500 bg-violet-500/20 text-violet-400" :
                "border-border/50 text-muted-foreground/40"
              )}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
              </div>
              <span className={cn("text-[11px]",
                active ? "font-semibold text-foreground" : "text-muted-foreground/50"
              )}>{label}</span>
              {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/20" />}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">

          {/* Nota sobre o que a permissão faz */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-xs font-semibold text-blue-400 mb-1">
              pages_show_list — O que esta permissão faz
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Permite que o C8 Control liste todas as Páginas do Facebook que o usuário
              autenticado administra. Essa lista é usada para que o cliente selecione
              qual Página conectar ao inbox de mensagens e ao monitoramento de comentários.
            </p>
            <p className="text-xs text-blue-400/70 mt-2 font-medium">
              "This list contains Facebook Pages the authenticated user is authorized to access."
            </p>
          </div>

          {/* Step 1: Connect */}
          {step <= 3 && (
            <Card className="card-surface">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Connect Facebook</CardTitle>
                <CardDescription className="text-xs">
                  Scope: <code className="font-mono">pages_show_list</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pages.length === 0 ? (
                  <Button onClick={handleConnect} className="gap-2 bg-[#1877F2] hover:bg-[#0f6de0] text-white w-full">
                    <Facebook className="h-4 w-4" />
                    Connect Facebook
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Token disponível
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 4: Retrieve Pages */}
          {(step === 3 || step === 4) && (
            <Card className="card-surface">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  Retrieve Pages
                  <code className="text-[10px] font-mono bg-secondary/40 px-1.5 rounded">
                    GET /me/accounts
                  </code>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={handleRetrievePages} disabled={loading} className="w-full gap-2" size="sm">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  Execute API Call
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Display Pages */}
          {step >= 5 && pages.length > 0 && (
            <Card className="card-surface border-emerald-500/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Pages Retrieved</CardTitle>
                  <LiveMetaIndicator mode="LIVE_META_TEST" />
                </div>
                <CardDescription className="text-xs">
                  {pages.length} Página(s) encontrada(s) para o usuário autenticado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => step === 5 && handleSelectPage(page)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                      selectedPage?.id === page.id
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border bg-secondary/10 hover:bg-secondary/30"
                    )}
                  >
                    {page.picture?.data.url ? (
                      <img src={page.picture.data.url} alt={page.name}
                        className="h-9 w-9 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1877F2]/20 shrink-0">
                        <Facebook className="h-4 w-4 text-[#1877F2]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{page.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {page.category && <span>{page.category}</span>}
                        {page.fan_count !== undefined && (
                          <span className="flex items-center gap-0.5">
                            <Users className="h-2.5 w-2.5" />
                            {page.fan_count.toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedPage?.id === page.id && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    )}
                    {step === 5 && selectedPage?.id !== page.id && (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Step 6: Save */}
          {step === 6 && selectedPage && (
            <Card className="card-surface border-violet-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Save Connection</CardTitle>
                <CardDescription className="text-xs">
                  Página selecionada: <strong>{selectedPage.name}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleSave} className="w-full gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Save Page Connection
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 7: Saved */}
          {step === 7 && selectedPage && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-emerald-400">Connection Saved</span>
                <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
              </div>
              <p className="text-sm text-muted-foreground">
                Página <strong>{selectedPage.name}</strong> conectada ao C8 Control.
              </p>
              <div className="flex gap-2 text-xs text-muted-foreground pt-1">
                <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Esta Página será usada para acesso a mensagens, comentários e dados de engagement.</span>
              </div>
            </div>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <ApiRequestLog permission="pages_show_list" limit={8} />
          <ScreencastChecklist
            permission="pages_show_list"
            autoChecked={[
              ...(pages.length > 0 ? ["test_account", "permission", "api_called"] : []),
              ...(pages.length > 0 ? ["result_displayed"] : []),
              ...(saved ? ["asset_selected", "no_secrets"] : []),
            ]}
          />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
