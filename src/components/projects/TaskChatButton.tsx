import { useState } from "react";
import { MessageSquare, MessageSquarePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface TaskChatButtonProps {
  taskId: string;
  taskTitle: string;
  linkedConversationId: string | null;
  onConversationReady?: (conversationId: string) => void;
  size?: "sm" | "icon";
}

export function TaskChatButton({
  taskId,
  taskTitle,
  linkedConversationId: initialLinkedId,
  onConversationReady,
  size = "sm",
}: TaskChatButtonProps) {
  const [loading, setLoading] = useState(false);
  const [localConvId, setLocalConvId] = useState<string | null>(initialLinkedId);

  const linkedConversationId = localConvId ?? initialLinkedId;

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("create_task_chat_group", {
        p_task_id: taskId,
      });
      if (error) throw error;
      const convId = data as string;
      setLocalConvId(convId);
      toast.success(`Chat da tarefa "${taskTitle}" criado!`);
      onConversationReady?.(convId);
    } catch (err: unknown) {
      toast.error("Erro ao criar chat da tarefa");
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

  if (size === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 ${linkedConversationId ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
        onClick={linkedConversationId ? handleOpen : handleCreate}
        disabled={loading}
        title={linkedConversationId ? "Abrir chat da tarefa" : "Criar chat da tarefa"}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : linkedConversationId ? (
          <MessageSquare className="h-4 w-4" />
        ) : (
          <MessageSquarePlus className="h-4 w-4" />
        )}
      </Button>
    );
  }

  if (linkedConversationId) {
    return (
      <Button variant="outline" size="sm" onClick={handleOpen} className="gap-1.5">
        <MessageSquare className="h-4 w-4" />
        Abrir chat
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
      Criar chat
    </Button>
  );
}
