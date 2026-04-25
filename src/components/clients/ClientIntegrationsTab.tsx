import { useClientIntegrations } from "@/hooks/useHubPerformance";
import { useOrganizationData } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Globe, Lock, Copy, Check, ExternalLink, Mail, RefreshCcw, BarChart3, MessageCircle, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { AdIntegrationDialog } from "@/components/integrations/AdIntegrationDialog";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendEmail } from "@/lib/email-service";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function SyncStatusBadge({ status, lastSyncAt, records, error }: { status?: string | null; lastSyncAt?: string | null; records?: number | null; error?: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!status || status === 'pending') {
    return <Badge className="bg-slate-100 text-slate-500 text-xs">Nunca sincronizado</Badge>;
  }
  if (status === 'syncing') {
    return <Badge className="bg-blue-100 text-blue-700 text-xs flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Sincronizando...</Badge>;
  }
  if (status === 'error') {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1 w-fit">
          <AlertCircle className="h-3 w-3" />Erro na sync
        </Badge>
        {error && (
          <div className="max-w-[260px]">
            <p
              onClick={() => setExpanded(v => !v)}
              className={`text-[10px] text-red-500 cursor-pointer ${expanded ? 'whitespace-normal break-words' : 'truncate'}`}
            >
              {error}
            </p>
          </div>
        )}
      </div>
    );
  }
  if (status === 'success' && lastSyncAt) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="bg-emerald-100 text-emerald-700 text-xs flex items-center gap-1 w-fit">
          <CheckCircle2 className="h-3 w-3" />
          {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: ptBR })}
        </Badge>
        {records != null && records > 0 && (
          <span className="text-[10px] text-muted-foreground">{records} registros</span>
        )}
      </div>
    );
  }
  return null;
}

export function ClientIntegrationsTab({ organizationId, clientId }: { organizationId: string, clientId: string }) {
  const { data: integrations = [], isLoading, remove, triggerSync } = useClientIntegrations(organizationId, clientId);
  const { data: organization } = useOrganizationData(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [platform, setPlatform] = useState<'meta' | 'google' | null>(null);

  // Reset sync_status preso em 'syncing' — acontece quando o workflow falhou e o usuário recarregou a página
  useEffect(() => {
    const staleIntegrations = (integrations as any[]).filter(i => {
      if (i.sync_status !== 'syncing') return false;
      if (!i.updated_at) return true;
      const updatedAt = new Date(i.updated_at).getTime();
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      return updatedAt < twoMinutesAgo; // preso há mais de 2 minutos
    });
    if (staleIntegrations.length === 0) return;
    staleIntegrations.forEach(async (i: any) => {
      await supabase
        .from("client_integrations")
        .update({ sync_status: "error", sync_error: "Sync interrompido — tente novamente." })
        .eq("id", i.id);
    });
  }, [integrations]);
  
  // Dashboard Externo
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [savingDashboard, setSavingDashboard] = useState(false);
  const [generatingPassword, setGeneratingPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dashPerformance, setDashPerformance] = useState(true);
  const [dashAtendimento, setDashAtendimento] = useState(false);
  const [c8ControlEnabled, setC8ControlEnabled] = useState(false);

  useEffect(() => {
    const fetchClient = async () => {
      const { data } = await supabase
        .from("clients")
        .select("name, company, email, dashboard_slug, metadata")
        .eq("id", clientId)
        .single();
      
      if (data) {
        // Se não houver slug, preenche com o nome da empresa/cliente automaticamente
        const autoSlug = (data.company || data.name || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
          
        setSlug(data.dashboard_slug || autoSlug);
        setPassword((data.metadata as any)?.dashboard_password || "");
        setEmail(data.email || "");
        setDashPerformance((data.metadata as any)?.dashboard_performance ?? true);
        setDashAtendimento((data.metadata as any)?.dashboard_atendimento ?? false);
        setC8ControlEnabled(!!(data as any).c8_control_enabled);
      }
    };
    fetchClient();
  }, [clientId]);

  const handleSaveDashboard = async () => {
    setSavingDashboard(true);
    try {
      const { data: client } = await supabase
        .from("clients")
        .select("metadata")
        .eq("id", clientId)
        .single();

      const updatedMetadata = {
        ...(client?.metadata as any || {}),
        dashboard_password: password.trim(),
        dashboard_performance: dashPerformance,
        dashboard_atendimento: dashAtendimento,
      };

      const { error } = await supabase
        .from("clients")
        .update({ 
          dashboard_slug: slug.trim() || null,
          metadata: updatedMetadata 
        })
        .eq("id", clientId);

      if (error) throw error;
      toast.success("Configurações do dashboard atualizadas!");
    } catch (err) {
      toast.error("Erro ao salvar configurações do dashboard.");
    } finally {
      setSavingDashboard(false);
    }
  };

  const handleGenerateTempPassword = async () => {
    if (!email) {
      toast.error("O cliente precisa de um e-mail cadastrado.");
      return;
    }

    setGeneratingPassword(true);
    try {
      // Gera senha temporária de 8 caracteres
      const tempPassword = Math.random().toString(36).slice(-8);
      
      // Busca os dados completos do cliente, incluindo seu organization_id
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("organization_id, metadata")
        .eq("id", clientId)
        .single();

      if (clientError || !client) throw clientError || new Error("Cliente não encontrado.");

      const updatedMetadata = {
        ...(client.metadata as any || {}),
        dashboard_password: tempPassword,
        is_temp_password: true
      };

      const { error: updateError } = await supabase
        .from("clients")
        .update({ 
          metadata: updatedMetadata 
        })
        .eq("id", clientId);

      if (updateError) throw updateError;

      setPassword(tempPassword);
      
      // Envio de e-mail via Resend, usando a organização DO CLIENTE
      const dashboardUrl = `${window.location.origin}/public/dashboard/${slug}`;
      const orgName = organization?.name || "Maestria CRM"; // Usamos o nome da org do admin logado para o texto, mas a chave da org do cliente
      
      const emailResult = await sendEmail(client.organization_id, { // <-- AQUI ESTÁ A CORREÇÃO
        to: email,
        subject: `Seu Acesso ao Dashboard de Performance - ${orgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #2D8CC7;">Seu Acesso ao Dashboard</h2>
            <p>Olá! Seu acesso ao Dashboard de Performance da <strong>${orgName}</strong> foi gerado.</p>
            <p><strong>Sua Senha Temporária:</strong> <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code></p>
            <div style="margin: 30px 0;">
              <a href="${dashboardUrl}" style="background: #2D8CC7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Acessar Meu Dashboard
              </a>
            </div>
            <p style="font-size: 12px; color: #64748b;">Por segurança, você deverá trocar esta senha no seu primeiro acesso.</p>
          </div>
        `
      });

      if (emailResult.success) {
        toast.success(`Senha temporária gerada e enviada para ${email}`);
      } else {
        toast.warning(`Senha gerada: ${tempPassword}, mas houve um erro ao enviar o e-mail: ${emailResult.error}`);
      }

    } catch (err) {
      toast.error("Erro ao gerar senha temporária.");
    } finally {
      setGeneratingPassword(false);
    }
  };

  const copyUrl = () => {
    if (!slug) return;
    const url = `${window.location.origin}/public/dashboard/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("URL do Dashboard copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestDashboard = async () => {
    if (!slug) return;
    const cleanSlug = slug.trim();
    
    try {
      const { data, error } = await supabase.rpc('get_client_by_slug', { p_slug: cleanSlug });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        toast.success("Link validado! O dashboard está acessível.", {
          description: `Identificado: ${data[0].name} (${data[0].company})`,
          action: {
            label: "Abrir",
            onClick: () => window.open(`/public/dashboard/${cleanSlug}`, "_blank")
          }
        });
      } else {
        toast.error("Dashboard não encontrado no banco de dados.", {
          description: "Certifique-se de que você clicou em SALVAR antes de testar."
        });
      }
    } catch (err: any) {
      console.error("[Test] Erro ao validar slug:", err);
      toast.error("Erro ao validar link. Verifique o console.");
    }
  };

  const handleOpenConnect = (p: 'meta' | 'google') => {
    setPlatform(p);
    setModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja remover a integração com ${name}?`)) return;
    try {
      await remove.mutateAsync(id);
      toast.success(`Integração com ${name} removida.`);
    } catch (error) {
      toast.error("Erro ao remover integração");
    }
  };

  const metaIntegration = integrations.find(i => i.platform === 'meta');
  const googleIntegration = integrations.find(i => i.platform === 'google');

  return (
    <div className="space-y-8">
      {/* Dashboard Externo */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Dashboard Externo do Cliente
          </h3>
          <p className="text-sm text-slate-500">Configure o acesso exclusivo para o seu cliente visualizar os resultados.</p>
        </div>

        <div className="p-6 border rounded-xl bg-slate-50/50 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Slug da URL (Identificador Único)</Label>
              <div className="flex items-center gap-2">
                <Input 
                  value={slug} 
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="ex: cliente-abc-2026"
                  className="bg-white"
                />
                <Button size="icon" variant="outline" onClick={copyUrl} disabled={!slug} title="Copiar URL">
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={handleTestDashboard} disabled={!slug} title="Testar Acesso">
                  <ExternalLink className="h-4 w-4 text-primary" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">Este slug é preenchido automaticamente com o nome da empresa.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Acesso por Senha</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    type="text"
                    value={password ? "••••••••" : "Nenhuma senha gerada"}
                    readOnly
                    className="bg-slate-100 pl-10 cursor-not-allowed"
                  />
                </div>
                <Button 
                  onClick={handleGenerateTempPassword} 
                  disabled={generatingPassword}
                  variant="secondary"
                  className="gap-2"
                >
                  {generatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Gerar Senha
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">Gera uma senha temporária e envia para o e-mail do cliente.</p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Módulos do Dashboard</Label>
            <p className="text-[11px] text-muted-foreground">Selecione quais dashboards estarão disponíveis para o cliente.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Performance */}
              <button
                type="button"
                onClick={() => setDashPerformance(v => !v)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  dashPerformance
                    ? "border-primary bg-primary/5"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${dashPerformance ? "bg-primary text-white" : "bg-slate-100 text-slate-400"}`}>
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${dashPerformance ? "text-primary" : "text-slate-600"}`}>Dashboard de Performance</p>
                  <p className="text-[10px] text-muted-foreground">Métricas de campanhas e resultados</p>
                </div>
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${dashPerformance ? "border-primary bg-primary" : "border-slate-300"}`}>
                  {dashPerformance && <Check className="h-3 w-3 text-white" />}
                </div>
              </button>

              {/* Atendimento */}
              <button
                type="button"
                onClick={() => setDashAtendimento(v => !v)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  dashAtendimento
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${dashAtendimento ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${dashAtendimento ? "text-emerald-700" : "text-slate-600"}`}>Dashboard de Atendimento</p>
                  <p className="text-[10px] text-muted-foreground">KPIs de conversas automatizadas</p>
                </div>
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${dashAtendimento ? "border-emerald-500 bg-emerald-500" : "border-slate-300"}`}>
                  {dashAtendimento && <Check className="h-3 w-3 text-white" />}
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            {slug && (
              <Button variant="link" className="text-primary gap-2 h-auto p-0" asChild>
                <a href={`/public/dashboard/${slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Visualizar Dashboard como Cliente
                </a>
              </Button>
            )}
            <Button onClick={handleSaveDashboard} disabled={savingDashboard}>
              {savingDashboard && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Configurações de Acesso
            </Button>
          </div>
        </div>
      </div>

      <div className="border-t pt-8">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Integrações de Marketing</h3>
          <p className="text-sm text-slate-500">Vincule as contas de anúncios do cliente para buscar métricas automáticas.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 mt-6">
          {/* Meta Ads */}
          <div className="p-4 border rounded-xl flex items-center justify-between bg-white shadow-sm group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg">M</div>
              <div>
                <p className="font-bold text-slate-800">Meta Ads (Facebook/Instagram)</p>
                <p className="text-sm text-slate-500">
                  {metaIntegration ? `ID: ${metaIntegration.account_id}` : "Não conectado"}
                </p>
                {metaIntegration && (
                  <div className="mt-1">
                    <SyncStatusBadge
                      status={metaIntegration.sync_status}
                      lastSyncAt={metaIntegration.last_sync_at}
                      records={metaIntegration.last_sync_records}
                      error={metaIntegration.sync_error}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {metaIntegration && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 gap-1"
                    disabled={triggerSync.isPending || metaIntegration.sync_status === 'syncing'}
                    onClick={() => {
                      triggerSync.mutate(metaIntegration.id, {
                        onSuccess: () => toast.success("Sincronização iniciada!"),
                        onError: (e) => toast.error(`Erro: ${(e as Error).message}`),
                      });
                    }}
                    title="Sincronizar agora"
                  >
                    {triggerSync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                    Sync
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-red-500"
                    onClick={() => handleDelete(metaIntegration.id, 'Meta Ads')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                variant={metaIntegration ? "outline" : "default"}
                size="sm"
                onClick={() => handleOpenConnect('meta')}
              >
                {metaIntegration ? "Editar" : "Conectar Conta"}
              </Button>
            </div>
          </div>

          {/* Google Ads */}
          <div className="p-4 border rounded-xl flex items-center justify-between bg-white shadow-sm group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold text-lg">G</div>
              <div>
                <p className="font-bold text-slate-800">Google Ads</p>
                <p className="text-sm text-slate-500">
                  {googleIntegration ? `ID: ${googleIntegration.account_id}` : "Não conectado"}
                </p>
                {googleIntegration && (
                  <div className="mt-1">
                    <SyncStatusBadge
                      status={googleIntegration.sync_status}
                      lastSyncAt={googleIntegration.last_sync_at}
                      records={googleIntegration.last_sync_records}
                      error={googleIntegration.sync_error}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {googleIntegration && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-amber-600 hover:text-amber-700 gap-1"
                    disabled={triggerSync.isPending || googleIntegration.sync_status === 'syncing'}
                    onClick={() => {
                      triggerSync.mutate(googleIntegration.id, {
                        onSuccess: () => toast.success("Sincronização iniciada!"),
                        onError: (e) => toast.error(`Erro: ${(e as Error).message}`),
                      });
                    }}
                    title="Sincronizar agora"
                  >
                    {triggerSync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                    Sync
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-red-500"
                    onClick={() => handleDelete(googleIntegration.id, 'Google Ads')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                variant={googleIntegration ? "outline" : "default"}
                size="sm"
                onClick={() => handleOpenConnect('google')}
              >
                {googleIntegration ? "Editar" : "Conectar Conta"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AdIntegrationDialog 
        open={modalOpen}
        onOpenChange={setModalOpen}
        organizationId={organizationId}
        clientId={clientId}
        platform={platform}
        existingIntegration={integrations.find(i => i.platform === platform)}
      />
    </div>
  );
}
