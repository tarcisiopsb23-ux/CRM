import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Activity, Lock, Loader2, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type ClientRow = {
  id: string;
  name: string;
  favicon_url: string | null;
  has_temp_password: boolean;
  dashboard_performance: boolean;
  dashboard_atendimento: boolean;
  dashboard_crm: boolean;
};

export function PublicDashboardLoginPage() {
  const navigate = useNavigate();

  const [view, setView] = useState<"login" | "first-access">("login");
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");

  const [pendingClient, setPendingClient] = useState<ClientRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Busca dados públicos do cliente
      const { data: clients, error: fetchError } = await supabase.rpc("get_client_data");
      if (fetchError || !clients || clients.length === 0) {
        toast.error("Erro de conexão. Tente novamente.");
        return;
      }
      const client = clients[0] as ClientRow;

      // 2. Valida e-mail + senha (tenta dashboard_users, fallback em clients.metadata)
      const { data: userRows, error: authError } = await supabase.rpc(
        "validate_dashboard_user",
        { p_email: loginEmail.trim(), p_password: password }
      );
      if (authError) { toast.error("Erro ao validar acesso."); return; }
      if (!userRows || userRows.length === 0) { toast.error("E-mail ou senha incorretos."); return; }

      const userRow = userRows[0];

      // 3. Senha temporária → obriga troca
      if (client.has_temp_password) {
        setPendingClient(client);
        setView("first-access");
        return;
      }

      completeLogin(client, loginEmail.trim(), !!userRow.is_support);
    } catch {
      toast.error("Erro ao validar acesso.");
    } finally {
      setLoading(false);
    }
  };

  const handleFirstAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingClient) return;
    if (newPassword.length < 8) { toast.error("A senha deve ter no mínimo 8 caracteres."); return; }
    if (newPassword !== confirmPassword) { toast.error("As senhas não conferem."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.rpc("update_client_dashboard_password", {
        p_client_id: pendingClient.id,
        p_new_password: newPassword,
      });
      if (error) throw error;
      toast.success("Senha definida com sucesso!");
      completeLogin(pendingClient, loginEmail.trim());
    } catch {
      toast.error("Erro ao atualizar senha.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (_e: React.FormEvent) => {}; // removido

  const completeLogin = (client: ClientRow, email: string, isSupport = false) => {
    localStorage.setItem("client_auth", JSON.stringify({
      client_id: client.id,
      email,
      is_support: isSupport,
    }));
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-16 w-16 bg-[#7C3AED] rounded-2xl flex items-center justify-center shadow-xl shadow-[#7C3AED]/20 mb-4">
            <Activity className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">C8 Control</h1>
          <p className="text-slate-400 font-medium italic">Powered by Agência C8</p>
        </div>

        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#7C3AED]">
          {view === "login" && (
            <>
              <CardHeader>
                <CardTitle className="text-white">Acesso ao Dashboard</CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Informe seu e-mail e senha para visualizar os resultados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input type="email" placeholder="seu@email.com"
                        className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                        value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Senha de Acesso</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input type="password" placeholder="••••••••"
                        className="bg-slate-900/50 border-slate-700 text-white pl-10 h-12"
                        value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold" disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Entrar no Dashboard"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {view === "first-access" && (
            <>
              <CardHeader>
                <CardTitle className="text-white">Primeiro Acesso</CardTitle>
                <CardDescription className="text-orange-400 text-xs font-bold">
                  Por segurança, defina uma senha definitiva antes de continuar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFirstAccess} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Nova Senha (mín. 8 caracteres)</Label>
                    <Input type="password" placeholder="••••••••"
                      className="bg-slate-900/50 border-slate-700 text-white h-12"
                      value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Confirmar Nova Senha</Label>
                    <Input type="password" placeholder="••••••••"
                      className="bg-slate-900/50 border-slate-700 text-white h-12"
                      value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
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
