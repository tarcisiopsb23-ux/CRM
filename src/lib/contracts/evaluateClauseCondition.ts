import type { ContractClause } from "@/hooks/useContractTemplates";
import type { ContractPaymentLine } from "@/hooks/useContractSchedule";

export interface ContractConditionContext {
  selectedSlugs: string[];
  totalSetup: number;
  totalMonthly: number;
  prazoMeses: number;
  representativeCount: number;
  signingType: "individual" | "joint";
  scheduleLines: ContractPaymentLine[];
  hasSetup?: boolean;
  vigenciaInicio?: string; // data ISO "yyyy-MM-dd"
}

/**
 * Avalia se uma alínea deve ser incluída no contrato dado o contexto atual.
 * Suporta retrocompatibilidade com o sistema antigo (is_fixed / service_slug)
 * e o novo sistema de condições (condition_type / condition_value).
 */
export function evaluateClauseCondition(
  clause: ContractClause,
  ctx: ContractConditionContext,
): boolean {
  // Novo sistema — condition_type presente
  if (clause.condition_type != null) {
    const cv = clause.condition_value ?? {};
    switch (clause.condition_type) {
      case "always":
        return true;

      case "service": {
        const slugs = (cv.slugs as string[] | undefined) ?? [];
        return slugs.some(s => ctx.selectedSlugs.includes(s));
      }

      case "has_setup":
        return ctx.hasSetup !== undefined ? ctx.hasSetup : ctx.totalSetup > 0;

      case "has_min_duration": {
        const minMonths = (cv.min_months as number | undefined) ?? 1;
        return ctx.prazoMeses >= minMonths;
      }

      case "has_multiple_representatives":
        return ctx.representativeCount > 1;

      case "signing_type": {
        const type = (cv.type as string | undefined) ?? "individual";
        return ctx.signingType === type;
      }

      case "has_schedule":
        return ctx.scheduleLines.length > 0;

      case "has_deferred_start":
        // Vigência inicia depois da data de contratação
        return !!(ctx.vigenciaInicio && ctx.vigenciaInicio.length > 0);

      case "service_count": {
        const min = (cv.min as number | undefined) ?? 1;
        return ctx.selectedSlugs.length >= min;
      }

      default:
        return true;
    }
  }

  // Retrocompatibilidade: usa is_fixed / service_slug
  if (clause.is_fixed) return true;
  if (clause.service_slug != null) return ctx.selectedSlugs.includes(clause.service_slug);
  return true;
}
