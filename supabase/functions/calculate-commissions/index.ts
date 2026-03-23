import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function upsertCommissionEntry(supabase, {
  organizationId, profileId, monthReference, contractId,
  clientName, product, saleDate, firstPaymentDate, saleValue, commissionRate
}) {
  const { data: existing } = await supabase
    .from("commission_entries")
    .select("*")
    .eq("profile_id", profileId)
    .eq("month_reference", monthReference)
    .eq("entry_type", "automatic")
    .single();

  let entry;
  if (existing) {
    const newTotal = existing.total_sales_value + saleValue;
    const newCommissionValue = Math.round(newTotal * commissionRate / 100 * 100) / 100;
    const { data } = await supabase
      .from("commission_entries")
      .update({
        total_sales_value: newTotal,
        contracts_count: existing.contracts_count + 1,
        commission_rate: commissionRate,
        commission_value: newCommissionValue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    entry = data;
  } else {
    const commissionValue = Math.round(saleValue * commissionRate / 100 * 100) / 100;
    const { data } = await supabase
      .from("commission_entries")
      .insert({
        organization_id: organizationId,
        profile_id: profileId,
        month_reference: monthReference,
        total_sales_value: saleValue,
        contracts_count: 1,
        commission_rate: commissionRate,
        commission_value: commissionValue,
        bonus_value: 0,
        bonus_rate: 0,
        is_board_member: false,
        entry_type: "automatic",
        status: "pending",
      })
      .select()
      .single();
    entry = data;
  }

  await supabase.from("commission_entry_sales").insert({
    commission_entry_id: entry.id,
    contract_id: contractId,
    client_name: clientName,
    product: product ?? null,
    sale_date: saleDate ?? null,
    first_payment_date: firstPaymentDate ?? null,
    value: saleValue,
  });

  return entry;
}

// 4.9 — Aplicar bônus conforme tier de meta atingida
async function checkAndApplyBonus(supabase, profileId: string, monthReference: string, organizationId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("bonus_rate_120, bonus_rate_135, bonus_rate_150")
    .eq("id", profileId)
    .single();

  const { data: entry } = await supabase
    .from("commission_entries")
    .select("id, total_sales_value")
    .eq("profile_id", profileId)
    .eq("month_reference", monthReference)
    .eq("entry_type", "automatic")
    .single();

  if (!entry) return;

  const { data: goal } = await supabase
    .from("goals")
    .select("id, target_value, current_value")
    .or(`assigned_to.eq.${profileId}`)
    .lte("period_start", monthReference)
    .gte("period_end", monthReference)
    .in("source", ["manual", "team_sales", "board_revenue"])
    .limit(1)
    .maybeSingle();

  let bonusRate = 0;
  let bonusValue = 0;
  let goalAchievedPct = null;
  let goalId = null;
  let goalTarget = null;

  if (goal && goal.target_value > 0) {
    const pct = goal.current_value / goal.target_value;
    goalAchievedPct = Math.round(pct * 100 * 100) / 100;
    goalId = goal.id;
    goalTarget = goal.target_value;

    if (pct >= 1.5) {
      bonusRate = profile?.bonus_rate_150 ?? 0;
    } else if (pct >= 1.35) {
      bonusRate = profile?.bonus_rate_135 ?? 0;
    } else if (pct >= 1.2) {
      bonusRate = profile?.bonus_rate_120 ?? 0;
    }

    bonusValue = Math.round(entry.total_sales_value * bonusRate / 100 * 100) / 100;
  }

  await supabase.from("commission_entries").update({
    bonus_rate: bonusRate,
    bonus_value: bonusValue,
    goal_id: goalId,
    goal_target: goalTarget,
    goal_achieved_pct: goalAchievedPct,
    updated_at: new Date().toISOString(),
  }).eq("id", entry.id);
}

// 4.11 — Atualizar metas com source = 'team_sales'
async function updateGoalsTeamSales(supabase, teamId: string, monthReference: string) {
  const { data: goals } = await supabase
    .from("goals")
    .select("id, period_start, period_end")
    .eq("team_id", teamId)
    .eq("source", "team_sales")
    .lte("period_start", monthReference)
    .gte("period_end", monthReference);

  for (const goal of goals ?? []) {
    const { data: payments } = await supabase
      .from("payments")
      .select("amount, contracts!inner(leads!inner(team_id))")
      .eq("status", "pago")
      .eq("contracts.leads.team_id", teamId)
      .gte("paid_at", goal.period_start)
      .lte("paid_at", goal.period_end);

    const newValue = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);
    await supabase.from("goals").update({ current_value: newValue }).eq("id", goal.id);
  }
}

// 4.11 — Atualizar metas com source = 'board_revenue'
async function updateGoalsBoardRevenue(supabase, organizationId: string, monthReference: string) {
  const { data: goals } = await supabase
    .from("goals")
    .select("id, period_start, period_end")
    .eq("organization_id", organizationId)
    .eq("source", "board_revenue")
    .lte("period_start", monthReference)
    .gte("period_end", monthReference);

  for (const goal of goals ?? []) {
    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("organization_id", organizationId)
      .eq("status", "pago")
      .gte("paid_at", goal.period_start)
      .lte("paid_at", goal.period_end);

    const newValue = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);
    await supabase.from("goals").update({ current_value: newValue }).eq("id", goal.id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    const payment = payload.record;

    // Filtro 1: apenas pagamentos com status = 'pago'
    if (payment.status !== "pago") {
      return new Response(JSON.stringify({ message: "Ignorado: status != pago" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filtro 2: verificar se é o primeiro pagamento pago do contrato
    const { count } = await supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("contract_id", payment.contract_id)
      .eq("status", "pago");

    if ((count ?? 0) > 1) {
      return new Response(JSON.stringify({ message: "Ignorado: não é o primeiro pagamento" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filtro 3: buscar contrato e lead
    const { data: contract } = await supabase
      .from("contracts")
      .select("*, leads(*)")
      .eq("id", payment.contract_id)
      .single();

    if (!contract || !contract.leads) {
      return new Response(JSON.stringify({ message: "Ignorado: contrato ou lead não encontrado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = contract.leads;

    // Filtro 4: lead deve estar em 'efetivados'
    if (lead.etapa_kanban !== "efetivados") {
      return new Response(JSON.stringify({ message: "Ignorado: lead não está em efetivados" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monthReference = payment.paid_at.substring(0, 7) + "-01"; // YYYY-MM-01

    const saleValue = contract.first_payment_value ?? 0;
    const clientName = contract.client_name ?? "Cliente";
    const product = contract.product ?? null;
    const saleDate = contract.created_at?.substring(0, 10) ?? null;
    const firstPaymentDate = payment.paid_at?.substring(0, 10) ?? null;

    // Closer
    if (lead.closer_id) {
      const { data: closer } = await supabase
        .from("profiles")
        .select("commission_rate")
        .eq("id", lead.closer_id)
        .single();
      if (closer) {
        await upsertCommissionEntry(supabase, {
          organizationId: payment.organization_id,
          profileId: lead.closer_id,
          monthReference,
          contractId: contract.id,
          clientName, product, saleDate, firstPaymentDate,
          saleValue,
          commissionRate: closer.commission_rate ?? 0,
        });
      }
    } else {
      await supabase.from("contracts").update({
        metadata: { ...contract.metadata, commission_skipped_closer: true }
      }).eq("id", contract.id);
    }

    // SDR
    if (lead.sdr_id) {
      const { data: sdr } = await supabase
        .from("profiles")
        .select("commission_rate")
        .eq("id", lead.sdr_id)
        .single();
      if (sdr) {
        await upsertCommissionEntry(supabase, {
          organizationId: payment.organization_id,
          profileId: lead.sdr_id,
          monthReference,
          contractId: contract.id,
          clientName, product, saleDate, firstPaymentDate,
          saleValue,
          commissionRate: sdr.commission_rate ?? 0,
        });
      }
    } else {
      await supabase.from("contracts").update({
        metadata: { ...contract.metadata, commission_skipped_sdr: true }
      }).eq("id", contract.id);
    }

    // Gerente da equipe
    if (lead.team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("lead_id")
        .eq("id", lead.team_id)
        .single();

      if (team?.lead_id) {
        const { data: manager } = await supabase
          .from("profiles")
          .select("commission_rate")
          .eq("id", team.lead_id)
          .single();

        if (manager) {
          // Calcular total de vendas da equipe no mês (primeiros pagamentos)
          const { data: teamSales } = await supabase
            .from("contracts")
            .select("first_payment_value, leads!inner(team_id), payments!inner(paid_at, status)")
            .eq("leads.team_id", lead.team_id)
            .eq("payments.status", "pago");

          // Filtrar apenas primeiros pagamentos do mês de referência
          const teamTotal = (teamSales ?? []).reduce((sum, c) => {
            const paidAt = c.payments?.[0]?.paid_at;
            if (paidAt && paidAt.startsWith(monthReference.substring(0, 7))) {
              return sum + (c.first_payment_value ?? 0);
            }
            return sum;
          }, 0);

          // UPSERT commission_entry para o gerente (sem commission_entry_sales)
          const { data: existingManager } = await supabase
            .from("commission_entries")
            .select("*")
            .eq("profile_id", team.lead_id)
            .eq("month_reference", monthReference)
            .eq("entry_type", "automatic")
            .single();

          const managerCommissionValue = Math.round(teamTotal * (manager.commission_rate ?? 0) / 100 * 100) / 100;

          if (existingManager) {
            await supabase.from("commission_entries").update({
              total_sales_value: teamTotal,
              commission_rate: manager.commission_rate ?? 0,
              commission_value: managerCommissionValue,
              updated_at: new Date().toISOString(),
            }).eq("id", existingManager.id);
          } else {
            await supabase.from("commission_entries").insert({
              organization_id: payment.organization_id,
              profile_id: team.lead_id,
              month_reference: monthReference,
              total_sales_value: teamTotal,
              contracts_count: 0,
              commission_rate: manager.commission_rate ?? 0,
              commission_value: managerCommissionValue,
              bonus_value: 0,
              bonus_rate: 0,
              is_board_member: false,
              entry_type: "automatic",
              status: "pending",
            });
          }
        }
      }
    }

    // 4.7 — Diretoria (is_board_member)
    const { data: boardTotal } = await supabase
      .from("payments")
      .select("amount")
      .eq("organization_id", payment.organization_id)
      .eq("status", "pago")
      .gte("paid_at", monthReference)
      .lt("paid_at", new Date(new Date(monthReference).setMonth(new Date(monthReference).getMonth() + 1)).toISOString().substring(0, 10));

    const boardTotalValue = (boardTotal ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const { data: boardMembers } = await supabase
      .from("profiles")
      .select("id, commission_rate")
      .eq("organization_id", payment.organization_id)
      .eq("is_board_member", true);

    for (const member of boardMembers ?? []) {
      const boardCommissionValue = Math.round(boardTotalValue * (member.commission_rate ?? 0) / 100 * 100) / 100;
      const { data: existingBoard } = await supabase
        .from("commission_entries")
        .select("id")
        .eq("profile_id", member.id)
        .eq("month_reference", monthReference)
        .eq("entry_type", "automatic")
        .single();

      if (existingBoard) {
        await supabase.from("commission_entries").update({
          total_sales_value: boardTotalValue,
          commission_rate: member.commission_rate ?? 0,
          commission_value: boardCommissionValue,
          is_board_member: true,
          updated_at: new Date().toISOString(),
        }).eq("id", existingBoard.id);
      } else {
        await supabase.from("commission_entries").insert({
          organization_id: payment.organization_id,
          profile_id: member.id,
          month_reference: monthReference,
          total_sales_value: boardTotalValue,
          contracts_count: 0,
          commission_rate: member.commission_rate ?? 0,
          commission_value: boardCommissionValue,
          bonus_value: 0,
          bonus_rate: 0,
          is_board_member: true,
          entry_type: "automatic",
          status: "pending",
        });
      }
      await checkAndApplyBonus(supabase, member.id, monthReference, payment.organization_id);
    }

    // 4.9 — check_and_apply_bonus para closer, sdr e gerente
    if (lead.closer_id) await checkAndApplyBonus(supabase, lead.closer_id, monthReference, payment.organization_id);
    if (lead.sdr_id) await checkAndApplyBonus(supabase, lead.sdr_id, monthReference, payment.organization_id);
    if (lead.team_id) {
      const { data: teamForBonus } = await supabase.from("teams").select("lead_id").eq("id", lead.team_id).single();
      if (teamForBonus?.lead_id) await checkAndApplyBonus(supabase, teamForBonus.lead_id, monthReference, payment.organization_id);
    }

    // 4.11 — Atualizar metas automáticas
    if (lead.team_id) await updateGoalsTeamSales(supabase, lead.team_id, monthReference);
    await updateGoalsBoardRevenue(supabase, payment.organization_id, monthReference);

    return new Response(JSON.stringify({ message: "Processado", monthReference }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
