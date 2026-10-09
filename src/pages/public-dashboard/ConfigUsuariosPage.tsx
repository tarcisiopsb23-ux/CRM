import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserPlus, Trash2, Loader2, Users, Shield, Mail, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { createClientSupabase } from "@/lib/createClientSupabase";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

const ROLE_LABELS: Record<string, string> = {
  owner:   "Proprietário",
  admin:   "Administrador",
  manager: "Gerente",
  member:  "Membro",
  viewer:  "Visualizador",
};

const ROLE_COLORS: Record<string, string> = {
  owner:   "bg-violet-500/10 text-violet-400 border-violet-500/20",
  admin:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  manager: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  member:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  viewer:  "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

interface CrmUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  active: boolean;
  is_support?: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export function ConfigUsuariosPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const qc = useQueryClient();
  const clientId = auth?.user?.client_id ?? "";
  const maxUsers = auth?.modules_config?.max_users ?? 10;
  const currentUserRole = auth?.user?.role ?? "viewer";

  const [inviteOpen, setInviteOpen]     = useState(false);
  const [inviteEmail, setInviteEmail]   = useState("");
  const [inviteRole, setInviteRole]     = useState("member");
  const [deleteTarget, setDeleteTarget] = useState<CrmUser | null>(null);

  if (!dc) return <CredentialsErrorState />;
  if (!["owner", "admin"].includes(currentUserRole)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Shield className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const { data: users = [], isLoading } = useQuery<CrmUser[]>({
    queryKey: ["crm_users_list", clientId, "v2"],
    queryFn: async () => {
      const { data, error } = await dc
        .from("crm_users")
        .select("*")
        .eq("active", true)
        .order("created_at");

      if (error) throw error;

      // Filtra usuário de suporte em duas camadas:
      // 1. Campo is_support = true (bancos com a coluna aplicada)
      // 2. Padrão de email {exatamente 10 chars alfanuméricos}@dominio (fallback universal)
      //    Cobre: 7219cd539a@agenciac8.com.br, bac833f455@agenciac8.com.br, etc.
      const SUPPORT_EMAIL_RE = /^[a-z0-9]{10}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
      return ((data ?? []) as CrmUser[]).filter(u =>
        u.is_support !== true && !SUPPORT_EMAIL_RE.test(u.email)
      );
    },
    enabled: !!dc && !!clientId,
    staleTime: 0, // sempre re-busca para garantir dados frescos
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!auth?.client_supabase_url) throw new Error("URL do banco não configurada.");
      const anonKey = sessionStorage.getItem(`client_anon_${auth.id}`) ?? "";
      const bankB = createClientSupabase(auth.client_supabase_url, anonKey);

      // Cria usuário via Supabase Auth Admin (requer service_role — feito via Edge Function)
      // Fallback: insere diretamente na crm_users (usuário precisará fazer signup)
      const { data, error } = await bankB.from("crm_users").insert({
        id: crypto.randomUUID(),
        client_id: clientId,
        email: email.trim().toLowerCase(),
        role,
        active: true,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_users_list", clientId] });
      toast.success("Usuário adicionado. Ele deve se cadastrar com este e-mail.");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await dc.from("crm_users").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_users_list", clientId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dc.from("crm_users").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_users_list", clientId] });
      toast.success("Usuário desativado.");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activeCount = users.filter(u => u.active).length;
  const atLimit = activeCount >= maxUsers;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Usuários e Permissões"
        description={`${activeCount} de ${maxUsers} usuários ativos`}
        action={
          <Button
            onClick={() => setInviteOpen(true)}
            disabled={atLimit}
            className="bg-gradient-ember text-primary-foreground shadow-glow"
            title={atLimit ? `Limite de ${maxUsers} usuários atingido` : undefined}
          >
            <UserPlus className="h-4 w-4 mr-2" /> Convidar Usuário
          </Button>
        }
      />

      {atLimit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Limite de {maxUsers} usuários atingido. Para aumentar, entre em contato com a agência.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">Nenhum usuário cadastrado.</p>
        </div>
      ) : (
        <Card className="card-surface overflow-hidden">
          <div className="divide-y divide-border/40">
            {users.map(user => (
              <div key={user.id} className={cn("flex items-center gap-4 px-5 py-4", !user.active && "opacity-50")}>
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {(user.full_name || user.email)[0].toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {user.full_name || user.email}
                    {user.id === auth?.user?.id && (
                      <span className="ml-2 text-[10px] text-muted-foreground font-normal">(você)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  {user.last_seen_at && (
                    <p className="text-[10px] text-muted-foreground/60">
                      Último acesso: {format(parseISO(user.last_seen_at), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  )}
                </div>

                {/* Role selector */}
                {user.id !== auth?.user?.id && currentUserRole === "owner" ? (
                  <Select
                    value={user.role}
                    onValueChange={role => changeRoleMutation.mutate({ id: user.id, role })}
                    disabled={changeRoleMutation.isPending}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className={cn("text-[10px] shrink-0", ROLE_COLORS[user.role])}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                )}

                {/* Desativar */}
                {user.id !== auth?.user?.id && user.active && (
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                    onClick={() => setDeleteTarget(user)}
                    title="Desativar usuário"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Dialog convidar */}
      <Dialog open={inviteOpen} onOpenChange={open => { if (!open) setInviteOpen(false); }}>
        <DialogContent className="border-border bg-card sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Convidar Usuário
            </DialogTitle>
            <DialogDescription>
              O usuário precisará se cadastrar com este e-mail para ter acesso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email" className="pl-9"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="usuario@email.com"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Permissão</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).filter(([v]) => v !== "owner").map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
              className="bg-gradient-ember text-primary-foreground shadow-glow"
            >
              {inviteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog desativar */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desativar Usuário</DialogTitle>
            <DialogDescription>
              Desativar <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong>?
              O acesso será removido imediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deactivateMutation.mutate(deleteTarget.id)}
              disabled={deactivateMutation.isPending}>
              {deactivateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
