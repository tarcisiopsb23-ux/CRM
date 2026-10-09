// src/pages/PropostaWizardPage.tsx
// Wizard de criação guiada de propostas em 6 etapas.
// A proposta só é gravada no banco no step 5 (Revisão), evitando rascunhos
// incompletos na listagem.
//
// Steps:
//   0 — Cliente
//   1 — Serviços
//   2 — Aparência (hero completo)
//   3 — Financeiro (título + cronograma)
//   4 — Conteúdo  (seções por cliente + padrão da agência)
//   5 — Revisão

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useProposals } from "@/hooks/useProposals";
import { useProposalTemplate } from "@/hooks/useProposalTemplate";
import { useClients } from "@/hooks/useClients";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import type { ServiceCatalogItem } from "@/types/contracts";
import { SECTION_LABELS, SECTION_ORDER, type SectionKey } from "@/types/proposals";
import type { Client } from "@/types/crm";
import type { Proposal } from "@/types/proposals";

import { WizardProgress }  from "@/components/propostas/wizard/WizardProgress";
import { StepCliente }     from "@/components/propostas/wizard/StepCliente";
import { StepServicos }    from "@/components/propostas/wizard/StepServicos";
import { StepAparencia }   from "@/components/propostas/wizard/StepAparencia";
import { StepProposta }    from "@/components/propostas/wizard/StepProposta";
import { StepSecoes }      from "@/components/propostas/wizard/StepSecoes";
import { StepResumo }      from "@/components/propostas/wizard/StepResumo";
import {
  type WizardState,
  type WizardStepIndex,
  type WizardServiceDraft,
  defaultSchedule,
  loadWizardDraft,
  saveWizardDraft,
  clearWizardDraft,
} from "@/components/propostas/wizard/wizardTypes";

const sb = supabase as unknown as {
  from: (t: string) => Record<string, unknown>;
};

// Alias tipado para usar supabase sem ruído de tipos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sba = supabase as any;

// Campos do hero vindos de Proposal
type HeroFields = Pick<
  Proposal,
  | "hero_logo_url" | "hero_title" | "hero_subtitle" | "hero_message"
  | "hero_video_url" | "hero_image_url"
  | "hero_whatsapp_text" | "hero_whatsapp_number"
  | "hero_cta_text" | "hero_cta_color"
>;

// Seções variáveis por cliente preenchidas no wizard
const CLIENT_SECTION_KEYS: SectionKey[] = [
  "diagnostico", "objetivos", "estrategia", "solucao", "escopo",
];

// Seções padrão da agência (pré-preenchidas pelo template)
const AGENCY_SECTION_KEYS: SectionKey[] = [
  "apresentacao", "metodologia", "diferenciais", "cases",
  "depoimentos", "faq", "garantias", "consideracoes_finais",
];

const ALL_WIZARD_SECTIONS: SectionKey[] = [
  ...CLIENT_SECTION_KEYS,
  ...AGENCY_SECTION_KEYS,
];

// Seções que NÃO aparecem no wizard (ex: "cronograma" que é do field schedule)
const WIZARD_EXCLUDED: SectionKey[] = ["cronograma"];

// ─── Helpers para geração automática das seções solucao e escopo ─────────────

/**
 * Gera o JSON da seção "solucao" a partir dos serviços selecionados.
 * Formato: [{ titulo: string, itens: string[] }]
 *   titulo = nome do serviço
 *   itens  = scope do catálogo dividido por "\n" ou ";" — ou entregáveis incluídos se não houver scope
 */
function buildSolucaoJson(
  services: WizardServiceDraft[],
  catalog: ServiceCatalogItem[],
): string {
  const blocks = services
    .filter((s) => !s.is_bonus)
    .map((s) => {
      const cat = s.catalog_id ? catalog.find((c) => c.id === s.catalog_id) : null;

      // Itens: usa scope do catálogo se existir, senão usa os entregáveis incluídos
      let itens: string[] = [];

      if (cat?.scope) {
        // scope pode vir como texto livre com quebras de linha ou ponto-e-vírgula
        itens = cat.scope
          .split(/[\n;]/)
          .map((i) => i.trim())
          .filter((i) => i.length > 0);
      } else if (cat?.deliverables && cat.deliverables.length > 0) {
        const includedIds: Set<string> =
          s.deliverables_included === undefined
            ? new Set(cat.deliverables.map((d) => d.id))
            : new Set(s.deliverables_included);

        itens = cat.deliverables
          .filter((d) => includedIds.has(d.id))
          .map((d) => d.name);
      }

      return { titulo: s.name, itens };
    });

  return JSON.stringify(blocks);
}

/**
 * Gera o JSON da seção "escopo" a partir dos serviços selecionados.
 * Formato: [{ modulo: string, descricao?: string, entregaveis: string[] }]
 *   modulo      = nome do serviço
 *   descricao   = description_text do catálogo (descrição estratégica)
 *   entregaveis = nomes dos entregáveis incluídos para esta proposta
 */
function buildEscopoJson(
  services: WizardServiceDraft[],
  catalog: ServiceCatalogItem[],
): string {
  const modules = services
    .filter((s) => !s.is_bonus)
    .map((s) => {
      const cat = s.catalog_id ? catalog.find((c) => c.id === s.catalog_id) : null;

      const entregaveis: string[] = [];

      if (cat?.deliverables && cat.deliverables.length > 0) {
        const includedIds: Set<string> =
          s.deliverables_included === undefined
            ? new Set(cat.deliverables.map((d) => d.id))
            : new Set(s.deliverables_included);

        cat.deliverables
          .filter((d) => includedIds.has(d.id))
          .forEach((d) => entregaveis.push(d.name));
      }

      return {
        modulo:      s.name,
        descricao:   cat?.description_text ?? undefined,
        entregaveis,
      };
    });

  return JSON.stringify(modules);
}

function buildInitialState(): WizardState {
  return {
    // Step 0
    client: null,
    // Step 1
    services: [],
    planValue: 0,
    // Step 2 — aparência
    heroLogoUrl: null,
    heroImageUrl: null,
    heroVideoUrl: null,
    heroTitle: "",
    heroSubtitle: "",
    heroMessage: "",
    heroWhatsappNumber: "",
    heroWhatsappText: "Falar no WhatsApp",
    heroCtaText: "Iniciar Projeto",
    heroCtaColor: "#7c3aed",
    // Step 3 — financeiro
    title: "",
    schedule: defaultSchedule(),
    // Step 4 — conteúdo
    sections: {},
    // Controle
    visitedSteps: [0],
  };
}

// Converte campos do WizardState para o formato HeroFields do PropostaHeroEditor
function stateToHeroFields(state: WizardState): Partial<HeroFields> {
  return {
    hero_logo_url:        state.heroLogoUrl,
    hero_image_url:       state.heroImageUrl,
    hero_video_url:       state.heroVideoUrl,
    hero_title:           state.heroTitle,
    hero_subtitle:        state.heroSubtitle,
    hero_message:         state.heroMessage,
    hero_whatsapp_number: state.heroWhatsappNumber,
    hero_whatsapp_text:   state.heroWhatsappText,
    hero_cta_text:        state.heroCtaText,
    hero_cta_color:       state.heroCtaColor,
  };
}

// Converte HeroFields de volta para os campos do WizardState
function heroFieldsToStatePatch(fields: Partial<HeroFields>): Partial<WizardState> {
  return {
    heroLogoUrl:        fields.hero_logo_url   ?? null,
    heroImageUrl:       fields.hero_image_url  ?? null,
    heroVideoUrl:       fields.hero_video_url  ?? null,
    heroTitle:          fields.hero_title      ?? "",
    heroSubtitle:       fields.hero_subtitle   ?? "",
    heroMessage:        fields.hero_message    ?? "",
    heroWhatsappNumber: fields.hero_whatsapp_number ?? "",
    heroWhatsappText:   fields.hero_whatsapp_text   ?? "Falar no WhatsApp",
    heroCtaText:        fields.hero_cta_text   ?? "Iniciar Projeto",
    heroCtaColor:       fields.hero_cta_color  ?? "#7c3aed",
  };
}

export default function PropostaWizardPage() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const { organizationId } = useAuth();

  const { createProposal } = useProposals(organizationId ?? undefined);
  const { templateOrDefault, isLoading: templateLoading } = useProposalTemplate(
    organizationId ?? undefined
  );
  const { data: allClients = [] } = useClients(organizationId ?? undefined);
  const { services: catalogServices } = useServiceCatalog(organizationId ?? undefined);

  const [step, setStep]   = useState<WizardStepIndex>(0);
  const [state, setState] = useState<WizardState>(() => {
    const draft = loadWizardDraft();
    return draft ? { ...buildInitialState(), ...draft } : buildInitialState();
  });
  const [isSaving, setIsSaving] = useState(false);

  const templateApplied = useRef(false);
  const leadApplied     = useRef(false);

  // ── 1. Aplica template assim que carrega ──────────────────────────────────
  useEffect(() => {
    if (templateLoading || templateApplied.current) return;
    templateApplied.current = true;

    setState((prev) => {
      const hasDraftSections = Object.keys(prev.sections).length > 0;
      const hasHero = prev.heroCtaColor !== "#7c3aed" || prev.heroTitle !== "";

      // Seções padrão da agência do template
      const agencySections = hasDraftSections
        ? {}
        : AGENCY_SECTION_KEYS.reduce<WizardState["sections"]>((acc, key) => {
            const tpl = templateOrDefault.default_sections[key];
            if (tpl) acc[key] = { content: tpl.content, is_visible: tpl.is_visible };
            return acc;
          }, {});

      return {
        ...prev,
        // Hero do template — só aplica se o usuário não personalizou ainda
        ...(!hasHero ? heroFieldsToStatePatch({
          hero_logo_url:        templateOrDefault.hero_logo_url,
          hero_image_url:       templateOrDefault.hero_image_url,
          hero_title:           templateOrDefault.hero_title,
          hero_subtitle:        templateOrDefault.hero_subtitle,
          hero_message:         templateOrDefault.hero_message,
          hero_video_url:       templateOrDefault.hero_video_url,
          hero_whatsapp_text:   templateOrDefault.hero_whatsapp_text,
          hero_whatsapp_number: templateOrDefault.hero_whatsapp_number,
          hero_cta_text:        templateOrDefault.hero_cta_text,
          hero_cta_color:       templateOrDefault.hero_cta_color,
        }) : {}),
        // Cronograma padrão do template
        schedule: {
          ...prev.schedule,
          recurrence:   templateOrDefault.default_recurrence,
          installments: templateOrDefault.default_installments,
          dueDay:       templateOrDefault.default_due_day,
        },
        sections: hasDraftSections ? prev.sections : agencySections,
      };
    });
  }, [templateLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Pré-preenche via lead_id na URL ───────────────────────────────────
  useEffect(() => {
    const leadId = searchParams.get("lead_id");
    if (!leadId || leadApplied.current || allClients.length === 0) return;
    leadApplied.current = true;

    (async () => {
      try {
        const { data } = await sba
          .from("leads")
          .select("name, company, phone, client_id")
          .eq("id", leadId)
          .single();

        if (!data) return;
        const d = data as Record<string, unknown>;
        const matched = d.client_id
          ? allClients.find((c) => c.id === d.client_id) ?? null
          : null;

        setState((prev) => ({
          ...prev,
          client:             matched,
          heroWhatsappNumber: prev.heroWhatsappNumber || (d.phone as string) || "",
          title:              prev.title || (matched ? `Proposta ${matched.name}` : ""),
          heroTitle:          prev.heroTitle || (matched ? `Uma proposta para ${matched.name}` : ""),
        }));

        if (matched) {
          setStep(1);
          setState((prev) => ({
            ...prev,
            visitedSteps: Array.from(new Set([...prev.visitedSteps, 0, 1])),
          }));
        }
      } catch { /* silent */ }
    })();
  }, [allClients]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2b. Pré-preenche via client_id na URL ────────────────────────────────
  // Acionado quando o botão "Nova Proposta" no cadastro do cliente passa ?client_id=
  useEffect(() => {
    const clientIdParam = searchParams.get("client_id");
    if (!clientIdParam || allClients.length === 0) return;

    const matched = allClients.find((c) => String(c.id) === String(clientIdParam)) ?? null;
    if (!matched) return;

    setState((prev) => {
      // Não sobrescreve se o cliente já foi definido (ex: lead_id também presente)
      if (prev.client) return prev;
      return {
        ...prev,
        client:    matched,
        title:     prev.title || `Proposta ${matched.company || matched.name}`,
        heroTitle: prev.heroTitle || `Uma proposta para ${matched.company || matched.name}`,
        visitedSteps: Array.from(new Set([...prev.visitedSteps, 0])),
      };
    });

    // Avança automaticamente para o Step 1 (Serviços) pois o cliente já está definido
    setStep((prev) => (prev === 0 ? 1 : prev));
  }, [allClients, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Persiste rascunho no sessionStorage ────────────────────────────────
  useEffect(() => {
    saveWizardDraft(state);
  }, [state]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function patch(partial: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function goToStep(next: WizardStepIndex) {
    setStep(next);
    setState((prev) => ({
      ...prev,
      visitedSteps: Array.from(new Set([...prev.visitedSteps, next])),
    }));
  }

  function advance() {
    const next = Math.min(step + 1, 5) as WizardStepIndex;
    goToStep(next);
  }

  function handleSelectClient(client: Client) {
    setState((prev) => ({
      ...prev,
      client,
      title:     prev.title.trim()     ? prev.title     : `Proposta ${client.name}`,
      heroTitle: prev.heroTitle.trim() ? prev.heroTitle : `Uma proposta pensada para ${client.name}`,
    }));
  }

  // ── Save no banco ─────────────────────────────────────────────────────────
  async function saveProposal(andSend: boolean) {
    if (!organizationId || !state.client) return;
    setIsSaving(true);

    try {
      // 1. Cria a proposta base
      const created = await createProposal.mutateAsync({
        client_id: state.client.id,
        title:     state.title || `Proposta ${state.client.name}`,
      });
      const proposalId = created.id;
      const orgId      = organizationId;

      // Valor do plano: usa planValue se definido, senão soma dos serviços
      const effectivePlan = state.planValue > 0
        ? state.planValue
        : state.services.filter(s => !s.is_bonus).reduce((s, i) => s + i.value, 0);

      // 2. Atualiza todos os campos do hero + cronograma + título
      await sba.from("proposals").update({
        title:                state.title || `Proposta ${state.client.name}`,
        hero_logo_url:        state.heroLogoUrl   || null,
        hero_image_url:       state.heroImageUrl  || null,
        hero_video_url:       state.heroVideoUrl  || null,
        hero_title:           state.heroTitle     || state.title || `Proposta ${state.client.name}`,
        hero_subtitle:        state.heroSubtitle  || null,
        hero_message:         state.heroMessage   || null,
        hero_whatsapp_number: state.heroWhatsappNumber || null,
        hero_whatsapp_text:   state.heroWhatsappText   || "Falar no WhatsApp",
        hero_cta_text:        state.heroCtaText   || "Iniciar Projeto",
        hero_cta_color:       state.heroCtaColor  || "#7c3aed",
        plan_value:           effectivePlan,
        schedule:             state.schedule,
      }).eq("id", proposalId);

      // 3. Serviços
      if (state.services.length > 0) {
        await sba.from("proposal_services").insert(
          state.services.map((s, i) => {
            // Resolve entregáveis incluídos para esta proposta
            let description = s.description ?? null;

            if (s.catalog_id) {
              const catalogItem = catalogServices.find((c) => c.id === s.catalog_id);
              if (catalogItem && catalogItem.deliverables.length > 0) {
                // Determina quais entregáveis incluir
                const includedIds: Set<string> =
                  s.deliverables_included === undefined
                    ? new Set(catalogItem.deliverables.map((d) => d.id))
                    : new Set(s.deliverables_included);

                const includedNames = catalogItem.deliverables
                  .filter((d) => includedIds.has(d.id))
                  .map((d) => d.name);

                if (includedNames.length > 0) {
                  // Formato: "Descrição do serviço\n\nEntregáveis: item1, item2, ..."
                  const delivStr = `Entregáveis: ${includedNames.join(", ")}`;
                  const combined = description
                    ? `${description}\n\n${delivStr}`
                    : delivStr;
                  // Respeita o limite de 500 chars da coluna description
                  description = combined.length <= 500 ? combined : combined.slice(0, 497) + "…";
                }
              }
            }

            return {
              proposal_id:     proposalId,
              organization_id: orgId,
              name:            s.name,
              description:     description,
              // Garante mínimo de 0.01 para respeitar a constraint do banco
              // (itens bônus ou sem preço definido ficam com valor simbólico)
              value:           Math.max(0.01, s.value),
              is_bonus:        s.is_bonus,
              sort_order:      i,
            };
          })
        );
      }

      // 4. Seções — combina: seções do wizard + template para as que não foram editadas
      //
      // Prioridade para solucao e escopo:
      //   1. JSON gerado automaticamente dos serviços selecionados (se houver serviços)
      //   2. O que o closer preencheu manualmente no Step de Conteúdo
      //   3. Template padrão da organização
      //
      // Para as demais seções a prioridade é: wizardEntry > template.

      // Gera JSON automático a partir dos serviços e entregáveis selecionados
      const hasServices = state.services.filter((s) => !s.is_bonus).length > 0;
      const autoSolucao  = hasServices ? buildSolucaoJson(state.services, catalogServices) : null;
      const autoEscopo   = hasServices ? buildEscopoJson(state.services, catalogServices)  : null;

      const sectionRows = SECTION_ORDER
        .filter(key => !WIZARD_EXCLUDED.includes(key))
        .map((key, idx) => {
          // ── Seções com geração automática ──────────────────────────────────
          if (key === "solucao" && autoSolucao) {
            // Se o closer também preencheu manualmente, usa o manual
            const wizardManual = state.sections[key];
            const content = (wizardManual && wizardManual.content.trim().length > 0)
              ? wizardManual.content
              : autoSolucao;
            return {
              proposal_id:     proposalId,
              organization_id: orgId,
              section_key:     key,
              title:           SECTION_LABELS[key],
              content,
              is_visible:      true,
              section_order:   idx,
            };
          }

          if (key === "escopo" && autoEscopo) {
            const wizardManual = state.sections[key];
            const content = (wizardManual && wizardManual.content.trim().length > 0)
              ? wizardManual.content
              : autoEscopo;
            return {
              proposal_id:     proposalId,
              organization_id: orgId,
              section_key:     key,
              title:           SECTION_LABELS[key],
              content,
              is_visible:      true,
              section_order:   idx,
            };
          }

          // ── Demais seções: wizardEntry > template ──────────────────────────
          const wizardEntry = state.sections[key];
          if (wizardEntry && (wizardEntry.content.trim().length > 0 || !wizardEntry.is_visible)) {
            return {
              proposal_id:     proposalId,
              organization_id: orgId,
              section_key:     key,
              title:           SECTION_LABELS[key],
              content:         wizardEntry.content,
              is_visible:      wizardEntry.is_visible,
              section_order:   idx,
            };
          }
          // Fallback: template padrão da organização
          const tplEntry = templateOrDefault.default_sections[key];
          return {
            proposal_id:     proposalId,
            organization_id: orgId,
            section_key:     key,
            title:           SECTION_LABELS[key],
            content:         tplEntry?.content         ?? "",
            is_visible:      tplEntry?.is_visible      ?? true,
            section_order:   idx,
          };
        });

      await sba.from("proposal_sections").insert(sectionRows);

      // 5. Envio
      if (andSend) {
        await sba.from("proposals")
          .update({ status: "enviada" })
          .eq("id", proposalId);
        await sba.from("proposal_audit_log").insert({
          organization_id: orgId,
          proposal_id:     proposalId,
          action:          "envio",
          metadata:        { channel: "wizard" },
        });
      }

      clearWizardDraft();
      toast.success(
        andSend
          ? "Proposta criada e marcada como enviada!"
          : "Proposta criada como rascunho!"
      );
      navigate(`/comercial/propostas/${proposalId}`);
    } catch (e) {
      toast.error("Erro ao criar proposta. Tente novamente.");
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const org = organizationId ?? undefined;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">

        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (step > 0) setStep((step - 1) as WizardStepIndex);
              else navigate("/comercial/propostas");
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Nova Proposta</h1>
            <p className="text-xs text-muted-foreground">
              Criação guiada — preencha etapa por etapa
            </p>
          </div>
        </div>

        {/* Barra de progresso */}
        <WizardProgress
          currentStep={step}
          visitedSteps={state.visitedSteps}
          onStepClick={goToStep}
        />

        {/* Aguarda template */}
        {templateLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Preparando wizard...
          </div>
        )}

        {!templateLoading && (
          <div className="pb-20">

            {/* ── Step 0: Cliente ── */}
            {step === 0 && (
              <StepCliente
                organizationId={org!}
                selectedClient={state.client}
                onSelect={handleSelectClient}
                onNext={advance}
              />
            )}

            {/* ── Step 1: Serviços ── */}
            {step === 1 && (
              <div className="space-y-6">
                <StepServicos
                  organizationId={org!}
                  services={state.services}
                  onServicesChange={(services) => patch({ services })}
                />
                <NavButtons
                  onBack={() => setStep(0)}
                  onNext={() => {
                    if (state.services.length === 0) {
                      toast.error("Adicione pelo menos um serviço.");
                      return;
                    }
                    advance();
                  }}
                  nextLabel="Próximo: Aparência →"
                />
              </div>
            )}

            {/* ── Step 2: Aparência ── */}
            {step === 2 && state.client && (
              <div className="space-y-6">
                <StepAparencia
                  clientName={state.client.name ?? ""}
                  values={stateToHeroFields(state)}
                  onChange={(fields) => patch(heroFieldsToStatePatch(fields))}
                />
                <NavButtons
                  onBack={() => setStep(1)}
                  onNext={() => {
                    if (!state.heroWhatsappNumber?.trim()) {
                      toast.error("Informe o número de WhatsApp do closer.");
                      return;
                    }
                    advance();
                  }}
                  nextLabel="Próximo: Financeiro →"
                />
              </div>
            )}

            {/* ── Step 3: Financeiro ── */}
            {step === 3 && state.client && (
              <div className="space-y-6">
                <StepProposta
                  client={state.client}
                  title={state.title}
                  heroMessage={state.heroMessage}
                  closerWhatsapp={state.heroWhatsappNumber}
                  schedule={state.schedule}
                  planValue={state.planValue}
                  services={state.services}
                  onTitleChange={(title) => patch({ title })}
                  onHeroMessageChange={(heroMessage) => patch({ heroMessage })}
                  onCloserWhatsappChange={(v) => patch({ heroWhatsappNumber: v })}
                  onScheduleChange={(schedule) => patch({ schedule })}
                  onPlanValueChange={(planValue) => patch({ planValue })}
                  onServicesChange={(services) => patch({ services })}
                />
                <NavButtons
                  onBack={() => setStep(2)}
                  onNext={() => {
                    if (!state.title.trim()) {
                      toast.error("Informe o título da proposta.");
                      return;
                    }
                    advance();
                  }}
                  nextLabel="Próximo: Conteúdo →"
                />
              </div>
            )}

            {/* ── Step 4: Conteúdo ── */}
            {step === 4 && state.client && (
              <StepSecoes
                client={state.client}
                services={state.services}
                sections={state.sections}
                onSectionsChange={(sections) => patch({ sections })}
                onNext={advance}
              />
            )}

            {/* ── Step 5: Revisão ── */}
            {step === 5 && (
              <StepResumo
                state={state}
                isSaving={isSaving}
                onSaveDraft={() => saveProposal(false)}
                onCreateAndSend={() => saveProposal(true)}
                onGoToStep={(s) => goToStep(s as WizardStepIndex)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Botões de navegação reutilizáveis ─────────────────────────────────────────
function NavButtons({
  onBack,
  onNext,
  nextLabel = "Próximo →",
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex justify-between pt-2">
      <Button variant="ghost" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <Button onClick={onNext}>{nextLabel}</Button>
    </div>
  );
}
