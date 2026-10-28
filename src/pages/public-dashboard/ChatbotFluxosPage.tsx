/**
 * ChatbotFluxosPage — Chatbot → Fluxos
 *
 * Placeholder para o builder visual de fluxos conversacionais (Fase 2).
 */

import { GitBranch, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import { Link } from "react-router-dom";
import { useClientAuth } from "@/hooks/useClientAuth";

export function ChatbotFluxosPage() {
  const { slug } = useClientAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flows Personalizados"
        description="Configure flows conversacionais determinísticos para seus canais."
      />

      <Card className="card-surface">
        <CardContent className="flex items-start gap-4 p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Builder visual de flows — em breve</p>
            <p className="text-sm text-muted-foreground">
              Aqui você poderá criar flows com gatilhos de palavras-chave, perguntas, botões
              e lógica condicional — tudo configurado visualmente, sem alterar o n8n.
            </p>
            <p className="text-sm text-muted-foreground">
              Para ativar os flows personalizados nos seus canais, acesse{" "}
              <Link
                to={`/${slug}/chatbot/agente`}
                className="font-medium text-primary hover:underline"
              >
                Chatbot → Meu Agente
              </Link>{" "}
              e selecione <span className="font-medium text-foreground">Flow Personalizado</span> na seção Modo do Bot.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="card-surface border-dashed opacity-60">
        <CardContent className="flex items-start gap-4 p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-muted-foreground">Seus flows aparecerão aqui</p>
            <p className="text-xs text-muted-foreground">
              Crie flows com gatilhos por palavra-chave, envio de documentos, perguntas
              com captura de resposta e roteamento por canal.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
