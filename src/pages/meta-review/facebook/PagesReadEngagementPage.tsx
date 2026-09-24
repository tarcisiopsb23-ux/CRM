/**
 * PagesReadEngagementPage — /meta-review/pages-read-engagement
 *
 * GRUPO 2 — FACEBOOK PAGES
 * Permissão: pages_read_engagement
 *
 * Demonstração real:
 *   1. Selecionar Página conectada
 *   2. Recuperar dados reais: GET /{page-id}?fields=name,fan_count,followers_count,...
 *   3. Mostrar informações e engagement da Página
 *   4. Identificar Meta como origem do dado
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Users, Heart, MessageCircle, Share2, TrendingUp,
  Loader2, RefreshCw, Facebook, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";
import { LiveMetaIndicator } from "../shared/LiveMetaIndicator";
import { ApiRequestLog } from "../shared/ApiRequestLog";
import { ScreencastChecklist } from "../shared/ScreencastChecklist";
import { useMetaReviewProxy } from "@/hooks/useMetaReviewProxy";
import { toast } from "sonner";

interface PageData {
  id: string;
  name: string;
  category?: string;
  fan_count?: number;
  followers_count?: number;
  talking_about_count?: number;
  website?: string;
  about?: string;
  posts?: { data: { id: string; message?: string; created_time: string; likes?: { summary: { total_count: number } }; comments?: { summary: { total_count: number } } }[] };
  picture?: { data: { url: string } };
}

const FIELDS = [
  "id", "name", "category", "fan_count", "followers_count",
  "talking_about_count", "website", "about",
  "picture.type(normal)",
  "posts.limit(3){id,message,created_time,likes.summary(true),comments.summary(true)}",
].join(",");

export function PagesReadEngagementPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();

  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");
  const [apiCalled, setApiCalled] = useState(false);

  // Carrega lista de páginas disponíveis
  useEffect(() => {
    call({
      permission: "pages_show_list",
      group_name: "GRUPO 2 — FACEBOOK PAGES",
      endpoint: "/me/accounts",
      params: { fields: "id,name" },
    }).then((res) => {
      if (res?.success && Array.isArray((res.data as any)?.data)) {
        const pgs = (res.data as any).data as { id: string; name: string }[];
        setPages(pgs);
        if (pgs.length > 0) setSelectedPageId(pgs[0].id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFetchEngagement = async () => {
    if (!selectedPageId) { toast.error("Selecione uma Página."); return; }
    const res = await call({
      permission: "pages_read_engagement",
      group_name: "GRUPO 2 — FACEBOOK PAGES",
      endpoint: `/${selectedPageId}`,
      params: { fields: FIELDS },
      use_page_token: true,
      page_id: selectedPageId,
    });
    if (res?.success) {
      setPageData(res.data as PageData);
      setTestMode("LIVE_META_TEST");
      setApiCalled(true);
    } else {
      toast.error(res?.error ?? "Não foi possível recuperar os dados da Página.");
    }
  };

  return (
    <MetaReviewLayout
      permission="pages_read_engagement"
      useCase="Read Page content, engagement data, and follower information"
      group="GRUPO 2 — FACEBOOK PAGES"
      groupNumber={2}
      steps={4}
      currentStep={pageData ? 4 : selectedPageId ? 2 : 1}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/graph-api/reference/page/"
      currentAction={pageData ? "Display engagement data" : "Select Page and retrieve data"}
      permissionGranted={apiCalled}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">

          {/* Seletor de Página */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">1. Select Page</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Conecte o Facebook primeiro em{" "}
                  <a href={`/${slug}/meta-review/pages-show-list`}
                    className="text-violet-400 hover:underline">
                    pages_show_list
                  </a>
                </p>
              ) : (
                <div className="space-y-2">
                  <select
                    value={selectedPageId}
                    onChange={(e) => setSelectedPageId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {pages.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <Button
                    onClick={handleFetchEngagement}
                    disabled={loading || !selectedPageId}
                    className="w-full gap-2"
                    size="sm"
                  >
                    {loading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <TrendingUp className="h-3.5 w-3.5" />
                    }
                    GET /{selectedPageId?.slice(0, 6)}…?fields=fan_count,followers_count,posts,…
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dados da Página */}
          {pageData && (
            <Card className="card-surface border-emerald-500/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {pageData.picture?.data.url ? (
                      <img src={pageData.picture.data.url} alt={pageData.name}
                        className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1877F2]/20">
                        <Facebook className="h-4 w-4 text-[#1877F2]" />
                      </div>
                    )}
                    {pageData.name}
                  </CardTitle>
                  <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
                </div>
                {pageData.category && (
                  <Badge variant="outline" className="w-fit text-[10px]">{pageData.category}</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Métricas */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Users, label: "Fans", value: pageData.fan_count?.toLocaleString("pt-BR") ?? "—" },
                    { icon: Heart, label: "Followers", value: pageData.followers_count?.toLocaleString("pt-BR") ?? "—" },
                    { icon: MessageCircle, label: "Talking about", value: pageData.talking_about_count?.toLocaleString("pt-BR") ?? "—" },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
                      <Icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                      <p className="text-lg font-bold tabular-nums">{value}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Posts recentes */}
                {pageData.posts?.data && pageData.posts.data.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Recent Posts — pages_read_engagement
                    </p>
                    {pageData.posts.data.map((post) => (
                      <div key={post.id}
                        className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
                        <p className="text-xs text-foreground/80 line-clamp-2">
                          {post.message ?? "(Sem texto — publicação de mídia)"}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {post.likes?.summary.total_count ?? 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {post.comments?.summary.total_count ?? 0}
                          </span>
                          <span className="ml-auto opacity-60">
                            {new Date(post.created_time).toLocaleDateString("pt-BR")}
                          </span>
                          <Badge variant="outline" className="text-[9px] py-0 px-1">Meta API</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 pt-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400/60" />
                  Source: Meta Graph API v21.0 — pages_read_engagement
                </div>

                <Button
                  variant="ghost" size="sm"
                  className="w-full gap-1.5 text-xs text-muted-foreground"
                  onClick={handleFetchEngagement}
                  disabled={loading}
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Refresh data
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <ApiRequestLog permission="pages_read_engagement" limit={8} />
          <ScreencastChecklist
            permission="pages_read_engagement"
            autoChecked={[
              ...(pages.length > 0 ? ["test_account", "permission"] : []),
              ...(apiCalled ? ["asset_selected", "api_called"] : []),
              ...(pageData ? ["result_displayed", "no_secrets"] : []),
            ]}
          />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
