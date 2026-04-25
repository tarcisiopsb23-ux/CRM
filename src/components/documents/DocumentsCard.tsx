import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useN8nConfig } from "@/hooks/useN8nConfig";
import { useOrganization } from "@/hooks/useOrganization";
import { ExternalLink, FileUp, Folder, FolderPlus, Loader2, Minus, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import {
  createDriveFolder,
  deleteDriveFile,
  deleteDriveFolder,
  extractDriveFolderId,
  listDriveFolderDocuments,
  listDriveFolderFolders,
  normalizeDriveFolderUrl,
  revokeDriveFolderAccess,
  shareDriveFile,
  shareDriveFolder,
  uploadDriveFolderDocument,
} from "@/lib/driveDocuments";
import { DriveDeleteConfirmDialog } from "@/components/shared/DriveDeleteConfirmDialog";
import { DriveSharesModal } from "@/components/documents/DriveSharesModal";
import { useAuth } from "@/contexts/AuthContext";

type Props = {
  title?: string;
  folderValue: string | null | undefined;
  /** folder_id direto da tabela (fallback se folderValue não tiver ID) */
  folderId?: string | null | undefined;
  canEdit?: boolean;
  variant?: "flat" | "folders";
  actionsDisplay?: "text" | "icons";
  limit?: number;
  allowCreateFolder?: boolean;
  createFolderParentValue?: string | null | undefined;
  createFolderName?: string;
  onSetFolderValue?: (next: string) => Promise<void> | void;
  /**
   * Nomes de subpastas criadas automaticamente pelo sistema (ex: "Contratos", "Documentos").
   * Essas pastas não podem ser excluídas por nenhum usuário.
   */
  autoFolderNames?: string[];
};

/** Input para vincular manualmente uma pasta do Google Drive por URL ou ID */
function FolderLinkInput({ onLink }: { onLink: (v: string) => Promise<void> | void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleLink = async () => {
    const v = value.trim();
    if (!v) return;
    setSaving(true);
    try {
      await onLink(v);
      setValue("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Cole a URL ou ID da pasta do Google Drive"
        className="text-xs h-8"
        onKeyDown={(e) => { if (e.key === "Enter") void handleLink(); }}
      />
      <Button size="sm" variant="outline" onClick={handleLink} disabled={saving || !value.trim()} className="shrink-0 h-8 text-xs">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Vincular"}
      </Button>
    </div>
  );
}

export function DocumentsCard({
  title = "Documentos",
  folderValue,
  folderId: folderIdProp,
  canEdit,
  variant = "flat",
  actionsDisplay = "text",
  limit,
  allowCreateFolder,
  createFolderParentValue,
  createFolderName,
  onSetFolderValue,
  autoFolderNames = [],
}: Props) {
  const orgId = useOrganization();
  const n8nConfig = useN8nConfig(orgId);

  const normalizedFolderUrl = useMemo(() => normalizeDriveFolderUrl(folderValue), [folderValue]);
  const folderId = useMemo(
    () => folderIdProp || extractDriveFolderId(folderValue),
    [folderIdProp, folderValue]
  );
  const createParentId = useMemo(() => extractDriveFolderId(createFolderParentValue), [createFolderParentValue]);

  // Refs para inputs de arquivo — um para o header (pasta raiz), um para subpasta ativa e um para sub-subpasta
  const fileInputRootRef = useRef<HTMLInputElement | null>(null);
  const fileInputSubRef = useRef<HTMLInputElement | null>(null);
  const fileInputSubSubRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);

  // Subpasta expandida para visualizar documentos
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [expandedFolderName, setExpandedFolderName] = useState<string>("");

  // Sub-subpasta expandida (dentro de uma subpasta expandida)
  const [expandedSubSubId, setExpandedSubSubId] = useState<string | null>(null);
  const [expandedSubSubName, setExpandedSubSubName] = useState<string>("");

  // Dialog: nova subpasta na pasta raiz do registro
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Dialog: nova subpasta DENTRO de uma subpasta expandida
  const [subSubFolderDialog, setSubSubFolderDialog] = useState(false);
  const [subSubFolderName, setSubSubFolderName] = useState("");
  const [subSubCreating, setSubSubCreating] = useState(false);

  // Dialog: compartilhar / ver compartilhamentos (pasta ou arquivo)
  const [sharesModal, setSharesModal] = useState(false);
  const [sharesTargetId, setSharesTargetId] = useState<string | null>(null);
  const [sharesTargetName, setSharesTargetName] = useState<string>("");
  const [sharesTargetType, setSharesTargetType] = useState<"folder" | "file">("folder");

  // Dialog: excluir arquivo ou subpasta (requer PIN + justificativa)
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState<string>("");
  const [deleteTargetType, setDeleteTargetType] = useState<"file" | "folder">("file");
  const [deleteAction, setDeleteAction] = useState<(() => Promise<void>) | null>(null);

  // Verifica se o usuário tem permissão para excluir (apenas admin/owner)
  const { profile } = useAuth();
  const canDelete = ["owner", "admin"].includes(profile?.role ?? "");
  // Compartilhar: owner, admin, manager
  const canShare = ["owner", "admin", "manager"].includes(profile?.role ?? "");

  // Retorna true para pastas que não podem ser excluídas (pasta raiz ou subpastas auto-criadas)
  const isProtectedFolder = (name: string) =>
    autoFolderNames.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());

  const openSharesModal = (id: string, name: string, type: "folder" | "file") => {
    setSharesTargetId(id);
    setSharesTargetName(name);
    setSharesTargetType(type);
    setSharesModal(true);
  };

  // ─── Queries ────────────────────────────────────────────────────────────────

  const hasWebhook = !!(n8nConfig?.driveFolderManualWebhookUrl?.trim() || n8nConfig?.baseUrl?.trim());

  const docs = useQuery({
    queryKey: ["drive-documents", orgId, folderId],
    queryFn: async () => {
      if (!folderId) return [];
      return listDriveFolderDocuments({ config: n8nConfig, folderId });
    },
    enabled: variant === "flat" && !!orgId && !!folderId && hasWebhook,
  });

  const folders = useQuery({
    queryKey: ["drive-folders", orgId, folderId],
    queryFn: async () => {
      if (!folderId) return [];
      return listDriveFolderFolders({ config: n8nConfig, folderId });
    },
    enabled: variant === "folders" && !!orgId && !!folderId && hasWebhook,
  });

  const expandedDocs = useQuery({
    queryKey: ["drive-documents", orgId, expandedFolderId],
    queryFn: async () => {
      if (!expandedFolderId) return [];
      return listDriveFolderDocuments({ config: n8nConfig, folderId: expandedFolderId });
    },
    enabled: variant === "folders" && !!orgId && !!expandedFolderId && hasWebhook,
  });

  // Sub-subpastas dentro da subpasta expandida
  const expandedSubFolders = useQuery({
    queryKey: ["drive-folders", orgId, expandedFolderId, "sub"],
    queryFn: async () => {
      if (!expandedFolderId) return [];
      return listDriveFolderFolders({ config: n8nConfig, folderId: expandedFolderId });
    },
    enabled: variant === "folders" && !!orgId && !!expandedFolderId && hasWebhook,
  });

  // Arquivos dentro da sub-subpasta expandida
  const expandedSubSubDocs = useQuery({
    queryKey: ["drive-documents", orgId, expandedSubSubId],
    queryFn: async () => {
      if (!expandedSubSubId) return [];
      return listDriveFolderDocuments({ config: n8nConfig, folderId: expandedSubSubId });
    },
    enabled: variant === "folders" && !!orgId && !!expandedSubSubId && hasWebhook,
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────

  /** Upload para a pasta raiz do registro (botão no header) */
  const uploadToRoot = async (file: File) => {
    if (!folderId) return;
    setUploading(true);
    try {
      await uploadDriveFolderDocument({ config: n8nConfig, folderId, file });
      toast("Documento enviado.");
      await docs.refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  };

  /** Upload para a subpasta atualmente expandida */
  const uploadToSubfolder = async (file: File) => {
    if (!expandedFolderId) return;
    setUploading(true);
    try {
      await uploadDriveFolderDocument({ config: n8nConfig, folderId: expandedFolderId, file });
      toast("Documento enviado.");
      await expandedDocs.refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  };

  /** Upload para a sub-subpasta atualmente expandida */
  const uploadToSubSubfolder = async (file: File) => {
    if (!expandedSubSubId) return;
    setUploading(true);
    try {
      await uploadDriveFolderDocument({ config: n8nConfig, folderId: expandedSubSubId, file });
      toast("Documento enviado.");
      await expandedSubSubDocs.refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  };

  const refresh = async () => {
    if (variant === "folders") {
      await folders.refetch();
      if (expandedFolderId) {
        await expandedDocs.refetch();
        await expandedSubFolders.refetch();
      }
      if (expandedSubSubId) await expandedSubSubDocs.refetch();
      return;
    }
    await docs.refetch();
  };

  const canCreateAnyFolder = !!allowCreateFolder && !!canEdit && !!folderId;

  const openNewFolderDialog = () => {
    setNewFolderName("");
    setNewFolderDialog(true);
  };

  /** Cria subpasta na pasta raiz do registro */
  const createFolder = async (nameOverride?: string) => {
    const parentFolderId = folderId ?? createParentId;
    if (!parentFolderId) return;

    const isRootFolderCreation = !folderId && !!createParentId;
    const name = isRootFolderCreation
      ? (createFolderName ?? "Nova pasta").trim()
      : (nameOverride ?? "").trim();

    if (!name) return;

    setCreatingFolder(true);
    try {
      const created = await createDriveFolder({ config: n8nConfig, parentFolderId, name });
      toast("Pasta criada.");
      if (isRootFolderCreation) {
        await onSetFolderValue?.(created.id);
      } else {
        await folders.refetch();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao criar pasta.");
    } finally {
      setCreatingFolder(false);
      setNewFolderDialog(false);
      setNewFolderName("");
    }
  };

  /** Cria subpasta DENTRO da subpasta expandida */
  const createSubSubFolder = async () => {
    if (!expandedFolderId || !subSubFolderName.trim()) return;
    setSubSubCreating(true);
    try {
      await createDriveFolder({ config: n8nConfig, parentFolderId: expandedFolderId, name: subSubFolderName.trim() });
      toast("Subpasta criada.");
      await expandedSubFolders.refetch();
      setSubSubFolderDialog(false);
      setSubSubFolderName("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao criar subpasta.");
    } finally {
      setSubSubCreating(false);
    }
  };

  const shownDocs = useMemo(() => {
    const list = docs.data ?? [];
    if (!limit || showAllDocs) return list;
    return list.slice(0, limit);
  }, [docs.data, limit, showAllDocs]);

  const showMoreVisible = !!limit && !showAllDocs && (docs.data?.length ?? 0) > limit;
  const actionButtonProps = actionsDisplay === "icons" ? { size: "icon" as const } : { size: "sm" as const };

  const openDeleteDialog = (
    id: string,
    name: string,
    type: "file" | "folder",
    action: () => Promise<void>
  ) => {
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setDeleteTargetType(type);
    setDeleteAction(() => action);
    setDeleteDialog(true);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {canCreateAnyFolder ? (
              <Button {...actionButtonProps} variant="outline" onClick={openNewFolderDialog} disabled={creatingFolder}>
                {creatingFolder ? (
                  <Loader2 className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"} animate-spin`} />
                ) : (
                  <FolderPlus className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"}`} />
                )}
                {actionsDisplay === "icons" ? null : "Nova subpasta"}
              </Button>
            ) : null}
            <Button
              {...actionButtonProps}
              variant="outline"
              onClick={() => void refresh()}
              disabled={!folderId || (variant === "folders" ? folders.isFetching || expandedDocs.isFetching : docs.isFetching)}
            >
              <RefreshCw className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"}`} />
              {actionsDisplay === "icons" ? null : "Atualizar"}
            </Button>
            {/* Upload para pasta raiz — só no variant flat */}
            {variant === "flat" ? (
              <>
                <Button {...actionButtonProps} onClick={() => fileInputRootRef.current?.click()} disabled={!canEdit || !folderId || uploading}>
                  {uploading ? (
                    <Loader2 className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"} animate-spin`} />
                  ) : (
                    <FileUp className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"}`} />
                  )}
                  {actionsDisplay === "icons" ? null : "Novo documento"}
                </Button>
                <input
                  ref={fileInputRootRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadToRoot(f);
                  }}
                />
              </>
            ) : null}
            {/* Compartilhamentos da pasta raiz */}
            {folderId ? (
              <Button
                {...actionButtonProps}
                variant="outline"
                onClick={() => openSharesModal(folderId, title, "folder")}
              >
                <Users className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"}`} />
                {actionsDisplay === "icons" ? null : "Compartilhamentos"}
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!folderId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {allowCreateFolder && createParentId
                  ? "Crie a pasta para começar a listar e enviar documentos."
                  : "Pasta não configurada."}
              </p>
              {canEdit && onSetFolderValue && (
                <FolderLinkInput onLink={onSetFolderValue} />
              )}
            </div>
          ) : !hasWebhook ? (
            <p className="text-sm text-muted-foreground">
              Webhook do Drive não configurado. Configure em{" "}
              <strong>Configurações → n8n → Ações no Drive</strong>.
            </p>
          ) : variant === "folders" ? (
            folders.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando pastas...
              </div>
            ) : folders.isError ? (
              <div className="text-sm text-destructive">
                {folders.error instanceof Error ? folders.error.message : "Erro ao carregar pastas."}
              </div>
            ) : folders.data.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhuma pasta encontrada.</div>
            ) : (
              <div className="space-y-2">
                {folders.data.map((f) => {
                  const expanded = expandedFolderId === f.id;
                  return (
                    <div key={f.id} className="rounded border">
                      {/* Cabeçalho da subpasta */}
                      <button
                        type="button"
                        onClick={() => {
                          if (expanded) {
                            setExpandedFolderId(null);
                            setExpandedFolderName("");
                            setExpandedSubSubId(null);
                            setExpandedSubSubName("");
                          } else {
                            setExpandedFolderId(f.id);
                            setExpandedFolderName(f.name);
                            setExpandedSubSubId(null);
                            setExpandedSubSubName("");
                          }
                        }}
                        className="w-full flex items-center justify-between gap-3 p-2 text-left hover:bg-muted/40 rounded-t"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {expanded ? <Minus className="h-4 w-4 shrink-0" /> : <Plus className="h-4 w-4 shrink-0" />}
                          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">{f.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {f.modifiedTime ? String(f.modifiedTime) : ""}
                        </span>
                      </button>

                      {/* Conteúdo expandido da subpasta */}
                      {expanded ? (
                        <div className="border-t">
                          {/* Barra de ações da subpasta */}
                          {canEdit ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b flex-wrap">
                              <span className="text-xs text-muted-foreground flex-1 truncate min-w-0">
                                Em: <strong>{f.name}</strong>
                              </span>
                              {/* Criar subpasta dentro desta subpasta */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setSubSubFolderName("");
                                  setSubSubFolderDialog(true);
                                }}
                              >
                                <FolderPlus className="h-3.5 w-3.5" />
                                Nova subpasta
                              </Button>
                              {/* Upload para esta subpasta */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={uploading}
                                onClick={() => fileInputSubRef.current?.click()}
                              >
                                {uploading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FileUp className="h-3.5 w-3.5" />
                                )}
                                Enviar arquivo
                              </Button>
                              <input
                                ref={fileInputSubRef}
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) void uploadToSubfolder(file);
                                }}
                              />
                              {/* Compartilhamentos desta subpasta */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => openSharesModal(f.id, f.name, "folder")}
                              >
                                <Users className="h-3.5 w-3.5" />
                                Compartilhamentos
                              </Button>
                              {/* Excluir esta subpasta — bloqueado para pastas auto-criadas */}
                              {canDelete && !isProtectedFolder(f.name) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 text-destructive hover:text-destructive border-destructive/30"
                                  onClick={() => openDeleteDialog(
                                    f.id,
                                    f.name,
                                    "folder",
                                    async () => {
                                      await deleteDriveFolder({ config: n8nConfig, folderId: f.id });
                                      await folders.refetch();
                                      setExpandedFolderId(null);
                                    }
                                  )}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Excluir pasta
                                </Button>
                              ) : null}
                            </div>
                          ) : null}

                          {/* Conteúdo expandido: sub-subpastas + arquivos */}
                          <div className="p-2 space-y-2">
                            {/* Sub-subpastas — mesmo padrão visual das subpastas de nível 1 */}
                            {expandedSubFolders.isLoading ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Carregando pastas...
                              </div>
                            ) : (expandedSubFolders.data ?? []).map((sf) => {
                              const sfExpanded = expandedSubSubId === sf.id;
                              return (
                                <div key={sf.id} className="rounded border">
                                  {/* Cabeçalho da sub-subpasta — idêntico ao das subpastas */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (sfExpanded) {
                                        setExpandedSubSubId(null);
                                        setExpandedSubSubName("");
                                      } else {
                                        setExpandedSubSubId(sf.id);
                                        setExpandedSubSubName(sf.name);
                                      }
                                    }}
                                    className="w-full flex items-center justify-between gap-3 p-2 text-left hover:bg-muted/40 rounded-t"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {sfExpanded ? <Minus className="h-4 w-4 shrink-0" /> : <Plus className="h-4 w-4 shrink-0" />}
                                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      <span className="text-sm font-medium truncate">{sf.name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {sf.modifiedTime ? String(sf.modifiedTime) : ""}
                                    </span>
                                  </button>

                                  {/* Conteúdo expandido da sub-subpasta — só aparece quando expandida */}
                                  {sfExpanded ? (
                                    <div className="border-t">
                                      {/* Barra de ações — idêntica à das subpastas */}
                                      {canEdit ? (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b flex-wrap">
                                          <span className="text-xs text-muted-foreground flex-1 truncate min-w-0">
                                            Em: <strong>{sf.name}</strong>
                                          </span>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs gap-1"
                                            disabled={uploading}
                                            onClick={() => fileInputSubSubRef.current?.click()}
                                          >
                                            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                                            Enviar arquivo
                                          </Button>
                                          <input
                                            ref={fileInputSubSubRef}
                                            type="file"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              e.target.value = "";
                                              if (file) void uploadToSubSubfolder(file);
                                            }}
                                          />
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs gap-1"
                                            onClick={() => openSharesModal(sf.id, sf.name, "folder")}
                                          >
                                            <Users className="h-3.5 w-3.5" />
                                            Compartilhamentos
                                          </Button>
                                          {canDelete && !isProtectedFolder(sf.name) ? (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 text-xs gap-1 text-destructive hover:text-destructive border-destructive/30"
                                              onClick={() => openDeleteDialog(
                                                sf.id, sf.name, "folder",
                                                async () => {
                                                  await deleteDriveFolder({ config: n8nConfig, folderId: sf.id });
                                                  await expandedSubFolders.refetch();
                                                  setExpandedSubSubId(null);
                                                }
                                              )}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                              Excluir pasta
                                            </Button>
                                          ) : null}
                                        </div>
                                      ) : null}

                                      {/* Arquivos da sub-subpasta */}
                                      <div className="p-2 space-y-1">
                                        {expandedSubSubDocs.isLoading ? (
                                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                            <Loader2 className="h-4 w-4 animate-spin" /> Carregando documentos...
                                          </div>
                                        ) : (expandedSubSubDocs.data ?? []).length === 0 ? (
                                          <div className="text-sm text-muted-foreground py-2">Nenhum documento nesta pasta.</div>
                                        ) : (
                                          (expandedSubSubDocs.data ?? []).map((d) => (
                                            <div key={`${d.id ?? d.url ?? d.name}`} className="flex items-center justify-between gap-3 rounded border p-2">
                                              <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium truncate">{d.name}</div>
                                                {d.modifiedTime ? <div className="text-xs text-muted-foreground truncate">{d.modifiedTime}</div> : null}
                                              </div>
                                              <div className="flex items-center gap-1 shrink-0">
                                                {canEdit && d.id ? (
                                                  <Button size="icon" variant="ghost" className="h-7 w-7"
                                                    onClick={() => openSharesModal(d.id!, d.name, "file")}
                                                    title="Compartilhar arquivo">
                                                    <Users className="h-3.5 w-3.5" />
                                                  </Button>
                                                ) : null}
                                                {canDelete && d.id ? (
                                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                                    onClick={() => openDeleteDialog(d.id!, d.name, "file", async () => {
                                                      await deleteDriveFile({ config: n8nConfig, fileId: d.id! });
                                                      await expandedSubSubDocs.refetch();
                                                    })}
                                                    title="Excluir arquivo">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </Button>
                                                ) : null}
                                                {d.url ? (
                                                  <Button size="icon" variant="ghost" className="h-7 w-7"
                                                    onClick={() => window.open(d.url!, "_blank", "noopener,noreferrer")}
                                                    title="Abrir arquivo">
                                                    <ExternalLink className="h-4 w-4" />
                                                  </Button>
                                                ) : null}
                                              </div>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}

                            {/* Arquivos diretos da subpasta — exclui itens que já aparecem como sub-subpastas */}
                            {(() => {
                              const subFolderIds = new Set((expandedSubFolders.data ?? []).map((sf) => sf.id));
                              const subFolderNames = new Set((expandedSubFolders.data ?? []).map((sf) => sf.name.toLowerCase()));
                              const onlyFiles = (expandedDocs.data ?? []).filter(
                                (d) => !(d.id && subFolderIds.has(d.id)) && !subFolderNames.has(d.name.toLowerCase())
                              );
                              if (expandedDocs.isLoading) return (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando arquivos...
                                </div>
                              );
                              if (expandedDocs.isError) return (
                                <div className="text-xs text-destructive py-1">
                                  {expandedDocs.error instanceof Error ? expandedDocs.error.message : "Erro ao carregar arquivos."}
                                </div>
                              );
                              if (onlyFiles.length === 0 && (expandedSubFolders.data ?? []).length === 0) return (
                                <div className="text-sm text-muted-foreground py-2">Nenhum documento nesta pasta.</div>
                              );
                              return onlyFiles.map((d) => (
                                <div
                                  key={`${d.id ?? d.url ?? d.name}`}
                                  className="flex items-center justify-between gap-3 rounded border p-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">{d.name}</div>
                                    {d.modifiedTime ? (
                                      <div className="text-xs text-muted-foreground truncate">{d.modifiedTime}</div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {canEdit && d.id ? (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={() => openSharesModal(d.id!, d.name, "file")}
                                        aria-label="Compartilhar arquivo"
                                        title="Compartilhar arquivo"
                                      >
                                        <Users className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : null}
                                    {canDelete && d.id ? (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => openDeleteDialog(
                                          d.id!, d.name, "file",
                                          async () => {
                                            await deleteDriveFile({ config: n8nConfig, fileId: d.id! });
                                            await expandedDocs.refetch();
                                          }
                                        )}
                                        aria-label="Excluir arquivo"
                                        title="Excluir arquivo"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : null}
                                    {d.url ? (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => window.open(d.url!, "_blank", "noopener,noreferrer")}
                                        aria-label="Abrir arquivo"
                                        title="Abrir arquivo"
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )
          ) : docs.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando documentos...
            </div>
          ) : docs.isError ? (
            <div className="text-sm text-destructive">
              {docs.error instanceof Error ? docs.error.message : "Erro ao carregar documentos."}
            </div>
          ) : docs.data.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhum documento encontrado nesta pasta.
            </div>
          ) : (
            <div className="space-y-2">
              {shownDocs.map((d) => (
                <div key={`${d.id ?? d.url ?? d.name}`} className="flex items-center justify-between gap-3 rounded border p-2">
                  <div className="min-w-0 flex-1">
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium truncate block hover:underline hover:text-primary"
                        title={`Abrir ${d.name}`}
                      >
                        {d.name}
                      </a>
                    ) : (
                      <div className="text-sm font-medium truncate">{d.name}</div>
                    )}
                    {d.modifiedTime ? <div className="text-xs text-muted-foreground truncate">{d.modifiedTime}</div> : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canEdit && d.id ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openSharesModal(d.id!, d.name, "file")}
                        aria-label="Compartilhar arquivo"
                        title="Compartilhar arquivo"
                      >
                        <Users className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {canDelete && d.id ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(
                          d.id!,
                          d.name,
                          "file",
                          async () => {
                            await deleteDriveFile({ config: n8nConfig, fileId: d.id! });
                            await docs.refetch();
                          }
                        )}
                        aria-label="Excluir arquivo"
                        title="Excluir arquivo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {d.url ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => window.open(d.url!, "_blank", "noopener,noreferrer")}
                        aria-label="Abrir documento"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {showMoreVisible ? (
                <Button variant="outline" size="sm" onClick={() => setShowAllDocs(true)}>
                  Ver mais
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: nova subpasta na pasta raiz */}
      <Dialog open={newFolderDialog} onOpenChange={setNewFolderDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova subpasta</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nome da subpasta *</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Ex: Contratos 2026"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) void createFolder(newFolderName);
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialog(false)}>Cancelar</Button>
            <Button onClick={() => void createFolder(newFolderName)} disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nova subpasta dentro de uma subpasta expandida */}
      <Dialog open={subSubFolderDialog} onOpenChange={setSubSubFolderDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova subpasta em "{expandedFolderName}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nome da subpasta *</Label>
            <Input
              value={subSubFolderName}
              onChange={(e) => setSubSubFolderName(e.target.value)}
              placeholder="Ex: 2026"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && subSubFolderName.trim()) void createSubSubFolder();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubSubFolderDialog(false)}>Cancelar</Button>
            <Button onClick={() => void createSubSubFolder()} disabled={subSubCreating || !subSubFolderName.trim()}>
              {subSubCreating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de compartilhamentos (pasta ou arquivo) */}
      {sharesTargetId ? (
        <DriveSharesModal
          open={sharesModal}
          onOpenChange={setSharesModal}
          itemId={sharesTargetId}
          itemName={sharesTargetName}
          itemType={sharesTargetType}
          onShare={async (email, role) => {
            if (sharesTargetType === "file") {
              await shareDriveFile({ config: n8nConfig, fileId: sharesTargetId, name: sharesTargetName, email, role });
            } else {
              await shareDriveFolder({ config: n8nConfig, folderId: sharesTargetId, name: sharesTargetName, email, role });
            }
          }}
          onRevoke={async (email) => {
            await revokeDriveFolderAccess({ config: n8nConfig, folderId: sharesTargetId, email });
          }}
        />
      ) : null}

      {/* Dialog: confirmar exclusão com PIN + justificativa */}
      <DriveDeleteConfirmDialog
        open={deleteDialog}
        onOpenChange={setDeleteDialog}
        itemName={deleteTargetName}
        itemType={deleteTargetType}
        onConfirm={deleteAction ?? (() => Promise.resolve())}
      />
    </>
  );
}
