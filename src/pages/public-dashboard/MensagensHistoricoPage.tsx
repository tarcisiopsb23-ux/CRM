/**
 * MensagensHistoricoPage — Histórico de Conversas
 *
 * Lista de conversas encerradas com filtros por canal, período e contato.
 * Estado atual: placeholder estrutural — será populado na Fase 3.
 */

import { ArchiveX, Search, Calendar, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "./components/PageHeader";

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/50">
        <ArchiveX className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground/70">Nenhum histórico ainda</p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          As conversas encerradas aparecem aqui para consulta e auditoria.
          Disponível após a ativação dos canais.
        </p>
      </div>
    </div>
  );
}

export function MensagensHistoricoPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Histórico de Conversas"
        description="Consulte todas as conversas encerradas, com filtros por canal, período e contato."
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            className="pl-8 h-9 text-sm bg-secondary/30"
            disabled
          />
        </div>
        <Button variant="outline" size="sm" className="gap-2 h-9 text-xs" disabled>
          <Calendar className="h-3.5 w-3.5" />
          Período
        </Button>
        <Button variant="outline" size="sm" className="gap-2 h-9 text-xs" disabled>
          <Filter className="h-3.5 w-3.5" />
          Canal
        </Button>
        <Badge variant="outline" className="text-xs text-muted-foreground h-9 px-3 rounded-md">
          0 conversas
        </Badge>
      </div>

      {/* Lista */}
      <EmptyHistory />
    </div>
  );
}
