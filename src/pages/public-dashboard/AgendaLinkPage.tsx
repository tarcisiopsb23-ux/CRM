/**
 * AgendaLinkPage — Exibe e gerencia o link público de agendamento.
 */
import { useState } from "react";
import { Link2, Copy, ExternalLink, CheckCircle2, QrCode, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { PageHeader } from "./components/PageHeader";

export function AgendaLinkPage() {
  const { auth, slug } = useClientAuth();
  const [copied, setCopied] = useState(false);

  const appOrigin  = import.meta.env.VITE_APP_ORIGIN ?? window.location.origin;
  const bookingUrl = `${appOrigin}/booking/${slug}`;

  const copy = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Link de Agendamento"
        description="Compartilhe este link com seus clientes para receber agendamentos online."
      />

      {/* ── Link público ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Link Público
          </CardTitle>
          <CardDescription>
            Qualquer pessoa com este link pode visualizar os horários disponíveis e agendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input value={bookingUrl} readOnly className="font-mono text-sm bg-muted/20" />
          </div>
          <div className="flex gap-2">
            <Button onClick={copy} variant="outline" className="border-border gap-2">
              {copied
                ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Copiado!</>
                : <><Copy className="h-4 w-4" /> Copiar link</>
              }
            </Button>
            <Button variant="outline" className="border-border gap-2"
              onClick={() => window.open(bookingUrl, "_blank", "noopener")}>
              <ExternalLink className="h-4 w-4" /> Testar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── QR Code ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" /> QR Code
          </CardTitle>
          <CardDescription>
            Imprima ou exiba em materiais físicos para facilitar o agendamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-4">
          {/* QR Code via API pública — sem dependência de biblioteca */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingUrl)}`}
            alt="QR Code do link de agendamento"
            className="rounded-lg border border-border p-2 bg-white"
            width={200}
            height={200}
          />
          <Button variant="outline" className="border-border gap-2"
            onClick={() => {
              const a = document.createElement("a");
              a.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(bookingUrl)}`;
              a.download = `qr-agendamento-${slug}.png`;
              a.click();
            }}>
            <QrCode className="h-4 w-4" /> Baixar QR Code
          </Button>
        </CardContent>
      </Card>

      {/* ── Instruções ── */}
      <Card className="card-surface border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" /> Como usar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Adicione o link na bio do Instagram ou WhatsApp",
              "Cole em campanhas de e-mail marketing ou anúncios",
              "Imprima o QR Code e coloque na recepção ou em panfletos",
              "O cliente escolhe o serviço, dia e horário disponível",
              "Você recebe o agendamento diretamente na Agenda do C8 Control",
              "Se o Google Calendar estiver conectado, o evento é criado automaticamente",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
