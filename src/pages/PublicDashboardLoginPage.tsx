import { useState, useEffect } from "react";
import { logger } from "@/lib/logger";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Activity, Lock, User, Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { sendEmail } from "@/lib/email-service";

type DashboardClientRow = {
  id: string;
  name: string;
  company: string | null;
  dashboard_slug: string;
  organization_id: string;
  has_temp_password: boolean;
  favicon_url: string | null;
  dashboard_performance: boolean;
  dashboard_atendimento: boolean;
  show_ia_content: boolean;
  client_supabase_url: string | null;
  client_supabase_anon_key: string | null;
  conversion_metrics?: { lead_fields?: string[]; sale_fields?: string[] } | null;
  dashboard_kpis?: string[] | null;
  geral_dashboard_cards?: string[] | null;
};

export function PublicDashboardLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Força tema dark — página pública, sem UserPreferencesProvider
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.removeAttribute("data-sidebar-color");
  }, []);
  
  const [view, setView] = useState<'login' | 'recovery' | 'first-access' | 'success'>('login');
  const [loading, setLoading] = useState(false);
  
  // Login / First Access
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Recovery
  const [email, setEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = slug?.trim();
    if (!cleanSlug) {
      logger.error("Slug ausente na URL", { slug }, 'PUBLIC_DASHBOARD');
      toast.error("URL inválida.");
      return;
    }
    setLoading(true);

    try {
      logger.info("Buscando dashboard para o slug", { slug: cleanSlug }, 'PUBLIC_DASHBOARD');
      // 1. Busca info básica do cliente via RPC (Bypassa RLS e não expõe password)
      const { data: clients, error: fetchError } = await supabase
        .rpc('get_client_by_slug', { p_slug: cleanSlug });

      if (fetchError) {
        logger.error("Erro ao buscar dashboard via RPC", { error: fetchError.message, slug: cleanSlug }, 'PUBLIC_DASHBOARD');
        toast.error(`Erro de conexão com o banco: ${fetchError.message}`);
        setLoading(false);
        return;
      }

      if (!clients || clients.length === 0) {
        logger.warn("Nenhum cliente encontrado para o slug", { slug: cleanSlug }, 'PUBLIC_DASHBOARD');
        toast.error("Dashboard não encontrado. Verifique se o slug está correto no cadastro do cliente.");
        setLoading(false);
        return;
      }

      const client = clients[0] as DashboardClientRow;
      logger.info("Cliente encontrado", { 
        clientName: client.name,
        clientId: client.id 
      }, 'PUBLIC_DASHBOARD');

      // 2. Valida a senha via RPC (Seguro)
      const { data: isValid, error: authError } = await supabase
        .rpc('validate_client_dashboard_password', { 
          p_slug: cleanSlug, 
          p_password: password 
        });
      
      if (authError) {
        logger.error("Erro ao validar senha via RPC", { error: authError.message, clientId: client.id }, 'PUBLIC_DASHBOARD');
        toast.error("Erro ao validar acesso.");
        setLoading(false);
        return;
      }

      if (!isValid) {
        toast.error("Senha incorreta.");
        setLoading(false);
        return;
      }

      // Se for senha temporária, obriga a troca
      if (client.has_temp_password) {
        setView('first-access');
        setLoading(false);
        return;
      }

      completeLogin(client);
    } catch (err) {
      toast.error("Erro ao validar acesso.");
    } finally {
      setLoading(false);
    }
  };

  const handleFirstAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      // Busca o ID do cliente via RPC (já que SELECT direto falha por RLS)
      const { data: clients } = await supabase.rpc('get_client_by_slug', { p_slug: slug });
      const client = (clients?.[0] as DashboardClientRow | undefined);

      if (!client) throw new Error("Cliente não encontrado.");

      // Atualiza a senha via RPC segura para bypassar RLS
      const { error } = await supabase.rpc('update_client_dashboard_password', {
        p_client_id: client.id,
        p_new_password: newPassword
      });

      if (error) throw error;

      toast.success("Senha atualizada com sucesso!");
      completeLogin(client);
    } catch (err) {
      toast.error("Erro ao atualizar senha.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = slug?.trim();
    if (!cleanSlug) {
      toast.error("URL inválida.");
      return;
    }
    setLoading(true);
    try {
      const newTempPassword = Math.random().toString(36).slice(-8);
      
      // Busca e atualiza o cliente via RPC segura (Bypass RLS)
      const { data: recoveryData, error: recoveryError } = await supabase
        .rpc('recover_client_password', {
          p_slug: cleanSlug,
          p_email: email.trim(),
          p_new_temp_password: newTempPassword
        });

      if (recoveryError || !recoveryData || recoveryData.length === 0) {
        // Por segurança, não confirmamos se o e-mail existe se não bater com o slug
        toast.success("Se o e-mail estiver correto, você receberá as instruções em breve.");
        setView('login');
        return;
      }

      const organizationId = recoveryData[0].organization_id;

      // Busca o nome da organização via RPC seguro
      const { data: orgName, error: orgError } = await supabase
        .rpc('get_organization_name', { p_org_id: organizationId });
      
      const finalOrgName = orgName || "Maestria CRM";

      // Envio de e-mail via Resend
      const emailResult = await sendEmail(organizationId, {
        to: email,
        subject: `Recuperação de Acesso - ${finalOrgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #2D8CC7;">Sua Nova Senha</h2>
            <p>Olá! Seu acesso ao Dashboard de Performance da <strong>${finalOrgName}</strong> foi recuperado.</p>
            <p><strong>Sua Nova Senha Temporária:</strong> <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${newTempPassword}</code></p>
            <p style="margin: 20px 0; font-size: 12px; color: #64748b;">
              Lembre-se que você precisará trocar esta senha no seu próximo acesso por segurança.
            </p>
          </div>
        `
      });

      if (emailResult.success) {
        toast.success(`Nova senha enviada para ${email}`);
      } else {
        toast.warning(`Senha resetada, mas houve um erro no envio do e-mail: ${emailResult.error}`);
      }
      
      setView('login');
    } catch (err) {
      toast.error("Erro ao processar recuperação.");
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (client: DashboardClientRow) => {
    localStorage.setItem(`client_auth_${slug}`, JSON.stringify({
      id: client.id,
      organization_id: client.organization_id,
      name: client.name,
      company: client.company,
      favicon_url: client.favicon_url ?? null,
      authenticated: true,
      show_ia_content: client.show_ia_content ?? false,
      client_supabase_url: client.client_supabase_url ?? null,
      client_supabase_anon_key: client.client_supabase_anon_key ?? null,
      metadata: {
        dashboard_performance: client.dashboard_performance ?? true,
        dashboard_atendimento: client.dashboard_atendimento ?? false,
        ...(client.conversion_metrics && Object.keys(client.conversion_metrics).length > 0
          ? { conversion_metrics: client.conversion_metrics }
          : {}),
        ...(Array.isArray(client.dashboard_kpis) && client.dashboard_kpis.length > 0
          ? { dashboard_kpis: client.dashboard_kpis }
          : {}),
        ...(Array.isArray(client.geral_dashboard_cards) && client.geral_dashboard_cards.length > 0
          ? { geral_dashboard_cards: client.geral_dashboard_cards }
          : {}),
      },
    }));
    navigate(`/public/dashboard/${slug}`);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-16 w-16 bg-[#2D8CC7] rounded-2xl flex items-center justify-center shadow-xl shadow-[#2D8CC7]/20 mb-4">
            <Activity className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Dashboard de Performance</h1>
          <p className="text-slate-400 font-medium italic">Powered by Agência C8</p>
        </div>

        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#2D8CC7]">
          {view === 'login' && (
            <>
              <CardHeader>
                <CardTitle className="text-white">Acesso ao Dashboard</CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Informe sua senha para visualizar os resultados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Senha de Acesso</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 h-12 font-bold" disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Entrar no Dashboard"}
                  </Button>
                </form>
              </CardContent>
              <CardFooter>
                <Button variant="link" className="text-slate-500 text-xs w-full" onClick={() => setView('recovery')}>
                  Esqueceu sua senha? Recuperar acesso
                </Button>
              </CardFooter>
            </>
          )}

          {view === 'recovery' && (
            <>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => setView('login')}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  Recuperar Senha
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Enviaremos uma nova senha temporária para o seu e-mail cadastrado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRecovery} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">E-mail Cadastrado</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input 
                        type="email" 
                        placeholder="seu@email.com" 
                        className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 h-12 font-bold" disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Enviar Nova Senha"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {view === 'first-access' && (
            <>
              <CardHeader>
                <CardTitle className="text-white">Primeiro Acesso</CardTitle>
                <CardDescription className="text-slate-400 text-xs font-bold text-orange-400">
                  Por segurança, você deve definir uma senha definitiva agora.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFirstAccess} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Nova Senha (Mín. 8 caracteres)</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      className="bg-slate-900/50 border-slate-700 text-white h-12"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Confirmar Nova Senha</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      className="bg-slate-900/50 border-slate-700 text-white h-12"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 font-bold" disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Definir Senha e Entrar"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        <footer className="text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
          <p>&copy; {new Date().getFullYear()} Agência C8. Todos os Direitos Reservados.</p>
        </footer>
      </div>
    </div>
  );
}
