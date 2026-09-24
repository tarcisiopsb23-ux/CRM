import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClients } from "@/hooks/useClients";
import { useDriveFolder } from "@/hooks/useDriveFolder";
import type { Client } from "@/types/crm";

interface DriveFolderAlertProps {
  organizationId: string;
  canEdit: boolean;
}

function clientHasDriveFolder(client: Client): boolean {
  const meta = (client.metadata ?? {}) as Record<string, unknown>;
  const folderId = meta.drive_folder_id ?? meta.drive_folder ?? null;
  return !!folderId;
}

export function DriveFolderAlert({ organizationId, canEdit }: DriveFolderAlertProps) {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients(organizationId);
  const { triggerFolder, n8nConfig } = useDriveFolder(organizationId);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Only show when the Drive folder webhook is configured
  const webhookConfigured = !!n8nConfig?.driveFolderClientWebhookUrl;
  if (!webhookConfigured || !canEdit) return null;

  const clientsWithoutDrive = (clients as Client[]).filter(
    (c) => (c as any).is_active !== false && !clientHasDriveFolder(c)
  );

  if (clientsWithoutDrive.length === 0) return null;

  const handleCreateFolder = async (client: Client) => {
    setLoadingId(client.id);
    try {
      await triggerFolder.mutateAsync({
        action: "create",
        module: "client",
        record: {
          id: client.id,
          name: client.name,
          company: (client as unknown as { company?: string }).company,
        },
      });
      toast.success(`Pasta criada para ${client.name}`);
      qc.invalidateQueries({ queryKey: ["clients", organizationId] });
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao criar pasta no Drive");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-yellow-800 dark:text-yellow-200">
          {clientsWithoutDrive.length} cliente(s) sem pasta no Google Drive
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {clientsWithoutDrive.map((client) => (
            <Button
              key={client.id}
              size="sm"
              variant="outline"
              className="border-yellow-400 text-yellow-800 hover:bg-yellow-100 dark:text-yellow-200 dark:hover:bg-yellow-900 text-xs"
              disabled={loadingId === client.id}
              onClick={() => handleCreateFolder(client)}
            >
              {loadingId === client.id ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <FolderOpen className="h-3 w-3 mr-1" />
              )}
              {client.name}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
