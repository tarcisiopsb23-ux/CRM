/**
 * DriveSharesModal
 * Exibe a lista de pessoas com quem uma pasta ou arquivo foi compartilhado.
 * Permite compartilhar com novas pessoas e revogar acessos existentes.
 * Restrito a roles: owner, admin, manager.
 */
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Share2, UserMinus, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface DriveShareEntry {
  id: string;
  item_id: string;
  item_name: string;
  item_type: "folder" | "file";
  shared_with: string;
  role: string;
  shared_by: string | null;
  shared_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  sharer_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  itemType: "folder" | "file";
  /** Callback para executar o compartilhamento via webhook */
  onShare: (email: string, role: "reader" | "commenter" | "writer") => Promise<void>;
  /** Callback para revogar via webhook */
  onRevoke: (email: string) => Promise<void>;
}

const ROLE_LABELS: Record<string, string> = {
  reader:     "Leitor",
  commenter:  "Comentarista",
  writer:     "Editor",
};

const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return iso; }
};

// ── Componente ────────────────────────────────────────────────────────────────

export function DriveSharesModal({
  open,
  onOpenChange,
  itemId,
  itemName,
  itemType,
  onShare,
  onRevoke,
}: Props) {
  const orgId = useOrganization();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const canShare = ["owner", "admin", "manager"].includes(profile?.role ?? "");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"reader" | "commenter" | "writer">("reader");
  const [sharing, setSharing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // ── Query: compartilhamentos ativos ──────────────────────────────────────
  const { data: shares = [], isLoading } = useQuery({
    queryKey: ["drive-shares", orgId, itemId],
    queryFn: async () => {
      if (!orgId || !itemId) return [];
      const { data, error } = await supabase
        .from("drive_shares")
        .select("*, sharer:shared_by(full_name)")
        .eq("organization_id", orgId)
        .eq("item_id", itemId)
        .is("revoked_at", null)
        .order("shared_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        sharer_name: r.sharer?.full_name ?? null,
      })) as DriveShareEntry[];
    },
    enabled: open && !!orgId && !!itemId,
  });

  // ── Mutation: registrar compartilhamento ─────────────────────────────────
  // Ordem garantida: 1) webhook confirma → 2) persiste no Supabase → 3) atualiza lista
  const addShare = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: "reader" | "commenter" | "writer" }) => {
      // Só persiste se o webhook não lançar erro
      await onShare(email, role);
      const { error } = await supabase.from("drive_shares").insert({
        organization_id: orgId,
        item_id:   itemId,
        item_name: itemName,
        item_type: itemType,
        shared_with: email.toLowerCase().trim(),
        role,
        shared_by: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drive-shares", orgId, itemId] });
    },
    // Não invalida a query em caso de erro — lista permanece inalterada
  });

  // ── Mutation: revogar compartilhamento ───────────────────────────────────
  // Ordem garantida: 1) webhook confirma → 2) marca revogado no Supabase → 3) atualiza lista
  const revokeShare = useMutation({
    mutationFn: async ({ shareId, email }: { shareId: string; email: string }) => {
      // Só marca como revogado se o webhook não lançar erro
      await onRevoke(email);
      const { error } = await supabase.from("drive_shares")
        .update({ revoked_at: new Date().toISOString(), revoked_by: profile?.id ?? null })
        .eq("id", shareId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drive-shares", orgId, itemId] });
    },
    // Não invalida a query em caso de erro — lista permanece inalterada
  });

  const handleShare = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("E-mail inválido.");
      return;
    }
    if (shares.some((s) => s.shared_with === trimmed)) {
      toast.error("Este e-mail já tem acesso.");
      return;
    }
    setSharing(true);
    try {
      await addShare.mutateAsync({ email: trimmed, role });
      toast.success(`Acesso compartilhado com ${trimmed}.`);
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao compartilhar.");
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = async (share: DriveShareEntry) => {
    setRevokingId(share.id);
    try {
      await revokeShare.mutateAsync({ shareId: share.id, email: share.shared_with });
      toast.success(`Acesso de ${share.shared_with} revogado.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao revogar.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Compartilhamentos
          </DialogTitle>
          <DialogDescription>
            {itemType === "folder" ? "Pasta" : "Arquivo"}: <strong>{itemName}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Formulário de compartilhamento — só para owner/admin/manager */}
        {canShare ? (
          <div className="space-y-3 border rounded-md p-3 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground">Compartilhar com</p>
            <div className="flex gap-2">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@email.com"
                type="email"
                className="flex-1 h-8 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") void handleShare(); }}
              />
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reader">Leitor</SelectItem>
                  <SelectItem value="commenter">Comentarista</SelectItem>
                  <SelectItem value="writer">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" onClick={handleShare} disabled={sharing || !email.trim()}>
                {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Lista de compartilhamentos ativos */}
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : shares.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum compartilhamento ativo.
            </p>
          ) : (
            shares.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.shared_with}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(s.shared_at)}
                    {s.sharer_name ? ` · por ${s.sharer_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs">
                    {ROLE_LABELS[s.role] ?? s.role}
                  </Badge>
                  {canShare ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      disabled={revokingId === s.id}
                      onClick={() => handleRevoke(s)}
                      title="Revogar acesso"
                    >
                      {revokingId === s.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <UserMinus className="h-3.5 w-3.5" />}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
