import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Loader2, Link2, Copy, ExternalLink, CheckCircle2, WifiOff, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

// ─── Self-service OAuth para clientes autônomos ──────────────────────────────

function SelfServiceAdConnect({ clientId, organizationId, onConnected }: {
  clientId: string | undefined;
  organizationId: string | undefined;
  onConnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"meta" | "google">("meta");
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [appId, setAppId] = useState("");
  const [saving, setSaving] = useState(false);

  if (!clientId || !organizationId) return null;

  const handleSave = async () => {
    if (!accountId.trim()) { toast.error("ID da conta é obrigatório."); return; }
    setSaving(true);
    try {
      if (platform === "meta") {
        const { error } = await supabase.rpc("upsert_meta_ad_account", {
          p_client_id:       clientId,
          p_organization_id: organizationId,
          p_ad_account_id:   accountId.trim(),
          p_account_name:    accountName.trim() || null,
          p_app_id:          appId.trim() || null,
          p_owned_by:        "client",
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("upsert_google_ad_account", {
          p_client_id:        clientId,
          p_organization_id:  organizationId,
          p_customer_id:      accountId.trim(),
          p_account_name:     accountName.trim() || null,
          p_client_id_oauth:  appId.trim() || null,
          p_owned_by:         "client",
        });
        if (error) throw error;
      }
      toast.success("Conta cadastrada! O n8n iniciará a sincronização.");
      setOpen(false);
      setAccountId(""); setAccountName(""); setAppId("");
      onConnected();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao cadastrar conta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border/40 pt-4">
      <p className="text-xs text-muted-foreground mb-3">
        Sem assessoria da agência? Cadastre sua conta diretamente para sincronização via n8n.
      </p>
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="border-border gap-2">
          <Settings2 className="h-3.5 w-3.5" /> Cadastrar conta própria
        </Button>
      ) : (
        <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
          <div className="flex gap-2">
            {(["meta", "google"] as const).map(p => (
              <button key={p} onClick={() => setPlatform(p)}
                className={cn("px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                  platform === p ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                )}>
                {p === "meta" ? "Meta Ads" : "Google Ads"}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">
              {platform === "meta" ? "Ad Account ID (act_XXXXXXXX)" : "Customer ID (XXX-XXX-XXXX)"}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input value={accountId} onChange={e => setAccountId(e.target.value)}
              placeholder={platform === "meta" ? "act_1234567890" : "123-456-7890"}
              className="h-8 text-sm font-mono" />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">Nome da conta</Label>
            <Input value={accountName} onChange={e => setAccountName(e.target.value)}
              placeholder="Ex: Minha Empresa Ads" className="h-8 text-sm" />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">
              {platform === "meta" ? "App ID (opcional)" : "OAuth Client ID (opcional)"}
            </Label>
            <Input value={appId} onChange={e => setAppId(e.target.value)}
              placeholder={platform === "meta" ? "ID do Meta App" : "ID do Google OAuth Client"}
              className="h-8 text-sm font-mono" />
            <p className="text-[10px] text-muted-foreground">
              Necessário apenas se você usa um app próprio. O n8n usará as credenciais da agência por padrão.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-gradient-ember text-primary-foreground">
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConfigIntegracoesPage() {
  const dc = useDynamicClient();
  const { auth, slug } = useClientAuth();
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const effectiveSlug = slug || paramSlug || "";
  const qc = useQueryClient();
  const canEdit = ["owner", "admin"].includes(auth?.user?.role ?? "");

  // UTM Builder state
  const [utmBase, setUtmBase]         = useState("");
  const [utmSource, setUtmSource]     = useState("");
  const [utmMedium, setUtmMedium]     = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent]   = useState("");
  const [utmTerm, setUtmTerm]         = useState("");
  const [utmCopied, setUtmCopied]     = useState(false);

  if (!dc) return <CredentialsErrorState />;

  // Status das contas de anúncios (só metadados, sem tokens)
  const { data: adAccounts = [] } = useAdAccounts(auth?.id);

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
      <PageHeader title="Integrações" description="Contas de anúncios e gerador de links UTM." />

      {/* ── Contas de Anúncios ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base">Contas de Anúncios</CardTitle>
          <CardDescription>
            Conecte sua conta Meta Ads ou Google Ads para sincronizar dados de campanhas.
            {canEdit && (
              <span className="block mt-1">
                Se você tem assessoria da agência, a conexão é gerenciada por eles.
                Se você usa o dashboard de forma autônoma, cadastre seus dados abaixo.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status de contas conectadas */}
          {(["meta", "google"] as const).map(platform => {
            const account = adAccounts.find(a => a.platform === platform);
            const label = platform === "meta" ? "Meta Ads" : "Google Ads";
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
            const oauthFn = platform === "meta" ? "oauth-meta-ads" : "oauth-google-ads";
            const oauthUrl = auth?.id && effectiveSlug
              ? `${supabaseUrl}/functions/v1/${oauthFn}/authorize?client_id=${auth.id}&slug=${encodeURIComponent(effectiveSlug)}&owned_by=client`
              : null;
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
                        {account.account_name ?? "Conta conectada"} ·{" "}
                        {account.owned_by === "client" ? "Conta própria" : "Gerenciada pela agência"}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Não conectado</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!account && canEdit && oauthUrl && (
                    <Button
                      variant="outline" size="sm"
                      className="text-xs border-border gap-1.5"
                      onClick={() => window.open(oauthUrl, "_blank", "noopener,width=600,height=700")}
                    >
                      <Link2 className="h-3.5 w-3.5" /> Conectar via OAuth
                    </Button>
                  )}
                  {account && canEdit && (
                  <Button
                    variant="ghost" size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      try {
                        await supabase.rpc("disconnect_ad_account", {
                          p_client_id: auth?.id,
                          p_platform: platform,
                        });
                        toast.success(`${label} desconectado.`);
                        qc.invalidateQueries({ queryKey: ["ad_account_status", auth?.id] });
                      } catch { toast.error("Erro ao desconectar."); }
                    }}
                  >
                    Desconectar
                  </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Formulário self-service para clientes autônomos */}
          {canEdit && (
            <SelfServiceAdConnect clientId={auth?.id} organizationId={auth?.organization_id}
              onConnected={() => qc.invalidateQueries({ queryKey: ["ad_account_status", auth?.id] })} />
          )}
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
