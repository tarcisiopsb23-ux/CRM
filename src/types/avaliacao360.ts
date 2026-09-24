export type CicloStatus = 'ativo' | 'encerrado';
export type CicloTipo = '360' | 'checkin' | 'probatorio';
export type AvaliacaoTipo = 'autoavaliacao' | 'gestor' | 'pares' | 'liderado';
export type AvaliacaoStatus = 'pendente' | 'concluido';
export type DecisaoProbatorio = 'efetivado' | 'desligado' | 'periodo_estendido';

// ─── Critérios 360° ──────────────────────────────────────────────────────────
export type CriterioComportamental =
  | 'comunicacao'
  | 'trabalho_em_equipe'
  | 'proatividade'
  | 'responsabilidade'
  | 'alinhamento_cultural';

export type CriterioPerformance =
  | 'qualidade_de_entrega'
  | 'foco_em_resultados';

export type CriterioDesenvolvimento =
  | 'resolucao_de_problemas'
  | 'evolucao_e_aprendizado';

// ─── Critérios Probatório ─────────────────────────────────────────────────────
export type CriterioAdaptacao =
  | 'dominio_tecnico'
  | 'qualidade_entrega_prob'
  | 'cumprimento_prazos';

export type CriterioIntegracao =
  | 'adaptacao_cultura'
  | 'relacionamento_equipe'
  | 'comunicacao_prob';

export type CriterioPotencial =
  | 'iniciativa'
  | 'capacidade_aprendizado';

// ─── Critérios Check-in ───────────────────────────────────────────────────────
export type CriterioCheckin =
  | 'bem_estar'
  | 'progresso_metas'
  | 'dificuldades'
  | 'alinhamento_gestor'
  | 'motivacao';

export type Criterio =
  | CriterioComportamental
  | CriterioPerformance
  | CriterioDesenvolvimento
  | CriterioAdaptacao
  | CriterioIntegracao
  | CriterioPotencial
  | CriterioCheckin;

// ─── Definições de critérios por tipo ────────────────────────────────────────
export const CRITERIOS_360: { key: Criterio; label: string; categoria: 'comportamental' | 'performance' | 'desenvolvimento' }[] = [
  // Comportamental
  { key: 'comunicacao',         label: 'Comunicação',          categoria: 'comportamental' },
  { key: 'trabalho_em_equipe',  label: 'Trabalho em Equipe',   categoria: 'comportamental' },
  { key: 'proatividade',        label: 'Proatividade',         categoria: 'comportamental' },
  { key: 'responsabilidade',    label: 'Responsabilidade',     categoria: 'comportamental' },
  { key: 'alinhamento_cultural',label: 'Alinhamento Cultural', categoria: 'comportamental' },
  // Performance
  { key: 'qualidade_de_entrega',label: 'Qualidade de Entrega', categoria: 'performance' },
  { key: 'foco_em_resultados',  label: 'Foco em Resultados',   categoria: 'performance' },
  // Desenvolvimento
  { key: 'resolucao_de_problemas',  label: 'Resolução de Problemas',  categoria: 'desenvolvimento' },
  { key: 'evolucao_e_aprendizado',  label: 'Evolução e Aprendizado',  categoria: 'desenvolvimento' },
];

export const CRITERIOS_PROBATORIO: { key: Criterio; label: string; categoria: 'adaptacao' | 'integracao' | 'potencial' }[] = [
  // Adaptação ao Cargo
  { key: 'dominio_tecnico',         label: 'Domínio Técnico da Função',          categoria: 'adaptacao' },
  { key: 'qualidade_entrega_prob',  label: 'Qualidade das Entregas no Período',  categoria: 'adaptacao' },
  { key: 'cumprimento_prazos',      label: 'Cumprimento de Prazos',              categoria: 'adaptacao' },
  // Integração Cultural
  { key: 'adaptacao_cultura',       label: 'Adaptação à Cultura da Empresa',     categoria: 'integracao' },
  { key: 'relacionamento_equipe',   label: 'Relacionamento com a Equipe',        categoria: 'integracao' },
  { key: 'comunicacao_prob',        label: 'Comunicação e Clareza',              categoria: 'integracao' },
  // Potencial
  { key: 'iniciativa',              label: 'Iniciativa e Proatividade',          categoria: 'potencial' },
  { key: 'capacidade_aprendizado',  label: 'Velocidade de Aprendizado',          categoria: 'potencial' },
];

export const CRITERIOS_CHECKIN: { key: CriterioCheckin; label: string; pergunta: string }[] = [
  { key: 'bem_estar',         label: 'Bem-estar',              pergunta: 'Como você está se sentindo no trabalho?' },
  { key: 'progresso_metas',   label: 'Progresso nas Metas',    pergunta: 'Como está seu progresso em relação às metas?' },
  { key: 'dificuldades',      label: 'Dificuldades',           pergunta: 'Existe algum bloqueio ou dificuldade?' },
  { key: 'alinhamento_gestor',label: 'Alinhamento com Gestor', pergunta: 'Como está seu alinhamento com o gestor?' },
  { key: 'motivacao',         label: 'Motivação',              pergunta: 'Qual seu nível de motivação atual?' },
];

// Legado — mantido para compatibilidade com código existente
export const CRITERIOS = CRITERIOS_360;

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface CicloAvaliacao {
  id: string;
  organization_id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  status: CicloStatus;
  tipo: CicloTipo;
  peso_360: number;
  peso_metas: number;
  peso_prod: number;
  colaborador_alvo_id: string | null;
  responsavel_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Avaliacao360 {
  id: string;
  ciclo_id: string;
  organization_id: string;
  avaliador_id: string;
  avaliado_id: string;
  tipo: AvaliacaoTipo;
  anonimo: boolean;
  status: AvaliacaoStatus;
  decisao_probatorio: DecisaoProbatorio | null;
  data_resposta: string | null;
  created_at: string;
}

export interface RespostaAvaliacao {
  id: string;
  avaliacao_id: string;
  criterio: Criterio;
  nota: number;
  comentario: string | null;
  ponto_forte: string | null;
  ponto_melhoria: string | null;
  created_at: string;
}

export type Classificacao = 'Top Performer' | 'Alta Performance' | 'Regular' | 'Baixa Performance / Risco';

export interface ResultadoFinal360 {
  id: string;
  ciclo_id: string;
  organization_id: string;
  avaliado_id: string;
  media_geral: number | null;
  media_autoavaliacao: number | null;
  media_pares: number | null;
  media_gestor: number | null;
  media_liderado: number | null;
  media_comportamental: number | null;
  media_performance: number | null;
  media_desenvolvimento: number | null;
  score_360: number | null;
  score_final: number | null;
  classificacao: Classificacao | null;
  feedback_final: string | null;
  feedback_updated_at: string | null;
  feedback_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CriterioTecnico {
  nome: string;
  nota: number;
  comentario: string | null;
}

export interface AvaliacaoTecnica {
  id: string;
  organization_id: string;
  colaborador_id: string;
  avaliador_id: string;
  titulo: string;
  data: string;
  criterios: CriterioTecnico[];
  nota_geral: number;
  observacoes: string | null;
  created_at: string;
}

export interface CreateAvaliacaoTecnicaPayload {
  organization_id: string;
  colaborador_id: string;
  titulo: string;
  data: string;
  criterios: CriterioTecnico[];
  nota_geral: number;
  observacoes?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const CLASSIFICACAO_CONFIG: Record<Classificacao, { color: string; bg: string; label: string }> = {
  'Top Performer':              { color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Top Performer' },
  'Alta Performance':           { color: 'text-blue-700',    bg: 'bg-blue-100',    label: 'Alta Performance' },
  'Regular':                    { color: 'text-yellow-700',  bg: 'bg-yellow-100',  label: 'Regular' },
  'Baixa Performance / Risco':  { color: 'text-red-700',     bg: 'bg-red-100',     label: 'Baixa Performance / Risco' },
};

export function getClassificacao(score: number | null): Classificacao {
  if (!score) return 'Regular';
  if (score >= 9) return 'Top Performer';
  if (score >= 7) return 'Alta Performance';
  if (score >= 5) return 'Regular';
  return 'Baixa Performance / Risco';
}

export function requiresJustificativa(nota: number): boolean {
  return nota <= 2 || nota === 10;
}

export function getCriteriosByTipo(tipo: CicloTipo) {
  if (tipo === 'checkin') return CRITERIOS_CHECKIN;
  if (tipo === 'probatorio') return CRITERIOS_PROBATORIO;
  return CRITERIOS_360;
}
