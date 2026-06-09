import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, Link2, Copy, ExternalLink, CheckCircle2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

export function ConfigIntegracoesPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const qc = useQueryClient();
  const canEdit = ["owner", "admin"].includes(auth?.user?.role ?? "");

  const [metaPixelId, setMetaPixelId] = useState("");
  const [googleTagId, setGoogleTagId] = useState("");
  const [settingsId, setSettingsId]   = useState<string | null>(null);

  // UTM Builder state
  const [utmBase, setUtmBase]         = useState("");
  const [utmSource, setUtmSource]     = useState("");
  const [utmMedium, setUtmMedium]     = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent]   = useState("");
  const [utmTerm, setUtmTerm]         = useState("");
  const [utmCopied, setUtmCopied]     = useState(false);

  if (!dc) return <CredentialsErrorState />;

  // Carrega ai_settings existente
  useQuery({
    queryKey: ["ai_settings_integrations"],
    queryFn: async () => {
      const { data } = await dc.from("ai_settings").select("id, meta_pixel_id, google_tag_id").limit(1).maybeSingle();
      if (data) {
        setSettingsId(data.id);
        setMetaPixelId(data.meta_pixel_id ?? "");
        setGoogleTagId(data.google_tag_id ?? "");
      }
      return data;
    },
    enabled: !!dc,
    staleTime: 60_000,
  });

  // Status das contas de anúncios (só metadados, sem tokens)
  const { data: adAccounts = [] } = useAdAccounts(auth?.id);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!dc) throw new Error("Banco não conectado");
      const payload = {
        meta_pixel_id: metaPixelId.trim() || null,
        google_tag_id: googleTagId.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (settingsId) {
        const { error } = await dc.from("ai_settings").update(payload).eq("id", settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await dc.from("ai_settings").insert(payload).select("id").single();
        if (error) throw error;
        setSettingsId(data.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai_settings"] });
      toast.success("Integrações salvas!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // UTM Builder
  const utmUrl = (() => {
    if (!utmBase.trim()) return "";
    try {
      const base = utmBase.trim().startsWith("http") ? utmBase.trim() : `https://${utmBase.trim()}`;
      const url = new URL(base);
      if (utmSource)   url.searchParams.set("utm_source",   utmSource);
      if (utmMedium)   url.searchParams.set("utm_medium",   utmMedium);
      if (utmCampaign) url.searchParams.set("utm_campaign", utmCampaign);
      if (utmContent)  url.searchParams.set("utm_content",  utmContent);
      if (utmTerm)     url.searchParams.set("utm_term",     utmTerm);
      return url.toString();
    } catch { return ""; }
  })();

  const copyUtm = () => {
    if (!utmUrl) return;
    navigator.clipboard.writeText(utmUrl);
    setUtmCopied(true);
    toast.success("Link UTM copiado!");
    setTimeout(() => setUtmCopied(false), 2000);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Integrações" description="Pixels de rastreamento, tags e conexões com plataformas de anúncios." />

      {/* ── Pixels e Tags ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base">Rastreamento</CardTitle>
          <CardDescription>Pixel do Meta e Google Tag serão injetados em todas as páginas do dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Meta Pixel ID</Label>
            <Input
              value={metaPixelId}
              onChange={e => setMetaPixelId(e.target.value)}
              placeholder="Ex: 1234567890"
              disabled={!canEdit}
              className="font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label>Google Tag ID</Label>
            <Input
              value={googleTagId}
              onChange={e => setGoogleTagId(e.target.value)}
              placeholder="Ex: G-XXXXXXXXXX ou AW-XXXXXXXXXX"
              disabled={!canEdit}
              className="font-mono"
            />
          </div>
          {canEdit && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              className="bg-gradient-ember text-primary-foreground shadow-glow">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Contas de Anúncios ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base">Contas de Anúncios</CardTitle>
          <CardDescription>
            Conecte sua conta Meta Ads ou Google Ads para sincronizar dados de campanhas.
            O processo é gerenciado pela agência via OAuth seguro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["meta", "google"] as const).map(platform => {
            const account = adAccounts.find(a => a.platform === platform);
            const label = platform === "meta" ? "Meta Ads" : "Google Ads";
            return (
              <div key={platform} className={cn(
                "flex items-center justify-between rounded-lg border px-4 py-3",
                account ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-muted/10"
              )}>
                <div className="flex items-center gap-3">
                  {account
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    : <WifiOff className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                  }
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    {account ? (
                      <p className="text-xs text-muted-foreground">
                        {account.account_name ?? "Conta conectada"} · {account.owned_by === "client" ? "Sua conta" : "Gerenciada pela agência"}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Não conectado</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {account ? "Contate a agência para desconectar" : "Contate a agência para conectar"}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── UTM Builder ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> UTM Builder
          </CardTitle>
          <CardDescription>Gere links com parâmetros UTM para rastrear origens de tráfego.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>URL Base <span className="text-destructive">*</span></Label>
            <Input value={utmBase} onChange={e => setUtmBase(e.target.value)} placeholder="https://seusite.com/pagina" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Source (utm_source)",   value: utmSource,   set: setUtmSource,   placeholder: "google, instagram, email" },
              { label: "Medium (utm_medium)",   value: utmMedium,   set: setUtmMedium,   placeholder: "cpc, organic, email" },
              { label: "Campaign (utm_campaign)", value: utmCampaign, set: setUtmCampaign, placeholder: "nome-da-campanha" },
              { label: "Content (utm_content)", value: utmContent,  set: setUtmContent,  placeholder: "banner-topo" },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="grid gap-2">
                <Label className="text-xs">{label}</Label>
                <Input value={value} onChange={e => set(e.target.value)} placeholder={placeholder} className="text-sm" />
              </div>
            ))}
          </div>

          {utmUrl && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Link gerado</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 min-w-0 overflow-hidden">
                <span className="text-xs font-mono flex-1 break-all text-foreground">{utmUrl}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyUtm} className="border-border gap-2">
                  <Copy className="h-3.5 w-3.5" />
                  {utmCopied ? "Copiado!" : "Copiar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(utmUrl, "_blank", "noopener")} className="border-border gap-2">
                  <ExternalLink className="h-3.5 w-3.5" /> Testar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
