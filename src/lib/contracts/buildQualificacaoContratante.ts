/**
 * buildQualificacaoContratante — monta o parágrafo de qualificação do
 * contratante conforme tipo de pessoa (PF/PJ), representantes legais
 * e procuradores.
 *
 * Regras:
 *  - PF (CPF, 11 dígitos): nome + nacionalidade + estado civil + CPF + endereço
 *  - PJ (CNPJ, 14 dígitos): razão social + CNPJ + endereço + representação
 *  - Representação pode ser:
 *      · Nenhuma   → sem cláusula "representada por"
 *      · Legal     → "neste ato representada por [nome], CPF ..., [cargo]"
 *      · Procurador → "neste ato representada por seu bastante procurador
 *                      [nome], CPF ..., conforme poderes outorgados por
 *                      procuração [tipo] lavrada em [data], cuja cópia
 *                      integra este instrumento como Anexo"
 *      · Ambos (assinatura conjunta) → concatena com " e "
 *  - Procurador que representa sócio específico acrescenta
 *    "representando [nome do sócio], CPF ..."
 *
 * Gênero gramatical:
 *  - Quando `sexo` está preenchido ('masculino' | 'feminino'), as expressões
 *    genéricas ("inscrito(a)", "residente e domiciliado(a)", "denominado(a)")
 *    são resolvidas para a forma correta sem o "(a)".
 *  - Quando `sexo` é nulo/ausente, mantém a forma ambígua com "(a)".
 *
 * O prazo de validade da procuração NÃO aparece no texto do contrato —
 * é apenas dado interno do CRM.
 */

import type { ClientRepresentativeAssembly } from '../../types/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normaliza dígitos para detectar PF (11) vs PJ (14) */
function onlyDigits(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

function isPF(doc: string | null | undefined): boolean {
  return onlyDigits(doc).length <= 11;
}

/** Formata data ISO "YYYY-MM-DD" → "DD/MM/YYYY" */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

/** Formata CPF: 00000000000 → 000.000.000-00 */
function fmtCpf(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 11) return v ?? '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Formata CNPJ: 00000000000100 → 00.000.000/0001-00 */
function fmtCnpj(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 14) return v ?? '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Rótulo do tipo de procuração */
function labelProcuracao(tipo: string | null | undefined): string {
  if (tipo === 'publica') return 'pública';
  if (tipo === 'particular') return 'particular';
  return '';
}

/** Gênero gramatical da frase de representação conforme tipo de pessoa */
function representadaPor(pf: boolean, sexo?: string | null): string {
  if (pf) {
    if (sexo === 'feminino') return 'representada';
    return 'representado'; // masculino ou indefinido → masculino
  }
  return 'representada'; // PJ é sempre "representada"
}

/**
 * Resolve uma expressão do tipo "palavra(a)" de acordo com o sexo informado.
 * Ex: genero("inscrito(a)", "feminino") → "inscrita"
 *     genero("inscrito(a)", "masculino") → "inscrito"
 *     genero("inscrito(a)", null)        → "inscrito(a)"
 */
function genero(forma: string, sexo?: string | null): string {
  if (!sexo) return forma;
  if (sexo === 'feminino') return forma.replace(/\(a\)/g, 'a').replace(/o\b(?=\s|,|$)/g, 'a');
  // masculino: remove o "(a)"
  return forma.replace(/\(a\)/g, '');
}

// ---------------------------------------------------------------------------
// Montagem do fragmento de cada representante
// ---------------------------------------------------------------------------

/**
 * Monta o fragmento de texto para um único representante legal (direto).
 * Ex: "João Silva, CPF nº 000.000.000-00, sócio-administrador"
 */
function fragmentoLegal(rep: ClientRepresentativeAssembly): string {
  const cargo = rep.cargo ?? rep.qualificacao ?? '';
  const parts = [
    `<strong>${rep.nome}</strong>`,
    `CPF nº ${fmtCpf(rep.cpf)}`,
    ...(cargo ? [cargo] : []),
  ];
  return parts.join(', ');
}

/**
 * Monta o fragmento de texto para um procurador.
 *
 * Ex sem representa_ids (representa a parte diretamente):
 *   "seu bastante procurador João Silva, CPF nº ..., conforme poderes
 *    outorgados por procuração particular lavrada em 10/05/2025, cuja cópia
 *    integra este instrumento como Anexo"
 *
 * Ex com representa_ids (representa sócio específico):
 *   "seu bastante procurador João Silva, CPF nº ..., representando
 *    Pedro Costa, CPF nº ..., conforme poderes ..."
 */
function fragmentoProcurador(
  proc: ClientRepresentativeAssembly,
  allReps: ClientRepresentativeAssembly[]
): string {
  const cpfFormatado = fmtCpf(proc.cpf);
  const tipoLabel = labelProcuracao(proc.procuracao_tipo);
  const dataLabel = fmtDate(proc.procuracao_data);

  // Quem este procurador representa (sócio específico)?
  let representandoFragment = '';
  if (proc.representa_ids && proc.representa_ids.length > 0) {
    const representados = proc.representa_ids
      .map((rid) => allReps.find((r) => r.id === rid))
      .filter(Boolean) as ClientRepresentativeAssembly[];

    if (representados.length > 0) {
      const nomes = representados
        .map((r) => `${r.nome}, CPF nº ${fmtCpf(r.cpf)}`)
        .join('; ');
      representandoFragment = `, representando ${nomes}`;
    }
  }

  // Cláusula da procuração
  const clausulaPartes: string[] = [];
  if (tipoLabel) clausulaPartes.push(`procuração ${tipoLabel}`);
  else clausulaPartes.push('procuração');
  if (dataLabel) clausulaPartes.push(`lavrada em ${dataLabel}`);

  const clausula = clausulaPartes.join(' ');

  return [
    `seu bastante procurador <strong>${proc.nome}</strong>, CPF nº ${cpfFormatado}`,
    representandoFragment,
    `, conforme poderes outorgados por ${clausula}, cuja cópia integra este instrumento como Anexo`,
  ].join('');
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

export interface QualificacaoInput {
  /** Razão social (PJ) ou nome completo (PF) */
  name: string;
  /** CPF (11 dígitos) ou CNPJ (14 dígitos), apenas números ou formatado */
  document?: string | null;
  /** Endereço completo formatado (Rua X, 123, Cidade/UF) */
  address?: string | null;
  /** Estado civil — exibido apenas para PF */
  estado_civil?: string | null;
  /** Nacionalidade — exibido apenas para PF. Default: 'brasileiro(a)' */
  nacionalidade?: string | null;
  /**
   * Sexo biológico ('masculino' | 'feminino'). Quando preenchido, resolve o
   * gênero gramatical das expressões do contrato (inscrito/a, domiciliado/a,
   * denominado/a etc.) sem exibir a forma dupla "(a)".
   */
  sexo?: string | null;
  /** Todos os representantes do cliente (legais + procuradores) */
  representatives?: ClientRepresentativeAssembly[];
}

/**
 * Retorna o HTML do parágrafo de qualificação do contratante pronto para
 * ser injetado no parties_block como `{{qualificacao_contratante}}`.
 */
export function buildQualificacaoContratante(input: QualificacaoInput): string {
  const {
    name,
    document,
    address,
    estado_civil,
    nacionalidade = 'brasileiro(a)',
    sexo,
    representatives = [],
  } = input;

  const pf = isPF(document);
  const doc = onlyDigits(document);

  // Signatários deste contrato (is_signing_responsible = true, ou todos se nenhum marcado)
  const signatarios = representatives.filter((r) => r.is_signing_responsible !== false);
  const legais = signatarios.filter((r) => r.tipo_representacao === 'legal');
  const procuradores = signatarios.filter((r) => r.tipo_representacao === 'procurador');

  // ── Bloco de representação ────────────────────────────────────────────────
  const fragmentos: string[] = [];

  // PF: o próprio titular é o contratante — representantes legais não entram
  // no texto do contrato (foram cadastrados apenas para viabilizar o cadastro
  // do procurador). Só procuradores aparecem na qualificação.
  if (!pf) {
    for (const rep of legais) {
      fragmentos.push(fragmentoLegal(rep));
    }
  }
  for (const proc of procuradores) {
    fragmentos.push(fragmentoProcurador(proc, representatives));
  }

  // Texto de representação (vazio se não houver nenhum)
  let representacaoClause = '';
  if (fragmentos.length > 0) {
    const joined =
      fragmentos.length === 1
        ? fragmentos[0]
        : fragmentos.slice(0, -1).join(', ') + ', e ' + fragmentos[fragmentos.length - 1];
    representacaoClause = `, neste ato ${representadaPor(pf, sexo)} por ${joined}`;
  }

  // ── Monta parágrafo conforme PF ou PJ ────────────────────────────────────
  let texto: string;

  if (pf) {
    // Pessoa Física
    const cpfFormatado = fmtCpf(doc);
    const estadoCivilLabel = labelEstadoCivil(estado_civil, sexo);
    // Resolve nacionalidade com gênero correto (ex: "brasileira" se feminino)
    const nacionalidadeLabel = labelNacionalidade(nacionalidade, sexo);
    const qualifs: string[] = [];
    if (nacionalidadeLabel) qualifs.push(nacionalidadeLabel);
    if (estadoCivilLabel) qualifs.push(estadoCivilLabel);
    qualifs.push(`${genero('inscrito(a)', sexo)} no CPF nº ${cpfFormatado}`);
    if (address) qualifs.push(`${genero('residente e domiciliado(a)', sexo)} em ${address}`);

    texto =
      `<strong>${name}</strong>, ${qualifs.join(', ')}` +
      representacaoClause +
      `, doravante ${genero('denominado(a)', sexo)} <strong>CONTRATANTE</strong>.`;
  } else {
    // Pessoa Jurídica
    const cnpjFormatado = fmtCnpj(doc);
    const partes: string[] = [
      `<strong>${name}</strong>`,
      'pessoa jurídica de direito privado',
      `inscrita no CNPJ nº ${cnpjFormatado}`,
    ];
    if (address) partes.push(`com sede na ${address}`);

    texto =
      partes.join(', ') +
      representacaoClause +
      ', doravante denominado(a) <strong>CONTRATANTE</strong>.';
  }

  return texto;
}

// ---------------------------------------------------------------------------
// Helper: label do estado civil (resolve gênero quando sexo informado)
// ---------------------------------------------------------------------------
function labelEstadoCivil(v: string | null | undefined, sexo?: string | null): string {
  const fem = sexo === 'feminino';
  const masc = sexo === 'masculino';
  switch (v) {
    case 'solteiro':
      if (fem)  return 'solteira';
      if (masc) return 'solteiro';
      return 'solteiro(a)';
    case 'casado':
    case 'casada':
      if (fem)  return 'casada';
      if (masc) return 'casado';
      return 'casado(a)';
    case 'viuvo':
    case 'viuva':
      if (fem)  return 'viúva';
      if (masc) return 'viúvo';
      return 'viúvo(a)';
    case 'divorciado':
    case 'divorciada':
      if (fem)  return 'divorciada';
      if (masc) return 'divorciado';
      return 'divorciado(a)';
    case 'uniao_estavel': return 'em união estável';
    default:              return '';
  }
}

// ---------------------------------------------------------------------------
// Helper: label da nacionalidade (resolve gênero quando sexo informado)
// ---------------------------------------------------------------------------

/**
 * Tabela de conversão masculino → feminino para as nacionalidades mais comuns.
 * Para nacionalidades não mapeadas, mantém o valor original.
 */
const NACIONALIDADE_FEMININO: Record<string, string> = {
  'brasileiro':   'brasileira',
  'argentino':    'argentina',
  'uruguaio':     'uruguaia',
  'paraguaio':    'paraguaia',
  'colombiano':   'colombiana',
  'chileno':      'chilena',
  'peruano':      'peruana',
  'boliviano':    'boliviana',
  'venezuelano':  'venezuelana',
  'equatoriano':  'equatoriana',
  'americano':    'americana',
  'português':    'portuguesa',
  'espanhol':     'espanhola',
  'italiano':     'italiana',
  'francês':      'francesa',
  'alemão':       'alemã',
  'inglês':       'inglesa',
  'japonês':      'japonesa',
  'chinês':       'chinesa',
  'mexicano':     'mexicana',
};

function labelNacionalidade(raw: string | null | undefined, sexo?: string | null): string {
  if (!raw) return '';
  // Remove a forma dupla como "brasileiro(a)" → normaliza para a base
  const base = raw.replace(/\(a\)/gi, '').trim().toLowerCase();
  if (!sexo) return raw; // sem sexo → mantém o valor original do cadastro
  if (sexo === 'feminino') {
    return NACIONALIDADE_FEMININO[base] ?? raw.replace(/\(a\)/gi, 'a').trim();
  }
  // masculino → remove "(a)" se houver
  return raw.replace(/\(a\)/gi, '').trim();
}
