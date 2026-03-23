import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, XCircle } from "lucide-react";
import type { CicloAvaliacao, CicloTipo } from "@/types/avaliacao360";

interface Props {
  ciclos: CicloAvaliacao[];
  isLoading: boolean;
  onSelect: (ciclo: CicloAvaliacao) => void;
  onClose: (ciclo: CicloAvaliacao) => void;
  canManage: boolean;
}

const TIPO_BADGE: Record<CicloTipo, { label: string; className: string }> = {
  '360':        { label: '360°',        className: 'bg-blue-100 text-blue-700 border-blue-200' },
  'checkin':    { label: 'Check-in',    className: 'bg-purple-100 text-purple-700 border-purple-200' },
  'probatorio': { label: 'Probatório',  className: 'bg-orange-100 text-orange-700 border-orange-200' },
};

interface Props {
  ciclos: CicloAvaliacao[];
  isLoading: boolean;
  onSelect: (ciclo: CicloAvaliacao) => void;
  onClose: (ciclo: CicloAvaliacao) => void;
  canManage: boolean;
}

export function CiclosList({ ciclos, isLoading, onSelect, onClose, canManage }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (ciclos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhum ciclo de avaliação criado ainda.
      </p>
    );
  }

  const ativos = ciclos.filter((c) => c.status === "ativo");
  const encerrados = ciclos.filter((c) => c.status === "encerrado");

  return (
    <div className="space-y-6">
      {ativos.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Ciclos Ativos
          </p>
          <div className="space-y-2">
            {ativos.map((c) => (
              <CicloCard
                key={c.id}
                ciclo={c}
                onSelect={onSelect}
                onClose={onClose}
                canManage={canManage}
              />
            ))}
          </div>
        </section>
      )}

      {encerrados.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Ciclos Encerrados
          </p>
          <div className="space-y-2">
            {encerrados.map((c) => (
              <CicloCard
                key={c.id}
                ciclo={c}
                onSelect={onSelect}
                onClose={onClose}
                canManage={canManage}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CicloCard({
  ciclo,
  onSelect,
  onClose,
  canManage,
}: {
  ciclo: CicloAvaliacao;
  onSelect: (c: CicloAvaliacao) => void;
  onClose: (c: CicloAvaliacao) => void;
  canManage: boolean;
}) {
  const inicio = new Date(ciclo.data_inicio).toLocaleDateString("pt-BR");
  const fim = new Date(ciclo.data_fim).toLocaleDateString("pt-BR");

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{ciclo.nome}</span>
            <Badge variant={ciclo.status === "ativo" ? "default" : "secondary"} className="text-xs">
              {ciclo.status === "ativo" ? "Ativo" : "Encerrado"}
            </Badge>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TIPO_BADGE[ciclo.tipo]?.className ?? ''}`}>
              {TIPO_BADGE[ciclo.tipo]?.label ?? ciclo.tipo}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {inicio} – {fim}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => onSelect(ciclo)}>
            <Eye className="h-4 w-4 mr-1" />
            Ver
          </Button>
          {canManage && ciclo.status === "ativo" && (
            <Button size="sm" variant="destructive" onClick={() => onClose(ciclo)}>
              <XCircle className="h-4 w-4 mr-1" />
              Encerrar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
