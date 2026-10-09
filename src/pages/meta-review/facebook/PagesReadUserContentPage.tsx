/**
 * PagesReadUserContentPage — /meta-review/pages-read-user-content
 * Permissão: pages_read_user_content
 * Demonstra GET /{page-id}/feed para ler conteúdo publicado por usuários na Página.
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { MessageSquare, Loader2, RefreshCw, User, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";
import { LiveMetaIndicator } from "../shared/LiveMetaIndicator";
import { ApiRequestLog } from "../shared/ApiRequestLog";
import { ScreencastChecklist } from "../shared/ScreencastChecklist";
import { useMetaReviewProxy } from "@/hooks/useMetaReviewProxy";
import { toast } from "sonner";

interface FeedPost { id: string; message?: string; story?: string; from?: { name: string }; created_time: string; likes?: { summary: { total_count: number } }; }

export function PagesReadUserContentPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");
  const [apiCalled, setApiCalled] = useState(false);

  useEffect(() => {
    call({ permission: "pages_show_list", group_name: "GRUPO 2 — FACEBOOK PAGES", endpoint: "/me/accounts", params: { fields: "id,name" } })
      .then((res) => {
        if (res?.success) {
          const pgs = ((res.data as any)?.data ?? []) as { id: string; name: string }[];
          setPages(pgs);
          if (pgs.length > 0) setSelectedPageId(pgs[0].id);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFetch = async () => {
    if (!selectedPageId) { toast.error("Selecione uma Página."); return; }
    const res = await call({
      permission: "pages_read_user_content",
      group_name: "GRUPO 2 — FACEBOOK PAGES",
      endpoint: `/${selectedPageId}/feed`,
      params: { fields: "id,message,story,from,created_time,likes.summary(true)", limit: 5 },
      use_page_token: true, page_id: selectedPageId,
    });
    if (res?.success) {
      setFeed(((res.data as any)?.data ?? []) as FeedPost[]);
      setTestMode("LIVE_META_TEST");
      setApiCalled(true);
    } else {
      toast.error(res?.error ?? "Erro ao recuperar feed da Página.");
    }
  };

  return (
    <MetaReviewLayout
      permission="pages_read_user_content"
      useCase="Read content published by users on the connected Facebook Page"
      group="GRUPO 2 — FACEBOOK PAGES" groupNumber={2}
      steps={3} currentStep={feed.length > 0 ? 3 : selectedPageId ? 2 : 1}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/graph-api/reference/page/feed/"
      currentAction={feed.length > 0 ? "Display user content" : "Retrieve Page feed"}
      permissionGranted={apiCalled}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Retrieve Page Feed — <code className="text-xs font-mono bg-secondary/40 px-1 rounded">GET /{"{page-id}"}/feed</code>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Conecte uma Página em pages_show_list primeiro.</p>
              ) : (
                <>
                  <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none">
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Button onClick={handleFetch} disabled={loading} className="w-full gap-2" size="sm">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    Fetch Page Feed
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {feed.length > 0 && (
            <Card className="card-surface border-emerald-500/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">User Content — {feed.length} posts</CardTitle>
                  <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {feed.map((post) => (
                  <div key={post.id} className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
                    {post.from && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="h-3 w-3" /><span>{post.from.name}</span>
                      </div>
                    )}
                    <p className="text-sm text-foreground/80 line-clamp-3">
                      {post.message ?? post.story ?? "(Publicação sem texto)"}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />{post.likes?.summary.total_count ?? 0}
                      </span>
                      <span className="ml-auto opacity-60">{new Date(post.created_time).toLocaleDateString("pt-BR")}</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1">pages_read_user_content</Badge>
                    </div>
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="w-full gap-1.5 text-xs text-muted-foreground" onClick={handleFetch} disabled={loading}>
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <ApiRequestLog permission="pages_read_user_content" limit={8} />
          <ScreencastChecklist permission="pages_read_user_content"
            autoChecked={[
              ...(pages.length > 0 ? ["test_account", "permission"] : []),
              ...(apiCalled ? ["asset_selected", "api_called"] : []),
              ...(feed.length > 0 ? ["result_displayed", "no_secrets"] : []),
            ]} />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
