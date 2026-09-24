import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useCommissionEntries, useCreateManualBonus } from "@/hooks/useCommissionEntries";
import { CommissionDetailDialog } from "./CommissionDetailDialog";
import type { CommissionEntry } from "@/types/commission";
import type { ProfileRow } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL } from "@/lib/formatters";

interface Props {
  profile: ProfileRow;
}

const STATUS_LABEL: Record<string, string> = { pending: "Pendente", approved: "Aprovado", paid: "Pago" };
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
};

const HORAS_MES = 220;

function monthLabel(ref: string) {
  const [y, mo] = ref.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[Number(mo) - 1]}/${y}`;
}

export function CommissionConfigTab({ profile }: Props) {
  const orgId = useOrganization();
  const { profile: currentProfile } = useAuth();
  const isAdminOrOwner = currentProfile?.role === "admin" || currentProfile?.role === "owner";

  const { data: entries = [], isLoading } = useCommissionEntries(profile.id);
  const createManualBonus = useCreateManualBonus();

  const [rates, setRates] = useState({
    commission_rate: String(profile.commission_rate ?? 0),
    bonus_rate_120: String(profile.bonus_rate_120 ?? 0),
    bonus_rate_135: String(profile.bonus_rate_135 ?? 0),
    bonus_rate_150: String(profile.bonus_rate_150 ?? 0),
  });
  const [savingRates, setSavingRates] = useState(false);

  // Hora extra — fator armazenado como decimal (ex: 1.5), exibido como % (ex: 50)
  const meta = (profile.metadata ?? {}) as Record<string, unknown>;
  const baseSalary = Number((meta.base_salary as number | string | undefined) ?? 0);
  const storedFactor = Number((meta.overtime_factor as number | string | undefined) ?? 1);
  const storedFactorSpecial = Number((meta.overtime_factor_special as number | string | undefined) ?? 1);

  const [overtimeForm, setOvertimeForm] = useState({
    overtime_factor: String(Math.round((storedFactor - 1) * 100)),
    overtime_factor_special: String(Math.round((storedFactorSpecial - 1) * 100)),
  });
  const [savingOvertime, setSavingOvertime] = useState(false);

  const horaBase = baseSalary > 0 ? baseSalary / HORAS_MES : 0;
  const factorPct = Number(overtimeForm.overtime_factor) || 0;
  const factorSpecialPct = Number(overtimeForm.overtime_factor_special) || 0;
  const valorHoraExtra = horaBase * (1 + factorPct / 100);
  const valorHoraEspecial = horaBase * (1 + factorSpecialPct / 100);

  const handleSaveOvertime = async () => {
    setSavingOvertime(true);
    try {
      const newFactor = 1 + (Number(overtimeForm.overtime_factor) || 0) / 100;
      const newFactorSpecial = 1 + (Number(overtimeForm.overtime_factor_special) || 0) / 100;
      const newMeta = { ...(profile.metadata as Record<string, unknown> ?? {}), overtime_factor: newFactor, overtime_factor_special: newFactorSpecial };
      const { error } = await supabase.from("profiles").update({ metadata: newMeta }).eq("id", profile.id);
      if (error) throw error;
      toast.success("Configuração de hora extra salva");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSavingOvertime(false);
    }
  };

  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ month_reference: "", bonus_value: "", notes: "" });

  const [detailEntry, setDetailEntry] = useState<CommissionEntry | null>(null);

  const handleSaveRates = async () => {
    const commission_rate = Number(rates.commission_rate);
    const bonus_rate_120 = Number(rates.bonus_rate_120);
    const bonus_rate_135 = Number(rates.bonus_rate_135);
    const bonus_rate_150 = Number(rates.bonus_rate_150);

    if ([commission_rate, bonus_rate_120, bonus_rate_135, bonus_rate_150].some((v) => v < 0)) {
      toast.error("Taxas não podem ser negativas");
      return;
    }

    setSavingRates(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ commission_rate, bonus_rate_120, bonus_rate_135, bonus_rate_150 })
        .eq("id", profile.id);
      if (error) throw error;
      toast.success("Configuração salva");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSavingRates(false);
    }
  };

  const handleAddManualBonus = async () => {
    const bonusValue = Number(manualForm.bonus_value);
    if (!manualForm.month_reference || bonusValue <= 0) {
      toast.error("Preencha mês/ano e valor do bônus");
      return;
    }
    const [year, month] = manualForm.month_reference.split("-");
    const monthRef = `${year}-${month}-01`;

    await createManualBonus.mutateAsync({
      organization_id: orgId,
      profile_id: profile.id,
      month_reference: monthRef,
      bonus_value: bonusValue,
      notes: manualForm.notes || null,
    });
    toast.success("Bônus manual adicionado");
    setManualOpen(false);
    setManualForm({ month_reference: "", bonus_value: "", notes: "" });
  };

  const isCommercial = !!(profile as any).closer_id || !!(profile as any).sdr_id;
  const isBoardMember = !!(profile as any).is_board_member;
  const showManualBonus = isAdminOrOwner && !isCommercial && !isBoardMember;

  if (!isAdminOrOwner) return null;

  return (
    <div className="space-y-6">
      {/* Hora Extra */}
      <section>
        <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Hora Extra</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Fator Hora Extra (%)</Label>
            <Input
              type="number" min={0} step={1}
              value={overtimeForm.overtime_factor}
              onChange={(e) => setOvertimeForm((f) => ({ ...f, overtime_factor: e.target.value }))}
              placeholder="Ex: 50 para 50% acima da hora base"
            />
          </div>
          <div className="space-y-1">
            <Label>Fator Dias Especiais — feriado/sáb/dom (%)</Label>
            <Input
              type="number" min={0} step={1}
              value={overtimeForm.overtime_factor_special}
              onChange={(e) => setOvertimeForm((f) => ({ ...f, overtime_factor_special: e.target.value }))}
              placeholder="Ex: 100 para 100% acima da hora base"
            />
          </div>
        </div>

        {/* Cálculo informativo */}
        {baseSalary > 0 && (
          <div className="mt-3 rounded border bg-muted/40 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground block">Hora base ({HORAS_MES}h/mês)</span>
              <span className="font-medium">{formatBRL(horaBase)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Valor hora extra (+{factorPct}%)</span>
              <span className="font-medium">{formatBRL(valorHoraExtra)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Valor hora especial (+{factorSpecialPct}%)</span>
              <span className="font-medium">{formatBRL(valorHoraEspecial)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-3">
          <Button onClick={handleSaveOvertime} disabled={savingOvertime} size="sm">
            {savingOvertime ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : "Salvar Hora Extra"}
          </Button>
        </div>
      </section>

      {/* Configuração de taxas */}
      <section>
        <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Configuração de Comissão e Bônus</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label>Taxa de Comissão (%)</Label>
            <PercentInput value={rates.commission_rate}
              onChange={(v) => setRates((r) => ({ ...r, commission_rate: v }))} />
          </div>
          <div className="space-y-1">
            <Label>Bônus Tier 120% (%)</Label>
            <PercentInput value={rates.bonus_rate_120}
              onChange={(v) => setRates((r) => ({ ...r, bonus_rate_120: v }))} />
          </div>
          <div className="space-y-1">
            <Label>Bônus Tier 135% (%)</Label>
            <PercentInput value={rates.bonus_rate_135}
              onChange={(v) => setRates((r) => ({ ...r, bonus_rate_135: v }))} />
          </div>
          <div className="space-y-1">
            <Label>Bônus Tier 150% (%)</Label>
            <PercentInput value={rates.bonus_rate_150}
              onChange={(v) => setRates((r) => ({ ...r, bonus_rate_150: v }))} />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button onClick={handleSaveRates} disabled={savingRates} size="sm">
            {savingRates ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : "Salvar Configuração"}
          </Button>
        </div>
      </section>

      {/* Botão bônus manual */}
      {showManualBonus && (
        <div>
          <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Bônus Manual
          </Button>
        </div>
      )}

      {/* Histórico */}
      <section>
        <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Histórico de Comissões</p>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma comissão registrada</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês/Ano</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Bônus</TableHead>
                  <TableHead className="text-right">Contratos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{monthLabel(e.month_reference)}</TableCell>
                    <TableCell className="text-right">{formatBRL(e.commission_value)}</TableCell>
                    <TableCell className="text-right">{e.bonus_value > 0 ? formatBRL(e.bonus_value) : "—"}</TableCell>
                    <TableCell className="text-right">{e.contracts_count}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_COLOR[e.status]}>
                        {STATUS_LABEL[e.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setDetailEntry(e)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Dialog bônus manual */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Bônus Manual</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Mês/Ano</Label>
              <Input type="month" value={manualForm.month_reference}
                onChange={(e) => setManualForm((f) => ({ ...f, month_reference: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Valor do Bônus (R$)</Label>
              <Input type="number" min={0} step={0.01} value={manualForm.bonus_value}
                onChange={(e) => setManualForm((f) => ({ ...f, bonus_value: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Input value={manualForm.notes}
                onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddManualBonus} disabled={createManualBonus.isPending}>
              {createManualBonus.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog detalhe */}
      {detailEntry && (
        <CommissionDetailDialog
          entry={detailEntry}
          open={!!detailEntry}
          onClose={() => setDetailEntry(null)}
        />
      )}
    </div>
  );
}

