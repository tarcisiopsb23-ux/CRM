/**
 * PagesManageEngagementPage — /meta-review/pages-manage-engagement
 * Permissão: pages_manage_engagement
 * Demonstra: POST /{comment-id}/comments para responder comentário real
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { MessageCircle, Loader2, Send, CheckCircle2, Hash, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";
import { LiveMetaIndicator } from "../shared/LiveMetaIndicator";
import { ApiRequestLog } from "../shared/ApiRequestLog";
import { ScreencastChecklist } from "../shared/ScreencastChecklist";
import { useMetaReviewProxy } from "@/hooks/useMetaReviewProxy";
import { toast } from "sonner";

interface Post { id: string; message?: string; story?: string; comments?: { data: { id: string; message: string; from?: { name: string } }[] }; }

export function PagesManageEngagementPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedComment, setSelectedComment] = useState<{ postId: string; commentId: string; commentText: string } | null>(null);
  const [replyText, setReplyText] = useState("Olá! Obrigado pelo comentário. Em que posso ajudar?");
  const [replySent, setReplySent] = useState(false);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

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

  const handleFetchPosts = async () => {
    if (!selectedPageId) return;
    const res = await call({
      permission: "pages_read_engagement",
      group_name: "GRUPO 2 — FACEBOOK PAGES",
      endpoint: `/${selectedPageId}/posts`,
      params: { fields: "id,message,story,comments{id,message,from}", limit: 5 },
      use_page_token: true, page_id: selectedPageId,
    });
    if (res?.success) {
      setPosts(((res.data as any)?.data ?? []) as Post[]);
      setTestMode("LIVE_META_TEST");
    }
  };

  const handleReply = async () => {
    if (!selectedComment || !replyText.trim()) { toast.error("Selecione um comentário e escreva a resposta."); return; }
    const res = await call({
      permission: "pages_manage_engagement",
      group_name: "GRUPO 2 — FACEBOOK PAGES",
      endpoint: `/${selectedComment.commentId}/comments`,
      method: "POST",
      params: { message: replyText.trim() },
      use_page_token: true, page_id: selectedPageId,
    });
    if (res?.success) {
      setReplySent(true);
      setTestMode("LIVE_META_TEST");
      toast.success("Resposta publicada com sucesso no Facebook!");
    } else {
      toast.error(res?.error ?? "Erro ao publicar resposta.");
    }
  };

  return (
    <MetaReviewLayout
      permission="pages_manage_engagement"
      useCase="Reply to Facebook Page comments via Meta API"
      group="GRUPO 2 — FACEBOOK PAGES" groupNumber={2}
      steps={4} currentStep={replySent ? 4 : selectedComment ? 3 : posts.length > 0 ? 2 : 1}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/graph-api/reference/comment/"
      currentAction={replySent ? "Reply visible on Facebook" : "Select comment and reply"}
      permissionGranted={replySent}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {/* Fluxo visual */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto">
            {["Facebook Post", "Comment", "Reply inside C8", "Meta API", "Reply visible on Facebook"].map((s, i, arr) => (
              <div key={s} className="flex items-center gap-2 shrink-0">
                <span className={replySent ? "text-emerald-400 font-medium" : ""}>{s}</span>
                {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
              </div>
            ))}
          </div>

          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">1. Select Page & Load Posts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Conecte uma Página em pages_show_list primeiro.</p>
              ) : (
                <>
                  <select value={selectedPageId} onChange={(e) => { setSelectedPageId(e.target.value); setPosts([]); }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none">
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Button onClick={handleFetchPosts} disabled={loading} className="w-full gap-2" size="sm">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                    Load Posts with Comments
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Posts e comentários */}
          {posts.length > 0 && (
            <Card className="card-surface">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">2. Select Comment to Reply</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-64 overflow-y-auto">
                {posts.map((post) => (
                  <div key={post.id}>
                    <div className="rounded-lg border border-border bg-secondary/10 p-2.5 mb-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Hash className="h-3 w-3 text-[#1877F2]" />
                        <span className="text-[10px] font-mono text-muted-foreground/60">Post</span>
                      </div>
                      <p className="text-xs text-foreground/80 line-clamp-1">
                        {post.message ?? post.story ?? "(sem texto)"}
                      </p>
                    </div>
                    {post.comments?.data.map((comment) => (
                      <button key={comment.id}
                        onClick={() => { setSelectedComment({ postId: post.id, commentId: comment.id, commentText: comment.message }); setReplySent(false); }}
                        className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs ml-4 mb-1 transition-colors ${selectedComment?.commentId === comment.id ? "border-violet-500/40 bg-violet-500/10" : "border-border bg-secondary/5 hover:bg-secondary/20"}`}>
                        <MessageCircle className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          {comment.from?.name && <span className="font-semibold text-muted-foreground">{comment.from.name}: </span>}
                          <span className="text-foreground/80">{comment.message}</span>
                        </div>
                        {selectedComment?.commentId === comment.id && <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />}
                      </button>
                    ))}
                    {(!post.comments?.data || post.comments.data.length === 0) && (
                      <p className="text-[11px] text-muted-foreground/40 ml-4">Sem comentários neste post</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Reply */}
          {selectedComment && (
            <Card className="card-surface border-violet-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">3. Reply inside C8</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border bg-secondary/10 p-2.5">
                  <p className="text-xs text-muted-foreground/60 mb-1">Responding to:</p>
                  <p className="text-sm text-foreground/80">"{selectedComment.commentText}"</p>
                </div>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                <Button onClick={handleReply} disabled={loading || replySent} className="w-full gap-2" size="sm">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send via Meta API
                </Button>
              </CardContent>
            </Card>
          )}

          {replySent && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-emerald-400">Reply visible on Facebook</span>
                <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
              </div>
              <p className="text-xs text-muted-foreground">
                Resposta publicada via <code className="font-mono">POST /{selectedComment?.commentId}/comments</code>
              </p>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">
                pages_manage_engagement
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ApiRequestLog permission="pages_manage_engagement" limit={8} />
          <ScreencastChecklist permission="pages_manage_engagement"
            autoChecked={[
              ...(pages.length > 0 ? ["test_account", "permission"] : []),
              ...(posts.length > 0 ? ["asset_selected"] : []),
              ...(replySent ? ["api_called", "result_displayed", "no_secrets", "meta_result"] : []),
            ]} />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
