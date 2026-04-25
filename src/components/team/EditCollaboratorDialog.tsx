import { useEffect, useState, useMemo } from "react";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useJobTitleCatalog } from "@/hooks/useJobTitleCatalog";
import { getJobTitleOptions } from "@/lib/jobTitles";
import { fetchAddressByCep } from "@/lib/viacep";
import { supabase } from "@/lib/supabase";
import { UserRole } from "@/types/auth";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/hooks/useProfiles";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Props {
  open: boolean;
  onClose: () => void;
  profile: ProfileRow;
}

const EXCLUSIVE_TITLES = ["CEO", "CMO", "COO", "CFO", "VP"];

export function EditCollaboratorDialog({ open, onClose, profile }: Props) {
  const organizationId = useOrganization();
  const { data: profiles = [], update } = useProfiles(organizationId);
  const catalog = useJobTitleCatalog(organizationId);

  const [searchingCep, setSearchingCep] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "member",
    is_active: true,
    avatar_url: null as string | null,
  });

  const [extraForm, setExtraForm] = useState({
    display_name: "", cpf: "", rg: "", pix_key: "",
    address_street: "", address_city: "", address_state: "", address_zip: "",
    education_level: "fundamental", graduation: "", job_title: "",
    base_salary: "", overtime_factor: "1", notes: "", hire_date: "",
  });

  useEffect(() => {
    if (!open) return;
    const meta = (profile.metadata ?? {}) as Record<string, unknown>;
    setForm({
      full_name: profile.full_name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      role: profile.role || "member",
      is_active: !!profile.is_active,
      avatar_url: profile.avatar_url || null,
    });
    setExtraForm({
      display_name: String(meta.display_name ?? ""),
      cpf: String(meta.cpf ?? ""),
      rg: String(meta.rg ?? ""),
      pix_key: String(meta.pix_key ?? ""),
      address_street: String(meta.address_street ?? ""),
      address_city: String(meta.address_city ?? ""),
      address_state: String(meta.address_state ?? ""),
      address_zip: String(meta.address_zip ?? ""),
      education_level: String(meta.education_level ?? "fundamental"),
      graduation: String(meta.graduation ?? ""),
      job_title: String(meta.job_title ?? ""),
      base_salary: String(meta.base_salary ?? ""),
      overtime_factor: String(meta.overtime_factor ?? "1"),
      notes: String(meta.notes ?? ""),
      hire_date: String(meta.hire_date ?? ""),
    });
  }, [open, profile]);

  const jobTitleOptions = useMemo(() => {
    const catalogTitles = (catalog.data ?? []).map((r) => r.job_title);
    const options = getJobTitleOptions({ extra: catalogTitles, includeDefaults: false });
    const takenTitles = new Set(
      profiles
        .filter((p) => p.id !== profile.id)
        .map((p) => {
          const m = (p.metadata ?? {}) as Record<string, unknown>;
          return String(m.job_title ?? m.cargo ?? "").trim().toUpperCase();
        })
        .filter((t) => EXCLUSIVE_TITLES.includes(t))
    );
    return options.map((title) => {
      const upper = title.toUpperCase();
      const isDisabled = EXCLUSIVE_TITLES.includes(upper) && takenTitles.has(upper);
      return { value: title, label: isDisabled ? `${title} (Já ocupado)` : title, disabled: isDisabled };
    });
  }, [catalog.data, profiles, profile.id]);

  const handleCepSearch = async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setSearchingCep(true);
    try {
      const address = await fetchAddressByCep(clean);
      if (address) {
        setExtraForm((f) => ({
          ...f,
          address_street: `${address.logradouro}${address.bairro ? `, ${address.bairro}` : ""}`,
          address_city: address.localidade,
          address_state: address.uf,
          address_zip: address.cep,
        }));
        toast.success("Endereço preenchido!");
      } else {
        toast.error("CEP não encontrado.");
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setSearchingCep(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const filePath = `${profile.id}/${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setForm((f) => ({ ...f, avatar_url: publicUrl }));
      toast.success("Foto carregada. Salve para confirmar.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!profile.id) return;
    setSubmitting(true);
    try {
      const { data: catalogItem } = await supabase
        .from("job_title_catalog")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("job_title", extraForm.job_title)
        .maybeSingle();

      const newRole = (catalogItem?.role as UserRole) || profile.role || "member";

      const supabaseUntyped = supabase as unknown as SupabaseClient;
      await supabaseUntyped.from("user_permissions").delete().eq("organization_id", organizationId).eq("user_id", profile.id);
      await supabaseUntyped.from("user_permission_scopes").delete().eq("organization_id", organizationId).eq("user_id", profile.id);

      const metadata = {
        ...(profile.metadata as Record<string, unknown> ?? {}),
        ...extraForm,
        base_salary: Number(extraForm.base_salary) || 0,
        overtime_factor: Number(extraForm.overtime_factor) || 1,
        hire_date: extraForm.hire_date || null,
        // commission_percent é legado — não gravar
      };
      await update.mutateAsync({ id: profile.id, ...form, role: newRole, metadata });
      toast.success("Colaborador atualizado");
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[75vw] max-w-[75vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Colaborador — {profile.full_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative group">
              <Avatar className="h-20 w-20">
                <AvatarImage src={form.avatar_url || ""} />
                <AvatarFallback className="text-xl">{form.full_name[0]}</AvatarFallback>
              </Avatar>
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="h-5 w-5" />
                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
              </label>
            </div>
          </div>

          {/* Informações pessoais */}
          <section>
            <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Informações Pessoais</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F label="Nome Completo" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} required />
              <F label="Nome de Apresentação" value={extraForm.display_name} onChange={(v) => setExtraForm((f) => ({ ...f, display_name: v }))} />
              <F label="E-mail" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" required />
              <F label="Telefone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              <F label="CPF" value={extraForm.cpf} onChange={(v) => setExtraForm((f) => ({ ...f, cpf: v }))} />
              <F label="RG" value={extraForm.rg} onChange={(v) => setExtraForm((f) => ({ ...f, rg: v }))} />
            </div>
          </section>

          {/* Endereço */}
          <section>
            <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Endereço</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={extraForm.address_zip}
                    onChange={(e) => {
                      const v = e.target.value;
                      setExtraForm((f) => ({ ...f, address_zip: v }));
                      if (v.replace(/\D/g, "").length === 8) handleCepSearch(v);
                    }}
                  />
                  {searchingCep && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Rua / Logradouro</Label>
                <Input value={extraForm.address_street} onChange={(e) => setExtraForm((f) => ({ ...f, address_street: e.target.value }))} />
              </div>
              <F label="Cidade" value={extraForm.address_city} onChange={(v) => setExtraForm((f) => ({ ...f, address_city: v }))} />
              <F label="Estado (UF)" value={extraForm.address_state} onChange={(v) => setExtraForm((f) => ({ ...f, address_state: v }))} />
              <F label="Chave PIX" value={extraForm.pix_key} onChange={(v) => setExtraForm((f) => ({ ...f, pix_key: v }))} />
            </div>
          </section>

          {/* Profissional e Financeiro */}
          <section>
            <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Profissional e Financeiro</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Escolaridade</Label>
                <Select value={extraForm.education_level} onValueChange={(v) => setExtraForm((f) => ({ ...f, education_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fundamental">Fundamental</SelectItem>
                    <SelectItem value="medio">Médio</SelectItem>
                    <SelectItem value="superior_incompleto">Superior Incompleto</SelectItem>
                    <SelectItem value="superior_andamento">Superior em Andamento</SelectItem>
                    <SelectItem value="superior">Superior Completo</SelectItem>
                    <SelectItem value="pos">Pós-Graduação</SelectItem>
                    <SelectItem value="mestrado">Mestrado</SelectItem>
                    <SelectItem value="doutorado">Doutorado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <F label="Graduação / Curso" value={extraForm.graduation} onChange={(v) => setExtraForm((f) => ({ ...f, graduation: v }))} />
              <div className="space-y-1">
                <Label>Cargo</Label>
                <Select value={extraForm.job_title} onValueChange={(v) => setExtraForm((f) => ({ ...f, job_title: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                  <SelectContent>
                    {jobTitleOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <F label="Salário Base (R$)" value={extraForm.base_salary} onChange={(v) => setExtraForm((f) => ({ ...f, base_salary: v }))} type="currency" />
              <F label="Data de Admissão" value={extraForm.hire_date} onChange={(v) => setExtraForm((f) => ({ ...f, hire_date: v }))} type="date" />
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} id="active-dialog" />
                <Label htmlFor="active-dialog">Colaborador Ativo</Label>
              </div>
            </div>
            <div className="space-y-1 mt-4">
              <Label>Observações</Label>
              <Textarea value={extraForm.notes} onChange={(e) => setExtraForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, value, onChange, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {type === "currency" ? (
        <CurrencyInput value={value} onChange={onChange} />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
      )}
    </div>
  );
}
