/**
 * ContractGenerator
 * Wizard de 4 etapas para gerar um contrato para um cliente:
 *   1. Dados básicos (template, proposta vinculada, título, datas)
 *   2. Serviços incluídos (define quais alíneas condicionais entrarão)
 *   3. Variáveis (dados do cliente + campos editáveis)
 *   4. Cronograma de pagamento (sugestão automática + edição livre)
 *   → Preview e salvar
 *
 * Montagem das cláusulas:
 *   - Usa assembleContract (novo sistema unificado) para filtrar alíneas,
 *     resolver variáveis e montar o HTML final.
 *   - Suporta todos os condition_types: is_pf, is_pj, has_procurador,
 *     has_grace_period, has_min_duration, has_setup, service, etc.
 *   - O clauseMap é derivado do resolvedVariables do assembleContract.
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight, ChevronLeft, FileText, Settings, Calendar,
  CheckCircle2, Loader2, Star,
} from "lucide-react";
import { toast } from "sonner";
import { useContractTemplates, useServiceBlocks, useClauseCategories, useClauses, useSignatureBlocks } from "@/hooks/useContractTemplates";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import type { ClauseCategory } from "@/hooks/useContractTemplates";
import { useContracts } from "@/hooks/useContracts";
import { useClientRepresentatives, QUALIFICACAO_LABELS } from "@/hooks/useClientRepresentatives";
import { buildSignatureBlockHtml } from "@/lib/contracts/buildSignatureBlock";
import { calculateSchedule } from "@/hooks/useContractSchedule";
import type { ContractPaymentLine } from "@/hooks/useContractSchedule";
import { ContractScheduleEditor } from "./ContractScheduleEditor";
import { PaymentMethodSelect } from "./form/PaymentMethodSelect";
import type { ServiceBlock } from "@/hooks/useContractTemplates";
import { assembleContract } from "@/lib/contracts/assembleContract";
import { buildQualificacaoContratante } from "@/lib/contracts/buildQualificacaoContratante";
import type { ContractClause as AssemblyClause, ContractTemplateV2, SelectedService } from "@/types/contracts";
import { ContractGuaranteesStep } from "./ContractGuaranteesStep";
import type { GuaranteeDraft } from "./ContractGuaranteesStep";

interface Props {
  clientId: string;
  clientName: string;
  clientCnpj?: string | null;
  /** Endereço completo já formatado — passado pelo pai */
  clientAddress?: string | null;
  /** Campos de endereço separados para montar o endereço completo */
  clientAddressStreet?: string | null;
  clientAddressNumber?: string | null;
  clientAddressComplement?: string | null;
  clientAddressNeighborhood?: string | null;
  clientAddressCity?: string | null;
  clientAddressState?: string | null;
  organizationId: string;
  proposalId?: string | null;
  proposalData?: ProposalImport | null;
  onSuccess: (contractId: string) => void;
  onClose: () => void;
}

export interface ProposalImport {
  id: string;
  title?: string;
  service_slugs?: string[];
  client_name?: string;
  client_cnpj?: string;
  client_address?: string;
  representative_name?: string;
  representative_cpf?: string;
  // Campos financeiros do schedule da proposta — pré-preenchem o ContractGenerator
  setup_amount?: number;
  monthly_amount?: number;
  due_day?: number;
  payment_method?: string;
  first_payment_date?: string;
  grace_period_months?: number;
  prazo_meses?: number;
  vigencia_inicio?: string;
}

const STEPS = [
  { id: 1, label: "Serviços",          icon: Settings },
  { id: 2, label: "Dados do Contrato", icon: FileText },
  { id: 3, label: "Cronograma",        icon: Calendar },
  { id: 4, label: "Garantias",         icon: CheckCircle2 },
];

// Campos exibidos na seção "Dados do Contratante" — apenas os que o usuário
// deve preencher manualmente. Campos derivados (prazos por extenso, datas
// calculadas, setup, representante) são calculados automaticamente via useEffect.
// Razão social, CNPJ, endereço e cidade são somente-leitura (do cadastro do cliente).
const VARIABLE_FIELDS_READONLY = [
  { key: "contratante_razao_social", label: "Razão Social / Nome" },
  { key: "contratante_cnpj",         label: "CNPJ / CPF" },
  { key: "contratante_endereco",     label: "Endereço Completo", wide: true },
  { key: "cidade_estado",            label: "Cidade/Estado" },
] as const;

// Campos editáveis pelo usuário — apenas os que variam por contrato.
// foro_cidade é sempre "Teófilo Otoni" — fixo, não editável.
const VARIABLE_FIELDS = [] as const;

// Mapa numérico → extenso para prazos (meses)
const EXTENSO_MAP: Record<number, string> = {
  1:"um",2:"dois",3:"três",4:"quatro",5:"cinco",6:"seis",
  7:"sete",8:"oito",9:"nove",10:"dez",11:"onze",12:"doze",
  13:"treze",14:"quatorze",15:"quinze",16:"dezesseis",17:"dezessete",18:"dezoito",
  19:"dezenove",20:"vinte",24:"vinte e quatro",36:"trinta e seis",48:"quarenta e oito",
};

// ── Helpers locais ────────────────────────────────────────────────────────────
// buildScheduleHtml está definido no final deste arquivo

// ─────────────────────────────────────────────────────────────────────────────

export function ContractGenerator({
  clientId, clientName, clientCnpj,
  clientAddress,
  clientAddressStreet, clientAddressNumber, clientAddressComplement,
  clientAddressNeighborhood, clientAddressCity, clientAddressState,
  organizationId, proposalId, proposalData, onSuccess, onClose,
}: Props) {
  const [step, setStep]         = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // ── Step 1 ───────────────────────────────────────────────────────────────
  const { data: templates = [] }    = useContractTemplates();
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle]           = useState("Contrato de Prestação de Serviços");
  const [linkedProposalId, setLinkedProposalId] = useState(proposalId ?? "");
  const [startDate, setStartDate]   = useState(format(new Date(), "yyyy-MM-dd"));
  // Vigência diferida — pode ser diferente de startDate
  // Pré-preenchido com vigencia_inicio da proposta, se houver
  const [vigenciaInicio, setVigenciaInicio] = useState(proposalData?.vigencia_inicio ?? "");
  // Prazo mínimo de permanência (fidelidade) — separado do prazo de vigência
  // Pré-preenchido com prazo_meses da proposta, se houver
  const [prazoMinimo, setPrazoMinimo]     = useState(
    proposalData?.prazo_meses ? String(proposalData.prazo_meses) : ""
  );
  // Setup manual (sobrepõe blocos financeiros quando preenchido)
  // Pré-preenchido com setup_amount da proposta, se houver
  const [setupManual, setSetupManual]     = useState(
    proposalData?.setup_amount ? String(proposalData.setup_amount) : ""
  );
  // Carência manual (meses sem cobrança no início, sem alterar o prazo contratual)
  // Pré-preenchido com grace_period_months da proposta, se houver
  const [gracePeriodMonths, setGracePeriodMonths] = useState(
    proposalData?.grace_period_months ? String(proposalData.grace_period_months) : ""
  );

  // ── Step 2 ───────────────────────────────────────────────────────────────
  const { data: allBlocks = [] }           = useServiceBlocks();
  const { services: catalogServices = [] } = useServiceCatalog(organizationId);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(
    proposalData?.service_slugs ?? []
  );
  const [primarySlug, setPrimarySlug] = useState<string>(
    proposalData?.service_slugs?.[0] ?? ""
  );

  /**
   * Configuração de entregáveis por serviço.
   * Chave: slug do serviço. Valor: mapa de deliverable_id → { included, number_value, period }
   */
  type DeliverableConfig = {
    included: boolean;
    number_value?: number | null;
    period?: string | null;
  };
  const [selectedDeliverables, setSelectedDeliverables] = useState<
    Record<string, Record<string, DeliverableConfig>>
  >({});

  /** Atualiza a configuração de um entregável específico de um serviço */
  const updateDeliverable = (serviceSlug: string, deliverableId: string, patch: Partial<DeliverableConfig>) => {
    setSelectedDeliverables(prev => ({
      ...prev,
      [serviceSlug]: {
        ...(prev[serviceSlug] ?? {}),
        [deliverableId]: {
          included: true,
          ...(prev[serviceSlug]?.[deliverableId] ?? {}),
          ...patch,
        },
      },
    }));
  };

  /** Inicializa os entregáveis de um serviço com todos incluídos (comportamento padrão ao selecionar) */
  const initDeliverables = (serviceSlug: string) => {
    const svc = catalogServices.find(s => s.slug === serviceSlug);
    if (!svc?.deliverables?.length) return;
    setSelectedDeliverables(prev => {
      if (prev[serviceSlug]) return prev; // já inicializado
      const defaults: Record<string, DeliverableConfig> = {};
      svc.deliverables.forEach(d => { defaults[d.id] = { included: true, number_value: null, period: null }; });
      return { ...prev, [serviceSlug]: defaults };
    });
  };

  // ── Cláusulas ─────────────────────────────────────────────────────────────
  const { data: categories = [] } = useClauseCategories();
  const { data: allClauses = [] } = useClauses();

  // ── Endereço completo e cidade/estado — calculados dos campos do cliente ──
  const enderecoCompleto = (() => {
    const partes = [
      clientAddressStreet,
      clientAddressNumber,
      clientAddressComplement,
      clientAddressNeighborhood,
      clientAddressCity && clientAddressState
        ? `${clientAddressCity} (${clientAddressState})`
        : clientAddressCity || clientAddressState,
    ].filter(Boolean);
    return partes.length > 0 ? partes.join(", ") : (clientAddress ?? "");
  })();

  const cidadeEstadoCliente = clientAddressCity && clientAddressState
    ? `${clientAddressCity} (${clientAddressState})`
    : clientAddressCity || clientAddressState || "";

  // ── Step 3: Variáveis do contratante ────────────────────────────────────
  const [variables, setVariables] = useState<Record<string, string>>(() => ({
    contratante_razao_social: clientName,
    contratante_cnpj:         clientCnpj ?? "",
    contratante_endereco:     enderecoCompleto,
    cidade_estado:            cidadeEstadoCliente || "Teófilo Otoni (MG)",
    foro_cidade:              "Teófilo Otoni",
    // data_assinatura = data de contratação — aparece no bloco de assinaturas do template.
    // A data em que o cliente efetivamente assina é registrada separadamente em signed_at.
    data_assinatura:          startDate
      ? format(new Date(startDate + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
      : format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
    // Campos derivados — preenchidos pelo useEffect abaixo
    prazo_vigencia_meses:     String(proposalData?.prazo_meses ?? 12),
    prazo_vigencia_dias:      String((proposalData?.prazo_meses ?? 12) * 30),
    prazo_vigencia_extenso:   EXTENSO_MAP[proposalData?.prazo_meses ?? 12] ?? String(proposalData?.prazo_meses ?? 12),
    prazo_minimo_meses:       "",
    prazo_minimo_extenso:     "",
    data_inicio_vigencia:     "",
    data_fim_vigencia:        "",
    setup_valor:              "",
    representante_nome:       proposalData?.representative_name ?? "",
    representante_cpf:        proposalData?.representative_cpf  ?? "",
  }));

  // ── Step 4 ───────────────────────────────────────────────────────────────
  // Pré-preenchido com dados do schedule da proposta, quando houver
  const [dueDay, setDueDay]           = useState(proposalData?.due_day ?? 10);
  const [firstPaymentDate, setFirstPaymentDate] = useState(
    proposalData?.first_payment_date ?? format(addDays(new Date(), 3), "yyyy-MM-dd")
  );
  const [recurringPaymentMethod, setRecurringPaymentMethod] = useState<string>(
    proposalData?.payment_method ?? "pix"
  );
  const [scheduleLines, setScheduleLines]   = useState<ContractPaymentLine[]>([]);
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);

  const { createContract } = useContracts();
  const { data: signatureBlocks = [] } = useSignatureBlocks();
  const { data: representatives = [], legalRepresentatives } = useClientRepresentatives(clientId);
  // IDs dos representantes selecionados para assinar este contrato
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);

  // ── Step 5: Garantias ─────────────────────────────────────────────────
  const [guarantees, setGuarantees] = useState<GuaranteeDraft[]>([]);

  // Busca signing_type do cadastro do cliente — fonte de verdade para tipo de assinatura
  const { data: clientSigningType } = useQuery({
    queryKey: ["client_signing_type", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("signing_type")
        .eq("id", clientId)
        .single();
      return (data?.signing_type as "individual" | "joint" | null) ?? "individual";
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  // Template padrão auto-selecionado
  useEffect(() => {
    if (!templateId && templates.length > 0) {
      const def = templates.find(t => t.is_default) ?? templates[0];
      setTemplateId(def.id);
    }
  }, [templates, templateId]);

  // ── Cálculo automático das variáveis derivadas ────────────────────────────
  // Sempre que campos-fonte (prazos, datas, setup) mudarem, recalcula as
  // variáveis usadas nos templates de contrato sem exibir ao usuário.
  useEffect(() => {
    const prazoMeses   = Number(variables.prazo_vigencia_meses || 0);
    const prazoMinMeses = Number(prazoMinimo || 0);
    const fmtSetup = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    // data_fim_vigencia: vigenciaInicio (ou startDate) + prazoMeses
    const dataFimVigencia = (() => {
      const inicio = vigenciaInicio || startDate;
      if (!inicio || !prazoMeses) return "";
      const d = new Date(inicio + "T12:00:00");
      d.setMonth(d.getMonth() + prazoMeses);
      return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    })();

    // data_inicio_vigencia
    const dataInicioVigencia = (() => {
      const d = vigenciaInicio || startDate;
      return d ? format(new Date(d + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "";
    })();

    // setup_valor: manual ou calculado pelos blocos selecionados
    const totalSetupBlocks = allBlocks
      .filter(b => selectedSlugs.some(slug =>
        b.slug === slug ||
        catalogServices.find(s => s.slug === slug)?.name?.toLowerCase() === b.name?.toLowerCase()
      ))
      .reduce((s, b) => s + (b.setup_amount ?? 0) + (b.one_time_amount ?? 0), 0);
    const setupValor = setupManual
      ? fmtSetup.format(Number(setupManual))
      : totalSetupBlocks > 0 ? fmtSetup.format(totalSetupBlocks) : "";

    setVariables(prev => ({
      ...prev,
      prazo_vigencia_dias:   prazoMeses > 0 ? String(prazoMeses * 30)                       : "",
      prazo_vigencia_extenso: prazoMeses > 0 ? (EXTENSO_MAP[prazoMeses] ?? String(prazoMeses)) : "",
      prazo_minimo_meses:     prazoMinMeses > 0 ? String(prazoMinMeses)                      : "",
      prazo_minimo_extenso:   prazoMinMeses > 0 ? (EXTENSO_MAP[prazoMinMeses] ?? String(prazoMinMeses)) : "",
      data_inicio_vigencia:   dataInicioVigencia,
      data_fim_vigencia:      dataFimVigencia,
      setup_valor:            setupValor,
      // data_assinatura acompanha startDate (data de contratação)
      data_assinatura:        startDate
        ? format(new Date(startDate + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
        : prev.data_assinatura,
    }));
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    variables.prazo_vigencia_meses,
    prazoMinimo, vigenciaInicio, startDate,
    setupManual, allBlocks, selectedSlugs, catalogServices,
  ]);

  // Blocos selecionados (para cronograma)
  // Para o cronograma financeiro, mapeia pelo slug do service_catalog → contract_service_block
  // Usa o slug do catalog para encontrar o block financeiro correspondente
  const selectedBlocks: ServiceBlock[] = allBlocks.filter(b =>
    selectedSlugs.some(slug =>
      b.slug === slug ||
      catalogServices.find(s => s.slug === slug)?.name?.toLowerCase() === b.name?.toLowerCase()
    )
  );

  // Recalcula cronograma quando serviços ou datas mudam
  const recalculateSchedule = useCallback(() => {
    if (selectedBlocks.length === 0 || !firstPaymentDate) return;
    const result = calculateSchedule({
      blocks:            selectedBlocks,
      firstPaymentDate:  new Date(firstPaymentDate + "T12:00:00"),
      dueDay,
      gracePeriodMonths: gracePeriodMonths ? Number(gracePeriodMonths) : undefined,
    });
    setScheduleLines(result.lines);
    setScheduleWarnings(result.warnings);
  }, [selectedBlocks, firstPaymentDate, dueDay, gracePeriodMonths]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === 3) recalculateSchedule();
  }, [step, recalculateSchedule]);

  const toggleSlug = (slug: string) => {
    setSelectedSlugs(prev => {
      const next = prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug];
      // Se o serviço principal foi desmarcado, limpa ou migra para o primeiro restante
      if (primarySlug === slug && !next.includes(slug)) {
        setPrimarySlug(next[0] ?? "");
      }
      // Se é o primeiro serviço selecionado, torna-o principal automaticamente
      if (prev.length === 0 && next.length === 1) {
        setPrimarySlug(next[0]);
      }
      // Inicializa entregáveis ao selecionar (não remove ao desmarcar — mantém config)
      if (!prev.includes(slug)) {
        initDeliverables(slug);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!clientId)     { toast.error("Cliente não identificado."); return; }
    if (selectedSlugs.length === 0) { toast.error("Selecione pelo menos um serviço."); return; }

    setIsSaving(true);
    try {
      // data_assinatura = data de contratação — aparece no bloco de assinaturas do template.
      const dataAssinaturaFinal = startDate
        ? format(new Date(startDate + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
        : format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

      // ── Monta lista de serviços para {{lista_servicos}} ────────────────
      // Usa nomes do service_catalog (fonte de verdade dos serviços)
      const listaServicos = selectedSlugs
        .map(slug => catalogServices.find(s => s.slug === slug)?.name ?? slug)
        .map(name => `<li>${name}</li>`)
        .join("");

      // ── Serviço principal ──────────────────────────────────────────────
      // Nome vem do service_catalog; block financeiro vem do contract_service_blocks
      const primaryBlock = allBlocks.find(b => b.slug === primarySlug);
      const servicoPrincipalNome = catalogServices.find(s => s.slug === primarySlug)?.name
        ?? primaryBlock?.name ?? "";
      const servicoPrincipalSlug = primarySlug ?? "";

      // Título automático baseado no serviço principal (se ainda for o default)
      const finalTitle = title === "Contrato de Prestação de Serviços" && servicoPrincipalNome
        ? `Contrato de Prestação de Serviços — ${servicoPrincipalNome}`
        : title;

      // ── Monta cronograma de pagamento para {{clausula_remuneracao}} ────
      const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
      const totalMonthly = selectedBlocks.reduce((s, b) => s + (b.monthly_amount ?? 0), 0);
      const totalSetup   = selectedBlocks.reduce((s, b) => s + (b.setup_amount ?? 0) + (b.one_time_amount ?? 0), 0);

      // ── Representantes legais ──────────────────────────────────────────
      // Representantes selecionados para este contrato
      const signingType = (clientSigningType ?? "individual") as "individual" | "joint";
      const contractReps = selectedRepIds.length > 0
        ? representatives.filter(r => selectedRepIds.includes(r.id))
        : representatives.filter(r => r.is_signing_responsible || r.is_legal_representative).slice(0, signingType === "joint" ? undefined : 1);
      const signingResponsible = contractReps[0] ?? representatives[0];
      const otherReps = contractReps.slice(1);
      // Qualificação completa de todos os representantes para o preâmbulo
      const repQualificacao = contractReps.map(r => {
        const qual = r.qualificacao ? QUALIFICACAO_LABELS[r.qualificacao] : r.cargo ?? null;
        return `${r.nome}, inscrito(a) no CPF nº ${r.cpf}${qual ? `, ${qual}` : ""}`;
      }).join("; e ");

      // ── Blocos de assinatura configuráveis ────────────────────────────
      const resolveSignatureBlock = (slug: string, vars: Record<string, string>): string => {
        const block = signatureBlocks.find(b => b.slug === slug);
        if (!block) return "";
        let html = block.html_content;
        Object.entries(vars).forEach(([k, v]) => {
          html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v ?? ""));
        });
        return html;
      };

      // Variáveis base completas para substituição nas alíneas
      const baseVars: Record<string, string> = {
        ...variables,
        // Representante principal
        representante_nome: signingResponsible?.nome ?? variables.representante_nome ?? "",
        representante_cpf:  signingResponsible?.cpf  ?? variables.representante_cpf  ?? "",
        // Representantes adicionais
        representante_2_nome:       otherReps[0]?.nome ?? "",
        representante_2_cpf:        otherReps[0]?.cpf  ?? "",
        representante_3_nome:       otherReps[1]?.nome ?? "",
        representante_3_cpf:        otherReps[1]?.cpf  ?? "",
        representante_qualificacao: repQualificacao,
        data_assinatura:        dataAssinaturaFinal,
        data_inicio:            startDate
          ? format(new Date(startDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
          : "",
        // Vigência diferida — data de início da vigência pode ser posterior à contratação
        data_inicio_vigencia: (() => {
          const d = vigenciaInicio || startDate;
          return d ? format(new Date(d + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "";
        })(),
        data_fim_vigencia: (() => {
          const inicio = vigenciaInicio || startDate;
          const meses  = Number(prazoMinimo || variables.prazo_vigencia_meses || 0);
          if (!inicio || !meses) return "";
          const d = new Date(inicio + "T12:00:00");
          d.setMonth(d.getMonth() + meses);
          return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
        })(),
        // Prazo mínimo
        prazo_minimo_meses:   prazoMinimo || variables.prazo_minimo_meses || "",
        prazo_minimo_extenso: (() => {
          const ext: Record<number, string> = {
            1:"um",2:"dois",3:"três",4:"quatro",5:"cinco",6:"seis",
            7:"sete",8:"oito",9:"nove",10:"dez",11:"onze",12:"doze",
            18:"dezoito",24:"vinte e quatro",36:"trinta e seis",
          };
          const n = Number(prazoMinimo || variables.prazo_minimo_meses || 0);
          return ext[n] ?? String(n);
        })(),
        // Setup
        setup_valor: (() => {
          const fmt2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
          if (setupManual) return fmt2.format(Number(setupManual));
          if (totalSetup > 0) return fmt2.format(totalSetup);
          return "";
        })(),
        // Tipo de assinatura como variável de texto
        tipo_assinatura: signingType === "joint" ? "conjunta" : "individual",
        // Forma de pagamento recorrente
        forma_pagamento: (() => {
          const m: Record<string, string> = {
            pix: "PIX", boleto: "Boleto Bancário",
            cartao: "Cartão de Crédito", transferencia: "Transferência Bancária",
          };
          return m[recurringPaymentMethod] ?? recurringPaymentMethod ?? "";
        })(),
        forma_pagamento_recorrente: (() => {
          const m: Record<string, string> = {
            pix: "PIX", boleto: "Boleto Bancário",
            cartao: "Cartão de Crédito", transferencia: "Transferência Bancária",
          };
          return m[recurringPaymentMethod] ?? recurringPaymentMethod ?? "";
        })(),
        // Qualificação do representante principal
        representante_qualificacao_cargo: signingResponsible
          ? (signingResponsible.qualificacao
              ? QUALIFICACAO_LABELS[signingResponsible.qualificacao as keyof typeof QUALIFICACAO_LABELS]
              : signingResponsible.cargo ?? "")
          : "",
        lista_servicos:         `<ul>${listaServicos}</ul>`,
        servico_principal:     servicoPrincipalNome,
        servico_principal_slug: servicoPrincipalSlug,
        cronograma_pagamento:  "",
        clausula_multa_atraso:
          "O atraso no pagamento de qualquer quantia acarretará multa de 10% (dez por cento) e juros moratórios de 1% (um por cento) ao mês.",
        clausula_suspensao:
          "Atrasos superiores a 20 (vinte) dias conferem à CONTRATADA o direito de suspender a prestação dos serviços até a regularização do débito.",
      };

      // Monta HTML do cronograma
      const scheduleHtml = scheduleLines.length > 0
        ? buildScheduleHtml(scheduleLines, fmt)
        : totalMonthly > 0
          ? `<p>${fmt.format(totalMonthly)} mensais, vencimento todo dia ${dueDay}.</p>`
          : "";
      baseVars.cronograma_pagamento = scheduleHtml;

      // ── Monta bloco de assinaturas dinamicamente ──────────────────────
      // IDs de representados que possuem um procurador atuando por eles —
      // esses NÃO geram campo de assinatura (o procurador assina no lugar).
      const idsRepresentadosPorProcurador = new Set<string>(
        contractReps
          .filter(r => r.tipo_representacao === "procurador" && r.representa_ids?.length)
          .flatMap(r => r.representa_ids ?? [])
      );

      baseVars.bloco_assinaturas = buildSignatureBlockHtml({
        contratanteRazaoSocial: variables.contratante_razao_social || clientName,
        reps: contractReps
          .filter(r => !idsRepresentadosPorProcurador.has(r.id))
          .map(r => ({
            nome:              r.nome,
            cpf:               r.cpf,
            cargo:             r.cargo ?? null,
            qualificacao:      r.qualificacao ?? null,
            tipo_representacao: r.tipo_representacao ?? null,
            // Resolve nomes dos representados para exibir na nota do procurador
            representa_nomes:  r.tipo_representacao === "procurador" && r.representa_ids?.length
              ? r.representa_ids
                  .map(rid => contractReps.find(x => x.id === rid)?.nome)
                  .filter(Boolean) as string[]
              : null,
          })),
      });

      // ── Monta contexto de condições ────────────────────────────────────
      // Usa assembleContract (novo sistema unificado) para filtrar alíneas,
      // resolver todas as variáveis e montar o HTML do contrato.

      // Monta cliente para assembleContract
      const assemblyClient = {
        name:             clientName,
        company_name:     variables.contratante_razao_social || clientName,
        document:         clientCnpj ?? "",
        cnpj:             clientCnpj ?? "",
        address:          clientAddress ?? variables.contratante_endereco ?? "",
        cidade:           variables.cidade_estado?.split("/")?.[0] ?? "",
        estado:           variables.cidade_estado?.split("/")?.[1] ?? "",
        estado_civil:     null,
        nacionalidade:    "brasileiro(a)",
        representatives:  contractReps.map(r => ({
          id:                    r.id,
          nome:                  r.nome,
          cpf:                   r.cpf,
          cargo:                 r.cargo ?? null,
          qualificacao:          r.qualificacao ?? null,
          tipo_representacao:    (r.tipo_representacao ?? "legal") as "legal" | "procurador",
          procuracao_tipo:       r.procuracao_tipo ?? null,
          procuracao_data:       r.procuracao_data ?? null,
          procuracao_indeterminada: r.procuracao_indeterminada ?? false,
          representa_ids:        r.representa_ids ?? null,
          is_signing_responsible: r.is_signing_responsible,
          is_legal_representative: r.is_legal_representative,
        })),
      };

      // Monta contrato para assembleContract
      const assemblyContract = {
        id:                       "preview",
        title:                    finalTitle,
        value:                    totalMonthly || 0,
        first_payment_due_date:   firstPaymentDate,
        due_day:                  dueDay,
        min_duration_months:      Number(prazoMinimo || variables.prazo_vigencia_meses || 0),
        prazo_minimo_meses:       prazoMinimo ? Number(prazoMinimo) : null,
        vigencia_inicio:          vigenciaInicio || startDate || null,
        vigencia_fim:             (() => {
          const inicio = vigenciaInicio || startDate;
          const meses  = Number(prazoMinimo || variables.prazo_vigencia_meses || 0);
          if (!inicio || !meses) return null;
          const d = new Date(inicio + "T12:00:00");
          d.setMonth(d.getMonth() + meses);
          return d.toISOString().slice(0, 10);
        })(),
        total_monthly:            totalMonthly || null,
        grace_months:             gracePeriodMonths ? Number(gracePeriodMonths) : null,
        has_payment_schedule:     scheduleLines.length > 0,
        signing_type:             signingType,
        signed_at:                startDate || new Date().toISOString(),
        cidade_estado:            variables.cidade_estado ?? "",
        recurring_payment_method: recurringPaymentMethod,
        chave_pix:                null,
        setup_amount_manual:      setupManual ? Number(setupManual) : null,
        has_guarantees:           guarantees.length > 0,
        guarantees:               guarantees.map(g => ({
          id:             g.id ?? crypto.randomUUID(),
          kpi_name:       g.kpi_name,
          kpi_unit:       g.kpi_unit,
          growth_percent: g.growth_percent,
          base_value:     g.base_value ?? null,
          deadline:       g.deadline,
          notes:          g.notes ?? null,
        })),
        metadata: {
          services: selectedSlugs.map(slug => ({
            service_id:           slug,
            service_name:         catalogServices.find(s => s.slug === slug)?.name ?? slug,
            selected_deliverables: Object.entries(selectedDeliverables[slug] ?? {}).map(([id, cfg]) => ({
              deliverable_id: id,
              included:       cfg.included,
              number_value:   cfg.number_value ?? null,
              period:         cfg.period ?? null,
            })),
          })) satisfies SelectedService[],
          setup_installments:   0,
          setup_value:          setupManual ? Number(setupManual) : (totalSetup || 0),
          setup_parcel_value:   0,
          setup_fees:           0,
          setup_first_due_date: firstPaymentDate,
          setup_payment_method: recurringPaymentMethod,
          setup_amount_manual:  setupManual ? Number(setupManual) : null,
        },
      };

      // ── Persiste garantias ────────────────────────────────────────────
      const persistGuarantees = async (contractId: string) => {
        if (guarantees.length === 0) return;
        const resolvedGuarantees = await Promise.all(
          guarantees.map(async (g, i) => {
            let kpiId: string | null = g.kpi_id ?? null;
            if (g.source === 'custom' && !kpiId) {
              const { data: newKpi, error } = await supabase
                .from("client_kpis")
                .insert({
                  organization_id: organizationId,
                  client_id:       clientId,
                  name:            g.kpi_name,
                  unit:            g.kpi_unit,
                  is_predefined:   false,
                  category:        "Geral",
                })
                .select("id")
                .single();
              if (!error && newKpi) kpiId = newKpi.id;
            }
            return {
              contract_id:     contractId,
              organization_id: organizationId,
              client_id:       clientId,
              kpi_id:          kpiId,
              kpi_name:        g.kpi_name,
              kpi_unit:        g.kpi_unit,
              growth_percent:  g.growth_percent,
              base_value:      g.base_value ?? null,
              deadline:        g.deadline,
              notes:           g.notes ?? null,
              display_order:   i,
            };
          })
        );
        await supabase.from("contract_guarantees").insert(resolvedGuarantees);
      };

      // Busca template selecionado para assembleContract
      const selectedTemplate = templates.find(t => t.id === templateId);
      if (!selectedTemplate?.structure) {
        // Template sem estrutura — monta clauseMap manualmente via legado simplificado
        // (apenas para compatibilidade com templates antigos sem structure)
        const clauseMap: Record<string, string> = {};
        for (const cat of categories) {
          clauseMap[`clausula_${cat.key}`] = "";
        }
        const allVars: Record<string, string | number | null> = { ...baseVars, ...clauseMap };
        const contract = await createContract.mutateAsync({
          client_id:            clientId,
          template_id:          templateId,
          proposal_id:          linkedProposalId || null,
          title:                finalTitle,
          service_slugs:        selectedSlugs,
          primary_service_slug: primarySlug || null,
          variables:            allVars,
          due_day:              dueDay,
          first_payment_date:   firstPaymentDate,
          total_monthly:        totalMonthly || null,
          total_setup:          totalSetup || null,
          start_date:           startDate || null,
          vigencia_inicio:      vigenciaInicio || null,
          prazo_minimo_meses:   prazoMinimo ? Number(prazoMinimo) : null,
          grace_period_months:  gracePeriodMonths ? Number(gracePeriodMonths) : null,
          setup_amount_manual:  setupManual ? Number(setupManual) : null,
          recurring_payment_method: recurringPaymentMethod || null,
          payment_schedule:     scheduleLines,
          clause_snapshot:      clauseMap,
        });
        await persistGuarantees(contract.id);
        toast.success("Contrato gerado com sucesso!");
        onSuccess(contract.id);
        return;
      }

      // ── Chama assembleContract (novo sistema) ────────────────────────
      const assemblyResult = assembleContract(
        assemblyContract,
        allClauses as unknown as AssemblyClause[],
        selectedTemplate as unknown as ContractTemplateV2,
        assemblyClient,
      );

      if (assemblyResult.unresolvedVariables.length > 0) {
        toast.warning(
          `Variáveis não resolvidas: ${assemblyResult.unresolvedVariables.join(", ")}. Aparecerão em branco no contrato.`
        );
      }

      // Deriva clauseMap do HTML gerado (extrai seções por category key)
      // O novo assembleContract não gera um clauseMap separado — o HTML final é completo.
      // Para retrocompatibilidade com clause_snapshot, derivamos um mapa simplificado.
      const clauseMap: Record<string, string> = {};
      for (const cat of categories) {
        // Extrai o bloco HTML da categoria do HTML gerado
        const regex = new RegExp(
          `<div[^>]*class="contract-clause"[^>]*>.*?</div>`,
          "gs"
        );
        clauseMap[`clausula_${cat.key}`] = "";
        const matches = assemblyResult.html.match(regex);
        if (matches) {
          // Associa cada bloco à categoria pelo data-category ou pelo índice
          clauseMap[`clausula_${cat.key}`] = matches.join("") || "";
        }
      }

      // Variáveis finais: resolvedVariables do assembleContract + baseVars legados
      const allVars: Record<string, string | number | null> = {
        ...baseVars,
        ...assemblyResult.resolvedVariables,
        ...clauseMap,
      };

      const contract = await createContract.mutateAsync({
        client_id:            clientId,
        template_id:          templateId,
        proposal_id:          linkedProposalId || null,
        title:                finalTitle,
        service_slugs:        selectedSlugs,
        primary_service_slug: primarySlug || null,
        variables:            allVars,
        html_content:         assemblyResult.html,
        due_day:              dueDay,
        first_payment_date:   firstPaymentDate,
        total_monthly:        totalMonthly || null,
        total_setup:          totalSetup || null,
        start_date:           startDate || null,
        vigencia_inicio:      vigenciaInicio || null,
        prazo_minimo_meses:   prazoMinimo ? Number(prazoMinimo) : null,
        grace_period_months:  gracePeriodMonths ? Number(gracePeriodMonths) : null,
        setup_amount_manual:  setupManual ? Number(setupManual) : null,
        recurring_payment_method: recurringPaymentMethod || null,
        payment_schedule:     scheduleLines,
        clause_snapshot:      clauseMap,
      });

      await persistGuarantees(contract.id);
      toast.success("Contrato gerado com sucesso!");
      onSuccess(contract.id);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao gerar contrato.");
    } finally {
      setIsSaving(false);
    }
  };

  const canProceed = () => {
    // Step 1 — Serviços: pelo menos um serviço selecionado
    if (step === 1) return selectedSlugs.length > 0;
    // Step 2 — Dados do Contrato: representante selecionado (campos do contratante são do cadastro)
    if (step === 2) {
      const camposOk = true; // todos os campos do contratante são somente-leitura
      if (!camposOk) return false;
      const sigType = clientSigningType ?? "individual";
      if (sigType === "individual") {
        // Individual: pelo menos um representante selecionado
        return selectedRepIds.length > 0;
      } else {
        // Conjunto: todos os legais obrigatórios precisam estar selecionados
        // ou ter um procurador válido selecionado em seu lugar
        const obrigatorios = representatives.filter(
          r => r.is_legal_representative && r.tipo_representacao === "legal"
        );
        return obrigatorios.every(r => {
          if (selectedRepIds.includes(r.id)) return true;
          return representatives.some(
            p => p.tipo_representacao === "procurador" &&
                 p.representa_ids?.includes(r.id) &&
                 selectedRepIds.includes(p.id)
          );
        });
      }
    }
    // Step 3 — Cronograma e Step 4 — Garantias: sempre pode avançar
    return true;
  };

  return (
    <div className="flex flex-col w-full">
      {/* Header com steps — sticky no topo do container com overflow-y */}
      <div className="sticky top-0 flex items-center gap-1 px-4 py-3 border-b bg-background z-10 no-print">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => step > s.id && setStep(s.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors
                ${step === s.id ? "bg-violet-100 text-violet-700" : step > s.id ? "text-emerald-600 cursor-pointer" : "text-muted-foreground"}`}
            >
              {step > s.id
                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                : <s.icon className="h-3.5 w-3.5" />}
              {s.label}
            </button>
            {idx < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto">Cancelar</Button>
      </div>

      {/* Conteúdo do step */}
      <div className="p-6 w-full">

        {/* ══════════════════════════════════════════════════════════════
            Step 1 — Serviços
            Seleção de serviços com entregáveis configuráveis por item
        ══════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-5 w-full">
            <div>
              <h2 className="text-base font-semibold">Serviços Contratados</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Selecione os serviços, defina o serviço principal e configure os entregáveis de cada um.
              </p>
            </div>

            {/* Banner de pré-preenchimento — aparece quando vem de uma proposta */}
            {proposalData && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-500" />
                <span>
                  <strong>Importado da proposta:</strong> serviços, dados do cliente
                  {proposalData.due_day ? ", dia de vencimento" : ""}
                  {proposalData.first_payment_date ? ", data do 1º pagamento" : ""}
                  {proposalData.payment_method ? ", forma de pagamento" : ""}
                  {proposalData.grace_period_months ? `, carência de ${proposalData.grace_period_months} mese(s)` : ""}
                  {proposalData.setup_amount ? ", setup" : ""}
                  {proposalData.prazo_meses ? `, prazo de ${proposalData.prazo_meses} meses` : ""}
                  {" "}foram pré-preenchidos. Revise antes de gerar o contrato.
                </span>
              </div>
            )}

            {/* Instrução do serviço principal */}
            {selectedSlugs.length > 1 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                Clique na estrela para definir qual é o serviço principal do contrato.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {catalogServices.map(svc => {
                const isSelected  = selectedSlugs.includes(svc.slug);
                const isPrimary   = primarySlug === svc.slug;
                const clauseCount = allClauses.filter(
                  c => !c.is_fixed && (
                    c.service_slug === svc.slug ||
                    (c.condition_type === "service" && (c.condition_value?.slugs as string[] | undefined)?.includes(svc.slug))
                  )
                ).length;
                const deliverables = svc.deliverables ?? [];
                const svcDelivCfg  = selectedDeliverables[svc.slug] ?? {};

                return (
                  <div
                    key={svc.slug}
                    className={`rounded-lg border transition-colors ${
                      isPrimary   ? "border-amber-400 bg-amber-50" :
                      isSelected  ? "border-violet-400 bg-violet-50" :
                      "hover:bg-muted/50"
                    }`}
                  >
                    {/* ── Cabeçalho do serviço ── */}
                    <div
                      className="flex items-start gap-3 p-4 cursor-pointer"
                      onClick={() => !isSelected && toggleSlug(svc.slug)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSlug(svc.slug)}
                        className="mt-0.5 shrink-0"
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{svc.name}</p>
                          {svc.category && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">{svc.category}</Badge>
                          )}
                          {isPrimary && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 gap-0.5">
                              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Principal
                            </Badge>
                          )}
                          {isSelected && deliverables.length > 0 && (
                            <span className="text-[10px] text-violet-600">
                              {Object.values(svcDelivCfg).filter(d => d.included).length}/{deliverables.length} entregáveis
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{svc.slug}</p>
                        {clauseCount > 0 && (
                          <p className="text-[10px] text-violet-600 mt-1 flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {clauseCount} {clauseCount === 1 ? "alínea específica" : "alíneas específicas"} incluídas
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setPrimarySlug(svc.slug); }}
                              className={`shrink-0 p-1.5 rounded-full transition-colors ${
                                isPrimary
                                  ? "text-amber-500 bg-amber-100 hover:bg-amber-200"
                                  : "text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-50"
                              }`}
                            >
                              <Star className={`h-4 w-4 ${isPrimary ? "fill-amber-400" : ""}`} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            {isPrimary ? "Serviço principal (objeto do contrato)" : "Definir como serviço principal"}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* ── Entregáveis (expansível quando selecionado) ── */}
                    {isSelected && deliverables.length > 0 && (
                      <div className="px-4 pb-4 border-t border-violet-200 mt-0 pt-3 space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Entregáveis
                        </p>
                        {deliverables.map(d => {
                          const cfg = svcDelivCfg[d.id] ?? { included: true };
                          return (
                            <div key={d.id} className="flex items-start gap-2.5 p-2.5 rounded-md bg-background border">
                              {/* Checkbox incluir/excluir */}
                              <Checkbox
                                checked={cfg.included !== false}
                                onCheckedChange={v => updateDeliverable(svc.slug, d.id, { included: !!v })}
                                className="mt-0.5 shrink-0"
                              />
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <p className={`text-xs font-medium ${cfg.included === false ? "line-through text-muted-foreground" : ""}`}>
                                  {d.name}
                                </p>
                                {/* Quantidade — apenas para entregáveis do tipo numero */}
                                {d.output_format === "numero" && cfg.included !== false && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                      <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Qtd.</Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={cfg.number_value ?? ""}
                                        onChange={e => updateDeliverable(svc.slug, d.id, { number_value: e.target.value ? Number(e.target.value) : null })}
                                        placeholder="—"
                                        className="h-6 w-16 text-xs px-1.5"
                                      />
                                      {d.unit && <span className="text-[10px] text-muted-foreground">{cfg.number_value === 1 ? d.unit : (d.unit_plural || d.unit)}</span>}
                                    </div>
                                    {/* Período — somente para recorrentes */}
                                    {d.delivery_type === "recorrente" && (
                                      <div className="flex items-center gap-1.5">
                                        <Label className="text-[10px] text-muted-foreground whitespace-nowrap">por</Label>
                                        <Select
                                          value={cfg.period ?? ""}
                                          onValueChange={v => updateDeliverable(svc.slug, d.id, { period: v || null })}
                                        >
                                          <SelectTrigger className="h-6 text-xs w-24 px-1.5">
                                            <SelectValue placeholder="período" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="dia">dia</SelectItem>
                                            <SelectItem value="semana">semana</SelectItem>
                                            <SelectItem value="mes">mês</SelectItem>
                                            <SelectItem value="vigencia">vigência</SelectItem>
                                            <SelectItem value="nao_indicar">não indicar</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {/* Texto fixo — exibe o valor cadastrado */}
                                {d.output_format === "texto" && d.text_value && cfg.included !== false && (
                                  <p className="text-[10px] text-muted-foreground italic">{d.text_value}</p>
                                )}
                              </div>
                              {/* Badge tipo */}
                              <Badge variant="outline" className={`text-[9px] shrink-0 ${
                                d.delivery_type === "recorrente" ? "text-blue-600 border-blue-300" :
                                d.delivery_type === "unico"      ? "text-emerald-600 border-emerald-300" :
                                "text-muted-foreground"
                              }`}>
                                {d.delivery_type}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {catalogServices.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum serviço cadastrado. Adicione serviços em Configurações → Serviços/Produtos.
                </p>
              )}
            </div>

            {selectedSlugs.length > 0 && !primarySlug && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Star className="h-3 w-3" /> Nenhum serviço principal definido — o primeiro selecionado será usado.
              </p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 2 — Dados do Contrato
            Template + Prazos/carência/setup + Variáveis do contratante
        ══════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-6" style={{ maxWidth: "100%" }}>
            <div>
              <h2 className="text-base font-semibold">Dados do Contrato</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Defina prazos, carência e dados do contratante.
              </p>
            </div>

            {/* ── Documento ───────────────────────────────────────────── */}
            {/* Template padrão é sempre usado automaticamente — sem seleção.
                Proposta vinculada só aparece quando o contrato vem de uma proposta. */}
            {proposalId && (
              <div className="pb-5 border-b">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Documento</p>
                <div className="flex flex-col gap-1 max-w-xs">
                  <Label className="text-xs text-muted-foreground">Proposta de origem</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm font-mono text-muted-foreground select-none">
                    {proposalData?.title
                      ? <><span className="text-foreground font-medium truncate mr-2">{proposalData.title}</span><span className="text-[10px] shrink-0">{proposalId.slice(0, 8)}…</span></>
                      : proposalId
                    }
                  </div>
                </div>
              </div>
            )}

            {/* ── Datas e Prazos — 4 colunas, alinhados pela base ─────── */}
            <div className="space-y-3 pb-5 border-b">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Datas e Prazos</p>
              {/*
                Cada célula usa flex-col com justify-between: label+hint crescem em cima,
                input fica sempre colado na base — todos os inputs alinhados.
              */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 items-end">
                {/* Data da Contratação */}
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Data da Contratação <span className="text-red-500">*</span></Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Data de assinatura.</p>
                  </div>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8" />
                </div>
                {/* Início de vigência posterior */}
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Início de vigência <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Deixe em branco para usar a data de contratação.</p>
                  </div>
                  <Input type="date" value={vigenciaInicio} onChange={e => setVigenciaInicio(e.target.value)} className="h-8" />
                  {vigenciaInicio && vigenciaInicio > startDate && (
                    <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      Vigência em {new Date(vigenciaInicio + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                {/* Prazo de vigência */}
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Prazo de vigência (meses)</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Duração total do contrato.</p>
                  </div>
                  <Input type="number" min={1}
                    value={variables.prazo_vigencia_meses ?? ""}
                    onChange={e => setVariables(p => ({ ...p, prazo_vigencia_meses: e.target.value, prazo_vigencia_dias: String(Number(e.target.value) * 30) }))}
                    placeholder="12" className="h-8" />
                </div>
                {/* Prazo mínimo */}
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Prazo mínimo (meses)</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Fidelidade mínima exigida.</p>
                  </div>
                  <Input type="number" min={1}
                    value={prazoMinimo}
                    onChange={e => setPrazoMinimo(e.target.value)}
                    placeholder="Ex: 12" className="h-8" />
                </div>
                {/* Carência */}
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Carência (meses)</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Sem cobrança. Não altera o prazo.</p>
                  </div>
                  <Input type="number" min={0}
                    value={gracePeriodMonths}
                    onChange={e => setGracePeriodMonths(e.target.value)}
                    placeholder="0" className="h-8" />
                </div>
                {/* Setup / Implementação */}
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Setup / Implementação</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Em branco = calculado automaticamente.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} step="0.01"
                      value={setupManual}
                      onChange={e => setSetupManual(e.target.value)}
                      placeholder="R$ 0,00" className="h-8 flex-1" />
                    {setupManual && (
                      <button type="button" onClick={() => setSetupManual("")}
                        className="h-8 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Limpar">×</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Dados do Contratante — 4 colunas, alinhados pela base ── */}
            {/* ── Dados do Contratante — campos manuais + representantes ── */}
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dados do Contratante</p>

              {/* Campos somente-leitura do cadastro + editáveis em grid 4 colunas */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 items-end">

                {/* Razão Social — somente-leitura, span 2 */}
                <div className="flex flex-col gap-1 col-span-2">
                  <Label className="text-xs">Razão Social / Nome</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none truncate">
                    {variables.contratante_razao_social || "—"}
                  </div>
                </div>

                {/* CNPJ/CPF — somente-leitura */}
                <div className="flex flex-col gap-1 col-span-1">
                  <Label className="text-xs">CNPJ / CPF</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none font-mono">
                    {variables.contratante_cnpj || "—"}
                  </div>
                </div>

                {/* Cidade/Estado — somente-leitura, derivado do cadastro */}
                <div className="flex flex-col gap-1 col-span-1">
                  <Label className="text-xs">Cidade/Estado</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none">
                    {variables.cidade_estado || "—"}
                  </div>
                </div>

                {/* Endereço Completo — somente-leitura, span 2 */}
                <div className="flex flex-col gap-1 col-span-2">
                  <Label className="text-xs">Endereço Completo</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none truncate">
                    {variables.contratante_endereco || "—"}
                  </div>
                </div>

                {/* Cidade do Foro — fixo, somente-leitura */}
                <div className="flex flex-col gap-1 col-span-1">
                  <Label className="text-xs">Cidade do Foro</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none">
                    Teófilo Otoni (MG)
                  </div>
                </div>
              </div>

              {/* ── Representantes Legais — tabela com seleção ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Representantes para Assinatura
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {(clientSigningType ?? "individual") === "joint"
                      ? "Assinatura conjunta — selecione todos os obrigatórios"
                      : "Assinatura individual — selecione um representante ou procurador"}
                  </span>
                </div>

                {representatives.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center border rounded-lg">
                    Nenhum representante cadastrado para este cliente.
                    Cadastre em Dados cadastrais → Representantes.
                  </p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b">
                          <th className="w-10 px-3 py-2 text-left"></th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Nome</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">CPF</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Qualificação</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tipo</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {representatives.map(rep => {
                          const isSelecionado = selectedRepIds.includes(rep.id);
                          const isProcurador  = rep.tipo_representacao === "procurador";
                          const vencida       = (rep as any).procuracao_vencida === true;
                          const qualLabel     = rep.qualificacao
                            ? QUALIFICACAO_LABELS[rep.qualificacao as keyof typeof QUALIFICACAO_LABELS]
                            : rep.cargo ?? "—";

                          // Determina se este rep pode ser selecionado:
                          // - Individual: qualquer um (legal ou procurador válido)
                          // - Conjunto: todos os legais obrigatórios + procuradores válidos
                          const podeSelecionar = !vencida;

                          const handleToggle = () => {
                            if (!podeSelecionar) return;
                            const sigType = clientSigningType ?? "individual";
                            if (sigType === "individual") {
                              // Apenas um por vez
                              setSelectedRepIds(isSelecionado ? [] : [rep.id]);
                            } else {
                              // Conjunto: toggle livre
                              setSelectedRepIds(prev =>
                                isSelecionado ? prev.filter(id => id !== rep.id) : [...prev, rep.id]
                              );
                            }
                            // Atualiza as variáveis de representante com o(s) selecionado(s)
                            const newIds = (clientSigningType ?? "individual") === "individual"
                              ? (isSelecionado ? [] : [rep.id])
                              : (isSelecionado
                                  ? selectedRepIds.filter(id => id !== rep.id)
                                  : [...selectedRepIds, rep.id]);
                            const primary = representatives.find(r => newIds[0] === r.id);
                            if (primary) {
                              setVariables(prev => ({
                                ...prev,
                                representante_nome: primary.nome,
                                representante_cpf:  primary.cpf,
                              }));
                            } else {
                              setVariables(prev => ({
                                ...prev,
                                representante_nome: "",
                                representante_cpf:  "",
                              }));
                            }
                          };

                          return (
                            <tr
                              key={rep.id}
                              className={`border-b last:border-0 transition-colors ${
                                !podeSelecionar ? "opacity-50 cursor-not-allowed" :
                                isSelecionado   ? "bg-violet-50 cursor-pointer" :
                                "hover:bg-muted/30 cursor-pointer"
                              }`}
                              onClick={handleToggle}
                            >
                              <td className="px-3 py-2.5">
                                <Checkbox
                                  checked={isSelecionado}
                                  onCheckedChange={handleToggle}
                                  disabled={!podeSelecionar}
                                  onClick={e => e.stopPropagation()}
                                />
                              </td>
                              <td className="px-3 py-2.5 font-medium">{rep.nome}</td>
                              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{rep.cpf}</td>
                              <td className="px-3 py-2.5 text-xs">{qualLabel}</td>
                              <td className="px-3 py-2.5">
                                <Badge variant="outline" className={`text-[10px] ${
                                  isProcurador ? "text-amber-700 border-amber-300" : "text-blue-700 border-blue-300"
                                }`}>
                                  {isProcurador ? "Procurador" : "Legal"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2.5">
                                {vencida ? (
                                  <span className="text-[10px] text-red-600 font-medium">Procuração vencida</span>
                                ) : rep.is_legal_representative ? (
                                  <span className="text-[10px] text-emerald-600">Autorizado</span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Aviso de validação para assinatura conjunta */}
                {(clientSigningType ?? "individual") === "joint" && (() => {
                  const obrigatorios = representatives.filter(
                    r => r.is_legal_representative && r.tipo_representacao === "legal"
                  );
                  const faltando = obrigatorios.filter(r => !selectedRepIds.includes(r.id));
                  // Verifica se algum faltando tem procurador selecionado em seu lugar
                  const faltandoSemProcurador = faltando.filter(r => {
                    const temProcurador = representatives.some(
                      p => p.tipo_representacao === "procurador" &&
                           p.representa_ids?.includes(r.id) &&
                           selectedRepIds.includes(p.id)
                    );
                    return !temProcurador;
                  });
                  if (faltandoSemProcurador.length > 0) {
                    return (
                      <p className="text-xs text-amber-700 flex items-center gap-1.5 px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                        Assinatura conjunta incompleta — faltam: {faltandoSemProcurador.map(r => r.nome).join(", ")}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 3 — Cronograma (era Step 4)
        ══════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold">Cronograma de Pagamento</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                O cronograma é sugerido automaticamente com base nos serviços selecionados.
                Edite livremente antes de gerar o contrato.
              </p>
            </div>

            {/* Avisos contextuais: vigência posterior e/ou carência */}
            {(vigenciaInicio && vigenciaInicio > startDate) && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                <span className="mt-0.5 shrink-0 h-3.5 w-3.5 rounded-full bg-blue-400 inline-block" />
                <span>
                  <strong>Início de vigência posterior:</strong> o contrato é assinado em{" "}
                  {new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR")}, mas a vigência
                  começa em {new Date(vigenciaInicio + "T12:00:00").toLocaleDateString("pt-BR")}.
                  O cronograma de cobranças segue a <strong>data do 1º pagamento</strong> abaixo,
                  independente da data de vigência. O prazo contratual não é alterado.
                </span>
              </div>
            )}
            {gracePeriodMonths && Number(gracePeriodMonths) > 0 && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <span className="mt-0.5 shrink-0 h-3.5 w-3.5 rounded-full bg-amber-400 inline-block" />
                <span>
                  <strong>Carência de {gracePeriodMonths} {Number(gracePeriodMonths) === 1 ? "mês" : "meses"}:</strong> nenhum valor será cobrado
                  durante esse período. A cobrança inicia após a carência, no dia {dueDay} do mês correspondente.
                  O prazo total do contrato permanece inalterado.
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="space-y-1.5">
                <Label className="text-sm">Data do 1º pagamento</Label>
                <Input type="date" value={firstPaymentDate}
                  onChange={e => setFirstPaymentDate(e.target.value)}
                  className="h-8 w-44" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Dia de vencimento recorrente</Label>
                <Input type="number" value={dueDay} min={1} max={28}
                  onChange={e => setDueDay(Number(e.target.value))}
                  className="h-8 w-20" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Forma de pagamento recorrente</Label>
                <PaymentMethodSelect
                  value={recurringPaymentMethod}
                  onValueChange={setRecurringPaymentMethod}
                  placeholder="Selecione..."
                />
              </div>
              <Button type="button" size="sm" variant="outline" onClick={recalculateSchedule}>
                Recalcular sugestão
              </Button>
            </div>

            <ContractScheduleEditor
              lines={scheduleLines}
              onChange={setScheduleLines}
              warnings={scheduleWarnings}
            />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 4 — Garantias (era Step 5)
        ══════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="w-full">
            <ContractGuaranteesStep
              clientId={clientId}
              guarantees={guarantees}
              onChange={setGuarantees}
            />
          </div>
        )}
      </div>

      {/* Footer de navegação — sticky na base do container com overflow-y */}
      <div className="sticky bottom-0 flex items-center justify-between px-4 py-3 border-t bg-background z-10 no-print">
        <Button type="button" variant="outline" size="sm"
          onClick={() => setStep(s => s - 1)} disabled={step === 1}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>

        {step < 4 ? (
          <Button type="button" size="sm"
            onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
            Próximo <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleSave}
            disabled={isSaving} className="gap-1.5">
            {isSaving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CheckCircle2 className="h-4 w-4" />}
            Gerar Contrato
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Helper: monta HTML da tabela de cronograma ────────────────────────────────

function buildScheduleHtml(
  lines: ContractPaymentLine[],
  fmt: Intl.NumberFormat,
): string {
  const rows = lines.map(l => {
    const period = l.period_label || (l.due_date
      ? new Date(l.due_date + "T12:00:00").toLocaleDateString("pt-BR")
      : "—");
    const amount = fmt.format(l.amount);
    const method = l.payment_method === "pix" ? "PIX"
      : l.payment_method === "boleto"        ? "Boleto"
      : l.payment_method === "cartao"        ? "Cartão"
      : "Transferência";
    return `<tr><td>${period}</td><td>${amount}</td><td>${method}</td></tr>`;
  }).join("");

  return `
<table style="width:100%;border-collapse:collapse;font-size:0.9em">
  <thead>
    <tr>
      <th style="border:1px solid #ddd;padding:6px 8px;text-align:left">Período / Vencimento</th>
      <th style="border:1px solid #ddd;padding:6px 8px;text-align:left">Valor</th>
      <th style="border:1px solid #ddd;padding:6px 8px;text-align:left">Forma de Pagamento</th>
    </tr>
  </thead>
  <tbody>
    ${rows.replace(/<tr>/g, '<tr style="border:1px solid #ddd">')}
  </tbody>
</table>`.trim();
}
