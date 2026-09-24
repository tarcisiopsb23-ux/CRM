import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface SyncOptions {
  webhookUrl: string | null | undefined;
  table: "projects" | "tasks";
  item: {
    id: string;
    title: string;
    description?: string | null;
    status?: string | null;
    priority?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    clickup_task_id?: string | null;
    clickup_list_id?: string | null;
    is_freelancer?: boolean;
    supplier_id?: string | null;
    organization_id?: string;
    project_id?: string;
    [key: string]: unknown;
  };
  /** clickup_list_id do projeto pai (para tasks) */
  parentClickupListId?: string | null;
}

/**
 * Hook para sincronização manual com ClickUp.
 * Verifica se já existe uma task no ClickUp para o item,
 * se sim faz apenas vinculação, se não cria e vincula.
 */
export function useClickupSync() {
  const [syncing, setSyncing] = useState<string | null>(null); // item id sendo sincronizado

  const syncItem = async ({ webhookUrl, table, item, parentClickupListId }: SyncOptions) => {
    if (!webhookUrl) {
      toast.error("Configure o Webhook URL do ClickUp nas configurações.");
      return;
    }

    setSyncing(item.id);
    try {
      // Determina o clickup_list_id a usar
      const clickupListId = item.clickup_list_id ?? parentClickupListId ?? null;

      // Se já tem clickup_task_id, verifica se ainda existe no ClickUp
      if (item.clickup_task_id) {
        // Dispara update para re-vincular/atualizar
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            table,
            item: { ...item, clickup_list_id: clickupListId },
          }),
        });
        toast.success("Sincronização com ClickUp iniciada!");
      } else {
        // Não tem clickup_task_id — verifica no ClickUp por custom field ou cria novo
        // Dispara create — o n8n vai criar e salvar o ID de volta
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            table,
            item: { ...item, clickup_list_id: clickupListId },
          }),
        });
        toast.success("Criação no ClickUp iniciada! O ID será vinculado automaticamente.");
      }
    } catch {
      toast.error("Erro ao comunicar com o n8n. Verifique a URL do webhook.");
    } finally {
      setSyncing(null);
    }
  };

  return { syncItem, syncing };
}
