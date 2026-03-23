import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useCreateCiclo } from "@/hooks/useAvaliacao360";
import { useProfiles } from "@/hooks/useProfiles";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useAuth } from "@/contexts/AuthContext";
import type { CicloTipo } from "@/types/avaliacao360";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

const EMPTY = {
  nome: "",
  data_inicio: "",
  data_fim: "",
  tipo: "360" as CicloTipo,
  peso_360: "0.60",
  peso_metas: "0.25",
  peso_prod: "0.15",
  colaborador_alvo_id: "none",
  responsavel_id: "none",
};

const TIPO_INFO: Record<CicloTipo, { label: string; desc: string }> = {
  '360':        { label: '360° Semestral',       desc: 'Avaliação completa com autoavaliação, gestor, pares e liderados' },
  'checkin':    { label: 'Check-in Contínuo',    desc: 'Termômetro mensal/quinzenal — sem score formal' },
  'probatorio': { label: 'Período Probatório',   desc: 'Avaliação de fim de experiência para um colaborador específico' },
};

export function CicloForm({ open, onOpenChange, organizationId }: Props) {
  const { profile } = useAuth();
  const createCiclo = useCreateCiclo();
  const { data: profiles = [] } = useProfiles(organizationId);
  const { data: teams = [] } = useTeams(organizationId);
  const { data: teamMembers = [] } = useTeamMembers(organizationId);
  const [form, setForm] = useState(EMPTY);

  const set = (field: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const isProbatorio = form.tipo === 'probatorio';
  const isCheckin = form.tipo === 'checkin';

  // Verifica se o colaborador selecionado tem equipe com gestor
  const colaboradorTemGestor = useMemo(() => {
    if (!isProbatorio || form.colaborador_alvo_id === "none") return true;
    const membership = teamMembers.find((m) => m.profile_id === form.colaborador_alvo_id);
    if (!membership) return false;
    const team = teams.find((t) => t.id === membership.team_id);
    return !!(team?.lead_id && team.lead_id !== form.colaborador_alvo_id);
  }, [isProbatorio, form.colaborador_alvo_id, teamMembers, teams]);

  // Admins e owners disponíveis como responsável
  const adminsOwners = profiles.filter(
    (p) => (p.role === 'admin' || p.role === 'owner') && p.id !== form.colaborador_alvo_id
  );

  const handleSubmit = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome do ciclo"); return; }
    if (!form.data_inicio || !form.data_fim) { toast.error("Informe as datas de início e fim"); return; }
    if (form.data_fim < form.data_inicio) { toast.error("A data de fim deve ser posterior à data de início"); return; }
    if (isProbatorio && form.colaborador_alvo_id === "none") {
      toast.error("Selecione o colaborador em período probatório");
      return;
    }

    const p360 = parseFloat(form.peso_360);
    const pMetas = parseFloat(form.peso_metas);
    const pProd = parseFloat(form.peso_prod);
    if (Math.abs(p360 + pMetas + pProd - 1.0) > 0.001) {
      toast.error("A soma dos pesos deve ser igual a 1.0");
      return;
    }

    await createCiclo.mutateAsync({
      organization_id: organizationId,
      nome: form.nome.trim(),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      tipo: form.tipo,
      status: "ativo",
      peso_360: p360,
      peso_metas: pMetas,
      peso_prod: pProd,
      colaborador_alvo_id: isProbatorio && form.colaborador_alvo_id !== "none"
        ? form.colaborador_alvo_id
        : null,
      responsavel_id: isProbatorio && form.responsavel_id !== "none"
        ? form.responsavel_id
        : null,
      created_by: profile?.id ?? null,
    });

    toast.success("Ciclo criado com sucesso");
    setForm(EMPTY);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Ciclo de Avaliação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input
              placeholder="Ex: 360° S1/2025 ou Check-in Junho"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Tipo de Avaliação</Label>
            <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(TIPO_INFO) as [CicloTipo, typeof TIPO_INFO[CicloTipo]][]).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <p className="font-medium">{info.label}</p>
                      <p className="text-xs text-muted-foreground">{info.desc}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Colaborador alvo — apenas probatório */}
          {isProbatorio && (
            <div className="space-y-1">
              <Label>Colaborador em Período Probatório *</Label>
              <Select
                value={form.colaborador_alvo_id}
                onValueChange={(v) => {
                  set("colaborador_alvo_id", v);
                  set("responsavel_id", "none"); // reset ao trocar colaborador
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {profiles
                    .filter((p) => p.role === 'member' || p.role === 'manager')
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Responsável — aparece quando colaborador não tem gestor de equipe */}
          {isProbatorio && form.colaborador_alvo_id !== "none" && !colaboradorTemGestor && (
            <div className="space-y-1">
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Este colaborador não está vinculado a uma equipe com gestor.
                  Selecione o responsável pela avaliação ou deixe em branco para usar o administrador da organização.
                </span>
              </div>
              <Label>Responsável pela Avaliação</Label>
              <Select value={form.responsavel_id} onValueChange={(v) => set("responsavel_id", v)}>
                <SelectTrigger><SelectValue placeholder="Automático (admin/owner)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Automático (primeiro admin/owner)</SelectItem>
                  {adminsOwners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                      <span className="ml-1 text-xs text-muted-foreground capitalize">({p.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Responsável opcional — mesmo com equipe, permite override */}
          {isProbatorio && form.colaborador_alvo_id !== "none" && colaboradorTemGestor && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Responsável pela Avaliação (opcional — substitui o gestor da equipe)
              </Label>
              <Select value={form.responsavel_id} onValueChange={(v) => set("responsavel_id", v)}>
                <SelectTrigger><SelectValue placeholder="Usar gestor da equipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Usar gestor da equipe</SelectItem>
                  {adminsOwners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                      <span className="ml-1 text-xs text-muted-foreground capitalize">({p.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data de Início *</Label>
              <Input type="date" value={form.data_inicio} onChange={(e) => set("data_inicio", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data de Fim *</Label>
              <Input type="date" value={form.data_fim} onChange={(e) => set("data_fim", e.target.value)} />
            </div>
          </div>

          {/* Pesos — apenas 360 e probatório */}
          {!isCheckin && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Pesos do Score Final (soma = 1.0)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Avaliação</Label>
                  <Input type="number" min={0} max={1} step={0.05} value={form.peso_360}
                    onChange={(e) => set("peso_360", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Metas</Label>
                  <Input type="number" min={0} max={1} step={0.05} value={form.peso_metas}
                    onChange={(e) => set("peso_metas", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Produtividade</Label>
                  <Input type="number" min={0} max={1} step={0.05} value={form.peso_prod}
                    onChange={(e) => set("peso_prod", e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createCiclo.isPending}>
            {createCiclo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Ciclo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
