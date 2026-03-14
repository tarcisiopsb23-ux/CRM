import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import type { N8nConfig } from "@/types/settings";
import { ExternalLink, FileUp, Folder, FolderOpen, Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import {
  createDriveFolder,
  extractDriveFolderId,
  listDriveFolderDocuments,
  listDriveFolderFolders,
  normalizeDriveFolderUrl,
  uploadDriveFolderDocument,
} from "@/lib/driveDocuments";

type Props = {
  title?: string;
  folderValue: string | null | undefined;
  canEdit?: boolean;
  variant?: "flat" | "folders";
  actionsDisplay?: "text" | "icons";
  limit?: number;
  allowCreateFolder?: boolean;
  createFolderParentValue?: string | null | undefined;
  createFolderName?: string;
  onSetFolderValue?: (next: string) => Promise<void> | void;
};

export function DocumentsCard({
  title = "Documentos",
  folderValue,
  canEdit,
  variant = "flat",
  actionsDisplay = "text",
  limit,
  allowCreateFolder,
  createFolderParentValue,
  createFolderName,
  onSetFolderValue,
}: Props) {
  const orgId = useOrganization();
  const { data: n8nIntegration } = useIntegration(orgId, "n8n");
  const n8nConfig = (n8nIntegration as { config?: N8nConfig } | null)?.config;

  const normalizedFolderUrl = useMemo(() => normalizeDriveFolderUrl(folderValue), [folderValue]);
  const folderId = useMemo(() => extractDriveFolderId(folderValue), [folderValue]);
  const createParentId = useMemo(() => extractDriveFolderId(createFolderParentValue), [createFolderParentValue]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);

  const docs = useQuery({
    queryKey: ["drive-documents", orgId, folderId],
    queryFn: async () => {
      if (!folderId) return [];
      return listDriveFolderDocuments({ config: n8nConfig, folderId });
    },
    enabled: variant === "flat" && !!orgId && !!folderId,
  });

  const folders = useQuery({
    queryKey: ["drive-folders", orgId, folderId],
    queryFn: async () => {
      if (!folderId) return [];
      return listDriveFolderFolders({ config: n8nConfig, folderId });
    },
    enabled: variant === "folders" && !!orgId && !!folderId,
  });

  const expandedDocs = useQuery({
    queryKey: ["drive-documents", orgId, expandedFolderId],
    queryFn: async () => {
      if (!expandedFolderId) return [];
      return listDriveFolderDocuments({ config: n8nConfig, folderId: expandedFolderId });
    },
    enabled: variant === "folders" && !!orgId && !!expandedFolderId,
  });

  const pickFile = () => fileInputRef.current?.click();

  const upload = async (file: File) => {
    const targetFolderId = variant === "folders" && expandedFolderId ? expandedFolderId : folderId;
    if (!targetFolderId) return;
    setUploading(true);
    try {
      await uploadDriveFolderDocument({ config: n8nConfig, folderId: targetFolderId, file });
      toast("Documento enviado.");
      if (variant === "folders") await expandedDocs.refetch();
      else await docs.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar documento.";
      toast(msg);
    } finally {
      setUploading(false);
    }
  };

  const refresh = async () => {
    if (variant === "folders") {
      await folders.refetch();
      if (expandedFolderId) await expandedDocs.refetch();
      return;
    }
    await docs.refetch();
  };

  const canCreateAnyFolder = !!allowCreateFolder && !!canEdit && (!!folderId || !!createParentId);

  const createFolder = async () => {
    const parentFolderId = folderId ?? createParentId;
    if (!parentFolderId) return;

    const isRootFolderCreation = !folderId && !!createParentId;
    const name =
      (isRootFolderCreation ? (createFolderName ?? "").trim() : "") ||
      (isRootFolderCreation ? "Nova pasta" : "") ||
      String(window.prompt("Nome da pasta:", "Nova pasta") ?? "").trim();

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
      const msg = err instanceof Error ? err.message : "Erro ao criar pasta.";
      toast(msg);
    } finally {
      setCreatingFolder(false);
    }
  };

  const shownDocs = useMemo(() => {
    const list = docs.data ?? [];
    if (!limit || showAllDocs) return list;
    return list.slice(0, limit);
  }, [docs.data, limit, showAllDocs]);

  const showMoreVisible = !!limit && !showAllDocs && (docs.data?.length ?? 0) > limit;

  const actionButtonProps = actionsDisplay === "icons" ? { size: "icon" as const } : { size: "sm" as const };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {folderId ? (
            <Button
              {...actionButtonProps}
              variant="outline"
              onClick={() => {
                const url = normalizedFolderUrl ?? folderValue;
                if (url) window.open(url, "_blank", "noopener,noreferrer");
              }}
              disabled={!normalizedFolderUrl && !folderValue}
            >
              <FolderOpen className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"}`} />
              {actionsDisplay === "icons" ? null : "Abrir pasta"}
            </Button>
          ) : null}
          {canCreateAnyFolder ? (
            <Button {...actionButtonProps} variant="outline" onClick={createFolder} disabled={creatingFolder}>
              {creatingFolder ? (
                <Loader2 className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"} animate-spin`} />
              ) : (
                <Folder className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"}`} />
              )}
              {actionsDisplay === "icons" ? null : folderId ? "Nova pasta" : "Criar pasta"}
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
          <Button {...actionButtonProps} onClick={pickFile} disabled={!canEdit || !folderId || uploading}>
            {uploading ? (
              <Loader2 className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"} animate-spin`} />
            ) : (
              <FileUp className={`h-4 w-4 ${actionsDisplay === "icons" ? "" : "mr-2"}`} />
            )}
            {actionsDisplay === "icons" ? null : "Novo documento"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!folderId ? (
          <div className="text-sm text-muted-foreground">
            {allowCreateFolder && createParentId
              ? "Crie a pasta para começar a listar e enviar documentos."
              : "Pasta não configurada. Defina a pasta em Configurações gerais."}
          </div>
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
                    <button
                      type="button"
                      onClick={() => setExpandedFolderId(expanded ? null : f.id)}
                      className="w-full flex items-center justify-between gap-3 p-2 text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {expanded ? <Minus className="h-4 w-4 shrink-0" /> : <Plus className="h-4 w-4 shrink-0" />}
                        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="text-sm font-medium truncate">{f.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {f.modifiedTime ? String(f.modifiedTime) : ""}
                      </div>
                    </button>

                    {expanded ? (
                      <div className="border-t p-2">
                        {expandedDocs.isLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando documentos...
                          </div>
                        ) : expandedDocs.isError ? (
                          <div className="text-sm text-destructive">
                            {expandedDocs.error instanceof Error ? expandedDocs.error.message : "Erro ao carregar documentos."}
                          </div>
                        ) : expandedDocs.data.length === 0 ? (
                          <div className="text-sm text-muted-foreground">Nenhum documento nesta pasta.</div>
                        ) : (
                          <div className="space-y-2">
                            {expandedDocs.data.map((d) => (
                              <div
                                key={`${d.id ?? d.url ?? d.name}`}
                                className="flex items-center justify-between gap-3 rounded border p-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">{d.name}</div>
                                  {d.modifiedTime ? <div className="text-xs text-muted-foreground truncate">{d.modifiedTime}</div> : null}
                                </div>
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
                            ))}
                          </div>
                        )}
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
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{d.name}</div>
                  {d.modifiedTime ? <div className="text-xs text-muted-foreground truncate">{d.modifiedTime}</div> : null}
                </div>
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
  );
}
