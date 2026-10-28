/**
 * ChatbotFluxosPage — Chatbot → Fluxos
 *
 * Placeholder para o builder visual de fluxos conversacionais.
 */

import { GitBranch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";

export function ChatbotFluxosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxos"
        description="Configure fluxos conversacionais automatizados."
      />

      <Card className="card-surface">
        <CardContent className="flex items-start gap-4 p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Em breve: builder visual de fluxos</p>
            <p className="text-sm text-muted-foreground">
              Ative o modo Flow Builder em{" "}
              <span className="font-medium text-foreground">Chatbot → Meu Agente</span>{" "}
              para usar esta funcionalidade quando estiver disponível.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
