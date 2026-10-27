import { useState, useEffect } from "react";
import { SettingsSection } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { MessageSquare, X } from "lucide-react";

const DAYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

interface AttendanceConfig {
  id?: string;
  whatsapp_bot_active: boolean;
  instagram_bot_active: boolean;
  facebook_bot_active: boolean;
  fallback_assign_after_mins: number;
  queue_message: string;
  outside_hours_message: string;
  handoff_keywords: string[];
  human_hours_start: string;
  human_hours_end: string;
  human_days: string[];
}

const DEFAULTS: AttendanceConfig = {
  whatsapp_bot_active: true,
  instagram_bot_active: true,
  facebook_bot_active: true,
  fallback_assign_after_mins: 2,
  queue_message: "Aguarde, em breve um atendente irá assumir sua conversa.",
  outside_hours_message: "Nosso horário de atendimento humano terminou. Retornaremos em breve.",
  handoff_keywords: [],
  human_hours_start: "09:00",
  human_hours_end: "18:00",
  human_days: ["mon", "tue", "wed", "thu", "fri"],
};

export function ChatAttendanceSection({ organizationId }: { organizationId?: string }) {
  const [config, setConfig] = useState<AttendanceConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keywordInput, setKeywordInput] = useState("");

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("omni_distribution_rules") as any)
      .select("id, whatsapp_bot_active, instagram_bot_active, facebook_bot_active, fallback_assign_after_mins, queue_message, outside_hours_message, handoff_keywords, human_hours_start, human_hours_end, human_days")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => {
        if (data) {
          setConfig({
            id: data.id,
            whatsapp_bot_active: data.whatsapp_bot_active ?? true,
            instagram_bot_active: data.instagram_bot_active ?? true,
            facebook_bot_active: data.facebook_bot_active ?? true,
            fallback_assign_after_mins: data.fallback_assign_after_mins ?? 2,
            queue_message: data.queue_message ?? DEFAULTS.queue_message,
            outside_hours_message: data.outside_hours_message ?? DEFAULTS.outside_hours_message,
            handoff_keywords: data.handoff_keywords ?? [],
            human_hours_start: data.human_hours_start ?? "09:00",
            human_hours_end: data.human_hours_end ?? "18:00",
            human_days: data.human_days ?? DEFAULTS.human_days,
          });
        }
        setLoading(false);
      });
  }, [organizationId]);

  const set = <K extends keyof AttendanceConfig>(key: K, val: AttendanceConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: val }));

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || config.handoff_keywords.includes(kw)) return;
    set("handoff_keywords", [...config.handoff_keywords, kw]);
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) =>
    set("handoff_keywords", config.handoff_keywords.filter(k => k !== kw));

  const toggleDay = (day: string) => {
    const days = config.human_days.includes(day)
      ? config.human_days.filter(d => d !== day)
      : [...config.human_days, day];
    set("human_days", days);
  };

  const handleSave = async () => {
    if (!organizationId) return;
    // Issue 4 fix: garante fallback_assign_after_mins entre 1 e 60
    const safeFallbackMins = Math.max(1, Math.min(60, config.fallback_assign_after_mins || 2));

    // Validate hour range
    if (config.human_hours_start && config.human_hours_end && config.human_hours_start >= config.human_hours_end) {
      toast.error("O horário de início deve ser anterior ao horário de fim.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        name: "Padrão",
        rule_type: "round_robin",
        active: true,
        whatsapp_bot_active: config.whatsapp_bot_active,
        instagram_bot_active: config.instagram_bot_active,
        facebook_bot_active: config.facebook_bot_active,
        fallback_assign_after_mins: safeFallbackMins,
        // Convert empty string to null so DB defaults take effect
        queue_message: config.queue_message.trim() || null,
        outside_hours_message: config.outside_hours_message.trim() || null,
        handoff_keywords: config.handoff_keywords,
        human_hours_start: config.human_hours_start || null,
        human_hours_end: config.human_hours_end || null,
        human_days: config.human_days,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("omni_distribution_rules") as any)
        .upsert(payload, { onConflict: "organization_id" })
        .select("id")
        .single();
      if (error) throw error;
      setConfig(prev => ({ ...prev, id: data.id }));
      toast.success("Configurações de atendimento atualizadas!");
    } catch (err: unknown) {
      toast.error(`Erro ao salvar: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!organizationId || loading) {
    return (
      <SettingsSection title="Atendimento & Chatbot" icon={<MessageSquare className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Atendimento & Chatbot"
      description="Configure o bot por canal, fila de atendimento, handoff automático e horários de atendimento humano."
      icon={<MessageSquare className="h-5 w-5" />}
    >
      <div className="space-y-6">

        {/* Bot por canal */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Bot por Canal</h4>
          <p className="text-[10px] text-slate-400 italic">
            Os webhooks de cada canal são configurados na seção "Chat &amp; Atendimento Omnichannel" acima.
            Ative ou desative o bot por canal abaixo.
          </p>
          <div className="space-y-3">
            {[
              { key: "whatsapp_bot_active" as const, label: "WhatsApp Bot ativo" },
              { key: "instagram_bot_active" as const, label: "Instagram Bot ativo" },
              { key: "facebook_bot_active" as const, label: "Facebook Bot ativo" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={key} className="text-sm font-medium cursor-pointer">{label}</Label>
                <Switch
                  id={key}
                  checked={config[key]}
                  onCheckedChange={val => set(key, val)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Fila geral com fallback automático */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Fila Geral com Fallback Automático</h4>
          <p className="text-[10px] text-slate-400 italic">
            Conversas novas ficam visíveis para todos os atendentes online. Qualquer um pode assumir manualmente.
            Se ninguém assumir no tempo configurado, o sistema atribui automaticamente ao atendente online há mais tempo sem conversa (round-robin).
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tempo para auto-atribuição (minutos)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={config.fallback_assign_after_mins}
              onChange={e => set("fallback_assign_after_mins", parseInt(e.target.value) || 2)}
              className="w-32 px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950"
            />
          </div>
        </div>

        {/* Handoff */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Handoff Bot → Humano</h4>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Palavras-chave de handoff
            </label>
            <p className="text-[10px] text-slate-400 italic mb-2">
              Se o cliente digitar qualquer uma dessas palavras, o bot transfere para atendimento humano.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                placeholder="ex: humano, atendente, falar com alguém"
                className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950"
              />
              <Button type="button" variant="outline" size="sm" onClick={addKeyword}>Adicionar</Button>
            </div>
            {config.handoff_keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {config.handoff_keywords.map(kw => (
                  <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {kw}
                    <button type="button" onClick={() => removeKeyword(kw)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensagem de espera na fila
            </label>
            <textarea
              value={config.queue_message}
              onChange={e => set("queue_message", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensagem fora do horário de atendimento
            </label>
            <textarea
              value={config.outside_hours_message}
              onChange={e => set("outside_hours_message", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950 resize-none"
            />
          </div>
        </div>

        {/* Horário de atendimento */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Horário de Atendimento Humano</h4>

          <div className="flex flex-wrap gap-2">
            {DAYS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                  config.human_days.includes(key)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-input hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Início</label>
              <input
                type="time"
                value={config.human_hours_start}
                onChange={e => set("human_hours_start", e.target.value)}
                className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fim</label>
              <input
                type="time"
                value={config.human_hours_end}
                onChange={e => set("human_hours_end", e.target.value)}
                className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950"
              />
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Salvar Configurações de Atendimento"}
        </Button>
      </div>
    </SettingsSection>
  );
}
