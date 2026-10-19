/**
 * ChatbotConhecimentoPage — Chatbot → Conhecimento
 *
 * Base de conhecimento do agente organizada em tabs por tipo.
 *
 * Tabs funcionais:
 *   • Avisos, Eventos, Promoções, Sugestões — reutilizam páginas existentes
 *   • Contato   — telefone, WhatsApp, Instagram, endereço, Google Meu Negócio
 *   • Horários  — horários de funcionamento por dia da semana
 *
 * Tabs Fase 4 (placeholder):
 *   • FAQ, Políticas, Serviços, Documentos RAG
 */

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellRing, CalendarDays, Tag, UtensilsCrossed,
  HelpCircle, ScrollText, Package, Clock, FileText, Info,
  Phone, Plus, Trash2, Save, Loader2, Star, MessageCircle,
  ImagePlus, X,
} from "lucide-react";
import { Badge }   from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useDynamicClient } from "@/hooks/useDynamicClient";

// Páginas existentes reutilizadas
import { AvisosPage }    from "./AvisosPage";
import { EventosPage }   from "./EventosPage";
import { PromocoesPage } from "./PromocoesPage";
import { SugestoesPage } from "./SugestoesPage";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface TimeSlot { open: string; close: string; }
interface OpeningHoursStructured { [day: string]: TimeSlot[] | null; }

interface AiSettings {
  id?: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  address: string;
  opening_hours: string;
  google_business_url: string;
  sidebar_logo_url?: string | null;
}

type ContactForm = Pick<AiSettings, "phone" | "whatsapp" | "instagram" | "address" | "google_business_url">;

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
  phase4?: boolean;
}

const TABS: Tab[] = [
  { id: "avisos",    label: "Avisos",      icon: BellRing },
  { id: "eventos",   label: "Eventos",     icon: CalendarDays },
  { id: "promocoes", label: "Promoções",   icon: Tag },
  { id: "sugestoes", label: "Sugestões",   icon: UtensilsCrossed },
  { id: "contato",   label: "Contato",     icon: Phone },
  { id: "horarios",  label: "Horários",    icon: Clock },
  { id: "faq",       label: "FAQ",         icon: HelpCircle,  phase4: true },
  { id: "politicas", label: "Políticas",   icon: ScrollText,  phase4: true },
  { id: "servicos",  label: "Serviços",    icon: Package,     phase4: true },
  { id: "docs",      label: "Documentos",  icon: FileText,    phase4: true },
];

const DAYS_OF_WEEK = [
  { key: "seg", label: "Segunda-feira" },
  { key: "ter", label: "Terça-feira"   },
  { key: "qua", label: "Quarta-feira"  },
  { key: "qui", label: "Quinta-feira"  },
  { key: "sex", label: "Sexta-feira"   },
  { key: "sab", label: "Sábado"        },
  { key: "dom", label: "Domingo"       },
];

const DEFAULT_HOURS: OpeningHoursStructured = {
  seg: [{ open: "09:00", close: "18:00" }],
  ter: [{ open: "09:00", close: "18:00" }],
  qua: [{ open: "09:00", close: "18:00" }],
  qui: [{ open: "09:00", close: "18:00" }],
  sex: [{ open: "09:00", close: "18:00" }],
  sab: null,
  dom: null,
};

function parseHours(raw: string | undefined | null): OpeningHoursStructured {
  if (!raw) return DEFAULT_HOURS;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      const result: OpeningHoursStructured = {};
      for (const key of Object.keys(parsed)) {
        const v = parsed[key];
        if (v === null) result[key] = null;
        else if (Array.isArray(v)) result[key] = v;
        else if (typeof v === "object" && "open" in v) result[key] = [{ open: v.open, close: v.close }];
        else result[key] = null;
      }
      return result;
    }
  } catch { /* fallback */ }
  return DEFAULT_HOURS;
}

// ─── Componente de horários ───────────────────────────────────────────────────

function OpeningHoursSelector({ value, onChange }: { value: OpeningHoursStructured; onChange: (v: OpeningHoursStructured) => void }) {
  return (
    <div className="grid gap-3">
      {DAYS_OF_WEEK.map(({ key, label }) => {
        const slots = value[key] ?? null;
        const isOpen = slots !== null;
        return (
          <div key={key} className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-36 shrink-0">
                <Checkbox
                  id={`day-${key}`}
                  checked={isOpen}
                  onCheckedChange={(c) => onChange({ ...value, [key]: c ? [{ open: "09:00", close: "18:00" }] : null })}
                />
                <label htmlFor={`day-${key}`} className="text-sm font-medium cursor-pointer select-none">{label}</label>
              </div>
              {!isOpen && <span className="text-xs text-muted-foreground italic">Fechado</span>}
              {isOpen && (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={() => onChange({ ...value, [key]: [...(slots ?? []), { open: "09:00", close: "18:00" }] })}>
                  <Plus className="h-3 w-3" /> Adicionar horário
                </Button>
              )}
            </div>
            {isOpen && slots && slots.length > 0 && (
              <div className="mt-3 grid gap-2 pl-6">
                {slots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Abre</Label>
                      <Input type="time" value={slot.open} onChange={(e) => {
                        const s = [...slots]; s[idx] = { ...s[idx], open: e.target.value };
                        onChange({ ...value, [key]: s });
                      }} className="h-8 w-28 text-sm" />
                    </div>
                    <span className="text-muted-foreground text-xs">até</span>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Fecha</Label>
                      <Input type="time" value={slot.close} onChange={(e) => {
                        const s = [...slots]; s[idx] = { ...s[idx], close: e.target.value };
                        onChange({ ...value, [key]: s });
                      }} className="h-8 w-28 text-sm" />
                    </div>
                    {slots.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => { const s = slots.filter((_, i) => i !== idx); onChange({ ...value, [key]: s.length > 0 ? s : null }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente de upload de logo ─────────────────────────────────────────────

function LogoUploader({ currentUrl, onUploaded, dc }: { currentUrl: string | null; onUploaded: (url: string | null) => void; dc: ReturnType<typeof useDynamicClient> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  useEffect(() => { setPreview(currentUrl); }, [currentUrl]);

  const handleFile = async (file: File) => {
    if (!dc) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Máximo 2 MB."); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `sidebar-logo/${Date.now()}.${ext}`;
      const { error } = await dc.storage.from("branding").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = dc.storage.from("branding").getPublicUrl(path);
      setPreview(publicUrl); onUploaded(publicUrl);
      toast.success("Ícone carregado. Salve para confirmar.");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/40 overflow-hidden">
        {preview ? (
          <>
            <img src={preview} alt="Ícone" className="h-full w-full object-contain p-1" />
            <button type="button" onClick={() => { setPreview(null); onUploaded(null); }}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow">
              <X className="h-3 w-3" />
            </button>
          </>
        ) : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="flex flex-col gap-1.5">
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Enviando...</> : <><ImagePlus className="h-3.5 w-3.5 mr-2" />{preview ? "Trocar" : "Enviar imagem"}</>}
        </Button>
        <p className="text-[11px] text-muted-foreground">PNG, JPG ou SVG · máx. 2 MB</p>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ─── Tab Contato ──────────────────────────────────────────────────────────────

function ContatoTab() {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const form = useForm<ContactForm>({ defaultValues: { phone: "", whatsapp: "", instagram: "", address: "", google_business_url: "" } });

  const { data: settings } = useQuery({
    queryKey: ["ai_settings"],
    queryFn: async () => {
      if (!dc) return null;
      const { data } = await dc.from("ai_settings").select("*").limit(1).maybeSingle();
      return data as AiSettings | null;
    },
    enabled: !!dc,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (settings) {
      form.reset({ phone: settings.phone ?? "", whatsapp: settings.whatsapp ?? "", instagram: settings.instagram ?? "", address: settings.address ?? "", google_business_url: settings.google_business_url ?? "" });
      setLogoUrl(settings.sidebar_logo_url ?? null);
    }
  }, [settings]); // eslint-disable-line

  const save = useMutation({
    mutationFn: async (values: ContactForm) => {
      if (!dc) throw new Error("Cliente não conectado");
      const payload = { ...values, sidebar_logo_url: logoUrl, updated_at: new Date().toISOString() };
      if (settings?.id) {
        const { error } = await dc.from("ai_settings").update(payload).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await dc.from("ai_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Contato salvo!"); qc.invalidateQueries({ queryKey: ["ai_settings"] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h3 className="text-lg font-bold">Informações de Contato</h3>
        <p className="text-sm text-muted-foreground">Dados do estabelecimento comunicados pelo agente aos clientes.</p>
      </div>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-6">

        {/* Ícone do sidebar */}
        <div className="space-y-2">
          <Label>Ícone do sidebar</Label>
          <LogoUploader currentUrl={logoUrl} onUploaded={setLogoUrl} dc={dc} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Telefone</Label>
            <Input {...form.register("phone")} placeholder="(11) 3333-4444" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-green-500" />WhatsApp</Label>
            <Input {...form.register("whatsapp")} placeholder="5511999994444" />
            <p className="text-[11px] text-muted-foreground">Com DDI+DDD, sem espaços ou traços.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Instagram</Label>
          <Input {...form.register("instagram")} placeholder="@seuestablecimento" />
        </div>

        <div className="space-y-2">
          <Label>Endereço</Label>
          <Input {...form.register("address")} placeholder="Rua das Flores, 123 — São Paulo, SP" />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-yellow-500" />Link do Google Meu Negócio</Label>
          <Input {...form.register("google_business_url")} placeholder="https://g.page/r/XXXXX/review" />
          <p className="text-[11px] text-muted-foreground">Encaminhado quando clientes pedirem para avaliar.</p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Tab Horários ─────────────────────────────────────────────────────────────

function HorariosTab() {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const [hours, setHours] = useState<OpeningHoursStructured>(DEFAULT_HOURS);

  const { data: settings } = useQuery({
    queryKey: ["ai_settings"],
    queryFn: async () => {
      if (!dc) return null;
      const { data } = await dc.from("ai_settings").select("*").limit(1).maybeSingle();
      return data as AiSettings | null;
    },
    enabled: !!dc,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (settings) setHours(parseHours(settings.opening_hours));
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!dc) throw new Error("Cliente não conectado");
      const payload = { opening_hours: JSON.stringify(hours), updated_at: new Date().toISOString() };
      if (settings?.id) {
        const { error } = await dc.from("ai_settings").update(payload).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await dc.from("ai_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Horários salvos!"); qc.invalidateQueries({ queryKey: ["ai_settings"] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h3 className="text-lg font-bold">Horários de Funcionamento</h3>
        <p className="text-sm text-muted-foreground">Configure os horários por dia da semana. O agente informará aos clientes quando questionado.</p>
      </div>
      <OpeningHoursSelector value={hours} onChange={setHours} />
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar horários
        </Button>
      </div>
    </div>
  );
}

// ─── Placeholder Fase 4 ───────────────────────────────────────────────────────

function Phase4Placeholder({ label, description }: { label: string; description: string }) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-foreground">{label}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="border-dashed card-surface">
        <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Info className="h-7 w-7 text-primary/60" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground/80">Disponível na Fase 4</p>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              Esta seção estará disponível quando o motor do agente IA (LLM + function calling)
              for implementado. As tabelas de banco de dados já estão planejadas.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Conteúdo de cada tab ──────────────────────────────────────────────────────

function TabContent({ tab }: { tab: string }) {
  switch (tab) {
    case "avisos":    return <AvisosPage />;
    case "eventos":   return <EventosPage />;
    case "promocoes": return <PromocoesPage />;
    case "sugestoes": return <SugestoesPage />;
    case "contato":   return <ContatoTab />;
    case "horarios":  return <HorariosTab />;
    case "faq":       return <Phase4Placeholder label="Perguntas Frequentes (FAQ)" description="Cadastre perguntas e respostas para que o agente responda dúvidas comuns com precisão." />;
    case "politicas": return <Phase4Placeholder label="Políticas e Regras" description="Políticas de cancelamento, entrega e regras do negócio que o agente deve seguir." />;
    case "servicos":  return <Phase4Placeholder label="Serviços e Preços" description="Catálogo de serviços com descrição, preço e duração." />;
    case "docs":      return <Phase4Placeholder label="Documentos (RAG)" description="Documentos longos indexados semanticamente para consulta do agente." />;
    default:          return null;
  }
}

// ─── Página principal ──────────────────────────────────────────────────────────

export function ChatbotConhecimentoPage() {
  const [activeTab, setActiveTab] = useState("avisos");
  const active = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-0">
      <div className="space-y-4 pb-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground uppercase tracking-tight">Conhecimento</h2>
          <p className="text-sm text-muted-foreground">
            Informações que o agente consulta para responder com precisão. Cada tipo é uma tabela separada, reduzindo custo de tokens.
          </p>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide border-b border-border/50">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={["flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md whitespace-nowrap transition-colors border-b-2 -mb-[1px]",
                  isActive ? "border-primary text-foreground bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40",
                ].join(" ")}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
                {tab.phase4 && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-border/60 text-muted-foreground/60 leading-none font-normal ml-0.5">F4</Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-[400px]">
        <TabContent tab={active.id} />
      </div>
    </div>
  );
}
