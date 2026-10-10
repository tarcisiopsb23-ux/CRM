/**
 * ContentAssetGallery
 *
 * Galeria de assets de um item de conteúdo.
 * Exibe assets já processados (status = 'ready') com preview embed
 * (Vimeo player ou Google Docs Viewer para imagens/docs).
 * Assets em processing mostram spinner.
 * Assets com erro mostram mensagem.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge }     from "@/components/ui/badge";
import { Button }    from "@/components/ui/button";
import { Skeleton }  from "@/components/ui/skeleton";
import {
  Film, Image, FileText, File, ExternalLink, Download, Loader2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ContentAsset {
  id:                string;
  file_name:         string;
  file_type:         string | null;
  mime_type:         string | null;
  file_size:         number | null;
  is_final:          boolean;
  version:           number;
  external_provider: string | null;
  external_id:       string | null;
  embed_url:         string | null;
  view_url:          string | null;
  thumbnail_url:     string | null;
  status:            "staging" | "processing" | "ready" | "error";
  error_message:     string | null;
  uploader_type:     string | null;
  created_at:        string;
}

function getIcon(fileType: string | null) {
  if (fileType === "video")    return Film;
  if (fileType === "image")    return Image;
  if (fileType === "pdf")      return FileText;
  return File;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ── Componente de um asset ────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: ContentAsset }) {
  const Icon = getIcon(asset.file_type);

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden bg-card",
      asset.is_final && "ring-2 ring-primary/30",
    )}>
      {/* Preview area */}
      <div className="relative bg-muted/40 flex items-center justify-center" style={{ minHeight: "160px" }}>
        {asset.status === "processing" && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs">Processando...</span>
          </div>
        )}

        {asset.status === "error" && (
          <div className="flex flex-col items-center gap-2 text-red-500 py-8">
            <AlertCircle className="h-8 w-8" />
            <span className="text-xs text-center px-2">{asset.error_message ?? "Erro no processamento"}</span>
          </div>
        )}

        {asset.status === "ready" && (
          <>
            {/* Vimeo embed */}
            {asset.external_provider === "vimeo" && asset.embed_url && (
              <iframe
                src={asset.embed_url}
                className="w-full"
                style={{ height: "180px", border: "none" }}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                title={asset.file_name}
              />
            )}

            {/* Imagem via Google Drive */}
            {asset.external_provider === "google_drive" && asset.file_type === "image" && asset.embed_url && (
              <iframe
                src={asset.embed_url}
                className="w-full"
                style={{ height: "180px", border: "none" }}
                title={asset.file_name}
              />
            )}

            {/* PDF/doc via Google Drive Viewer */}
            {asset.external_provider === "google_drive" && asset.file_type !== "image" && asset.embed_url && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Icon className="h-10 w-10" />
                <span className="text-xs text-center px-2">{asset.file_name}</span>
              </div>
            )}

            {/* Thumbnail quando disponível */}
            {!asset.embed_url && asset.thumbnail_url && (
              <img
                src={asset.thumbnail_url}
                alt={asset.file_name}
                className="object-cover w-full h-full"
                style={{ maxHeight: "180px" }}
              />
            )}

            {/* Fallback: ícone */}
            {!asset.embed_url && !asset.thumbnail_url && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Icon className="h-10 w-10" />
              </div>
            )}
          </>
        )}

        {/* Badge "Arte Final" */}
        {asset.is_final && (
          <div className="absolute top-2 left-2">
            <Badge className="text-[10px] bg-primary/90 text-primary-foreground px-1.5 py-0">
              Arte Final
            </Badge>
          </div>
        )}

        {/* Badge versão */}
        {asset.version > 1 && (
          <div className="absolute top-2 right-2">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              v{asset.version}
            </Badge>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-medium truncate">{asset.file_name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px] px-1 py-0">
            {asset.external_provider === "vimeo"        ? "Vimeo"
           : asset.external_provider === "google_drive" ? "Drive"
           : asset.file_type ?? "arquivo"}
          </Badge>
          {asset.file_size && <span>{formatSize(asset.file_size)}</span>}
          <span className="ml-auto capitalize">
            {asset.uploader_type === "agency"  ? "Agência"
           : asset.uploader_type === "client"  ? "Cliente"
           : asset.uploader_type === "partner" ? "Parceiro"
           : ""}
          </span>
        </div>

        {/* Ações */}
        {asset.status === "ready" && (
          <div className="flex gap-1.5 pt-1">
            {asset.view_url && (
              <Button size="sm" variant="outline" className="h-7 text-xs px-2 flex-1" asChild>
                <a href={asset.view_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />Ver
                </a>
              </Button>
            )}
            {asset.embed_url && asset.external_provider !== "vimeo" && (
              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" asChild>
                <a href={asset.embed_url} target="_blank" rel="noopener noreferrer">
                  <Download className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Galeria ───────────────────────────────────────────────────────────────────

interface ContentAssetGalleryProps {
  itemId:   string;
  /** Recarrega automaticamente quando true */
  refetch?: boolean;
}

export function ContentAssetGallery({ itemId, refetch }: ContentAssetGalleryProps) {
  const qc = useQueryClient();

  const { data: assets = [], isLoading } = useQuery({
    queryKey:  ["content-item-assets", itemId],
    enabled:   !!itemId,
    staleTime: 0,
    queryFn:   async (): Promise<ContentAsset[]> => {
      const { data, error } = await supabase
        .from("content_assets")
        .select("*")
        .eq("content_item_id", itemId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContentAsset[];
    },
  });

  // Realtime: actualiza a galeria quando o n8n callback chegar
  useEffect(() => {
    if (!itemId) return;
    const channel = supabase
      .channel(`gallery-${itemId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "content_assets", filter: `content_item_id=eq.${itemId}` },
        () => { qc.invalidateQueries({ queryKey: ["content-item-assets", itemId] }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId, qc]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-52 rounded-xl" />)}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
        <File className="h-10 w-10 opacity-30" />
        <p className="text-sm">Nenhum asset ainda.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {assets.map(asset => (
        <AssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  );
}
