/**
 * ContentPlanejamentoPage — calendário editorial multi-cliente.
 * Visão de todos os clientes da organização (ou filtrado por cliente).
 */

import { useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { useClients } from "@/hooks/useClients";
import { ContentCalendar } from "@/components/content/ContentCalendar";
import type { ContentItem } from "@/hooks/useContentItems";

export function ContentPlanejamentoPage() {
  const navigate       = useNavigate();
  const organizationId = useOrganization();
  const [clientFilter, setClientFilter] = useState("all");
  const { data: clients = [] } = useClients(organizationId);

  function handleItemClick(item: ContentItem) {
    navigate(`/content/itens/${item.id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Calendário Editorial</h1>
          <p className="text-sm text-muted-foreground">
            Visão de todos os itens agendados e com prazo de produção.
          </p>
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ContentCalendar
        organizationId={organizationId}
        clientId={clientFilter !== "all" ? clientFilter : undefined}
        onItemClick={handleItemClick}
      />
    </div>
  );
}
