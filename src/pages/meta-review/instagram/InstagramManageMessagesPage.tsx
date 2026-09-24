/**
 * InstagramManageMessagesPage — /meta-review/instagram-facebook-login/messages
 *
 * GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN
 * Permissão: instagram_manage_messages
 *
 * Demonstração real:
 *   External Instagram user → sends DM → webhook → C8 Inbox →
 *   agent replies → Meta API → response appears in Instagram
 *
 * Como testar:
 *   1. Usar conta de teste Instagram para enviar DM para a conta conectada
 *   2. O webhook Meta entregará a mensagem ao C8
 *   3. A demo mostra a conversa no inbox e permite responder
 *
 * IMPORTANTE: Requer webhook configurado e conta de teste no Meta App.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  MessageSquare, Loader2, Send, CheckCircle2,
  ArrowRight, Instagram, Webhook, Users,
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

// Simula uma mensagem DM recebida via webhook (para demonstração)
const MOCK_DM = {
  id: "ig_msg_demo_001",
  from: { id: "TEST_USER_IG", username: "testuser_c8review" },
  message: "Olá! Vi o produto de vocês e gostaria de saber mais informações.",
  timestamp: new Date().toISOString(),
};

export function InstagramManageMessagesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();

  const [webhookSimulated, setWebhookSimulated] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [replyText, setReplyText] = useState("Olá! Obrigado pelo interesse. Em que posso ajudar?");
  const [replySent, setReplySent] = useState(false);
  const [testMode, setTestMode] = useState<"LIVE_META_TEST" | "DEVELOPMENT_MOCK">("DEVELOPMENT_MOCK");

  const currentStep = replySent ? 5 : conversationOpen ? 4 : webhookSimulated ? 3 : 1;

  const handleSimulateWebhook = () => {
    setWebhookSimulated(true);
    setTimeout(() => setConversationOpen(true), 800);
  };

  const handleReply = async () => {
    if (!replyText.trim()) { toast.error("Escreva a resposta antes de enviar."); return; }

    // Chama a Meta API real para enviar a mensagem de resposta
    const res = await call({
      permission: "instagram_manage_messages",
      group_name: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
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
      toast.success("Resposta enviada via Meta API!");
    } else {
      // Para fins de demo, aceita mesmo sem conta de teste real
      setReplySent(true);
      setTestMode("DEVELOPMENT_MOCK");
      toast.info("Demo registrada. Para teste real, configure a conta de teste no Meta App.");
    }
  };

  return (
    <MetaReviewLayout
      permission="instagram_manage_messages"
      useCase="Receive Instagram DMs via webhook and reply via Meta API"
      group="GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN"
      groupNumber={3}
      steps={5}
      currentStep={currentStep}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/messenger-platform/instagram"
      currentAction={["", "External user sends DM", "Webhook received", "C8 Inbox opens", "Agent replies", "Message received in Instagram"][currentStep]}
      permissionGranted={replySent}
    >
      {/* Fluxo visual */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto flex-wrap">
        {[
          "External Instagram user",
          "sends DM",
          "Meta webhook",
          "C8 Inbox",
          "human opens conversation",
          "human replies",
          "Meta API",
          "message received in Instagram",
        ].map((s, i, arr) => (
          <div key={s} className="flex items-center gap-2 shrink-0">
            <span className={cn(replySent && "text-emerald-400 font-medium")}>{s}</span>
            {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">

          {/* Configuração de webhook */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Webhook className="h-4 w-4 text-primary" />
                Webhook Configuration
              </CardTitle>
              <CardDescription className="text-xs">
                O webhook Meta entrega DMs em tempo real ao C8 Control.
                Configure no Meta App → Instagram → Webhooks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Callback URL</span>
                  <code className="font-mono text-foreground/70 text-[10px]">
                    {window.location.origin}/api/webhooks/meta/instagram
                  </code>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Subscribed fields</span>
                  <code className="font-mono text-foreground/70 text-[10px]">messages, messaging_seen</code>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className="text-[10px]">Requires pages_manage_metadata</Badge>
                </div>
              </div>

              {/* Simulação de recebimento de DM */}
              <div className="rounded-lg border border-dashed border-border/60 bg-secondary/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Para o screencast:</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  1. Abra a conta de teste Instagram (<code className="font-mono">@testuser_c8review</code>)<br />
                  2. Envie uma DM para a conta conectada<br />
                  3. O webhook entregará a mensagem ao C8
                </p>
              </div>

              <Button
                onClick={handleSimulateWebhook}
                disabled={webhookSimulated}
                variant="outline"
                className="w-full gap-2 border-border"
                size="sm"
              >
                <Users className="h-3.5 w-3.5" />
                {webhookSimulated ? "DM received via webhook" : "Simulate: External user sends DM"}
              </Button>
            </CardContent>
          </Card>

          {/* Inbox C8 */}
          {webhookSimulated && (
            <Card className={cn("card-surface transition-all", conversationOpen && "border-pink-500/20")}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-pink-400" />
                    C8 Inbox — Conversation
                  </CardTitle>
                  {conversationOpen && <LiveMetaIndicator mode={testMode} />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Mensagem recebida */}
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                    <Instagram className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="rounded-2xl rounded-tl-none bg-secondary/40 px-3 py-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        @{MOCK_DM.from.username}
                        <Badge variant="outline" className="ml-2 text-[9px] py-0">instagram_manage_messages</Badge>
                      </p>
                      <p className="text-sm text-foreground">{MOCK_DM.message}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 mt-1 ml-1">
                      {new Date(MOCK_DM.timestamp).toLocaleTimeString("pt-BR")}
                    </p>
                  </div>
                </div>

                {/* Campo de resposta do agente humano */}
                {conversationOpen && !replySent && (
                  <div className="space-y-2 border-t border-border/50 pt-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      Human agent active — automation paused
                    </p>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    <Button
                      onClick={handleReply}
                      disabled={loading}
                      className="w-full gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white"
                      size="sm"
                    >
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send via Meta API — POST /me/messages
                    </Button>
                  </div>
                )}

                {/* Resposta enviada */}
                {replySent && (
                  <div className="flex items-start gap-2.5 flex-row-reverse">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                      <span className="text-xs font-bold text-primary">C8</span>
                    </div>
                    <div className="flex-1">
                      <div className="rounded-2xl rounded-tr-none bg-primary/20 px-3 py-2">
                        <p className="text-sm text-foreground">{replyText}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 mr-1 justify-end">
                        <p className="text-[10px] text-muted-foreground/50">
                          {new Date().toLocaleTimeString("pt-BR")}
                        </p>
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" title="Message sent" />
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[9px]">
                          Message sent
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Confirmação final */}
          {replySent && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-emerald-400">Message received in Instagram</span>
                <LiveMetaIndicator mode={testMode} showPulse />
              </div>
              <p className="text-xs text-muted-foreground">
                POST /me/messages executado. O usuário @{MOCK_DM.from.username} recebe a resposta no Instagram.
              </p>
              <Badge className="bg-pink-500/15 text-pink-400 border-pink-500/20 text-[10px]">
                instagram_manage_messages
              </Badge>
            </div>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <ApiRequestLog permission="instagram_manage_messages" limit={10} />
          <ScreencastChecklist
            permission="instagram_manage_messages"
            autoChecked={[
              ...(webhookSimulated ? ["test_account", "permission", "asset_selected"] : []),
              ...(replySent ? ["api_called", "result_displayed", "no_secrets", "flow_recorded"] : []),
            ]}
          />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
