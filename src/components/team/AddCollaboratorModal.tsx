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
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { getJobTitleOptions } from "@/lib/jobTitles";
import { useJobTitleCatalog } from "@/hooks/useJobTitleCatalog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

interface AddCollaboratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddCollaboratorModal({
  open,
  onOpenChange,
  onSuccess,
}: AddCollaboratorModalProps) {
  const organizationId = useOrganization();
  const catalog = useJobTitleCatalog(organizationId);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
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
  const [error, setError] = useState<string | null>(null);

  const jobTitleOptions = useMemo(() => {
    const catalogTitles = (catalog.data ?? []).map((r) => r.job_title);
    return getJobTitleOptions({ extra: catalogTitles, includeDefaults: false });
  }, [catalog.data]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Informe um e-mail válido");
      return;
    }
    if (!password || password.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (!phone.trim()) {
      setError("Telefone é obrigatório");
      return;
    }
    if (!displayName.trim()) {
      setError("Nome de exibição é obrigatório");
      return;
    }
    if (!cpf.trim()) {
      setError("CPF é obrigatório");
      return;
    }
    if (!rg.trim()) {
      setError("RG é obrigatório");
      return;
    }
    if (!pixKey.trim()) {
      setError("Chave PIX é obrigatória");
      return;
    }
    if (!addressStreet.trim()) {
      setError("Endereço é obrigatório");
      return;
    }
    if (!addressCity.trim()) {
      setError("Cidade é obrigatória");
      return;
    }
    if (!addressState.trim()) {
      setError("Estado é obrigatório");
      return;
    }
    if (!addressZip.trim()) {
      setError("CEP é obrigatório");
      return;
    }
    if (!jobTitle.trim()) {
      setError("Cargo é obrigatório");
      return;
    }
    if (!baseSalary.trim()) {
      setError("Salário base é obrigatório");
      return;
    }

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
          password,
          full_name: fullName.trim() || trimmedEmail.split("@")[0],
          phone: phone.trim(),
          display_name: displayName.trim(),
          cpf: cpf.trim(),
          rg: rg.trim(),
          pix_key: pixKey.trim(),
          address_street: addressStreet.trim(),
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

      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!res.ok) {
        const errMsg = data?.error ?? data?.message;
        throw new Error(errMsg || `Erro ${res.status}: ${res.statusText}`);
      }

      setEmail("");
      setFullName("");
      setPassword("");
      setJobTitle("");
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Adicionar Colaborador</DialogTitle>
          <DialogDescription>
            Cadastre um novo usuário com acesso direto ao CRM. Preencha todos os campos obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-6 pb-6">
              {/* Dados Básicos */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Dados de Acesso</h3>
                <div className="grid grid-cols-2 gap-4">
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
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              </div>

              {/* Informações Pessoais */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Informações Pessoais</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome Completo *</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Nome de Exibição *</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF *</Label>
                    <Input
                      id="cpf"
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rg">RG *</Label>
                    <Input
                      id="rg"
                      value={rg}
                      onChange={(e) => setRg(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pixKey">Chave PIX *</Label>
                  <Input
                    id="pixKey"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="E-mail, CPF, Telefone ou Aleatória"
                    required
                  />
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Endereço</h3>
                <div className="space-y-2">
                  <Label htmlFor="addressStreet">Rua e Número *</Label>
                  <Input
                    id="addressStreet"
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="addressCity">Cidade *</Label>
                    <Input
                      id="addressCity"
                      value={addressCity}
                      onChange={(e) => setAddressCity(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressState">Estado *</Label>
                    <Input
                      id="addressState"
                      value={addressState}
                      onChange={(e) => setAddressState(e.target.value)}
                      placeholder="Ex: SP"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressZip">CEP *</Label>
                  <Input
                    id="addressZip"
                    value={addressZip}
                    onChange={(e) => setAddressZip(e.target.value)}
                    placeholder="00000-000"
                    required
                  />
                </div>
              </div>

              {/* Formação e Cargo */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Formação e Cargo</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Escolaridade *</Label>
                    <Select value={educationLevel} onValueChange={setEducationLevel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fundamental">Fundamental</SelectItem>
                        <SelectItem value="medio">Médio</SelectItem>
                        <SelectItem value="superior">Superior</SelectItem>
                        <SelectItem value="pos">Pós-graduação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="graduation">Graduação</Label>
                    <Input
                      id="graduation"
                      value={graduation}
                      onChange={(e) => setGraduation(e.target.value)}
                      placeholder="Ex: Marketing"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobTitle">Cargo *</Label>
                  <Input
                    id="jobTitle"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Ex: Analista de Marketing"
                    list="job_title_options"
                    required
                  />
                  <datalist id="job_title_options">
                    {jobTitleOptions.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Remuneração */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold border-b pb-1">Remuneração</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="baseSalary">Salário Base *</Label>
                    <Input
                      id="baseSalary"
                      value={baseSalary}
                      onChange={(e) => setBaseSalary(e.target.value)}
                      placeholder="0,00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="commissionPercent">Comissão (%)</Label>
                    <Input
                      id="commissionPercent"
                      value={commissionPercent}
                      onChange={(e) => setCommissionPercent(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overtimeFactor">Fator Hora Extra *</Label>
                  <Input
                    id="overtimeFactor"
                    value={overtimeFactor}
                    onChange={(e) => setOvertimeFactor(e.target.value)}
                    placeholder="1.0"
                    required
                  />
                </div>
              </div>

              {/* Notas */}
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informações adicionais..."
                  rows={3}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                  {error}
                </p>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 pt-2 border-t bg-muted/20">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cadastrando...
                </>
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
