import { useState, useEffect } from "react";

export type ChannelType = "whatsapp" | "instagram" | "messenger";
export type ConversationStatus = "aberta" | "em_atendimento" | "encerrada" | "aguardando";
export type MessageDirection = "inbound" | "outbound";
export type MessageType = "regular" | "whisper" | "note";

export interface OmnichannelConversation {
  id: string;
  contact_name: string;
  phone: string;
  email: string;
  instagram_id?: string;
  facebook_id?: string;
  company?: string;
  job_title?: string;
  channel: ChannelType;
  assigned_user: string | null;
  assigned_team: string | null;
  status: ConversationStatus;
  priority: "baixa" | "media" | "alta" | "urgente";
  unread_count: number;
  pipeline: string;
  stage: string;
  sentiment: "positivo" | "neutro" | "negativo";
  lead_score: number;
  last_message: string;
  last_message_at: string;
  created_at: string;
  closed_at: string | null;
  is_vip: boolean;
  tags: string[];
  sla_limit_mins: number;
  sla_started_at: string;
  origin: string;
  lifetime_value: number;
  potential_value: number;
  close_probability: number; // percentage (e.g. 85)
  next_action: string;
}

export interface TimelineEvent {
  id: string;
  conversation_id: string;
  type: "event";
  event_type: string;
  actor: string;
  metadata: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  type: "message";
  direction: MessageDirection;
  sender: string;
  message_type: MessageType;
  text: string;
  media_url?: string;
  mime_type?: string;
  status: "pending" | "sending" | "sent" | "delivered" | "read" | "failed";
  reply_to?: string;
  created_at: string;
  checklist?: { text: string; done: boolean }[];
}

export type TimelineItem = ChatMessage | TimelineEvent;

export interface AgentState {
  name: string;
  role: string;
  status: "online" | "offline" | "ausente" | "almoco" | "reuniao" | "ia";
  conversations_count: number;
  closing_rate: number;
  avg_response_min: number;
}

// Initial Mock Data
const INITIAL_CONVERSATIONS: OmnichannelConversation[] = [
  {
    id: "conv-1",
    contact_name: "Thiago Silva",
    phone: "+55 (11) 98888-7777",
    email: "thiago.silva@empresa.com",
    company: "Silva Empreendimentos",
    job_title: "CEO",
    channel: "whatsapp",
    assigned_user: "Carlos",
    assigned_team: "Comercial Closer",
    status: "em_atendimento",
    priority: "alta",
    unread_count: 1,
    pipeline: "Vendas Growth",
    stage: "Negociação",
    sentiment: "positivo",
    lead_score: 92,
    last_message: "Pode me enviar o contrato de prestação de serviços para eu analisar?",
    last_message_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    closed_at: null,
    is_vip: false,
    tags: ["Decisor", "Enterprise", "Setup Grátis"],
    sla_limit_mins: 15,
    sla_started_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    origin: "Google Ads (Tráfego Pago)",
    lifetime_value: 15000,
    potential_value: 35000,
    close_probability: 92,
    next_action: "Enviar contrato revisado com isenção da taxa de setup",
  },
  {
    id: "conv-2",
    contact_name: "Mariana Costa",
    phone: "+55 (11) 99999-8888",
    email: "mariana@consultoria.design",
    instagram_id: "mariana.costa",
    company: "Mariana Design Co",
    job_title: "Fundadora",
    channel: "instagram",
    assigned_user: "IA",
    assigned_team: "Triagem Inteligente",
    status: "aberta",
    priority: "media",
    unread_count: 0,
    pipeline: "Consultoria IA",
    stage: "Qualificado",
    sentiment: "neutro",
    lead_score: 68,
    last_message: "Qual o prazo médio de entrega do projeto de IA?",
    last_message_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    closed_at: null,
    is_vip: false,
    tags: ["Inbound", "Instagram Direct"],
    sla_limit_mins: 30,
    sla_started_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    origin: "Instagram Orgânico",
    lifetime_value: 0,
    potential_value: 12000,
    close_probability: 55,
    next_action: "IA respondendo dúvidas técnicas; aguardando handoff",
  },
  {
    id: "conv-3",
    contact_name: "Roberto Ramos",
    phone: "+55 (19) 97777-5555",
    email: "roberto@ramoscorp.net",
    facebook_id: "roberto.ramos.99",
    company: "Ramos & Associados",
    job_title: "Diretor Comercial",
    channel: "messenger",
    assigned_user: null,
    assigned_team: null,
    status: "aguardando",
    priority: "baixa",
    unread_count: 2,
    pipeline: "Avulso",
    stage: "Novo",
    sentiment: "neutro",
    lead_score: 45,
    last_message: "Vocês aceitam cartão corporativo?",
    last_message_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    closed_at: null,
    is_vip: false,
    tags: ["Dúvida", "B2B"],
    sla_limit_mins: 60,
    sla_started_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    origin: "Facebook Fanpage",
    lifetime_value: 0,
    potential_value: 4500,
    close_probability: 30,
    next_action: "Responder dúvida sobre pagamento em cartão corporativo",
  },
  {
    id: "conv-4",
    contact_name: "Fernanda Souza",
    phone: "+55 (21) 97777-6666",
    email: "fernanda@agroforte.com.br",
    company: "Agro Forte Importações",
    job_title: "Diretora Financeira",
    channel: "whatsapp",
    assigned_user: "Ana",
    assigned_team: "Comercial SDR",
    status: "em_atendimento",
    priority: "urgente",
    unread_count: 0,
    pipeline: "Enterprise",
    stage: "Proposta",
    sentiment: "negativo",
    lead_score: 98,
    last_message: "Não recebi o link da fatura da entrada.",
    last_message_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    closed_at: null,
    is_vip: true,
    tags: ["Urgente", "VIP", "Financeiro Pendente"],
    sla_limit_mins: 10,
    sla_started_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    origin: "Indicação Direta",
    lifetime_value: 48000,
    potential_value: 95000,
    close_probability: 95,
    next_action: "Gerar link da fatura no Asaas e enviar imediatamente",
  }
];

const INITIAL_TIMELINE: Record<string, TimelineItem[]> = {
  "conv-1": [
    {
      id: "ev-1",
      conversation_id: "conv-1",
      type: "event",
      event_type: "conversation_created",
      actor: "Sistema",
      metadata: "Canal: WhatsApp",
      created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
    {
      id: "msg-1",
      conversation_id: "conv-1",
      type: "message",
      direction: "inbound",
      sender: "Thiago Silva",
      message_type: "regular",
      text: "Olá, vi o anúncio e gostaria de saber sobre o plano de Growth.",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
    {
      id: "msg-2",
      conversation_id: "conv-1",
      type: "message",
      direction: "outbound",
      sender: "Agente IA",
      message_type: "regular",
      text: "Olá Thiago! Fico feliz em ajudar. O plano Growth inclui Gestão de Tráfego Pago, Automações e Criação de Conteúdo, focado em agências e empresas de médio porte. Nosso ticket médio para este plano inicia em R$ 3.500/mês. Posso agendar um diagnóstico de 15 minutos com um de nossos closers?",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 119).toISOString(),
    },
    {
      id: "ev-2",
      conversation_id: "conv-1",
      type: "event",
      event_type: "conversation_assigned",
      actor: "Sistema",
      metadata: "Responsável definido: Carlos (Closer)",
      created_at: new Date(Date.now() - 1000 * 60 * 115).toISOString(),
    },
    {
      id: "ev-3",
      conversation_id: "conv-1",
      type: "event",
      event_type: "meeting_created",
      actor: "Carlos",
      metadata: "Reunião de Briefing agendada para 15/06 às 14:00",
      created_at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
    },
    {
      id: "ev-4",
      conversation_id: "conv-1",
      type: "event",
      event_type: "stage_changed",
      actor: "Carlos",
      metadata: "Movido de 'Leads Recebidos' para 'Qualificado' no funil de Vendas",
      created_at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    },
    {
      id: "msg-3",
      conversation_id: "conv-1",
      type: "message",
      direction: "outbound",
      sender: "Carlos",
      message_type: "note",
      text: "Thiago demonstrou muito interesse no plano trimestral, mas quer algum incentivo comercial.",
      status: "sent",
      checklist: [
        { text: "Enviar case de sucesso da Agência A", done: true },
        { text: "Solicitar aprovação de isenção de setup", done: true },
        { text: "Enviar contrato revisado", done: false },
      ],
      created_at: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    },
    {
      id: "msg-4",
      conversation_id: "conv-1",
      type: "message",
      direction: "outbound",
      sender: "Carlos",
      message_type: "regular",
      text: "Thiago, aqui está o case que conversamos. A Empresa A cresceu 140% no primeiro trimestre conosco. Veja como estruturamos os anúncios deles.",
      media_url: "https://example.com/case_estudo_agenciaa.pdf",
      mime_type: "application/pdf",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    },
    {
      id: "msg-5",
      conversation_id: "conv-1",
      type: "message",
      direction: "outbound",
      sender: "Supervisor Comercial",
      message_type: "whisper",
      text: "Carlos, se ele fechar hoje o plano anual, ofereça a isenção completa do setup (R$ 1.500). Está aprovado.",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    },
    {
      id: "msg-6",
      conversation_id: "conv-1",
      type: "message",
      direction: "outbound",
      sender: "Carlos",
      message_type: "regular",
      text: "Thiago, conversei com a nossa diretoria. Se fecharmos o plano de 12 meses hoje, eu consigo isenção total na taxa de setup de R$ 1.500!",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: "msg-7",
      conversation_id: "conv-1",
      type: "message",
      direction: "inbound",
      sender: "Thiago Silva",
      message_type: "regular",
      text: "Excelente! Condições aceitas. Pode me enviar o contrato de prestação de serviços para eu analisar?",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    }
  ],
  "conv-2": [
    {
      id: "msg-2-1",
      conversation_id: "conv-2",
      type: "message",
      direction: "inbound",
      sender: "Mariana Costa",
      message_type: "regular",
      text: "Olá, queria saber como funciona a consultoria de processos com IA.",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    },
    {
      id: "msg-2-2",
      conversation_id: "conv-2",
      type: "message",
      direction: "outbound",
      sender: "Agente IA",
      message_type: "regular",
      text: "Olá Mariana! Nossa consultoria consiste em 3 fases: Diagnóstico de gargalos, Criação de protótipos de agentes de IA e treinamento do time. Costumamos entregar os primeiros resultados funcionais em até 4 semanas. Qual o seu principal objetivo com IA hoje?",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
    },
    {
      id: "msg-2-3",
      conversation_id: "conv-2",
      type: "message",
      direction: "inbound",
      sender: "Mariana Costa",
      message_type: "regular",
      text: "Qual o prazo médio de entrega do projeto de IA?",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    }
  ],
  "conv-3": [
    {
      id: "msg-3-1",
      conversation_id: "conv-3",
      type: "message",
      direction: "inbound",
      sender: "Roberto Ramos",
      message_type: "regular",
      text: "Oi, tudo bem? Quero tirar uma dúvida.",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
    {
      id: "msg-3-2",
      conversation_id: "conv-3",
      type: "message",
      direction: "inbound",
      sender: "Roberto Ramos",
      message_type: "regular",
      text: "Vocês aceitam cartão corporativo?",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    }
  ],
  "conv-4": [
    {
      id: "msg-4-1",
      conversation_id: "conv-4",
      type: "message",
      direction: "inbound",
      sender: "Fernanda Souza",
      message_type: "regular",
      text: "Bom dia, estamos com urgência para iniciar o projeto.",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: "msg-4-2",
      conversation_id: "conv-4",
      type: "message",
      direction: "outbound",
      sender: "Ana",
      message_type: "regular",
      text: "Bom dia Fernanda! A proposta já foi aprovada pelo jurídico de vocês. Só estamos aguardando a compensação do pagamento do sinal para liberar o kickoff.",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    },
    {
      id: "ev-4-1",
      conversation_id: "conv-4",
      type: "event",
      event_type: "sla_warning",
      actor: "Sistema",
      metadata: "SLA Alerta: Tempo máximo de resposta de 10 minutos está próximo do fim",
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      id: "msg-4-3",
      conversation_id: "conv-4",
      type: "message",
      direction: "inbound",
      sender: "Fernanda Souza",
      message_type: "regular",
      text: "Não recebi o link da fatura da entrada. Pode me mandar por aqui para eu agilizar com o financeiro?",
      status: "read",
      created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    }
  ]
};

const INITIAL_AGENTS: AgentState[] = [
  { name: "Carlos", role: "Closer Comercial", status: "online", conversations_count: 5, closing_rate: 61, avg_response_min: 3.2 },
  { name: "Ana", role: "SDR Comercial", status: "almoco", conversations_count: 8, closing_rate: 52, avg_response_min: 4.8 },
  { name: "Pedro", role: "Suporte Técnico", status: "online", conversations_count: 2, closing_rate: 28, avg_response_min: 2.1 },
  { name: "Lucas", role: "Closer Comercial", status: "ausente", conversations_count: 6, closing_rate: 45, avg_response_min: 7.5 },
];

export function useOmnichannelChat() {
  const [conversations, setConversations] = useState<OmnichannelConversation[]>(() => {
    const saved = localStorage.getItem("c8_omnichannel_conversations");
    return saved ? JSON.parse(saved) : INITIAL_CONVERSATIONS;
  });

  const [timeline, setTimeline] = useState<Record<string, TimelineItem[]>>(() => {
    const saved = localStorage.getItem("c8_omnichannel_timeline");
    return saved ? JSON.parse(saved) : INITIAL_TIMELINE;
  });

  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>("conv-1");
  const [activeFolder, setActiveFolder] = useState<string>("Inbox Geral");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [distributionRule, setDistributionRule] = useState<string>("Round Robin");

  // Filters State
  const [filterAgent, setFilterAgent] = useState<string>("Todos");
  const [filterChannel, setFilterChannel] = useState<string>("Todos");
  const [filterPipeline, setFilterPipeline] = useState<string>("Todos");

  // Persist State
  useEffect(() => {
    localStorage.setItem("c8_omnichannel_conversations", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem("c8_omnichannel_timeline", JSON.stringify(timeline));
  }, [timeline]);

  // Selected Conversation details
  const activeConversation = conversations.find(c => c.id === selectedConversationId) || null;
  const activeTimeline = selectedConversationId ? (timeline[selectedConversationId] || []) : [];

  // Message Sender
  const sendMessage = (text: string, type: MessageType = "regular") => {
    if (!selectedConversationId) return;

    const sender = type === "whisper" ? "Supervisor (Sussurro)" : "Você (Atendente)";
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      conversation_id: selectedConversationId,
      type: "message",
      direction: "outbound",
      sender,
      message_type: type,
      text,
      status: "sent",
      created_at: new Date().toISOString(),
      ...(type === "note" ? { checklist: [] } : {})
    };

    // Update timeline
    setTimeline(prev => ({
      ...prev,
      [selectedConversationId]: [...(prev[selectedConversationId] || []), newMsg],
    }));

    // Update last message in conversations
    setConversations(prev =>
      prev.map(c =>
        c.id === selectedConversationId
          ? {
              ...c,
              last_message: type === "note" ? `[Nota Interna] ${text.substring(0, 40)}...` : text,
              last_message_at: new Date().toISOString(),
            }
          : c
      )
    );

    // If it's a regular message, simulate client reply after 3s if it's assigned to Carlos or Ana
    if (type === "regular") {
      setTimeout(() => {
        simulateClientResponse(selectedConversationId);
      }, 3000);
    }
  };

  // Simulate automated client response
  const simulateClientResponse = (convId: string) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    const replyMsg: ChatMessage = {
      id: `msg-${Date.now()}-reply`,
      conversation_id: convId,
      type: "message",
      direction: "inbound",
      sender: conv.contact_name,
      message_type: "regular",
      text: "Entendido! Fico aguardando a finalização dos trâmites.",
      status: "read",
      created_at: new Date().toISOString(),
    };

    setTimeline(prev => ({
      ...prev,
      [convId]: [...(prev[convId] || []), replyMsg],
    }));

    setConversations(prev =>
      prev.map(c =>
        c.id === convId
          ? {
              ...c,
              last_message: "Entendido! Fico aguardando a finalização dos trâmites.",
              last_message_at: new Date().toISOString(),
              unread_count: c.id === selectedConversationId ? 0 : c.unread_count + 1,
            }
          : c
      )
    );
  };

  // Toggle checklist item in Internal Note
  const toggleChecklistItem = (msgId: string, itemIdx: number) => {
    if (!selectedConversationId) return;
    setTimeline(prev => {
      const items = prev[selectedConversationId] || [];
      const updated = items.map(item => {
        if (item.id === msgId && item.type === "message" && item.checklist) {
          const newCheck = [...item.checklist];
          newCheck[itemIdx] = { ...newCheck[itemIdx], done: !newCheck[itemIdx].done };
          return { ...item, checklist: newCheck };
        }
        return item;
      });
      return { ...prev, [selectedConversationId]: updated };
    });
  };

  // Add checklist item to internal note
  const addChecklistItem = (msgId: string, itemText: string) => {
    if (!selectedConversationId || !itemText) return;
    setTimeline(prev => {
      const items = prev[selectedConversationId] || [];
      const updated = items.map(item => {
        if (item.id === msgId && item.type === "message" && item.checklist) {
          return { ...item, checklist: [...item.checklist, { text: itemText, done: false }] };
        }
        return item;
      });
      return { ...prev, [selectedConversationId]: updated };
    });
  };

  // Actions
  const assignAgent = (agentName: string | null) => {
    if (!selectedConversationId) return;
    setConversations(prev =>
      prev.map(c => (c.id === selectedConversationId ? { ...c, assigned_user: agentName, status: agentName ? "em_atendimento" : "aberta" } : c))
    );

    const event: TimelineEvent = {
      id: `ev-${Date.now()}`,
      conversation_id: selectedConversationId,
      type: "event",
      event_type: "conversation_assigned",
      actor: "Sistema",
      metadata: agentName ? `Responsável definido como: ${agentName}` : "Conversa retornada para fila geral (Sem Responsável)",
      created_at: new Date().toISOString(),
    };

    setTimeline(prev => ({
      ...prev,
      [selectedConversationId]: [...(prev[selectedConversationId] || []), event],
    }));
  };

  const transferConversation = (type: "user" | "team" | "department" | "ia", target: string, reason: string) => {
    if (!selectedConversationId) return;

    let assignedUser = activeConversation?.assigned_user;
    let assignedTeam = activeConversation?.assigned_team;
    let status = activeConversation?.status;

    if (type === "user") {
      assignedUser = target;
      status = "em_atendimento";
    } else if (type === "ia") {
      assignedUser = "IA";
      status = "aberta";
    } else if (type === "team" || type === "department") {
      assignedUser = null;
      assignedTeam = target;
      status = "aguardando";
    }

    setConversations(prev =>
      prev.map(c =>
        c.id === selectedConversationId
          ? {
              ...c,
              assigned_user: assignedUser,
              assigned_team: assignedTeam,
              status: status ?? c.status,
            }
          : c
      )
    );

    const event: TimelineEvent = {
      id: `ev-${Date.now()}`,
      conversation_id: selectedConversationId,
      type: "event",
      event_type: "conversation_transferred",
      actor: "Operador",
      metadata: `Transferido para ${type === "ia" ? "Agente IA" : target}. Motivo: ${reason}`,
      created_at: new Date().toISOString(),
    };

    setTimeline(prev => ({
      ...prev,
      [selectedConversationId]: [...(prev[selectedConversationId] || []), event],
    }));
  };

  const updateLeadPipeline = (pipeline: string, stage: string) => {
    if (!selectedConversationId) return;
    setConversations(prev =>
      prev.map(c => (c.id === selectedConversationId ? { ...c, pipeline, stage } : c))
    );

    const event: TimelineEvent = {
      id: `ev-${Date.now()}`,
      conversation_id: selectedConversationId,
      type: "event",
      event_type: "pipeline_changed",
      actor: "Operador",
      metadata: `CRM: Funil alterado para [${pipeline} / ${stage}]`,
      created_at: new Date().toISOString(),
    };

    setTimeline(prev => ({
      ...prev,
      [selectedConversationId]: [...(prev[selectedConversationId] || []), event],
    }));
  };

  const updateLeadScore = (score: number) => {
    if (!selectedConversationId) return;
    setConversations(prev =>
      prev.map(c => (c.id === selectedConversationId ? { ...c, lead_score: score } : c))
    );
  };

  const addTag = (tag: string) => {
    if (!selectedConversationId) return;
    setConversations(prev =>
      prev.map(c =>
        c.id === selectedConversationId
          ? { ...c, tags: c.tags.includes(tag) ? c.tags : [...c.tags, tag] }
          : c
      )
    );
  };

  const removeTag = (tag: string) => {
    if (!selectedConversationId) return;
    setConversations(prev =>
      prev.map(c =>
        c.id === selectedConversationId
          ? { ...c, tags: c.tags.filter(t => t !== tag) }
          : c
      )
    );
  };

  const executeConversionAction = (actionType: string) => {
    if (!selectedConversationId) return;

    let eventMsg = "";
    switch (actionType) {
      case "lead":
        eventMsg = "Lead comercial qualificado e inserido no pipeline.";
        break;
      case "opportunity":
        eventMsg = "Nova oportunidade financeira vinculada criada.";
        break;
      case "task":
        eventMsg = "Nova tarefa de Follow-up agendada no painel de projetos.";
        break;
      case "meeting":
        eventMsg = "Reunião de negociação agendada na agenda corporativa.";
        break;
      case "proposal":
        eventMsg = "Proposta comercial gerada e enviada via link.";
        break;
      case "contract":
        eventMsg = "Contrato de prestação de serviços emitido e enviado para assinatura digital.";
        break;
      case "pix":
        eventMsg = "Link de pagamento PIX (Asaas) gerado e enviado.";
        break;
      default:
        eventMsg = `Ação executada: ${actionType}`;
    }

    const event: TimelineEvent = {
      id: `ev-${Date.now()}`,
      conversation_id: selectedConversationId,
      type: "event",
      event_type: actionType,
      actor: "Sistema",
      metadata: eventMsg,
      created_at: new Date().toISOString(),
    };

    setTimeline(prev => ({
      ...prev,
      [selectedConversationId]: [...(prev[selectedConversationId] || []), event],
    }));

    // If a proposal/contract is sent, simulate closing the deal when clicking sale completed
    if (actionType === "contract") {
      setConversations(prev =>
        prev.map(c =>
          c.id === selectedConversationId
            ? { ...c, stage: "Ganho", close_probability: 100, sentiment: "positivo" }
            : c
        )
      );
    }
  };

  // Simulator Engine
  const simulateIncomingMessage = (channel: ChannelType, name: string, phone: string, text: string) => {
    const existing = conversations.find(c => c.phone === phone && c.channel === channel);

    if (existing) {
      // Add message
      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        conversation_id: existing.id,
        type: "message",
        direction: "inbound",
        sender: name,
        message_type: "regular",
        text,
        status: "read",
        created_at: new Date().toISOString(),
      };

      setTimeline(prev => ({
        ...prev,
        [existing.id]: [...(prev[existing.id] || []), newMsg],
      }));

      // Calculate automated AI action if assigned to AI
      const isIA = existing.assigned_user === "IA";
      let lastMsg = text;

      setConversations(prev =>
        prev.map(c =>
          c.id === existing.id
            ? {
                ...c,
                last_message: lastMsg,
                last_message_at: new Date().toISOString(),
                unread_count: c.id === selectedConversationId ? 0 : c.unread_count + 1,
              }
            : c
        )
      );

      if (isIA) {
        setTimeout(() => {
          simulateAiReply(existing.id, text);
        }, 1500);
      }
    } else {
      // Create new conversation
      const newId = `conv-${Date.now()}`;
      const newConv: OmnichannelConversation = {
        id: newId,
        contact_name: name,
        phone,
        email: `${name.toLowerCase().replace(/\s/g, "")}@example.com`,
        channel,
        assigned_user: "IA",
        assigned_team: "Triagem Inteligente",
        status: "aberta",
        priority: "media",
        unread_count: 1,
        pipeline: "Novo Contato",
        stage: "Novo",
        sentiment: "neutro",
        lead_score: 50,
        last_message: text,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        closed_at: null,
        is_vip: false,
        tags: ["Inbound", channel],
        sla_limit_mins: 20,
        sla_started_at: new Date().toISOString(),
        origin: `Meta API (${channel})`,
        lifetime_value: 0,
        potential_value: 5000,
        close_probability: 20,
        next_action: "Triagem automatizada via IA",
      };

      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        conversation_id: newId,
        type: "message",
        direction: "inbound",
        sender: name,
        message_type: "regular",
        text,
        status: "read",
        created_at: new Date().toISOString(),
      };

      const event: TimelineEvent = {
        id: `ev-${Date.now()}`,
        conversation_id: newId,
        type: "event",
        event_type: "conversation_created",
        actor: "Sistema",
        metadata: `Canal: ${channel.toUpperCase()}`,
        created_at: new Date().toISOString(),
      };

      setConversations(prev => [newConv, ...prev]);
      setTimeline(prev => ({
        ...prev,
        [newId]: [event, newMsg],
      }));
      setSelectedConversationId(newId);

      // Trigger automatic AI triage reply
      setTimeout(() => {
        simulateAiReply(newId, text);
      }, 1500);
    }
  };

  // Simulate AI processing and replying
  const simulateAiReply = (convId: string, clientMsg: string) => {
    let aiResponse = "Olá! Recebi sua mensagem. Um atendente de nossa equipe comercial entrará em contato em breve.";
    let emotion: "positivo" | "neutro" | "negativo" = "neutro";
    let scoreDelta = 0;

    const lower = clientMsg.toLowerCase();
    if (lower.includes("preço") || lower.includes("quanto custa") || lower.includes("valor")) {
      aiResponse = "Nossos planos de marketing e tráfego pago variam entre R$ 2.500 (plano Starter) a R$ 6.500 (plano scale Enterprise). Qual destes orçamentos se encaixa melhor na realidade da sua empresa hoje?";
      scoreDelta = 10;
    } else if (lower.includes("agendar") || lower.includes("reunião") || lower.includes("ligar")) {
      aiResponse = "Com certeza! Para agendarmos um diagnóstico gratuito de 15 minutos, por favor escolha o melhor horário por este link: calendly.com/c8-crm-briefing. Qual seu principal objetivo com nossa consultoria?";
      scoreDelta = 20;
      emotion = "positivo";
    } else if (lower.includes("problema") || lower.includes("ruim") || lower.includes("erro") || lower.includes("não funciona")) {
      aiResponse = "Lamento muito pelo inconveniente! Vou transferir sua conversa imediatamente para nossa equipe de Suporte Prioritário para resolvermos isso.";
      emotion = "negativo";
      scoreDelta = -5;
    }

    const aiMsg: ChatMessage = {
      id: `msg-${Date.now()}-ai`,
      conversation_id: convId,
      type: "message",
      direction: "outbound",
      sender: "Agente IA",
      message_type: "regular",
      text: aiResponse,
      status: "read",
      created_at: new Date().toISOString(),
    };

    const ev: TimelineEvent = {
      id: `ev-${Date.now()}-ai`,
      conversation_id: convId,
      type: "event",
      event_type: "ai_intervention",
      actor: "IA Engine",
      metadata: "Intervenção de IA: resposta automatizada com RAG integrada",
      created_at: new Date().toISOString(),
    };

    setTimeline(prev => ({
      ...prev,
      [convId]: [...(prev[convId] || []), ev, aiMsg],
    }));

    setConversations(prev =>
      prev.map(c => {
        if (c.id === convId) {
          const finalScore = Math.min(100, Math.max(0, c.lead_score + scoreDelta));
          let finalUser = c.assigned_user;

          // Auto overflow to human if client got angry or wants to speak to human
          if (emotion === "negativo" || lower.includes("falar com atendente") || lower.includes("humano")) {
            finalUser = "Carlos"; // Assign to online closer
          }

          return {
            ...c,
            last_message: aiResponse,
            last_message_at: new Date().toISOString(),
            lead_score: finalScore,
            sentiment: emotion,
            assigned_user: finalUser,
            status: finalUser === "Carlos" ? "em_atendimento" : c.status,
          };
        }
        return c;
      })
    );

    // If transferred to Carlos, emit a transfer event
    if (emotion === "negativo" || lower.includes("falar com atendente") || lower.includes("humano")) {
      const transferEv: TimelineEvent = {
        id: `ev-${Date.now()}-trans`,
        conversation_id: convId,
        type: "event",
        event_type: "conversation_assigned",
        actor: "Overflow Inteligente",
        metadata: "IA detectou necessidade de transição e transferiu para Carlos (Round Robin)",
        created_at: new Date().toISOString(),
      };
      setTimeout(() => {
        setTimeline(prev => ({
          ...prev,
          [convId]: [...(prev[convId] || []), transferEv],
        }));
      }, 500);
    }
  };

  // Close conversation
  const closeConversation = () => {
    if (!selectedConversationId) return;

    // Transfer back to IA before closing
    setConversations(prev =>
      prev.map(c =>
        c.id === selectedConversationId
          ? {
              ...c,
              status: "encerrada",
              closed_at: new Date().toISOString(),
              assigned_user: "IA",
              assigned_team: "Triagem Inteligente"
            }
          : c
      )
    );

    const event: TimelineEvent = {
      id: `ev-${Date.now()}`,
      conversation_id: selectedConversationId,
      type: "event",
      event_type: "conversation_closed",
      actor: "Operador",
      metadata: "Conversa finalizada, transferida de volta para IA",
      created_at: new Date().toISOString(),
    };

    setTimeline(prev => ({
      ...prev,
      [selectedConversationId]: [...(prev[selectedConversationId] || []), event],
    }));
  };

  // Archive conversation
  const archiveConversation = () => {
    if (!selectedConversationId) return;
    setConversations(prev =>
      prev.map(c =>
        c.id === selectedConversationId
          ? {
              ...c,
              status: "encerrada",
              closed_at: new Date().toISOString(),
            }
          : c
      )
    );
  };

  // Filter Conversations based on Folder and Queries
  const filteredConversations = conversations.filter(c => {
    // Don't show IA conversations in main list
    if (c.assigned_user === "IA" && activeFolder !== "IA") return false;

    // 1. Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = c.contact_name.toLowerCase().includes(q);
      const matchPhone = c.phone.includes(q);
      const matchEmail = c.email.toLowerCase().includes(q);
      const matchCompany = c.company?.toLowerCase().includes(q) || false;
      const matchMsg = c.last_message.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchEmail && !matchCompany && !matchMsg) {
        return false;
      }
    }

    // 2. Folder filter
    switch (activeFolder) {
      case "Minhas Conversas":
        if (c.assigned_user !== "Carlos" && c.assigned_user !== "Você") return false;
        break;
      case "Não Lidas":
        if (c.unread_count === 0) return false;
        break;
      case "Em Atendimento":
        if (c.status !== "em_atendimento") return false;
        break;
      case "VIP":
        if (!c.is_vip) return false;
        break;
      case "Urgentes":
        if (c.priority !== "urgente" && c.priority !== "alta") return false;
        break;
      case "Sem Responsável":
        if (c.assigned_user !== null) return false;
        break;
      case "Finalizadas":
        if (c.status !== "encerrada") return false;
        break;
      case "Arquivadas":
        if (c.status !== "encerrada" && !c.closed_at) return false;
        break;
      default:
        // Inbox Geral
        if (c.status === "encerrada") return false;
    }

    // 3. Quick Dropdown filters
    if (filterAgent !== "Todos") {
      if (filterAgent === "Sem Responsável" && c.assigned_user !== null) return false;
      if (filterAgent !== "Sem Responsável" && c.assigned_user !== filterAgent) return false;
    }

    if (filterChannel !== "Todos" && c.channel !== filterChannel.toLowerCase()) return false;

    if (filterPipeline !== "Todos" && c.pipeline !== filterPipeline) return false;

    return true;
  });

  // Filter only IA conversations
  const iaConversations = conversations.filter(c => c.assigned_user === "IA");

  return {
    conversations: filteredConversations,
    iaConversations,
    allConversationsCount: conversations.length,
    activeConversation,
    activeTimeline,
    selectedConversationId,
    setSelectedConversationId,
    activeFolder,
    setActiveFolder,
    searchQuery,
    setSearchQuery,
    sendMessage,
    assignAgent,
    transferConversation,
    updateLeadPipeline,
    updateLeadScore,
    addTag,
    removeTag,
    executeConversionAction,
    simulateIncomingMessage,
    closeConversation,
    archiveConversation,
    agents,
    setAgents,
    distributionRule,
    setDistributionRule,
    toggleChecklistItem,
    addChecklistItem,
    // Quick Filters
    filterAgent,
    setFilterAgent,
    filterChannel,
    setFilterChannel,
    filterPipeline,
    setFilterPipeline,
  };
}
