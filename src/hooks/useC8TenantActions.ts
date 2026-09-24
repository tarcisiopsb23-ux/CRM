import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { addMonths, format } from "date-fns";

export interface C8TenantFormValues {
  client_id: string;
  plan_name: string;
  plan_value: number;
  max_users: number;
  due_day: number;
  billing_cycle?: string;
  contract_start: string;
  contract_end?: string;
  primary_user_email?: string;
  notes?: string;
  organization_id: string;
  send_credentials?: boolean;
}

export function useC8TenantActions(organizationId: string | undefined) {
  const qc = useQueryClient();

  const invalidateTenants = () =>
    qc.invalidateQueries({ queryKey: ["c8_tenants", organizationId] });

  const invalidateClients = () =>
    qc.invalidateQueries({ queryKey: ["clients", organizationId] });

  // ── saveTenant ──────────────────────────────────────────────────────────────
  const saveTenant = useMutation({
    mutationFn: async (input: C8TenantFormValues) => {
      const orgId = input.organization_id || organizationId;
      if (!orgId) throw new Error("Sem organização");
      console.log("[C8] saveTenant", { orgId, clientId: input.client_id, planValue: input.plan_value });

      // 1. UPSERT crm_client_plans
      const { error: planError } = await supabase
        .from("crm_client_plans")
        .upsert(
          {
            organization_id: orgId,
            client_id: input.client_id,
            plan_name: input.plan_name,
            plan_value: input.plan_value,
            max_users: input.max_users,
            due_day: input.due_day,
            billing_cycle: input.billing_cycle ?? "mensal",
            contract_start: input.contract_start ?? null,
            contract_end: input.contract_end ?? null,
            primary_user_email: input.primary_user_email ?? null,
            notes: input.notes ?? null,
          },
          { onConflict: "client_id" }
        );
      if (planError) throw planError;

      // 2. UPDATE clients.c8_control_enabled = true
      const { error: clientError } = await supabase
        .from("clients")
        .update({ c8_control_enabled: true })
        .eq("id", input.client_id);
      if (clientError) throw clientError;

      // 2a. Auto-register primary_user_email in crm_client_users if provided
      if (input.primary_user_email) {
        const { data: existing } = await supabase
          .from("crm_client_users")
          .select("id")
          .eq("client_id", input.client_id)
          .eq("email", input.primary_user_email)
          .maybeSingle();

        if (!existing) {
          await supabase.from("crm_client_users").insert({
            organization_id: orgId,
            client_id: input.client_id,
            email: input.primary_user_email,
            name: null,
            active: true,
            is_primary: true,
          });
        }
      }

      // 2b. Provisionar tenant no C8 Control (sempre, independente de send_credentials)
      // Inclui dados do usuário principal, plano e suporte
      {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token && input.primary_user_email) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

          // Busca dados completos do cliente e senha de suporte
          const [{ data: clientData }, { data: supportRecord }] = await Promise.all([
            supabase.from("clients").select("name, company, document, phone, address_street, address_city, address_state, address_zip").eq("id", input.client_id).single(),
            supabase.from("c8_support_passwords").select("support_email, password").eq("client_id", input.client_id).maybeSingle(),
          ]);

          fetch(`${supabaseUrl}/functions/v1/c8-provision-tenant`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              tenant_id:           input.client_id,
              tenant_name:         clientData?.company || clientData?.name || input.plan_name,
              admin_email:         input.primary_user_email,
              client_id:           input.client_id,
              // Campos mapeados para a tabela clients do C8 Control
              company:             clientData?.company ?? null,
              cnpj:                clientData?.document ?? null,
              phone:               clientData?.phone ?? null,
              email:               input.primary_user_email,
              primary_contact:     clientData?.name ?? null,
              address:             [clientData?.address_street, clientData?.address_city, clientData?.address_state, clientData?.address_zip].filter(Boolean).join(", ") || null,
              contract_start_date: input.contract_start ?? null,
              client_status:       "ativo",
              // Dados do plano
              plan_name:           input.plan_name,
              plan_value:          input.plan_value,
              max_users:           input.max_users,
              due_day:             input.due_day,
              billing_cycle:       input.billing_cycle ?? "mensal",
              contract_end:        input.contract_end ?? null,
              // Suporte
              support_email:       supportRecord?.support_email ?? null,
              support_password:    supportRecord?.password ?? null,
              is_support:          false,
              send_welcome_email:  input.send_credentials ?? false,
            }),
          })
            .then(() => supabase
              .from("crm_client_plans")
              .update({ provisioned_at: new Date().toISOString(), provisioning_status: "sent" })
              .eq("client_id", input.client_id)
            )
            .catch(e => console.warn("[C8] provision-tenant failed:", e));
        }
      }

      // 2c. Auto-provision support user (no email sent)
      {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const { data: clientData } = await supabase
            .from("clients").select("name, company").eq("id", input.client_id).single();
          const clientName = clientData?.company || clientData?.name || input.plan_name;
          fetch(`${supabaseUrl}/functions/v1/c8-support-user`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              action: "provision",
              client_id: input.client_id,
              client_name: clientName,
            }),
          }).catch(e => console.warn("[C8] support provision failed:", e));
        }
      }

      // 3. Handle contract if plan_value > 0
      if (input.plan_value > 0) {
        // Check for existing active CRM contract
        const { data: existingContracts, error: contractQueryError } = await supabase
          .from("contracts")
          .select("id")
          .eq("client_id", input.client_id)
          .eq("service_contracted", "C8 Control CRM")
          .eq("status", "ativo")
          .limit(1);

        if (contractQueryError) throw contractQueryError;

        // Only create a new contract if none exists
        if (!existingContracts || existingContracts.length === 0) {
          const { data: clientData, error: clientNameError } = await supabase
            .from("clients")
            .select("name")
            .eq("id", input.client_id)
            .single();
          if (clientNameError) throw clientNameError;

          const clientName = clientData?.name ?? input.plan_name;

          const durationMonths = input.contract_end
            ? Math.max(
                1,
                Math.round(
                  (new Date(input.contract_end).getTime() -
                    new Date(input.contract_start).getTime()) /
                    (1000 * 60 * 60 * 24 * 30)
                )
              )
            : 12;

          const startDate = new Date(input.contract_start);
          const endDate = addMonths(startDate, durationMonths);
          const toIso = (d: Date) => format(d, "yyyy-MM-dd");

          // Insert contract directly using the resolved orgId
          const { data: contract, error: contractError } = await supabase
            .from("contracts")
            .insert({
              organization_id: orgId,
              client_id: input.client_id,
              title: `CRM — ${clientName}`,
              service_contracted: "C8 Control CRM",
              status: "ativo",
              start_date: input.contract_start,
              contract_date: input.contract_start,
              end_date: toIso(endDate),
              periodicity: "mensal",
              value: input.plan_value,
              duration_months: durationMonths,
              first_payment_value: input.plan_value,
              first_payment_method: "boleto",
              first_payment_due_date: input.contract_start,
              first_payment_installments: 1,
              first_payment_fees: 0,
              first_payment_split: false,
              recurring_due_date: input.contract_start,
              metadata: { source: "c8_control", max_users: input.max_users },
            })
            .select("id")
            .single();
          if (contractError) {
            console.error("[C8] contract insert error:", contractError);
            throw contractError;
          }

          const contractId = (contract as { id: string }).id;

          // Generate recurring payments for the contract duration
          const payments = [];
          for (let i = 0; i < durationMonths; i++) {
            payments.push({
              organization_id: orgId,
              contract_id: contractId,
              client_id: input.client_id,
              description: `Contrato • CRM — ${clientName}`,
              value: input.plan_value,
              due_date: toIso(addMonths(new Date(input.contract_start), i)),
              status: "pendente",
              payment_method: "boleto",
            });
          }
          if (payments.length > 0) {
            const { error: payErr } = await supabase.from("payments").insert(payments);
            if (payErr) {
              console.error("[C8] payments insert error:", payErr);
              throw payErr;
            }

            // Sincroniza pagamentos com o C8 Control (fire-and-forget)
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
              const syncPayload = payments.map((p, i) => ({
                tenant_id:      input.client_id,
                maestria_id:    `pending_${i}`, // será atualizado após insert retornar IDs
                gateway:        "manual",
                description:    p.description,
                amount:         p.value,
                currency:       "BRL",
                due_date:       p.due_date,
                paid_at:        null,
                status:         "pendente",
                payment_method: "boleto",
                is_recurring:   true,
              }));
              fetch(`${supabaseUrl}/functions/v1/c8-sync-payments`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${session.access_token}`,
                  "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify(syncPayload),
              }).catch(e => console.warn("[C8] sync-payments failed:", e));
            }
          }

          // Invalidate contracts for this client
          qc.invalidateQueries({ queryKey: ["contracts", orgId, input.client_id] });
          qc.invalidateQueries({ queryKey: ["payments", orgId] });
        }
      }
    },
    onSuccess: () => {
      invalidateTenants();
      invalidateClients();
    },
  });

  // ── blockTenant ─────────────────────────────────────────────────────────────
  const blockTenant = useMutation({
    mutationFn: async ({
      clientId,
      reason,
      organizationId: _orgId,
    }: {
      clientId: string;
      reason: string;
      organizationId: string;
    }) => {
      const { error: planError } = await supabase
        .from("crm_client_plans")
        .update({ subscription_status: "bloqueado", blocked_reason: reason })
        .eq("client_id", clientId);
      if (planError) throw planError;

      const { error: sessionsError } = await supabase
        .from("crm_sessions")
        .update({ revoked: true })
        .eq("client_id", clientId);
      if (sessionsError) throw sessionsError;
    },
    onSuccess: () => invalidateTenants(),
  });

  // ── unblockTenant ────────────────────────────────────────────────────────────
  const unblockTenant = useMutation({
    mutationFn: async ({
      clientId,
      organizationId: _orgId,
    }: {
      clientId: string;
      organizationId: string;
    }) => {
      const { error } = await supabase
        .from("crm_client_plans")
        .update({ subscription_status: "ativo", blocked_reason: null })
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => invalidateTenants(),
  });

  // ── reactivateTenant — reativa de qualquer status (inclusive cancelado) ──────
  const reactivateTenant = useMutation({
    mutationFn: async ({
      clientId,
      organizationId: _orgId,
    }: {
      clientId: string;
      organizationId: string;
    }) => {
      const { error: planError } = await supabase
        .from("crm_client_plans")
        .update({
          subscription_status: "ativo",
          blocked_reason: null,
          suspended_at: null,
        })
        .eq("client_id", clientId);
      if (planError) throw planError;

      // Reativa o cliente (necessário quando vem de cancelado)
      const { error: clientError } = await supabase
        .from("clients")
        .update({ c8_control_enabled: true })
        .eq("id", clientId);
      if (clientError) throw clientError;
    },
    onSuccess: () => {
      invalidateTenants();
      invalidateClients();
    },
  });

  // ── suspendTenant ────────────────────────────────────────────────────────────
  const suspendTenant = useMutation({
    mutationFn: async ({
      clientId,
      organizationId: _orgId,
    }: {
      clientId: string;
      organizationId: string;
    }) => {
      const { error } = await supabase
        .from("crm_client_plans")
        .update({
          subscription_status: "suspenso",
          suspended_at: new Date().toISOString(),
        })
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => invalidateTenants(),
  });

  // ── cancelTenant ─────────────────────────────────────────────────────────────
  const cancelTenant = useMutation({
    mutationFn: async ({
      clientId,
      organizationId: _orgId,
    }: {
      clientId: string;
      organizationId: string;
    }) => {
      const { error: planError } = await supabase
        .from("crm_client_plans")
        .update({ subscription_status: "cancelado" })
        .eq("client_id", clientId);
      if (planError) throw planError;

      const { error: clientError } = await supabase
        .from("clients")
        .update({ c8_control_enabled: false })
        .eq("id", clientId);
      if (clientError) throw clientError;
    },
    onSuccess: () => {
      invalidateTenants();
      invalidateClients();
    },
  });

  // ── deleteTenant — remove o tenant do C8 Control e cancela o contrato ────────
  const deleteTenant = useMutation({
    mutationFn: async ({
      clientId,
      organizationId: _orgId,
    }: {
      clientId: string;
      organizationId: string;
    }) => {
      // 1. Buscar e-mail do usuário principal antes de deletar
      const { data: plan } = await supabase
        .from("crm_client_plans")
        .select("primary_user_email")
        .eq("client_id", clientId)
        .maybeSingle();

      // 2. Cancela o contrato C8 Control CRM
      const { error: contractError } = await supabase
        .from("contracts")
        .update({ status: "cancelado" })
        .eq("client_id", clientId)
        .eq("service_contracted", "C8 Control CRM");
      if (contractError) throw contractError;

      // 3. Revoga todas as sessões CRM do cliente
      const { error: sessionsError } = await supabase
        .from("crm_sessions")
        .update({ revoked: true })
        .eq("client_id", clientId);
      if (sessionsError) throw sessionsError;

      // 4. Remove o plano CRM
      const { error: planError } = await supabase
        .from("crm_client_plans")
        .delete()
        .eq("client_id", clientId);
      if (planError) throw planError;

      // 5. Desvincula o cliente do C8 Control
      const { error: clientError } = await supabase
        .from("clients")
        .update({ c8_control_enabled: false })
        .eq("id", clientId);
      if (clientError) throw clientError;

      // 6. Excluir usuário principal do auth.users do C8 Control via Edge Function
      if (plan?.primary_user_email) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const res = await fetch(`${supabaseUrl}/functions/v1/c8-delete-user`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ email: plan.primary_user_email }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn("[C8] c8-delete-user (primary) warning:", err);
          }
        }
      }

      // 7. Excluir usuário de suporte do C8 Control + registro no Maestr.ia
      const { data: supportRecord } = await supabase
        .from("c8_support_passwords")
        .select("support_email")
        .eq("client_id", clientId)
        .maybeSingle();

      if (supportRecord?.support_email) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const res = await fetch(`${supabaseUrl}/functions/v1/c8-delete-user`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ email: supportRecord.support_email }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn("[C8] c8-delete-user (support) warning:", err);
          }
        }
        // Remove support record from Maestr.ia regardless of C8 result
        await supabase
          .from("c8_support_passwords")
          .delete()
          .eq("client_id", clientId);
      }
    },
    onSuccess: () => {
      invalidateTenants();
      invalidateClients();
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["c8_support_passwords"] });
      qc.invalidateQueries({ queryKey: ["c8_tenants_all_for_support"] });
    },
  });
  const renewContract = useMutation({
    mutationFn: async ({
      clientId,
      newEndDate,
      organizationId: _orgId,
    }: {
      clientId: string;
      newEndDate: string;
      organizationId: string;
    }) => {
      const { error: planError } = await supabase
        .from("crm_client_plans")
        .update({ contract_end: newEndDate })
        .eq("client_id", clientId);
      if (planError) throw planError;

      const { error: contractError } = await supabase
        .from("contracts")
        .update({ end_date: newEndDate })
        .eq("client_id", clientId)
        .eq("service_contracted", "C8 Control CRM")
        .eq("status", "ativo");
      if (contractError) throw contractError;
    },
    onSuccess: (_data, vars) => {
      invalidateTenants();
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.clientId] });
    },
  });

  return {
    saveTenant,
    blockTenant,
    unblockTenant,
    reactivateTenant,
    suspendTenant,
    cancelTenant,
    deleteTenant,
    renewContract,
  };
}
