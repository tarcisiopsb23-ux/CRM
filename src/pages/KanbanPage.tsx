import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanCard, type Lead } from "@/components/kanban/KanbanCard";
import { LeadDetailModal } from "@/components/kanban/LeadDetailModal";

const STAGES = [
  { id: "received", label: "Leads Recebidos", color: "hsl(265, 62%, 46%)" },
  { id: "qualified", label: "Qualificados", color: "hsl(210, 80%, 52%)" },
  { id: "meeting", label: "Reunião Agendada", color: "hsl(38, 92%, 50%)" },
  { id: "contract", label: "Contrato Enviado", color: "hsl(280, 70%, 55%)" },
  { id: "closed", label: "Fechados", color: "hsl(152, 60%, 42%)" },
  { id: "disqualified", label: "Desqualificados", color: "hsl(0, 84%, 60%)" },
  { id: "no_show", label: "Reunião sem Sucesso", color: "hsl(215, 16%, 47%)" },
];

const initialLeads: Lead[] = [
  { id: "1", company: "TechCorp", niche: "SaaS", priority: "alta", responsible: "Ana Costa", phone: "(11) 99999-0001", stage: "received", email: "tech@corp.com", city: "São Paulo", origin: "Google Ads", revenue: "R$ 50.000", notes: "", createdAt: "2024-01-15" },
  { id: "2", company: "AgênciaX", niche: "Marketing", priority: "média", responsible: "João Santos", phone: "(11) 99999-0002", stage: "received", email: "contato@agenciax.com", city: "Rio de Janeiro", origin: "Indicação", revenue: "R$ 30.000", notes: "", createdAt: "2024-01-16" },
  { id: "3", company: "StartupY", niche: "Fintech", priority: "alta", responsible: "Maria Silva", phone: "(11) 99999-0003", stage: "qualified", email: "hello@startupy.io", city: "Belo Horizonte", origin: "LinkedIn", revenue: "R$ 80.000", notes: "", createdAt: "2024-01-10" },
  { id: "4", company: "ConsultZ", niche: "Consultoria", priority: "baixa", responsible: "Pedro Lima", phone: "(11) 99999-0004", stage: "meeting", email: "info@consultz.com", city: "Curitiba", origin: "Site", revenue: "R$ 20.000", notes: "", createdAt: "2024-01-12" },
  { id: "5", company: "EduTech", niche: "Educação", priority: "alta", responsible: "Ana Costa", phone: "(11) 99999-0005", stage: "contract", email: "edu@tech.com", city: "Campinas", origin: "Evento", revenue: "R$ 120.000", notes: "", createdAt: "2024-01-08" },
  { id: "6", company: "RetailMax", niche: "Varejo", priority: "média", responsible: "João Santos", phone: "(11) 99999-0006", stage: "closed", email: "retail@max.com", city: "Brasília", origin: "Google Ads", revenue: "R$ 45.000", notes: "", createdAt: "2024-01-05" },
  { id: "7", company: "LogiPro", niche: "Logística", priority: "baixa", responsible: "Maria Silva", phone: "(11) 99999-0007", stage: "received", email: "logi@pro.com", city: "Florianópolis", origin: "Indicação", revenue: "R$ 35.000", notes: "", createdAt: "2024-01-18" },
  { id: "8", company: "HealthPlus", niche: "Saúde", priority: "alta", responsible: "Pedro Lima", phone: "(11) 99999-0008", stage: "qualified", email: "health@plus.com", city: "Porto Alegre", origin: "LinkedIn", revenue: "R$ 90.000", notes: "", createdAt: "2024-01-14" },
];

export default function KanbanPage() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const stageId = STAGES.find((s) => s.id === overId)?.id;
    if (stageId) {
      setLeads((prev) => prev.map((l) => (l.id === String(active.id) ? { ...l, stage: stageId } : l)));
    }
  };

  const activeLead = leads.find((l) => l.id === activeId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Kanban</h1>
        <p className="text-sm text-muted-foreground">Gerencie seus leads por estágio</p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={leads.filter((l) => l.stage === stage.id)}
              onOpenDetail={setSelectedLead}
            />
          ))}
        </div>
        <DragOverlay>
          {activeLead ? <KanbanCard lead={activeLead} onOpenDetail={() => {}} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
