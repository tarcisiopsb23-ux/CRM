import { GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function FlowBuilderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Flow Builder</h1>
        <p className="text-muted-foreground mt-1">
          Configure fluxos conversacionais para seus clientes
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <GitBranch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Como ativar o Flow Builder</CardTitle>
              <CardDescription className="mt-0.5">
                Instruções para configurar fluxos por cliente
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Para ativar o Flow Builder para um cliente, acesse o{" "}
            <span className="font-medium text-foreground">Maestr.IA</span> desse cliente →{" "}
            <span className="font-medium text-foreground">Chatbot</span> →{" "}
            <span className="font-medium text-foreground">Meu Agente</span> e selecione o modo{" "}
            <span className="font-medium text-foreground">Flow Builder</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
