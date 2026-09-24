/**
 * DriveFolderStatusAlert
 * Exibe um alerta listando registros sem pasta no Google Drive,
 * com botão para criar a pasta via webhook n8n ou vincular uma existente.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Link, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDriveFolder, type DriveFolderModule } from "@/hooks/useDriveFolder";
import { supabase } from "@/lib/supabase";
import { extractDriveFolderId, normalizeDriveFolderUrl } from "@/lib/driveDocuments";

interface RecordItem {
  id: string;
  name: string;
  company?: string | null;
  title?: string | null;
  full_name?: string | null;
  folder_id?: string | null;
  folder_url?: string | null;
  /** Fallback: metadata.drive_folder (ID ou URL) para registros antigos */
  metadata?: Record<string, unknown> | null;
  is_active?: boolean | null;
}

/** Verifica se um registro tem pasta — checa folder_id, folder_url direto, fallback em metadata e flag de criação pendente */
function hasDriveFolder(r: RecordItem): boolean {
  if (r.folder_id) return true;
  if (r.folder_url) return true;
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  // Pasta em processo de criação — webhook disparado mas n8n ainda não retornou o folder_id
  if (meta.drive_folder_pending === true) return true;
  const legacy = String(
    meta.drive_folder ?? meta.drive_folder_id ?? meta.drive_folder_url ??
    meta.folder ?? meta.pasta ?? ""
  ).trim();
  return !!legacy;
}

interface DriveFolderStatusAlertProps {
  organizationId: string;
  module: DriveFolderModule;
  /** Tabela do Supabase para atualizar folder_id/folder_url após criação */
  table: "clients" | "suppliers" | "projects" | "profiles";
  /** Query key para invalidar após criação */
  queryKey: string;
  records: RecordItem[];
  canEdit: boolean;
  label?: string;
  /** IDs com criação de pasta em andamento — suprime o alerta para esses registros */
  pendingIds?: Set<string>;
}

export function DriveFolderStatusAlert({
  organizationId,
  module,
  table,
  queryKey,
  records,
  canEdit,
  label = "registro(s)",
  pendingIds,
}: DriveFolderStatusAlertProps) {
  const qc = useQueryClient();
  const { triggerFolder, n8nConfig } = useDriveFolder(organizationId);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkValue, setLinkValue] = useState("");

  // Verifica se o webhook do módulo está configurado
  const webhookKeyMap: Record<DriveFolderModule, keyof typeof n8nConfig> = {
    client: "driveFolderClientWebhookUrl",
    supplier: "driveFolderSupplierWebhookUrl",
    project: "driveFolderProjectWebhookUrl",
    employee: "driveFolderEmployeeWebhookUrl",
  };
  const webhookConfigured = !!(n8nConfig as Record<string, unknown> | null | undefined)?.[webhookKeyMap[module]];

  if (!webhookConfigured || !canEdit) return null;

  const withoutFolder = records.filter(
    (r) => r.is_active !== false && !hasDriveFolder(r) && !pendingIds?.has(r.id)
  );

  if (withoutFolder.length === 0) return null;

  const handleCreate = async (record: RecordItem) => {
    setLoadingId(record.id);
    try {
      const result = await triggerFolder.mutateAsync({
        action: "create",
        module,
        record: {
          id: record.id,
          name: record.name,
          company: record.company ?? undefined,
          title: record.title ?? undefined,
          full_name: record.full_name ?? undefined,
        },
      });

      // Se o webhook retornar folder_id/folder_url, persiste nas colunas diretas
      const folderId = (result as Record<string, unknown>)?.folder_id as string | undefined;
      const folderUrl = (result as Record<string, unknown>)?.folder_url as string | undefined;
      if (folderId) {
        await supabase
          .from(table)
          .update({ folder_id: folderId, folder_url: folderUrl ?? null } as Record<string, unknown>)
          .eq("id", record.id);
      }

      toast.success(`Pasta criada para ${record.name}`);
      qc.invalidateQueries({ queryKey: [queryKey, organizationId] });
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao criar pasta no Drive");
    } finally {
      setLoadingId(null);
    }
  };

  const handleLink = async (record: RecordItem) => {
    const raw = linkValue.trim();
    if (!raw) return;
    const folderId = extractDriveFolderId(raw) ?? raw;
    const folderUrl = normalizeDriveFolderUrl(raw) ?? `https://drive.google.com/drive/folders/${folderId}`;
    setLoadingId(record.id);
    try {
      await supabase
        .from(table)
        .update({ folder_id: folderId, folder_url: folderUrl } as Record<string, unknown>)
        .eq("id", record.id);
      toast.success(`Pasta vinculada para ${record.name}`);
      qc.invalidateQueries({ queryKey: [queryKey, organizationId] });
      setLinkingId(null);
      setLinkValue("");
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao vincular pasta");
    } finally {
      setLoadingId(null);
    }
  };

  const moduleLabels: Record<DriveFolderModule, string> = {
    client: "cliente(s)",
    supplier: "fornecedor(es)",
    project: "projeto(s)",
    employee: "colaborador(es)",
  };

  const displayLabel = label !== "registro(s)" ? label : moduleLabels[module];

  return (
    <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-yellow-800 dark:text-yellow-200">
          {withoutFolder.length} {displayLabel} sem pasta vinculada no Google Drive
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {withoutFolder.map((record) => (
          <div key={record.id} className="space-y-1">
            {linkingId === record.id ? (
              <div className="flex gap-2 items-center">
                <Input
                  autoFocus
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  placeholder="Cole a URL ou ID da pasta do Google Drive"
                  className="text-xs h-7 bg-white dark:bg-zinc-900"
                  onKeyDown={(e) => { if (e.key === "Enter") void handleLink(record); if (e.key === "Escape") { setLinkingId(null); setLinkValue(""); } }}
                />
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => void handleLink(record)} disabled={loadingId === record.id || !linkValue.trim()}>
                  {loadingId === record.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-1 shrink-0" onClick={() => { setLinkingId(null); setLinkValue(""); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-1 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-yellow-400 text-yellow-800 hover:bg-yellow-100 dark:text-yellow-200 dark:hover:bg-yellow-900 text-xs h-7"
                  disabled={loadingId === record.id}
                  onClick={() => handleCreate(record)}
                >
                  {loadingId === record.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <FolderOpen className="h-3 w-3 mr-1" />
                  )}
                  Criar pasta — {record.name}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-yellow-700 dark:text-yellow-300 text-xs h-7"
                  onClick={() => { setLinkingId(record.id); setLinkValue(""); }}
                >
                  <Link className="h-3 w-3 mr-1" />
                  Já tenho pasta
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
