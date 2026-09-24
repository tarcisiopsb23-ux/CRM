/**
 * AgendaConfigPage — Configuração completa da Agenda
 *
 * Abas:
 *   1. Google Calendar — autorização OAuth2
 *   2. Horários — dias/horários de atendimento
 *   3. Serviços — herdados dos Produtos do CRM (configura apenas duração e cor)
 *   4. Profissionais — atendentes/especialistas (opcional)
 *   5. Exibição — o que mostrar no formulário público
 */

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Pencil, Trash2, Loader2, Clock, Calendar,
  CheckCircle2, Unlink, AlertCircle, Users, Settings2,
  Eye, EyeOff, Package, Info, Palette, Upload, ImageIcon, MessageCircle,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Switch }   from "@/components/ui/switch";
import { Badge }    from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useClientAuth }             from "@/hooks/useClientAuth";
import { useScheduleConfig, WEEKDAY_LABELS, type ScheduleConfigDay, type ScheduleServiceInput } from "@/hooks/useScheduleConfig";
import { useScheduleProfessionals, type ScheduleProfessionalInput } from "@/hooks/useScheduleProfessionals";
import { useGoogleCalendar }         from "@/hooks/useGoogleCalendar";
import { useDynamicClient }          from "@/hooks/useDynamicClient";
import { PageHeader }                from "./components/PageHeader";
import { useClientBranding }          from "@/hooks/useClientBranding";
import type { CrmProduct }           from "@/hooks/useCrmProducts";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ─── DayRow ───────────────────────────────────────────────────────────────────

function DayRow({ day, onChange }: { day: ScheduleConfigDay; onChange: (d: ScheduleConfigDay) => void }) {
  const hasBreak = !!(day.break_start || day.break_end);

  return (
    <div className={`space-y-2 py-3 border-b border-border/50 last:border-0 ${!day.active ? "opacity-50" : ""}`}>
      {/* Linha principal */}
      <div className="flex items-center gap-3">
        <Switch checked={day.active} onCheckedChange={(v) => onChange({ ...day, active: v })} />
        <span className="w-8 text-sm font-medium text-foreground shrink-0">{WEEKDAY_LABELS[day.weekday]}</span>

        {/* Horário de atendimento */}
        <div className="flex items-center gap-2 flex-1">
          <Input type="time" value={day.start_time} disabled={!day.active}
            onChange={(e) => onChange({ ...day, start_time: e.target.value })}
            className="h-8 w-28 text-sm" />
          <span className="text-muted-foreground text-xs shrink-0">até</span>
          <Input type="time" value={day.end_time} disabled={!day.active}
            onChange={(e) => onChange({ ...day, end_time: e.target.value })}
            className="h-8 w-28 text-sm" />
        </div>

        {/* Slot / Máx */}
        <div className="flex items-center gap-2 shrink-0">
          <select value={day.slot_duration_min} disabled={!day.active}
            onChange={(e) => onChange({ ...day, slot_duration_min: parseInt(e.target.value) })}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground">
            {[15,20,30,45,60,90,120].map((m) => <option key={m} value={m}>{m}min</option>)}
          </select>
          <Input type="number" min="1" max="10" value={day.max_per_slot} disabled={!day.active}
            onChange={(e) => onChange({ ...day, max_per_slot: parseInt(e.target.value) || 1 })}
            className="h-8 w-14 text-sm" title="Máx. simultâneos" />
        </div>

        {/* Botão intervalo */}
        {day.active && (
          <button
            type="button"
            onClick={() => onChange({
              ...day,
              break_start: hasBreak ? null : "12:00",
              break_end:   hasBreak ? null : "13:00",
            })}
            className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${
              hasBreak
                ? "border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
            title={hasBreak ? "Remover intervalo" : "Adicionar intervalo/pausa"}
          >
            {hasBreak ? "- Intervalo" : "+ Intervalo"}
          </button>
        )}
      </div>

      {/* Linha de intervalo (quando ativo) */}
      {day.active && hasBreak && (
        <div className="flex items-center gap-2 pl-12 text-xs">
          <span className="text-amber-400 shrink-0 font-medium">Intervalo:</span>
          <Input type="time" value={day.break_start ?? ""} disabled={!day.active}
            onChange={(e) => onChange({ ...day, break_start: e.target.value || null })}
            className="h-7 w-24 text-xs border-amber-500/30" />
          <span className="text-muted-foreground shrink-0">até</span>
          <Input type="time" value={day.break_end ?? ""} disabled={!day.active}
            onChange={(e) => onChange({ ...day, break_end: e.target.value || null })}
            className="h-7 w-24 text-xs border-amber-500/30" />
          <span className="text-muted-foreground/60 italic">
            (slots não são gerados neste período)
          </span>
        </div>
      )}
    </div>
  );
}

// ─── ServiceConfigDialog — só configura duração e cor ────────────────────────

function ServiceConfigDialog({ product, existing, onSave, onCancel, saving }: {
  product: CrmProduct;
  existing?: { id: string; duration_min: number; color: string; active: boolean } | null;
  onSave: (data: ScheduleServiceInput & { id?: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [duration, setDuration] = useState(String(existing?.duration_min ?? 60));
  const [color,    setColor]    = useState(existing?.color ?? "#6366f1");
  const [active,   setActive]   = useState(existing?.active ?? true);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSave({
        id:             existing?.id,
        crm_product_id: product.id,
        name:           product.name,
        description:    product.description,
        price:          product.price,
        duration_min:   parseInt(duration) || 60,
        color,
        active,
      });
    }} className="space-y-4 py-2">

      {/* Info do produto */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Produto vinculado</p>
        <p className="text-sm font-semibold text-foreground">{product.name}</p>
        {product.description && <p className="text-xs text-muted-foreground">{product.description}</p>}
        <p className="text-xs text-muted-foreground">{fmtCurrency(product.price)} · {product.unit}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>Duração (min) <span className="text-destructive">*</span></Label>
          <Input type="number" min="5" step="5" value={duration}
            onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Cor no calendário</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent p-1" />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={active} onCheckedChange={setActive} />
        <Label>{active ? "Disponível para agendamento" : "Inativo (não aparece no booking)"}</Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── ProfessionalDialog ───────────────────────────────────────────────────────

function ProfessionalDialog({ initial, onSave, onCancel, saving }: {
  initial?: Partial<ScheduleProfessionalInput & { id: string }>;
  onSave: (data: ScheduleProfessionalInput & { id?: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name,   setName]   = useState(initial?.name   ?? "");
  const [role,   setRole]   = useState(initial?.role   ?? "");
  const [bio,    setBio]    = useState(initial?.bio    ?? "");
  const [color,  setColor]  = useState(initial?.color  ?? "#6366f1");
  const [active, setActive] = useState(initial?.active ?? true);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) { toast.error("Nome obrigatório."); return; }
      onSave({ id: initial?.id, name: name.trim(), role: role.trim() || null,
               bio: bio.trim() || null, color, active });
    }} className="space-y-4 py-2">
      <div className="grid gap-2">
        <Label>Nome <span className="text-destructive">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Dr. João Silva" />
      </div>
      <div className="grid gap-2">
        <Label>Cargo / Especialidade</Label>
        <Input value={role} onChange={(e) => setRole(e.target.value)}
          placeholder="Ex: Médico, Nutricionista, Advogado..." />
      </div>
      <div className="grid gap-2">
        <Label>Descrição curta <span className="text-xs text-muted-foreground">(opcional)</span></Label>
        <Input value={bio} onChange={(e) => setBio(e.target.value)}
          placeholder="Breve apresentação exibida no formulário público" />
      </div>
      <div className="grid gap-2">
        <Label>Cor no calendário</Label>
        <div className="flex items-center gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent p-1" />
          <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={active} onCheckedChange={setActive} />
        <Label>{active ? "Ativo" : "Inativo"}</Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function AgendaConfigPage() {
  const { auth } = useClientAuth();
  const dc       = useDynamicClient();
  const navigate = useNavigate();
  const slug     = auth?.id ? window.location.pathname.split("/")[3] : "";
  const userRole = auth?.user?.role ?? "viewer";
  const canEdit  = ["owner","admin","manager"].includes(userRole);
  const clientId = auth?.id ?? "";

  const {
    schedule, scheduleLoading, saveAllDays,
    displayConfig, displayLoading, saveDisplayConfig,
    services, servicesLoading, upsertService, removeService, toggleService,
  } = useScheduleConfig();

  const { professionals, professionalsLoading, create: createProf, update: updateProf, remove: removeProf, toggle: toggleProf } =
    useScheduleProfessionals();

  const { branding, isLoading: brandingLoading, save: saveBranding, uploadLogo } = useClientBranding();

  // ── Estado local da marca ─────────────────────────────────────────────
  const [localBranding, setLocalBranding] = useState<{
    display_name: string; logo_url: string; primary_color: string; description: string;
  } | null>(null);
  const [brandingInitialized, setBrandingInitialized] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  if (!brandingLoading && !brandingInitialized && branding) {
    setLocalBranding({ ...branding });
    setBrandingInitialized(true);
  }

  const currentBranding = localBranding ?? branding;

  const { status: gcStatus, isLoading: gcLoading, oauthPending, connect, disconnect } = useGoogleCalendar();

  // ── Produtos do CRM (fonte dos serviços) ──────────────────────────────────
  const [crmProducts, setCrmProducts] = useState<CrmProduct[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  // Carrega produtos do CRM via dc (Banco A)
  useState(() => {
    if (!dc || !clientId || productsLoaded) return;
    setProductsLoaded(true);
    dc.from("crm_products")
      .select("*")
      .order("name")
      .then(({ data }) => setCrmProducts((data ?? []) as CrmProduct[]));
  });

  // ── Estado local dos horários ─────────────────────────────────────────────
  const [localSchedule, setLocalSchedule] = useState<ScheduleConfigDay[] | null>(null);
  const displaySchedule = localSchedule ?? schedule;

  // ── Dialogs ───────────────────────────────────────────────────────────────
  const [svcDialog,  setSvcDialog]  = useState<{ product: CrmProduct; existing?: typeof services[0] } | null>(null);
  const [profDialog, setProfDialog] = useState<(typeof professionals[0] & { id: string }) | null | "new">(null);

  // ── Display config local ──────────────────────────────────────────────────
  const [localDisplay, setLocalDisplay] = useState<{ show_services: boolean; show_professionals: boolean } | null>(null);
  const currentDisplay = localDisplay ?? displayConfig;

  // ── Notificações WhatsApp ─────────────────────────────────────────────────
  // Só disponível quando automation_enabled = true (módulo Chatbot ativo)
  const chatbotEnabled = auth?.modules_config?.automation_enabled === true;
  const [notifyConfig, setNotifyConfig] = useState<{
    whatsapp_notify_enabled:     boolean;
    whatsapp_notify_on_created:  boolean;
    whatsapp_notify_on_confirmed:boolean;
    whatsapp_notify_on_cancelled:boolean;
    whatsapp_notify_on_reminder: boolean;
    whatsapp_reminder_hours:     number;
    whatsapp_msg_created:        string;
    whatsapp_msg_confirmed:      string;
    whatsapp_msg_cancelled:      string;
    whatsapp_msg_reminder:       string;
  }>({
    whatsapp_notify_enabled:      false,
    whatsapp_notify_on_created:   true,
    whatsapp_notify_on_confirmed: true,
    whatsapp_notify_on_cancelled: true,
    whatsapp_notify_on_reminder:  true,
    whatsapp_reminder_hours:      24,
    whatsapp_msg_created:         "",
    whatsapp_msg_confirmed:       "",
    whatsapp_msg_cancelled:       "",
    whatsapp_msg_reminder:        "",
  });
  const [notifyLoaded,  setNotifyLoaded]  = useState(false);
  const [savingNotify,  setSavingNotify]  = useState(false);

  // Carrega config de notificações do Banco A
  useState(() => {
    if (!dc || !clientId || notifyLoaded) return;
    setNotifyLoaded(true);
    dc.from("client_ai_settings")
      .select("whatsapp_notify_enabled,whatsapp_notify_on_created,whatsapp_notify_on_confirmed,whatsapp_notify_on_cancelled,whatsapp_notify_on_reminder,whatsapp_reminder_hours,whatsapp_msg_created,whatsapp_msg_confirmed,whatsapp_msg_cancelled,whatsapp_msg_reminder")
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setNotifyConfig({
          whatsapp_notify_enabled:      data.whatsapp_notify_enabled      ?? false,
          whatsapp_notify_on_created:   data.whatsapp_notify_on_created   ?? true,
          whatsapp_notify_on_confirmed: data.whatsapp_notify_on_confirmed ?? true,
          whatsapp_notify_on_cancelled: data.whatsapp_notify_on_cancelled ?? true,
          whatsapp_notify_on_reminder:  data.whatsapp_notify_on_reminder  ?? true,
          whatsapp_reminder_hours:      data.whatsapp_reminder_hours      ?? 24,
          whatsapp_msg_created:         data.whatsapp_msg_created         ?? "",
          whatsapp_msg_confirmed:       data.whatsapp_msg_confirmed       ?? "",
          whatsapp_msg_cancelled:       data.whatsapp_msg_cancelled       ?? "",
          whatsapp_msg_reminder:        data.whatsapp_msg_reminder        ?? "",
        });
      });
  });

  const handleSaveNotifications = async () => {
    if (!dc || !clientId) return;
    setSavingNotify(true);
    try {
      const { data: existing } = await dc.from("client_ai_settings").select("id").eq("client_id", clientId).maybeSingle();
      if (existing?.id) {
        await dc.from("client_ai_settings").update(notifyConfig).eq("id", existing.id);
      } else {
        await dc.from("client_ai_settings").insert({ client_id: clientId, ...notifyConfig });
      }
      toast.success("Configurações de notificação salvas!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingNotify(false);
    }
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveSchedule = async () => {
    if (!canEdit) return;
    try {
      await saveAllDays.mutateAsync(displaySchedule);
      setLocalSchedule(null);
      toast.success("Horários salvos!");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
  };

  const handleSaveService = async (data: ScheduleServiceInput & { id?: string }) => {
    try {
      await upsertService.mutateAsync(data);
      toast.success(data.id ? "Serviço atualizado." : "Serviço adicionado.");
      setSvcDialog(null);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
  };

  const handleSaveProfessional = async (data: ScheduleProfessionalInput & { id?: string }) => {
    try {
      if (data.id) { await updateProf.mutateAsync(data as any); toast.success("Profissional atualizado."); }
      else          { await createProf.mutateAsync(data);        toast.success("Profissional adicionado."); }
      setProfDialog(null);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
  };

  const handleSaveBranding = async () => {
    if (!localBranding) return;
    try {
      await saveBranding.mutateAsync(localBranding);
      setBrandingInitialized(false); // força re-leitura do banco
      toast.success("Informações de marca salvas!");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 2MB."); return; }
    setLogoUploading(true);
    try {
      const url = await uploadLogo(file);
      setLocalBranding(b => b ? { ...b, logo_url: url } : null);
      toast.success("Logo carregado. Salve para confirmar.");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao fazer upload."); }
    finally { setLogoUploading(false); }
  };

  const handleSaveDisplay = async () => {    if (!currentDisplay) return;
    try {
      await saveDisplayConfig.mutateAsync(currentDisplay);
      setLocalDisplay(null);
      toast.success("Configurações de exibição salvas!");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
  };

  // Produtos sem serviço de agenda configurado e produtos já configurados
  const configuredProductIds = new Set(services.map((s) => s.crm_product_id).filter(Boolean));
  const activeProducts = crmProducts.filter((p) => p.active);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Configurar Agenda" description="Defina horários, serviços, profissionais e exibição do formulário público." />

      <Tabs defaultValue="google">
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="google"   className="gap-1.5"><Calendar    className="h-3.5 w-3.5" /> Google Calendar</TabsTrigger>
          <TabsTrigger value="marca"    className="gap-1.5"><Palette     className="h-3.5 w-3.5" /> Marca</TabsTrigger>
          <TabsTrigger value="horarios" className="gap-1.5"><Clock       className="h-3.5 w-3.5" /> Horários</TabsTrigger>
          <TabsTrigger value="servicos" className="gap-1.5"><Package     className="h-3.5 w-3.5" /> Serviços</TabsTrigger>
          <TabsTrigger value="profissionais" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Profissionais</TabsTrigger>
          <TabsTrigger value="exibicao" className="gap-1.5"><Eye        className="h-3.5 w-3.5" /> Exibição</TabsTrigger>
          {chatbotEnabled && (
            <TabsTrigger value="notificacoes" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Notificações</TabsTrigger>
          )}
        </TabsList>

        {/* ── Aba: Marca ── */}
        <TabsContent value="marca">
          <Card className="card-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" /> Identidade de Marca
              </CardTitle>
              <CardDescription>
                Personalize como seu estabelecimento aparece na página pública de agendamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {brandingLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  {/* Preview */}
                  <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview na página de agendamento</p>
                    <div className="flex items-center gap-3">
                      {currentBranding.logo_url ? (
                        <img src={currentBranding.logo_url} alt="Logo"
                          className="h-10 w-10 rounded-lg object-contain border border-border bg-white" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/20">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {currentBranding.display_name || auth?.name || "Nome do estabelecimento"}
                        </p>
                        {currentBranding.description && (
                          <p className="text-xs text-muted-foreground">{currentBranding.description}</p>
                        )}
                      </div>
                      {currentBranding.primary_color && (
                        <span className="ml-auto h-5 w-5 rounded-full border border-border shrink-0"
                          style={{ backgroundColor: currentBranding.primary_color }} />
                      )}
                    </div>
                  </div>

                  {/* Logo */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      Logo / Logotipo
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Aparece no cabeçalho da página de agendamento e no sidebar do dashboard. PNG ou SVG, máx. 2MB.
                    </p>
                    <div className="flex items-center gap-3">
                      {currentBranding.logo_url && (
                        <img src={currentBranding.logo_url} alt="Logo atual"
                          className="h-12 w-12 rounded-lg object-contain border border-border bg-white p-1 shrink-0" />
                      )}
                      <div className="flex-1 space-y-2">
                        <label className={`flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-4 py-3 hover:border-primary/40 hover:bg-primary/5 transition-colors ${!canEdit ? "opacity-50 pointer-events-none" : ""}`}>
                          {logoUploading
                            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            : <Upload className="h-4 w-4 text-muted-foreground" />
                          }
                          <span className="text-sm text-muted-foreground">
                            {logoUploading ? "Enviando..." : "Clique para fazer upload"}
                          </span>
                          <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
                            className="hidden" onChange={handleLogoUpload} disabled={!canEdit || logoUploading} />
                        </label>
                        {currentBranding.logo_url && canEdit && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setLocalBranding(b => b ? { ...b, logo_url: "" } : null)}>
                            Remover logo
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Nome de exibição */}
                  <div className="space-y-2">
                    <Label>Nome de Exibição</Label>
                    <p className="text-xs text-muted-foreground">
                      Nome mostrado na página de agendamento. Se em branco, usa o nome cadastrado no sistema.
                    </p>
                    <Input
                      value={currentBranding.display_name}
                      onChange={e => setLocalBranding(b => b ? { ...b, display_name: e.target.value } : null)}
                      placeholder={auth?.name ?? "Nome do estabelecimento"}
                      disabled={!canEdit}
                    />
                  </div>

                  {/* Descrição / Slogan */}
                  <div className="space-y-2">
                    <Label>Slogan / Descrição curta <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                    <p className="text-xs text-muted-foreground">
                      Aparece abaixo do nome na página de agendamento. Ex: "Sua saúde em boas mãos."
                    </p>
                    <Input
                      value={currentBranding.description}
                      onChange={e => setLocalBranding(b => b ? { ...b, description: e.target.value } : null)}
                      placeholder="Slogan ou descrição breve..."
                      maxLength={120}
                      disabled={!canEdit}
                    />
                    <p className="text-[10px] text-muted-foreground text-right">
                      {currentBranding.description.length}/120
                    </p>
                  </div>

                  {/* Cor primária */}
                  <div className="space-y-2">
                    <Label>Cor Primária</Label>
                    <p className="text-xs text-muted-foreground">
                      Cor dos botões e destaques na página de agendamento.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentBranding.primary_color}
                        onChange={e => setLocalBranding(b => b ? { ...b, primary_color: e.target.value } : null)}
                        disabled={!canEdit}
                        className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-transparent p-1"
                      />
                      <Input
                        value={currentBranding.primary_color}
                        onChange={e => setLocalBranding(b => b ? { ...b, primary_color: e.target.value } : null)}
                        placeholder="#6366f1"
                        className="font-mono w-36"
                        maxLength={7}
                        disabled={!canEdit}
                      />
                      <div className="flex gap-2 flex-wrap">
                        {["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#1e293b"].map(c => (
                          <button key={c} type="button"
                            className="h-7 w-7 rounded-full border-2 transition-all hover:scale-110"
                            style={{
                              backgroundColor: c,
                              borderColor: currentBranding.primary_color === c ? "white" : "transparent",
                              outline: currentBranding.primary_color === c ? `2px solid ${c}` : "none",
                            }}
                            onClick={() => setLocalBranding(b => b ? { ...b, primary_color: c } : null)}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <Button
                      onClick={handleSaveBranding}
                      disabled={saveBranding.isPending || !localBranding}
                      className="w-full"
                    >
                      {saveBranding.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</>
                        : "Salvar Identidade de Marca"
                      }
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Google Calendar ── */}
        <TabsContent value="google">          <Card className="card-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Google Calendar
              </CardTitle>
              <CardDescription>
                Autorize o acesso à sua conta Google para sincronizar agendamentos automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {gcLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexão...
                </div>
              ) : gcStatus.connected ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-foreground">Conta Google autorizada</p>
                      {gcStatus.calendar_name && (
                        <p className="text-xs text-muted-foreground">
                          Calendário: <strong className="text-foreground">{gcStatus.calendar_name}</strong>
                        </p>
                      )}
                      {gcStatus.connected_at && (
                        <p className="text-xs text-muted-foreground">
                          Autorizado em {format(parseISO(gcStatus.connected_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px] shrink-0">Ativo</Badge>
                  </div>
                  {gcStatus.watch_expiry && (() => {
                    const h = (new Date(gcStatus.watch_expiry).getTime() - Date.now()) / 3_600_000;
                    if (h > 24) return null;
                    return (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-400">A sincronização expira em breve — renovação automática pela agência.</p>
                      </div>
                    );
                  })()}
                  <Button variant="outline" size="sm"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-2"
                    disabled={disconnect.isPending}
                    onClick={async () => { try { await disconnect.mutateAsync(); toast.success("Google Calendar desconectado."); } catch { toast.error("Erro ao desconectar."); } }}>
                    {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                    Revogar autorização
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Nenhuma conta Google autorizada. Conecte para sincronizar agendamentos com o Google Calendar.</p>
                  <Button onClick={connect} disabled={oauthPending}
                    className="bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 gap-2.5 font-medium">
                    {oauthPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Aguardando...</> : (
                      <><svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg> Conectar com Google</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">A sincronização é gerenciada pela agência — você só precisa autorizar o acesso uma vez.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Horários ── */}
        <TabsContent value="horarios">
          <Card className="card-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Horários de Atendimento
              </CardTitle>
              <CardDescription>Configure os dias e horários disponíveis. "Máx." = agendamentos simultâneos no mesmo slot.</CardDescription>
            </CardHeader>
            <CardContent>
              {scheduleLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
                <>
                  <div className="text-xs text-muted-foreground mb-3 flex items-center gap-4">
                    <span>Ativo</span><span className="ml-3">Dia</span>
                    <span className="ml-6">Início → Fim</span><span className="ml-auto">Slot | Máx.</span>
                  </div>
                  {displaySchedule.map((day, i) => (
                    <DayRow key={day.weekday} day={day}
                      onChange={(d) => { const u = [...displaySchedule]; u[i] = d; setLocalSchedule(u); }} />
                  ))}
                  {canEdit && (
                    <div className="flex justify-end mt-4">
                      <Button onClick={handleSaveSchedule} disabled={saveAllDays.isPending || !localSchedule}>
                        {saveAllDays.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar Horários
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Serviços ── */}
        <TabsContent value="servicos">
          <Card className="card-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Serviços
              </CardTitle>
              <CardDescription>
                Os serviços são herdados dos <strong>Produtos/Serviços do CRM</strong>. Configure aqui apenas a duração e a cor no calendário.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Aviso */}
              <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
                <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-blue-400">
                    Nome, descrição e preço vêm dos Produtos/Serviços do CRM. Para alterar essas informações, edite em <strong>CRM → Produtos/Serviços</strong>.
                  </p>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 gap-1.5 mt-1"
                      onClick={() => navigate(`/${slug}/crm/produtos?new=1`)}
                    >
                      <Plus className="h-3 w-3" /> Novo Produto/Serviço
                    </Button>
                  )}
                </div>
              </div>

              {servicesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="divide-y divide-border/60">
                  {activeProducts.map((product) => {
                    const svc = services.find((s) => s.crm_product_id === product.id);
                    return (
                      <div key={product.id} className="flex items-center gap-3 py-3">
                        {svc && <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: svc.color }} />}
                        {!svc && <span className="h-3 w-3 rounded-full shrink-0 bg-muted-foreground/20" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtCurrency(product.price)} · {product.unit}
                            {svc && <> · <strong>{svc.duration_min}min</strong></>}
                          </p>
                        </div>
                        {svc ? (
                          <Badge variant="outline" className={`text-[10px] ${svc.active ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                            {svc.active ? "Ativo" : "Inativo"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">Não configurado</Badge>
                        )}
                        {canEdit && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setSvcDialog({ product, existing: svc ?? undefined })}
                              title={svc ? "Editar configuração" : "Configurar para agenda"}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {svc && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                onClick={async () => { try { await removeService.mutateAsync(svc.id); toast.success("Serviço removido da agenda."); } catch { toast.error("Erro ao remover."); } }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {activeProducts.length === 0 && (
                    <div className="flex flex-col items-center py-10 gap-2 text-center">
                      <Package className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Nenhum produto ativo no CRM.</p>
                      <p className="text-xs text-muted-foreground">Crie produtos em <strong>CRM → Produtos</strong> para usá-los como serviços na agenda.</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Profissionais ── */}
        <TabsContent value="profissionais">
          <Card className="card-surface">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Profissionais
                  </CardTitle>
                  <CardDescription>
                    Atendentes, médicos, advogados, etc. Exibição no formulário público controlada na aba <strong>Exibição</strong>.
                  </CardDescription>
                </div>
                {canEdit && (
                  <Button size="sm" onClick={() => setProfDialog("new")}>
                    <Plus className="h-4 w-4 mr-1" /> Novo
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {professionalsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : professionals.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado.</p>
                  <p className="text-xs text-muted-foreground">Adicione profissionais para que o cliente possa escolher com quem agendar.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {professionals.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-3">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        {p.role && <p className="text-xs text-muted-foreground">{p.role}</p>}
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${p.active ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                        {p.active ? "Ativo" : "Inativo"}
                      </Badge>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setProfDialog(p as any)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={async () => { try { await removeProf.mutateAsync(p.id); toast.success("Profissional removido."); } catch { toast.error("Erro ao remover."); } }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba: Exibição ── */}
        <TabsContent value="exibicao">
          <Card className="card-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" /> Exibição no Formulário Público
              </CardTitle>
              <CardDescription>
                Defina o que o cliente vê ao acessar a página de agendamento online.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {displayLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  {/* Mostrar seleção de serviço */}
                  <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Exibir seleção de serviço</p>
                        <p className="text-xs text-muted-foreground">
                          O cliente escolhe o serviço antes de selecionar o horário.
                          Desative se oferecer apenas um serviço.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={currentDisplay.show_services}
                      onCheckedChange={(v) => setLocalDisplay({ ...currentDisplay, show_services: v })}
                      disabled={!canEdit}
                    />
                  </div>

                  {/* Mostrar seleção de profissional */}
                  <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Exibir seleção de profissional</p>
                        <p className="text-xs text-muted-foreground">
                          O cliente escolhe com quem quer agendar.
                          Desative se tiver apenas um profissional ou não quiser exibir.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={currentDisplay.show_professionals}
                      onCheckedChange={(v) => setLocalDisplay({ ...currentDisplay, show_professionals: v })}
                      disabled={!canEdit}
                    />
                  </div>

                  {/* Preview */}
                  <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview do fluxo</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {currentDisplay.show_services && (
                        <><span className="rounded bg-primary/10 text-primary px-2 py-0.5">Selecionar serviço</span><span>→</span></>
                      )}
                      {currentDisplay.show_professionals && (
                        <><span className="rounded bg-primary/10 text-primary px-2 py-0.5">Selecionar profissional</span><span>→</span></>
                      )}
                      <span className="rounded bg-muted text-foreground px-2 py-0.5">Escolher data</span>
                      <span>→</span>
                      <span className="rounded bg-muted text-foreground px-2 py-0.5">Escolher horário</span>
                      <span>→</span>
                      <span className="rounded bg-muted text-foreground px-2 py-0.5">Dados pessoais</span>
                    </div>
                    {!currentDisplay.show_services && !currentDisplay.show_professionals && (
                      <p className="text-xs text-amber-400">
                        ⚠ Modo direto — o cliente vai direto para a data sem escolher serviço ou profissional.
                      </p>
                    )}
                  </div>

                  {canEdit && (
                    <Button onClick={handleSaveDisplay} disabled={saveDisplayConfig.isPending || !localDisplay}>
                      {saveDisplayConfig.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Salvar Configurações de Exibição
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Aba: Notificações WhatsApp (só quando chatbot ativo) ── */}
        {chatbotEnabled && (
          <TabsContent value="notificacoes">
            <Card className="card-surface">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" /> Notificações WhatsApp
                </CardTitle>
                <CardDescription>
                  Envie mensagens automáticas para os clientes ao criar, confirmar ou cancelar agendamentos.
                  Usa a conexão WhatsApp configurada em Integrações → Meta Connections.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* Toggle principal */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">Ativar notificações WhatsApp</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Requer uma conexão WhatsApp ativa em Configurações → Integrações → Meta Connections.
                    </p>
                  </div>
                  <Switch
                    checked={notifyConfig.whatsapp_notify_enabled}
                    onCheckedChange={v => setNotifyConfig(c => ({ ...c, whatsapp_notify_enabled: v }))}
                    disabled={!canEdit}
                  />
                </div>

                {notifyConfig.whatsapp_notify_enabled && (
                  <>
                    {/* Quais eventos notificar */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Eventos</p>
                      {([
                        { key: "whatsapp_notify_on_created"   as const, label: "Agendamento criado",    desc: "Enviado quando um novo agendamento é criado" },
                        { key: "whatsapp_notify_on_confirmed" as const, label: "Agendamento confirmado", desc: "Enviado quando o status muda para confirmado" },
                        { key: "whatsapp_notify_on_cancelled" as const, label: "Agendamento cancelado",  desc: "Enviado quando um agendamento é cancelado" },
                        { key: "whatsapp_notify_on_reminder"  as const, label: "Lembrete",               desc: "Enviado X horas antes do agendamento" },
                      ] as const).map(({ key, label, desc }) => (
                        <div key={key} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">{desc}</p>
                          </div>
                          <Switch
                            checked={notifyConfig[key]}
                            onCheckedChange={v => setNotifyConfig(c => ({ ...c, [key]: v }))}
                            disabled={!canEdit}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Antecedência do lembrete */}
                    {notifyConfig.whatsapp_notify_on_reminder && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Enviar lembrete com antecedência de
                        </Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={168}
                            value={notifyConfig.whatsapp_reminder_hours}
                            onChange={e => setNotifyConfig(c => ({ ...c, whatsapp_reminder_hours: Math.max(1, parseInt(e.target.value) || 24) }))}
                            disabled={!canEdit}
                            className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                          />
                          <span className="text-sm text-muted-foreground">horas antes do agendamento</span>
                        </div>
                      </div>
                    )}

                    {/* Templates personalizados (colapsados por padrão) */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Mensagens personalizadas
                        <span className="ml-2 normal-case font-normal text-muted-foreground">(deixe em branco para usar o padrão)</span>
                      </p>
                      {([
                        { key: "whatsapp_msg_created"   as const, label: "Mensagem de criação",    placeholder: "✅ Olá, {nome}! Seu agendamento de {servico} foi confirmado para {data}." },
                        { key: "whatsapp_msg_confirmed" as const, label: "Mensagem de confirmação", placeholder: "📋 Olá, {nome}! Seu agendamento foi atualizado para {data}." },
                        { key: "whatsapp_msg_cancelled" as const, label: "Mensagem de cancelamento",placeholder: "❌ Olá, {nome}! Seu agendamento de {servico} foi cancelado." },
                        { key: "whatsapp_msg_reminder"  as const, label: "Mensagem de lembrete",   placeholder: "⏰ Olá, {nome}! Lembrete: você tem {servico} amanhã às {hora}." },
                      ] as const).map(({ key, label, placeholder }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs">{label}</Label>
                          <textarea
                            value={notifyConfig[key]}
                            onChange={e => setNotifyConfig(c => ({ ...c, [key]: e.target.value }))}
                            placeholder={placeholder}
                            disabled={!canEdit}
                            rows={2}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                          />
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground">
                        Variáveis disponíveis: <code className="bg-muted px-1 rounded">{"{nome}"}</code> <code className="bg-muted px-1 rounded">{"{servico}"}</code> <code className="bg-muted px-1 rounded">{"{data}"}</code> <code className="bg-muted px-1 rounded">{"{hora}"}</code>
                      </p>
                    </div>
                  </>
                )}

                {canEdit && (
                  <Button onClick={handleSaveNotifications} disabled={savingNotify} className="w-full">
                    {savingNotify && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar Configurações de Notificação
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ── Dialog: configurar serviço (produto CRM) ── */}
      {svcDialog && (
        <Dialog open onOpenChange={(o) => { if (!o) setSvcDialog(null); }}>
          <DialogContent className="border-border bg-card sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {svcDialog.existing ? "Editar configuração do serviço" : "Configurar para agenda"}
              </DialogTitle>
            </DialogHeader>
            <ServiceConfigDialog
              product={svcDialog.product}
              existing={svcDialog.existing ? {
                id: svcDialog.existing.id,
                duration_min: svcDialog.existing.duration_min,
                color: svcDialog.existing.color,
                active: svcDialog.existing.active,
              } : null}
              onSave={handleSaveService}
              onCancel={() => setSvcDialog(null)}
              saving={upsertService.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Dialog: profissional ── */}
      {profDialog !== null && (
        <Dialog open onOpenChange={(o) => { if (!o) setProfDialog(null); }}>
          <DialogContent className="border-border bg-card sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{profDialog === "new" ? "Novo Profissional" : "Editar Profissional"}</DialogTitle>
            </DialogHeader>
            <ProfessionalDialog
              initial={profDialog === "new" ? undefined : (profDialog as any)}
              onSave={handleSaveProfessional}
              onCancel={() => setProfDialog(null)}
              saving={createProf.isPending || updateProf.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
