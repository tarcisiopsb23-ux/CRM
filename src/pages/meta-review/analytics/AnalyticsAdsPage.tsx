/**
 * AnalyticsAdsPage — /meta-review/analytics-ads
 *
 * GRUPO 8 — ANALYTICS / ADS
 * Permissões:
 *   ads_read         → KEEP — demo real com GET /act_{ad-account-id}/campaigns
 *   read_insights    → KEEP — demo real com GET /{ad-account-id}/insights
 *   pages_manage_ads → KEEP — demo real com GET /{page-id}/ads
 *   ads_management   → NOT READY FOR REVIEW (criar/editar campanhas — não implementado)
 *   Marketing API Access Tier → standard access (automático para Business Apps)
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart3, TrendingUp, DollarSign, Eye, MousePointerClick,
  Loader2, RefreshCw, CheckCircle2, ChevronDown, ChevronUp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";
import { NotReadyBanner } from "../shared/NotReadyBanner";
import { LiveMetaIndicator } from "../shared/LiveMetaIndicator";
import { ApiRequestLog } from "../shared/ApiRequestLog";
import { ScreencastChecklist } from "../shared/ScreencastChecklist";
import { PermissionBadge } from "../shared/PermissionBadge";
import { useMetaReviewProxy } from "@/hooks/useMetaReviewProxy";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface AdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  amount_spent?: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  created_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface InsightMetric {
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  cpc?: string;
  ctr?: string;
  cpp?: string;
  date_start: string;
  date_stop: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: string | undefined): string {
  if (!n) return "—";
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : num.toLocaleString("pt-BR");
}

function fmtCurrency(n: string | undefined, currency = "BRL"): string {
  if (!n) return "—";
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  return num.toLocaleString("pt-BR", { style: "currency", currency });
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon, label, value, sub, color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export function AnalyticsAdsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { call, loading } = useMetaReviewProxy();

  const [activeSection, setActiveSection] = useState<"ads_read" | "read_insights" | "pages_manage_ads" | "ads_management">("ads_read");

  // ads_read state
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AdAccount | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adsReadCalled, setAdsReadCalled] = useState(false);
  const [adsReadMode, setAdsReadMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  // read_insights state
  const [insights, setInsights] = useState<InsightMetric | null>(null);
  const [insightsCalled, setInsightsCalled] = useState(false);
  const [insightsMode, setInsightsMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  // pages_manage_ads state
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [selectedPageAds, setSelectedPageAds] = useState<{ id: string; name: string } | null>(null);
  const [pageAds, setPageAds] = useState<{ id: string; name: string; status: string }[]>([]);
  const [pageAdsCalled, setPageAdsCalled] = useState(false);
  const [pageAdsMode, setPageAdsMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  // Carrega contas de anúncio ao montar
  useEffect(() => {
    call({
      permission: "ads_read",
      group_name: "GRUPO 8 — ANALYTICS / ADS",
      endpoint:   "/me/adaccounts",
      params:     { fields: "id,name,account_status,currency,amount_spent", limit: 10 },
    }).then((res) => {
      if (res?.success) {
        const accounts = ((res.data as any)?.data ?? []) as AdAccount[];
        setAdAccounts(accounts);
        if (accounts.length > 0) setSelectedAccount(accounts[0]);
        setAdsReadMode("LIVE_META_TEST");
      }
    });

    // Carrega páginas para pages_manage_ads
    call({
      permission: "pages_show_list",
      group_name: "GRUPO 8 — ANALYTICS / ADS",
      endpoint:   "/me/accounts",
      params:     { fields: "id,name" },
    }).then((res) => {
      if (res?.success) {
        const pgs = ((res.data as any)?.data ?? []) as { id: string; name: string }[];
        setPages(pgs);
        if (pgs.length > 0) setSelectedPageAds(pgs[0]);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ads_read: carrega campanhas ──────────────────────────────────────────
  const handleFetchCampaigns = async () => {
    if (!selectedAccount) { toast.error("Selecione uma conta de anúncio."); return; }
    const res = await call({
      permission: "ads_read",
      group_name: "GRUPO 8 — ANALYTICS / ADS",
      endpoint:   `/${selectedAccount.id}/campaigns`,
      params:     { fields: "id,name,status,objective,created_time,daily_budget,lifetime_budget", limit: 10 },
    });
    if (res?.success) {
      setCampaigns(((res.data as any)?.data ?? []) as Campaign[]);
      setAdsReadCalled(true);
      setAdsReadMode("LIVE_META_TEST");
    } else {
      toast.error(res?.error ?? "Erro ao buscar campanhas.");
    }
  };

  // ── read_insights: busca métricas ────────────────────────────────────────
  const handleFetchInsights = async () => {
    if (!selectedAccount) { toast.error("Selecione uma conta de anúncio."); return; }
    const res = await call({
      permission: "read_insights",
      group_name: "GRUPO 8 — ANALYTICS / ADS",
      endpoint:   `/${selectedAccount.id}/insights`,
      params:     {
        fields: "impressions,clicks,spend,reach,cpc,ctr,cpp",
        date_preset: "last_30d",
        level: "account",
      },
    });
    if (res?.success) {
      const data = ((res.data as any)?.data ?? []) as InsightMetric[];
      setInsights(data[0] ?? null);
      setInsightsCalled(true);
      setInsightsMode("LIVE_META_TEST");
      if (!data[0]) toast.info("Sem dados de insights nos últimos 30 dias.");
    } else {
      toast.error(res?.error ?? "Erro ao buscar insights.");
    }
  };

  // ── pages_manage_ads: busca anúncios da página ───────────────────────────
  const handleFetchPageAds = async () => {
    if (!selectedPageAds) { toast.error("Selecione uma Página."); return; }
    const res = await call({
      permission: "pages_manage_ads",
      group_name: "GRUPO 8 — ANALYTICS / ADS",
      endpoint:   `/${selectedPageAds.id}/ads`,
      params:     { fields: "id,name,status", limit: 10 },
      use_page_token: true,
      page_id: selectedPageAds.id,
    });
    if (res?.success) {
      setPageAds(((res.data as any)?.data ?? []) as { id: string; name: string; status: string }[]);
      setPageAdsCalled(true);
      setPageAdsMode("LIVE_META_TEST");
    } else {
      toast.error(res?.error ?? "Erro ao buscar anúncios da Página.");
    }
  };

  // ── Seção activa ─────────────────────────────────────────────────────────

  const SECTIONS = [
    { key: "ads_read"         as const, label: "ads_read",         status: "KEEP"          as const },
    { key: "read_insights"    as const, label: "read_insights",    status: "KEEP"          as const },
    { key: "pages_manage_ads" as const, label: "pages_manage_ads", status: "KEEP"          as const },
    { key: "ads_management"   as const, label: "ads_management",   status: "IMPLEMENT_LATER" as const },
  ];

  return (
    <MetaReviewLayout
      permission="ads_read + read_insights + pages_manage_ads"
      useCase="Read ad account campaigns, retrieve insights metrics, manage Page ads"
      group="GRUPO 8 — ANALYTICS / ADS"
      groupNumber={8}
      testMode={
        activeSection === "ads_read"         ? adsReadMode :
        activeSection === "read_insights"    ? insightsMode :
        activeSection === "pages_manage_ads" ? pageAdsMode :
        "DEVELOPMENT_MOCK"
      }
      docsUrl="https://developers.facebook.com/docs/marketing-api/get-started"
      permissionGranted={adsReadCalled || insightsCalled || pageAdsCalled}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
          onClick={() => navigate(`/${slug}/meta-review`)}>
          ← Meta Review
        </Button>
        <span className="text-muted-foreground/30">/</span>
        <span className="text-xs text-muted-foreground">GRUPO 8 — ANALYTICS / ADS</span>
      </div>

      {/* Tabs de permissão */}
      <div className="flex gap-1 border-b border-border/50 overflow-x-auto pb-px">
        {SECTIONS.map(({ key, label, status }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              activeSection === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <code className="font-mono">{label}</code>
            <PermissionBadge status={status} size="sm" />
          </button>
        ))}
      </div>

      {/* ── ads_read ─────────────────────────────────────────────────────── */}
      {activeSection === "ads_read" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card className="card-surface">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Ad Account — Campaigns
                </CardTitle>
                <CardDescription className="text-xs">
                  GET /act_{"{ad-account-id}"}/campaigns — ads_read
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {adAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Conecte uma conta Meta com permissão <code className="font-mono">ads_read</code> primeiro.
                  </p>
                ) : (
                  <>
                    <select
                      value={selectedAccount?.id ?? ""}
                      onChange={(e) => setSelectedAccount(adAccounts.find((a) => a.id === e.target.value) ?? null)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    >
                      {adAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </select>
                    <Button onClick={handleFetchCampaigns} disabled={loading} className="w-full gap-2" size="sm">
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                      GET /{selectedAccount?.id}/campaigns
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {campaigns.length > 0 && (
              <Card className="card-surface border-blue-500/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Campaigns — {campaigns.length} found
                    </CardTitle>
                    <LiveMetaIndicator mode={adsReadMode} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                  {campaigns.map((c) => (
                    <div key={c.id}
                      className="rounded-lg border border-border bg-secondary/10 p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground/90 line-clamp-1">{c.name}</p>
                        <Badge className={cn("text-[10px] shrink-0",
                          c.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                            : "bg-secondary text-muted-foreground"
                        )}>
                          {c.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{c.objective}</span>
                        {c.daily_budget && (
                          <span>Budget: {fmtCurrency(c.daily_budget, selectedAccount?.currency)}/day</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 font-mono">
                        ID: {c.id} · Source: Meta Marketing API
                      </p>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm"
                    className="w-full gap-1.5 text-xs text-muted-foreground"
                    onClick={handleFetchCampaigns} disabled={loading}>
                    <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />Refresh
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <ApiRequestLog permission="ads_read" limit={8} />
            <ScreencastChecklist permission="ads_read"
              autoChecked={[
                ...(adAccounts.length > 0 ? ["test_account", "permission"] : []),
                ...(adsReadCalled ? ["asset_selected", "api_called", "result_displayed", "no_secrets"] : []),
              ]} />
          </div>
        </div>
      )}

      {/* ── read_insights ──────────────────────────────────────────────────── */}
      {activeSection === "read_insights" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card className="card-surface">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-violet-400" />
                  Account Insights
                </CardTitle>
                <CardDescription className="text-xs">
                  GET /{"{ad-account-id}"}/insights — read_insights (last 30 days)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {adAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Conecte uma conta de anúncio primeiro.</p>
                ) : (
                  <>
                    <select
                      value={selectedAccount?.id ?? ""}
                      onChange={(e) => setSelectedAccount(adAccounts.find((a) => a.id === e.target.value) ?? null)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    >
                      {adAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <Button onClick={handleFetchInsights} disabled={loading} className="w-full gap-2" size="sm">
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                      GET /{selectedAccount?.id}/insights?date_preset=last_30d
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {insights && (
              <Card className="card-surface border-violet-500/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Insights — Last 30 Days</CardTitle>
                    <LiveMetaIndicator mode={insightsMode} />
                  </div>
                  <CardDescription className="text-xs">
                    {insights.date_start} → {insights.date_stop}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard icon={Eye}              label="Impressions" value={fmtNum(insights.impressions)}    color="text-blue-400" />
                    <MetricCard icon={MousePointerClick} label="Clicks"      value={fmtNum(insights.clicks)}        color="text-violet-400" />
                    <MetricCard icon={DollarSign}        label="Spend"       value={fmtCurrency(insights.spend, selectedAccount?.currency)} color="text-amber-400" />
                    <MetricCard icon={TrendingUp}        label="Reach"       value={fmtNum(insights.reach)}         color="text-emerald-400" />
                  </div>
                  {(insights.ctr || insights.cpc) && (
                    <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground">Ratios</p>
                      {[
                        { label: "CTR",  value: insights.ctr  ? `${parseFloat(insights.ctr).toFixed(2)}%`  : "—" },
                        { label: "CPC",  value: insights.cpc  ? fmtCurrency(insights.cpc, selectedAccount?.currency) : "—" },
                        { label: "CPP",  value: insights.cpp  ? fmtCurrency(insights.cpp, selectedAccount?.currency) : "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}:</span>
                          <span className="font-mono font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/50">
                    Source: Meta Marketing API — read_insights
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <ApiRequestLog permission="read_insights" limit={8} />
            <ScreencastChecklist permission="read_insights"
              autoChecked={[
                ...(adAccounts.length > 0 ? ["test_account", "permission"] : []),
                ...(insightsCalled ? ["asset_selected", "api_called", "result_displayed", "no_secrets"] : []),
              ]} />
          </div>
        </div>
      )}

      {/* ── pages_manage_ads ─────────────────────────────────────────────── */}
      {activeSection === "pages_manage_ads" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card className="card-surface">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-orange-400" />
                  Page Ads
                </CardTitle>
                <CardDescription className="text-xs">
                  GET /{"{page-id}"}/ads — pages_manage_ads
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
                    <select
                      value={selectedPageAds?.id ?? ""}
                      onChange={(e) => setSelectedPageAds(pages.find((p) => p.id === e.target.value) ?? null)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    >
                      {pages.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <Button onClick={handleFetchPageAds} disabled={loading} className="w-full gap-2" size="sm">
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                      GET /{selectedPageAds?.id}/ads
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {pageAdsCalled && (
              <Card className="card-surface border-orange-500/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Page Ads — {pageAds.length} found</CardTitle>
                    <LiveMetaIndicator mode={pageAdsMode} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pageAds.length === 0 ? (
                    <p className="text-sm text-muted-foreground/60">Nenhum anúncio encontrado para esta Página.</p>
                  ) : (
                    pageAds.map((ad) => (
                      <div key={ad.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-secondary/10 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{ad.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground/50">ID: {ad.id}</p>
                        </div>
                        <Badge className={cn("shrink-0 text-[10px]",
                          ad.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                            : "bg-secondary text-muted-foreground"
                        )}>
                          {ad.status}
                        </Badge>
                      </div>
                    ))
                  )}
                  <p className="text-[10px] text-muted-foreground/50">
                    Source: Meta Graph API — pages_manage_ads
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <ApiRequestLog permission="pages_manage_ads" limit={8} />
            <ScreencastChecklist permission="pages_manage_ads"
              autoChecked={[
                ...(pages.length > 0 ? ["test_account", "permission"] : []),
                ...(pageAdsCalled ? ["asset_selected", "api_called", "result_displayed", "no_secrets"] : []),
              ]} />
          </div>
        </div>
      )}

      {/* ── ads_management — NOT READY ──────────────────────────────────── */}
      {activeSection === "ads_management" && (
        <NotReadyBanner
          permission="ads_management"
          reason="planned"
          plannedFor="Módulo avançado de Gestão de Anúncios (roadmap futuro)"
          notes="A criação e edição programática de campanhas (POST /act_{ad-account-id}/campaigns) requer uma UI dedicada com confirmação explícita antes de qualquer operação real. Não criar campanha real sem confirmação explícita do usuário."
        />
      )}
    </MetaReviewLayout>
  );
}
