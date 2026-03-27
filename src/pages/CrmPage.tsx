import { useState, useEffect } from "react";
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Lead, LeadStatus } from "@/components/crm/types";
import { COLUMNS } from "@/components/crm/types";
import { KanbanColumn } from "@/components/crm/KanbanColumn";
import { LeadCard } from "@/components/crm/LeadCard";
import { LeadForm } from "@/components/crm/LeadForm";

// ─── Página Principal ─────────────────────────────────────────────────────────

export function CrmPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Carrega leads do Supabase
  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from("crm_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error("Erro ao carregar leads"); return; }
    setLeads(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  const handleSave = async (form: Omit<Lead, "id" | "created_at">) => {
    if (editing) {
      const { error } = await supabase.from("crm_leads").update(form).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Lead atualizado");
    } else {
      const { error } = await supabase.from("crm_leads").insert(form);
      if (error) { toast.error("Erro ao criar lead"); return; }
      toast.success("Lead criado");
    }
    setDialogOpen(false);
    setEditing(null);
    fetchLeads();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lead?")) return;
    const { error } = await supabase.from("crm_leads").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Lead excluído");
    fetchLeads();
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveLead(leads.find(l => l.id === e.active.id) ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = COLUMNS.find(c => c.id === over.id)?.id;
    if (!newStatus || newStatus === leads.find(l => l.id === active.id)?.status) return;
    setLeads(prev => prev.map(l => l.id === active.id ? { ...l, status: newStatus } : l));
    await supabase.from("crm_leads").update({ status: newStatus }).eq("id", String(active.id));
  };

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.id] = leads.filter(l => l.status === c.id);
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">CRM</h1>
            <p className="text-slate-400 text-sm">{leads.length} leads no total</p>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}
            className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2">
            <Plus className="h-4 w-4" /> Novo Lead
          </Button>
        </div>

        {/* Kanban */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {COLUMNS.map(col => (
                <KanbanColumn key={col.id} col={col} leads={grouped[col.id] ?? []}
                  onEdit={l => { setEditing(l); setDialogOpen(true); }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            <DragOverlay>
              {activeLead && (
                <div className="opacity-90 rotate-1 scale-105 pointer-events-none">
                  <LeadCard lead={activeLead} onEdit={() => {}} onDelete={() => {}} isDragging />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <LeadForm
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing ? {
          name: editing.name,
          phone: editing.phone,
          email: editing.email,
          company: editing.company,
          address: editing.address,
          origin: editing.origin,
          temperature: editing.temperature,
          proposal_value: editing.proposal_value,
          potential_value: editing.potential_value,
          product_id: editing.product_id,
          product_name: editing.product_name,
          whatsapp_link: editing.whatsapp_link,
          last_contact_at: editing.last_contact_at,
          next_followup_at: editing.next_followup_at,
          lost_reason: editing.lost_reason,
          tags: editing.tags,
          notes: editing.notes,
          status: editing.status,
        } : null}
        onSave={handleSave}
      />
    </div>
  );
}
