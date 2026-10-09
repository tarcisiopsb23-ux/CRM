import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save, Send, Loader2, Eye, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useProposals } from "@/hooks/useProposals";
import { useProposal } from "@/hooks/useProposal";
import { useProposalAI } from "@/hooks/useProposalAI";
import { useProposalTemplate } from "@/hooks/useProposalTemplate";
import { PropostaHeroEditor } from "@/components/propostas/PropostaHeroEditor";
import { PropostaSectionEditor } from "@/components/propostas/PropostaSectionEditor";
import { PropostaServicosEditor, type ServiceDraft } from "@/components/propostas/PropostaServicosEditor";
import { PropostaCronograma } from "@/components/propostas/PropostaCronograma";
import { PropostaEnvioModal } from "@/components/propostas/PropostaEnvioModal";
import { PropostaAIModal } from "@/components/propostas/PropostaAIModal";
import { SECTION_ORDER, SECTION_LABELS } from "@/types/proposals";
import type { Proposal, SectionKey, ScheduleConfig } from "@/types/proposals";

const sb = supabase as any;

// Seções que variam por cliente — aparecem na aba "Proposta"
const CLIENT_SECTION_KEYS: SectionKey[] = [
  "diagnostico",
  "objetivos",
  "estrategia",
  "solucao",
  "escopo",
  "cronograma",
];

// Seções padrão da agência — aparecem na aba "Padrão (template)"
const STANDARD_SECTION_KEYS: SectionKey[] = SECTION_ORDER.filter(
  (k) => !CLIENT_SECTION_KEYS.includes(k)
);

export default function PropostaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { organizationId } = useAuth();
  const isNew = !id;

  const { createProposal, sendProposal } = useProposals(organizationId ?? undefined);
  const { detail, isLoading, updateHero, updateSchedule, upsertServices, upsertSection } =
    useProposal(id);
  const { templateOrDefault, isLoading: templateLoading } = useProposalTemplate(
    organizationId ?? undefined
  );

  const [proposalId, setProposalId] = useState<string | undefined>(id);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");

  // Hero — inicia com os valores do template ao criar nova proposta
  const [heroValues, setHeroValues] = useState<Partial<Proposal>>({});
  const templateApplied = useRef(false);

  const [services, setServices] = useState<ServiceDraft[]>([]);
  const [planValue, setPlanValue] = useState(0);
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);

  const [sections, setSections] = useState<
    Record<SectionKey, { content: string; is_visible: boolean }>
  >(() => {
    const init = {} as Record<SectionKey, { content: string; is_visible: boolean }>;
    for (const key of SECTION_ORDER) init[key] = { content: "", is_visible: true };
    return init;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [envioOpen, setEnvioOpen] = useState(false);

  const { isLoading: aiLoading, result: aiResult, error: aiError, generateSection, reset: resetAI } =
    useProposalAI();
  const [aiSectionKey, setAiSectionKey] = useState<SectionKey | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // ── Pré-carrega template ao criar nova proposta ──────────────────────────
  useEffect(() => {
    if (!isNew || templateLoading || templateApplied.current) return;
    templateApplied.current = true;

    // Hero do template (sem hero_whatsapp_number — é por closer/proposta)
    setHeroValues({
      hero_logo_url: templateOrDefault.hero_logo_url,
      hero_image_url: templateOrDefault.hero_image_url,
      hero_title: templateOrDefault.hero_title,
      hero_subtitle: templateOrDefault.hero_subtitle,
      hero_message: templateOrDefault.hero_message,
      hero_video_url: templateOrDefault.hero_video_url,
      hero_whatsapp_text: templateOrDefault.hero_whatsapp_text,
      hero_cta_text: templateOrDefault.hero_cta_text,
      hero_cta_color: templateOrDefault.hero_cta_color,
    });

    // Seções padrão do template
    setSections((prev) => {
      const next = { ...prev };
      for (const key of STANDARD_SECTION_KEYS) {
        const tplEntry = templateOrDefault.default_sections[key];
        if (tplEntry) {
          next[key] = { content: tplEntry.content, is_visible: tplEntry.is_visible };
        }
      }
      return next;
    });

    // Cronograma padrão do template
    setSchedule((prev) => ({
      firstValue: prev?.firstValue ?? 0,
      firstDate:
        prev?.firstDate ?? new Date().toISOString().split("T")[0],
      dueDay: templateOrDefault.default_due_day,
      recurrence: templateOrDefault.default_recurrence,
      installments: templateOrDefault.default_installments,
    }));
  }, [isNew, templateLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preenche estado ao carregar proposta existente ───────────────────────
  useEffect(() => {
    const leadId = searchParams.get("lead_id");
    if (!leadId || !isNew) return;
    (async () => {
      try {
        const { data } = await sb
          .from("leads")
          .select("name, company, phone, client_id")
          .eq("id", leadId)
          .single();
        if (data) {
          const d = data as Record<string, unknown>;
          if (d.client_id) setClientId(d.client_id as string);
          if (d.name) setClientName(d.name as string);
          if (d.phone)
            setHeroValues((prev) => ({
              ...prev,
              hero_whatsapp_number: d.phone as string,
            }));
        }
      } catch { /* silent */ }
    })();
  }, [searchParams, isNew]);

  useEffect(() => {
    if (!detail) return;
    const { proposal, services: svcs, sections: sects } = detail;
    setTitle(proposal.title);
    setClientId(proposal.client_id);
    setPlanValue(proposal.plan_value);
    setSchedule(proposal.schedule);
    setHeroValues({
      hero_logo_url: proposal.hero_logo_url,
      hero_title: proposal.hero_title,
      hero_subtitle: proposal.hero_subtitle,
      hero_message: proposal.hero_message,
      hero_video_url: proposal.hero_video_url,
      hero_image_url: proposal.hero_image_url,
      hero_whatsapp_text: proposal.hero_whatsapp_text,
      hero_whatsapp_number: proposal.hero_whatsapp_number,
      hero_cta_text: proposal.hero_cta_text,
      hero_cta_color: proposal.hero_cta_color,
    });
    setServices(
      svcs.map((s) => ({
        _key: s.id,
        name: s.name,
        description: s.description,
        value: s.value,
        is_bonus: s.is_bonus,
        sort_order: s.sort_order,
      }))
    );
    setSections((prev) => {
      const next = { ...prev };
      for (const sec of sects) {
        if (next[sec.section_key]) {
          next[sec.section_key] = {
            content: sec.content,
            is_visible: sec.is_visible,
          };
        }
      }
      return next;
    });
  }, [detail]);

  // ── Validação e save ─────────────────────────────────────────────────────

  const validate = () => {
    if (!title.trim()) { toast.error("Informe o título da proposta."); return false; }
    if (!clientId) { toast.error("Informe o ID do cliente."); return false; }
    if (services.length === 0) { toast.error("Adicione pelo menos um serviço."); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      if (isNew) {
        const leadId = searchParams.get("lead_id") ?? undefined;
        const proposal = await createProposal.mutateAsync({
          client_id: clientId,
          title,
          lead_id: leadId,
        });
        const newId = proposal.id;
        setProposalId(newId);
        const orgId = organizationId!;

        await sb
          .from("proposals")
          .update({ ...heroValues, plan_value: planValue, title, schedule })
          .eq("id", newId);

        if (services.length > 0) {
          await sb.from("proposal_services").insert(
            services.map((s, i) => ({
              proposal_id: newId,
              organization_id: orgId,
              name: s.name,
              description: s.description,
              value: s.value,
              is_bonus: s.is_bonus,
              sort_order: i,
            }))
          );
        }

        for (const key of SECTION_ORDER) {
          const sec = sections[key];
          await sb.from("proposal_sections").upsert(
            {
              proposal_id: newId,
              organization_id: orgId,
              section_key: key,
              title: SECTION_LABELS[key],
              content: sec.content,
              is_visible: sec.is_visible,
              section_order: SECTION_ORDER.indexOf(key),
            },
            { onConflict: "proposal_id,section_key" }
          );
        }

        toast.success("Proposta criada!");
        navigate(`/comercial/propostas/${newId}`);
      } else if (proposalId) {
        await updateHero.mutateAsync({ ...heroValues, plan_value: planValue, title });
        await updateSchedule.mutateAsync(schedule);
        await upsertServices.mutateAsync(
          services.map((s, i) => ({
            proposal_id: proposalId,
            organization_id: organizationId!,
            name: s.name,
            description: s.description,
            value: s.value,
            is_bonus: s.is_bonus,
            sort_order: i,
          }))
        );
        for (const key of SECTION_ORDER) {
          await upsertSection.mutateAsync({
            section_key: key,
            content: sections[key].content,
            is_visible: sections[key].is_visible,
          });
        }
        toast.success("Proposta salva!");
      }
    } catch (e) {
      toast.error("Erro ao salvar proposta.");
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAIGenerate = (key: SectionKey) => {
    setAiSectionKey(key);
    setAiModalOpen(true);
    generateSection({
      sectionKey: key,
      clientName: clientName || "Cliente",
      company: clientName || "Empresa",
      services: services.map((s) => ({ name: s.name, value: s.value })),
    });
  };

  const baseUrl =
    (import.meta.env as Record<string, string>).VITE_PROPOSAL_BASE_URL ??
    window.location.origin;
  const publicLink = detail
    ? `${baseUrl}/proposta/${detail.proposal.public_slug}`
    : "";

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/comercial/propostas")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">
              {isNew ? "Nova Proposta" : "Editar Proposta"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {detail?.proposal.title ?? "Preencha os dados abaixo"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && publicLink && (
            <Button variant="outline" size="sm" asChild>
              <a href={publicLink} target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4 mr-1" /> Visualizar
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Salvar Rascunho
          </Button>
          {!isNew && detail && (
            <Button size="sm" onClick={() => setEnvioOpen(true)} disabled={isSaving}>
              <Send className="h-4 w-4 mr-1" /> Enviar
            </Button>
          )}
        </div>
      </div>

      {/* Informações básicas — sempre visíveis (variáveis por cliente) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações da proposta</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Título *</Label>
            <Input
              placeholder="Ex: Proposta Marketing Digital"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>ID do cliente *</Label>
            <Input
              placeholder="UUID do cliente"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Abas separadas: variável por cliente / padrão do template */}
      <Tabs defaultValue="cliente">
        <TabsList className="flex-wrap h-auto gap-1">
          {/* ── Aba variável por cliente ── */}
          <TabsTrigger value="cliente">
            Proposta
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
              por cliente
            </Badge>
          </TabsTrigger>

          {/* ── Aba padrão (template) ── */}
          <TabsTrigger value="padrao">
            <Settings2 className="h-3.5 w-3.5 mr-1.5 opacity-70" />
            Padrão (template)
          </TabsTrigger>

          {/* Sub-abas de apoio acessíveis em qualquer contexto */}
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
        </TabsList>

        {/* ── PROPOSTA (variável por cliente) ── */}
        <TabsContent value="cliente" className="mt-4 space-y-4">
          {/* Hero — campos personalizáveis por cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Personalização do hero
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Mensagem personalizada</Label>
                <textarea
                  rows={3}
                  placeholder="Mensagem de abertura direcionada a este cliente..."
                  value={heroValues.hero_message ?? ""}
                  onChange={(e) =>
                    setHeroValues((prev) => ({
                      ...prev,
                      hero_message: e.target.value || undefined,
                    }))
                  }
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp do closer *</Label>
                <Input
                  placeholder="5511999999999"
                  value={heroValues.hero_whatsapp_number ?? ""}
                  onChange={(e) =>
                    setHeroValues((prev) => ({
                      ...prev,
                      hero_whatsapp_number: e.target.value || undefined,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Número do responsável pela proposta. O cliente clica neste botão para entrar em contato.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Seções variáveis por cliente */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              Seções específicas desta proposta
            </p>
            {CLIENT_SECTION_KEYS.map((key) => (
              <PropostaSectionEditor
                key={key}
                section={{
                  section_key: key,
                  content: sections[key].content,
                  is_visible: sections[key].is_visible,
                }}
                onChange={(content) =>
                  setSections((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], content },
                  }))
                }
                onToggleVisibility={(visible) =>
                  setSections((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], is_visible: visible },
                  }))
                }
                onGenerateAI={() => handleAIGenerate(key)}
                isGeneratingAI={aiLoading && aiSectionKey === key}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── PADRÃO (template) ── */}
        <TabsContent value="padrao" className="mt-4 space-y-4">
          {/* Hero completo — campos que são padrão */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              Hero — campos padrão
            </p>
            <p className="text-xs text-muted-foreground px-1 mb-3">
              Editados nas{" "}
              <button
                className="underline hover:text-foreground transition-colors"
                onClick={() =>
                  navigate("/configuracoes?tab=propostas-template")
                }
              >
                Configurações → Template de Proposta
              </button>
              {" "}e pré-carregados aqui. Ajuste por proposta se necessário.
            </p>
          </div>
          <PropostaHeroEditor values={heroValues} onChange={setHeroValues} />

          {/* Seções padrão da agência */}
          <div className="space-y-3 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              Seções padrão da agência
            </p>
            {STANDARD_SECTION_KEYS.map((key) => (
              <PropostaSectionEditor
                key={key}
                section={{
                  section_key: key,
                  content: sections[key].content,
                  is_visible: sections[key].is_visible,
                }}
                onChange={(content) =>
                  setSections((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], content },
                  }))
                }
                onToggleVisibility={(visible) =>
                  setSections((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], is_visible: visible },
                  }))
                }
                onGenerateAI={() => handleAIGenerate(key)}
                isGeneratingAI={aiLoading && aiSectionKey === key}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── SERVIÇOS ── */}
        <TabsContent value="servicos" className="mt-4">
          <PropostaServicosEditor
            services={services}
            planValue={planValue}
            organizationId={organizationId ?? undefined}
            onServicesChange={setServices}
            onPlanValueChange={setPlanValue}
          />
        </TabsContent>

        {/* ── CRONOGRAMA ── */}
        <TabsContent value="cronograma" className="mt-4">
          <PropostaCronograma
            value={schedule}
            planValue={planValue}
            totalIndividual={services.filter(s => !s.is_bonus).reduce((sum, s) => sum + s.value, 0)}
            onPlanValueChange={setPlanValue}
            onChange={setSchedule}
          />
        </TabsContent>
      </Tabs>

      {envioOpen && detail && (
        <PropostaEnvioModal
          open={envioOpen}
          proposal={detail.proposal}
          clientName={clientName || detail.proposal.title}
          onSend={async (channel) => {
            await sendProposal.mutateAsync({ id: detail.proposal.id, channel });
          }}
          onClose={() => setEnvioOpen(false)}
        />
      )}

      <PropostaAIModal
        open={aiModalOpen}
        sectionLabel={aiSectionKey ? SECTION_LABELS[aiSectionKey] : ""}
        generatedText={aiResult}
        isLoading={aiLoading}
        error={aiError}
        onUse={(text) => {
          if (aiSectionKey)
            setSections((prev) => ({
              ...prev,
              [aiSectionKey]: { ...prev[aiSectionKey], content: text },
            }));
          setAiModalOpen(false);
          resetAI();
        }}
        onRegenerate={() => {
          if (aiSectionKey) handleAIGenerate(aiSectionKey);
        }}
        onCancel={() => {
          setAiModalOpen(false);
          resetAI();
        }}
      />
    </div>
  );
}
