/**
 * ChatbotCanaisPage — Chatbot → Canais
 *
 * Gerencia conexões de Instagram e WhatsApp via Meta Official API.
 * Substituiu a WhatsAppPage (QR Code / WWebJS) — removida por risco
 * de banimento de conta conforme políticas da Meta.
 *
 * Estado atual: placeholder estrutural — será implementado na Fase 2
 * (Instagram OAuth + WhatsApp Embedded Signup).
 */

import { Instagram, MessageCircle, Plus, ExternalLink, ShieldCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "./components/PageHeader";

// ─── Card de canal ─────────────────────────────────────────────────────────────

interface ChannelCardProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  name: string;
  description: string;
  comingSoon?: boolean;
}

function ChannelCard({ icon: Icon, iconColor, iconBg, name, description, comingSoon }: ChannelCardProps) {
  return (
    <Card className="card-surface">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div>
              <CardTitle className="text-base">{name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          {comingSoon ? (
            <Badge variant="outline" className="text-xs text-muted-foreground border-border">
              Em breve
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground border-border">
              Desconectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-lg border border-dashed border-border bg-secondary/10 p-4 text-center space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {comingSoon
              ? "Canal em preparação. Disponível em breve após aprovação do App Review da Meta."
              : "Nenhuma conta conectada. Clique em Conectar para autorizar o acesso via Meta."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 border-border"
            disabled
          >
            <Plus className="h-3.5 w-3.5" />
            {comingSoon ? "Em breve" : "Conectar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export function ChatbotCanaisPage() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Canais"
        description="Conecte suas contas de Instagram e WhatsApp para receber mensagens e automatizar o atendimento."
      />

      {/* Aviso de segurança */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-emerald-400">Conexão 100% oficial Meta</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Todos os canais são conectados exclusivamente via APIs oficiais da Meta
            (Instagram Login e WhatsApp Business Platform). Nenhum método não autorizado
            é utilizado, eliminando riscos de bloqueio ou banimento da sua conta.
          </p>
        </div>
      </div>

      {/* Canais disponíveis */}
      <div className="space-y-4">
        <ChannelCard
          icon={MessageCircle}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10"
          name="WhatsApp Business"
          description="Conecte seu número via WhatsApp Business Platform (API oficial)"
        />
        <ChannelCard
          icon={Instagram}
          iconColor="text-pink-400"
          iconBg="bg-pink-500/10"
          name="Instagram"
          description="Conecte sua conta profissional para receber DMs e responder comentários"
          comingSoon
        />
      </div>

      {/* Informações sobre o processo */}
      <Card className="card-surface border-dashed">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Como funciona
            </p>
          </div>
          <div className="space-y-2">
            {[
              "Você autoriza o C8 Control a acessar sua conta via Meta — sem compartilhar senha.",
              "As mensagens chegam ao C8 Control em tempo real pelo canal oficial.",
              "Você pode desconectar a qualquer momento — acesso revogado instantaneamente.",
              "Tokens são armazenados com segurança no servidor, nunca expostos no navegador.",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                  {i + 1}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
          <a
            href="https://developers.facebook.com/docs/whatsapp/cloud-api"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Documentação oficial Meta
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
