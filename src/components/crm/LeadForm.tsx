import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Lead, LeadStatus, LeadTemperature } from "./types";
import { COLUMNS, TEMPERATURE_OPTIONS, ORIGIN_OPTIONS, EMPTY_FORM } from "./types";

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  initial: Omit<Lead, "id" | "created_at"> | null;
  onSave: (data: Omit<Lead, "id" | "created_at">) => void;
}

const cls = "bg-slate-900 border-slate-700 text-white placeholder:text-slate-600";

export function LeadForm({ open, onClose, initial, onSave }: LeadFormProps) {
  const [form, setForm] = useState<Omit<Lead, "id" | "created_at">>(initial ?? EMPTY_FORM);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { setForm(initial ?? EMPTY_FORM); }, [initial, open]);

  useEffect(() => {
    supabase.from("products").select("id, name").eq("active", true).order("name")
      .then(({ data }) => setProducts(data || []));
  }, []);

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));
  const str = (v: string) => v.trim() || null;
  const num = (v: string) => v ? Number(v) : null;

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Nome obrigatório"); return; }
    onSave(form);
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

          {/* Identificação */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Identificação</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-slate-300">Nome *</Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)}
                  className={cls} placeholder="Nome completo do lead" />
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

          {/* Qualificação */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Qualificação</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-slate-300">Status</Label>
                <Select value={form.status} onValueChange={v => set("status", v as LeadStatus)}>
                  <SelectTrigger className={cls}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    {COLUMNS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Temperatura</Label>
                <Select value={form.temperature ?? "__none__"} onValueChange={v => set("temperature", v === "__none__" ? null : v as LeadTemperature)}>
                  <SelectTrigger className={cls}><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="__none__">— Não definida —</SelectItem>
                    {TEMPERATURE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Origem</Label>
                <Select value={form.origin ?? "__none__"} onValueChange={v => set("origin", v === "__none__" ? null : v)}>
                  <SelectTrigger className={cls}><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="__none__">— Não definida —</SelectItem>
                    {ORIGIN_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Tags (separadas por vírgula)</Label>
                <Input value={form.tags ?? ""} onChange={e => set("tags", str(e.target.value))}
                  className={cls} placeholder="vip, urgente, retorno" />
              </div>
            </div>
          </section>

          {/* Negócio */}
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
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
                <Input type="datetime-local" value={form.next_followup_at?.slice(0, 16) ?? ""}
                  onChange={e => set("next_followup_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className={cls} />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Link WhatsApp</Label>
                <Input value={form.whatsapp_link ?? ""} onChange={e => set("whatsapp_link", str(e.target.value))}
                  className={cls} placeholder="https://wa.me/5511..." />
              </div>
            </div>
          </section>

          {/* Motivo da perda (só quando perdido) */}
          {form.status === "perdido" && (
            <section className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Perda</p>
              <div className="space-y-1">
                <Label className="text-slate-300">Motivo da Perda</Label>
                <Input value={form.lost_reason ?? ""} onChange={e => set("lost_reason", str(e.target.value))}
                  className={cls} placeholder="Ex: preço, concorrente, sem interesse..." />
              </div>
            </section>
          )}

          {/* Observações */}
          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Observações</p>
            <textarea value={form.notes ?? ""} onChange={e => set("notes", str(e.target.value))}
              className={`w-full ${cls} border rounded-md px-3 py-2 text-sm resize-none h-24`}
              placeholder="Anotações, contexto, histórico do lead..." />
          </section>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400">Cancelar</Button>
          <Button onClick={handleSave} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 font-bold">
            Salvar Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
