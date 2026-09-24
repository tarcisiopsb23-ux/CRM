// src/components/propostas/wizard/strategyTemplates.ts
// Templates fixos de estratégia por produto.
// Cada fase tem nome, descrição e ícone (nome de ícone Lucide) — todos imutáveis.
// O closer só pode ativar/desativar fases (mín. 3 ativas).

export interface StrategyPhase {
  /** Identificador único dentro do template (slug estável para toggle) */
  id: string;
  fase: string;
  descricao: string;
  /** Nome do ícone Lucide a renderizar no viewer */
  icone: string;
  /** Controlado pelo wizard: true = aparece na proposta */
  ativo: boolean;
}

export interface StrategyTemplate {
  id: string;
  label: string;
  /** Palavras-chave nos nomes dos serviços que disparam auto-detecção */
  keywords: string[];
  fases: StrategyPhase[];
}

// ─── Templates fixos ─────────────────────────────────────────────────────────

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "assessoria",
    label: "Assessoria de Marketing",
    keywords: ["assessoria", "marketing", "conteúdo", "tráfego", "social", "mídia", "gestão de redes"],
    fases: [
      {
        id: "diagnostico",
        fase: "Diagnóstico Estratégico",
        descricao: "Analisamos o cenário atual da empresa para identificar desafios, oportunidades e prioridades.",
        icone: "search",
        ativo: true,
      },
      {
        id: "estruturacao",
        fase: "Estruturação",
        descricao: "Organizamos processos, ferramentas e indicadores para criar uma base sólida para o crescimento.",
        icone: "layout-grid",
        ativo: true,
      },
      {
        id: "marketing",
        fase: "Marketing (Atração)",
        descricao: "Implementamos estratégias para gerar oportunidades qualificadas e fortalecer o posicionamento da marca.",
        icone: "megaphone",
        ativo: true,
      },
      {
        id: "vendas",
        fase: "Vendas (Conversão)",
        descricao: "Estruturamos o processo comercial para aumentar a conversão e otimizar o fechamento de novos clientes.",
        icone: "handshake",
        ativo: true,
      },
      {
        id: "retencao",
        fase: "Retenção (Fidelização)",
        descricao: "Desenvolvemos ações para fortalecer o relacionamento, aumentar a recorrência e maximizar o valor dos clientes.",
        icone: "heart",
        ativo: true,
      },
      {
        id: "crescimento",
        fase: "Crescimento Contínuo",
        descricao: "Monitoramos indicadores, realizamos otimizações constantes e ajustamos a estratégia conforme os resultados.",
        icone: "trending-up",
        ativo: true,
      },
    ],
  },

  {
    id: "automacao",
    label: "Automação",
    keywords: ["automação", "automacao", "n8n", "crm", "integração", "integracao", "fluxo", "workflow"],
    fases: [
      {
        id: "mapeamento",
        fase: "Mapeamento de Processos",
        descricao: "Identificamos processos repetitivos e oportunidades de automação.",
        icone: "map",
        ativo: true,
      },
      {
        id: "planejamento",
        fase: "Planejamento da Solução",
        descricao: "Definimos fluxos, regras e integrações de acordo com a operação da empresa.",
        icone: "clipboard-list",
        ativo: true,
      },
      {
        id: "implementacao",
        fase: "Implementação",
        descricao: "Desenvolvemos e configuramos as automações e integrações necessárias.",
        icone: "zap",
        ativo: true,
      },
      {
        id: "validacao",
        fase: "Validação",
        descricao: "Realizamos testes, ajustes e homologação para garantir o funcionamento correto.",
        icone: "check-circle",
        ativo: true,
      },
      {
        id: "monitoramento",
        fase: "Monitoramento",
        descricao: "Acompanhamos a performance das automações e realizamos melhorias contínuas.",
        icone: "bar-chart-2",
        ativo: true,
      },
    ],
  },

  {
    id: "site",
    label: "Site / Landing Page",
    keywords: ["site", "landing", "página", "pagina", "web", "lp", "hotsite"],
    fases: [
      {
        id: "planejamento",
        fase: "Planejamento",
        descricao: "Definimos objetivos, estrutura, conteúdo e estratégia da página.",
        icone: "file-text",
        ativo: true,
      },
      {
        id: "design",
        fase: "Design",
        descricao: "Desenvolvemos uma interface moderna, responsiva e alinhada à identidade da marca.",
        icone: "palette",
        ativo: true,
      },
      {
        id: "desenvolvimento",
        fase: "Desenvolvimento",
        descricao: "Construímos a página com foco em desempenho, usabilidade e conversão.",
        icone: "code-2",
        ativo: true,
      },
      {
        id: "publicacao",
        fase: "Publicação",
        descricao: "Configuramos domínio, hospedagem, SEO básico e colocamos o projeto em produção.",
        icone: "globe",
        ativo: true,
      },
      {
        id: "otimizacao",
        fase: "Otimização",
        descricao: "Monitoramos os resultados e realizamos melhorias contínuas para aumentar a conversão.",
        icone: "settings-2",
        ativo: true,
      },
    ],
  },

  {
    id: "gmb",
    label: "Google Meu Negócio",
    keywords: ["google", "gmb", "meu negócio", "meu negocio", "local", "maps", "perfil"],
    fases: [
      {
        id: "diagnostico",
        fase: "Diagnóstico",
        descricao: "Avaliamos o perfil atual e identificamos oportunidades de melhoria.",
        icone: "search",
        ativo: true,
      },
      {
        id: "otimizacao",
        fase: "Otimização",
        descricao: "Configuramos informações, categorias, serviços, imagens e demais recursos do perfil.",
        icone: "settings-2",
        ativo: true,
      },
      {
        id: "posicionamento",
        fase: "Posicionamento",
        descricao: "Aplicamos estratégias para aumentar a relevância nas buscas locais.",
        icone: "map-pin",
        ativo: true,
      },
      {
        id: "engajamento",
        fase: "Engajamento",
        descricao: "Gerenciamos avaliações, publicações e interações para fortalecer a presença digital.",
        icone: "message-circle",
        ativo: true,
      },
      {
        id: "acompanhamento",
        fase: "Acompanhamento",
        descricao: "Monitoramos métricas e realizamos otimizações contínuas.",
        icone: "line-chart",
        ativo: true,
      },
    ],
  },

  {
    id: "app",
    label: "Aplicações Web",
    keywords: ["aplicação", "aplicacao", "app", "sistema", "plataforma", "portal", "dashboard", "saas"],
    fases: [
      {
        id: "requisitos",
        fase: "Levantamento de Requisitos",
        descricao: "Identificamos necessidades, funcionalidades e objetivos do projeto.",
        icone: "list-checks",
        ativo: true,
      },
      {
        id: "arquitetura",
        fase: "Arquitetura da Solução",
        descricao: "Planejamos a estrutura técnica, fluxos e experiência do usuário.",
        icone: "layers",
        ativo: true,
      },
      {
        id: "desenvolvimento",
        fase: "Desenvolvimento",
        descricao: "Construímos a aplicação utilizando tecnologias modernas e escaláveis.",
        icone: "code-2",
        ativo: true,
      },
      {
        id: "implantacao",
        fase: "Testes e Implantação",
        descricao: "Validamos o funcionamento e disponibilizamos a aplicação em ambiente de produção.",
        icone: "rocket",
        ativo: true,
      },
      {
        id: "evolucao",
        fase: "Evolução Contínua",
        descricao: "Implementamos melhorias, novas funcionalidades e otimizações conforme a necessidade.",
        icone: "refresh-cw",
        ativo: true,
      },
    ],
  },

  {
    id: "treinamento",
    label: "Treinamento em Vendas",
    keywords: ["treinamento", "capacitação", "capacitacao", "vendas", "comercial", "equipe"],
    fases: [
      {
        id: "diagnostico",
        fase: "Diagnóstico Comercial",
        descricao: "Avaliamos o processo de vendas e identificamos oportunidades de melhoria.",
        icone: "search",
        ativo: true,
      },
      {
        id: "estruturacao",
        fase: "Estruturação",
        descricao: "Definimos metodologia, roteiro de atendimento e boas práticas comerciais.",
        icone: "layout-grid",
        ativo: true,
      },
      {
        id: "capacitacao",
        fase: "Capacitação",
        descricao: "Treinamos a equipe com foco em abordagem, negociação e fechamento.",
        icone: "users",
        ativo: true,
      },
      {
        id: "acompanhamento",
        fase: "Acompanhamento",
        descricao: "Monitoramos a aplicação do treinamento e orientamos ajustes necessários.",
        icone: "clipboard-check",
        ativo: true,
      },
      {
        id: "desenvolvimento",
        fase: "Desenvolvimento Contínuo",
        descricao: "Realizamos reciclagens e aperfeiçoamentos para manter a evolução da equipe.",
        icone: "trending-up",
        ativo: true,
      },
    ],
  },
];

// ─── Template personalizado (fases livres, até 6) ─────────────────────────────

export const CUSTOM_TEMPLATE_ID = "personalizado";

export const CUSTOM_TEMPLATE_LABEL = "Personalizado";

/** Fase em branco para o modo personalizado */
export function emptyCustomPhase(idx: number): StrategyPhase {
  return {
    id: `custom-${idx}`,
    fase: "",
    descricao: "",
    icone: "circle-dot",
    ativo: true,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const MIN_ACTIVE_PHASES = 3;
export const MAX_CUSTOM_PHASES = 6;

/**
 * Detecta o template mais provável com base nos nomes dos serviços selecionados.
 * Retorna null se nenhum template for detectado (exibe selector manual).
 */
export function detectTemplate(
  serviceNames: string[],
): StrategyTemplate | null {
  const combined = serviceNames.join(" ").toLowerCase();

  // Score por template — conta quantas keywords batem
  let best: { template: StrategyTemplate; score: number } | null = null;

  for (const tpl of STRATEGY_TEMPLATES) {
    const score = tpl.keywords.filter((kw) => combined.includes(kw)).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { template: tpl, score };
    }
  }

  return best ? best.template : null;
}

/**
 * Serializa as fases para salvar em proposal_sections.content.
 * Inclui fases inativas (com ativo: false) para permitir reativação no editor.
 */
export function serializePhases(phases: StrategyPhase[]): string {
  return JSON.stringify(
    phases.map(({ fase, descricao, icone, ativo }) => ({
      fase,
      descricao,
      icone,
      ativo,
    })),
  );
}

/**
 * Deserializa o content salvo de volta para StrategyPhase[].
 * Mantém compatibilidade com o formato legado (sem campo ativo).
 */
export function deserializePhases(content: string): StrategyPhase[] | null {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((p: Record<string, unknown>, i: number) => ({
      id: `phase-${i}`,
      fase: String(p.fase ?? ""),
      descricao: String(p.descricao ?? ""),
      icone: String(p.icone ?? "circle-dot"),
      // Legado sem campo ativo → considera ativo
      ativo: p.ativo !== false,
    }));
  } catch {
    return null;
  }
}
