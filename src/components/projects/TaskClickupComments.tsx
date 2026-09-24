/**
 * TaskClickupComments
 * Seção de comentários bidirecionais entre Maestr.IA e ClickUp.
 * - Comentários internos (source='internal') são enviados ao ClickUp via webhook
 * - Comentários externos (source='clickup') chegam via n8n e são exibidos com badge
 * - Realtime: atualiza automaticamente quando o n8n insere novos comentários
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Loader2, MessageSquare, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Comment {
  id: string;
  source: "internal" | "clickup";
  author_profile_id: string | null;
  author_name: string;
  author_email: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface TaskClickupCommentsProps {
  taskId: string;
  taskTitle: string;
  organizationId: string;
  clickupTaskId: string | null;
  /** Webhook n8n para enviar comentário ao ClickUp */
  clickupWebhookUrl: string | null;
  /** Callback para atualizar badge externo (ex: botão na lista de tarefas) */
  onUnreadCountChange?: (count: number) => void;
}

export function TaskClickupComments({
  taskId,
  taskTitle,
  organizationId,
  clickupTaskId,
  clickupWebhookUrl,
  onUnreadCountChange,
}: TaskClickupCommentsProps) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const queryKey = ["task_clickup_comments", taskId];

  // Busca comentários
  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_clickup_comments")
        .select("id, source, author_profile_id, author_name, author_email, content, is_read, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
    enabled: !!taskId,
  });

  const unreadCount = comments.filter(c => c.source === "clickup" && !c.is_read).length;

  // Notifica o pai sobre mudança de não lidos
  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  // Marca como lidos ao abrir
  useEffect(() => {
    if (!taskId || unreadCount === 0) return;
    supabase.rpc("mark_clickup_comments_read", { p_task_id: taskId }).then(() => {
      qc.invalidateQueries({ queryKey });
    });
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — atualiza quando n8n insere comentário do ClickUp
  useEffect(() => {
    const channel = supabase
      .channel(`task_clickup_comments_${taskId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_clickup_comments", filter: `task_id=eq.${taskId}` },
        (payload) => {
          const comment = payload.new as Comment;
          qc.setQueryData(queryKey, (old: Comment[] = []) => [...old, comment]);
          if (comment.source === "clickup") {
            toast.info(`Novo comentário do ClickUp em "${taskTitle}"`, { duration: 4000 });
            // Marca como lido imediatamente se a seção está aberta
            supabase.rpc("mark_clickup_comments_read", { p_task_id: taskId });
          }
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll para o fim ao carregar
  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [isLoading]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      // 1. Salva no banco como comentário interno
      const { data: inserted, error } = await supabase
        .from("task_clickup_comments")
        .insert({
          organization_id: organizationId,
          task_id: taskId,
          source: "internal",
          author_profile_id: profile?.id ?? null,
          author_name: profile?.full_name ?? "Usuário",
          author_email: profile?.email ?? null,
          content,
          is_read: true,
        })
        .select("id, source, author_profile_id, author_name, author_email, content, is_read, created_at")
        .single();

      if (error) throw error;

      // Atualiza UI imediatamente
      qc.setQueryData(queryKey, (old: Comment[] = []) => [...old, inserted as Comment]);
      setText("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

      // 2. Envia ao ClickUp via webhook (fire-and-forget)
      if (clickupTaskId && clickupWebhookUrl) {
        fetch(clickupWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "post_comment",
            clickup_task_id: clickupTaskId,
            task_id: taskId,
            comment_id: (inserted as any).id,
            author_name: profile?.full_name ?? "Usuário",
            content,
          }),
        }).catch(() => {});
      }
    } catch {
      toast.error("Erro ao enviar comentário.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[300px] max-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-2 border-b mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold">Comentários ClickUp</span>
          {unreadCount > 0 && (
            <Badge className="bg-emerald-600 text-white text-[10px] h-4 px-1.5">{unreadCount} novo(s)</Badge>
          )}
        </div>
        {clickupTaskId && (
          <a
            href={`https://app.clickup.com/t/${clickupTaskId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Abrir no ClickUp
          </a>
        )}
      </div>

      {/* Lista de comentários */}
      <div className="flex-1 overflow-y-auto space-y-3 px-1 py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-20" />
            <p className="text-sm">Nenhum comentário ainda.</p>
            {!clickupTaskId && (
              <p className="text-xs text-center">Crie esta tarefa no ClickUp para habilitar comentários bidirecionais.</p>
            )}
          </div>
        ) : (
          comments.map(c => (
            <div
              key={c.id}
              className={`flex gap-2.5 ${c.source === "internal" ? "flex-row-reverse" : "flex-row"}`}
            >
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                <AvatarFallback className={`text-[10px] ${c.source === "clickup" ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"}`}>
                  {c.author_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className={`flex flex-col gap-0.5 max-w-[80%] ${c.source === "internal" ? "items-end" : "items-start"}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground">{c.author_name}</span>
                  {c.source === "clickup" && (
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-emerald-600 border-emerald-300">ClickUp</Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
                <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  c.source === "internal"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  {c.content}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Campo de envio */}
      <div className="shrink-0 pt-2 border-t mt-2">
        {!clickupTaskId && (
          <p className="text-[10px] text-amber-600 mb-1.5">
            Tarefa não criada no ClickUp — comentários não serão sincronizados.
          </p>
        )}
        <div className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={clickupTaskId ? "Escreva um comentário... (Enter para enviar)" : "Escreva um comentário interno..."}
            className="resize-none text-sm min-h-[60px] max-h-[120px]"
            rows={2}
            disabled={sending}
          />
          <Button
            size="icon"
            className="h-auto self-end mb-0.5 shrink-0"
            onClick={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
