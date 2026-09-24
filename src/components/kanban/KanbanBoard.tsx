import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState, useMemo } from "react";
import { LeadsKanbanColumn } from "./LeadsKanbanColumn";
import { LeadCard } from "./LeadCard";
import { ETAPAS_KANBAN } from "@/types/database";
import type { Lead, EtapaKanban, PrioridadeLead } from "@/types/database";

interface KanbanBoardProps {
  leads: Lead[];
  onDetalhes: (lead: Lead) => void;
  onEtapaChange: (leadId: string, etapa: EtapaKanban) => void;
  activeProposalsPerEtapa?: Record<string, number>;
}

const PRIORIDADE_RANK: Record<PrioridadeLead, number> = {
  urgente: 4,
  alta: 3,
  media: 2,
  baixa: 1,
};

function sortLeadsByPriorityTemperature(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const tempA = a.temperature ?? 0;
    const tempB = b.temperature ?? 0;
    if (tempB !== tempA) return tempB - tempA;

    const prioA = PRIORIDADE_RANK[a.prioridade as PrioridadeLead] ?? 0;
    const prioB = PRIORIDADE_RANK[b.prioridade as PrioridadeLead] ?? 0;
    return prioB - prioA;
  });
}

function groupLeadsByEtapa(leads: Lead[]): Record<EtapaKanban, Lead[]> {
  const grouped = ETAPAS_KANBAN.reduce(
    (acc, { id }) => {
      acc[id] = [];
      return acc;
    },
    {} as Record<EtapaKanban, Lead[]>
  );
  for (const lead of leads) {
    const etapa = (lead.etapa_kanban ?? "leads_recebidos") as EtapaKanban;
    if (grouped[etapa]) {
      grouped[etapa].push(lead);
    } else {
      grouped.leads_recebidos.push(lead);
    }
  }
  // Sort each column by temperature (desc) then priority (desc)
  for (const etapa of ETAPAS_KANBAN) {
    grouped[etapa.id] = sortLeadsByPriorityTemperature(grouped[etapa.id]);
  }
  return grouped;
}

export function KanbanBoard({
  leads,
  onDetalhes,
  onEtapaChange,
  activeProposalsPerEtapa,
}: KanbanBoardProps) {
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const groupedLeads = useMemo(() => groupLeadsByEtapa(leads), [leads]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const lead = leads.find((l) => l.id === active.id);
    if (lead) setActiveLead(lead);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const overId = String(over.id);

    const found = ETAPAS_KANBAN.find((e) => e.id === overId);
    const overEtapa = found ? (found.id as EtapaKanban) : undefined;
    if (found && overEtapa) {
      onEtapaChange(leadId, found.id);
      return;
    }

    const overColumn = ETAPAS_KANBAN.find((e) =>
      groupedLeads[e.id].some((l) => l.id === overId)
    );
    if (overColumn) {
      onEtapaChange(leadId, overColumn.id);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px] h-[calc(100vh-280px)] kanban-scroll-x kanban-board-container">
        {ETAPAS_KANBAN.map(({ id, label }) => (
          <LeadsKanbanColumn
            key={id}
            id={id}
            label={label}
            leads={groupedLeads[id] ?? []}
            onDetalhes={onDetalhes}
            activeProposalsCount={activeProposalsPerEtapa?.[id] ?? 0}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead ? (
          <div className="opacity-95 rotate-2 scale-105 pointer-events-none">
            <LeadCard lead={activeLead} onDetalhes={onDetalhes} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
