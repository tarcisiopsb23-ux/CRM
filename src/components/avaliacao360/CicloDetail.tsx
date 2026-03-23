import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, ClipboardList } from "lucide-react";
import { useAvaliacoesDoCiclo, useResultados } from "@/hooks/useAvaliacao360";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { AvaliacaoForm } from "./AvaliacaoForm";
import { ResultadoCard } from "./ResultadoCard";
import type { CicloAvaliacao, Avaliacao360 } from "@/types/avaliacao360";

interface Props {
  ciclo: CicloAvaliacao;
  onBack: () => void;
  currentProfileId: string;
  canManage: boolean;
}

export function CicloDetail({ ciclo, onBack, currentProfileId, canManage }: Props) {
  const orgId = useOrganization();
  const { data: avaliacoes = [], isLoading } = useAvaliacoesDoCiclo(ciclo.id);
  const { data: resultados = [] } = useResultados(ciclo.id);
  const { data: profiles = [] } = useProfiles(orgId);
  const [avaliacaoAberta, setAvaliacaoAberta] = useState<Avaliacao360 | null>(null);

  const profileName = (id: string) => {
    if (id === currentProfileId) return "Você";
    return profiles.find((p) => p.id === id)?.full_name ?? id.slice(0, 8) + "…";
  };

  const minhas = avaliacoes.filter((a) => a.avaliador_id === currentProfileId);
  const pendentes = minhas.filter((a) => a.status === "pendente");
  const concluidas = avaliacoes.filter((a) => a.status === "concluido");

  const TIPO_LABEL: Record<string, string> = {
    autoavaliacao: "Autoavaliação",
    gestor: "Gestor",
    pares: "Pares",
    liderado: "Liderado",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{ciclo.nome}</h2>
          <p className="text-xs text-muted-foreground">
            {new Date(ciclo.data_inicio).toLocaleDateString("pt-BR")} –{" "}
            {new Date(ciclo.data_fim).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <Badge variant={ciclo.status === "ativo" ? "default" : "secondary"} className="ml-auto">
          {ciclo.status === "ativo" ? "Ativo" : "Encerrado"}
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="minhas">
          <TabsList>
            <TabsTrigger value="minhas">
              Minhas Avaliações
              {pendentes.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0">
                  {pendentes.length}
                </Badge>
              )}
            </TabsTrigger>
            {canManage && <TabsTrigger value="todas">Todas ({avaliacoes.length})</TabsTrigger>}
            {canManage && ciclo.status === "encerrado" && (
              <TabsTrigger value="resultados">Resultados ({resultados.length})</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="minhas" className="space-y-2 mt-4">
            {minhas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Você não tem avaliações neste ciclo.
              </p>
            ) : (
              minhas.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{TIPO_LABEL[a.tipo] ?? a.tipo}</p>
                      <p className="text-xs text-muted-foreground">
                        Avaliado: {profileName(a.avaliado_id)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.status === "pendente" ? "outline" : "secondary"}>
                        {a.status === "pendente" ? "Pendente" : "Concluída"}
                      </Badge>
                      {a.status === "pendente" && ciclo.status === "ativo" && (
                        <Button size="sm" onClick={() => setAvaliacaoAberta(a)}>
                          <ClipboardList className="h-4 w-4 mr-1" />
                          Responder
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {canManage && (
            <TabsContent value="todas" className="space-y-2 mt-4">
              <div className="text-xs text-muted-foreground mb-2">
                {concluidas.length}/{avaliacoes.length} concluídas
              </div>
              {avaliacoes.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{TIPO_LABEL[a.tipo] ?? a.tipo}</span>
                      <p className="text-xs text-muted-foreground">
                        Avaliado: {profileName(a.avaliado_id)}
                        {a.anonimo && " · anônimo"}
                      </p>
                    </div>
                    <Badge variant={a.status === "pendente" ? "outline" : "secondary"} className="text-xs">
                      {a.status === "pendente" ? "Pendente" : "Concluída"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          )}

          {canManage && ciclo.status === "encerrado" && (
            <TabsContent value="resultados" className="space-y-3 mt-4">
              {resultados.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum resultado consolidado ainda.
                </p>
              ) : (
                resultados.map((r) => (
                  <ResultadoCard key={r.id} resultado={r} canEditFeedback={canManage} />
                ))
              )}
            </TabsContent>
          )}
        </Tabs>
      )}

      {avaliacaoAberta && (
        <AvaliacaoForm
          avaliacao={avaliacaoAberta}
          cicloTipo={ciclo.tipo}
          open={!!avaliacaoAberta}
          onOpenChange={(open) => { if (!open) setAvaliacaoAberta(null); }}
          avaliadoNome={
            avaliacaoAberta.avaliado_id === currentProfileId
              ? "Você"
              : profiles.find((p) => p.id === avaliacaoAberta.avaliado_id)?.full_name
          }
        />
      )}
    </div>
  );
}
