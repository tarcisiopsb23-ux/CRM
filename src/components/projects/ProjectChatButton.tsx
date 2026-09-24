import { useState } from "react";
import { MessageSquare, MessageSquarePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface ProjectChatButtonProps {
  projectId: string;
  linkedConversationId: string | null;
  onConversationReady?: (conversationId: string) => void;
}

export function ProjectChatButton({
  projectId,
  linkedConversationId: initialLinkedId,
  onConversationReady,
}: ProjectChatButtonProps) {
  const [loading, setLoading] = useState(false);
  // Track locally after creation so button switches without needing page reload
  const [localConvId, setLocalConvId] = useState<string | null>(initialLinkedId);

  const linkedConversationId = localConvId ?? initialLinkedId;

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("create_project_chat_group", {
        p_project_id: projectId,
      });
      if (error) throw error;
      const convId = data as string;
      setLocalConvId(convId);
      toast.success("Grupo de chat do projeto criado!");
      onConversationReady?.(convId);
    } catch (err: unknown) {
      toast.error("Erro ao criar grupo de chat");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    if (linkedConversationId) {
      onConversationReady?.(linkedConversationId);
    }
  };

  if (linkedConversationId) {
    return (
      <Button variant="outline" size="sm" onClick={handleOpen} className="gap-1.5">
        <MessageSquare className="h-4 w-4" />
        Abrir chat do projeto
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCreate}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MessageSquarePlus className="h-4 w-4" />
      )}
      Criar grupo de chat
    </Button>
  );
}
