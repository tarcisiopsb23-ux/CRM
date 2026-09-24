/**
 * useProposalToContract
 *
 * Hook que converte dados de uma proposta aprovada para os campos
 * de entrada do ContractGenerator.
 *
 * Busca:
 * - Dados da proposta (título, client_id, serviços, valor, schedule)
 * - Dados do cliente (razão social, CNPJ, endereço, representante)
 * - Serviços/blocos da proposta → mapeia para slugs do contrato
 * - schedule JSONB → dueDay, paymentMethod, firstDate, graceMonths, setupValue, installments
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ProposalImport } from "@/components/contracts/ContractGenerator";
import type { ScheduleConfig } from "@/types/proposals";

// Mapeamento de nomes de serviço da proposta → slugs dos blocos de contrato
// Ajuste conforme os nomes usados no seu catálogo de serviços
const SERVICE_NAME_TO_SLUG: Record<string, string> = {
  "agente de ia":               "agente_ia",
  "agente ia":                  "agente_ia",
  "agente virtual":             "agente_ia",
  "implementação de ia":        "agente_ia",
  "assessoria":                 "assessoria",
  "assessoria de performance":  "assessoria",
  "consultoria":                "consultoria",
  "consultoria estratégica":    "consultoria",
  "site":                       "site",
  "projeto web":                "site",
  "landing page":               "site",
  "desenvolvimento web":        "site",
};

function guessSlug(serviceName: string): string | null {
  const lower = serviceName.toLowerCase().trim();
  for (const [key, slug] of Object.entries(SERVICE_NAME_TO_SLUG)) {
    if (lower.includes(key)) return slug;
  }
  return null;
}

/**
 * Extrai campos contratuais relevantes do schedule JSONB da proposta.
 * Retorna apenas os campos que estiverem definidos (sem defaults inventados).
 */
function extractScheduleFields(schedule: ScheduleConfig | null): Pick<
  ProposalImport,
  | "due_day"
  | "payment_method"
  | "first_payment_date"
  | "grace_period_months"
  | "setup_amount"
  | "monthly_amount"
  | "prazo_meses"
> {
  if (!schedule) return {};

  const result: ReturnType<typeof extractScheduleFields> = {};

  // Dia de vencimento
  if (schedule.dueDay && schedule.dueDay >= 1 && schedule.dueDay <= 28) {
    result.due_day = schedule.dueDay;
  }

  // Método de pagamento
  if (schedule.paymentMethod) {
    result.payment_method = schedule.paymentMethod;
  }

  // Data do primeiro pagamento
  if (schedule.firstDate) {
    result.first_payment_date = schedule.firstDate;
  }

  // Carência (campo direto no schedule)
  if (schedule.graceMonths && schedule.graceMonths > 0) {
    result.grace_period_months = schedule.graceMonths;
  }

  // Carência via modo 'carencia' com slices
  if (schedule.mode === "carencia" && schedule.slices?.length) {
    const graceSlice = schedule.slices[0];
    if (graceSlice?.installments && graceSlice.installments > 0) {
      result.grace_period_months = graceSlice.installments;
    }
  }

  // Setup
  if (schedule.hasSetup && schedule.setupValue && schedule.setupValue > 0) {
    result.setup_amount = schedule.setupValue;
  }
  // Modo legado setup_mensal
  if (schedule.mode === "setup_mensal" && schedule.setupValue && schedule.setupValue > 0) {
    result.setup_amount = schedule.setupValue;
  }

  // Valor mensal recorrente
  if (schedule.firstValue && schedule.firstValue > 0) {
    result.monthly_amount = schedule.firstValue;
  }

  // Prazo em meses (número de parcelas recorrentes)
  if (schedule.installments && schedule.installments > 0) {
    result.prazo_meses = schedule.installments;
  }

  return result;
}

export function useProposalToContract(proposalId: string | undefined) {
  return useQuery<ProposalImport | null>({
    queryKey: ["proposal_to_contract", proposalId],
    queryFn: async (): Promise<ProposalImport | null> => {
      if (!proposalId) return null;

      // Busca proposta + serviços + dados do cliente
      // Agora inclui "schedule" para extrair campos financeiros
      const [propRes, servRes] = await Promise.all([
        supabase
          .from("proposals")
          .select(`
            id, title, client_id, plan_value, status, schedule,
            clients (
              id, name, company, document, email, phone,
              address_street, address_city, address_state, address_zip
            )
          `)
          .eq("id", proposalId)
          .single(),
        supabase
          .from("proposal_services")
          .select("name, slug, price, service_type")
          .eq("proposal_id", proposalId)
          .order("sort_order"),
      ]);

      if (propRes.error || !propRes.data) return null;

      const prop     = propRes.data as Record<string, unknown>;
      const client   = prop.clients as Record<string, string | null> | null;
      const services = (servRes.data ?? []) as Array<Record<string, string | null>>;
      const schedule = (prop.schedule ?? null) as ScheduleConfig | null;

      // Mapeia serviços para slugs de blocos de contrato
      const serviceSlugs = services
        .map(s => {
          // Tenta slug direto primeiro, depois por nome
          if (s.slug && Object.values(SERVICE_NAME_TO_SLUG).includes(s.slug as string)) {
            return s.slug as string;
          }
          return guessSlug(s.name ?? "");
        })
        .filter((s): s is string => s !== null)
        // Remove duplicatas
        .filter((s, i, arr) => arr.indexOf(s) === i);

      // Monta endereço completo
      const parts = [
        client?.address_street,
        client?.address_city,
        client?.address_state,
        client?.address_zip,
      ].filter(Boolean);
      const address = parts.length > 0 ? parts.join(", ") : null;

      // Extrai campos financeiros do schedule
      const scheduleFields = extractScheduleFields(schedule);

      return {
        id:                  proposalId,
        title:               prop.title as string,
        service_slugs:       serviceSlugs,
        client_name:         client?.company ?? client?.name ?? "",
        client_cnpj:         client?.document ?? "",
        client_address:      address,
        representative_name: client?.name ?? "",
        representative_cpf:  "", // não disponível na proposta — usuário preenche no Step 3
        ...scheduleFields,
      };
    },
    enabled: !!proposalId,
    staleTime: 30_000,
  });
}
