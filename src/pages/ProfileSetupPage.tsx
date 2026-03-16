import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { fetchAddressByCep } from "@/lib/viacep";

export function ProfileSetupPage() {
  const { user, profile, refetchProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);

  // Form states
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
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone || "");
      const meta = (profile.metadata as any) || {};
      setDisplayName(meta.display_name || "");
      setCpf(meta.cpf || "");
      setRg(meta.rg || "");
      setPixKey(meta.pix_key || "");
      setAddressStreet(meta.address_street || "");
      setAddressCity(meta.address_city || "");
      setAddressState(meta.address_state || "");
      setAddressZip(meta.address_zip || "");
      setEducationLevel(meta.education_level || "fundamental");
      setGraduation(meta.graduation || "");
      setNotes(meta.notes || "");
    }
  }, [profile]);

  async function handleCepSearch(cep: string) {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      setSearchingCep(true);
      try {
        const address = await fetchAddressByCep(cleanCep);
        if (address) {
          setAddressStreet(`${address.logradouro}${address.bairro ? `, ${address.bairro}` : ""}`);
          setAddressCity(address.localidade);
          setAddressState(address.uf);
          toast.success("Endereço preenchido pelo CEP!");
        } else {
          toast.error("CEP não encontrado.");
        }
      } catch (error) {
        toast.error("Erro ao buscar CEP.");
      } finally {
        setSearchingCep(false);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (!phone.trim() || !displayName.trim() || !cpf.trim() || !rg.trim() || !pixKey.trim() || 
        !addressStreet.trim() || !addressCity.trim() || !addressState.trim() || !addressZip.trim()) {
      toast.error("Por favor, preencha todos os campos obrigatórios (*)");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          phone: phone.trim(),
          metadata: {
            ...(profile?.metadata as any || {}),
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
            notes: notes.trim(),
            profile_completed: true
          }
        })
        .eq("id", user.id);

      if (error) throw error;

      await refetchProfile();
      toast.success("Perfil atualizado com sucesso!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar perfil");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Completar Perfil</CardTitle>
          <CardDescription>
            Precisamos de mais algumas informações para liberar seu acesso ao sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Nome de Exibição *</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Como quer ser chamado"
                  required
                />
              </div>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div className="space-y-2">
                <Label htmlFor="pixKey">Chave PIX *</Label>
                <Input
                  id="pixKey"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="E-mail, CPF, etc"
                  required
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-medium">Endereço</h3>
              <div className="space-y-2">
                <Label htmlFor="addressStreet">Rua e Número *</Label>
                <Input
                  id="addressStreet"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="addressZip">CEP *</Label>
                  <div className="relative">
                    <Input
                      id="addressZip"
                      value={addressZip}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAddressZip(val);
                        if (val.replace(/\D/g, "").length === 8) {
                          handleCepSearch(val);
                        }
                      }}
                      placeholder="00000-000"
                      required
                    />
                    {searchingCep && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="addressCity">Cidade *</Label>
                  <Input
                    id="addressCity"
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="addressState">Estado *</Label>
                  <Input
                    id="addressState"
                    value={addressState}
                    onChange={(e) => setAddressState(e.target.value)}
                    placeholder="UF"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-medium">Profissional</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Escolaridade *</Label>
                  <Select value={educationLevel} onValueChange={setEducationLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <Input
                    id="graduation"
                    value={graduation}
                    onChange={(e) => setGraduation(e.target.value)}
                    placeholder="Curso"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alguma informação adicional?"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Finalizar Cadastro"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
