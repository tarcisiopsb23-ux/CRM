import { useState, useEffect } from "react";
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { fireConversionEvents } from "@/lib/conversionEvents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Clock, Users, CheckCircle2, DollarSign, MessageCircle } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Lead, LeadStatus } from "./types";
import { COLUMNS } from "./types";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";
import { LeadForm } from "./LeadForm";

interface CrmSectionProps {
  clientId: string;
  clientMetadata?: { gtm_id?: string | null; meta_pixel_id?: string | null; whatsapp_webhook_url?: string | null };
}

interface CrmStats {
  waPendentes: number;
  leadsAtivos: number;
  atendidosMes: number;
  fechadosMes: number;
  valorFechadosMes: number;
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
      <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 uppercase font-black tracking-widest truncate">{label}</p>
        <p className="text-2xl font-black text-white leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function CrmSection({ clientId: _clientId, clientMetadata }: CrmSectionProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [stats, setStats] = useState<CrmStats>({ waPendentes: 0, leadsAtivos: 0, atendidosMes: 0, fechadosMes: 0, valorFechadosMes: 0 });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from("crm_leads").select("*").order("created_at", { ascending: false });
    if (error) { toast.error("Erro ao carregar leads"); return; }
    const all: Lead[] = data || [];
    setLeads(all);
    setLoading(false);

    // Calcular métricas do CRM
    const now = new Date();
    const mesInicio = format(startOfMonth(now), "yyyy-MM-dd");
    const mesFim = format(endOfMonth(now), "yyyy-MM-dd");

    const ativos = all.filter(l => !["fechado", "perdido"].includes(l.status)).length;
    const fechadosMes = all.filter(l =>
      l.status === "fechado" &&
      (l.updated_at ?? l.created_at) >= mesInicio &&
      (l.updated_at ?? l.created_at) <= mesFim + "T23:59:59"
    );
    const atendidosMes = all.filter(l =>
      l.last_contact_at && l.last_contact_at >= mesInicio
    ).length;
    const valorMes = fechadosMes.reduce((acc, l) => acc + (l.proposal_value ?? 0), 0);

    setStats(s => ({ ...s, leadsAtivos: ativos, atendidosMes, fechadosMes: fechadosMes.length, valorFechadosMes: valorMes }));
  };

  // Busca pendentes do WhatsApp
  useEffect(() => {
    const webhookUrl = clientMetadata?.whatsapp_webhook_url;
    if (!webhookUrl) return;
    fetch(`${webhookUrl.replace(/\/$/, "")}/api/contatos?status=pendente`)
      .then(r => r.json())
      .then((data: any[]) => setStats(s => ({ ...s, waPendentes: data.length })))
      .catch(() => {});
  }, [clientMetadata?.whatsapp_webhook_url]);

  useEffect(() => { fetchLeads(); }, []);

  const handleSave = async (form: Omit<Lead, "id" | "created_at">) => {
    if (editing) {
      const { error } = await supabase.from("crm_leads").update(form).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Lead atualizado");
      if (form.status === "fechado" && clientMetadata) fireConversionEvents(clientMetadata);
    } else {
      const { error } = await supabase.from("crm_leads").insert(form);
      if (error) { toast.error("Erro ao criar lead"); return; }
      toast.success("Lead criado");
      if (form.status === "fechado" && clientMetadata) fireConversionEvents(clientMetadata);
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
    setActiveLead(leads.find((l) => l.id === e.active.id) ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = COLUMNS.find((c) => c.id === over.id)?.id;
    if (!newStatus || newStatus === leads.find((l) => l.id === active.id)?.status) return;
    setLeads((prev) => prev.map((l) => l.id === active.id ? { ...l, status: newStatus } : l));
    const { error } = await supabase.from("crm_leads").update({ status: newStatus }).eq("id", String(active.id));
    if (!error && newStatus === "fechado" && clientMetadata) fireConversionEvents(clientMetadata);
    // Rebusca para atualizar stats com updated_at correto do banco
    fetchLeads();
  };

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.id] = leads.filter((l) => l.status === c.id);
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const mesAtual = format(new Date(), "MMMM", { locale: ptBR });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">CRM</h2>
          <p className="text-slate-400 text-sm">{leads.length} leads no total</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2">
          <Plus className="h-4 w-4" /> Novo Lead
        </Button>
      </div>

      {/* Mini Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon={<Clock className="h-5 w-5 text-yellow-400" />}
          label="Pendentes WhatsApp"
          value={stats.waPendentes}
          sub="aguardando classificação"
        />
        <StatCard
          icon={<Users className="h-5 w-5 text-[#7C3AED]" />}
          label="Leads Ativos"
          value={stats.leadsAtivos}
          sub="em andamento no CRM"
        />
        <StatCard
          icon={<MessageCircle className="h-5 w-5 text-blue-400" />}
          label="Atendidos no Mês"
          value={stats.atendidosMes}
          sub={`contatos em ${mesAtual}`}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          label="Fechados no Mês"
          value={stats.fechadosMes}
          sub={`negócios em ${mesAtual}`}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-emerald-400" />}
          label="Valor Gerado"
          value={fmtCurrency(stats.valorFechadosMes)}
          sub={`fechamentos em ${mesAtual}`}
        />
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <KanbanColumn key={col.id} col={col} leads={grouped[col.id] ?? []}
                onEdit={(l) => { setEditing(l); setDialogOpen(true); }}
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

      <LeadForm
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing ? {
          name: editing.name, phone: editing.phone, email: editing.email,
          company: editing.company, address: editing.address, origin: editing.origin,
          temperature: editing.temperature, proposal_value: editing.proposal_value,
          potential_value: editing.potential_value, product_id: editing.product_id,
          product_name: editing.product_name, whatsapp_link: editing.whatsapp_link,
          last_contact_at: editing.last_contact_at, next_followup_at: editing.next_followup_at,
          lost_reason: editing.lost_reason, tags: editing.tags, notes: editing.notes,
          status: editing.status,
        } : null}
        onSave={handleSave}
      />
    </div>
  );
}
