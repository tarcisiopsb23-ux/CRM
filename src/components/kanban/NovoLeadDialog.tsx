import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { CreateLeadInput } from "@/hooks/useLeadsKanban";
import type { ProfileRow } from "@/hooks/useProfiles";

const PRIORIDADES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

const INITIAL_FORM: CreateLeadInput = {
  empresa: "",
  nicho: "",
  cidade: "",
  email: "",
  telefone: "",
  origem: "",
  faturamento: 0,
  prioridade: "media",
  responsavel: undefined,
  observacoes: "",
};

interface NovoLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: CreateLeadInput) => Promise<void>;
  profiles: ProfileRow[];
}

export function NovoLeadDialog({
  open,
  onOpenChange,
  onSubmit,
  profiles,
}: NovoLeadDialogProps) {
  const [form, setForm] = useState<CreateLeadInput>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empresa?.trim()) return;
    setCreating(true);
    setCreateErr(null);
    try {
      await onSubmit(form);
      setForm(INITIAL_FORM);
      onOpenChange(false);
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : "Erro ao criar lead");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setForm(INITIAL_FORM);
    setCreateErr(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Empresa *</Label>
            <Input
              value={form.empresa}
              onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              placeholder="Nome da empresa"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nicho</Label>
              <Input
                value={form.nicho ?? ""}
                onChange={(e) => setForm({ ...form, nicho: e.target.value || undefined })}
                placeholder="Ex: Tecnologia, Saúde"
              />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input
                value={form.cidade ?? ""}
                onChange={(e) => setForm({ ...form, cidade: e.target.value || undefined })}
                placeholder="Cidade"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value || undefined })}
                placeholder="E-mail"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={form.telefone ?? ""}
                onChange={(e) => setForm({ ...form, telefone: e.target.value || undefined })}
                placeholder="Telefone"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Origem</Label>
              <Input
                value={form.origem ?? ""}
                onChange={(e) => setForm({ ...form, origem: e.target.value || undefined })}
                placeholder="Ex: Site, Indicação"
              />
            </div>
            <div>
              <Label>Faturamento (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.faturamento ?? 0}
                onChange={(e) =>
                  setForm({ ...form, faturamento: parseFloat(e.target.value) || 0 })
                }
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Prioridade</Label>
              <Select
                value={form.prioridade ?? "media"}
                onValueChange={(v) => setForm({ ...form, prioridade: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável</Label>
              <Select
                value={form.responsavel ?? ""}
                onValueChange={(v) => setForm({ ...form, responsavel: v || undefined })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {(profiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              value={form.observacoes ?? ""}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value || undefined })}
              placeholder="Observações adicionais"
              rows={3}
            />
          </div>
          {createErr && <p className="text-sm text-destructive">{createErr}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
