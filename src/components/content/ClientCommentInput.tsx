/**
 * ClientCommentInput — input de comentário compacto para o C8 Control.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";

interface ClientCommentInputProps {
  itemId:   string;
  onSubmit: (args: { body: string; parentId?: string }) => Promise<void>;
  loading?: boolean;
}

export function ClientCommentInput({ onSubmit, loading = false }: ClientCommentInputProps) {
  const [body, setBody] = useState("");

  async function handleSubmit() {
    const text = body.trim();
    if (!text) return;
    await onSubmit({ body: text });
    setBody("");
  }

  return (
    <div className="flex gap-2 items-end">
      <Textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Escreva um comentário..."
        className="bg-[#1E293B] border-[#334155] text-slate-200 placeholder:text-slate-500 resize-none min-h-[70px] text-sm flex-1"
        onKeyDown={e => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
        }}
      />
      <Button
        size="sm"
        className="h-9 px-3 bg-violet-700 hover:bg-violet-600 shrink-0"
        onClick={handleSubmit}
        disabled={!body.trim() || loading}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Send className="h-3.5 w-3.5" />
        }
      </Button>
    </div>
  );
}
