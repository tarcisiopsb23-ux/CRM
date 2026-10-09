import type {
  SelectedService,
  SelectedDeliverable,
  ServiceDeliverable,
  ServiceCatalogItem,
} from '../../types/contracts';

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  recorrente: 'recorrente',
  unico:      'execução única',
  pontual:    'pontual',
};

const PERIOD_LABELS: Record<string, string> = {
  dia:         'por dia',
  semana:      'por semana',
  mes:         'por mês',
  vigencia:    'durante a vigência',
  nao_indicar: '',
};

const EXECUTION_FORMAT_LABELS: Record<string, string> = {
  consultivo: 'consultiva',
  executivo:  'executiva',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveUnit(
  value: number | null | undefined,
  unit: string | null | undefined,
  unitPlural: string | null | undefined
): string | null {
  if (!unit) return null;
  if (value != null && value > 1 && unitPlural) return unitPlural;
  return unit;
}

function formatDeadline(sd: SelectedDeliverable): string | null {
  if (!sd.deadline_type || sd.deadline_value == null) return null;
  if (sd.deadline_type === 'data_limite') {
    const d = new Date((sd.deadline_value as string) + 'T00:00:00');
    const formatted = isNaN(d.getTime())
      ? String(sd.deadline_value)
      : d.toLocaleDateString('pt-BR');
    return `prazo até ${formatted}`;
  }
  const unit = sd.deadline_type === 'dias' ? 'dias' : 'meses';
  return `prazo de ${sd.deadline_value} ${unit}`;
}

// ---------------------------------------------------------------------------
// buildScopeHtml
//
// Produces an HTML string for {{servicos}} / {{escopo}} / {{lista_servicos}}.
//
// Output format per service:
//
//   <p><strong>• Assessoria de Marketing Digital e Vendas</strong></p>
//   <p style="...">Modalidade: Híbrida (consultiva e executiva).</p>
//   <p style="...">Escopo: Planejamento estratégico...</p>
//   <p style="..."><strong>Entregáveis:</strong></p>
//   <table>
//     <tr> — Gestão de campanhas / tipo / modalidade / quantidade / prazo </tr>
//     ...
//   </table>
//
// Designed to be safe for injection into a contract HTML body.
// ---------------------------------------------------------------------------

export function buildScopeString(
  services: SelectedService[],
  catalogDeliverables?: Map<string, ServiceDeliverable>,
  catalogItems?: Map<string, ServiceCatalogItem>
): string {
  if (services.length === 0) return '';

  const blocks = services.map((svc, svcIdx) => {
    const catalogItem = catalogItems?.get(svc.service_id);
    const included = (svc.selected_deliverables ?? []).filter((sd) => sd.included);

    // ── Service header ──────────────────────────────────────────────────────
    const lines: string[] = [];
    const serviceMarginTop = svcIdx === 0 ? '0' : '8pt';

    lines.push(
      `<p style="margin:${serviceMarginTop} 0 2pt 0"><strong>• ${escapeHtml(svc.service_name)}</strong></p>`
    );

    // Modalidade
    if (catalogItem?.modality) {
      lines.push(
        `<p style="margin:0 0 2pt 12pt;font-size:0.95em">` +
        `<strong>Modalidade:</strong> ${escapeHtml(catalogItem.modality)}.` +
        `</p>`
      );
    }

    // Escopo
    if (catalogItem?.scope) {
      lines.push(
        `<p style="margin:0 0 2pt 12pt;font-size:0.95em">` +
        `<strong>Escopo:</strong> ${escapeHtml(catalogItem.scope)}.` +
        `</p>`
      );
    }

    // ── Entregáveis ─────────────────────────────────────────────────────────
    if (included.length > 0) {
      lines.push(
        `<p style="margin:6pt 0 4pt 12pt;font-size:0.95em"><strong>Entregáveis:</strong></p>`
      );

      const deliverableRows = included.map((sd) => {
        const cat = catalogDeliverables?.get(sd.deliverable_id);
        const delName = cat?.name ?? sd.deliverable_id;

        const props: string[] = [];

        // Tipo de serviço
        if (cat?.delivery_type) {
          props.push(
            `<span style="display:block;margin-left:24pt;font-size:0.9em">` +
            `Tipo de serviço: <em>${DELIVERY_TYPE_LABELS[cat.delivery_type] ?? cat.delivery_type}</em>` +
            `</span>`
          );
        }

        // Modalidade de execução (somente se híbrido)
        if (sd.execution_format) {
          props.push(
            `<span style="display:block;margin-left:24pt;font-size:0.9em">` +
            `Tipo de execução: <em>${EXECUTION_FORMAT_LABELS[sd.execution_format] ?? sd.execution_format}</em>` +
            `</span>`
          );
        }

        // Texto fixo
        if (cat?.output_format === 'texto' && cat.text_value) {
          props.push(
            `<span style="display:block;margin-left:24pt;font-size:0.9em">` +
            `Descrição: <em>${escapeHtml(cat.text_value)}</em>` +
            `</span>`
          );
        }

        // Quantidade e período
        if (cat?.output_format === 'numero' && sd.number_value != null) {
          const unit = resolveUnit(sd.number_value, cat.unit, cat.unit_plural);
          const qtyStr = unit
            ? `${sd.number_value} ${unit}`
            : String(sd.number_value);

          const periodLabel =
            cat.delivery_type === 'recorrente' && sd.period
              ? PERIOD_LABELS[sd.period] ?? ''
              : '';

          const qtyLine = periodLabel
            ? `${qtyStr} ${periodLabel}`.trim()
            : qtyStr;

          props.push(
            `<span style="display:block;margin-left:24pt;font-size:0.9em">` +
            `Quantidade: <em>${escapeHtml(qtyLine)}</em>` +
            `</span>`
          );
        }

        // Prazo
        const deadline = formatDeadline(sd);
        if (deadline) {
          props.push(
            `<span style="display:block;margin-left:24pt;font-size:0.9em">` +
            `Prazo: <em>${escapeHtml(deadline)}</em>` +
            `</span>`
          );
        }

        return (
          `<p style="margin:2pt 0 0 18pt;font-size:0.95em">` +
          `<strong>- ${escapeHtml(delName)}</strong>` +
          `</p>` +
          props.join('')
        );
      });

      lines.push(...deliverableRows);
    }

    return lines.join('\n');
  });

  return `<div style="margin-bottom:18pt">${blocks.join('\n')}</div>`;
}

// ---------------------------------------------------------------------------
// escapeHtml — prevents XSS when injecting user content into HTML
// ---------------------------------------------------------------------------
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
