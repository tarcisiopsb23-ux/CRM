/**
 * ChatbotConhecimentoPage — Chatbot → Conhecimento
 * Tabs: Avisos | Eventos | Promoções | Sugestões | Contato | Horários | FAQ | Políticas | Serviços | Documentos(F4)
 */

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellRing, CalendarDays, Tag, UtensilsCrossed,
  HelpCircle, ScrollText, Package, Clock, FileText, Info,
  Phone, Plus, Trash2, Save, Loader2, Star, MessageCircle,
  ImagePlus, X, Pencil,
} from "lucide-react";
import { Badge }    from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch }   from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useClientAuth }    from "@/hooks/useClientAuth";
import { supabase }         from "@/lib/supabase";
import { StatusBadge }      from "./components/StatusBadge";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { AvisosPage }    from "./AvisosPage";
import { EventosPage }   from "./EventosPage";
import { PromocoesPage } from "./PromocoesPage";
import { SugestoesPage } from "./SugestoesPage";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface TimeSlot { open: string; close: string; }
interface OpeningHoursStructured { [day: string]: TimeSlot[] | null; }
interface AiSettings { id?: string; phone: string; whatsapp: string; instagram: string; address: string; opening_hours: string; google_business_url: string; sidebar_logo_url?: string | null; }
type ContactForm = Pick<AiSettings, "phone"|"whatsapp"|"instagram"|"address"|"google_business_url">;

interface KFaq     { id: string; client_id: string; organization_id: string; question: string; answer: string; keywords: string[]; category: string | null; priority: number; active: boolean; created_at: string; }
interface KPolicy  { id: string; client_id: string; organization_id: string; title: string; content: string; policy_type: string; active: boolean; created_at: string; }
interface KService { id: string; client_id: string; organization_id: string; name: string; description: string; price_info: string | null; duration_info: string | null; category: string | null; keywords: string[]; active: boolean; created_at: string; }

interface Tab { id: string; label: string; icon: React.ElementType; phase4?: boolean; }

const TABS: Tab[] = [
  { id: "avisos",    label: "Avisos",      icon: BellRing },
  { id: "eventos",   label: "Eventos",     icon: CalendarDays },
  { id: "promocoes", label: "Promoções",   icon: Tag },
  { id: "sugestoes", label: "Sugestões",   icon: UtensilsCrossed },
  { id: "contato",   label: "Contato",     icon: Phone },
  { id: "horarios",  label: "Horários",    icon: Clock },
  { id: "faq",       label: "FAQ",         icon: HelpCircle },
  { id: "politicas", label: "Políticas",   icon: ScrollText },
  { id: "servicos",  label: "Serviços",    icon: Package },
  { id: "docs",      label: "Documentos",  icon: FileText, phase4: true },
];

const DAYS = [
  { key: "seg", label: "Segunda-feira" }, { key: "ter", label: "Terça-feira" },
  { key: "qua", label: "Quarta-feira" },  { key: "qui", label: "Quinta-feira" },
  { key: "sex", label: "Sexta-feira" },   { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];
const DEFAULT_HOURS: OpeningHoursStructured = {
  seg: [{ open: "09:00", close: "18:00" }], ter: [{ open: "09:00", close: "18:00" }],
  qua: [{ open: "09:00", close: "18:00" }], qui: [{ open: "09:00", close: "18:00" }],
  sex: [{ open: "09:00", close: "18:00" }], sab: null, dom: null,
};
const POLICY_TYPES = [
  { value: "geral", label: "Geral" }, { value: "devolucao", label: "Devolução" },
  { value: "entrega", label: "Entrega" }, { value: "pagamento", label: "Pagamento" },
  { value: "privacidade", label: "Privacidade" }, { value: "cancelamento", label: "Cancelamento" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHours(raw: string | undefined | null): OpeningHoursStructured {
  if (!raw) return DEFAULT_HOURS;
  try {
    const p = JSON.parse(raw);
    if (typeof p === "object" && !Array.isArray(p)) {
      const r: OpeningHoursStructured = {};
      for (const k of Object.keys(p)) {
        const v = p[k];
        if (v === null) r[k] = null;
        else if (Array.isArray(v)) r[k] = v;
        else if (typeof v === "object" && "open" in v) r[k] = [{ open: v.open, close: v.close }];
        else r[k] = null;
      }
      return r;
    }
  } catch { /* fallback */ }
  return DEFAULT_HOURS;
}

// ─── OpeningHoursSelector ────────────────────────────────────────────────────

function OpeningHoursSelector({ value, onChange }: { value: OpeningHoursStructured; onChange: (v: OpeningHoursStructured) => void }) {
  return (
    <div className="grid gap-3">
      {DAYS.map(({ key, label }) => {
        const slots = value[key] ?? null;
        const isOpen = slots !== null;
        return (
          <div key={key} className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-36 shrink-0">
                <Checkbox id={`day-${key}`} checked={isOpen}
                  onCheckedChange={(c) => onChange({ ...value, [key]: c ? [{ open: "09:00", close: "18:00" }] : null })} />
                <label htmlFor={`day-${key}`} className="text-sm font-medium cursor-pointer select-none">{label}</label>
              </div>
              {!isOpen && <span className="text-xs text-muted-foreground italic">Fechado</span>}
              {isOpen && (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={() => onChange({ ...value, [key]: [...(slots ?? []), { open: "09:00", close: "18:00" }] })}>
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              )}
            </div>
            {isOpen && slots && slots.length > 0 && (
              <div className="mt-3 grid gap-2 pl-6">
                {slots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Abre</Label>
                      <Input type="time" value={slot.open} className="h-8 w-28 text-sm"
                        onChange={(e) => { const s = [...slots]; s[idx] = { ...s[idx], open: e.target.value }; onChange({ ...value, [key]: s }); }} />
                    </div>
                    <span className="text-muted-foreground text-xs">até</span>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Fecha</Label>
                      <Input type="time" value={slot.close} className="h-8 w-28 text-sm"
                        onChange={(e) => { const s = [...slots]; s[idx] = { ...s[idx], close: e.target.value }; onChange({ ...value, [key]: s }); }} />
                    </div>
                    {slots.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => { const s = slots.filter((_, i) => i !== idx); onChange({ ...value, [key]: s.length ? s : null }); }}>
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

// ─── LogoUploader ─────────────────────────────────────────────────────────────

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
    } catch (e: any) { toast.error(e.message); } finally { setUploading(false); }
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
    queryFn: async () => { if (!dc) return null; const { data } = await dc.from("ai_settings").select("*").limit(1).maybeSingle(); return data as AiSettings | null; },
    enabled: !!dc, staleTime: 60_000,
  });

  useEffect(() => {
    if (settings) { form.reset({ phone: settings.phone ?? "", whatsapp: settings.whatsapp ?? "", instagram: settings.instagram ?? "", address: settings.address ?? "", google_business_url: settings.google_business_url ?? "" }); setLogoUrl(settings.sidebar_logo_url ?? null); }
  }, [settings]); // eslint-disable-line

  const save = useMutation({
    mutationFn: async (values: ContactForm) => {
      if (!dc) throw new Error("Cliente não conectado");
      const payload = { ...values, sidebar_logo_url: logoUrl, updated_at: new Date().toISOString() };
      if (settings?.id) { const { error } = await dc.from("ai_settings").update(payload).eq("id", settings.id); if (error) throw error; }
      else { const { error } = await dc.from("ai_settings").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Contato salvo!"); qc.invalidateQueries({ queryKey: ["ai_settings"] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h3 className="text-lg font-bold">Informações de Contato</h3><p className="text-sm text-muted-foreground">Dados comunicados pelo agente aos clientes.</p></div>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-6">
        <div className="space-y-2"><Label>Ícone do sidebar</Label><LogoUploader currentUrl={logoUrl} onUploaded={setLogoUrl} dc={dc} /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Telefone</Label><Input {...form.register("phone")} placeholder="(11) 3333-4444" /></div>
          <div className="space-y-2"><Label className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-green-500" />WhatsApp</Label><Input {...form.register("whatsapp")} placeholder="5511999994444" /><p className="text-[11px] text-muted-foreground">Com DDI+DDD, sem espaços.</p></div>
        </div>
        <div className="space-y-2"><Label>Instagram</Label><Input {...form.register("instagram")} placeholder="@seuestablecimento" /></div>
        <div className="space-y-2"><Label>Endereço</Label><Input {...form.register("address")} placeholder="Rua das Flores, 123 — São Paulo, SP" /></div>
        <div className="space-y-2"><Label className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-yellow-500" />Google Meu Negócio</Label><Input {...form.register("google_business_url")} placeholder="https://g.page/r/XXXXX/review" /></div>
        <div className="flex justify-end"><Button type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Salvar</Button></div>
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
    queryFn: async () => { if (!dc) return null; const { data } = await dc.from("ai_settings").select("*").limit(1).maybeSingle(); return data as AiSettings | null; },
    enabled: !!dc, staleTime: 60_000,
  });

  useEffect(() => { if (settings) setHours(parseHours(settings.opening_hours)); }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!dc) throw new Error("Cliente não conectado");
      const payload = { opening_hours: JSON.stringify(hours), updated_at: new Date().toISOString() };
      if (settings?.id) { const { error } = await dc.from("ai_settings").update(payload).eq("id", settings.id); if (error) throw error; }
      else { const { error } = await dc.from("ai_settings").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Horários salvos!"); qc.invalidateQueries({ queryKey: ["ai_settings"] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h3 className="text-lg font-bold">Horários de Funcionamento</h3><p className="text-sm text-muted-foreground">O agente informará os horários quando questionado.</p></div>
      <OpeningHoursSelector value={hours} onChange={setHours} />
      <div className="flex justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Salvar horários</Button></div>
    </div>
  );
}

// ─── Tab FAQ ──────────────────────────────────────────────────────────────────

type FaqForm = { question: string; answer: string; category: string; priority: number; active: boolean; };

function FaqTab() {
  const { auth } = useClientAuth();
  const clientId = auth?.id ?? "";
  const orgId    = auth?.organization_id ?? "";
  const qc = useQueryClient();
  const [editing, setEditing]   = useState<KFaq | null>(null);
  const [deleting, setDeleting] = useState<KFaq | null>(null);
  const [open, setOpen]         = useState(false);
  const form = useForm<FaqForm>({ defaultValues: { question: "", answer: "", category: "", priority: 0, active: true } });

  const { data: items = [], isLoading } = useQuery<KFaq[]>({
    queryKey: ["knowledge_faqs", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.rpc("get_knowledge_faqs_for_client", { p_client_id: clientId });
      if (error) throw error;
      return (data ?? []) as KFaq[];
    },
    enabled: !!clientId,
  });

  const openCreate = () => { setEditing(null); form.reset({ question: "", answer: "", category: "", priority: 0, active: true }); setOpen(true); };
  const openEdit   = (item: KFaq) => { setEditing(item); form.reset({ question: item.question, answer: item.answer, category: item.category ?? "", priority: item.priority, active: item.active }); setOpen(true); };

  const save = useMutation({
    mutationFn: async (v: FaqForm) => {
      if (editing) {
        const { error } = await supabase.rpc("update_knowledge_faq", { p_id: editing.id, p_question: v.question, p_answer: v.answer, p_keywords: [], p_category: v.category || null, p_priority: v.priority, p_active: v.active });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("insert_knowledge_faq", { p_client_id: clientId, p_organization_id: orgId, p_question: v.question, p_answer: v.answer, p_keywords: [], p_category: v.category || null, p_priority: v.priority, p_active: v.active });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "FAQ atualizado!" : "FAQ criado!"); setOpen(false); qc.invalidateQueries({ queryKey: ["knowledge_faqs", clientId] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("delete_knowledge_faq", { p_id: id }); if (error) throw error; },
    onSuccess: () => { toast.success("FAQ removido."); setDeleting(null); qc.invalidateQueries({ queryKey: ["knowledge_faqs", clientId] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h3 className="text-lg font-bold">Perguntas Frequentes</h3><p className="text-sm text-muted-foreground">O agente usará estas respostas automaticamente.</p></div>
        <Button onClick={openCreate} size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova pergunta</Button>
      </div>
      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {!isLoading && items.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center"><p className="text-sm text-muted-foreground">Nenhuma pergunta cadastrada. Crie a primeira!</p></div>}
      <div className="grid gap-3">
        {items.map(item => (
          <div key={item.id} className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{item.question}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.answer}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.category && <Badge variant="outline" className="text-xs">{item.category}</Badge>}
                <StatusBadge status={item.active ? "active" : "inactive"} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar pergunta" : "Nova pergunta"}</DialogTitle><DialogDescription>O agente usará esta resposta automaticamente.</DialogDescription></DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4 mt-2">
            <div className="space-y-2"><Label>Pergunta <span className="text-destructive">*</span></Label><Input {...form.register("question", { required: true })} placeholder="Ex: Qual o horário de funcionamento?" /></div>
            <div className="space-y-2"><Label>Resposta <span className="text-destructive">*</span></Label><Textarea {...form.register("answer", { required: true })} rows={4} placeholder="Ex: Funcionamos de segunda a sexta das 9h às 18h." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Categoria</Label><Input {...form.register("category")} placeholder="Ex: Atendimento" /></div>
              <div className="space-y-2"><Label>Prioridade (0–10)</Label><Input type="number" min={0} max={10} {...form.register("priority", { valueAsNumber: true })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.watch("active")} onCheckedChange={(v) => form.setValue("active", v)} /><Label>Ativo</Label></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting.id)} loading={del.isPending} description={`Remover a pergunta "${deleting?.question}"?`} />
    </div>
  );
}

// ─── Tab Políticas ────────────────────────────────────────────────────────────

type PolicyForm = { title: string; content: string; policy_type: string; active: boolean; };

function PoliticasTab() {
  const { auth } = useClientAuth();
  const clientId = auth?.id ?? "";
  const orgId    = auth?.organization_id ?? "";
  const qc = useQueryClient();
  const [editing, setEditing]   = useState<KPolicy | null>(null);
  const [deleting, setDeleting] = useState<KPolicy | null>(null);
  const [open, setOpen]         = useState(false);
  const form = useForm<PolicyForm>({ defaultValues: { title: "", content: "", policy_type: "geral", active: true } });

  const { data: items = [], isLoading } = useQuery<KPolicy[]>({
    queryKey: ["knowledge_policies", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.rpc("get_knowledge_policies_for_client", { p_client_id: clientId });
      if (error) throw error;
      return (data ?? []) as KPolicy[];
    },
    enabled: !!clientId,
  });

  const openCreate = () => { setEditing(null); form.reset({ title: "", content: "", policy_type: "geral", active: true }); setOpen(true); };
  const openEdit   = (item: KPolicy) => { setEditing(item); form.reset({ title: item.title, content: item.content, policy_type: item.policy_type, active: item.active }); setOpen(true); };

  const save = useMutation({
    mutationFn: async (v: PolicyForm) => {
      if (editing) {
        const { error } = await supabase.rpc("update_knowledge_policy", { p_id: editing.id, p_title: v.title, p_content: v.content, p_policy_type: v.policy_type, p_active: v.active });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("insert_knowledge_policy", { p_client_id: clientId, p_organization_id: orgId, p_title: v.title, p_content: v.content, p_policy_type: v.policy_type, p_active: v.active });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Política atualizada!" : "Política criada!"); setOpen(false); qc.invalidateQueries({ queryKey: ["knowledge_policies", clientId] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("delete_knowledge_policy", { p_id: id }); if (error) throw error; },
    onSuccess: () => { toast.success("Política removida."); setDeleting(null); qc.invalidateQueries({ queryKey: ["knowledge_policies", clientId] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h3 className="text-lg font-bold">Políticas</h3><p className="text-sm text-muted-foreground">Políticas e regras que o agente comunicará aos clientes.</p></div>
        <Button onClick={openCreate} size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova política</Button>
      </div>
      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {!isLoading && items.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center"><p className="text-sm text-muted-foreground">Nenhuma política cadastrada. Crie a primeira!</p></div>}
      <div className="grid gap-3">
        {items.map(item => (
          <div key={item.id} className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.content}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-xs">{POLICY_TYPES.find(p => p.value === item.policy_type)?.label ?? item.policy_type}</Badge>
                <StatusBadge status={item.active ? "active" : "inactive"} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar política" : "Nova política"}</DialogTitle><DialogDescription>Configure uma política ou regra para o agente comunicar.</DialogDescription></DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4 mt-2">
            <div className="space-y-2"><Label>Título <span className="text-destructive">*</span></Label><Input {...form.register("title", { required: true })} placeholder="Ex: Política de Devolução" /></div>
            <div className="space-y-2"><Label>Conteúdo <span className="text-destructive">*</span></Label><Textarea {...form.register("content", { required: true })} rows={6} placeholder="Descreva a política em detalhes..." /></div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.watch("policy_type")} onValueChange={(v) => form.setValue("policy_type", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {POLICY_TYPES.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.watch("active")} onCheckedChange={(v) => form.setValue("active", v)} /><Label>Ativo</Label></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting.id)} loading={del.isPending} description={`Remover a política "${deleting?.title}"?`} />
    </div>
  );
}

// ─── Tab Serviços ─────────────────────────────────────────────────────────────

type ServiceForm = { name: string; description: string; price_info: string; duration_info: string; category: string; active: boolean; };

function ServicosTab() {
  const { auth } = useClientAuth();
  const clientId = auth?.id ?? "";
  const orgId    = auth?.organization_id ?? "";
  const qc = useQueryClient();
  const [editing, setEditing]   = useState<KService | null>(null);
  const [deleting, setDeleting] = useState<KService | null>(null);
  const [open, setOpen]         = useState(false);
  const form = useForm<ServiceForm>({ defaultValues: { name: "", description: "", price_info: "", duration_info: "", category: "", active: true } });

  const { data: items = [], isLoading } = useQuery<KService[]>({
    queryKey: ["knowledge_services", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.rpc("get_knowledge_services_for_client", { p_client_id: clientId });
      if (error) throw error;
      return (data ?? []) as KService[];
    },
    enabled: !!clientId,
  });

  const openCreate = () => { setEditing(null); form.reset({ name: "", description: "", price_info: "", duration_info: "", category: "", active: true }); setOpen(true); };
  const openEdit   = (item: KService) => { setEditing(item); form.reset({ name: item.name, description: item.description, price_info: item.price_info ?? "", duration_info: item.duration_info ?? "", category: item.category ?? "", active: item.active }); setOpen(true); };

  const save = useMutation({
    mutationFn: async (v: ServiceForm) => {
      if (editing) {
        const { error } = await supabase.rpc("update_knowledge_service", { p_id: editing.id, p_name: v.name, p_description: v.description, p_price_info: v.price_info || null, p_duration_info: v.duration_info || null, p_category: v.category || null, p_keywords: [], p_active: v.active });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("insert_knowledge_service", { p_client_id: clientId, p_organization_id: orgId, p_name: v.name, p_description: v.description, p_price_info: v.price_info || null, p_duration_info: v.duration_info || null, p_category: v.category || null, p_keywords: [], p_active: v.active });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Serviço atualizado!" : "Serviço criado!"); setOpen(false); qc.invalidateQueries({ queryKey: ["knowledge_services", clientId] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("delete_knowledge_service", { p_id: id }); if (error) throw error; },
    onSuccess: () => { toast.success("Serviço removido."); setDeleting(null); qc.invalidateQueries({ queryKey: ["knowledge_services", clientId] }); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h3 className="text-lg font-bold">Serviços</h3><p className="text-sm text-muted-foreground">Catálogo de serviços que o agente apresentará aos clientes.</p></div>
        <Button onClick={openCreate} size="sm" className="gap-2"><Plus className="h-4 w-4" />Novo serviço</Button>
      </div>
      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {!isLoading && items.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center"><p className="text-sm text-muted-foreground">Nenhum serviço cadastrado. Crie o primeiro!</p></div>}
      <div className="grid gap-3">
        {items.map(item => (
          <div key={item.id} className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{item.name}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  {item.price_info && <span className="text-xs text-muted-foreground">{item.price_info}</span>}
                  {item.duration_info && <span className="text-xs text-muted-foreground">⏱ {item.duration_info}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.category && <Badge variant="outline" className="text-xs">{item.category}</Badge>}
                <StatusBadge status={item.active ? "active" : "inactive"} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle><DialogDescription>Configure um serviço para o agente apresentar aos clientes.</DialogDescription></DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4 mt-2">
            <div className="space-y-2"><Label>Nome <span className="text-destructive">*</span></Label><Input {...form.register("name", { required: true })} placeholder="Ex: Corte de cabelo" /></div>
            <div className="space-y-2"><Label>Descrição <span className="text-destructive">*</span></Label><Textarea {...form.register("description", { required: true })} rows={3} placeholder="Descreva o serviço brevemente..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Preço</Label><Input {...form.register("price_info")} placeholder="Ex: R$ 50,00 / R$ 50 a 100" /></div>
              <div className="space-y-2"><Label>Duração</Label><Input {...form.register("duration_info")} placeholder="Ex: 1 hora" /></div>
            </div>
            <div className="space-y-2"><Label>Categoria</Label><Input {...form.register("category")} placeholder="Ex: Estética" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.watch("active")} onCheckedChange={(v) => form.setValue("active", v)} /><Label>Ativo</Label></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting.id)} loading={del.isPending} description={`Remover o serviço "${deleting?.name}"?`} />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ChatbotConhecimentoPage() {
  const [activeTab, setActiveTab] = useState("avisos");

  function renderTabContent() {
    switch (activeTab) {
      case "avisos":    return <AvisosPage />;
      case "eventos":   return <EventosPage />;
      case "promocoes": return <PromocoesPage />;
      case "sugestoes": return <SugestoesPage />;
      case "contato":   return <ContatoTab />;
      case "horarios":  return <HorariosTab />;
      case "faq":       return <FaqTab />;
      case "politicas": return <PoliticasTab />;
      case "servicos":  return <ServicosTab />;
      case "docs":
        return (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-foreground">Documentos</p>
              <p className="text-sm text-muted-foreground mt-1">Esta funcionalidade estará disponível em breve.</p>
            </div>
          </div>
        );
      default: return null;
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Conhecimento do Chatbot</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure as informações que o agente de IA usará para responder seus clientes.</p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-secondary/30 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.phase4 && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Em breve</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>{renderTabContent()}</div>
    </div>
  );
}
