import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock, Loader2, Plug, RefreshCw, Smartphone, User, Link2, Copy, Check, Info } from "lucide-react";
import { supabaseCrm } from "@/lib/supabase";
import { supabaseAuth } from "@/lib/supabase-auth";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { IntegrationStatusBadge, IntegrationStatus } from "@/components/crm/IntegrationStatusBadge";
import { OAuthIntegrations } from "@/components/integrations/OAuthIntegrations";
import { KpiList } from "@/components/kpi/KpiList";
import { KpiHistoryTable } from "@/components/kpi/KpiHistoryTable";
import { QRCodeSVG } from "qrcode.react";
import { SecretQuestionForm } from "@/components/auth/SecretQuestionForm";
import { useAuditLog } from "@/hooks/useAuditLog";

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
  const { session, tenantId, role, isSupport, loading: authLoading } = useAuth();
  const { log } = useAuditLog();

  // clientId: para suporte usa o tenant selecionado, para usuário normal usa tenantId do JWT
  const clientId = isSupport
    ? (sessionStorage.getItem("support_selected_tenant_id") ?? "")
    : (tenantId ?? "");

  const userEmail = session?.user?.email ?? "";

  // Nome de exibicao
  const [displayName, setDisplayName] = useState("");
  const [displayNameLoading, setDisplayNameLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [clientName, setClientName] = useState<string>("");

  // Alterar senha
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showSecretQuestionDialog, setShowSecretQuestionDialog] = useState(false);

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

  // Redirecionar se não autenticado
  useEffect(() => {
    if (!authLoading && !session) navigate("/login");
  }, [authLoading, session, navigate]);

  // Carregar metadata do cliente do CRM_DB
  useEffect(() => {
    if (!clientId) return;
    supabaseCrm
      .from("clients")
      .select("name, metadata")
      .eq("tenant_id", clientId)
      .limit(1)
      .single()
      .then(({ data }) => {
        const meta = data?.metadata ?? {};
        setGtmId(meta.gtm_id ?? "");
        setMetaPixelId(meta.meta_pixel_id ?? "");
        setN8nApiKey(meta.n8n_api_key ?? "");
        setWhatsappWebhookUrl(meta.whatsapp_webhook_url ?? "");
        setTabPerformance(meta.dashboard_performance !== false);
        setTabAtendimento(meta.dashboard_atendimento === true);
        setTabCrm(meta.dashboard_crm === true);
        setDisplayName(meta.display_name ?? "");
        setAvatarUrl(meta.avatar_url ?? null);
        setClientName(meta.display_name || data?.name || "");

        const webhookUrl: string = meta.whatsapp_webhook_url ?? "";
        if (webhookUrl.trim()) {
          fetch(`${webhookUrl.replace(/\/$/, "")}/api/status`)
            .then(res => res.json())
            .then(d => {
              const valid: IntegrationStatus[] = ["conectado", "aguardando_qr", "desconectado", "inativo"];
              setWhatsappStatus(valid.includes(d?.status) ? d.status : "desconectado");
            })
            .catch(() => setWhatsappStatus("desconectado"));
        }
      });
  }, [clientId]);

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
      const { data: existing } = await supabaseCrm
        .from("clients").select("metadata").eq("tenant_id", clientId).single();
      const merged = { ...(existing?.metadata ?? {}), display_name: displayName.trim() };
      const { error } = await supabaseCrm
        .from("clients").update({ metadata: merged }).eq("tenant_id", clientId);
      if (error) throw error;
      setClientName(displayName.trim() || clientName);
      toast.success("Nome de exibição atualizado!");
      log({ action: "Nome de exibição atualizado", category: "config", details: { display_name: displayName.trim() } });
    } catch {
      toast.error("Erro ao salvar nome de exibição.");
    } finally {
      setDisplayNameLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 2 MB."); return; }
    setAvatarLoading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `avatars/${clientId}.${ext}`;
      const { error: upErr } = await supabaseCrm.storage
        .from("client-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabaseCrm.storage.from("client-assets").getPublicUrl(path);
      const url = urlData.publicUrl + `?t=${Date.now()}`;
      const { data: existing } = await supabaseCrm
        .from("clients").select("metadata").eq("tenant_id", clientId).single();
      const merged = { ...(existing?.metadata ?? {}), avatar_url: url };
      await supabaseCrm.from("clients").update({ metadata: merged }).eq("tenant_id", clientId);
      setAvatarUrl(url);
      toast.success("Foto de perfil atualizada!");
    } catch (err: any) {
      toast.error(`Erro ao enviar foto: ${err?.message ?? "tente novamente"}`);
    } finally {
      setAvatarLoading(false);
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
      const { error } = await supabaseAuth.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      log({ action: "Senha alterada", category: "config" });
      setNewPassword("");
      setConfirmPassword("");
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
      const { error } = await supabaseCrm
        .from("clients")
        .update({
          metadata: {
            gtm_id: gtmId.trim(),
            meta_pixel_id: metaPixelId.trim(),
            n8n_api_key: n8nApiKey.trim(),
            whatsapp_webhook_url: whatsappWebhookUrl.trim(),
          },
        })
        .eq("tenant_id", clientId);
      if (error) throw error;
      toast.success("Integrações salvas com sucesso!");
    } catch {
      setIntegrationsError("Erro inesperado ao salvar integrações. Tente novamente.");
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const saveIntegrationFields = async (
    fields: Record<string, string>,
    setLoading: (v: boolean) => void,
    setError: (v: string | null) => void,
    successMsg: string
  ) => {
    setError(null);
    setLoading(true);
    try {
      // Merge fields into existing metadata
      const { data: existing } = await supabaseCrm
        .from("clients")
        .select("metadata")
        .eq("tenant_id", clientId)
        .single();
      const merged = { ...(existing?.metadata ?? {}), ...fields };
      const { error } = await supabaseCrm
        .from("clients")
        .update({ metadata: merged })
        .eq("tenant_id", clientId);
      if (error) throw error;
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
    if (!genPhone.trim() || !clientId) return "";
    const base = `${window.location.origin}/wa`;
    const p = new URLSearchParams();
    p.set("to", genPhone.trim().replace(/\D/g, ""));
    p.set("cid", clientId);
    if (genSource)   p.set("utm_source", genSource);
    if (genMedium)   p.set("utm_medium", genMedium);
    if (genCampaign) p.set("utm_campaign", genCampaign);
    if (genContent)  p.set("utm_content", genContent);
    if (genMsg)      p.set("msg", genMsg);
    return `${base}?${p.toString()}`;
  }, [genPhone, genSource, genMedium, genCampaign, genContent, genMsg, clientId]);

  const handleCopy = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0F172A]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
    </div>
  );

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-10 w-10 rounded-xl object-cover shadow-lg" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-[#7C3AED] flex items-center justify-center text-white font-black text-lg shadow-lg">
                {(clientName || userEmail).charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">Perfil e Configurações</h1>
              <p className="text-slate-400 text-sm">{clientName || userEmail}</p>
            </div>
          </div>
        </div>

        {/* Grid 2 colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

          {/* Coluna esquerda */}
          <div className="space-y-6 flex flex-col">

            {/* Nome de Exibição + Foto de Perfil */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-slate-500">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-400" />
                  Identidade Visual
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Nome e foto exibidos no dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Foto de perfil */}
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-xl object-cover border-2 border-slate-700 shadow-lg" />
                    ) : (
                      <div className="h-16 w-16 rounded-xl bg-slate-700 flex items-center justify-center text-slate-400 text-2xl font-black border-2 border-slate-600">
                        {(clientName || userEmail).charAt(0).toUpperCase()}
                      </div>
                    )}
                    {avatarLoading && (
                      <div className="absolute inset-0 rounded-xl bg-black/60 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-slate-300 text-sm font-bold">Foto de Perfil</p>
                    <p className="text-slate-500 text-xs">JPG, PNG ou WebP. Máx. 2 MB.</p>
                    <label className="cursor-pointer inline-flex items-center gap-2 text-xs font-bold text-[#7C3AED] hover:text-[#7C3AED]/80 transition-colors">
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={handleAvatarUpload} disabled={avatarLoading} />
                      {avatarLoading ? "Enviando..." : avatarUrl ? "Trocar foto" : "Enviar foto"}
                    </label>
                  </div>
                </div>

                {/* Nome de exibição */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Nome de Exibição</Label>
                  <Input type="text" placeholder="Ex: Empresa XYZ"
                    className="bg-slate-900/50 border-slate-700 text-white h-11"
                    value={displayName} onChange={e => setDisplayName(e.target.value)} />
                  <p className="text-xs text-slate-500">Se vazio, usa o nome do cadastro vindo do Maestr.IA.</p>
                </div>
                <Button type="button" className="w-full bg-slate-600 hover:bg-slate-500 h-11 font-bold"
                  disabled={displayNameLoading} onClick={handleSaveDisplayName}>
                  {displayNameLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Salvar Nome de Exibição
                </Button>
              </CardContent>
            </Card>

            {/* Alterar Senha */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-[#7C3AED]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Lock className="h-5 w-5 text-[#7C3AED]" />
                  Alterar Senha
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Defina uma nova senha de acesso ao dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
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
                  <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-11 font-bold" disabled={passwordLoading}>
                    {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Alterar Senha
                  </Button>
                  <div className="border-t border-slate-700 pt-3">
                    <button type="button"
                      onClick={() => setShowSecretQuestionDialog(true)}
                      className="w-full flex items-center justify-between text-sm text-slate-400 hover:text-slate-200 transition-colors py-1">
                      <span className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-emerald-400" />
                        Gerenciar pergunta secreta de recuperação
                      </span>
                      <span className="text-slate-600 text-xs">→</span>
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Dialog: Pergunta Secreta */}
            {showSecretQuestionDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-[#1E293B] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-white font-black text-lg">Pergunta Secreta</h2>
                    <button onClick={() => setShowSecretQuestionDialog(false)}
                      className="text-slate-400 hover:text-white transition-colors text-xl leading-none">✕</button>
                  </div>
                  <p className="text-slate-400 text-xs">Configure ou atualize a pergunta usada para recuperar o acesso.</p>
                  <SecretQuestionForm onSaved={() => { setShowSecretQuestionDialog(false); toast.success("Pergunta secreta atualizada!"); }} />
                </div>
              </div>
            )}

            {/* Usuários do Tenant */}
            {role === "admin" && (
              <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-blue-500">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-400" />
                    Usuários
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-xs">
                    Gerencie quem tem acesso ao dashboard.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button type="button" className="w-full bg-blue-600 hover:bg-blue-700 h-11 font-bold gap-2"
                    onClick={() => navigate("/dashboard/users")}>
                    <User className="h-4 w-4" /> Gerenciar Usuários
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Abas do Dashboard */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-violet-500">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <span className="text-violet-400 text-lg">&#9638;</span>
                  Abas do Dashboard
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Escolha quais seções ficam visíveis no dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                <Button type="button" className="w-full bg-violet-600 hover:bg-violet-700 h-11 font-bold"
                  disabled={tabsLoading}
                  onClick={async () => {
                    if (!tabPerformance && !tabAtendimento && !tabCrm) { toast.error("Pelo menos uma aba deve estar ativa."); return; }
                    setTabsLoading(true);
                    try {
                      const { data: existing } = await supabaseCrm
                        .from("clients").select("metadata").eq("tenant_id", clientId).single();
                      const merged = {
                        ...(existing?.metadata ?? {}),
                        dashboard_performance: tabPerformance,
                        dashboard_atendimento: tabAtendimento,
                        dashboard_crm: tabCrm,
                      };
                      const { error } = await supabaseCrm
                        .from("clients").update({ metadata: merged }).eq("tenant_id", clientId);
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

            {/* KPIs — Cadastro (flex-1 para crescer e preencher coluna) */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-[#7C3AED] flex flex-col flex-1">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <svg className="h-5 w-5 text-[#7C3AED]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Indicadores de Performance (KPIs)
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Cadastre KPIs com meta mensal. A meta é o valor alvo para cada mês — o dashboard mostra o progresso automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <KpiList clientId={clientId} />
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
                  {/* Google + Meta OAuth */}
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Google Analytics & Ads / Meta Ads</p>
                    <OAuthIntegrations clientId={clientId} />
                  </div>

                  {/* GTM + Meta Pixel — para página intermediária de anúncios */}
                  <div className="border-t border-slate-700 pt-4 space-y-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Rastreamento — Página Intermediária</p>
                      <p className="text-xs text-slate-500">IDs usados exclusivamente na página <span className="font-mono text-violet-400">/wa</span> para disparar eventos de conversão nas plataformas de anúncios.</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-slate-300 text-xs">Google Tag Manager ID</Label>
                        <IntegrationStatusBadge status={integrationStatus(gtmId)} />
                      </div>
                      <Input type="text" placeholder="GTM-XXXXXXX"
                        className="bg-slate-900/50 border-slate-700 text-white h-10 font-mono text-sm"
                        value={gtmId} onChange={(e) => setGtmId(e.target.value)} />
                      <p className="text-[10px] text-slate-600">Formato: GTM-[A-Z0-9]+</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-slate-300 text-xs">Meta Pixel ID</Label>
                        <IntegrationStatusBadge status={integrationStatus(metaPixelId)} />
                      </div>
                      <Input type="text" placeholder="123456789012345"
                        className="bg-slate-900/50 border-slate-700 text-white h-10 font-mono text-sm"
                        value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)} />
                      <p className="text-[10px] text-slate-600">Numérico, 15 ou 16 dígitos</p>
                    </div>
                    {trackingError && <p className="text-xs text-red-400">{trackingError}</p>}
                    <Button type="button" onClick={handleSaveTracking} disabled={trackingLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 font-bold text-sm">
                      {trackingLoading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                      Salvar GTM e Meta Pixel
                    </Button>
                  </div>
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

        {/* KPIs — Resultados Mensais */}
        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl border-t-4 border-t-[#7C3AED]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <svg className="h-5 w-5 text-[#7C3AED]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
              </svg>
              Resultados Mensais dos KPIs
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Registre os resultados mensais de cada indicador. Os dados alimentam os gráficos e comparativos do dashboard de performance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KpiHistoryTable clientId={clientId} />
          </CardContent>
        </Card>

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
