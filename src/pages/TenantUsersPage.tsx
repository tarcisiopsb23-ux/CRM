import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canManageRole } from "@/hooks/useAuth";
import { useTenantUsers } from "@/hooks/useTenantUsers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mail, Trash2, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function TenantUsersPage() {
  const navigate = useNavigate();
  const { tenantId, role, isSupport, loading: authLoading } = useAuth();
  const canManage = canManageRole(role, isSupport);

  // Suporte usa o tenant selecionado na sessão
  const effectiveTenantId = isSupport
    ? (sessionStorage.getItem("support_selected_tenant_id") ?? tenantId ?? undefined)
    : (tenantId ?? undefined);

  const { users, currentCount, maxUsers, planName, isLoading, inviteUser, removeUser } =
    useTenantUsers(effectiveTenantId);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; email?: string } | null>(null);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F172A]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F172A]">
        <div className="text-center space-y-3">
          <p className="text-slate-400 text-lg font-bold">Acesso restrito a administradores.</p>
          <Button
            className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 text-white font-bold"
            onClick={() => navigate("/dashboard")}
          >
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const atLimit = currentCount >= maxUsers;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteUser.mutateAsync(inviteEmail.trim());
      toast.success("Convite enviado com sucesso!");
      setInviteEmail("");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao convidar usuário.");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    try {
      await removeUser.mutateAsync(removeTarget.id);
      toast.success("Usuário removido.");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao remover usuário.");
    } finally {
      setRemoveTarget(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">
              Gerenciar Usuários
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Controle quem tem acesso ao dashboard do seu tenant.
            </p>
          </div>
        </div>

        {/* Plan info */}
        <div className="flex items-center gap-3 bg-[#1E293B] border border-slate-800 rounded-xl px-5 py-4">
          <Users className="h-5 w-5 text-[#7C3AED]" />
          <div>
            <p className="text-white font-bold text-sm">
              {currentCount} de {maxUsers} usuários
            </p>
            <p className="text-slate-400 text-xs">Plano: {planName}</p>
          </div>
          {atLimit && (
            <span className="ml-auto text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-1">
              Limite atingido
            </span>
          )}
        </div>

        {/* Invite form */}
        <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-bold text-base">Convidar novo usuário</h2>
          <form onSubmit={handleInvite} className="flex gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                type="email"
                placeholder="email@empresa.com"
                className="bg-slate-900/50 border-slate-700 text-white pl-10 h-11"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={atLimit || inviting}
                required
              />
            </div>
            <Button
              type="submit"
              className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 h-11 px-6 font-bold"
              disabled={atLimit || inviting || !inviteEmail.trim()}
            >
              {inviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Convidar"
              )}
            </Button>
          </form>
          {atLimit && (
            <p className="text-orange-400 text-xs font-medium">
              Limite de usuários do plano {planName} atingido ({maxUsers} usuários). Faça upgrade para adicionar mais.
            </p>
          )}
        </div>

        {/* Users list */}
        <div className="bg-[#1E293B] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-white font-bold text-base">Usuários ativos</h2>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm italic">
              Nenhum usuário cadastrado ainda.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                  <th className="px-6 py-3">Usuário</th>
                  <th className="px-6 py-3">Perfil</th>
                  <th className="px-6 py-3">Desde</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-200 font-medium">
                      {u.email ?? u.user_id}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-md ${
                          u.role === "admin"
                            ? "bg-[#7C3AED]/20 text-[#a78bfa]"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {u.role === "admin" ? "Admin" : "Membro"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {u.created_at
                        ? format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() =>
                          setRemoveTarget({ id: u.user_id, email: u.email })
                        }
                        className="text-slate-500 hover:text-red-400 transition-colors"
                        title="Remover usuário"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Remove confirmation dialog */}
      <Dialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <DialogContent className="bg-[#1E293B] border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle>Remover usuário</DialogTitle>
            <DialogDescription className="text-slate-400">
              Tem certeza que deseja remover{" "}
              <span className="font-bold text-white">
                {removeTarget?.email ?? removeTarget?.id}
              </span>{" "}
              do tenant? O acesso será revogado imediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="text-slate-300"
              onClick={() => setRemoveTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 font-bold"
              onClick={handleRemoveConfirm}
              disabled={removeUser.isPending}
            >
              {removeUser.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Remover"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
