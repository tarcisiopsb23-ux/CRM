import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Lead } from "@/types/database";
import { ETAPAS_KANBAN, PRODUCT_SERVICE_OPTIONS } from "@/types/database";
import { formatBRL, formatPhoneBR } from "@/lib/formatters";
import { useTeams } from "@/hooks/useTeams";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import useFormPersistence from "@/hooks/useFormPersistence";
import { ORIGEM_OPTIONS, NICHO_OPTIONS } from "@/constants/crmOptions";
import { LeadStatusBadge } from "@/components/kanban/LeadStatusBadge";
import { ExternalLink, Flame, Plus } from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const CONTACT_ORIGIN_LABEL: Record<string, string> = {
  indicacao: "Indicação",
  prospeccao: "Prospecção",
  campanha_google: "Campanha Google",
  campanha_meta: "Campanha Meta",
  organico: "Orgânico",
  outras: "Outras",
};

const LOST_REASON_LABEL: Record<string, string> = {
  capacidade_produtiva: "Capacidade produtiva",
  orcamento: "Orçamento",
  desqualificado: "Desqualificado",
  barrado_pelo_sa: "Barrado pelo SA",
  sem_contato: "Sem contato",
  limite_da_franquia: "Limite da franquia",
  concorrencia: "Concorrência",
  perda_de_contato: "Perda de contato",
  cadencia_excedida: "Cadência excedida",
  outros: "Outros",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="block font-medium text-muted-foreground text-xs">{label}</span>
      <div className="mt-0.5 text-sm">{value ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1 mb-3">
      {children}
    </p>
  );
}

// ─── tipos ────────────────────────────────────────────────────────────────────

interface LeadDetailsModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (lead: Lead) => void;
  onDelete?: (leadId: string) => void;
  onLeadUpdated?: () => void | Promise<void>;
}

type LeadEditableFields = {
  source: string;
  nicho: string;
  team_id: string;
  sdr_id: string;
  closer_id: string;
  notes: string;
  first_contact_date: string;
  last_contact_date: string;
  cadence: string;
  temperature: number;
  prioridade: string;
};

const EMPTY_FIELDS: LeadEditableFields = {
  source: "",
  nicho: "",
  team_id: "",
  sdr_id: "",
  closer_id: "",
  notes: "",
  first_contact_date: "",
  last_contact_date: "",
  cadence: "",
  temperature: 0,
  prioridade: "media",
};

// ─── componente ───────────────────────────────────────────────────────────────

export function LeadDetailsModal({
  lead,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onLeadUpdated,
}: LeadDetailsModalProps) {
  const navigate = useNavigate();
  const orgId = useOrganization();
  const { profile } = useAuth();
  const { data: teams = [] } = useTeams(orgId);
  const { data: profiles = [] } = useProfiles(orgId);

  const isAdminOrOwner = profile?.role === "admin" || profile?.role === "owner";
  const isManager = profile?.role === "manager";
  const isMember = profile?.role === "member";

  const canEditTeam = isAdminOrOwner || isManager;
  const canEditSdr = isAdminOrOwner || isManager;
  const canEditCloser = isAdminOrOwner || isManager || isMember;

  const persistKey = lead ? `form_lead_${lead.id}` : "form_lead_unknown";
  const [fields, setFields, clearFields] = useFormPersistence<LeadEditableFields>(persistKey, EMPTY_FIELDS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setFields({
        source: lead.source ?? "",
        nicho: lead.nicho ?? "",
        team_id: lead.team_id ?? "",
        sdr_id: lead.sdr_id ?? "",
        closer_id: lead.closer_id ?? "",
        notes: lead.notes ?? "",
        first_contact_date: lead.first_contact_date ? lead.first_contact_date.slice(0, 10) : "",
        last_contact_date: lead.last_contact_date ? lead.last_contact_date.slice(0, 10) : "",
        cadence: lead.cadence != null ? String(lead.cadence) : "",
        temperature: typeof lead.temperature === "number" ? lead.temperature : 0,
        prioridade: lead.prioridade ?? "media",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  if (!lead) return null;

  const etapaLabel = ETAPAS_KANBAN.find((e) => e.id === lead.etapa_kanban)?.label ?? lead.etapa_kanban;
  const activeProfiles = profiles.filter((p) => p.is_active);
  const meta = (lead.metadata ?? {}) as Record<string, unknown>;
  // Prefer the dedicated column; fall back to metadata for leads not yet migrated
  const cidade = lead.cidade ?? (meta.cidade as string) ?? null;
  const estado = (meta.estado as string) ?? null;
  const cidadeEstado = cidade && estado ? `${cidade} / ${estado}` : cidade ?? estado ?? null;

  const productServiceLabel = PRODUCT_SERVICE_OPTIONS.find((o) => o.value === lead.product_service)?.label ?? lead.product_service;

  const handleSaveAssignments = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({
          source: fields.source || null,
          nicho: fields.nicho || null,
          team_id: fields.team_id || null,
          sdr_id: fields.sdr_id || null,
          closer_id: fields.closer_id || null,
          notes: fields.notes || null,
          first_contact_date: fields.first_contact_date || null,
          last_contact_date: fields.last_contact_date || null,
          cadence: fields.cadence ? Number(fields.cadence) : null,
          temperature: fields.temperature,
          prioridade: fields.prioridade || "media",
        })
        .eq("id", lead.id);
      if (error) throw error;
      toast.success("Lead atualizado");
      await onLeadUpdated?.();
      // Limpa só o localStorage sem resetar o state (o useEffect já vai
      // re-sincronizar os campos quando o lead prop chegar atualizado)
      try { localStorage.removeItem(persistKey); } catch { /* ignore */ }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    (fields.source || null) !== (lead.source ?? null) ||
    (fields.nicho || null) !== (lead.nicho ?? null) ||
    (fields.team_id || null) !== (lead.team_id ?? null) ||
    (fields.sdr_id || null) !== (lead.sdr_id ?? null) ||
    (fields.closer_id || null) !== (lead.closer_id ?? null) ||
    (fields.notes || null) !== (lead.notes ?? null) ||
    (fields.first_contact_date || null) !== (lead.first_contact_date ? lead.first_contact_date.slice(0, 10) : null) ||
    (fields.last_contact_date || null) !== (lead.last_contact_date ? lead.last_contact_date.slice(0, 10) : null) ||
    (fields.cadence || null) !== (lead.cadence != null ? String(lead.cadence) : null) ||
    fields.temperature !== (typeof lead.temperature === "number" ? lead.temperature : 0) ||
    fields.prioridade !== (lead.prioridade ?? "media");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col gap-0 p-0 overflow-hidden"
        style={{ width: "75vw", maxWidth: "75vw", height: "90vh", maxHeight: "90vh" }}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-lg">
            {lead.company ? `${lead.company} — ` : ""}{lead.name}
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="grid grid-cols-3 gap-x-8 gap-y-4">

            {/* ── Col 1: Identificação ── */}
            <div className="space-y-3">
              <SectionTitle>Identificação</SectionTitle>
              <Field label="Empresa" value={lead.company} />
              <Field label="Nome" value={lead.name} />
              <Field label="E-mail" value={lead.email} />
              <Field label="Telefone" value={lead.phone ? formatPhoneBR(lead.phone) : null} />
              <Field label="CPF / CNPJ" value={lead.cpf_cnpj ? String(lead.cpf_cnpj) : null} />
              <Field label="Cidade / Estado" value={cidadeEstado} />
              <Field label="Valor estimado" value={lead.value != null ? formatBRL(Number(lead.value)) : null} />
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Cadência</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className="h-8 text-xs"
                  value={fields.cadence}
                  onChange={(e) => setFields({ ...fields, cadence: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Temperatura</Label>
                <div className="flex items-center gap-2 h-8">
                  {[1, 2, 3].map((i) => (
                    <button
                      key={i}
                      type="button"
                      className="p-0.5 hover:scale-110 transition-transform"
                      onClick={() => setFields({ ...fields, temperature: fields.temperature === i ? 0 : i })}
                    >
                      <Flame
                        className={
                          i <= fields.temperature
                            ? "h-5 w-5 text-orange-500 fill-orange-500"
                            : "h-5 w-5 text-muted-foreground/30"
                        }
                      />
                    </button>
                  ))}
                  <span className="text-xs text-muted-foreground">{fields.temperature}/3</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Primeiro Contato</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={fields.first_contact_date}
                  onChange={(e) => setFields({ ...fields, first_contact_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Último Contato</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={fields.last_contact_date}
                  onChange={(e) => setFields({ ...fields, last_contact_date: e.target.value })}
                />
              </div>
            </div>

            {/* ── Col 2: Qualificação ── */}
            <div className="space-y-3">
              <SectionTitle>Qualificação</SectionTitle>
              <Field label="Etapa" value={etapaLabel} />

              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Prioridade</Label>
                <Select
                  value={fields.prioridade || "media"}
                  onValueChange={(v) => setFields({ ...fields, prioridade: v })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Nicho</Label>
                <Select
                  value={fields.nicho || "__none__"}
                  onValueChange={(v) => setFields({ ...fields, nicho: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar nicho" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {NICHO_OPTIONS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Origem</Label>
                <Select
                  value={fields.source || "__none__"}
                  onValueChange={(v) => setFields({ ...fields, source: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar origem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {ORIGEM_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Field label="Origem do Contato" value={lead.contact_origin ? (CONTACT_ORIGIN_LABEL[lead.contact_origin] ?? lead.contact_origin) : null} />
              <Field label="Produto / Serviço" value={productServiceLabel} />
              <Field label="Decisor?" value={lead.decision_maker === true || lead.decision_maker === "true" ? "Sim" : "Não"} />
              <Field label="Nome do Decisor" value={lead.decision_maker_name} />
              <Field label="Tel. Decisor" value={lead.decision_maker_phone ? formatPhoneBR(String(lead.decision_maker_phone)) : null} />
              <Field label="Motivo da Perda" value={lead.lost_reason ? (LOST_REASON_LABEL[lead.lost_reason] ?? lead.lost_reason) : null} />
            </div>

            {/* ── Col 3: Presença Digital + Atribuição ── */}
            <div className="space-y-3">
              <SectionTitle>Presença Digital</SectionTitle>
              <Field label="GMN" value={lead.gmn_status ? <LeadStatusBadge field="gmn" value={lead.gmn_status} /> : null} />
              <Field label="Google Ads" value={lead.google_ads_level ? <LeadStatusBadge field="ads" value={lead.google_ads_level} /> : null} />
              <Field label="Meta Ads" value={lead.meta_ads_level ? <LeadStatusBadge field="ads" value={lead.meta_ads_level} /> : null} />
              <Field label="Social Media" value={lead.social_media_status ? <LeadStatusBadge field="social" value={lead.social_media_status} /> : null} />
              {lead.gbp_url && <Field label="GBP" value={<a href={lead.gbp_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">Abrir <ExternalLink className="h-3 w-3" /></a>} />}
              {lead.instagram_url && <Field label="Instagram" value={<a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">Abrir <ExternalLink className="h-3 w-3" /></a>} />}
              {lead.website_url && <Field label="Website" value={<a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">Abrir <ExternalLink className="h-3 w-3" /></a>} />}

              <div className="pt-1">
                <SectionTitle>Atribuição</SectionTitle>
                {canEditTeam ? (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Equipe</Label>
                    <Select value={fields.team_id || "__none__"} onValueChange={(v) => setFields({ ...fields, team_id: v === "__none__" ? "" : v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : <Field label="Equipe" value={teams.find((t) => t.id === lead.team_id)?.name} />}

                <div className="mt-3">
                  {canEditSdr ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">SDR</Label>
                      {!fields.team_id
                        ? <p className="text-xs text-muted-foreground">Selecione uma equipe primeiro</p>
                        : <Select value={fields.sdr_id || "__none__"} onValueChange={(v) => setFields({ ...fields, sdr_id: v === "__none__" ? "" : v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nenhum</SelectItem>
                              {activeProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                            </SelectContent>
                          </Select>}
                    </div>
                  ) : <Field label="SDR" value={activeProfiles.find((p) => p.id === lead.sdr_id)?.full_name} />}
                </div>

                <div className="mt-3">
                  {canEditCloser ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">Closer</Label>
                      {!fields.team_id
                        ? <p className="text-xs text-muted-foreground">Selecione uma equipe primeiro</p>
                        : <Select value={fields.closer_id || "__none__"} onValueChange={(v) => setFields({ ...fields, closer_id: v === "__none__" ? "" : v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nenhum</SelectItem>
                              {activeProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                            </SelectContent>
                          </Select>}
                    </div>
                  ) : <Field label="Closer" value={activeProfiles.find((p) => p.id === lead.closer_id)?.full_name} />}
                </div>
              </div>
            </div>
          </div>

          {/* Observações — largura total */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Observações</Label>
            <textarea
              value={fields.notes}
              onChange={(e) => setFields({ ...fields, notes: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder="Observações sobre o lead..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-6 py-4 border-t shrink-0">
          {lead.etapa_kanban === "emissao_contrato" && (
            <Button size="sm" onClick={() => { navigate(`/comercial/propostas/nova?lead_id=${lead.id}`); onOpenChange(false); }}>
              <Plus className="h-4 w-4 mr-2" />Criar Proposta
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            {hasChanges && (
              <Button size="sm" onClick={handleSaveAssignments} disabled={saving}>
                {saving ? "Salvando..." : "Salvar Alterações"}
              </Button>
            )}
            {onEdit && <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>Editar</Button>}
            {onDelete && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(lead.id)}>Excluir</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
