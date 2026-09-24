/**
 * FormLeadsTab — Aba "Recebidos do Formulário" na LeadsKanbanPage.
 *
 * Exibe os leads que chegaram via formulário de qualificação do site (/qualificacao).
 * Permite visualizar score, classificação e briefing, e promover o lead para o CRM,
 * descartá-lo ou excluí-lo permanentemente.
 *
 * Fonte de dados: tabela `leads` (Banco A), filtrada por stage_id = 'formulario'.
 * A deduplicação por id evita registros duplicados mesmo que source também bata.
 */

import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Flame, Thermometer, TrendingUp, UserX, ArrowRight, MessageCircle,
  Loader2, Inbox, RefreshCw, ExternalLink, Eye, Trash2, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Classificacao =
  | "ULTRA_QUENTE"
  | "QUENTE"
  | "MORNO"
  | "FRIO"
  | "NAO_QUALIFICADO"
  | null;

interface FormLead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  nicho: string | null;
  cidade: string | null;
  servico: string | null;
  score_qualificacao: number | null;
  classificacao_lead: Classificacao;
  briefing_ia: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  form_respostas: Record<string, unknown> | null;
  detalhes_funil: Record<string, unknown> | null;
  etapa_kanban: string;
  stage_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

// ─── Configuração visual por classificação ────────────────────────────────────

function classifConfig(c: Classificacao) {
  switch (c) {
    case "ULTRA_QUENTE":
      return { label: "Ultra Quente", icon: <Flame className="h-3.5 w-3.5" />, className: "bg-red-500/15 text-red-400 border-red-500/30" };
    case "QUENTE":
      return { label: "Quente", icon: <Flame className="h-3.5 w-3.5" />, className: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
    case "MORNO":
      return { label: "Morno", icon: <Thermometer className="h-3.5 w-3.5" />, className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" };
    case "FRIO":
      return { label: "Frio", icon: <TrendingUp className="h-3.5 w-3.5" />, className: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
    case "NAO_QUALIFICADO":
      return { label: "Não qualificado", icon: <UserX className="h-3.5 w-3.5" />, className: "bg-muted/40 text-muted-foreground border-border" };
    default:
      return { label: "Sem classificação", icon: null, className: "bg-muted/20 text-muted-foreground border-border" };
  }
}

// ─── Filtros disponíveis ───────────────────────────────────────────────────────

const FILTERS: { value: Classificacao | "TODOS"; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "ULTRA_QUENTE", label: "Ultra Quente" },
  { value: "QUENTE", label: "Quente" },
  { value: "MORNO", label: "Morno" },
  { value: "FRIO", label: "Frio" },
  { value: "NAO_QUALIFICADO", label: "Não qualificado" },
];

// ─── Labels legíveis para campos do formulário / funil ────────────────────────

const CAMPO_LABELS: Record<string, string> = {
  // form_respostas (fs-lead-quente)
  segmento: "Segmento / Nicho",
  fase: "Fase da empresa",
  faturamento: "Faturamento",
  dor: "Principal desafio",
  aquisicao: "Aquisição de clientes",
  orcamento: "Orçamento disponível",
  prazo: "Prazo para decidir",
  experiencia: "Experiência com agência",
  texto_livre: "Contexto adicional",
  // detalhes_funil (fs-gmn-lead-quente / fs-lead-universal)
  estabelecimento: "Estabelecimento",
  como_conheceu: "Como conheceu",
  problemas: "Problemas identificados",
  perfil_existe: "Perfil GMN existe?",
  informacoes: "Informações do perfil",
  fotos: "Fotos",
  avaliacoes: "Avaliações",
  buscas: "Aparece nas buscas?",
  perda_cliente: "Já perdeu clientes por isso?",
  cta_origem: "Como chegou",
  tipo_lead: "Tipo de lead",
};

// Campos técnicos/internos que não devem ser exibidos ao usuário
// (tratados separadamente em CtaOrigemCard ou irrelevantes para o vendedor)
const CAMPOS_OCULTOS = new Set([
  "gmn_score", "gmn_severidade", "organization_id", "recebido_em",
  "agendamento_modalidade", "agendamento_dias_semana", "agendamento_data_solicitacao",
  "agendamento", "cta_origem", "tipo_lead",
]);

/**
 * Normaliza e mescla form_respostas + detalhes_funil numa única lista de
 * pares chave-valor legíveis, descartando campos técnicos e valores vazios.
 *
 * Ordem de saída:
 *   1. "problemas" primeiro (span 2 colunas)
 *   2. demais campos
 *   3. "texto_livre" por último (span 2 colunas)
 */
function buildCamposVisiveis(
  formRespostas: Record<string, unknown> | null,
  detalhesFunil: Record<string, unknown> | null
): Array<{ key: string; label: string; value: string; isTextoLivre: boolean; isProblemas: boolean }> {
  // Mescla: form_respostas tem prioridade sobre detalhes_funil para evitar duplicatas
  const merged: Record<string, unknown> = {
    ...(detalhesFunil ?? {}),
    ...(formRespostas ?? {}),
  };

  const result: Array<{ key: string; label: string; value: string; isTextoLivre: boolean; isProblemas: boolean }> = [];

  for (const [key, val] of Object.entries(merged)) {
    if (CAMPOS_OCULTOS.has(key)) continue;
    if (val === null || val === undefined || val === "") continue;
    const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (!strVal.trim()) continue;
    result.push({
      key,
      label: CAMPO_LABELS[key] ?? key,
      value: strVal,
      isTextoLivre: key === "texto_livre",
      isProblemas:  key === "problemas",
    });
  }

  // Ordem: problemas primeiro → meio → texto_livre por último
  return [
    ...result.filter((r) => r.isProblemas),
    ...result.filter((r) => !r.isProblemas && !r.isTextoLivre),
    ...result.filter((r) => r.isTextoLivre),
  ];
}

function RespostasDetail({
  formRespostas,
  detalhesFunil,
}: {
  formRespostas: Record<string, unknown> | null;
  detalhesFunil: Record<string, unknown> | null;
}) {
  const campos = buildCamposVisiveis(formRespostas, detalhesFunil);

  if (campos.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Nenhuma resposta registrada.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {campos.map(({ key, label, value, isTextoLivre, isProblemas }) => (
          <div
            key={key}
            className={cn(
              "rounded-md bg-muted/20 px-3 py-2",
              (isProblemas || isTextoLivre) && "sm:col-span-2"
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
              {label}
            </p>
            <p className={cn("text-sm text-foreground", isTextoLivre && "italic")}>
              {isTextoLivre ? `"${value}"` : value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Hook de dados ────────────────────────────────────────────────────────────

function useFormLeads(organizationId: string | undefined) {
  const qc = useQueryClient();
  const qk = ["form_leads", organizationId];

  const query = useQuery<FormLead[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!organizationId) return [];
      // Filtra APENAS por stage_id = 'formulario' para evitar duplicatas.
      // O .or() anterior (stage_id | source) retornava o mesmo lead duas vezes
      // quando ambos os critérios eram verdadeiros. Agora stage_id é a fonte
      // de verdade — o n8n sempre seta stage_id='formulario' ao inserir.
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id,name,company,email,phone,source,nicho,cidade,servico," +
          "score_qualificacao,classificacao_lead," +
          "briefing_ia,utm_source,utm_medium,utm_campaign," +
          "form_respostas,detalhes_funil," +
          "etapa_kanban,stage_id,created_at,metadata"
        )
        .eq("organization_id", organizationId)
        .eq("stage_id", "formulario")
        .order("score_qualificacao", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Deduplicação defensiva por id — garante que nunca há linha duplicada
      // mesmo que a query retorne resultados inesperados.
      const seen = new Set<string>();
      const deduped = (data ?? []).filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      return deduped as FormLead[];
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  // ── Promover para CRM ─────────────────────────────────────────────────────
  const promover = useMutation({
    mutationFn: async (lead: FormLead) => {
      const { error } = await supabase
        .from("leads")
        .update({ etapa_kanban: "leads_recebidos", stage_id: "leads_recebidos" })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // ── Descartar (move para desqualificado) ──────────────────────────────────
  const descartar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leads")
        .update({ etapa_kanban: "desqualificado", stage_id: "desqualificado" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // ── Excluir permanentemente ───────────────────────────────────────────────
  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk });

  return { ...query, promover, descartar, excluir, invalidate };
}

// ─── Componentes auxiliares do modal ─────────────────────────────────────────

/** Card genérico de informação — sempre exibe o campo, mostra "Não informado" se vazio */
function InfoCard({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-md bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </p>
      <p className={cn("text-sm font-medium break-words", !value && "text-muted-foreground italic")}>
        {value || "Não informado"}
      </p>
    </div>
  );
}

/**
 * Exibe como o lead chegou (cta_origem) com informações detalhadas:
 * - "whatsapp"    → banner verde indicando que o lead iniciou conversa por conta própria
 * - "agendamento" → exibe modalidade, dias da semana, turno e data solicitada
 * - outros/null   → sem banner (silencioso)
 *
 * Compatível com:
 *  - Universal v2: detalhes_funil = { cta_origem, agendamento: { modalidade, dias_semana, data_solicitacao }, ...funil }
 *  - GMN antigo:   detalhes_funil = { cta_origem, agendamento_modalidade, agendamento_dias_semana, agendamento_data_solicitacao }
 *
 * O campo dias_semana do GMN vem formatado como "Segunda (Manhã), Quarta (Tarde)"
 * — o turno já está embutido. Exibimos separado quando conseguimos extrair.
 */
function CtaOrigemCard({ detalhesFunil }: { detalhesFunil: Record<string, unknown> | null }) {
  if (!detalhesFunil) return null;

  const ctaOrigem = (detalhesFunil.cta_origem as string | undefined) ?? null;

  // Sub-objeto estruturado (Universal v2)
  const agendamentoObj = detalhesFunil.agendamento as Record<string, string> | undefined;

  // Campos planos — fallback para GMN antigo
  const modalidade = agendamentoObj?.modalidade
    ?? (detalhesFunil.agendamento_modalidade as string | undefined)
    ?? null;

  const diasSemanaRaw = agendamentoObj?.dias_semana
    ?? (detalhesFunil.agendamento_dias_semana as string | undefined)
    ?? null;

  const dataStr = agendamentoObj?.data_solicitacao
    ?? (detalhesFunil.agendamento_data_solicitacao as string | undefined)
    ?? null;

  // Extrai turno do campo dias_semana quando está embutido no formato "Dia (Período)"
  // Ex: "Segunda (Manhã), Quarta (Tarde)" → turno = "Manhã / Tarde" ou só o primeiro
  let diasSemana = diasSemanaRaw;
  let turno: string | null = null;
  if (diasSemanaRaw) {
    const periodos = [...diasSemanaRaw.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
    if (periodos.length > 0) {
      // Turno único ou ambos
      const unique = [...new Set(periodos)];
      turno = unique.join(" e ");
      // Remove os períodos do campo de dias para evitar redundância
      diasSemana = diasSemanaRaw.replace(/\s*\([^)]+\)/g, "").trim();
    }
  }

  let dataFormatada: string | null = null;
  if (dataStr) {
    try {
      dataFormatada = format(parseISO(dataStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      dataFormatada = dataStr;
    }
  }

  if (ctaOrigem === "whatsapp") {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 flex items-start gap-3">
        <MessageCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-400">Lead iniciou a conversa pelo WhatsApp</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Este lead clicou no botão WhatsApp por conta própria — prioridade máxima de atendimento.
          </p>
        </div>
      </div>
    );
  }

  if (ctaOrigem === "agendamento") {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Agendamento solicitado
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <InfoCard label="Modalidade de contato" value={modalidade} />
          <InfoCard label="Dias disponíveis" value={diasSemana} />
          <InfoCard label="Turno preferido" value={turno} />
          <InfoCard label="Data da solicitação" value={dataFormatada} />
        </div>
      </div>
    );
  }

  // formulario ou null — sem banner, silencioso
  return null;
}

// ─── Modal de tratamento do lead ──────────────────────────────────────────────

interface LeadTreatmentModalProps {
  lead: FormLead | null;
  onClose: () => void;
  onPromover: (lead: FormLead) => void;
  onDescartar: (lead: FormLead) => void;
  onExcluir: (lead: FormLead) => void;
  isPending: boolean;
}

function LeadTreatmentModal({
  lead,
  onClose,
  onPromover,
  onDescartar,
  onExcluir,
  isPending,
}: LeadTreatmentModalProps) {
  const [confirmExcluir, setConfirmExcluir] = useState(false);

  const cfg = classifConfig(lead?.classificacao_lead ?? null);
  const respostas = (lead?.form_respostas ?? null) as Record<string, unknown> | null;
  const detalhesFunil = (lead?.detalhes_funil ?? null) as Record<string, unknown> | null;
  const canal = [lead?.utm_source, lead?.utm_medium].filter(Boolean).join(" / ") || lead?.source || "—";
  const podePromover =
    lead?.classificacao_lead === "ULTRA_QUENTE" ||
    lead?.classificacao_lead === "QUENTE" ||
    lead?.classificacao_lead === "MORNO";

  // Detecta se briefing_ia é JSON bruto (campo mal preenchido pelo n8n) e ignora
  const briefingTexto = (() => {
    const raw = lead?.briefing_ia;
    if (!raw) return null;
    const trimmed = raw.trim();
    // Se começa com { ou [ é JSON — não exibe como briefing
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return null;
    return trimmed;
  })();

  return (
    <Dialog open={!!lead} onOpenChange={(o) => { if (!o) { setConfirmExcluir(false); onClose(); } }}>
      <DialogContent className="sm:max-w-2xl border-border bg-card p-0 gap-0 overflow-hidden">
        {/* Guard — não renderiza conteúdo se lead for null (modal animando fechamento) */}
        {lead && (
        <>
        {/* Cabeçalho */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <DialogTitle className="text-xl font-bold truncate">{lead.name}</DialogTitle>
              {lead.company && lead.company !== lead.name && (
                <p className="text-sm text-muted-foreground truncate">{lead.company}</p>
              )}
              {(lead.cidade || lead.servico) && (
                <p className="text-xs text-muted-foreground">
                  {[lead.cidade, lead.servico].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <Badge variant="outline" className={cn("gap-1 text-xs shrink-0 mt-0.5", cfg.className)}>
              {cfg.icon} {cfg.label}
            </Badge>
          </div>

          {/* Score + contatos */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {lead.score_qualificacao !== null && (
              <div className="flex items-center gap-1.5 rounded-full bg-muted/30 border border-border px-3 py-1 text-xs">
                <span className="font-bold tabular-nums text-foreground">{lead.score_qualificacao}</span>
                <span className="text-muted-foreground">/17 pontos</span>
              </div>
            )}
            {lead.phone && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10"
                onClick={() => window.open(`https://wa.me/${lead.phone?.replace(/\D/g, "")}`, "_blank")}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {lead.phone}
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Button>
            )}
            {lead.email && (
              <span className="text-xs text-muted-foreground">{lead.email}</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              Recebido {formatDistanceToNow(parseISO(lead.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
        </DialogHeader>

        <Separator />

        <ScrollArea className="max-h-[60vh]">
          <div className="px-6 py-4 space-y-5">

            {/* ── 1. Informações de contato e origem ─────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Informações de contato e origem
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <InfoCard label="Nome" value={lead.name} />
                <InfoCard label="Telefone / WhatsApp" value={lead.phone} />
                <InfoCard label="E-mail" value={lead.email} />
                <InfoCard label="Cidade" value={lead.cidade} />
                <InfoCard label="Serviço de interesse" value={lead.servico} />
                <InfoCard label="Canal" value={canal} />
                {lead.utm_campaign && <InfoCard label="Campanha" value={lead.utm_campaign} />}
                {lead.nicho && <InfoCard label="Nicho" value={lead.nicho} />}
                <InfoCard
                  label="Recebido em"
                  value={format(parseISO(lead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                />
              </div>
            </div>

            {/* ── 2. Como chegou: WhatsApp ou Agendamento ─────────────────── */}
            <CtaOrigemCard detalhesFunil={detalhesFunil} />

            {/* ── 3. Briefing da IA ───────────────────────────────────────── */}
            {briefingTexto && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Briefing da IA
                </p>
                <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 px-4 py-3">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {briefingTexto}
                  </p>
                </div>
              </div>
            )}

            {/* ── 4. Dados do formulário / funil ──────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Dados do formulário
              </p>
              <RespostasDetail formRespostas={respostas} detalhesFunil={detalhesFunil} />
            </div>

            {/* Confirmação de exclusão */}
            {confirmExcluir && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-destructive">Excluir permanentemente?</p>
                <p className="text-xs text-muted-foreground">
                  O lead <strong>{lead.name}</strong> será removido da base de dados e não poderá ser recuperado.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmExcluir(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    disabled={isPending}
                    onClick={() => onExcluir(lead)}
                  >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                    Confirmar exclusão
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Rodapé de ações */}
        <DialogFooter className="px-6 py-4 flex flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setConfirmExcluir(true)}
              disabled={isPending || confirmExcluir}
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onDescartar(lead)}
              disabled={isPending}
            >
              <XCircle className="h-3.5 w-3.5" /> Descartar
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
              Fechar
            </Button>
            <Button
              size="sm"
              className={cn(
                "gap-1.5",
                podePromover
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-0 hover:opacity-90"
                  : "opacity-50 cursor-not-allowed"
              )}
              onClick={() => podePromover && onPromover(lead)}
              disabled={!podePromover || isPending}
              title={!podePromover ? "Apenas leads Morno, Quente ou Ultra Quente podem ser promovidos" : undefined}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Mover para CRM
            </Button>
          </div>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FormLeadsTab() {
  const orgId = useOrganization();
  const { data: leads = [], isLoading, invalidate, promover, descartar, excluir } = useFormLeads(orgId);

  const [search, setSearch] = useState("");
  const [filterClassif, setFilterClassif] = useState<Classificacao | "TODOS">("TODOS");

  // Modal de tratamento
  const [treatLead, setTreatLead] = useState<FormLead | null>(null);

  // Dialogs de confirmação rápida da lista (sem abrir o modal completo)
  const [descartarTarget, setDescartarTarget] = useState<FormLead | null>(null);
  const [excluirTarget, setExcluirTarget] = useState<FormLead | null>(null);

  const anyPending = promover.isPending || descartar.isPending || excluir.isPending;

  // ── Filtragem ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filterClassif !== "TODOS" && l.classificacao_lead !== filterClassif) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          l.name.toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q) ||
          (l.phone ?? "").includes(q) ||
          (l.nicho ?? "").toLowerCase().includes(q) ||
          (l.company ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [leads, filterClassif, search]);

  // Contadores por classificação (sobre todos os leads, não só o filtro atual)
  const counts = useMemo(() => {
    return FILTERS.slice(1).reduce(
      (acc, f) => {
        acc[f.value as string] = leads.filter((l) => l.classificacao_lead === f.value).length;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [leads]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handlePromover = async (lead: FormLead) => {
    try {
      await promover.mutateAsync(lead);
      toast.success(`${lead.name} movido para Leads Recebidos no CRM.`);
      setTreatLead(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao promover lead.");
    }
  };

  const handleDescartar = async (lead: FormLead) => {
    try {
      await descartar.mutateAsync(lead.id);
      toast.success(`${lead.name} descartado.`);
      setTreatLead(null);
      setDescartarTarget(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao descartar lead.");
    }
  };

  const handleExcluir = async (lead: FormLead) => {
    try {
      await excluir.mutateAsync(lead.id);
      toast.success(`${lead.name} excluído permanentemente.`);
      setTreatLead(null);
      setExcluirTarget(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir lead.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Leads do Formulário</h2>
          <p className="text-sm text-muted-foreground">
            Leads recebidos via{" "}
            <code className="text-xs bg-muted px-1 rounded">/qualificacao</code> — abra o lead para tratar, promover ao CRM ou descartar.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => invalidate()}>
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {/* Filtros de classificação */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filterClassif === f.value;
          const count = f.value === "TODOS" ? leads.length : (counts[f.value] ?? 0);
          return (
            <button
              key={f.value}
              onClick={() => setFilterClassif(f.value as Classificacao | "TODOS")}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              )}
            >
              {f.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                active ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="max-w-sm">
        <Input
          placeholder="Buscar por nome, e-mail, telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {leads.length === 0
              ? "Nenhum lead recebido pelo formulário ainda."
              : "Nenhum lead neste filtro."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[200px]">Nome / Contato</TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Recebido</TableHead>
                <TableHead className="text-right w-[180px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => {
                const cfg = classifConfig(lead.classificacao_lead);
                const respostas = lead.form_respostas as Record<string, string> | null;
                const segmento = respostas?.segmento ?? lead.nicho ?? "—";
                const canal = [lead.utm_source, lead.utm_medium].filter(Boolean).join(" / ") || lead.source || "—";

                return (
                  <TableRow
                    key={lead.id}
                    className="border-border/60 cursor-pointer hover:bg-muted/10"
                    onClick={() => setTreatLead(lead)}
                  >
                    <TableCell>
                      <p className="font-semibold text-foreground text-sm leading-tight">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.phone ?? lead.email ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("gap-1 text-[11px]", cfg.className)}>
                        {cfg.icon} {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold tabular-nums">{lead.score_qualificacao ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">/17</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{segmento}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{canal}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(parseISO(lead.created_at), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => setTreatLead(lead)}
                          title="Ver e tratar lead"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Tratar</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => setDescartarTarget(lead)}
                          title="Descartar lead"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => setExcluirTarget(lead)}
                          title="Excluir permanentemente"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Modal de tratamento completo ─────────────────────────────────── */}
      <LeadTreatmentModal
        lead={treatLead}
        onClose={() => setTreatLead(null)}
        onPromover={handlePromover}
        onDescartar={handleDescartar}
        onExcluir={handleExcluir}
        isPending={anyPending}
      />

      {/* ── Dialog: Descartar rápido da lista ───────────────────────────── */}
      <Dialog open={!!descartarTarget} onOpenChange={(o) => { if (!o) setDescartarTarget(null); }}>
        <DialogContent className="sm:max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle>Descartar Lead</DialogTitle>
            <DialogDescription>
              <strong>{descartarTarget?.name}</strong> será movido para{" "}
              <strong>Desqualificado</strong>. Você pode revisá-lo depois na aba de Leads.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescartarTarget(null)} disabled={anyPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => descartarTarget && handleDescartar(descartarTarget)}
              disabled={anyPending}
            >
              {descartar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Excluir rápido da lista ─────────────────────────────── */}
      <Dialog open={!!excluirTarget} onOpenChange={(o) => { if (!o) setExcluirTarget(null); }}>
        <DialogContent className="sm:max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle>Excluir Lead</DialogTitle>
            <DialogDescription>
              <strong>{excluirTarget?.name}</strong> será excluído permanentemente da base de dados.
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluirTarget(null)} disabled={anyPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => excluirTarget && handleExcluir(excluirTarget)}
              disabled={anyPending}
            >
              {excluir.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
