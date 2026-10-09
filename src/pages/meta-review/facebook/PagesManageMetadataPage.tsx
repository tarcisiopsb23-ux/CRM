/**
 * PagesManageMetadataPage — /meta-review/pages-manage-metadata
 * Permissão: pages_manage_metadata
 * Demonstra: inscrição de webhook — POST /{page-id}/subscribed_apps
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Webhook, CheckCircle2, Loader2, Bell, MessageCircle, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";
import { LiveMetaIndicator } from "../shared/LiveMetaIndicator";
import { ApiRequestLog } from "../shared/ApiRequestLog";
import { ScreencastChecklist } from "../shared/ScreencastChecklist";
import { useMetaReviewProxy } from "@/hooks/useMetaReviewProxy";
import { toast } from "sonner";

const WEBHOOK_FIELDS = ["messages", "messaging_postbacks", "feed", "mention"];

export function PagesManageMetadataPage() {
  const { slug } = useParams<{ slug: string }>();
  const { call, loading } = useMetaReviewProxy();
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionResult, setSubscriptionResult] = useState<unknown>(null);
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

  const handleSubscribe = async () => {
    if (!selectedPageId) { toast.error("Selecione uma Página."); return; }
    const res = await call({
      permission: "pages_manage_metadata",
      group_name: "GRUPO 2 — FACEBOOK PAGES",
      endpoint: `/${selectedPageId}/subscribed_apps`,
      method: "POST",
      params: { subscribed_fields: WEBHOOK_FIELDS.join(",") },
      use_page_token: true, page_id: selectedPageId,
    });
    if (res?.success) {
      setSubscribed(true);
      setSubscriptionResult(res.data);
      setTestMode("LIVE_META_TEST");
      toast.success("Página inscrita em webhooks com sucesso!");
    } else {
      toast.error(res?.error ?? "Erro ao inscrever a Página em webhooks.");
    }
  };

  return (
    <MetaReviewLayout
      permission="pages_manage_metadata"
      useCase="Subscribe Page to webhooks for real-time messages, comments, and feed events"
      group="GRUPO 2 — FACEBOOK PAGES" groupNumber={2}
      steps={4} currentStep={subscribed ? 4 : selectedPageId ? 2 : 1}
      testMode={testMode}
      docsUrl="https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages"
      currentAction={subscribed ? "Webhook subscription active" : "Configure Page Integration"}
      permissionGranted={subscribed}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {/* Explicação */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-400">pages_manage_metadata — O que esta permissão faz</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Permite inscrever a Página em webhooks do Meta, recebendo notificações em
              tempo real quando chegam mensagens, comentários ou publicações.
              O C8 Control usa isso para alimentar o inbox de atendimento.
            </p>
          </div>

          {/* Facebook Integration Status */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Webhook className="h-4 w-4 text-primary" />
                Facebook Integration Status
              </CardTitle>
              <CardDescription className="text-xs">
                Configure Page Integration — inscreve a Página em webhooks via API real
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Conecte uma Página em pages_show_list primeiro.</p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Page</label>
                    <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none">
                      {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Webhook subscriptions</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { field: "messages", icon: MessageCircle, label: "Messaging" },
                        { field: "feed", icon: Hash, label: "Feed" },
                        { field: "mention", icon: Hash, label: "Mentions" },
                        { field: "messaging_postbacks", icon: Bell, label: "Postbacks" },
                      ].map(({ field, icon: Icon, label }) => (
                        <div key={field}
                          className="flex items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-xs font-medium">{label}</p>
                            <code className="text-[10px] text-muted-foreground/60 font-mono">{field}</code>
                          </div>
                          {subscribed && <CheckCircle2 className="h-3 w-3 text-emerald-400 ml-auto" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={handleSubscribe}
                    disabled={loading || subscribed}
                    className="w-full gap-2"
                    size="sm"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
                    {subscribed ? "Integration Active" : "Configure Page Integration"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Resultado */}
          {subscribed && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-emerald-400">Webhook Subscription Active</span>
                <LiveMetaIndicator mode="LIVE_META_TEST" showPulse />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Messaging", status: "Active" },
                  { label: "Comments", status: "Active" },
                  { label: "Feed", status: "Active" },
                  { label: "Mentions", status: "Active" },
                ].map(({ label, status }) => (
                  <div key={label} className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">{status}</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60">
                POST /{selectedPageId}/subscribed_apps executado via Meta API real
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ApiRequestLog permission="pages_manage_metadata" limit={8} />
          <ScreencastChecklist permission="pages_manage_metadata"
            autoChecked={[
              ...(pages.length > 0 ? ["test_account", "permission"] : []),
              ...(subscribed ? ["asset_selected", "api_called", "result_displayed", "no_secrets"] : []),
            ]} />
        </div>
      </div>
    </MetaReviewLayout>
  );
}
