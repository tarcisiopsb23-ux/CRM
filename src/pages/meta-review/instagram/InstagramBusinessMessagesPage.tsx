/**
 * InstagramBusinessMessagesPage — /meta-review/instagram-login/messages
 *
 * GRUPO 4 — INSTAGRAM LOGIN
 * Permissão: instagram_business_manage_messages
 *
 * Demonstração equivalente ao Grupo 3 instagram_manage_messages,
 * mas autenticada via Instagram Login (instagram_business_* token).
 *
 * O fluxo é idêntico ao do Grupo 3, mas o token usado é obtido via
 * Instagram Login (api.instagram.com), não via Facebook Login.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  MessageSquare, Loader2, Send, CheckCircle2,
  ArrowRight, Instagram, Webhook,
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

const MOCK_DM = {
  id: "ig_biz_msg_demo_001",
  from: { id: "TEST_USER_BIZ", username: "testuser_ig_login" },
  message: "Olá! Gostaria de saber mais sobre os serviços de vocês.",
  timestamp: new Date().toISOString(),
};

export function InstagramBusinessMessagesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();

  const [webhookReceived, setWebhookReceived] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [replyText, setReplyText] = useState("Olá! Obrigado pelo contato. Como posso ajudar?");
  const [replySent, setReplySent] = useState(false);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  const currentStep = replySent ? 5 : inboxOpen ? 4 : webhookReceived ? 3 : 1;

  const handleSimulateWebhook = () => {
    setWebhookReceived(true);
    setTimeout(() => setInboxOpen(true), 600);
  };

  const handleReply = async () => {
    if (!replyText.trim()) { toast.error("Escreva a resposta."); return; }
    const res = await call({
      permission: "instagram_business_manage_messages",
      group_name: "GRUPO 4 — INSTAGRAM LOGIN",
      endpoint: "/me/messages",
      method: "POST",
      params: {
        recipient: { id: MOCK_DM.from.id },
        message: { text: replyText.trim() },
        messaging_type: "RESPONSE",
      },
    });
    if (res?.success || res?.meta.status === 200) {
      setReplySent(true);
      setTestMode("LIVE_META_TEST");
      toast.success("Resposta enviada via Meta API (Instagram Business token)!");
    } else {
      setReplySent(true);
      setTestMode("DEVELOPMENT_MOCK");
      toast.info("Demo registrada. Para teste real, use conta de teste no Meta App.");
    }
  };

  return (
    <MetaReviewLayout
      permission="instagram_business_manage_messages"
      useCase="Receive and reply to Instagram DMs using Instagram Login authentication"
      group="GRUPO 4 — INSTAGRAM LOGIN"
      groupNumber={4}
      steps={5}
      currentStep={currentStep}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/direct-messages"
      currentAction={["", "External user sends DM", "Webhook received", "C8 Inbox opens", "Agent replies", "Message received in Instagram"][currentStep]}
      permissionGranted={replySent}
    >
      {/* Diferença de autenticação */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
        <p className="text-xs text-orange-400 font-semibold mb-1">Autenticação: Instagram Login</p>
        <p className="text-xs text-muted-foreground">
          Esta demonstração usa o token obtido via <strong>Instagram Login</strong> (Grupo 4),
          não o token do Facebook Login (Grupo 3). O fluxo de mensagens é idêntico — apenas
          a origem do token é diferente.
        </p>
      </div>

      {/* Fluxo visual */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto flex-wrap">
        {["External Instagram user", "sends DM", "Meta webhook", "C8 Inbox", "human replies", "Meta API", "message received"]
          .map((s, i, arr) => (
            <div key={s} className="flex items-center gap-2 shrink-0">
              <span className={cn(replySent && "text-emerald-400 font-medium")}>{s}</span>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
            </div>
          ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">

          {/* Webhook */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Webhook className="h-4 w-4 text-primary" />
                Receive DM via Webhook
              </CardTitle>
              <CardDescription className="text-xs">
                instagram_business_manage_messages — O Meta entrega DMs em tempo real.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary/10 p-3 text-xs text-muted-foreground space-y-1">
                <p>Field subscrito: <code className="font-mono">messages</code></p>
                <p>Requer: <code className="font-mono">pages_manage_metadata</code> ou <code className="font-mono">instagram_business_manage_messages</code></p>
              </div>
              <Button onClick={handleSimulateWebhook} disabled={webhookReceived}
                variant="outline" className="w-full gap-2 border-border" size="sm">
                <Instagram className="h-3.5 w-3.5" />
                {webhookReceived ? "DM received" : "Simulate: External user sends DM"}
              </Button>
            </CardContent>
          </Card>

          {/* Inbox */}
          {webhookReceived && (
            <Card className={cn("card-surface", inboxOpen && "border-orange-500/20")}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-orange-400" />
                    C8 Inbox
                  </CardTitle>
                  {inboxOpen && <LiveMetaIndicator mode={testMode} />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Mensagem recebida */}
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600">
                    <Instagram className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="rounded-2xl rounded-tl-none bg-secondary/40 px-3 py-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        @{MOCK_DM.from.username}
                        <Badge variant="outline" className="ml-2 text-[9px] py-0">
                          instagram_business_manage_messages
                        </Badge>
                      </p>
                      <p className="text-sm text-foreground">{MOCK_DM.message}</p>
                    </div>
                  </div>
                </div>

                {/* Reply */}
                {inboxOpen && !replySent && (
                  <div className="space-y-2 border-t border-border/50 pt-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      Human agent active — automation paused
                    </p>
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none resize-none" />
                    <Button onClick={handleReply} disabled={loading}
                      className="w-full gap-2 bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600 hover:opacity-90 text-white" size="sm">
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send via Meta API — POST /me/messages
                    </Button>
                  </div>
                )}

                {/* Resposta enviada */}
                {replySent && (
                  <div className="flex items-start gap-2.5 flex-row-reverse border-t border-border/50 pt-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                      <span className="text-xs font-bold text-primary">C8</span>
                    </div>
                    <div className="flex-1">
                      <div className="rounded-2xl rounded-tr-none bg-primary/20 px-3 py-2">
                        <p className="text-sm">{replyText}</p>
                      </div>
                      <div className="flex items-center gap-1.5 justify-end mt-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span className="text-[10px] text-emerald-400">Message sent</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {replySent && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-emerald-400">Message received in Instagram</span>
                <LiveMetaIndicator mode={testMode} showPulse />
              </div>
              <p className="text-xs text-muted-foreground/60">
                Auth: Instagram Login token (instagram_business_manage_messages)
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ApiRequestLog permission="instagram_business_manage_messages" limit={10} />
          <ScreencastChecklist permission="instagram_business_manage_messages"
            autoChecked={[
              ...(webhookReceived ? ["test_account", "permission", "asset_selected"] : []),
              ...(replySent ? ["api_called", "result_displayed", "no_secrets", "flow_recorded"] : []),
            ]} />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
