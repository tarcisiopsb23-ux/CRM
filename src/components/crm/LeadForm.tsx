import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  Lead, LeadTemperature, CrmStage, CrmCustomField, CrmCustomValue,
} from "./types";
import { TEMPERATURE_OPTIONS, ORIGIN_OPTIONS, EMPTY_LEAD_FORM } from "./types";

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  initial: Lead | null;
  stages: CrmStage[];
  customFields: CrmCustomField[];
  defaultStageId: string | null;
  defaultPipelineId: string | null;
  onSave: (data: Omit<Lead, "id" | "created_at">) => void;
}

const cls = "bg-slate-900 border-slate-700 text-white placeholder:text-slate-600";

export function LeadForm({
  open,
  onClose,
  initial,
  stages,
  customFields,
  defaultStageId,
  defaultPipelineId,
  onSave,
}: LeadFormProps) {
  const [form, setForm] = useState<Omit<Lead, "id" | "created_at">>(EMPTY_LEAD_FORM);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // Inicializa o formulário ao abrir
  useEffect(() => {
    if (initial) {
      setForm({
        name:             initial.name,
        phone:            initial.phone,
        email:            initial.email,
        company:          initial.company,
        address:          initial.address,
        origin:           initial.origin,
        temperature:      initial.temperature,
        tags:             initial.tags,
        pipeline_id:      initial.pipeline_id ?? defaultPipelineId,
        stage_id:         initial.stage_id ?? defaultStageId,
        status:           initial.status ?? "novo",
        proposal_value:   initial.proposal_value,
        potential_value:  initial.potential_value,
        product_id:       initial.product_id,
        product_name:     initial.product_name,
        whatsapp_link:    initial.whatsapp_link,
        last_contact_at:  initial.last_contact_at,
        next_followup_at: initial.next_followup_at,
        lost_reason:      initial.lost_reason,
        notes:            initial.notes,
        custom_values:    initial.custom_values ?? [],
      });
      // Preenche mapa de custom values para fácil edição
      const cvMap: Record<string, string> = {};
      (initial.custom_values ?? []).forEach(cv => { cvMap[cv.field_id] = cv.value; });
      setCustomValues(cvMap);
    } else {
      setForm({ ...EMPTY_LEAD_FORM, pipeline_id: defaultPipelineId, stage_id: defaultStageId });
      setCustomValues({});
    }
  }, [initial, open, defaultStageId, defaultPipelineId]);

  // Carrega produtos do cliente
  useEffect(() => {
    if (!open) return;
    supabase
      .from("crm_products")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setProducts(data || []));
  }, [open]);

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const str = (v: string) => v.trim() || null;
  const num = (v: string) => (v ? Number(v) : null);

  const setCustomValue = (fieldId: string, value: string) => {
    setCustomValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }

    // Valida campos obrigatórios
    for (const field of customFields) {
      if (field.required && !customValues[field.id]?.trim()) {
        toast.error(`Campo "${field.name}" é obrigatório`);
        return;
      }
    }

    // Monta custom_values para a RPC
    const cvArray: CrmCustomValue[] = customFields
      .filter(f => customValues[f.id] !== undefined && customValues[f.id] !== "")
      .map(f => ({ field_id: f.id, value: customValues[f.id] }));

    onSave({ ...form, custom_values: cvArray });
  };

  // ── Renderiza um campo personalizado de acordo com seu tipo ──
  const renderCustomField = (field: CrmCustomField) => {
    const value = customValues[field.id] ?? "";
    const label = (
      <Label className="text-slate-300">
        {field.name}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </Label>
    );

    switch (field.field_type) {
      case "text":
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <Input
              value={value}
              onChange={e => setCustomValue(field.id, e.target.value)}
              className={cls}
              placeholder={field.name}
            />
          </div>
        );

      case "number":
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <Input
              type="number"
              value={value}
              onChange={e => setCustomValue(field.id, e.target.value)}
              className={cls}
              placeholder="0"
            />
          </div>
        );

      case "date":
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <Input
              type="date"
              value={value}
              onChange={e => setCustomValue(field.id, e.target.value)}
              className={cls}
            />
          </div>
        );

      case "select":
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <Select value={value || "__none__"} onValueChange={v => setCustomValue(field.id, v === "__none__" ? "" : v)}>
              <SelectTrigger className={cls}><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-white">
                <SelectItem value="__none__">— Selecionar —</SelectItem>
                {(field.options ?? []).map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "boolean":
        return (
          <div key={field.id} className="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2">
            {label}
            <Switch
              checked={value === "true"}
              onCheckedChange={v => setCustomValue(field.id, v ? "true" : "false")}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1E293B] border-slate-700 text-slate-100 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-black">
            {initial ? "Editar Lead" : "Novo Lead"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Identificação ── */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Identificação</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-slate-300">Nome <span className="text-red-400">*</span></Label>
                <Input
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  className={cls}
                  placeholder="Nome completo do lead"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Empresa / Negócio</Label>
                <Input value={form.company ?? ""} onChange={e => set("company", str(e.target.value))}
                  className={cls} placeholder="Nome da empresa" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Telefone</Label>
                <Input value={form.phone ?? ""} onChange={e => set("phone", str(e.target.value))}
                  className={cls} placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">E-mail</Label>
                <Input value={form.email ?? ""} onChange={e => set("email", str(e.target.value))}
                  className={cls} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Endereço</Label>
                <Input value={form.address ?? ""} onChange={e => set("address", str(e.target.value))}
                  className={cls} placeholder="Cidade, estado" />
              </div>
            </div>
          </section>

          {/* ── Etapa do Pipeline ── */}
          {stages.length > 0 && (
            <section className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Pipeline</p>
              <div className="space-y-1">
                <Label className="text-slate-300">Etapa</Label>
                <Select
                  value={form.stage_id ?? "__none__"}
                  onValueChange={v => set("stage_id", v === "__none__" ? null : v)}
                >
                  <SelectTrigger className={cls}><SelectValue placeholder="Selecionar etapa..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="__none__">— Sem etapa —</SelectItem>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>
          )}

          {/* ── Qualificação ── */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Qualificação</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-slate-300">Temperatura</Label>
                <Select
                  value={form.temperature ?? "__none__"}
                  onValueChange={v => set("temperature", v === "__none__" ? null : v as LeadTemperature)}
                >
                  <SelectTrigger className={cls}><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="__none__">— Não definida —</SelectItem>
                    {TEMPERATURE_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Origem</Label>
                <Select
                  value={form.origin ?? "__none__"}
                  onValueChange={v => set("origin", v === "__none__" ? null : v)}
                >
                  <SelectTrigger className={cls}><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="__none__">— Não definida —</SelectItem>
                    {ORIGIN_OPTIONS.map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-slate-300">Tags (separadas por vírgula)</Label>
                <Input value={form.tags ?? ""} onChange={e => set("tags", str(e.target.value))}
                  className={cls} placeholder="vip, urgente, retorno" />
              </div>
            </div>
          </section>

          {/* ── Negócio ── */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Negócio</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-slate-300">Produto / Serviço</Label>
                <Select
                  value={form.product_id ?? "__none__"}
                  onValueChange={v => {
                    if (v === "__none__") {
                      set("product_id", null);
                      set("product_name", null);
                    } else {
                      const p = products.find(p => p.id === v);
                      set("product_id", v);
                      set("product_name", p?.name ?? null);
                    }
                  }}
                >
                  <SelectTrigger className={cls}><SelectValue placeholder="Selecionar produto/serviço..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="__none__">— Nenhum —</SelectItem>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Valor da Proposta (R$)</Label>
                <Input type="number" value={form.proposal_value ?? ""} onChange={e => set("proposal_value", num(e.target.value))}
                  className={cls} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Valor Potencial (R$)</Label>
                <Input type="number" value={form.potential_value ?? ""} onChange={e => set("potential_value", num(e.target.value))}
                  className={cls} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Próximo Follow-up</Label>
                <Input
                  type="datetime-local"
                  value={form.next_followup_at?.slice(0, 16) ?? ""}
                  onChange={e => set("next_followup_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className={cls}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Link WhatsApp</Label>
                <Input value={form.whatsapp_link ?? ""} onChange={e => set("whatsapp_link", str(e.target.value))}
                  className={cls} placeholder="https://wa.me/5511..." />
              </div>
            </div>
          </section>

          {/* ── Motivo da perda ── */}
          {(form.stage_id === null || form.status === "perdido") && form.lost_reason !== undefined && (
            <section className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Perda</p>
              <div className="space-y-1">
                <Label className="text-slate-300">Motivo da Perda</Label>
                <Input value={form.lost_reason ?? ""} onChange={e => set("lost_reason", str(e.target.value))}
                  className={cls} placeholder="Ex: preço, concorrente, sem interesse..." />
              </div>
            </section>
          )}

          {/* ── Campos Personalizados ── */}
          {customFields.length > 0 && (
            <section className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                Campos Personalizados
              </p>
              <div className="grid grid-cols-2 gap-3">
                {customFields.map(field => renderCustomField(field))}
              </div>
            </section>
          )}

          {/* ── Observações ── */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Observações</p>
            <textarea
              value={form.notes ?? ""}
              onChange={e => set("notes", str(e.target.value))}
              className={`w-full ${cls} border rounded-md px-3 py-2 text-sm resize-none h-24`}
              placeholder="Anotações, contexto, histórico do lead..."
            />
          </section>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400">
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold">
            Salvar Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
