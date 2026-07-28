// src/pages/PropostaWizardPage.tsx
// Wizard de criação guiada de propostas em 5 etapas.
// O estado é mantido no sessionStorage e a proposta só é gravada no banco
// no passo 5 (Resumo), evitando rascunhos incompletos na listagem.

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
import { SECTION_LABELS, SECTION_ORDER, type SectionKey } from "@/types/proposals";
import type { Client } from "@/types/crm";

import { WizardProgress } from "@/components/propostas/wizard/WizardProgress";
import { StepCliente }    from "@/components/propostas/wizard/StepCliente";
import { StepServicos }   from "@/components/propostas/wizard/StepServicos";
import { StepProposta }   from "@/components/propostas/wizard/StepProposta";
import { StepSecoes }     from "@/components/propostas/wizard/StepSecoes";
import { StepResumo }     from "@/components/propostas/wizard/StepResumo";
import {
  type WizardState,
  type WizardStepIndex,
  defaultSchedule,
  loadWizardDraft,
  saveWizardDraft,
  clearWizardDraft,
} from "@/components/propostas/wizard/wizardTypes";

const sb = supabase as any;

// Seções variáveis por cliente preenchidas no wizard
const CLIENT_SECTION_KEYS: SectionKey[] = [
  "diagnostico",
  "objetivos",
  "estrategia",
  "solucao",
  "escopo",
];

// Seções padrão da agência (vêm do template)
const STANDARD_SECTION_KEYS: SectionKey[] = SECTION_ORDER.filter(
  (k) => !CLIENT_SECTION_KEYS.includes(k)
);

function buildInitialState(): WizardState {
  return {
    client: null,
    services: [],
    planValue: 0,
    title: "",
    heroMessage: "",
    closerWhatsapp: "",
    schedule: defaultSchedule(),
    sections: {},
    visitedSteps: [0],
  };
}

export default function PropostaWizardPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { organizationId } = useAuth();

  const { createProposal } = useProposals(organizationId ?? undefined);
  const { templateOrDefault, isLoading: templateLoading } = useProposalTemplate(
    organizationId ?? undefined
  );
  const { data: allClients = [] } = useClients(organizationId ?? undefined);

  const [step, setStep]     = useState<WizardStepIndex>(0);
  const [state, setState]   = useState<WizardState>(() => {
    const draft = loadWizardDraft();
    return draft ? { ...buildInitialState(), ...draft } : buildInitialState();
  });
  const [isSaving, setIsSaving] = useState(false);

  // Flags de inicialização
  const templateApplied = useRef(false);
  const leadApplied     = useRef(false);

  // ── 1. Aplica template assim que carrega ──────────────────────────────────
  useEffect(() => {
    if (templateLoading || templateApplied.current) return;
    templateApplied.current = true;

    setState((prev) => {
      // Só aplica se o draft não tinha seções já salvas
      const hasDraftSections = Object.keys(prev.sections).length > 0;

      const standardSections: WizardState["sections"] = hasDraftSections
        ? prev.sections
        : STANDARD_SECTION_KEYS.reduce<WizardState["sections"]>((acc, key) => {
            const tpl = templateOrDefault.default_sections[key];
            if (tpl) acc[key] = { content: tpl.content, is_visible: tpl.is_visible };
            return acc;
          }, {});

      return {
        ...prev,
        // Cronograma padrão do template (só se ainda não tinha valor)
        schedule: {
          ...prev.schedule,
          recurrence:   templateOrDefault.default_recurrence,
          installments: templateOrDefault.default_installments,
          dueDay:       templateOrDefault.default_due_day,
        },
        sections: standardSections,
      };
    });
  }, [templateLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Pré-preenche cliente via lead_id na URL ────────────────────────────
  useEffect(() => {
    const leadId = searchParams.get("lead_id");
    if (!leadId || leadApplied.current || allClients.length === 0) return;
    leadApplied.current = true;

    (async () => {
      try {
        const { data } = await sb
          .from("leads")
          .select("name, company, phone, client_id")
          .eq("id", leadId)
          .single();

        if (!data) return;
        const d = data as Record<string, unknown>;

        // Tenta encontrar o cliente já cadastrado
        const matched = d.client_id
          ? allClients.find((c) => c.id === d.client_id) ?? null
          : null;

        setState((prev) => ({
          ...prev,
          client: matched,
          closerWhatsapp: prev.closerWhatsapp || (d.phone as string) || "",
          title: prev.title || (matched ? `Proposta ${matched.name}` : ""),
        }));

        // Se o cliente foi encontrado, avança direto para serviços
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

  // ── 3. Persiste rascunho no sessionStorage a cada mudança ─────────────────
  useEffect(() => {
    saveWizardDraft(state);
  }, [state]);

  // ── Helpers de state ──────────────────────────────────────────────────────
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
    const next = Math.min(step + 1, 4) as WizardStepIndex;
    goToStep(next);
  }

  // ── Auto-preenche título ao selecionar cliente ────────────────────────────
  function handleSelectClient(client: Client) {
    setState((prev) => ({
      ...prev,
      client,
      title: prev.title.trim() ? prev.title : `Proposta ${client.name}`,
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
        title:     state.title,
      });
      const proposalId = created.id;
      const orgId      = organizationId;

      // 2. Atualiza campos do hero + cronograma
      await sb.from("proposals").update({
        // Hero do template (já herdado via criação, sobrescreve os variáveis)
        hero_logo_url:        templateOrDefault.hero_logo_url,
        hero_image_url:       templateOrDefault.hero_image_url,
        hero_title:           templateOrDefault.hero_title || state.title,
        hero_subtitle:        templateOrDefault.hero_subtitle,
        hero_video_url:       templateOrDefault.hero_video_url,
        hero_whatsapp_text:   templateOrDefault.hero_whatsapp_text,
        hero_cta_text:        templateOrDefault.hero_cta_text,
        hero_cta_color:       templateOrDefault.hero_cta_color,
        // Campos variáveis por proposta
        hero_message:         state.heroMessage || null,
        hero_whatsapp_number: state.closerWhatsapp || null,
        plan_value:           state.planValue || state.services.filter(s => !s.is_bonus).reduce((s, i) => s + i.value, 0),
        schedule:             state.schedule,
        title:                state.title,
      }).eq("id", proposalId);

      // 3. Serviços
      if (state.services.length > 0) {
        await sb.from("proposal_services").insert(
          state.services.map((s, i) => ({
            proposal_id:     proposalId,
            organization_id: orgId,
            name:            s.name,
            description:     s.description,
            value:           s.value,
            is_bonus:        s.is_bonus,
            sort_order:      i,
          }))
        );
      }

      // 4. Seções — mescla template (padrão) + wizard (variáveis)
      const allSectionEntries: Record<string, { content: string; is_visible: boolean }> = {};

      // Seções padrão do template
      for (const key of STANDARD_SECTION_KEYS) {
        const tpl = templateOrDefault.default_sections[key];
        allSectionEntries[key] = tpl
          ? { content: tpl.content, is_visible: tpl.is_visible }
          : { content: "", is_visible: true };
      }

      // Seções variáveis preenchidas no wizard
      for (const key of CLIENT_SECTION_KEYS) {
        const entry = state.sections[key];
        allSectionEntries[key] = entry ?? { content: "", is_visible: true };
      }

      const sectionRows = SECTION_ORDER.map((key, idx) => ({
        proposal_id:     proposalId,
        organization_id: orgId,
        section_key:     key,
        title:           SECTION_LABELS[key],
        content:         allSectionEntries[key]?.content ?? "",
        is_visible:      allSectionEntries[key]?.is_visible ?? true,
        section_order:   idx,
      }));

      await sb.from("proposal_sections").insert(sectionRows);

      // 5. Se "criar e enviar", muda status
      if (andSend) {
        await sb.from("proposals").update({ status: "enviada" }).eq("id", proposalId);
        await sb.from("proposal_audit_log").insert({
          organization_id: orgId,
          proposal_id:     proposalId,
          action:          "envio",
          metadata:        { channel: "wizard" },
        });
      }

      clearWizardDraft();

      toast.success(andSend ? "Proposta criada e marcada como enviada!" : "Proposta criada como rascunho!");
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
              if (step > 0) {
                setStep((step - 1) as WizardStepIndex);
              } else {
                navigate("/comercial/propostas");
              }
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

        {/* Carregando template */}
        {templateLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Preparando wizard...
          </div>
        )}

        {/* Conteúdo da etapa atual */}
        {!templateLoading && (
          <div className="pb-16">

            {/* ── Etapa 0: Cliente ── */}
            {step === 0 && (
              <StepCliente
                organizationId={org!}
                selectedClient={state.client}
                onSelect={handleSelectClient}
                onNext={advance}
              />
            )}

            {/* ── Etapa 1: Serviços ── */}
            {step === 1 && (
              <div className="space-y-6">
                <StepServicos
                  organizationId={org!}
                  services={state.services}
                  planValue={state.planValue}
                  onServicesChange={(services) => patch({ services })}
                  onPlanValueChange={(planValue) => patch({ planValue })}
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
                  nextLabel="Próximo: Proposta →"
                />
              </div>
            )}

            {/* ── Etapa 2: Proposta ── */}
            {step === 2 && state.client && (
              <div className="space-y-6">
                <StepProposta
                  client={state.client}
                  title={state.title}
                  heroMessage={state.heroMessage}
                  closerWhatsapp={state.closerWhatsapp}
                  schedule={state.schedule}
                  onTitleChange={(title) => patch({ title })}
                  onHeroMessageChange={(heroMessage) => patch({ heroMessage })}
                  onCloserWhatsappChange={(closerWhatsapp) => patch({ closerWhatsapp })}
                  onScheduleChange={(schedule) => patch({ schedule })}
                />
                <NavButtons
                  onBack={() => setStep(1)}
                  onNext={() => {
                    if (!state.title.trim()) {
                      toast.error("Informe o título da proposta.");
                      return;
                    }
                    if (!state.closerWhatsapp.trim()) {
                      toast.error("Informe o WhatsApp do closer.");
                      return;
                    }
                    advance();
                  }}
                  nextLabel="Próximo: Seções →"
                />
              </div>
            )}

            {/* ── Etapa 3: Seções ── */}
            {step === 3 && state.client && (
              <StepSecoes
                client={state.client}
                services={state.services}
                sections={state.sections}
                onSectionsChange={(sections) => patch({ sections })}
                onNext={advance}
              />
            )}

            {/* ── Etapa 4: Resumo ── */}
            {step === 4 && (
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
