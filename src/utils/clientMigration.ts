import type { Client } from "@/types/crm";

/**
 * Migra valores de responsible_name/responsible_phone para decision_maker_name/decision_maker_phone
 * quando os campos decision_maker estiverem vazios.
 *
 * Lógica: decision_maker_name = decision_maker_name ?? responsible_name
 *         decision_maker_phone = decision_maker_phone ?? responsible_phone
 *
 * Os campos responsible_* permanecem no banco para compatibilidade — apenas a UI usa decision_maker_*.
 */
export function migrateResponsibleToDecisionMaker(client: Partial<Client>): Partial<Client> {
  return {
    ...client,
    decision_maker_name: (client.decision_maker_name ?? client.responsible_name) || undefined,
    decision_maker_phone: (client.decision_maker_phone ?? client.responsible_phone) || undefined,
  };
}
