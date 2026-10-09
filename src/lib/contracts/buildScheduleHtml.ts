/**
 * buildScheduleHtml
 *
 * Converts a contract payment schedule (ContractPaymentLine[]) into an HTML
 * string suitable for injection into {{cronograma_pagamento}}.
 *
 * Renders ONLY the payment table — PIX info and late-payment terms are
 * handled by dedicated template alíneas using their own variables.
 *
 * Used by:
 *  - assembleContract.ts  (new contracts_v2 flow)
 *  - ContractViewer.tsx   (legacy contracts flow)
 */

export interface ScheduleLine {
  line_type: string;
  period_label: string;
  due_date: string | null;
  amount: number;
  month_to: number | null;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Table CSS injected inline — discrete borders, column spacing. */
const TABLE_STYLE =
  'border-collapse:collapse;width:100%;margin:6pt 0;font-size:0.95em';
const TH_STYLE =
  'text-align:left;padding:4pt 12pt 4pt 0;border-bottom:1px solid #d0d0d0;font-weight:bold';
const TD_STYLE =
  'padding:3pt 12pt 3pt 0;border-bottom:1px solid #eeeeee';
const TD_AMOUNT_STYLE =
  'padding:3pt 0;border-bottom:1px solid #eeeeee;text-align:right;white-space:nowrap';

/**
 * Formats a date string (YYYY-MM-DD) without UTC offset issues.
 * Uses T12:00:00 to stay within the same calendar day in any timezone.
 */
function safeDate(dateStr: string): Date {
  return new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
}

/**
 * Converts a period_label or ISO date string to MM/AAAA format.
 * Accepts "YYYY-MM-DD", "DD/MM/YYYY", "ago/2026", "MM/YYYY", etc.
 * Falls back to the original string if parsing fails.
 */
function toPeriodRef(label: string): string {
  // Already in MM/AAAA format (e.g. "08/2026")
  if (/^\d{2}\/\d{4}$/.test(label)) return label;

  // ISO date YYYY-MM-DD or YYYY-MM
  if (/^\d{4}-\d{2}/.test(label)) {
    const d = safeDate(label.length === 7 ? label + '-01' : label);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
    }
  }

  // DD/MM/YYYY — extract MM/YYYY
  const dmyMatch = label.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) return `${dmyMatch[2]}/${dmyMatch[3]}`;

  // "ago/2026", "set/2026" — Portuguese month abbreviation
  const ptMonths: Record<string, string> = {
    jan:'01', fev:'02', mar:'03', abr:'04', mai:'05', jun:'06',
    jul:'07', ago:'08', set:'09', out:'10', nov:'11', dez:'12',
  };
  const ptMatch = label.match(/^([a-z]{3})\/(\d{4})$/i);
  if (ptMatch) {
    const mm = ptMonths[ptMatch[1].toLowerCase()];
    if (mm) return `${mm}/${ptMatch[2]}`;
  }

  return label; // fallback: return as-is
}

export function buildScheduleHtml(lines: ScheduleLine[]): string {
  if (!lines || lines.length === 0) return "";

  const monthlyLines = lines.filter(l => l.line_type === "mensalidade");
  const setupLines   = lines.filter(l => l.line_type === "setup" || l.line_type === "unico");
  const isSimple     = monthlyLines.length === 1
                       && setupLines.length === 0
                       && monthlyLines[0].month_to === null;

  if (isSimple) {
    const m = monthlyLines[0];
    const dueDay  = m.due_date ? safeDate(m.due_date).getDate() : "___";
    const fmtDate = m.due_date
      ? safeDate(m.due_date).toLocaleDateString("pt-BR", {
          day: "2-digit", month: "long", year: "numeric",
        })
      : "";
    return (
      `<p>` +
      `${fmt(m.amount)} mensais, vencimento todo dia ${dueDay}` +
      (fmtDate ? `, com primeira parcela em ${fmtDate}` : "") +
      `.` +
      `</p>`
    );
  }

  const rows = lines
    .map(l => {
      const dueCell = l.due_date
        ? safeDate(l.due_date).toLocaleDateString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
          })
        : "—";
      return (
        `<tr>` +
        `<td style="${TD_STYLE}">${toPeriodRef(l.period_label)}</td>` +
        `<td style="${TD_STYLE}">${dueCell}</td>` +
        `<td style="${TD_AMOUNT_STYLE}">${fmt(l.amount)}</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `<table style="${TABLE_STYLE}">` +
    `<thead><tr>` +
    `<th style="${TH_STYLE}">Referência</th>` +
    `<th style="${TH_STYLE}">Vencimento</th>` +
    `<th style="${TH_STYLE.replace('text-align:left','text-align:right')}">Valor</th>` +
    `</tr></thead>` +
    `<tbody>${rows}</tbody>` +
    `</table>`
  );
}

// ---------------------------------------------------------------------------
// Demo HTML — used in editor previews when no real schedule data is available
// ---------------------------------------------------------------------------

const DEMO_ROWS = [
  ["08/2026",  "20/08/2026", "R$\u00a01.500,00"],
  ["09/2026",  "20/09/2026", "R$\u00a02.000,00"],
  ["10/2026",  "20/10/2026", "R$\u00a03.000,00"],
  ["11/2026\u2013jul/2027", "venc. todo dia 20", "R$\u00a03.000,00"],
].map(([p, d, v]) =>
  `<tr>` +
  `<td style="${TD_STYLE}">${p}</td>` +
  `<td style="${TD_STYLE}">${d}</td>` +
  `<td style="${TD_AMOUNT_STYLE}">${v}</td>` +
  `</tr>`
).join("");

export const SCHEDULE_PREVIEW_HTML =
  `<table style="${TABLE_STYLE}">` +
  `<thead><tr>` +
  `<th style="${TH_STYLE}">Referência</th>` +
  `<th style="${TH_STYLE}">Vencimento</th>` +
  `<th style="${TH_STYLE.replace('text-align:left','text-align:right')}">Valor</th>` +
  `</tr></thead>` +
  `<tbody>${DEMO_ROWS}</tbody>` +
  `</table>`;
