/**
 * InstagramManageCommentsPage — /meta-review/instagram-facebook-login/comments
 *
 * GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN
 * Permissão: instagram_manage_comments
 *
 * Demonstração real:
 *   1. Instagram test post com comentário real
 *   2. C8 recebe/lista o comentário via GET /{media-id}/comments
 *   3. Exibe comentário na interface
 *   4. Agente responde → POST /{comment-id}/replies
 *   5. Resposta visível no Instagram
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  MessageCircle, Loader2, Send, CheckCircle2,
  Instagram, ArrowRight, Heart, RefreshCw,
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
import { cn } from "@/lib/utils";

interface IgMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface IgComment {
  id: string;
  text: string;
  username?: string;
  timestamp: string;
  like_count?: number;
  replies?: { data: { id: string; text: string; username?: string }[] };
}

export function InstagramManageCommentsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();

  const [igUserId, setIgUserId] = useState<string | null>(null);
  const [media, setMedia] = useState<IgMedia[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<IgMedia | null>(null);
  const [comments, setComments] = useState<IgComment[]>([]);
  const [selectedComment, setSelectedComment] = useState<IgComment | null>(null);
  const [replyText, setReplyText] = useState("Obrigado pelo seu comentário! Ficamos felizes em ajudar.");
  const [replySent, setReplySent] = useState(false);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  // Resolve IG user ID via Página Facebook
  useEffect(() => {
    call({
      permission: "pages_show_list",
      group_name: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
      endpoint: "/me/accounts",
      params: { fields: "id,instagram_business_account" },
    }).then(async (res) => {
      if (!res?.success) return;
      const pages = ((res.data as any)?.data ?? []) as { id: string; instagram_business_account?: { id: string } }[];
      const firstWithIg = pages.find((p) => p.instagram_business_account?.id);
      if (firstWithIg?.instagram_business_account?.id) {
        const igId = firstWithIg.instagram_business_account.id;
        setIgUserId(igId);
        // Carrega mídia automaticamente
        await loadMedia(igId);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMedia = async (igId: string) => {
    const res = await call({
      permission: "instagram_manage_comments",
      group_name: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
      endpoint: `/${igId}/media`,
      params: { fields: "id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count", limit: 6 },
    });
    if (res?.success) {
      const items = ((res.data as any)?.data ?? []) as IgMedia[];
      setMedia(items);
      setTestMode("LIVE_META_TEST");
    }
  };

  const loadComments = async (mediaId: string) => {
    const res = await call({
      permission: "instagram_manage_comments",
      group_name: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
      endpoint: `/${mediaId}/comments`,
      params: { fields: "id,text,username,timestamp,like_count,replies{id,text,username}", limit: 10 },
    });
    if (res?.success) {
      setComments(((res.data as any)?.data ?? []) as IgComment[]);
    }
  };

  const handleSelectMedia = async (m: IgMedia) => {
    setSelectedMedia(m);
    setSelectedComment(null);
    setReplySent(false);
    await loadComments(m.id);
  };

  const handleReply = async () => {
    if (!selectedComment || !replyText.trim()) { toast.error("Selecione um comentário e escreva a resposta."); return; }
    const res = await call({
      permission: "instagram_manage_comments",
      group_name: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
      endpoint: `/${selectedComment.id}/replies`,
      method: "POST",
      params: { message: replyText.trim() },
    });
    if (res?.success) {
      setReplySent(true);
      toast.success("Resposta publicada no Instagram!");
    } else {
      toast.error(res?.error ?? "Erro ao publicar resposta.");
    }
  };

  const currentStep = replySent ? 5 : selectedComment ? 4 : comments.length > 0 ? 3 : selectedMedia ? 2 : 1;

  return (
    <MetaReviewLayout
      permission="instagram_manage_comments"
      useCase="Read Instagram comments and reply via Meta API"
      group="GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN"
      groupNumber={3}
      steps={5}
      currentStep={currentStep}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/instagram-api/guides/comment-moderation"
      currentAction={["", "Select post", "Load comments", "View comments", "Reply in C8", "Reply visible on Instagram"][currentStep]}
      permissionGranted={replySent}
    >
      {/* Fluxo visual */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto flex-wrap">
        {["Instagram test post", "Real comment", "C8 receives comment", "Reply inside C8", "Meta API", "Reply visible on Instagram"]
          .map((s, i, arr) => (
            <div key={s} className="flex items-center gap-2 shrink-0">
              <span className={cn(replySent && "text-emerald-400 font-medium")}>{s}</span>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
            </div>
          ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">

          {/* Media grid */}
          {!igUserId ? (
            <Card className="card-surface">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Conecte o Instagram primeiro em{" "}
                <a href={`/${slug}/meta-review/instagram-facebook-login/basic`}
                  className="text-pink-400 hover:underline">instagram_basic</a>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-surface">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Instagram Posts — Select to view comments</CardTitle>
              </CardHeader>
              <CardContent>
                {media.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />Loading media…
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {media.map((m) => (
                      <button key={m.id}
                        onClick={() => handleSelectMedia(m)}
                        className={cn(
                          "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                          selectedMedia?.id === m.id
                            ? "border-pink-500" : "border-border hover:border-pink-500/50"
                        )}>
                        {m.media_url ? (
                          <img src={m.media_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-secondary/40">
                            <Instagram className="h-6 w-6 text-muted-foreground/40" />
                          </div>
                        )}
                        {m.comments_count !== undefined && (
                          <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
                            <MessageCircle className="h-2.5 w-2.5" />{m.comments_count}
                          </div>
                        )}
                        {selectedMedia?.id === m.id && (
                          <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                            <CheckCircle2 className="h-6 w-6 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Comentários */}
          {comments.length > 0 && (
            <Card className="card-surface">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Comments — instagram_manage_comments</CardTitle>
                  <LiveMetaIndicator mode="LIVE_META_TEST" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-52 overflow-y-auto">
                {comments.map((c) => (
                  <button key={c.id}
                    onClick={() => { setSelectedComment(c); setReplySent(false); }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                      selectedComment?.id === c.id
                        ? "border-pink-500/40 bg-pink-500/10"
                        : "border-border bg-secondary/10 hover:bg-secondary/30"
                    )}>
                    <MessageCircle className="h-3.5 w-3.5 text-pink-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      {c.username && <span className="font-semibold text-foreground/80">@{c.username}: </span>}
                      <span className="text-foreground/70">{c.text}</span>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/50">
                        <Heart className="h-2.5 w-2.5" />{c.like_count ?? 0}
                        <span>· {new Date(c.timestamp).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    {selectedComment?.id === c.id && <CheckCircle2 className="h-3.5 w-3.5 text-pink-400 shrink-0" />}
                  </button>
                ))}
                <Button variant="ghost" size="sm" className="w-full gap-1.5 text-xs text-muted-foreground"
                  onClick={() => selectedMedia && loadComments(selectedMedia.id)} disabled={loading}>
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />Refresh
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Reply */}
          {selectedComment && (
            <Card className={cn("card-surface", replySent ? "border-emerald-500/20" : "border-pink-500/20")}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {replySent ? "Reply sent to Instagram" : "Reply inside C8 → Meta API"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border bg-secondary/10 p-2.5">
                  <p className="text-xs text-muted-foreground/60 mb-1">Replying to:</p>
                  <p className="text-sm">{selectedComment.text}</p>
                </div>
                {!replySent ? (
                  <>
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                    <Button onClick={handleReply} disabled={loading} className="w-full gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white" size="sm">
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      POST /{selectedComment.id}/replies
                    </Button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-400">Reply visible on Instagram</span>
                      <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
                    </div>
                    <p className="text-xs text-muted-foreground/60 font-mono">
                      POST /{selectedComment.id}/replies executado via Meta API real
                    </p>
                    <Badge className="bg-pink-500/15 text-pink-400 border-pink-500/20 text-[10px]">
                      instagram_manage_comments
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <ApiRequestLog permission="instagram_manage_comments" limit={10} />
          <ScreencastChecklist permission="instagram_manage_comments"
            autoChecked={[
              ...(igUserId ? ["test_account", "permission"] : []),
              ...(selectedMedia ? ["asset_selected"] : []),
              ...(comments.length > 0 ? ["api_called", "result_displayed"] : []),
              ...(replySent ? ["no_secrets", "flow_recorded", "meta_result"] : []),
            ]} />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
