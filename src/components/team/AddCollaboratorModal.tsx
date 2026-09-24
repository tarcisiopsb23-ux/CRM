import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Mail, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { useDriveFolder } from "@/hooks/useDriveFolder";
import { useProfiles } from "@/hooks/useProfiles";
import { getJobTitleOptions } from "@/lib/jobTitles";
import { useJobTitleCatalog } from "@/hooks/useJobTitleCatalog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchAddressByCep } from "@/lib/viacep";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

interface AddCollaboratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type SuccessState = {
  noPassword: true;
  inviteLink: string;
  email: string;
  inviteSent?: boolean;
  sendingInvite?: boolean;
} | null;

export function AddCollaboratorModal({
  open,
  onOpenChange,
  onSuccess,
}: AddCollaboratorModalProps) {
  const organizationId = useOrganization();
  const { autoCreateFolder } = useDriveFolder(organizationId);
  const catalog = useJobTitleCatalog(organizationId);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [educationLevel, setEducationLevel] = useState("fundamental");
  const [graduation, setGraduation] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [overtimeFactor, setOvertimeFactor] = useState("1");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<SuccessState>(null);

  const { data: profiles = [] } = useProfiles(organizationId);

  const EXCLUSIVE_TITLES = ["CEO", "CMO", "COO", "CFO", "VP"];

  const jobTitleOptions = useMemo(() => {
    const catalogTitles = (catalog.data ?? []).map((r) => r.job_title);
    const options = getJobTitleOptions({ extra: catalogTitles, includeDefaults: false });
    const takenTitles = new Set(
      profiles
        .map(p => {
          const meta = (p.metadata ?? {}) as Record<string, any>;
          return (meta.job_title || meta.cargo || "").trim().toUpperCase();
        })
        .filter(t => EXCLUSIVE_TITLES.includes(t))
    );
    return options.map(title => {
      const upper = title.toUpperCase();
      if (EXCLUSIVE_TITLES.includes(upper) && takenTitles.has(upper)) {
        return { value: title, label: `${title} (Já ocupado)`, disabled: true };
      }
      return { value: title, label: title, disabled: false };
    });
  }, [catalog.data, profiles]);

  async function handleCepSearch(cep: string) {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      setSearchingCep(true);
      try {
        const address = await fetchAddressByCep(cleanCep);
        if (address) {
          setAddressStreet(address.logradouro || "");
          setAddressNeighborhood(address.bairro || "");
          setAddressCity(address.localidade);
          setAddressState(address.uf);
          toast.success("Endereço preenchido pelo CEP!");
        } else {
          toast.error("CEP não encontrado.");
        }
      } catch {
        toast.error("Erro ao buscar CEP.");
      } finally {
        setSearchingCep(false);
      }
    }
  }

  function resetForm() {
    setEmail(""); setFullName(""); setPhone("");
    setDisplayName(""); setCpf(""); setRg(""); setPixKey("");
    setAddressStreet(""); setAddressNumber(""); setAddressComplement("");
    setAddressNeighborhood(""); setAddressCity(""); setAddressState(""); setAddressZip("");
    setEducationLevel("fundamental"); setGraduation(""); setJobTitle("");
    setBaseSalary(""); setCommissionPercent(""); setOvertimeFactor("1");
    setNotes(""); setError(null); setSuccessState(null);
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Informe um e-mail válido"); return;
    }
    if (!phone.trim()) { setError("Telefone é obrigatório"); return; }
    if (!displayName.trim()) { setError("Nome de exibição é obrigatório"); return; }
    if (!cpf.trim()) { setError("CPF é obrigatório"); return; }
    if (!rg.trim()) { setError("RG é obrigatório"); return; }
    if (!pixKey.trim()) { setError("Chave PIX é obrigatória"); return; }
    if (!addressStreet.trim()) { setError("Rua/Av. é obrigatória"); return; }
    if (!addressCity.trim()) { setError("Cidade é obrigatória"); return; }
    if (!addressState.trim()) { setError("Estado é obrigatório"); return; }
    if (!addressZip.trim()) { setError("CEP é obrigatório"); return; }
    if (!jobTitle.trim()) { setError("Cargo é obrigatório"); return; }
    if (!baseSalary.trim()) { setError("Salário base é obrigatório"); return; }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user-direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: trimmedEmail,
          full_name: fullName.trim() || trimmedEmail.split("@")[0],
          phone: phone.trim(),
          display_name: displayName.trim(),
          cpf: cpf.trim(),
          rg: rg.trim(),
          pix_key: pixKey.trim(),
          address_street: addressStreet.trim(),
          address_number: addressNumber.trim(),
          address_complement: addressComplement.trim(),
          address_neighborhood: addressNeighborhood.trim(),
          address_city: addressCity.trim(),
          address_state: addressState.trim(),
          address_zip: addressZip.trim(),
          education_level: educationLevel,
          graduation: graduation.trim(),
          job_title: jobTitle.trim(),
          base_salary: parseFloat(baseSalary.replace(",", ".")) || 0,
          commission_percent: parseFloat(commissionPercent.replace(",", ".")) || 0,
          overtime_factor: parseFloat(overtimeFactor.replace(",", ".")) || 1,
          notes: notes.trim(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        invite_link?: string;
        no_password?: boolean;
      };

      if (!res.ok) {
        throw new Error(data?.error ?? data?.message ?? `Erro ${res.status}: ${res.statusText}`);
      }

      onSuccess?.();
      // Auto-criar pasta no Drive para o colaborador — inclui todos os campos disponíveis
      autoCreateFolder("employee", {
        id: trimmedEmail,
        full_name: fullName.trim() || trimmedEmail,
        name: fullName.trim() || trimmedEmail,
      }, ["profiles", organizationId]);

      if (data.no_password && data.invite_link) {
        // Show invite options instead of closing
        setSuccessState({
          noPassword: true,
          inviteLink: data.invite_link,
          email: trimmedEmail,
        });
      } else {
        // Password was set — just close
        toast.success("Colaborador cadastrado com sucesso!");
        handleClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendInviteEmail() {
    if (!successState) return;
    setSuccessState(prev => prev ? { ...prev, sendingInvite: true } : prev);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sessão expirada.");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invite-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: successState.email,
          invite_link: successState.inviteLink,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Erro ao enviar convite");
      }

      setSuccessState(prev => prev ? { ...prev, inviteSent: true, sendingInvite: false } : prev);
      toast.success("Convite enviado por e-mail!");
    } catch (e) {
      setSuccessState(prev => prev ? { ...prev, sendingInvite: false } : prev);
      toast.error(e instanceof Error ? e.message : "Erro ao enviar convite");
    }
  }

  function handleCopyLink() {
    if (!successState) return;
    navigator.clipboard.writeText(successState.inviteLink);
    toast.success("Link copiado para a área de transferência!");
  }

  // ── Success screen (no-password flow) ──────────────────────────────────────
  if (successState) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Colaborador cadastrado!
            </DialogTitle>
            <DialogDescription>
              O colaborador foi criado sem senha. Escolha como ele vai definir o acesso:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Button
              className="w-full"
              onClick={handleSendInviteEmail}
              disabled={successState.sendingInvite || successState.inviteSent}
            >
              {successState.sendingInvite ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</>
              ) : successState.inviteSent ? (
                <><CheckCircle2 className="mr-2 h-4 w-4" />Convite enviado</>
              ) : (
                <><Mail className="mr-2 h-4 w-4" />Enviar convite por e-mail</>
              )}
            </Button>

            <Button variant="outline" className="w-full" onClick={handleCopyLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar link manualmente
            </Button>

            <p className="text-xs text-muted-foreground break-all bg-muted px-3 py-2 rounded">
              {successState.inviteLink}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={handleClose}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[80vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle>Adicionar Colaborador</DialogTitle>
          <DialogDescription>
            Cadastre um novo usuário com acesso direto ao CRM. Preencha todos os campos obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-scroll px-6 min-h-0">
            <div className="space-y-6 pb-6">
              {/* Dados de Acesso */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Dados de Acesso</h3>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colaborador@exemplo.com"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Um link de convite será gerado após o cadastro para o colaborador definir sua senha.
                  </p>
                </div>
              </div>

              {/* Informações Pessoais */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Informações Pessoais</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome Completo *</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Nome de Exibição *</Label>
                    <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF *</Label>
                    <Input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rg">RG *</Label>
                    <Input id="rg" value={rg} onChange={(e) => setRg(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pixKey">Chave PIX *</Label>
                  <Input id="pixKey" value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="E-mail, CPF, Telefone ou Aleatória" required />
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Endereço</h3>
                <div className="grid grid-cols-3 gap-4 items-end">
                  <div className="space-y-2 col-span-3 w-[40%]">
                    <Label htmlFor="addressZip">CEP *</Label>
                    <div className="relative">
                      <Input
                        id="addressZip"
                        value={addressZip}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAddressZip(val);
                          if (val.replace(/\D/g, "").length === 8) handleCepSearch(val);
                        }}
                        placeholder="00000-000"
                        maxLength={9}
                        required
                      />
                      {searchingCep && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="addressStreet">Rua / Av. *</Label>
                    <Input id="addressStreet" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Nome da rua ou avenida" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressNumber">Número</Label>
                    <Input id="addressNumber" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="Nº" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="addressComplement">Complemento</Label>
                    <Input id="addressComplement" value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} placeholder="Apto, sala, bloco..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressNeighborhood">Bairro</Label>
                    <Input id="addressNeighborhood" value={addressNeighborhood} onChange={(e) => setAddressNeighborhood(e.target.value)} placeholder="Bairro" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="addressCity">Cidade *</Label>
                    <Input id="addressCity" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressState">Estado *</Label>
                    <Select value={addressState} onValueChange={setAddressState} required>
                      <SelectTrigger id="addressState"><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>
                        {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Formação e Cargo */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Formação e Cargo</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Escolaridade *</Label>
                    <Select value={educationLevel} onValueChange={setEducationLevel}>
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
                    <Label htmlFor="graduation">Graduação</Label>
                    <Input id="graduation" value={graduation} onChange={(e) => setGraduation(e.target.value)} placeholder="Ex: Marketing" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobTitle">Cargo *</Label>
                  <Select value={jobTitle} onValueChange={setJobTitle} required>
                    <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                    <SelectContent>
                      {jobTitleOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Remuneração */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Remuneração</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="baseSalary">Salário Base *</Label>
                    <Input id="baseSalary" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} placeholder="0,00" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="commissionPercent">Comissão (%)</Label>
                    <Input id="commissionPercent" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overtimeFactor">Fator Hora Extra *</Label>
                  <Input id="overtimeFactor" value={overtimeFactor} onChange={(e) => setOvertimeFactor(e.target.value)} placeholder="1.0" required />
                </div>
              </div>

              {/* Notas */}
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Informações adicionais..." rows={3} />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
              )}
            </div>
          </div>

          <DialogFooter className="p-6 pt-2 border-t bg-muted/20">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cadastrando...</>
              ) : (
                "Cadastrar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
