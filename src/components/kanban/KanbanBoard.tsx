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
import type { Lead, EtapaKanban } from "@/types/database";

interface KanbanBoardProps {
  leads: Lead[];
  onDetalhes: (lead: Lead) => void;
  onEtapaChange: (leadId: string, etapa: EtapaKanban) => void;
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
  return grouped;
}

export function KanbanBoard({
  leads,
  onDetalhes,
  onEtapaChange,
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
      <div className="flex gap-4 overflow-x-auto pb-4">
        {ETAPAS_KANBAN.map(({ id, label }) => (
          <LeadsKanbanColumn
            key={id}
            id={id}
            label={label}
            leads={groupedLeads[id] ?? []}
            onDetalhes={onDetalhes}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead ? (
          <div className="opacity-95 rotate-2 scale-105">
            <LeadCard lead={activeLead} onDetalhes={onDetalhes} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
