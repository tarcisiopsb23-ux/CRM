/**
 * ChatbotAgentePage — Chatbot → Meu Agente
 *
 * As configurações do agente foram movidas para Chatbot → Canais, onde cada
 * canal (WhatsApp, Instagram, Facebook) exibe suas próprias configurações em
 * uma seção expansível "Configurar agente".
 *
 * Esta página agora é apenas um aviso com botão de redirecionamento para Canais.
 * A rota (chatbot/agente) e a entrada no menu são mantidas intactas.
 */

import { useNavigate } from "react-router-dom";
import { Bot, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useClientAuth } from "@/hooks/useClientAuth";
import { PageHeader } from "./components/PageHeader";

export function ChatbotAgentePage() {
  const navigate = useNavigate();
  const { slug } = useClientAuth();

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Meu Agente"
        description="Configure como seu assistente se comporta em cada canal."
      />

      <Card className="card-surface">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Configurações movidas para Chatbot → Canais</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Agora você ativa e configura o agente IA diretamente em cada canal
                (WhatsApp, Instagram e Facebook). No card do canal, toque em
                "Configurar agente" para definir identidade, personalidade,
                objetivo, comportamentos e handoff.
              </p>
            </div>
          </div>

          <Button onClick={() => navigate(`/${slug}/chatbot/canais`)} className="gap-2">
            Ir para Canais
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
