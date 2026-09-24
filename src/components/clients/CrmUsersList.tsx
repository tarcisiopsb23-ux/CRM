import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useCrmClientUsers } from "@/hooks/useCrmClientUsers";

interface CrmUsersListProps {
  clientId: string;
  organizationId: string;
  maxUsers: number;
}

export function CrmUsersList({ clientId, organizationId, maxUsers }: CrmUsersListProps) {
  const { data: users, isLoading, activeCount, inviteUser, removeUser } = useCrmClientUsers(clientId, organizationId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<{ email?: string; userId?: string; name: string | null } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const limitReached = activeCount >= maxUsers;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error("Informe o e-mail."); return; }
    setIsInviting(true);
    try {
      const result = await inviteUser.mutateAsync({ email: inviteEmail.trim(), name: inviteName.trim() || undefined });
      if (result?.email_sent) {
        toast.success(`Convite enviado para ${inviteEmail.trim()}! O usuário receberá a senha por e-mail.`);
      } else if (result?.temp_password) {
        // E-mail não enviado (Resend não configurado) — exibe a senha no toast
        toast.success(`Usuário criado! Senha temporária: ${result.temp_password}`, { duration: 15000,
          description: result?.warning ?? "Configure RESEND_API_KEY para envio automático por e-mail." });
      } else {
        toast.success("Usuário convidado com sucesso!");
      }
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao convidar usuário.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeUser.mutateAsync({ email: removeTarget.email, c8UserId: removeTarget.userId });
      toast.success("Usuário removido.");
      setRemoveTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao remover usuário.");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Usuários do CRM</CardTitle>
            <div
              title={limitReached ? `Limite de ${maxUsers} usuários atingido` : undefined}
            >
              <Button
                size="sm"
                onClick={() => setInviteOpen(true)}
                disabled={limitReached}
              >
                Convidar Usuário
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {activeCount} de {maxUsers} usuários cadastrados
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários...
            </div>
          ) : !users || users.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">
              Nenhum usuário cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name ?? "—"}</TableCell>
                    <TableCell>{user.email || "—"}</TableCell>
                    <TableCell>
                      {user.last_access_at
                        ? format(parseISO(user.last_access_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.email && !user.is_support && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setRemoveTarget({ email: user.email, userId: user.user_id, name: user.name })}
                        >
                          Remover
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog convidar */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convidar Usuário</DialogTitle>
            <DialogDescription>
              Preencha os dados do novo usuário do CRM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>E-mail *</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="usuario@exemplo.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="Nome do usuário"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={isInviting}>
              {isInviting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Convidar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog remover */}
      <Dialog open={!!removeTarget} onOpenChange={o => { if (!o) setRemoveTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover Usuário</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover{" "}
              <strong>{removeTarget?.name ?? removeTarget?.email}</strong>? O acesso será revogado imediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
