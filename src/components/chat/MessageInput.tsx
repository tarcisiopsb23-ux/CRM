import { useState, useRef, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_CHARS = 2000;
const WARN_THRESHOLD = 1800;

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  archived?: boolean;
}

export function MessageInput({ onSend, disabled, archived }: MessageInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_CHARS && !disabled && !archived && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
      textareaRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (archived) {
    return (
      <div className="px-3 py-2 border-t">
        <p className="text-xs text-muted-foreground text-center italic">
          Esta conversa está arquivada e não aceita novas mensagens.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem... (Enter para enviar)"
            disabled={disabled || sending}
            rows={1}
            className={cn(
              "w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              "min-h-[38px] max-h-[120px] overflow-y-auto",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          {value.length > WARN_THRESHOLD && (
            <span
              className={cn(
                "absolute bottom-1 right-2 text-[10px]",
                value.length > MAX_CHARS ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {value.length}/{MAX_CHARS}
            </span>
          )}
        </div>
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
