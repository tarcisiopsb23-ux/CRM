/**
 * buildSignatureBlockHtml
 *
 * Extrai a lógica de montagem do {{bloco_assinaturas}} do ContractGenerator
 * para que possa ser reutilizada no preview do SignatureBlockEditor e em
 * qualquer outro lugar que precise gerar o HTML do bloco de assinaturas.
 *
 * Layout:
 *   CONTRATADA          |  CONTRATANTE
 *   AGÊNCIA C8 LTDA     |  EMPRESA XYZ LTDA
 *   ________________    |  ________________ (rep 1)
 *   Tarcísio...         |  João da Silva
 *   Sócio-Administrador |  Sócio-Administrador
 *                       |  ________________ (rep 2, se houver)
 *                       |  Maria Oliveira
 *
 * Regra para procurador:
 *   - O procurador assina NO LUGAR dos representados que ele representa.
 *   - NÃO é gerado campo para o representado — só para o procurador.
 *   - Abaixo do nome do procurador aparece a nota de representação, ex:
 *     "Procurador(a) de Fulano de Tal"
 *   - Isso é válido juridicamente: o procurador age por mandato e sua
 *     assinatura vincula o representado.
 */

import { QUALIFICACAO_LABELS } from "@/hooks/useClientRepresentatives";
import type { RepresentativeQualificacao } from "@/hooks/useClientRepresentatives";

export interface SignatureRep {
  nome: string;
  cpf: string;
  cargo?: string | null;
  qualificacao?: RepresentativeQualificacao | string | null;
  tipo_representacao?: "legal" | "procurador" | null;
  /** Nomes dos representados (já resolvidos pelo caller) — apenas para procuradores */
  representa_nomes?: string[] | null;
}

export interface BuildSignatureBlockOptions {
  /** Razão social do contratante (empresa do cliente) */
  contratanteRazaoSocial: string;
  /** Lista de representantes a exibir na coluna CONTRATANTE */
  reps: SignatureRep[];
}

export function buildSignatureBlockHtml({
  contratanteRazaoSocial,
  reps,
}: BuildSignatureBlockOptions): string {
  // Coluna CONTRATADA — sempre fixa
  const contratadaHtml = `
    <p style="text-align:center"><strong>CONTRATADA</strong></p>
    <p style="text-align:center"><strong>AGÊNCIA C8 LTDA</strong></p>
    <p class="sig-line" style="border-bottom:1px solid #000;margin:24pt 0 4pt">&nbsp;</p>
    <p style="text-align:center">Tarcísio Pereira da Silva Brito</p>
    <p style="text-align:center">Sócio-Administrador</p>
    <p style="text-align:center">CPF: 089.712.156-23</p>`;

  // Coluna CONTRATANTE — uma linha de assinatura por representante
  // Nota: a filtragem dos representados de procuradores é feita pelo caller
  // antes de passar a lista. Aqui apenas renderizamos o que foi recebido.
  const repLinhas = reps.map((r, idx) => {
    const isProcurador = r.tipo_representacao === "procurador";

    // Rótulo do cargo/qualificação
    const qual = r.qualificacao
      ? (QUALIFICACAO_LABELS[r.qualificacao as RepresentativeQualificacao] ?? r.cargo ?? "")
      : (r.cargo ?? "");

    // Nota de representação para procurador
    const notaRepresentacao = isProcurador && r.representa_nomes && r.representa_nomes.length > 0
      ? `<p style="text-align:center;font-size:0.9em">na qualidade de Procurador(a) de ${r.representa_nomes.join(" e ")}</p>`
      : isProcurador
        ? `<p style="text-align:center;font-size:0.9em">Procurador(a)</p>`
        : "";

    // Para procurador, o cargo exibido é "Procurador(a)" apenas se não
    // houver nota de representação; caso contrário usa a qual normal (se existir)
    const cargoExibido = isProcurador
      ? (qual && qual.toLowerCase() !== "procurador(a)" ? qual : "")
      : qual;

    return `
    ${idx > 0 ? "<br/>" : ""}
    <p class="sig-line" style="border-bottom:1px solid #000;margin:24pt 0 4pt">&nbsp;</p>
    <p style="text-align:center">${r.nome}</p>
    ${cargoExibido ? `<p style="text-align:center">${cargoExibido}</p>` : ""}
    ${notaRepresentacao}
    <p style="text-align:center">CPF: ${r.cpf}</p>`;
  });

  // Se não há representantes, mostra 1 linha em branco
  const contratanteLinhas = repLinhas.length > 0
    ? repLinhas.join("")
    : `<p class="sig-line" style="border-bottom:1px solid #000;margin:24pt 0 4pt">&nbsp;</p>`;

  const contratanteHtml = `
    <p style="text-align:center"><strong>CONTRATANTE</strong></p>
    <p style="text-align:center"><strong>${contratanteRazaoSocial}</strong></p>
    ${contratanteLinhas}`;

  return `<table class="sig-table" style="width:100%;margin-top:36pt;border-collapse:collapse">
  <tbody>
    <tr>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:top;border:none">
        ${contratadaHtml}
      </td>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:top;border:none">
        ${contratanteHtml}
      </td>
    </tr>
  </tbody>
</table>`;
}
