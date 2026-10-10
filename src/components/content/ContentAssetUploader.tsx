/**
 * ContentAssetUploader
 *
 * Upload de assets para um item de conteúdo.
 * Envia para a Edge Function content-upload-asset, que salva no bucket
 * content-staging e dispara o webhook n8n para processamento (Drive/Vimeo).
 *
 * Exibe progresso em tempo real via Supabase Realtime channel
 * (content-assets:{itemId}) — quando o n8n conclui, o asset aparece como "ready".
 */

import { useState, useCallback, useEffect } from "react";
import { Button }   from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge }    from "@/components/ui/badge";
import { Switch }   from "@/components/ui/switch";
import { Label }    from "@/components/ui/label";
import {
  Upload, X, Film, Image, FileText, File, CheckCircle2, Loader2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

const UPLOAD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-upload-asset`;

const MAX_VIDEO = 500 * 1024 * 1024; // 500 MB
const MAX_OTHER = 50  * 1024 * 1024; // 50 MB

function getFileIcon(mime: string) {
  if (mime.startsWith("video/")) return Film;
  if (mime.startsWith("image/")) return Image;
  if (mime === "application/pdf") return FileText;
  return File;
}

function formatSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

type UploadStatus = "idle" | "uploading" | "processing" | "ready" | "error";

interface FileEntry {
  file:     File;
  status:   UploadStatus;
  assetId?: string;
  error?:   string;
  isFinal:  boolean;
  progress: number;
}

interface ContentAssetUploaderProps {
  itemId:      string;
  accessToken: string;
  /** Chamado quando algum asset muda para "ready" */
  onUploadComplete?: () => void;
}

export function ContentAssetUploader({
  itemId,
  accessToken,
  onUploadComplete,
}: ContentAssetUploaderProps) {
  const qc = useQueryClient();
  const [entries,   setEntries]   = useState<FileEntry[]>([]);
  const [dragging,  setDragging]  = useState(false);

  // ── Realtime: escuta o canal do n8n callback ─────────────────────────────
  useEffect(() => {
    if (!itemId) return;

    const channel = supabase
      .channel(`content-assets:${itemId}`)
      .on("broadcast", { event: "asset_updated" }, ({ payload }) => {
        const { asset_id, status } = payload as { asset_id: string; status: string };

        setEntries(prev => prev.map(e =>
          e.assetId === asset_id
            ? { ...e, status: status as UploadStatus, progress: status === "ready" ? 100 : e.progress }
            : e,
        ));

        if (status === "ready") {
          qc.invalidateQueries({ queryKey: ["content-item-assets", itemId] });
          onUploadComplete?.();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [itemId, qc, onUploadComplete]);

  // ── Seleciona arquivos ─────────────────────────────────────────────────────
  function addFiles(files: FileList | null) {
    if (!files) return;
    const newEntries: FileEntry[] = Array.from(files).map(file => ({
      file,
      status:   "idle",
      isFinal:  false,
      progress: 0,
    }));
    setEntries(prev => [...prev, ...newEntries]);
  }

  // ── Upload de um arquivo ───────────────────────────────────────────────────
  const uploadFile = useCallback(async (idx: number) => {
    const entry = entries[idx];
    if (!entry || entry.status !== "idle") return;

    const isVideo = entry.file.type.startsWith("video/");
    const maxSize = isVideo ? MAX_VIDEO : MAX_OTHER;

    if (entry.file.size > maxSize) {
      setEntries(prev => prev.map((e, i) =>
        i === idx ? { ...e, status: "error", error: `Arquivo excede ${formatSize(maxSize)}` } : e,
      ));
      return;
    }

    // Marca como uploading
    setEntries(prev => prev.map((e, i) =>
      i === idx ? { ...e, status: "uploading", progress: 10 } : e,
    ));

    try {
      const form = new FormData();
      form.append("file",            entry.file);
      form.append("content_item_id", itemId);
      form.append("is_final",        String(entry.isFinal));

      const res  = await fetch(UPLOAD_URL, {
        method:  "POST",
        headers: { "Authorization": `Bearer ${accessToken}` },
        body:    form,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Falha no upload");

      // Upload concluído — aguardando n8n processar (processing)
      setEntries(prev => prev.map((e, i) =>
        i === idx
          ? { ...e, status: "processing", assetId: data.asset_id, progress: 50 }
          : e,
      ));

      toast.success("Arquivo enviado. Processando...");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha no upload";
      setEntries(prev => prev.map((e, i) =>
        i === idx ? { ...e, status: "error", error: msg } : e,
      ));
      toast.error(msg);
    }
  }, [entries, itemId, accessToken]);

  // ── Upload de todos os pendentes ──────────────────────────────────────────
  async function uploadAll() {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].status === "idle") await uploadFile(i);
    }
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const pendingCount = entries.filter(e => e.status === "idle").length;
  const hasEntries   = entries.length > 0;

  return (
    <div className="space-y-4">
      {/* Área de drop */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border-2 border-dashed transition-colors cursor-pointer",
          "flex flex-col items-center justify-center gap-2 py-8 px-4 text-center",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border/60 hover:border-border hover:bg-muted/20",
        )}
        onClick={() => document.getElementById("asset-file-input")?.click()}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Arraste arquivos ou clique para selecionar</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Imagens, vídeos, PDFs e documentos &middot; Vídeo até 500 MB, outros até 50 MB
          </p>
        </div>
        <input
          id="asset-file-input"
          type="file"
          multiple
          accept="image/*,video/*,application/pdf,.doc,.docx,.ppt,.pptx"
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* Lista de arquivos */}
      {hasEntries && (
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const FileIcon = getFileIcon(entry.file.type);
            return (
              <div
                key={idx}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  entry.status === "ready"     && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/10",
                  entry.status === "error"     && "border-red-200 bg-red-50/50 dark:border-red-800/40 dark:bg-red-900/10",
                  entry.status === "processing"&& "border-blue-200 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-900/10",
                  entry.status === "uploading" && "border-border/60 bg-muted/20",
                  entry.status === "idle"      && "border-border/40 bg-card",
                )}
              >
                <FileIcon className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" />

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate flex-1">{entry.file.name}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{formatSize(entry.file.size)}</span>
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center gap-2">
                    {entry.status === "idle" && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`final-${idx}`}
                          checked={entry.isFinal}
                          onCheckedChange={v => setEntries(prev =>
                            prev.map((e, i) => i === idx ? { ...e, isFinal: v } : e),
                          )}
                          className="scale-75"
                        />
                        <Label htmlFor={`final-${idx}`} className="text-xs text-muted-foreground cursor-pointer">
                          Arte final
                        </Label>
                      </div>
                    )}
                    {entry.status === "uploading" && (
                      <Badge variant="outline" className="text-xs gap-1 border-blue-300 text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" /> Enviando...
                      </Badge>
                    )}
                    {entry.status === "processing" && (
                      <Badge variant="outline" className="text-xs gap-1 border-blue-300 text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" /> Processando (Drive/Vimeo)...
                      </Badge>
                    )}
                    {entry.status === "ready" && (
                      <Badge variant="outline" className="text-xs gap-1 border-emerald-400 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Pronto
                      </Badge>
                    )}
                    {entry.status === "error" && (
                      <Badge variant="outline" className="text-xs gap-1 border-red-400 text-red-600">
                        <AlertCircle className="h-3 w-3" /> {entry.error}
                      </Badge>
                    )}
                  </div>

                  {/* Progress bar */}
                  {(entry.status === "uploading" || entry.status === "processing") && (
                    <Progress
                      value={entry.progress}
                      className="h-1.5"
                    />
                  )}
                </div>

                {/* Remover / reenviar */}
                <div className="flex items-center gap-1 shrink-0">
                  {entry.status === "idle" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => uploadFile(idx)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {entry.status === "error" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
                      onClick={() => setEntries(prev => prev.map((e, i) =>
                        i === idx ? { ...e, status: "idle", error: undefined } : e,
                      ))}
                    >
                      Tentar novamente
                    </Button>
                  )}
                  {(entry.status === "idle" || entry.status === "error") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setEntries(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Botão enviar todos */}
      {pendingCount > 0 && (
        <Button className="w-full" onClick={uploadAll}>
          <Upload className="h-4 w-4 mr-2" />
          Enviar {pendingCount} arquivo{pendingCount !== 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
}
