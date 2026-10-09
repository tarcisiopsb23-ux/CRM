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
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
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
  CheckCircle2, Loader2, Star, Users, Tag, Save,
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
import { PaymentMethodSelect } from "./form/PaymentMethodSelect";
import { usePixKeys } from "@/hooks/usePixKeys";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  /** Contrato rascunho existente — pré-popula o wizard para edição */
  editingContract?: import("@/hooks/useContracts").ContractV2 | null;
  onSuccess: (contractId: string) => void;
  /** Chamado quando a edição do rascunho é concluída — recebe o novo contractId */
  onEditSuccess?: (contractId: string) => void;
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
  /** @deprecated grace_period_months removido — carência não é mais suportada */
  grace_period_months?: number;
  prazo_meses?: number;
  vigencia_inicio?: string;
}

const STEPS = [
  { id: 1, label: "Serviços",           icon: Settings },
  { id: 2, label: "Dados Financeiros",  icon: Tag },
  { id: 3, label: "Cronograma",         icon: Calendar },
  { id: 4, label: "Contratante",        icon: Users },
  { id: 5, label: "Garantias",          icon: CheckCircle2 },
];

// Campos exibidos na seção "Dados do Contratante" — apenas os que o usuário
// deve preencher manualmente. Campos derivados (prazos por extenso, datas
// calculadas, setup, representante) são calculados automaticamente via useEffect.
// Razão social, CNPJ, endereço e cidade são somente-leitura (do cadastro do cliente).

/** Formata CNPJ (14 dígitos → XX.XXX.XXX/XXXX-XX) ou CPF (11 dígitos → XXX.XXX.XXX-XX) */
function formatCnpjCpf(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return value; // retorna original se não tiver 11 ou 14 dígitos
}

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

// Tipo de linha editável do cronograma
type ScheduleRow = {
  mes:           number;
  vencimento:    string; // ISO yyyy-MM-dd; "" = "Na entrega" (eventual conclusao)
  valor:         number;
  valorOriginal: number; // valor base antes do desconto inline
  desconto:      number; // % de desconto nessa parcela (0 = sem desconto)
  tipo:          string;
  recorrente:    boolean;
  metodo:        string;
};

// ─────────────────────────────────────────────────────────────────────────────

export function ContractGenerator({
  clientId, clientName, clientCnpj,
  clientAddress,
  clientAddressStreet, clientAddressNumber, clientAddressComplement,
  clientAddressNeighborhood, clientAddressCity, clientAddressState,
  organizationId, proposalId, proposalData, editingContract, onEditSuccess, onSuccess, onClose,
}: Props) {
  const [step, setStep]         = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // ── Pre-populate from editingContract (edit mode) ────────────────────────
  // Runs once after catalog services are loaded so slugs can be matched.
  const editInitialized = useRef(false);
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

  // ── Dados Financeiros (Step 2) ────────────────────────────────────────────
  // Tipo de contrato: mensal | eventual | evolutivo
  const [contractType, setContractType] = useState<"mensal" | "eventual" | "evolutivo">("mensal");
  // Valor mensal editável — sobrepõe o calculado pelos blocos quando preenchido
  const [monthlyValueManual, setMonthlyValueManual] = useState(
    proposalData?.monthly_amount ? String(proposalData.monthly_amount) : ""
  );
  // Formato de pagamento para contratos eventuais
  const [eventualFormat, setEventualFormat] = useState<"integral" | "meio_meio" | "entrada_parcelado">("integral");
  const [eventualInstallments, setEventualInstallments] = useState("3"); // parcelas do restante (entrada_parcelado)
  const [eventualEntryPct, setEventualEntryPct] = useState("50"); // % de entrada (meio_meio)
  // Setup parcelado: número de parcelas do setup (1 = à vista)
  const [setupInstallments, setSetupInstallments] = useState("1");
  // Linha do cronograma em edição
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ScheduleRow | null>(null);
  // Desconto inline no cronograma — gerenciado por ScheduleRow.desconto (ver Step 3)
  // Mantidos para compatibilidade com proposals importadas (não exposto na UI)
  const [discountEnabled] = useState(false);
  const [discountPercent] = useState("");
  const [discountMonths]  = useState("");

  // ── Comissão variável ─────────────────────────────────────────────────────
  const [commissionEnabled, setCommissionEnabled]           = useState(false);
  const [commissionType, setCommissionType]                 = useState<"percent_value" | "fixed_per_unit">("percent_value");
  const [commissionRate, setCommissionRate]                 = useState("");  // % ou R$ por unidade
  const [commissionDescription, setCommissionDescription]   = useState("");  // o que é um "resultado"
  const [commissionSettlement, setCommissionSettlement]     = useState<"semanal" | "quinzenal" | "mensal">("mensal"); // periodicidade de apuração
  const [commissionPaymentDays, setCommissionPaymentDays]   = useState("5");  // prazo em dias úteis para pagamento após apuração

  // ── Step 2 ───────────────────────────────────────────────────────────────
  const { data: allBlocks = [] }           = useServiceBlocks();
  const { services: catalogServices = [] } = useServiceCatalog(organizationId);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(
    proposalData?.service_slugs ?? []
  );
  const [primarySlug, setPrimarySlug] = useState<string>(
    proposalData?.service_slugs?.[0] ?? ""
  );

  // Aba ativa no painel de entregáveis (null = usa o primeiro serviço selecionado)
  const [activeDelivSlug, setActiveDelivSlug] = useState<string | null>(null);

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

  // ── Pre-populate from editingContract (runs once when catalog is ready) ──
  useEffect(() => {
    if (!editingContract || editInitialized.current || catalogServices.length === 0) return;
    editInitialized.current = true;

    const meta = (editingContract as Record<string, unknown>).metadata as Record<string, unknown> ?? {};

    // Step 1 — basic info
    if (editingContract.template_id) setTemplateId(editingContract.template_id);
    if (editingContract.title)       setTitle(editingContract.title);
    if (editingContract.start_date)  setStartDate(editingContract.start_date);

    const vI = editingContract.vigencia_inicio ?? (meta.vigencia_inicio as string | undefined);
    if (vI) setVigenciaInicio(vI);

    const pm = editingContract.prazo_minimo_meses ?? (meta.prazo_minimo_meses as number | undefined);
    if (pm) setPrazoMinimo(String(pm));

    const sm = (meta.setup_amount_manual as number | undefined) ?? editingContract.total_setup;
    if (sm) setSetupManual(String(sm));

    // Step 2 — services & deliverables
    const slugs = editingContract.service_slugs ?? [];
    setSelectedSlugs(slugs);
    if (slugs.length > 0) setPrimarySlug(slugs[0]);

    // Pre-populate deliverables from metadata.services
    const metaServices = (meta.services as Array<{ service_id: string; selected_deliverables?: Array<{ deliverable_id: string; included: boolean; number_value?: number | null; period?: string | null }> }> | undefined) ?? [];
    if (metaServices.length > 0) {
      const delivMap: Record<string, Record<string, { included: boolean; number_value?: number | null; period?: string | null }>> = {};
      for (const svc of metaServices) {
        const slug = svc.service_id; // stored as slug
        delivMap[slug] = {};
        for (const d of svc.selected_deliverables ?? []) {
          delivMap[slug][d.deliverable_id] = { included: d.included, number_value: d.number_value ?? null, period: d.period ?? null };
        }
      }
      setSelectedDeliverables(delivMap);
    } else {
      // No metadata — init all deliverables as included
      for (const slug of slugs) initDeliverables(slug);
    }

    // Step 4 — financial
    if (editingContract.due_day)          setDueDay(editingContract.due_day);
    if (editingContract.first_payment_date) setFirstPaymentDate(editingContract.first_payment_date);
    const rpm = editingContract.recurring_payment_method ?? (meta.recurring_payment_method as string | undefined);
    if (rpm) setRecurringPaymentMethod(rpm);
    if (editingContract.total_monthly)    setMonthlyValueManual(String(editingContract.total_monthly));

    // Contract type from metadata
    const ct = meta.contract_type as string | undefined;
    if (ct === "mensal" || ct === "eventual" || ct === "evolutivo") setContractType(ct);

    // Commission from metadata
    if (meta.commission_enabled) {
      setCommissionEnabled(true);
      if (meta.commission_type === "fixed_per_unit") setCommissionType("fixed_per_unit");
      if (meta.commission_rate)        setCommissionRate(String(meta.commission_rate));
      if (meta.commission_description) setCommissionDescription(String(meta.commission_description));
      if (meta.commission_settlement === "semanal" || meta.commission_settlement === "quinzenal") {
        setCommissionSettlement(meta.commission_settlement as "semanal" | "quinzenal");
      }
      if (meta.commission_payment_days) setCommissionPaymentDays(String(meta.commission_payment_days));
    }

    // Chave PIX do contrato em edição
    if (editingContract.chave_pix) setSelectedPixKeyId(editingContract.chave_pix);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingContract, catalogServices]);

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

  // ── Chave PIX selecionada para este contrato ──────────────────────────────
  const { pixKeys } = usePixKeys();
  const [selectedPixKeyId, setSelectedPixKeyId] = useState<string>("");

  // Auto-seleciona a chave padrão quando o catálogo carrega (somente se nenhuma foi escolhida)
  useEffect(() => {
    if (selectedPixKeyId || pixKeys.length === 0) return;
    const def = pixKeys.find(k => k.is_default) ?? pixKeys[0];
    if (def) setSelectedPixKeyId(def.id);
  }, [pixKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scheduleLines, setScheduleLines] = useState<ContractPaymentLine[]>([]);

  // Cronograma editável linha a linha
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  // Flag: usuário editou manualmente alguma linha → impede regeneração automática ao re-entrar no Step 3
  const scheduleManuallyEdited = useRef(false);

  const { createContract } = useContracts();
  const { data: signatureBlocks = [] } = useSignatureBlocks();
  const { data: representatives = [], legalRepresentatives } = useClientRepresentatives(clientId);
  // IDs dos representantes selecionados para assinar este contrato
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);

  // ── Step 5: Garantias ─────────────────────────────────────────────────
  const [guarantees, setGuarantees] = useState<GuaranteeDraft[]>([]);

  // Busca signing_type e dados PF do cadastro do cliente — fonte de verdade
  const { data: clientDbData } = useQuery({
    queryKey: ["client_pf_data", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("signing_type, estado_civil, nacionalidade, sexo")
        .eq("id", clientId)
        .single();
      return data as {
        signing_type:  "individual" | "joint" | null;
        estado_civil:  string | null;
        nacionalidade: string | null;
        sexo:          string | null;
      } | null;
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });
  const clientSigningType = clientDbData?.signing_type ?? "individual";

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
  //
  // ATENÇÃO: `variables` NÃO pode estar nas deps — causaria loop infinito
  // porque setVariables é chamado no corpo do efeito. Lemos prazo_vigencia_meses
  // via ref para evitar a dependência reativa.
  const prazoVigenciaRef = useRef(variables.prazo_vigencia_meses);
  useEffect(() => {
    prazoVigenciaRef.current = variables.prazo_vigencia_meses;
  });

  useEffect(() => {
    const prazoMeses    = Number(prazoVigenciaRef.current || 0);
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

    setVariables(prev => {
      // Só atualiza se algum valor realmente mudou — evita re-renders desnecessários
      const prazoMesesStr   = prazoMeses > 0 ? String(prazoMeses * 30) : "";
      const prazoExtStr     = prazoMeses > 0 ? (EXTENSO_MAP[prazoMeses] ?? String(prazoMeses)) : "";
      const prazoMinStr     = prazoMinMeses > 0 ? String(prazoMinMeses) : "";
      const prazoMinExtStr  = prazoMinMeses > 0 ? (EXTENSO_MAP[prazoMinMeses] ?? String(prazoMinMeses)) : "";
      const dataAssinatura  = startDate
        ? format(new Date(startDate + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
        : prev.data_assinatura;

      if (
        prev.prazo_vigencia_dias    === prazoMesesStr &&
        prev.prazo_vigencia_extenso === prazoExtStr &&
        prev.prazo_minimo_meses     === prazoMinStr &&
        prev.prazo_minimo_extenso   === prazoMinExtStr &&
        prev.data_inicio_vigencia   === dataInicioVigencia &&
        prev.data_fim_vigencia      === dataFimVigencia &&
        prev.setup_valor            === setupValor &&
        prev.data_assinatura        === dataAssinatura
      ) return prev; // nada mudou — retorna a mesma referência, evita re-render

      return {
        ...prev,
        prazo_vigencia_dias:    prazoMesesStr,
        prazo_vigencia_extenso: prazoExtStr,
        prazo_minimo_meses:     prazoMinStr,
        prazo_minimo_extenso:   prazoMinExtStr,
        data_inicio_vigencia:   dataInicioVigencia,
        data_fim_vigencia:      dataFimVigencia,
        setup_valor:            setupValor,
        data_assinatura:        dataAssinatura,
      };
    });
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    // variables.prazo_vigencia_meses REMOVIDO — lido via prazoVigenciaRef para evitar loop
    prazoMinimo, vigenciaInicio, startDate,
    setupManual, allBlocks, selectedSlugs, catalogServices,
  ]);

  // Blocos selecionados (para cronograma)
  // Para o cronograma financeiro, mapeia pelo slug do service_catalog → contract_service_block
  // Usa o slug do catalog para encontrar o block financeiro correspondente
  // useMemo: evita recriar o array a cada render (romperia o useCallback de generateScheduleRows)
  const selectedBlocks: ServiceBlock[] = useMemo(
    () => allBlocks.filter(b =>
      selectedSlugs.some(slug =>
        b.slug === slug ||
        catalogServices.find(s => s.slug === slug)?.name?.toLowerCase() === b.name?.toLowerCase()
      )
    ),
    [allBlocks, selectedSlugs, catalogServices]
  );

  // Gera as linhas do cronograma editável. Chamado ao entrar no Step 3 ou ao clicar Recalcular.
  const generateScheduleRows = useCallback(() => {
    if (!firstPaymentDate) return;

    const defMethod   = recurringPaymentMethod || "pix";
    const prazoMeses  = Number(prazoVigenciaRef.current || 12);
    const totalSetup  = setupManual ? Number(setupManual)
      : selectedBlocks.reduce((s, b) => s + (b.setup_amount ?? 0) + (b.one_time_amount ?? 0), 0);
    const totalMensal = monthlyValueManual ? Number(monthlyValueManual)
      : selectedBlocks.reduce((s, b) => s + (b.monthly_amount ?? 0), 0);
    const nSetupParcelas = Math.max(1, Number(setupInstallments) || 1);

    // Adiciona N meses à data ISO preservando o dueDay como dia do mês
    const addMonths = (iso: string, n: number, applyDueDay = false): string => {
      const d = new Date(iso + "T12:00:00");
      d.setMonth(d.getMonth() + n);
      if (applyDueDay && dueDay >= 1) {
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(dueDay, lastDay));
      }
      return d.toISOString().slice(0, 10);
    };

    const rows: ScheduleRow[] = [];
    // ──────────────────────────────────────────────────────────────
    // Eventual — geração directa sem calculateSchedule
    // ──────────────────────────────────────────────────────────────
    if (contractType === "eventual") {
      if (totalMensal <= 0) return;
      if (eventualFormat === "integral") {
        rows.push({ mes: 1, vencimento: firstPaymentDate, valor: totalMensal, valorOriginal: totalMensal, desconto: 0, tipo: "unico",    recorrente: false, metodo: defMethod });
      } else if (eventualFormat === "meio_meio") {
        const entryAmt = Math.round(totalMensal * 0.5 * 100) / 100;
        const restAmt  = Math.round((totalMensal - entryAmt) * 100) / 100;
        rows.push({ mes: 1, vencimento: firstPaymentDate,  valor: entryAmt, valorOriginal: entryAmt, desconto: 0, tipo: "entrada",   recorrente: false, metodo: defMethod });
        rows.push({ mes: 2, vencimento: "",                valor: restAmt,  valorOriginal: restAmt,  desconto: 0, tipo: "conclusao", recorrente: false, metodo: defMethod });
      } else {
        const entryPctNum = Number(eventualEntryPct) || 50;
        const nParcelas   = Math.max(1, Number(eventualInstallments) || 3);
        const entryAmt    = Math.round(totalMensal * (entryPctNum / 100) * 100) / 100;
        const restAmt     = Math.round((totalMensal - entryAmt) * 100) / 100;
        const parcelAmt   = Math.round((restAmt / nParcelas) * 100) / 100;
        rows.push({ mes: 1, vencimento: firstPaymentDate, valor: entryAmt, valorOriginal: entryAmt, desconto: 0, tipo: "entrada", recorrente: false, metodo: defMethod });
        for (let i = 1; i <= nParcelas; i++) {
          const v = i === nParcelas ? Math.round((restAmt - parcelAmt * (nParcelas - 1)) * 100) / 100 : parcelAmt;
          rows.push({ mes: i + 1, vencimento: addMonths(firstPaymentDate, i, true), valor: v, valorOriginal: v, desconto: 0, tipo: "mensalidade", recorrente: false, metodo: defMethod });
        }
      }
      setScheduleRows(rows);
      return;
    }

    // ──────────────────────────────────────────────────────────────
    // Mensal / Evolutivo — gera linha a linha com setup na linha 1
    // ──────────────────────────────────────────────────────────────
    const hasSetup = totalSetup > 0;

    // Geração das mensalidades/evolutivo: retorna array de {mes, date, valor}
    // totalLinhas: quantas mensalidades gerar (prazoMeses quando sem setup, prazoMeses-1 com setup)
    const buildMensalRows = (totalLinhas: number): Array<{mes: number; date: string; valor: number}> => {
      const out: Array<{mes: number; date: string; valor: number}> = [];
      if (contractType === "evolutivo" && selectedBlocks.length > 0) {
        const result = calculateSchedule({
          blocks:           selectedBlocks,
          firstPaymentDate: new Date(firstPaymentDate + "T12:00:00"),
          dueDay,
        });
        for (let mp = 1; mp <= totalLinhas; mp++) {
          const linha = result.lines.find(l => l.month_from <= mp && (l.month_to === null || l.month_to >= mp));
          out.push({ mes: mp, date: addMonths(firstPaymentDate, mp - 1, mp > 1), valor: linha?.amount ?? totalMensal });
        }
      } else {
        for (let mp = 1; mp <= totalLinhas; mp++) {
          out.push({ mes: mp, date: addMonths(firstPaymentDate, mp - 1, mp > 1), valor: totalMensal });
        }
      }
      return out;
    };

    if (!hasSetup) {
      // Sem setup — prazoMeses mensalidades
      const mensais = buildMensalRows(prazoMeses);
      mensais.forEach((m, i) => {
        rows.push({ mes: i + 1, vencimento: m.date, valor: m.valor, valorOriginal: m.valor, desconto: 0, tipo: "mensalidade", recorrente: true, metodo: defMethod });
      });
      setScheduleRows(rows);
      return;
    }

    // Com setup: setup ocupa o mês 1, sobram prazoMeses - 1 mensalidades
    const nMensais = Math.max(0, prazoMeses - 1);
    const parcelSetup     = Math.round((totalSetup / nSetupParcelas) * 100) / 100;
    const parcelSetupLast = Math.round((totalSetup - parcelSetup * (nSetupParcelas - 1)) * 100) / 100;
    const mensais         = buildMensalRows(nMensais);

    let rowMes = 1;

    // Linha 1: apenas setup parcela 1 (exclusiva, data do 1º pagamento)
    rows.push({
      mes: rowMes++,
      vencimento: firstPaymentDate,
      valor: parcelSetup,
      valorOriginal: parcelSetup,
      desconto: 0,
      tipo: "setup",
      recorrente: false,
      metodo: defMethod,
    });

    // Linhas 2..nSetupParcelas: setup parcela i + mensalidade i-1, mesma data
    const overlapCount = nSetupParcelas - 1; // quantas mensalidades se sobrepõem
    for (let i = 1; i < nSetupParcelas; i++) {
      const setupV = i === nSetupParcelas - 1 ? parcelSetupLast : parcelSetup;
      const mensal = mensais[i - 1]; // mensalidade i (0-indexed: i-1)
      const d = addMonths(firstPaymentDate, i, true);
      const valorTotal = Math.round((setupV + (mensal?.valor ?? 0)) * 100) / 100;
      rows.push({
        mes:           rowMes++,
        vencimento:    d,
        valor:         valorTotal,
        valorOriginal: valorTotal,
        desconto:      0,
        tipo:          "setup+mensalidade",
        recorrente:    true,
        metodo:        defMethod,
      });
    }

    // Mensalidades puras: a partir do índice overlapCount no array mensais
    // O offset a partir de firstPaymentDate é: 1 (setup slot) + posição na lista total de mensalidades
    for (let i = overlapCount; i < mensais.length; i++) {
      const mensal = mensais[i];
      // offset = 1 (setup) + i (posição 0-based na lista de mensalidades)
      // i=0 seria o mês 2, mas como overlap já cobriu i=0..overlapCount-1,
      // aqui i começa em overlapCount → offset = 1 + i
      const d = addMonths(firstPaymentDate, 1 + i, true);
      rows.push({
        mes:           rowMes++,
        vencimento:    d,
        valor:         mensal.valor,
        valorOriginal: mensal.valor,
        desconto:      0,
        tipo:          "mensalidade",
        recorrente:    true,
        metodo:        defMethod,
      });
    }

    setScheduleRows(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractType, eventualFormat, eventualEntryPct, eventualInstallments,
      firstPaymentDate, dueDay, recurringPaymentMethod, setupInstallments,
      selectedBlocks, monthlyValueManual, setupManual, prazoVigenciaRef]);

  // Regenera ao entrar no Step 3, a menos que o usuário já tenha editado manualmente o cronograma.
  // Os campos de pagamento no Step 2 (firstPaymentDate, dueDay, recurringPaymentMethod) resetam
  // scheduleManuallyEdited.current = false ao mudar, garantindo regeneração automática ao avançar.
  useEffect(() => {
    if (step === 3 && !scheduleManuallyEdited.current) generateScheduleRows();
  }, [step, generateScheduleRows]);

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

      // Normaliza o tipo interno do ScheduleRow para os valores aceitos pelo banco
      // (contract_payment_schedule.line_type CHECK: 'setup','mensalidade','unico','outro')
      const normalizeLineType = (tipo: string): ContractPaymentLine["line_type"] => {
        if (tipo === "setup" || tipo === "setup+mensalidade") return "setup";
        if (tipo === "mensalidade")                           return "mensalidade";
        if (tipo === "unico")                                 return "unico";
        if (tipo === "entrada" || tipo === "conclusao")       return "mensalidade";
        return "outro";
      };

      // Monta HTML do cronograma a partir das linhas editáveis
      const derivedScheduleLines: ContractPaymentLine[] = scheduleRows.map(r => ({
        line_type:      normalizeLineType(r.tipo),
        month_from:     r.mes,
        month_to:       r.mes,
        amount:         r.valor,
        due_date:       r.vencimento || null,
        payment_method: r.metodo as ContractPaymentLine["payment_method"],
        is_recurring:   r.recorrente,
        period_label:   r.vencimento
          ? new Date(r.vencimento + "T12:00:00").toLocaleDateString("pt-BR")
          : "Na entrega",
      }));
      const scheduleHtml = derivedScheduleLines.length > 0
        ? buildScheduleHtml(derivedScheduleLines, fmt)
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
        estado_civil:     clientDbData?.estado_civil ?? null,
        nacionalidade:    clientDbData?.nacionalidade ?? "brasileiro(a)",
        sexo:             clientDbData?.sexo ?? null,
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
        has_payment_schedule:     derivedScheduleLines.length > 0,
        signing_type:             signingType,
        signed_at:                startDate || new Date().toISOString(),
        cidade_estado:            variables.cidade_estado ?? "",
        recurring_payment_method: recurringPaymentMethod,
        chave_pix:                selectedPixKeyId || null,
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
          setup_installments:        0,
          setup_value:               setupManual ? Number(setupManual) : (totalSetup || 0),
          setup_parcel_value:        0,
          setup_fees:                0,
          setup_first_due_date:      firstPaymentDate,
          setup_payment_method:      recurringPaymentMethod,
          setup_amount_manual:       setupManual ? Number(setupManual) : null,
          // Comissão variável
          commission_enabled:        commissionEnabled || undefined,
          commission_type:           commissionEnabled ? commissionType : undefined,
          commission_rate:           commissionEnabled && commissionRate ? Number(commissionRate) : undefined,
          commission_description:    commissionEnabled && commissionDescription ? commissionDescription : undefined,
          commission_settlement:     commissionEnabled ? commissionSettlement : undefined,
          commission_payment_days:   commissionEnabled && commissionPaymentDays ? Number(commissionPaymentDays) : undefined,
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
          payment_schedule:     derivedScheduleLines,
          clause_snapshot:      clauseMap,
        });
        await persistGuarantees(contract.id);
        // Se estiver editando um rascunho existente, deleta o antigo
        if (editingContract?.id) {
          await supabase.from("contracts_v2").delete().eq("id", editingContract.id);
        }
        toast.success(editingContract ? "Rascunho atualizado com sucesso!" : "Contrato gerado com sucesso!");
        (editingContract ? onEditSuccess ?? onSuccess : onSuccess)(contract.id);
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
        payment_schedule:     derivedScheduleLines,
        clause_snapshot:      clauseMap,
      });

      await persistGuarantees(contract.id);
      // Se estiver editando um rascunho existente, deleta o antigo
      if (editingContract?.id) {
        await supabase.from("contracts_v2").delete().eq("id", editingContract.id);
      }
      toast.success(editingContract ? "Rascunho atualizado com sucesso!" : "Contrato gerado com sucesso!");
      (editingContract ? onEditSuccess ?? onSuccess : onSuccess)(contract.id);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao gerar contrato.");
    } finally {
      setIsSaving(false);
    }
  };

  const canProceed = () => {
    // Step 1 — Serviços: pelo menos um serviço selecionado
    if (step === 1) return selectedSlugs.length > 0;
    // Step 2 — Dados Financeiros: nada obrigatório além dos defaults
    if (step === 2) return true;
    // Step 3 — Cronograma: sempre pode avançar
    if (step === 3) return true;
    // Step 4 — Contratante: representante selecionado
    if (step === 4) {
      const sigType = clientSigningType ?? "individual";
      if (sigType === "individual") return selectedRepIds.length > 0;
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
            Grid de cards compactos + painel de entregáveis full-width
        ══════════════════════════════════════════════════════════════ */}
        {step === 1 && (() => {
          // Serviço ativo no painel — usa activeDelivSlug ou o primeiro selecionado com entregáveis
          const svcsWithDeliverables = selectedSlugs
            .map(slug => catalogServices.find(s => s.slug === slug))
            .filter((s): s is typeof catalogServices[0] => !!s && (s.deliverables?.length ?? 0) > 0);

          const activeSvc = svcsWithDeliverables.find(s => s.slug === activeDelivSlug)
            ?? svcsWithDeliverables[0]
            ?? null;

          return (
          <div className="space-y-5 w-full">
            <div>
              <h2 className="text-base font-semibold">Serviços Contratados</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Selecione os serviços e defina o serviço principal. Configure os entregáveis clicando em um serviço selecionado.
              </p>
            </div>

            {/* Banner proposta */}
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

            {selectedSlugs.length > 1 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                Clique na estrela para definir qual é o serviço principal do contrato.
              </div>
            )}

            {/* ── Grid de cards compactos ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
              {catalogServices.map(svc => {
                const isSelected  = selectedSlugs.includes(svc.slug);
                const isPrimary   = primarySlug === svc.slug;
                const deliverables = svc.deliverables ?? [];
                const svcDelivCfg  = selectedDeliverables[svc.slug] ?? {};
                const includedCount = Object.values(svcDelivCfg).filter(d => d.included !== false).length;
                const clauseCount = allClauses.filter(
                  c => !c.is_fixed && (
                    c.service_slug === svc.slug ||
                    (c.condition_type === "service" && (c.condition_value?.slugs as string[] | undefined)?.includes(svc.slug))
                  )
                ).length;

                return (
                  <div
                    key={svc.slug}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                      isPrimary  ? "border-amber-400 bg-amber-50" :
                      isSelected ? "border-violet-400 bg-violet-50" :
                      "border-border hover:bg-muted/40 hover:border-muted-foreground/30"
                    }`}
                    onClick={() => toggleSlug(svc.slug)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSlug(svc.slug)}
                      className="shrink-0"
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate">{svc.name}</p>
                        {svc.category && (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground shrink-0">{svc.category}</Badge>
                        )}
                        {isPrimary && (
                          <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-300 gap-0.5 shrink-0">
                            <Star className="h-2 w-2 fill-amber-500 text-amber-500" /> Principal
                          </Badge>
                        )}
                      </div>
                      {isSelected && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {deliverables.length > 0 && (
                            <span className="text-[10px] text-violet-600">
                              {includedCount || deliverables.length}/{deliverables.length} entregáveis
                            </span>
                          )}
                          {clauseCount > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <FileText className="h-2.5 w-2.5" />{clauseCount} alíneas
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setPrimarySlug(svc.slug); }}
                            className={`shrink-0 p-1 rounded-full transition-colors ${
                              isPrimary
                                ? "text-amber-500 bg-amber-100 hover:bg-amber-200"
                                : "text-muted-foreground/30 hover:text-amber-400 hover:bg-amber-50"
                            }`}
                          >
                            <Star className={`h-3.5 w-3.5 ${isPrimary ? "fill-amber-400" : ""}`} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {isPrimary ? "Serviço principal" : "Definir como serviço principal"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                );
              })}

              {catalogServices.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8 col-span-full">
                  Nenhum serviço cadastrado. Adicione serviços em Configurações → Serviços/Produtos.
                </p>
              )}
            </div>

            {/* ── Painel de entregáveis full-width ─────────────────────────────
                Aparece abaixo do grid quando há serviços selecionados com entregáveis.
                Exibe abas para cada serviço selecionado que tenha entregáveis.
            ─────────────────────────────────────────────────────────────────── */}
            {(() => {
              const svcsWithDeliverables = selectedSlugs
                .map(slug => catalogServices.find(s => s.slug === slug))
                .filter((s): s is typeof catalogServices[0] => !!s && (s.deliverables?.length ?? 0) > 0);

              if (svcsWithDeliverables.length === 0) return null;

              return (
                <div className="rounded-lg border bg-muted/20">
                  {/* Abas de serviço */}
                  <div className="flex items-center gap-0 border-b overflow-x-auto">
                    {svcsWithDeliverables.map(svc => {
                      const svcDelivCfg  = selectedDeliverables[svc.slug] ?? {};
                      const totalD = svc.deliverables?.length ?? 0;
                      const includedD = totalD > 0
                        ? Object.keys(svcDelivCfg).length > 0
                          ? Object.values(svcDelivCfg).filter(d => d.included !== false).length
                          : totalD
                        : 0;
                      const isPrimaryTab = primarySlug === svc.slug;
                      const isActive = activeSvc?.slug === svc.slug;

                      return (
                        <button
                          key={svc.slug}
                          type="button"
                          onClick={() => setActiveDelivSlug(svc.slug)}
                          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                            isActive
                              ? "border-violet-500 text-violet-700 bg-background"
                              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          {isPrimaryTab && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                          {svc.name}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                            includedD === totalD
                              ? "bg-violet-100 text-violet-600"
                              : "bg-amber-100 text-amber-600"
                          }`}>
                            {includedD}/{totalD}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Entregáveis do serviço ativo */}
                  {activeSvc && (() => {
                    const svc = activeSvc;
                    const deliverables = svc.deliverables ?? [];
                    const svcDelivCfg  = selectedDeliverables[svc.slug] ?? {};

                    return (
                      <div key={svc.slug} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {deliverables.map(d => {
                            const cfg = svcDelivCfg[d.id] ?? { included: true };
                            const isIncluded = cfg.included !== false;
                            return (
                              <div
                                key={d.id}
                                className={`flex items-start gap-2.5 p-2.5 rounded-md border transition-colors ${
                                  isIncluded ? "bg-background" : "bg-muted/30 opacity-60"
                                }`}
                              >
                                <Checkbox
                                  checked={isIncluded}
                                  onCheckedChange={v => updateDeliverable(svc.slug, d.id, { included: !!v })}
                                  className="mt-0.5 shrink-0"
                                />
                                <div className="flex-1 min-w-0 space-y-1">
                                  <p className={`text-xs font-medium leading-snug ${!isIncluded ? "line-through text-muted-foreground" : ""}`}>
                                    {d.name}
                                  </p>
                                  {d.output_format === "numero" && isIncluded && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <div className="flex items-center gap-1.5">
                                        <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Qtd.</Label>
                                        <Input
                                          type="number" min={1}
                                          value={cfg.number_value ?? ""}
                                          onChange={e => updateDeliverable(svc.slug, d.id, { number_value: e.target.value ? Number(e.target.value) : null })}
                                          placeholder="—"
                                          className="h-6 w-14 text-xs px-1.5"
                                        />
                                        {d.unit && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {cfg.number_value === 1 ? d.unit : (d.unit_plural || d.unit)}
                                          </span>
                                        )}
                                      </div>
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
                                  {d.output_format === "texto" && d.text_value && isIncluded && (
                                    <p className="text-[10px] text-muted-foreground italic">{d.text_value}</p>
                                  )}
                                </div>
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
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {selectedSlugs.length > 0 && !primarySlug && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Star className="h-3 w-3" /> Nenhum serviço principal definido — o primeiro selecionado será usado.
              </p>
            )}
          </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════
            Step 2 — Dados Financeiros
            Tipo de contrato, valor, desconto, setup, prazos, datas
        ══════════════════════════════════════════════════════════════ */}
        {step === 2 && (() => {
          // Valor mensal efetivo: manual > blocos
          const totalMonthlyBlocks = selectedBlocks.reduce((s, b) => s + (b.monthly_amount ?? 0), 0);
          const effectiveMonthly   = monthlyValueManual ? Number(monthlyValueManual) : totalMonthlyBlocks;
          const totalSetupBlocks   = selectedBlocks.reduce((s, b) => s + (b.setup_amount ?? 0) + (b.one_time_amount ?? 0), 0);
          const effectiveSetup     = setupManual ? Number(setupManual) : totalSetupBlocks;
          const fmt2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          return (
          <div className="space-y-6 w-full">
            <div>
              <h2 className="text-base font-semibold">Dados Financeiros</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Configure o tipo, valores e condições financeiras do contrato.
              </p>
            </div>

            {/* Proposta de origem */}
            {proposalId && (
              <div className="pb-4 border-b">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Origem</p>
                <div className="flex flex-col gap-1 max-w-xs">
                  <Label className="text-xs text-muted-foreground">Proposta vinculada</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm font-mono text-muted-foreground select-none">
                    {proposalData?.title
                      ? <><span className="text-foreground font-medium truncate mr-2">{proposalData.title}</span><span className="text-[10px] shrink-0">{proposalId.slice(0, 8)}…</span></>
                      : proposalId
                    }
                  </div>
                </div>
              </div>
            )}

            {/* ── Tipo de Contrato ── */}
            <div className="space-y-3 pb-5 border-b">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tipo de Contrato</p>
              <div className="grid grid-cols-3 gap-3">
                {(["mensal", "eventual", "evolutivo"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { scheduleManuallyEdited.current = false; setContractType(t); }}
                    className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${
                      contractType === t
                        ? "border-violet-400 bg-violet-50 text-violet-900"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <span className="text-sm font-medium capitalize">
                      {t === "mensal" ? "Recorrente (Mensal)" : t === "eventual" ? "Eventual (Único)" : "Evolutivo"}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      {t === "mensal"    && "Mensalidade fixa cobrada todo mês"}
                      {t === "eventual"  && "Pagamento único, sem recorrência"}
                      {t === "evolutivo" && "Valores crescentes ao longo do contrato"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Valores ── */}
            <div className="space-y-3 pb-5 border-b">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Valores</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-2 items-start">

                {/* Col 1 — Valor mensal / contrato */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs h-4 flex items-center">
                    {contractType === "eventual" ? "Valor do contrato" : "Valor da mensalidade"}
                  </Label>
                  {totalMonthlyBlocks > 0 && (
                    <p className="text-[10px] text-violet-600 -mt-0.5 mb-0.5">
                      Calculado: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalMonthlyBlocks)}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <CurrencyInput
                      value={monthlyValueManual}
                      onValueChange={setMonthlyValueManual}
                      placeholder={totalMonthlyBlocks > 0 ? fmt2.format(totalMonthlyBlocks) : "0,00"}
                      className="h-8 flex-1"
                    />
                    {monthlyValueManual && (
                      <button type="button" onClick={() => setMonthlyValueManual("")}
                        className="h-8 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Usar valor calculado automaticamente">×</button>
                    )}
                  </div>
                </div>

                {/* Col 2 — Setup / Implementação */}
                {contractType !== "eventual" ? (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs h-4 flex items-center">Setup / Implementação</Label>
                    {totalSetupBlocks > 0 && (
                      <p className="text-[10px] text-violet-600 -mt-0.5 mb-0.5">
                        Calculado: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalSetupBlocks)}
                      </p>
                    )}
                    <div className="flex items-center gap-1">
                      <CurrencyInput
                        value={setupManual}
                        onValueChange={setSetupManual}
                        placeholder={totalSetupBlocks > 0 ? fmt2.format(totalSetupBlocks) : "0,00"}
                        className="h-8 flex-1"
                      />
                      {setupManual && (
                        <button type="button" onClick={() => setSetupManual("")}
                          className="h-8 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          title="Limpar">×</button>
                      )}
                    </div>
                  </div>
                ) : <div />}

                {/* Col 3 — Parcelas do setup */}
                {contractType !== "eventual" && effectiveSetup > 0 ? (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs h-4 flex items-center">Parcelas do setup</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={1} max={24} step={1}
                        value={setupInstallments}
                        onChange={e => setSetupInstallments(e.target.value || "1")}
                        className="h-8 w-24 text-xs"
                      />
                      {Number(setupInstallments) > 1 && (
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                            Math.round(effectiveSetup / Number(setupInstallments) * 100) / 100
                          )}/parcela
                        </span>
                      )}
                    </div>
                  </div>
                ) : <div />}

                {/* Resumo visual — linha inteira */}
                {effectiveMonthly > 0 && (
                  <div className="col-span-3 flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      {contractType === "eventual"
                        ? `Pagamento único de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(effectiveMonthly)}`
                        : `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(effectiveMonthly)}/mês`
                      }
                      {effectiveSetup > 0 && contractType !== "eventual" && ` + setup de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(effectiveSetup)}`}
                      {effectiveSetup > 0 && contractType !== "eventual" && Number(setupInstallments) > 1 && ` em ${setupInstallments}x`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Formato de pagamento (apenas eventual) ── */}
            {contractType === "eventual" && (() => {
              const totalMonthlyBlocksEv = selectedBlocks.reduce((s, b) => s + (b.monthly_amount ?? 0), 0);
              const effectiveEv = monthlyValueManual ? Number(monthlyValueManual) : totalMonthlyBlocksEv;
              const entryPct    = Math.min(99, Math.max(1, Number(eventualEntryPct) || 50));
              const entryVal    = Math.round(effectiveEv * (entryPct / 100) * 100) / 100;
              const restVal     = effectiveEv - entryVal;
              const fmtCurEv    = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
              return (
                <div className="space-y-3 pb-5 border-b">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Formato de Pagamento</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { key: "integral",           label: "Valor integral",            desc: "100% na contratação" },
                      { key: "meio_meio",           label: "50% / 50%",                desc: "Entrada na assinatura, restante na entrega" },
                      { key: "entrada_parcelado",   label: "Entrada + Parcelado",      desc: "Entrada + restante em parcelas" },
                    ] as const).map(({ key, label, desc }) => (
                      <button key={key} type="button"
                        onClick={() => setEventualFormat(key)}
                        className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${eventualFormat === key ? "border-violet-400 bg-violet-50 text-violet-900" : "border-border hover:bg-muted/40"}`}>
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-[11px] text-muted-foreground leading-snug">{desc}</span>
                      </button>
                    ))}
                  </div>

                  {/* Campos extras por formato */}
                  {eventualFormat === "meio_meio" && (
                    <div className="grid grid-cols-2 gap-4 items-end mt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">% da entrada</Label>
                        <div className="flex items-center gap-1.5">
                          <Input type="number" min={1} max={99}
                            value={eventualEntryPct}
                            onChange={e => setEventualEntryPct(e.target.value)}
                            className="h-8 w-20" />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      {effectiveEv > 0 && (
                        <div className="rounded-lg bg-muted/30 border p-2.5 text-xs space-y-0.5">
                          <p className="text-muted-foreground">Entrada: <strong>{fmtCurEv.format(entryVal)}</strong></p>
                          <p className="text-muted-foreground">Restante: <strong>{fmtCurEv.format(restVal)}</strong></p>
                        </div>
                      )}
                    </div>
                  )}

                  {eventualFormat === "entrada_parcelado" && (
                    <div className="grid grid-cols-2 gap-4 items-end mt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">% da entrada</Label>
                        <div className="flex items-center gap-1.5">
                          <Input type="number" min={1} max={99}
                            value={eventualEntryPct}
                            onChange={e => setEventualEntryPct(e.target.value)}
                            className="h-8 w-20" />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Parcelas do restante</Label>
                        <Input type="number" min={1} max={60}
                          value={eventualInstallments}
                          onChange={e => setEventualInstallments(e.target.value)}
                          className="h-8" />
                      </div>
                      {effectiveEv > 0 && (
                        <div className="col-span-2 rounded-lg bg-muted/30 border p-2.5 text-xs space-y-0.5">
                          <p className="text-muted-foreground">
                            Entrada ({entryPct}%): <strong>{fmtCurEv.format(entryVal)}</strong>
                          </p>
                          <p className="text-muted-foreground">
                            {Number(eventualInstallments) || 1}x de{" "}
                            <strong>{fmtCurEv.format(Math.round(restVal / (Number(eventualInstallments) || 1) * 100) / 100)}</strong>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}


            {/* ── Comissão sobre Resultados ── */}
            <div className="space-y-3 pb-5 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Comissão sobre Resultados</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Habilite para registrar mensalmente resultados variáveis e calcular a cobrança.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={commissionEnabled}
                    onChange={e => setCommissionEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-muted-foreground">Ativar comissão</span>
                </label>
              </div>

              {commissionEnabled && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-start">
                  {/* Tipo de base */}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs h-4 flex items-center">Tipo de base</Label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {([
                        { key: "percent_value",  label: "% sobre o valor",    desc: "Comissão = resultado × taxa%" },
                        { key: "fixed_per_unit", label: "R$ por resultado",   desc: "Comissão = qtde × valor fixo" },
                      ] as const).map(({ key, label, desc }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCommissionType(key)}
                          className={`flex flex-col gap-0.5 px-3 py-2 rounded-lg border text-left transition-all ${
                            commissionType === key
                              ? "border-violet-400 bg-violet-50 text-violet-900"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <span className="text-xs font-medium">{label}</span>
                          <span className="text-[10px] text-muted-foreground leading-snug">{desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Taxa */}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs h-4 flex items-center">
                      {commissionType === "percent_value" ? "Taxa de comissão (%)" : "Valor por resultado (R$)"}
                    </Label>
                    <div className="flex items-center gap-1">
                      {commissionType === "percent_value" ? (
                        <>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={commissionRate}
                            onChange={e => setCommissionRate(e.target.value)}
                            placeholder="Ex: 10"
                            className="h-8 flex-1"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">%</span>
                        </>
                      ) : (
                        <CurrencyInput
                          value={commissionRate}
                          onValueChange={setCommissionRate}
                          placeholder="0,00"
                          className="h-8"
                        />
                      )}
                    </div>
                    {commissionRate && Number(commissionRate) > 0 && (
                      <p className="text-[10px] text-violet-600">
                        {commissionType === "percent_value"
                          ? `${commissionRate}% sobre o valor dos resultados`
                          : `R$ ${commissionRate} por resultado registrado`}
                      </p>
                    )}
                  </div>

                  {/* Descrição */}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs h-4 flex items-center">O que é um resultado?</Label>
                    <Input
                      value={commissionDescription}
                      onChange={e => setCommissionDescription(e.target.value)}
                      placeholder="Ex: contrato fechado, lead convertido…"
                      className="h-8"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Aparecerá no formulário de registro mensal.
                    </p>
                  </div>

                  {/* Periodicidade de apuração */}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Periodicidade de apuração</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { key: "semanal",    label: "Semanal" },
                        { key: "quinzenal",  label: "Quinzenal" },
                        { key: "mensal",     label: "Mensal" },
                      ] as const).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCommissionSettlement(key)}
                          className={`px-2 py-1.5 rounded-lg border text-xs text-center transition-all ${
                            commissionSettlement === key
                              ? "border-violet-400 bg-violet-50 text-violet-900 font-semibold"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Frequência de levantamento e cobrança da comissão.
                    </p>
                  </div>

                  {/* Prazo de pagamento após apuração */}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Prazo de pagamento (dias úteis)</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={commissionPaymentDays}
                        onChange={e => setCommissionPaymentDays(e.target.value)}
                        placeholder="Ex: 5"
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">dias úteis</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Prazo para pagar a comissão após encerrar o período de apuração.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Prazos e Datas ── */}
            <div className="space-y-3 pb-5 border-b">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Prazos e Datas</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 items-end">
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Data da Contratação <span className="text-red-500">*</span></Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Data de assinatura do contrato.</p>
                  </div>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8" />
                </div>
                {contractType !== "eventual" && (
                  <>
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
                  </>
                )}
              </div>
            </div>

            {/* ── Pagamento ── */}
            <div className="space-y-3 pb-5 border-b">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pagamento</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 items-end">
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Data do 1º pagamento <span className="text-red-500">*</span></Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Vencimento da primeira parcela.</p>
                  </div>
                  <Input type="date" value={firstPaymentDate}
                    onChange={e => { scheduleManuallyEdited.current = false; setFirstPaymentDate(e.target.value); }}
                    className="h-8" />
                </div>
                {contractType !== "eventual" && (
                  <div className="flex flex-col gap-1">
                    <div>
                      <Label className="text-xs">Dia de vencimento</Label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Dia do mês para parcelas recorrentes.</p>
                    </div>
                    <Input type="number" value={dueDay} min={1} max={28}
                      onChange={e => { scheduleManuallyEdited.current = false; setDueDay(Number(e.target.value)); }}
                      className="h-8 w-24" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <div>
                    <Label className="text-xs">Forma de pagamento</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Padrão aplicado a todas as parcelas.</p>
                  </div>
                  <PaymentMethodSelect
                    value={recurringPaymentMethod}
                    onValueChange={v => { scheduleManuallyEdited.current = false; setRecurringPaymentMethod(v); }}
                    placeholder="Selecione..."
                  />
                </div>

                {/* Chave PIX — visível quando forma de pagamento é PIX */}
                {recurringPaymentMethod === "pix" && (
                  <div className="flex flex-col gap-1">
                    <div>
                      <Label className="text-xs">Chave PIX</Label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Chave que constará no contrato.</p>
                    </div>
                    {pixKeys.length === 0 ? (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        Nenhuma chave PIX cadastrada. Acesse Configurações → Contratos para adicionar.
                      </p>
                    ) : (
                      <select
                        value={selectedPixKeyId}
                        onChange={e => setSelectedPixKeyId(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Selecione uma chave PIX…</option>
                        {pixKeys.map(k => (
                          <option key={k.id} value={k.id}>
                            {k.label} — {k.key_value}{k.holder_name ? ` (${k.holder_name})` : ""}{k.is_default ? " ★ padrão" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════
            Step 3 — Cronograma
            Tabela editável linha a linha
        ══════════════════════════════════════════════════════════════ */}
        {step === 3 && (
            <div className="space-y-5 w-full">
              <div>
                <h2 className="text-base font-semibold">Cronograma de Pagamento</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Visualize o cronograma gerado e ajuste parcelas individualmente se necessário.
                </p>
              </div>

              {/* Alerta vigência posterior */}
              {vigenciaInicio && vigenciaInicio > startDate && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                  <span className="mt-0.5 shrink-0 h-3.5 w-3.5 rounded-full bg-blue-400 inline-block" />
                  <span><strong>Início de vigência posterior:</strong> cronograma começa a partir da data do 1º pagamento; vigência inicia em {new Date(vigenciaInicio + "T12:00:00").toLocaleDateString("pt-BR")}.</span>
                </div>
              )}

              {/* Tabela editável */}
              {scheduleRows.length > 0 ? (() => {
                const fmtCurInline = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
                const setupRows       = scheduleRows.filter(r => r.tipo === "setup" || r.tipo === "setup+mensalidade");
                const mensalidadeRows = scheduleRows.filter(r => r.tipo === "mensalidade" || r.tipo === "setup+mensalidade");

                const openEdit = (idx: number) => {
                  setEditingRowIdx(idx);
                  setEditDraft({ ...scheduleRows[idx] });
                };
                const cancelEdit = () => { setEditingRowIdx(null); setEditDraft(null); };
                const saveEdit = () => {
                  if (editDraft === null || editingRowIdx === null) return;
                  const pct = editDraft.desconto || 0;
                  const valorFinal = pct > 0
                    ? Math.round(editDraft.valorOriginal * (1 - pct / 100) * 100) / 100
                    : editDraft.valor;
                  setScheduleRows(prev => prev.map((r, i) => i === editingRowIdx
                    ? { ...editDraft, valor: valorFinal }
                    : r
                  ));
                  scheduleManuallyEdited.current = true;
                  setEditingRowIdx(null);
                  setEditDraft(null);
                };

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Cronograma — {scheduleRows.length} parcela{scheduleRows.length !== 1 ? "s" : ""}
                        {" "}· Total: {fmtCurInline.format(scheduleRows.reduce((s, r) => s + r.valor, 0))}
                      </p>
                      {scheduleManuallyEdited.current && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            scheduleManuallyEdited.current = false;
                            generateScheduleRows();
                          }}
                        >
                          Recalcular
                        </Button>
                      )}
                    </div>
                    <div className="rounded-lg border overflow-x-auto">
                      <table className="w-full text-xs min-w-[540px]">
                        <thead>
                          <tr className="bg-muted/40 border-b">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tipo</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vencimento</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Valor</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Forma de Pgto</th>
                            <th className="px-3 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {scheduleRows.map((row, idx) => {
                            const setupIdx = setupRows.indexOf(row);
                            const mensIdx  = mensalidadeRows.indexOf(row);
                            const totalSetupN = setupRows.length;
                            const totalMensN  = mensalidadeRows.length;
                            const tipoLabel =
                              row.tipo === "setup"              ? (totalSetupN > 1 ? `Setup ${setupIdx + 1}/${totalSetupN}` : "Setup") :
                              row.tipo === "setup+mensalidade"  ? `Setup ${setupIdx + 1}/${totalSetupN} + Mensalidade ${mensIdx + 1}` :
                              row.tipo === "entrada"            ? "Entrada"          :
                              row.tipo === "conclusao"          ? "Saldo na entrega" :
                              row.tipo === "unico"              ? "Pagamento único"  :
                              row.tipo === "mensalidade" && totalMensN > 1
                                ? `Mensalidade ${mensIdx + 1}/${totalMensN}`
                                : "Mensalidade";
                            const tipoColor =
                              row.tipo === "setup"             ? "bg-amber-100 text-amber-700"    :
                              row.tipo === "setup+mensalidade" ? "bg-orange-100 text-orange-700"  :
                              row.tipo === "entrada"           ? "bg-emerald-100 text-emerald-700" :
                              row.tipo === "conclusao"         ? "bg-sky-100 text-sky-700"         :
                              row.tipo === "unico"             ? "bg-blue-100 text-blue-700"       :
                              row.recorrente                   ? "bg-violet-100 text-violet-700"   :
                              "bg-blue-100 text-blue-700";

                            const isEditing = editingRowIdx === idx;
                            const fmtVenc = (iso: string) => {
                              try { return iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—"; }
                              catch { return iso; }
                            };
                            const metodLabel: Record<string, string> = {
                              pix: "PIX", boleto: "Boleto", cartao: "Cartão", transferencia: "Transferência",
                            };

                            return (
                              <Fragment key={`frag-${idx}`}>
                                <tr
                                  onClick={() => !isEditing && openEdit(idx)}
                                  className={`border-b cursor-pointer transition-colors
                                    ${row.tipo === "setup" ? "bg-amber-50/30" : ""}
                                    ${isEditing ? "bg-blue-50/40 border-blue-200" : "hover:bg-muted/30"}
                                  `}
                                >
                                  <td className="px-3 py-2 text-muted-foreground">{row.mes}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tipoColor}`}>
                                      {tipoLabel}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.tipo === "conclusao" && !row.vencimento
                                      ? <span className="text-muted-foreground italic">Na entrega</span>
                                      : fmtVenc(row.vencimento)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                    {fmtCurInline.format(row.valor)}
                                    {row.desconto > 0 && (
                                      <span className="ml-1 text-[10px] text-amber-600 font-normal">-{row.desconto}%</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {metodLabel[row.metodo] ?? row.metodo.toUpperCase()}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground text-right">
                                    <span className="text-[10px] text-blue-500 hover:underline select-none">
                                      {isEditing ? "▲" : "✎"}
                                    </span>
                                  </td>
                                </tr>

                                {/* Painel de edição expandível */}
                                {isEditing && editDraft && (
                                  <tr key={`edit-${idx}`} className="border-b bg-blue-50/40">
                                    <td colSpan={6} className="px-3 py-3">
                                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        {/* Vencimento */}
                                        {!(editDraft.tipo === "conclusao" && !editDraft.vencimento) && (
                                          <div className="flex flex-col gap-1">
                                            <Label className="text-xs h-4 flex items-center">Vencimento</Label>
                                            <Input
                                              type="date"
                                              value={editDraft.vencimento}
                                              onChange={e => setEditDraft(d => d ? { ...d, vencimento: e.target.value } : d)}
                                              className="h-8 text-xs"
                                            />
                                          </div>
                                        )}
                                        {/* Valor */}
                                        <div className="flex flex-col gap-1">
                                          <Label className="text-xs h-4 flex items-center">Valor (R$)</Label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            value={editDraft.valor}
                                            onChange={e => setEditDraft(d => d ? {
                                              ...d,
                                              valor: Number(e.target.value),
                                              valorOriginal: Number(e.target.value),
                                              desconto: 0,
                                            } : d)}
                                            className="h-8 text-xs text-right"
                                          />
                                        </div>
                                        {/* Desconto */}
                                        <div className="flex flex-col gap-1">
                                          <Label className="text-xs h-4 flex items-center">Desconto (%)</Label>
                                          <div className="flex items-center gap-1">
                                            <Input
                                              type="number"
                                              step="1"
                                              min={0}
                                              max={100}
                                              value={editDraft.desconto || ""}
                                              placeholder="0"
                                              onChange={e => {
                                                const pct = Number(e.target.value) || 0;
                                                setEditDraft(d => d ? { ...d, desconto: pct } : d);
                                              }}
                                              className="h-8 text-xs text-right flex-1"
                                            />
                                            <span className="text-muted-foreground text-xs">%</span>
                                          </div>
                                          {editDraft.desconto > 0 && (
                                            <span className="text-[10px] text-amber-600 mt-0.5">
                                              → {fmtCurInline.format(
                                                Math.round(editDraft.valorOriginal * (1 - editDraft.desconto / 100) * 100) / 100
                                              )}
                                            </span>
                                          )}
                                        </div>
                                        {/* Forma de pgto */}
                                        <div className="flex flex-col gap-1">
                                          <Label className="text-xs h-4 flex items-center">Forma de Pgto</Label>
                                          <Select
                                            value={editDraft.metodo}
                                            onValueChange={v => setEditDraft(d => d ? { ...d, metodo: v } : d)}
                                          >
                                            <SelectTrigger className="h-8 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="pix">PIX</SelectItem>
                                              <SelectItem value="boleto">Boleto</SelectItem>
                                              <SelectItem value="cartao">Cartão</SelectItem>
                                              <SelectItem value="transferencia">Transferência</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                      {/* Botões */}
                                      <div className="flex items-center gap-2 mt-3">
                                        <Button type="button" size="sm" onClick={saveEdit}>
                                          Salvar
                                        </Button>
                                        <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                                          Cancelar
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })() : (
                <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
                  Selecione ao menos um serviço e defina os valores para visualizar o cronograma.
                </div>
              )}
            </div>
          )}

        {/* ══════════════════════════════════════════════════════════════
            Step 4 — Contratante
            Dados somente-leitura + seleção de representantes
        ══════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="space-y-6 w-full">
            <div>
              <h2 className="text-base font-semibold">Dados do Contratante</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Confirme os dados do cliente e selecione os representantes para assinatura.
              </p>
            </div>

            {/* Campos somente-leitura */}
            <div className="space-y-3 pb-5 border-b">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dados Cadastrais</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 items-end">
                <div className="flex flex-col gap-1 col-span-2">
                  <Label className="text-xs">Razão Social / Nome</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none truncate">
                    {variables.contratante_razao_social || "—"}
                  </div>
                </div>
                <div className="flex flex-col gap-1 col-span-1">
                  <Label className="text-xs">CNPJ / CPF</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none font-mono">
                    {variables.contratante_cnpj ? formatCnpjCpf(variables.contratante_cnpj) : "—"}
                  </div>
                </div>
                <div className="flex flex-col gap-1 col-span-1">
                  <Label className="text-xs">Cidade/Estado</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none">
                    {variables.cidade_estado || "—"}
                  </div>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <Label className="text-xs">Endereço Completo</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none truncate">
                    {variables.contratante_endereco || "—"}
                  </div>
                </div>
                <div className="flex flex-col gap-1 col-span-1">
                  <Label className="text-xs">Cidade do Foro</Label>
                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none">
                    Teófilo Otoni (MG)
                  </div>
                </div>
              </div>
            </div>

            {/* Representantes */}
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
                        const podeSelecionar = !vencida;

                        const handleToggle = () => {
                          if (!podeSelecionar) return;
                          const sigType = clientSigningType ?? "individual";
                          if (sigType === "individual") {
                            setSelectedRepIds(isSelecionado ? [] : [rep.id]);
                          } else {
                            setSelectedRepIds(prev =>
                              isSelecionado ? prev.filter(id => id !== rep.id) : [...prev, rep.id]
                            );
                          }
                          const newIds = (clientSigningType ?? "individual") === "individual"
                            ? (isSelecionado ? [] : [rep.id])
                            : (isSelecionado
                                ? selectedRepIds.filter(id => id !== rep.id)
                                : [...selectedRepIds, rep.id]);
                          const primary = representatives.find(r => newIds[0] === r.id);
                          setVariables(prev => ({
                            ...prev,
                            representante_nome: primary?.nome ?? "",
                            representante_cpf:  primary?.cpf  ?? "",
                          }));
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

              {(clientSigningType ?? "individual") === "joint" && (() => {
                const obrigatorios = representatives.filter(
                  r => r.is_legal_representative && r.tipo_representacao === "legal"
                );
                const faltandoSemProcurador = obrigatorios.filter(r => {
                  if (selectedRepIds.includes(r.id)) return false;
                  return !representatives.some(
                    p => p.tipo_representacao === "procurador" &&
                         p.representa_ids?.includes(r.id) &&
                         selectedRepIds.includes(p.id)
                  );
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
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 5 — Garantias
        ══════════════════════════════════════════════════════════════ */}
        {step === 5 && (
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

        <div className="flex items-center gap-2">
          {/* Salvar Rascunho — disponível a partir do Step 2 */}
          {step >= 2 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={isSaving || selectedSlugs.length === 0}
              className="gap-1.5"
            >
              {isSaving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Save className="h-3.5 w-3.5" />}
              Salvar Rascunho
            </Button>
          )}

          {step < 5 ? (
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
