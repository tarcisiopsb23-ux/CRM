/**
 * ContentCommentThread
 *
 * Thread de comentários com replies, resolução e indicador de comentários internos.
 * Usa Realtime via useContentComments (subscription automática).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, CornerDownRight, Lock, Loader2, MessageSquare } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useContentComments, type ContentComment } from "@/hooks/useContentComments";

// ── Avatar helper ──────────────────────────────────────────────────────────────

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

function authorColor(type: ContentComment["author_type"]) {
  return type === "client"  ? "bg-violet-600"
       : type === "partner" ? "bg-amber-600"
       : "bg-blue-600";
}

// ── Componente de um comentário (com replies) ─────────────────────────────────

function CommentItem({
  comment,
  replies,
  onReply,
  onResolve,
  showInternal,
}: {
  comment:      ContentComment;
  replies:      ContentComment[];
  onReply:      (parentId: string) => void;
  onResolve:    (commentId: string, resolved: boolean) => void;
  showInternal: boolean;
}) {
  if (comment.is_internal && !showInternal) return null;

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2",
      comment.is_internal
        ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40"
        : "bg-card border-border/60",
      comment.resolved && "opacity-60",
    )}>
      {/* Cabeçalho */}
      <div className="flex items-start gap-2">
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarFallback className={cn("text-[10px] text-white", authorColor(comment.author_type))}>
            {initials(comment.author_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-foreground truncate">
              {comment.author_name ?? "Anônimo"}
            </span>
            {comment.author_type !== "agency" && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 border-muted-foreground/30">
                {comment.author_type === "client" ? "Cliente" : "Parceiro"}
              </Badge>
            )}
            {comment.is_internal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                    <Lock className="h-2.5 w-2.5" /> Interno
                  </span>
                </TooltipTrigger>
                <TooltipContent>Visível apenas para a equipe da agência</TooltipContent>
              </Tooltip>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {format(parseISO(comment.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>
          <p className="text-sm text-foreground/90 mt-0.5 whitespace-pre-wrap break-words">
            {comment.body}
          </p>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 pl-8">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => onReply(comment.id)}
        >
          <CornerDownRight className="h-3 w-3 mr-1" />
          Responder
        </Button>
        {!comment.is_internal && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-2 text-[11px]",
              comment.resolved
                ? "text-emerald-600 hover:text-emerald-700"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onResolve(comment.id, !comment.resolved)}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {comment.resolved ? "Resolvido" : "Resolver"}
          </Button>
        )}
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="pl-4 border-l-2 border-border/40 space-y-2 ml-3">
          {replies.map(reply => (
            <div key={reply.id} className="flex items-start gap-2 pt-1">
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarFallback className={cn("text-[9px] text-white", authorColor(reply.author_type))}>
                  {initials(reply.author_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium">{reply.author_name ?? "Anônimo"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(parseISO(reply.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">{reply.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Thread principal ──────────────────────────────────────────────────────────

export function ContentCommentThread({ itemId }: { itemId: string }) {
  const { rootComments, threads, loading, add, resolve, isAdding } = useContentComments(itemId);

  const [newComment,   setNewComment]   = useState("");
  const [isInternal,   setIsInternal]   = useState(false);
  const [replyTo,      setReplyTo]      = useState<string | null>(null);
  const [showInternal, setShowInternal] = useState(true);

  async function handleSubmit() {
    const body = newComment.trim();
    if (!body) return;
    try {
      await add({ body, parentId: replyTo ?? undefined, isInternal });
      setNewComment("");
      setReplyTo(null);
    } catch {
      toast.error("Falha ao enviar comentário");
    }
  }

  async function handleResolve(commentId: string, resolved: boolean) {
    try {
      await resolve({ commentId, resolved });
    } catch {
      toast.error("Falha ao atualizar comentário");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando comentários...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtro: mostrar internos */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>{rootComments.length} comentário{rootComments.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-internal"
            checked={showInternal}
            onCheckedChange={setShowInternal}
            className="scale-75"
          />
          <Label htmlFor="show-internal" className="text-xs text-muted-foreground cursor-pointer">
            Mostrar internos
          </Label>
        </div>
      </div>

      {/* Lista de comentários */}
      <div className="space-y-3">
        {rootComments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum comentário ainda.
          </p>
        ) : (
          rootComments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={threads[comment.id]?.slice(1) ?? []}
              onReply={setReplyTo}
              onResolve={handleResolve}
              showInternal={showInternal}
            />
          ))
        )}
      </div>

      {/* Input de novo comentário */}
      <div className="border-t border-border/60 pt-3 space-y-2">
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CornerDownRight className="h-3 w-3" />
            <span>Respondendo...</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[11px] ml-auto"
              onClick={() => setReplyTo(null)}
            >
              Cancelar
            </Button>
          </div>
        )}
        <Textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder={replyTo ? "Escreva uma resposta..." : "Adicione um comentário..."}
          className="text-sm min-h-[80px] resize-none"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
          }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="is-internal"
              checked={isInternal}
              onCheckedChange={setIsInternal}
              className="scale-75"
            />
            <Label htmlFor="is-internal" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
              <Lock className="h-3 w-3" /> Interno (só agência)
            </Label>
          </div>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newComment.trim() || isAdding}
          >
            {isAdding && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Comentar
          </Button>
        </div>
      </div>
    </div>
  );
}
