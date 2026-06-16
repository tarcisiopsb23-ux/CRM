import { useState } from "react";
import { useParams } from "react-router-dom";
import { Link2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

export function ConfigIntegracoesPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();

  // UTM Builder state
  const [utmBase, setUtmBase]         = useState("");
  const [utmSource, setUtmSource]     = useState("");
  const [utmMedium, setUtmMedium]     = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent]   = useState("");
  const [utmCopied, setUtmCopied]     = useState(false);

  if (!dc) return <CredentialsErrorState />;

  const utmUrl = (() => {
    if (!utmBase.trim()) return "";
    try {
      const base = utmBase.trim().startsWith("http") ? utmBase.trim() : `https://${utmBase.trim()}`;
      const url = new URL(base);
      if (utmSource)   url.searchParams.set("utm_source",   utmSource);
      if (utmMedium)   url.searchParams.set("utm_medium",   utmMedium);
      if (utmCampaign) url.searchParams.set("utm_campaign", utmCampaign);
      if (utmContent)  url.searchParams.set("utm_content",  utmContent);
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
      <PageHeader title="Integrações" description="Gerador de links UTM para rastrear origens de tráfego." />

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
            <Input
              value={utmBase}
              onChange={e => setUtmBase(e.target.value)}
              placeholder="https://seusite.com/pagina"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Source (utm_source)",     value: utmSource,   set: setUtmSource,   placeholder: "google, instagram, email" },
              { label: "Medium (utm_medium)",     value: utmMedium,   set: setUtmMedium,   placeholder: "cpc, organic, email" },
              { label: "Campaign (utm_campaign)", value: utmCampaign, set: setUtmCampaign, placeholder: "nome-da-campanha" },
              { label: "Content (utm_content)",   value: utmContent,  set: setUtmContent,  placeholder: "banner-topo" },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="grid gap-2">
                <Label className="text-xs">{label}</Label>
                <Input
                  value={value}
                  onChange={e => set(e.target.value)}
                  placeholder={placeholder}
                  className="text-sm"
                />
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(utmUrl, "_blank", "noopener")}
                  className="border-border gap-2"
                >
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
