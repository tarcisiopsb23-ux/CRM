import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { startOfMonth, endOfMonth, startOfDay, format } from "date-fns";

// -----------------------------------------------------------------------------
// Kanban funnel numbers
// -----------------------------------------------------------------------------

export interface KanbanFunnelItem {
  stage_id: string;
  label: string;
  count: number;
}

export function useKanbanFunnel(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["dashboard", "kanban-funnel", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("etapa_kanban")
        .eq("organization_id", organizationId);
      if (error) throw error;

      const ETAPAS: Record<string, string> = {
        leads_recebidos: "Leads Recebidos",
        qualificados: "Qualificados",
        contato_realizado: "Contato Realizado",
        reuniao_agendada: "Reunião Agendada",
        emissao_contrato: "Negociações",
        efetivados: "Efetivados",
        desqualificado: "Desqualificado",
        reuniao_sem_sucesso: "Sem Sucesso",
      };

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const s = (row.etapa_kanban as string) ?? "leads_recebidos";
        counts[s] = (counts[s] ?? 0) + 1;
      }

      const order = Object.keys(ETAPAS);
      return order.map((stage_id) => ({
        stage_id,
        label: ETAPAS[stage_id] ?? stage_id,
        count: counts[stage_id] ?? 0,
      }));
    },
    enabled: !!organizationId,
  });
}

// -----------------------------------------------------------------------------
// Pending human conversations (whatsapp - em_atendimento or aberta)
// -----------------------------------------------------------------------------

export function usePendingConversations(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["dashboard", "pending-conversations", organizationId],
    queryFn: async () => {
      if (!organizationId) return { count: 0, items: [] };
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(
          "id, status, last_message_at, contact:whatsapp_contacts(phone, name)"
        )
        .eq("organization_id", organizationId)
        .in("status", ["aberta", "em_atendimento"])
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return { count: (data ?? []).length, items: data ?? [] };
    },
    enabled: !!organizationId,
  });
}

// -----------------------------------------------------------------------------
// Accounts payable (month) - supplier_expenses
// -----------------------------------------------------------------------------

export function useAccountsPayable(organizationId: string | undefined) {
  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["dashboard", "payable", organizationId, from, to],
    queryFn: async () => {
      if (!organizationId) return { total: 0, count: 0 };
      const { data, error } = await supabase
        .from("supplier_expenses")
        .select("value, status, paid_at")
        .eq("organization_id", organizationId)
        .gte("due_date", from)
        .lte("due_date", to)
        .neq("status", "cancelado");
      if (error) throw error;

      const pending = (data ?? []).filter((r) => !r.paid_at && r.status !== "pago");
      const total = pending.reduce((s, r) => s + Number(r.value ?? 0), 0);
      return { total, count: pending.length };
    },
    enabled: !!organizationId,
  });
}

// -----------------------------------------------------------------------------
// Accounts receivable (month) - payments
// -----------------------------------------------------------------------------

export function useAccountsReceivable(organizationId: string | undefined) {
  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["dashboard", "receivable", organizationId, from, to],
    queryFn: async () => {
      if (!organizationId) return { total: 0, count: 0 };
      const { data, error } = await supabase
        .from("payments")
        .select("value, status, paid_at")
        .eq("organization_id", organizationId)
        .gte("due_date", from)
        .lte("due_date", to)
        .neq("status", "cancelado");
      if (error) throw error;

      const pending = (data ?? []).filter((r) => !r.paid_at && r.status !== "pago");
      const total = pending.reduce((s, r) => s + Number(r.value ?? 0), 0);
      return { total, count: pending.length };
    },
    enabled: !!organizationId,
  });
}

// -----------------------------------------------------------------------------
// Delinquency - overdue payments/expenses
// -----------------------------------------------------------------------------

export function useDelinquency(organizationId: string | undefined) {
  const today = format(startOfDay(new Date()), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["dashboard", "delinquency", organizationId, today],
    queryFn: async () => {
      if (!organizationId) return { payments: 0, expenses: 0, total: 0 };
      const [paymentsRes, expensesRes] = await Promise.all([
        supabase
          .from("payments")
          .select("value")
          .eq("organization_id", organizationId)
          .lt("due_date", today)
          .is("paid_at", null),
        supabase
          .from("supplier_expenses")
          .select("value")
          .eq("organization_id", organizationId)
          .lt("due_date", today)
          .is("paid_at", null),
      ]);

      const p = (paymentsRes.data ?? []).reduce(
        (s, r) => s + Number(r.value ?? 0),
        0
      );
      const e = (expensesRes.data ?? []).reduce(
        (s, r) => s + Number(r.value ?? 0),
        0
      );
      return { payments: p, expenses: e, total: p + e };
    },
    enabled: !!organizationId,
  });
}

// -----------------------------------------------------------------------------
// Goals - Agency (donut), Teams (ranking), Individuals (ranking)
// -----------------------------------------------------------------------------

export interface GoalRow {
  id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string | null;
  progress: number;
  team_name?: string | null;
  profile_name?: string | null;
}

export function useGoalsAgency(organizationId: string | undefined) {
  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["dashboard", "goals-agency", organizationId, from, to],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("goals")
        .select("id, title, target_value, current_value, unit")
        .eq("organization_id", organizationId)
        .lte("period_start", to)
        .gte("period_end", from);
      if (error) throw error;

      return (data ?? []).map((g) => ({
        name: g.title,
        value: Number(g.current_value ?? 0),
        total: Number(g.target_value ?? 1),
        fill: "#6A2DBD",
      }));
    },
    enabled: !!organizationId,
  });
}

export function useGoalsTeams(organizationId: string | undefined) {
  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["dashboard", "goals-teams", organizationId, from, to],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("goals")
        .select(
          "id, title, target_value, current_value, team:teams(name)"
        )
        .eq("organization_id", organizationId)
        .not("team_id", "is", null)
        .lte("period_start", to)
        .gte("period_end", from)
        .order("current_value", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((g) => ({
        id: g.id,
        title: g.title,
        target_value: Number(g.target_value ?? 0),
        current_value: Number(g.current_value ?? 0),
        progress:
          Number(g.target_value) > 0
            ? Math.min(
                100,
                (Number(g.current_value ?? 0) / Number(g.target_value)) * 100
              )
            : 0,
        team_name: (g.team as { name?: string } | null)?.name ?? null,
      }));
    },
    enabled: !!organizationId,
  });
}

export function useGoalsIndividuals(organizationId: string | undefined) {
  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["dashboard", "goals-individuals", organizationId, from, to],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("goals")
        .select(
          "id, title, target_value, current_value, profile:profiles!assigned_to(full_name)"
        )
        .eq("organization_id", organizationId)
        .not("assigned_to", "is", null)
        .lte("period_start", to)
        .gte("period_end", from)
        .order("current_value", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((g) => ({
        id: g.id,
        title: g.title,
        target_value: Number(g.target_value ?? 0),
        current_value: Number(g.current_value ?? 0),
        progress:
          Number(g.target_value) > 0
            ? Math.min(
                100,
                (Number(g.current_value ?? 0) / Number(g.target_value)) * 100
              )
            : 0,
        profile_name:
          (g.profile as { full_name?: string } | null)?.full_name ?? null,
      }));
    },
    enabled: !!organizationId,
  });
}
