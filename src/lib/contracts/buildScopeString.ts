import type { SelectedService } from '../../types/contracts';

/**
 * Builds the scope string for the {{servicos}} variable.
 * Format per service: "• [ServiceName]: [field1]: [value1], [field2]: [value2], ..."
 * Services are joined with newlines.
 * Returns empty string when services array is empty.
 * Property 12: adding a service never reduces the string length.
 */
export function buildScopeString(services: SelectedService[]): string {
  if (services.length === 0) return '';
  return services
    .map((svc) => {
      const fields = Object.entries(svc.sub_service_values)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      return fields ? `• ${svc.service_name}: ${fields}` : `• ${svc.service_name}`;
    })
    .join('\n');
}
