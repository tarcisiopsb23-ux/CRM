/**
 * DriveFolderButton
 * Botão de acesso/gerenciamento de pasta no Google Drive.
 * Visível apenas para manager/admin/owner.
 */
import { useState } from "react";
import { FolderOpen, FolderPlus, Pencil, Trash2, Plus, Loader2, ExternalLink, Share2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDriveFolder, type DriveFolderModule } from "@/hooks/useDriveFolder";

interface DriveFolderButtonProps {
  organizationId: string;
  module: DriveFolderModule;
  record: { id: string; name?: string; company?: string; title?: string; full_name?: string };
  folderId?: string | null;
  folderUrl?: string | null;
  onFolderCreated?: () => void;
  onFolderSaved?: (folderId: string, folderUrl: string | null) => Promise<void> | void;
}

export function DriveFolderButton({
  organizationId,
  module,
  record,
  folderId,
  folderUrl,
  onFolderCreated,
  onFolderSaved,
}: DriveFolderButtonProps) {
  const { triggerFolder, canManageFolders } = useDriveFolder(organizationId);

  // Dialogs
  const [subfolderDialog, setSubfolderDialog] = useState(false);
  const [renameDialog, setRenameDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [revokeDialog, setRevokeDialog] = useState(false);

  const [inputValue, setInputValue] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"reader" | "commenter" | "writer">("reader");
  const [revokeEmail, setRevokeEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const recordName = record.company || record.name || record.title || record.full_name || record.id;

  // Apenas manager/admin/owner veem o botão
  if (!canManageFolders) return null;

  const run = async (fn: () => Promise<void>) => {
    setIsLoading(true);
    try {
      await fn();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao executar ação no Drive");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFolder = () => run(async () => {
    const result = await triggerFolder.mutateAsync({ action: "create", module, record });
    const newFolderId = (result as Record<string, unknown>)?.folder_id as string | undefined;
    const newFolderUrl = (result as Record<string, unknown>)?.folder_url as string | undefined;
    if (newFolderId && onFolderSaved) await onFolderSaved(newFolderId, newFolderUrl ?? null);
    toast.success("Pasta criada no Google Drive!");
    onFolderCreated?.();
  });

  const handleCreateSubfolder = () => run(async () => {
    if (!inputValue.trim()) { toast.error("Informe o nome da subpasta."); return; }
    await triggerFolder.mutateAsync({ action: "create_subfolder", module, record, existing_folder_id: folderId ?? undefined, subfolder: inputValue.trim() });
    toast.success(`Subpasta "${inputValue.trim()}" criada!`);
    setSubfolderDialog(false);
    setInputValue("");
  });

  const handleRename = () => run(async () => {
    if (!inputValue.trim()) { toast.error("Informe o novo nome."); return; }
    await triggerFolder.mutateAsync({ action: "rename", module, record, existing_folder_id: folderId ?? undefined, new_name: inputValue.trim() });
    toast.success("Pasta renomeada!");
    setRenameDialog(false);
    setInputValue("");
    onFolderCreated?.();
  });

  const handleDelete = () => run(async () => {
    await triggerFolder.mutateAsync({ action: "delete", module, record, existing_folder_id: folderId ?? undefined });
    toast.success("Pasta excluída do Drive.");
    setDeleteDialog(false);
    onFolderCreated?.();
  });

  const handleShare = () => run(async () => {
    if (!shareEmail.trim()) { toast.error("Informe o e-mail."); return; }
    await triggerFolder.mutateAsync({ action: "share_access", module, record, existing_folder_id: folderId ?? undefined, email: shareEmail.trim(), role: shareRole });
    toast.success(`Acesso compartilhado com ${shareEmail.trim()}.`);
    setShareDialog(false);
    setShareEmail("");
  });

  const handleRevoke = () => run(async () => {
    if (!revokeEmail.trim()) { toast.error("Informe o e-mail."); return; }
    await triggerFolder.mutateAsync({ action: "revoke_access", module, record, existing_folder_id: folderId ?? undefined, email: revokeEmail.trim() });
    toast.success(`Acesso revogado para ${revokeEmail.trim()}.`);
    setRevokeDialog(false);
    setRevokeEmail("");
  });

  // Pasta existe — mostra botão Drive + dropdown de gerenciamento
  if (folderId) {
    return (
      <>
        <div className="flex items-center gap-1">
          {folderUrl && (
            <Button size="sm" variant="outline" asChild className="gap-1 text-xs">
              <a href={folderUrl} target="_blank" rel="noreferrer">
                <FolderOpen className="h-3.5 w-3.5 text-yellow-600" />
                Drive
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setInputValue(""); setSubfolderDialog(true); }}>
                <FolderPlus className="h-3.5 w-3.5 mr-2" /> Nova subpasta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setInputValue(recordName); setRenameDialog(true); }}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear pasta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setShareEmail(""); setShareRole("reader"); setShareDialog(true); }}>
                <Share2 className="h-3.5 w-3.5 mr-2" /> Compartilhar acesso
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setRevokeEmail(""); setRevokeDialog(true); }}>
                <UserMinus className="h-3.5 w-3.5 mr-2" /> Revogar acesso
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 focus:text-red-700" onClick={() => setDeleteDialog(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Subfolder dialog */}
        <Dialog open={subfolderDialog} onOpenChange={setSubfolderDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Nova Subpasta</DialogTitle>
              <DialogDescription>Criar subpasta dentro de "{recordName}"</DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label className="text-xs">Nome da subpasta *</Label>
              <Input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Ex: Contratos 2026" autoFocus />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubfolderDialog(false)}>Cancelar</Button>
              <Button onClick={handleCreateSubfolder} disabled={isLoading || !inputValue.trim()}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename dialog */}
        <Dialog open={renameDialog} onOpenChange={setRenameDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Renomear Pasta</DialogTitle></DialogHeader>
            <div className="space-y-1">
              <Label className="text-xs">Novo nome *</Label>
              <Input value={inputValue} onChange={e => setInputValue(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameDialog(false)}>Cancelar</Button>
              <Button onClick={handleRename} disabled={isLoading || !inputValue.trim()}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Renomear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share dialog */}
        <Dialog open={shareDialog} onOpenChange={setShareDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Compartilhar acesso</DialogTitle>
              <DialogDescription>Compartilhar a pasta "{recordName}" no Google Drive</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">E-mail *</Label>
                <Input value={shareEmail} onChange={e => setShareEmail(e.target.value)} placeholder="usuario@email.com" autoFocus type="email" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Permissão</Label>
                <Select value={shareRole} onValueChange={(v) => setShareRole(v as "reader" | "commenter" | "writer")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reader">Leitor (somente visualização)</SelectItem>
                    <SelectItem value="commenter">Comentarista</SelectItem>
                    <SelectItem value="writer">Editor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShareDialog(false)}>Cancelar</Button>
              <Button onClick={handleShare} disabled={isLoading || !shareEmail.trim()}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Compartilhar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke dialog */}
        <Dialog open={revokeDialog} onOpenChange={setRevokeDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Revogar acesso</DialogTitle>
              <DialogDescription>Remover acesso à pasta "{recordName}" no Google Drive</DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label className="text-xs">E-mail *</Label>
              <Input value={revokeEmail} onChange={e => setRevokeEmail(e.target.value)} placeholder="usuario@email.com" autoFocus type="email" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevokeDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleRevoke} disabled={isLoading || !revokeEmail.trim()}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Revogar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Excluir Pasta</DialogTitle>
              <DialogDescription>Excluir a pasta "{recordName}" do Google Drive? Esta ação não pode ser desfeita.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Sem pasta — botão para criar
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1 text-xs text-yellow-700 border-yellow-300 hover:bg-yellow-50"
      onClick={handleCreateFolder}
      disabled={isLoading}
    >
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
      Criar pasta Drive
    </Button>
  );
}
