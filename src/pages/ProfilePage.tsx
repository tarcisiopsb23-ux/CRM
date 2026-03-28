import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock, Loader2, Plug, RefreshCw, Smartphone, User, Link2, Copy, Check, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { IntegrationStatusBadge, IntegrationStatus } from "@/components/crm/IntegrationStatusBadge";
import { QRCodeSVG } from "qrcode.react";

type AuthSession = {
  client_id: string;
  email: string;
  is_support?: boolean;
  metadata?: Record<string, string>;
};

function FieldInfo({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center">
      <Info className="h-3.5 w-3.5 text-slate-500 hover:text-slate-300 cursor-pointer transition-colors" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-6 z-50 w-56 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-[11px] text-slate-300 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
        {text}
      </span>
    </span>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);

  // Nome de exibicao
  const [displayName, setDisplayName] = useState("");
  const [displayNameLoading, setDisplayNameLoading] = useState(false);

  // Alterar senha
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Integracoes
  const [gtmId, setGtmId] = useState("");
  const [metaPixelId, setMetaPixelId] = useState("");
  const [n8nApiKey, setN8nApiKey] = useState("");
  const [whatsappWebhookUrl, setWhatsappWebhookUrl] = useState("");
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [waUrlLoading, setWaUrlLoading] = useState(false);
  const [waUrlError, setWaUrlError] = useState<string | null>(null);
  const [n8nLoading, setN8nLoading] = useState(false);
  const [n8nError, setN8nError] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<IntegrationStatus>("inativo");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Abas do dashboard
  const [tabPerformance, setTabPerformance] = useState(true);
  const [tabAtendimento, setTabAtendimento] = useState(false);
  const [tabCrm, setTabCrm] = useState(false);
  const [tabsLoading, setTabsLoading] = useState(false);

  // Gerador de link de anúncio
  const [genPhone, setGenPhone] = useState("");
  const [genSource, setGenSource] = useState("google");
  const [genCampaign, setGenCampaign] = useState("");
  const [genMedium, setGenMedium] = useState("cpc");
  const [genContent, setGenContent] = useState("");
  const [genMsg, setGenMsg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("client_auth");
    if (!raw) { navigate("/login"); return; }
    const parsed: AuthSession = JSON.parse(raw);
    setSession(parsed);

    const meta = parsed.metadata ?? {};
    setGtmId(meta.gtm_id ?? "");
    setMetaPixelId(meta.meta_pixel_id ?? "");
    setN8nApiKey(meta.n8n_api_key ?? "");
    setWhatsappWebhookUrl(meta.whatsapp_webhook_url ?? "");
    setTabPerformance((meta as any).dashboard_performance !== false);
    setTabAtendimento((meta as any).dashboard_atendimento === true);
    setTabCrm((meta as any).dashboard_crm === true);
    setDisplayName((meta as any).display_name ?? "");

    const webhookUrl = meta.whatsapp_webhook_url ?? "";
    if (webhookUrl.trim() !== "") {
      fetch(`${webhookUrl.replace(/\/$/, "")}/api/status`)
        .then((res) => res.json())
        .then((data) => {
          const status = data?.status as IntegrationStatus | undefined;
          const valid: IntegrationStatus[] = ["conectado", "aguardando_qr", "desconectado", "inativo"];
          setWhatsappStatus(valid.includes(status as IntegrationStatus) ? (status as IntegrationStatus) : "desconectado");
        })
        .catch(() => setWhatsappStatus("desconectado"));
    } else {
      setWhatsappStatus("inativo");
    }
  }, [navigate]);

  const fetchQr = useCallback(async () => {
    const url = whatsappWebhookUrl.trim();
    if (!url) return;

    // Block mixed content: HTTP URL called from HTTPS page
    if (window.location.protocol === 'https:' && url.startsWith('http://')) {
      setQrCode(null);
      setWhatsappStatus('desconectado');
      console.warn('[WA] URL do backend deve ser HTTPS quando o dashboard roda em HTTPS. Configure a URL pública (ex: https://wa.seudominio.com).');
      return;
    }

    setQrLoading(true);
    try {
      const base = url.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/qr`);
      const data = await res.json();
      setQrCode(data.qr ?? null);
      const valid: IntegrationStatus[] = ["conectado", "aguardando_qr", "desconectado", "inativo"];
      setWhatsappStatus(valid.includes(data.status) ? data.status : "desconectado");
    } catch {
      setQrCode(null);
    } finally {
      setQrLoading(false);
    }
  }, [whatsappWebhookUrl]);

  // Auto-poll QR/status every 3s while waiting for connection
  useEffect(() => {
    if (!whatsappWebhookUrl.trim()) return;
    if (whatsappStatus === 'conectado') return;
    const interval = setInterval(() => { fetchQr(); }, 3000);
    return () => clearInterval(interval);
  }, [whatsappWebhookUrl, whatsappStatus, fetchQr]);

  // Initial QR fetch when URL is available
  useEffect(() => {
    if (whatsappWebhookUrl.trim()) fetchQr();
  }, [whatsappWebhookUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveDisplayName = async () => {
    setDisplayNameLoading(true);
    try {
      const { error } = await supabase.rpc("update_display_name", {
        p_client_id: session?.client_id,
        p_display_name: displayName.trim(),
      });
      if (error) throw error;
      const raw = localStorage.getItem("client_auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.metadata = { ...(parsed.metadata ?? {}), display_name: displayName.trim() };
        localStorage.setItem("client_auth", JSON.stringify(parsed));
      }
      toast.success("Nome de exibição atualizado!");
    } catch {
      toast.error("Erro ao salvar nome de exibição.");
    } finally {
      setDisplayNameLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("A nova senha e a confirmação não conferem.");
      return;
    }
    setPasswordLoading(true);
    try {
      const { data: isValid, error: validationError } = await supabase.rpc(
        "validate_client_dashboard_password",
        { p_email: session?.email ?? "", p_password: currentPassword }
      );
      if (validationError) { setPasswordError("Erro ao verificar senha atual. Tente novamente."); return; }
      if (!isValid) { setPasswordError("Senha atual incorreta. Verifique e tente novamente."); return; }
      const { error: updateError } = await supabase.rpc("update_client_dashboard_password", {
        p_client_id: session?.client_id,
        p_new_password: newPassword,
      });
      if (updateError) throw updateError;
      toast.success("Senha alterada com sucesso!");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch {
      setPasswordError("Erro ao alterar senha. Tente novamente.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntegrationsError(null);
    setIntegrationsLoading(true);
    try {
      const { error } = await supabase.rpc("update_client_integrations", {
        p_client_id: session?.client_id,
        p_gtm_id: gtmId.trim(),
        p_meta_pixel_id: metaPixelId.trim(),
        p_n8n_api_key: n8nApiKey.trim(),
        p_whatsapp_webhook_url: whatsappWebhookUrl.trim(),
      });
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("GTM")) setIntegrationsError("Formato de GTM ID inválido. Use o formato GTM-XXXXXXX.");
        else if (msg.includes("Pixel")) setIntegrationsError("Formato de Meta Pixel ID inválido. Deve ser numérico com 15 ou 16 dígitos.");
        else setIntegrationsError("Erro ao salvar integrações. Verifique os valores e tente novamente.");
        return;
      }
      const raw = localStorage.getItem("client_auth");
      if (raw) {
        const parsed: AuthSession = JSON.parse(raw);
        parsed.metadata = {
          ...(parsed.metadata ?? {}),
          gtm_id: gtmId.trim(), meta_pixel_id: metaPixelId.trim(),
          n8n_api_key: n8nApiKey.trim(), whatsapp_webhook_url: whatsappWebhookUrl.trim(),
        };
        localStorage.setItem("client_auth", JSON.stringify(parsed));
        setSession(parsed);
      }
      toast.success("Integrações salvas com sucesso!");
    } catch {
      setIntegrationsError("Erro inesperado ao salvar integrações. Tente novamente.");
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const saveIntegrationFields = async (fields: Record<string, string>, setLoading: (v: boolean) => void, setError: (v: string | null) => void, successMsg: string) => {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.rpc("update_client_integrations", {
        p_client_id: session?.client_id,
        p_gtm_id: fields.gtm_id ?? gtmId.trim(),
        p_meta_pixel_id: fields.meta_pixel_id ?? metaPixelId.trim(),
        p_n8n_api_key: fields.n8n_api_key ?? n8nApiKey.trim(),
        p_whatsapp_webhook_url: fields.whatsapp_webhook_url ?? whatsappWebhookUrl.trim(),
      });
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("GTM")) setError("Formato de GTM ID inválido. Use o formato GTM-XXXXXXX.");
        else if (msg.includes("Pixel")) setError("Formato de Meta Pixel ID inválido. Deve ser numérico com 15 ou 16 dígitos.");
        else setError("Erro ao salvar. Verifique os valores e tente novamente.");
        return;
      }
      const raw = localStorage.getItem("client_auth");
      if (raw) {
        const parsed: AuthSession = JSON.parse(raw);
        parsed.metadata = { ...(parsed.metadata ?? {}), ...fields };
        localStorage.setItem("client_auth", JSON.stringify(parsed));
        setSession(parsed);
      }
      toast.success(successMsg);
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTracking = () => saveIntegrationFields(
    { gtm_id: gtmId.trim(), meta_pixel_id: metaPixelId.trim() },
    setTrackingLoading, setTrackingError, "GTM e Meta Pixel salvos!"
  );

  const handleSaveWaUrl = () => saveIntegrationFields(
    { whatsapp_webhook_url: whatsappWebhookUrl.trim() },
    setWaUrlLoading, setWaUrlError, "URL do WhatsApp salva!"
  );

  const handleSaveN8n = () => saveIntegrationFields(
    { n8n_api_key: n8nApiKey.trim() },
    setN8nLoading, setN8nError, "Chave n8n salva!"
  );

  const integrationStatus = (value: string): IntegrationStatus =>
    value.trim() !== "" ? "conectado" : "inativo";

  const generatedLink = useMemo(() => {
    if (!genPhone.trim() || !session?.client_id) return "";
    const base = `${window.location.origin}/wa`;
    const p = new URLSearchParams();
    p.set("to", genPhone.trim().replace(/\D/g, ""));
    p.set("cid", session.client_id);
    if (genSource)   p.set("utm_source", genSource);
    if (genMedium)   p.set("utm_medium", genMedium);
    if (genCampaign) p.set("utm_campaign", genCampaign);
    if (genContent)  p.set("utm_content", genContent);
    if (genMsg)      p.set("msg", genMsg);
    return `${base}?${p.toString()}`;
  }, [genPhone, genSource, genMedium, genCampaign, genContent, genMsg, session]);

  const handleCopy = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">Perfil e Configurações</h1>
            <p className="text-slate-400 text-sm">{session.email}</p>
          </div>
        </div>

        {/* Grid 2 colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

          {/* Coluna esquerda */}
          <div className="space-y-6 flex flex-col">

            {/* Nome de Exibição */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-slate-500 flex flex-col flex-1">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-400" />
                  Nome de Exibição
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Nome exibido abaixo do C8 Control na tela principal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex flex-col flex-1">
                <div className="space-y-2">
                  <Label className="text-slate-300">Nome de Exibição</Label>
                  <Input type="text" placeholder="Ex: Empresa XYZ"
                    className="bg-slate-900/50 border-slate-700 text-white h-11"
                    value={displayName} onChange={e => setDisplayName(e.target.value)} />
                  <p className="text-xs text-slate-500">Se vazio, usa o nome do cadastro.</p>
                </div>
                <Button type="button" className="w-full bg-slate-600 hover:bg-slate-500 h-11 font-bold mt-auto"
                  disabled={displayNameLoading} onClick={handleSaveDisplayName}>
                  {displayNameLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Salvar Nome de Exibição
                </Button>
              </CardContent>
            </Card>

            {/* Alterar Senha */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-[#7C3AED] flex flex-col flex-1">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Lock className="h-5 w-5 text-[#7C3AED]" />
                  Alterar Senha
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Informe sua senha atual para definir uma nova senha de acesso.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <form onSubmit={handleChangePassword} className="space-y-4 flex flex-col flex-1">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Senha Atual</Label>
                    <Input type="password" placeholder="••••••••"
                      className="bg-slate-900/50 border-slate-700 text-white h-11"
                      value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Nova Senha (mín. 8 caracteres)</Label>
                    <Input type="password" placeholder="••••••••"
                      className="bg-slate-900/50 border-slate-700 text-white h-11"
                      value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Confirmar Nova Senha</Label>
                    <Input type="password" placeholder="••••••••"
                      className="bg-slate-900/50 border-slate-700 text-white h-11"
                      value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </div>
                  {passwordError && <p className="text-sm text-red-400 font-medium">{passwordError}</p>}
                  <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-11 font-bold mt-auto" disabled={passwordLoading}>
                    {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Alterar Senha
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Abas do Dashboard */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-violet-500 flex flex-col flex-1">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <span className="text-violet-400 text-lg">&#9638;</span>
                  Abas do Dashboard
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Escolha quais seções ficam visíveis no dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex flex-col flex-1">
                {[
                  { label: "Performance", desc: "Métricas de anúncios, KPIs e campanhas", value: tabPerformance, set: setTabPerformance },
                  { label: "Atendimento", desc: "KPIs de conversas e WhatsApp", value: tabAtendimento, set: setTabAtendimento },
                  { label: "CRM", desc: "Pipeline de leads e kanban", value: tabCrm, set: setTabCrm },
                ].map(({ label, desc, value, set }) => (
                  <div key={label} className="flex items-center justify-between rounded-lg bg-slate-900/40 border border-slate-700 px-4 py-3">
                    <div>
                      <p className="text-slate-200 font-bold text-sm">{label}</p>
                      <p className="text-slate-500 text-xs">{desc}</p>
                    </div>
                    <button type="button" onClick={() => set(!value)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-violet-600" : "bg-slate-700"}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-slate-300 transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                ))}
                <Button type="button" className="w-full bg-violet-600 hover:bg-violet-700 h-11 font-bold mt-auto"
                  disabled={tabsLoading}
                  onClick={async () => {
                    if (!tabPerformance && !tabAtendimento && !tabCrm) { toast.error("Pelo menos uma aba deve estar ativa."); return; }
                    setTabsLoading(true);
                    try {
                      const { error } = await supabase.rpc("update_dashboard_tabs", {
                        p_client_id: session?.client_id,
                        p_dashboard_performance: tabPerformance,
                        p_dashboard_atendimento: tabAtendimento,
                        p_dashboard_crm: tabCrm,
                      });
                      if (error) throw error;
                      toast.success("Abas do dashboard atualizadas!");
                    } catch { toast.error("Erro ao salvar configuração das abas."); }
                    finally { setTabsLoading(false); }
                  }}>
                  {tabsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Salvar Abas
                </Button>
              </CardContent>
            </Card>

          </div>

          {/* Coluna direita */}
          <div className="flex flex-col">

            {/* Integracoes */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-emerald-500 flex flex-col flex-1">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Plug className="h-5 w-5 text-emerald-400" />
                  Integrações
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Configure as integrações de rastreamento e automação do seu dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-x-hidden overflow-y-auto">
                <form onSubmit={handleSaveIntegrations} className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Google Tag Manager ID</Label>
                      <IntegrationStatusBadge status={integrationStatus(gtmId)} />
                    </div>
                    <Input type="text" placeholder="GTM-XXXXXXX"
                      className="bg-slate-900/50 border-slate-700 text-white h-11 font-mono"
                      value={gtmId} onChange={(e) => setGtmId(e.target.value)} />
                    <p className="text-xs text-slate-500">Formato: GTM-[A-Z0-9]+</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Meta Pixel ID</Label>
                      <IntegrationStatusBadge status={integrationStatus(metaPixelId)} />
                    </div>
                    <Input type="text" placeholder="123456789012345"
                      className="bg-slate-900/50 border-slate-700 text-white h-11 font-mono"
                      value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)} />
                    <p className="text-xs text-slate-500">Numérico, 15 ou 16 dígitos</p>
                  </div>
                  {trackingError && <p className="text-sm text-red-400">{trackingError}</p>}
                  <Button type="button" onClick={handleSaveTracking} disabled={trackingLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 h-10 font-bold">
                    {trackingLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Salvar GTM e Meta Pixel
                  </Button>
                  {/* Separador WhatsApp */}
                  <div className="border-t border-slate-700 pt-4">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Integração WhatsApp</p>
                    <p className="text-xs text-slate-500 mb-4">Você pode ativar um ou ambos os métodos simultaneamente.</p>

                    {/* Método 1: QR Code */}
                    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-3 mb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-emerald-400" />
                          <div>
                            <p className="text-slate-200 font-bold text-sm">Método 1 — QR Code</p>
                            <p className="text-slate-500 text-xs">Conecta via whatsapp-web.js no seu servidor. Habilita a lista de pendentes para conversão de leads.</p>
                          </div>
                        </div>
                        <IntegrationStatusBadge status={whatsappStatus} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs">URL do Backend (Node.js / VPS)</Label>
                        <Input type="url" placeholder="https://wa.seudominio.com"
                          className="bg-slate-900/50 border-slate-700 text-white h-10 font-mono text-sm"
                          value={whatsappWebhookUrl} onChange={(e) => setWhatsappWebhookUrl(e.target.value)} />
                        {whatsappWebhookUrl.trim().startsWith('http://') && window.location.protocol === 'https:' && (
                          <p className="text-xs text-amber-400 mt-1">⚠️ Use HTTPS — o dashboard roda em HTTPS e não pode chamar URLs HTTP. Configure a URL pública com HTTPS.</p>
                        )}
                      </div>
                      {whatsappWebhookUrl.trim() && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">QR Code de conexão</p>
                            <Button size="sm" onClick={fetchQr} disabled={qrLoading}
                              className="bg-slate-700 hover:bg-slate-600 text-slate-200 h-7 text-xs gap-1 border-0">
                              <RefreshCw className={`h-3 w-3 ${qrLoading ? "animate-spin" : ""}`} />
                              Atualizar
                            </Button>
                          </div>
                          {whatsappStatus === "conectado" ? (
                            <div className="rounded-lg bg-emerald-900/20 border border-emerald-500/30 p-3 text-center">
                              <p className="text-emerald-400 font-bold text-sm">WhatsApp conectado</p>
                              <p className="text-emerald-400/70 text-xs mt-1">Conversas sendo capturadas automaticamente</p>
                            </div>
                          ) : qrCode ? (
                            <div className="rounded-lg bg-white p-4 flex flex-col items-center gap-2">
                              <QRCodeSVG value={qrCode} size={180} />
                              <p className="text-slate-800 text-xs font-bold">Escaneie com o WhatsApp</p>
                              <p className="text-slate-500 text-[10px] text-center">WhatsApp &rarr; Dispositivos conectados &rarr; Conectar dispositivo</p>
                            </div>
                          ) : (
                            <div className="rounded-lg bg-slate-900/60 border border-slate-700 p-3 text-center">
                              <p className="text-slate-400 text-xs">Clique em "Atualizar" para buscar o QR Code</p>
                            </div>
                          )}
                        </div>
                      )}
                      {waUrlError && <p className="text-xs text-red-400">{waUrlError}</p>}
                      <Button type="button" onClick={handleSaveWaUrl} disabled={waUrlLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 font-bold text-sm">
                        {waUrlLoading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                        Salvar URL do WhatsApp
                      </Button>
                    </div>

                    {/* Método 2: n8n */}
                    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Plug className="h-4 w-4 text-violet-400" />
                        <div>
                          <p className="text-slate-200 font-bold text-sm">Método 2 — Automação n8n</p>
                          <p className="text-slate-500 text-xs">Recebe leads via webhook do n8n. Os contatos entram direto no CRM sem passar pela lista de pendentes.</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-slate-300 text-xs">Chave de API n8n</Label>
                          <IntegrationStatusBadge status={integrationStatus(n8nApiKey)} />
                        </div>
                        <Input type="password" placeholder="••••••••••••••••"
                          className="bg-slate-900/50 border-slate-700 text-white h-10 font-mono text-sm"
                          value={n8nApiKey} onChange={(e) => setN8nApiKey(e.target.value)} />
                      </div>
                      <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-3 text-xs text-slate-500 space-y-1">
                        <p className="font-bold text-slate-400">Endpoint do webhook n8n:</p>
                        <p className="font-mono text-[11px] text-violet-300 break-all">POST {whatsappWebhookUrl.trim() || "http://seu-vps.com:3001"}/api/webhook/n8n</p>
                        <p>Campos obrigatórios: <span className="font-mono text-slate-300">name</span>, <span className="font-mono text-slate-300">phone</span></p>
                      </div>
                      {n8nError && <p className="text-xs text-red-400">{n8nError}</p>}
                      <Button type="button" onClick={handleSaveN8n} disabled={n8nLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 font-bold text-sm">
                        {n8nLoading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                        Salvar Chave n8n
                      </Button>
                    </div>
                  </div>
                  {integrationsError && <p className="text-sm text-red-400 font-medium">{integrationsError}</p>}

                  {/* Gerador de Link de Anúncio */}
                  <div className="border-t border-slate-700 pt-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-emerald-400" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Gerador de Link de Anúncio</p>
                    </div>
                    <p className="text-xs text-slate-500 -mt-2">
                      Gera o link intermediário que captura UTMs antes de redirecionar para o WhatsApp.
                      Use no campo "URL do site" dos seus anúncios.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 col-span-2">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-slate-300 text-xs">Número do WhatsApp (com DDI)</Label>
                          <FieldInfo text="Número completo com código do país e DDD, sem espaços ou símbolos. Ex: 5511999999999 (55 = Brasil, 11 = SP)." />
                        </div>
                        <Input placeholder="5511999999999" className="bg-slate-900/50 border-slate-700 text-white h-10 font-mono text-sm"
                          value={genPhone} onChange={e => setGenPhone(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-slate-300 text-xs">Fonte (utm_source)</Label>
                          <FieldInfo text="De onde vem o clique. Identifica a plataforma do anúncio: google, facebook, instagram, etc." />
                        </div>
                        <select value={genSource} onChange={e => setGenSource(e.target.value)}
                          className="w-full h-10 rounded-md bg-slate-900/50 border border-slate-700 text-white text-sm px-3">
                          <option value="google">google</option>
                          <option value="facebook">facebook</option>
                          <option value="instagram">instagram</option>
                          <option value="tiktok">tiktok</option>
                          <option value="outro">outro</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-slate-300 text-xs">Mídia (utm_medium)</Label>
                          <FieldInfo text="Tipo de mídia usada. 'cpc' = custo por clique (padrão para Google Ads e Meta Ads). Outros: cpm, email, social." />
                        </div>
                        <Input placeholder="cpc" className="bg-slate-900/50 border-slate-700 text-white h-10 text-sm"
                          value={genMedium} onChange={e => setGenMedium(e.target.value)} />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-slate-300 text-xs">Campanha (utm_campaign)</Label>
                          <FieldInfo text="Nome da campanha no gerenciador de anúncios. Use o mesmo nome para cruzar os dados. Ex: promo-maio, lancamento-produto." />
                        </div>
                        <Input placeholder="nome-da-campanha" className="bg-slate-900/50 border-slate-700 text-white h-10 text-sm"
                          value={genCampaign} onChange={e => setGenCampaign(e.target.value)} />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-slate-300 text-xs">Variação do anúncio (utm_content)</Label>
                          <FieldInfo text="Opcional. Identifica qual criativo ou versão do anúncio gerou o clique. Útil para testes A/B. Ex: banner-azul, video-v2." />
                        </div>
                        <Input placeholder="anuncio-v1" className="bg-slate-900/50 border-slate-700 text-white h-10 text-sm"
                          value={genContent} onChange={e => setGenContent(e.target.value)} />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-slate-300 text-xs">Mensagem pré-preenchida</Label>
                          <FieldInfo text="Opcional. Texto que aparece digitado automaticamente quando o usuário abre o WhatsApp. O usuário pode editar antes de enviar." />
                        </div>
                        <Input placeholder="Olá, vim pelo anúncio!" className="bg-slate-900/50 border-slate-700 text-white h-10 text-sm"
                          value={genMsg} onChange={e => setGenMsg(e.target.value)} />
                      </div>
                    </div>
                    {generatedLink ? (
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs">Link gerado</Label>
                        <div className="flex gap-2">
                          <div className="flex-1 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-[11px] font-mono text-emerald-300 break-all leading-relaxed">
                            {generatedLink}
                          </div>
                          <Button type="button" size="icon" onClick={handleCopy}
                            className="shrink-0 h-auto bg-emerald-600 hover:bg-emerald-500 border-0">
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600 text-center py-1">Preencha o número para gerar o link.</p>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

          </div>

        </div>

        {/* Botao Voltar */}
        <Button className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white h-11"
          onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Dashboard
        </Button>

      </div>
    </div>
  );
}
