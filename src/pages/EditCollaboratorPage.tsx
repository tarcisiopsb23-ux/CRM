import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useJobTitleCatalog } from "@/hooks/useJobTitleCatalog";
import { getJobTitleOptions } from "@/lib/jobTitles";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { fetchAddressByCep } from "@/lib/viacep";
import { supabase } from "@/lib/supabase";
import { UserRole } from "@/types/auth";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PercentInput } from "@/components/ui/percent-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Camera, ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Admin",
  manager: "Gestor",
  member: "Membro",
  viewer: "Visualizador",
};

export function EditCollaboratorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const organizationId = useOrganization();
  const { data: profiles = [], update, isLoading: loadingProfiles } = useProfiles(organizationId);
  const catalog = useJobTitleCatalog(organizationId);
  const employeesPermission = usePermissionForScope("team", "employees");

  const [searchingCep, setSearchingCep] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const profile = useMemo(() => profiles.find(p => p.id === id), [profiles, id]);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "member",
    is_active: true,
    avatar_url: null as string | null,
  });

  const [extraForm, setExtraForm] = useState({
    display_name: "",
    cpf: "",
    rg: "",
    pix_key: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    education_level: "fundamental",
    graduation: "",
    job_title: "",
    base_salary: "",
    commission_percent: "",
    overtime_factor: "1",
    notes: "",
  });

  useEffect(() => {
    if (profile) {
      const meta = (profile.metadata ?? {}) as Record<string, any>;
      setForm({
        full_name: profile.full_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        role: profile.role || "member",
        is_active: !!profile.is_active,
        avatar_url: profile.avatar_url || null,
      });
      setExtraForm({
        display_name: meta.display_name || "",
        cpf: meta.cpf || "",
        rg: meta.rg || "",
        pix_key: meta.pix_key || "",
        address_street: meta.address_street || "",
        address_city: meta.address_city || "",
        address_state: meta.address_state || "",
        address_zip: meta.address_zip || "",
        education_level: meta.education_level || "fundamental",
        graduation: meta.graduation || "",
        job_title: meta.job_title || "",
        base_salary: String(meta.base_salary ?? ""),
        commission_percent: String(meta.commission_percent ?? ""),
        overtime_factor: String(meta.overtime_factor ?? "1"),
        notes: meta.notes || "",
      });
    }
  }, [profile]);

  const EXCLUSIVE_TITLES = ["CEO", "CMO", "COO", "CFO", "VP"];

  const jobTitleOptions = useMemo(() => {
    const catalogTitles = (catalog.data ?? []).map((r) => r.job_title);
    const options = getJobTitleOptions({ extra: catalogTitles, includeDefaults: false });

    // Check which exclusive titles are already taken by OTHER profiles
    const takenTitles = new Set(
      profiles
        .filter(p => p.id !== id) // Exclude current user
        .map(p => {
          const meta = (p.metadata ?? {}) as Record<string, any>;
          return (meta.job_title || meta.cargo || "").trim().toUpperCase();
        })
        .filter(t => EXCLUSIVE_TITLES.includes(t))
    );

    return options.map(title => {
      const upper = title.toUpperCase();
      const isDisabled = EXCLUSIVE_TITLES.includes(upper) && takenTitles.has(upper);
      return { value: title, label: isDisabled ? `${title} (Já ocupado por outro)` : title, disabled: isDisabled };
    });
  }, [catalog.data, profiles, id]);

  const handleCepSearch = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      setSearchingCep(true);
      try {
        const address = await fetchAddressByCep(cleanCep);
        if (address) {
          setExtraForm((f) => ({
            ...f,
            address_street: `${address.logradouro}${address.bairro ? `, ${address.bairro}` : ""}`,
            address_city: address.localidade,
            address_state: address.uf,
            address_zip: address.cep,
          }));
          toast.success("Endereço preenchido!");
        }
      } catch (error) {
        toast.error("Erro ao buscar CEP");
      } finally {
        setSearchingCep(false);
      }
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const filePath = `${id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setForm(f => ({ ...f, avatar_url: publicUrl }));
      toast.success("Foto carregada");
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeesPermission.canEdit || !id) return;
    setSubmitting(true);
    try {
      // Look up role from job title catalog
      const { data: catalogItem } = await supabase
        .from("job_title_catalog")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("job_title", extraForm.job_title)
        .maybeSingle();

      const newRole = (catalogItem?.role as UserRole) || profile.role || "member";

      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { error: permsError } = await supabaseUntyped
        .from("user_permissions")
        .delete()
        .eq("organization_id", organizationId)
        .eq("user_id", id);
      if (permsError) throw permsError;

      const { error: scopePermsError } = await supabaseUntyped
        .from("user_permission_scopes")
        .delete()
        .eq("organization_id", organizationId)
        .eq("user_id", id);
      if (scopePermsError) throw scopePermsError;

      const metadata = {
        ...(profile?.metadata as any || {}),
        ...extraForm,
        base_salary: Number(extraForm.base_salary) || 0,
        commission_percent: Number(extraForm.commission_percent) || 0,
        overtime_factor: Number(extraForm.overtime_factor) || 1,
      };
      await update.mutateAsync({
        id,
        ...form,
        role: newRole,
        metadata,
      });
      toast.success("Colaborador atualizado");
      navigate("/team");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingProfiles) return <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>;
  if (!profile) return <div className="p-8 text-center">Colaborador não encontrado</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/team")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Editar Colaborador</h1>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informações Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="relative group">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={form.avatar_url || ""} />
                  <AvatarFallback className="text-2xl">{form.full_name[0]}</AvatarFallback>
                </Avatar>
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  <Camera className="h-6 w-6" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Nome de Apresentação</Label>
                <Input value={extraForm.display_name} onChange={e => setExtraForm(f => ({ ...f, display_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={extraForm.cpf} onChange={e => setExtraForm(f => ({ ...f, cpf: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>RG</Label>
                <Input value={extraForm.rg} onChange={e => setExtraForm(f => ({ ...f, rg: e.target.value }))} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Endereço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={extraForm.address_zip}
                    onChange={e => {
                      const v = e.target.value;
                      setExtraForm(f => ({ ...f, address_zip: v }));
                      if (v.replace(/\D/g, "").length === 8) handleCepSearch(v);
                    }}
                  />
                  {searchingCep && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Rua / Logradouro</Label>
                <Input value={extraForm.address_street} onChange={e => setExtraForm(f => ({ ...f, address_street: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={extraForm.address_city} onChange={e => setExtraForm(f => ({ ...f, address_city: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Estado (UF)</Label>
                <Input value={extraForm.address_state} onChange={e => setExtraForm(f => ({ ...f, address_state: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Chave PIX</Label>
                <Input value={extraForm.pix_key} onChange={e => setExtraForm(f => ({ ...f, pix_key: e.target.value }))} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profissional e Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Escolaridade</Label>
                <Select value={extraForm.education_level} onValueChange={v => setExtraForm(f => ({ ...f, education_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fundamental">Fundamental</SelectItem>
                    <SelectItem value="medio">Médio</SelectItem>
                    <SelectItem value="superior_incompleto">Ensino Superior Incompleto</SelectItem>
                    <SelectItem value="superior_andamento">Ensino Superior em Andamento</SelectItem>
                    <SelectItem value="superior">Superior Completo</SelectItem>
                    <SelectItem value="mestrado_incompleto">Mestrado Incompleto</SelectItem>
                    <SelectItem value="mestrado_andamento">Mestrado em Andamento</SelectItem>
                    <SelectItem value="pos">Mestrado Completo</SelectItem>
                    <SelectItem value="doutorado_incompleto">Doutorado Incompleto</SelectItem>
                    <SelectItem value="doutorado_andamento">Doutorado em Andamento</SelectItem>
                    <SelectItem value="doutorado">Doutorado Completo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Graduação / Curso</Label>
                <Input value={extraForm.graduation} onChange={e => setExtraForm(f => ({ ...f, graduation: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select
                  value={extraForm.job_title}
                  onValueChange={v => setExtraForm(f => ({ ...f, job_title: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobTitleOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Salário Base (R$)</Label>
                <CurrencyInput value={extraForm.base_salary} onChange={v => setExtraForm(f => ({ ...f, base_salary: v }))} />
              </div>
              <div className="space-y-2">
                <Label>Comissão (%)</Label>
                <PercentInput value={extraForm.commission_percent} onChange={v => setExtraForm(f => ({ ...f, commission_percent: v }))} />
              </div>
              <div className="space-y-2">
                <Label>Fator Hora Extra</Label>
                <Input value={extraForm.overtime_factor} onChange={e => setExtraForm(f => ({ ...f, overtime_factor: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2 pt-8">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} id="active" />
                <Label htmlFor="active">Colaborador Ativo</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={extraForm.notes} onChange={e => setExtraForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate("/team")}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Salvar Alterações"}
          </Button>
        </div>
      </form>
    </div>
  );
}
