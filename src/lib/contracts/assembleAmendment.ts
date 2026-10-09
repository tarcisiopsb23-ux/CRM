/**
 * assembleAmendment
 *
 * Monta o HTML do documento de aditivo contratual a partir de:
 *   - Dados do contrato original (snapshot antes + estado atual)
 *   - Dados do aditivo (tipo, motivo, novos valores, novos prazos)
 *   - Dados do cliente e representantes (para qualificação das partes)
 *   - Template de aditivo (html_content com {{variáveis}})
 *
 * Variáveis disponíveis no template:
 *
 * ── Aditivo ──────────────────────────────────────────────────────────────────
 *   {{numero_aditivo}}        1º, 2º, 3º…
 *   {{tipo_aditivo}}          "Renovação", "Reajuste de valor", etc.
 *   {{motivo}}                Texto livre informado pelo usuário
 *   {{data_aditivo}}          Data de hoje (ex: 11 de agosto de 2026)
 *
 * ── Prazo ────────────────────────────────────────────────────────────────────
 *   {{prazo_anterior}}        Ex: 12 meses
 *   {{prazo_anterior_extenso}} Ex: doze (12) meses
 *   {{meses_adicionais}}      Ex: 12 meses
 *   {{novo_prazo}}            Ex: 24 meses
 *   {{novo_prazo_extenso}}    Ex: vinte e quatro (24) meses
 *   {{data_inicio_anterior}}  dd/MM/yyyy
 *   {{data_termino_anterior}} dd/MM/yyyy
 *   {{nova_data_termino}}     dd/MM/yyyy
 *
 * ── Valor ────────────────────────────────────────────────────────────────────
 *   {{valor_anterior}}        Ex: R$ 3.000,00
 *   {{novo_valor}}            Ex: R$ 4.000,00
 *   {{vigencia_novo_valor}}   dd/MM/yyyy
 *
 * ── Contrato ─────────────────────────────────────────────────────────────────
 *   {{titulo_contrato}}       Título do contrato original
 *   {{servico_contratado}}    Serviço contratado
 *   {{data_contrato}}         Data de assinatura do contrato original
 *
 * ── Cliente (contratante) ────────────────────────────────────────────────────
 *   {{contratante}}           Razão social ou nome
 *   {{documento_contratante}} CPF/CNPJ formatado
 *   {{qualificacao_contratante}} Bloco completo de qualificação
 *
 * ── Assinatura ───────────────────────────────────────────────────────────────
 *   {{bloco_assinaturas}}     HTML do bloco de assinaturas
 *   {{cidade_estado}}         Cidade/Estado para o foro
 */

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { resolveVariables } from "./resolveVariables";
import type { ContractAmendment, AmendmentType } from "@/hooks/useContractAmendments";
import type { ContractTemplate } from "@/hooks/useContractTemplates";

// ── Tipos de entrada ──────────────────────────────────────────────────────────

export interface AssembleAmendmentClient {
  name?: string | null;
  company_name?: string | null;
  document?: string | null;
  cidade?: string | null;
  estado?: string | null;
  estado_civil?: string | null;
  nacionalidade?: string | null;
  representatives?: Array<{
    nome: string;
    cpf: string;
    cargo?: string | null;
    qualificacao?: string | null;
    is_signing_responsible?: boolean;
  }>;
}

export interface AssembleAmendmentContract {
  id: string;
  title: string;
  service_contracted?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_months?: number | null;
  value?: number | null;
  signed_at?: string | null;
  client_id: string;
}

export interface AmendmentAssemblyResult {
  html: string;
  resolvedVariables: Record<string, string>;
  unresolvedVariables: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AMENDMENT_TYPE_LABEL: Record<AmendmentType, string> = {
  renovacao: "Renovação",
  reajuste:  "Reajuste de valor",
  prazo:     "Extensão de prazo",
  escopo:    "Alteração de escopo",
  outro:     "Outro",
};

const ORDINAL: Record<number, string> = {
  1: "1º", 2: "2º", 3: "3º", 4: "4º", 5: "5º",
  6: "6º", 7: "7º", 8: "8º", 9: "9º", 10: "10º",
};

function ordinal(n: number): string {
  return ORDINAL[n] ?? `${n}º`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = parseISO(iso.includes("T") ? iso : iso + "T00:00:00");
    return format(d, "dd/MM/yyyy");
  } catch { return iso; }
}

function fmtDateExtenso(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = parseISO(iso.includes("T") ? iso : iso + "T00:00:00");
    return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch { return iso; }
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const MESES_EXTENSO: Record<number, string> = {
  1: "um", 2: "dois", 3: "três", 4: "quatro", 5: "cinco",
  6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez",
  11: "onze", 12: "doze", 13: "treze", 14: "quatorze", 15: "quinze",
  16: "dezesseis", 17: "dezessete", 18: "dezoito", 19: "dezenove",
  20: "vinte", 24: "vinte e quatro", 36: "trinta e seis",
  48: "quarenta e oito", 60: "sessenta",
};

function mesesExtenso(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  const label = MESES_EXTENSO[n] ? `${MESES_EXTENSO[n]} (${n})` : String(n);
  return `${label} ${n === 1 ? "mês" : "meses"}`;
}

function buildQualificacaoContratante(client: AssembleAmendmentClient): string {
  const nome = client.company_name ?? client.name ?? "";
  const doc = client.document ?? "";
  const docLabel = doc.replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF";
  const reps = (client.representatives ?? []).filter(r => r.is_signing_responsible !== false);

  if (!reps.length) {
    return `<strong>${nome}</strong>, inscrito(a) no ${docLabel} sob o nº <strong>${doc}</strong>`;
  }

  const repParts = reps.map(r => {
    const qual = r.qualificacao
      ? `, ${r.qualificacao.replace(/_/g, " ")}`
      : r.cargo ? `, ${r.cargo}` : "";
    return `<strong>${r.nome}</strong> (CPF: ${r.cpf}${qual})`;
  });

  return `<strong>${nome}</strong>, inscrita no ${docLabel} sob o nº <strong>${doc}</strong>, representada por ${repParts.join(" e ")}`;
}

function buildSignatureBlock(client: AssembleAmendmentClient): string {
  const nome = client.company_name ?? client.name ?? "";
  const reps = (client.representatives ?? []).filter(r => r.is_signing_responsible !== false);

  const repLines = reps.length > 0
    ? reps.map(r => `
      <div style="margin-top: 40px; text-align: center;">
        <div style="border-top: 1px solid #000; width: 280px; margin: 0 auto;"></div>
        <p style="margin: 4px 0 0;">${r.nome}</p>
        <p style="margin: 2px 0; font-size: 11px; color: #555;">CPF: ${r.cpf}${r.cargo ? ` — ${r.cargo}` : ""}</p>
        <p style="margin: 2px 0; font-size: 11px; color: #555;">pela CONTRATANTE: ${nome}</p>
      </div>`).join("")
    : `
      <div style="margin-top: 40px; text-align: center;">
        <div style="border-top: 1px solid #000; width: 280px; margin: 0 auto;"></div>
        <p style="margin: 4px 0 0;">${nome}</p>
        <p style="margin: 2px 0; font-size: 11px; color: #555;">CONTRATANTE</p>
      </div>`;

  return `<div style="margin-top: 60px;">${repLines}</div>`;
}

// ── Função principal ──────────────────────────────────────────────────────────

export function assembleAmendment(
  amendment: ContractAmendment,
  contract:  AssembleAmendmentContract,
  client:    AssembleAmendmentClient,
  template:  ContractTemplate
): AmendmentAssemblyResult {
  if (!template.html_content && !template.structure) {
    throw new Error(
      "Template de aditivo não configurado. Acesse Configurações → Contratos → Templates de Aditivo para configurar."
    );
  }

  const today = new Date();

  // ── Snap anterior ─────────────────────────────────────────────────────────
  const snap = amendment.previous_snapshot ?? {};
  const prevValue    = (snap.value as number | undefined) ?? contract.value ?? 0;
  const prevDuration = (snap.duration_months as number | undefined) ?? contract.duration_months ?? 0;
  const prevEndDate  = (snap.end_date as string | undefined) ?? contract.end_date;

  // ── Mapa de variáveis ─────────────────────────────────────────────────────
  const varMap: Record<string, string> = {
    // Aditivo
    numero_aditivo:   ordinal(amendment.amendment_number),
    tipo_aditivo:     AMENDMENT_TYPE_LABEL[amendment.amendment_type] ?? amendment.amendment_type,
    motivo:           amendment.reason,
    data_aditivo:     fmtDateExtenso(format(today, "yyyy-MM-dd")),

    // Prazo anterior
    prazo_anterior:        mesesExtenso(prevDuration),
    prazo_anterior_extenso: mesesExtenso(prevDuration),
    meses_adicionais:      mesesExtenso(amendment.additional_months),
    novo_prazo:            mesesExtenso(amendment.new_duration_months ?? (prevDuration + (amendment.additional_months ?? 0))),
    novo_prazo_extenso:    mesesExtenso(amendment.new_duration_months ?? (prevDuration + (amendment.additional_months ?? 0))),
    data_inicio_anterior:  fmtDate(contract.start_date),
    data_termino_anterior: fmtDate(prevEndDate),
    nova_data_termino:     fmtDate(amendment.new_end_date),

    // Valor
    valor_anterior:      fmtCurrency(prevValue),
    novo_valor:          fmtCurrency(amendment.new_value ?? prevValue),
    vigencia_novo_valor: fmtDate(amendment.value_effective_date),

    // Contrato
    titulo_contrato:   contract.title,
    servico_contratado: contract.service_contracted ?? contract.title,
    data_contrato:     fmtDate(contract.signed_at ?? contract.start_date),

    // Cliente
    contratante:               client.company_name ?? client.name ?? "",
    documento_contratante:     client.document ?? "",
    qualificacao_contratante:  buildQualificacaoContratante(client),

    // Localização
    cidade_estado: [client.cidade, client.estado].filter(Boolean).join("/"),

    // Assinaturas
    bloco_assinaturas: buildSignatureBlock(client),
  };

  // ── Monta o HTML ──────────────────────────────────────────────────────────
  // Usa html_content se disponível, caso contrário monta via structure
  let rawHtml: string;
  if (template.html_content) {
    rawHtml = template.html_content;
  } else if (template.structure) {
    const s = template.structure!;
    rawHtml = [s.header, s.parties_block, s.clauses_block, s.signature_block, s.footer]
      .filter(Boolean)
      .join("\n");
  } else {
    rawHtml = "";
  }

  const { output: html, unresolved } = resolveVariables(rawHtml, varMap);

  return {
    html,
    resolvedVariables: varMap,
    unresolvedVariables: unresolved,
  };
}
