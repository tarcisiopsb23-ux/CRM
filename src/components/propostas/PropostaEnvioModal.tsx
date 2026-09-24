import { useState } from "react";
import { Copy, MessageCircle, Mail, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Proposal } from "@/types/proposals";

interface Props {
  open: boolean;
  proposal: Pick<Proposal, "id" | "title" | "public_slug" | "plan_value" | "hero_whatsapp_number">;
  clientName: string;
  closerName?: string;
  onSend: (channel: "whatsapp" | "email" | "link") => Promise<void>;
  onClose: () => void;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function PropostaEnvioModal({ open, proposal, clientName, closerName, onSend, onClose }: Props) {
  const baseUrl =
    (import.meta.env as Record<string, string>).VITE_PROPOSAL_BASE_URL ??
    window.location.origin;
  const link = `${baseUrl}/proposta/${proposal.public_slug}`;
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const defaultMsg = `Olá, ${clientName}! 👋\n\nPreparei uma proposta especial para você. Acesse o link abaixo:\n\n${link}\n\n${closerName ?? "Equipe C8"}`;
  const [waText, setWaText] = useState(defaultMsg);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await onSend("link");
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const handleWhatsApp = async () => {
    setSending(true);
    try {
      await onSend("whatsapp");
      const num = (proposal.hero_whatsapp_number ?? "").replace(/\D/g, "");
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(waText)}`, "_blank");
      onClose();
    } catch {
      toast.error("Erro ao enviar via WhatsApp.");
    } finally {
      setSending(false);
    }
  };

  const handleEmail = async () => {
    setSending(true);
    try {
      await onSend("email");
      const subject = encodeURIComponent(`Proposta Comercial — ${proposal.title}`);
      const body = encodeURIComponent(
        `Olá, ${clientName}!\n\nSegue o link da sua proposta:\n${link}\n\nValor do plano: ${fmtCurrency(proposal.plan_value)}\n\n${closerName ?? "Equipe C8"}`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
      onClose();
    } catch {
      toast.error("Erro ao abrir cliente de e-mail.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" /> Enviar Proposta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Copy link */}
          <div className="flex gap-2">
            <div className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm font-mono text-muted-foreground truncate">
              {link}
            </div>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? (
                <><Check className="h-4 w-4 text-emerald-600 mr-1" /> Copiado!</>
              ) : (
                <><Copy className="h-4 w-4 mr-1" /> Copiar</>
              )}
            </Button>
          </div>

          {/* WhatsApp */}
          <div className="space-y-2 border-t pt-4">
            <Label className="flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-green-600" /> Mensagem WhatsApp
            </Label>
            <Textarea
              rows={5}
              value={waText}
              onChange={(e) => setWaText(e.target.value)}
              className="text-sm resize-none"
            />
            <Button
              onClick={handleWhatsApp}
              disabled={sending}
              className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
            </Button>
          </div>

          {/* Email */}
          <div className="border-t pt-4">
            <Button
              variant="outline"
              onClick={handleEmail}
              disabled={sending}
              className="w-full gap-2"
            >
              <Mail className="h-4 w-4" /> Enviar por E-mail
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
