import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Activity, Lock, Loader2, Mail } from "lucide-react";
import { supabaseAuth } from "@/lib/supabase-auth";

export function PublicDashboardLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError("E-mail ou senha incorretos.");
        return;
      }
      navigate("/dashboard");
    } catch {
      setError("E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-16 w-16 bg-[#7C3AED] rounded-2xl flex items-center justify-center shadow-xl shadow-[#7C3AED]/20 mb-4">
            <Activity className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            C8 Control
          </h1>
          <p className="text-slate-400 font-medium italic">
            Powered by Agência C8
          </p>
        </div>

        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden border-t-4 border-t-[#7C3AED]">
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
              {error && (
                <p className="text-red-400 text-sm font-medium">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-12 font-bold"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  "Entrar no Dashboard"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <footer className="text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
          <p>
            &copy; {new Date().getFullYear()} Agência C8. Todos os Direitos
            Reservados.
          </p>
        </footer>
      </div>
    </div>
  );
}
