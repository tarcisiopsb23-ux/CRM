/**
 * ClientApprovalPanel — painel de aprovação/reprovação do cliente.
 * Exibido como Sheet lateral ao clicar em um item aguardando aprovação.
 */

import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  Calendar, ExternalLink, MessageSquare,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { ClientCommentInput } from "./ClientCommentInput";
import { useClientContentComments } from "@/hooks/useClientContent";
import type { ClientContentItem, ClientApprovalDecision } from "@/hooks/useClientContent";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  post: "Post", reels: "Reels", story: "Story", carousel: "Carrossel",
  email: "E-mail", roteiro: "Roteiro", banner: "Banner", video: "Vídeo", outro: "Outro",
};

interface ClientApprovalPanelProps {
  item:       ClientContentItem | null;
  open:       boolean;
  onClose:    () => void;
  onDecision: (
    itemId:   string,
    decision: ClientApprovalDecision,
    notes:    string,
  ) => Promise<void>;
}

export function ClientApprovalPanel({
  item,
  open,
  onClose,
  onDecision,
}: ClientApprovalPanelProps) {
  const { auth }  = useClientAuth();
  const [notes,   setNotes]   = useState("");
  const [pending, setPending] = useState<ClientApprovalDecision | null>(null);

  const { comments, add: addComment, isAdding } = useClientContentComments(
    open ? item?.id : undefined,
  );

  async function handleDecision(decision: ClientApprovalDecision) {
    if (!item) return;
    if (decision !== "aprovado" && !notes.trim()) {
      toast.error("Descreva as alterações necessárias antes de enviar.");
      return;
    }
    setPending(decision);
    try {
      await onDecision(item.id, decision, notes);
      setNotes("");
      onClose();
      toast.success(
        decision === "aprovado"
          ? "Conteúdo aprovado!"
          : "Solicitação de alteração enviada.",
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar decisão");
    } finally {
      setPending(null);
    }
  }

  if (!item) return null;

  const needsApproval = item.status === "aguardando_aprovacao";

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-[#0F172A] border-[#1E293B] text-white flex flex-col p-0"
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-[#1E293B]">
          <div className="flex items-center gap-2 flex-wrap">
            {item.content_type && (
              <Badge variant="outline" className="text-[10px] px-1.5 border-[#334155] text-slate-400">
                {CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}
              </Badge>
            )}
            {item.platform && (
              <Badge variant="outline" className="text-[10px] px-1.5 border-[#334155] text-slate-400 capitalize">
                {item.platform}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 border-0 ml-auto",
                item.approval_status === "aprovado"             && "bg-emerald-900/40 text-emerald-300",
                item.approval_status === "pendente"             && "bg-violet-900/40 text-violet-300",
                item.approval_status === "reprovado"            && "bg-red-900/40 text-red-300",
                item.approval_status === "alteracao_solicitada" && "bg-orange-900/40 text-orange-300",
              )}
            >
              {item.approval_status === "aprovado"             && "Aprovado"}
              {item.approval_status === "pendente"             && "Aguardando aprovação"}
              {item.approval_status === "reprovado"            && "Reprovado"}
              {item.approval_status === "alteracao_solicitada" && "Alteração solicitada"}
            </Badge>
          </div>
          <SheetTitle className="text-white text-base leading-snug mt-1">
            {item.title}
          </SheetTitle>
          {item.scheduled_date && (
            <SheetDescription className="text-slate-400 text-xs flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Publicação prevista: {format(parseISO(item.scheduled_date), "dd 'de' MMMM", { locale: ptBR })}
            </SheetDescription>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1 px-5">
          <div className="space-y-5 py-4">

            {/* Copy */}
            {item.copy_text && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">Copy / Legenda</p>
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {item.copy_text}
                </p>
              </div>
            )}

            {/* Hashtags */}
            {item.hashtags?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">Hashtags</p>
                <div className="flex flex-wrap gap-1.5">
                  {item.hashtags.map(h => (
                    <Badge key={h} variant="secondary" className="text-xs bg-[#1E293B] text-slate-300">
                      #{h}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Link de publicação */}
            {item.publication_url && (
              <div>
                <a
                  href={item.publication_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver publicação
                </a>
              </div>
            )}

            <Separator className="bg-[#1E293B]" />

            {/* Comentários */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-slate-400" />
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                  Comentários ({comments.length})
                </p>
              </div>

              {comments.length > 0 && (
                <div className="space-y-3 mb-4">
                  {comments.map((c: Record<string, unknown>) => (
                    <div key={c.id as string} className="bg-[#1E293B] rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-300">
                          {c.author_name as string ?? (c.author_type === "client" ? "Você" : "Agência")}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-auto">
                          {format(parseISO(c.created_at as string), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200">{c.body as string}</p>
                    </div>
                  ))}
                </div>
              )}

              <ClientCommentInput
                itemId={item.id}
                onSubmit={addComment}
                loading={isAdding}
              />
            </div>

            {/* Área de notas para decisão */}
            {needsApproval && (
              <>
                <Separator className="bg-[#1E293B]" />
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">
                    Observações (obrigatório ao reprovar)
                  </p>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Descreva alterações necessárias, dúvidas ou comentários..."
                    className="bg-[#1E293B] border-[#334155] text-slate-200 placeholder:text-slate-500 resize-none min-h-[90px] text-sm"
                  />
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Botões de decisão */}
        {needsApproval && (
          <div className="p-5 border-t border-[#1E293B] space-y-2">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={() => handleDecision("aprovado")}
              disabled={!!pending}
            >
              {pending === "aprovado"
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <CheckCircle2 className="h-4 w-4 mr-2" />
              }
              Aprovar conteúdo
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="border-orange-500/50 text-orange-300 hover:bg-orange-900/20"
                onClick={() => handleDecision("alteracao_solicitada")}
                disabled={!!pending}
              >
                {pending === "alteracao_solicitada"
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                }
                Solicitar alteração
              </Button>
              <Button
                variant="outline"
                className="border-red-500/50 text-red-300 hover:bg-red-900/20"
                onClick={() => handleDecision("reprovado")}
                disabled={!!pending}
              >
                {pending === "reprovado"
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <XCircle className="h-3.5 w-3.5 mr-1" />
                }
                Reprovar
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
