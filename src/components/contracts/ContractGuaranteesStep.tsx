/**
 * ContractGuaranteesStep
 *
 * Etapa do wizard de contrato para cadastro de garantias de resultado
 * baseadas em KPIs do cliente. Cada garantia tem:
 *   - KPI vinculada (predefinida global ou personalizada → vai para client_kpis)
 *   - % de crescimento comprometido
 *   - Prazo final para atingir a meta
 *   - Valor base opcional (referência para calcular o crescimento)
 *
 * A etapa é opcional — o usuário pode pular sem adicionar garantias.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus, Trash2, ShieldCheck, TrendingUp, Calendar, Pencil, X, Check,
} from "lucide-react";
import { useClientKPIs } from "@/hooks/useClientKPIs";
import { useOrganization } from "@/hooks/useOrganization";
import { PREDEFINED_KPI_OPTIONS } from "@/hooks/useContractGuarantees";
import type { ContractGuarantee } from "@/lib/contracts/assembleContract";

// ── Tipos locais ──────────────────────────────────────────────────────────────

export interface GuaranteeDraft extends Omit<ContractGuarantee, 'id'> {
  /** UUID real (quando já persistido) ou undefined (draft local) */
  id?: string;
  /** ID da KPI vinculada (se existente no cadastro do cliente) */
  kpi_id?: string | null;
  /** 'predefined' | 'existing' | 'custom' */
  source: 'predefined' | 'existing' | 'custom';
}

interface Props {
  clientId: string;
  guarantees: GuaranteeDraft[];
  onChange: (guarantees: GuaranteeDraft[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); }
  catch { return iso; }
}

const UNIT_LABELS: Record<ContractGuarantee['kpi_unit'], string> = {
  currency:   "R$",
  percentage: "%",
  number:     "un.",
};

// ── Formulário de nova garantia ──────────────────────────────────────────────

interface FormState {
  source: 'predefined' | 'existing' | 'custom';
  predefinedName: string;
  existingKpiId: string;
  customName: string;
  kpi_unit: ContractGuarantee['kpi_unit'];
  growth_percent: string;
  base_value: string;
  deadline: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  source:         'predefined',
  predefinedName: '',
  existingKpiId:  '',
  customName:     '',
  kpi_unit:       'number',
  growth_percent: '',
  base_value:     '',
  deadline:       '',
  notes:          '',
});

// ── Componente principal ──────────────────────────────────────────────────────

export function ContractGuaranteesStep({ clientId, guarantees, onChange }: Props) {
  const organizationId = useOrganization();
  const { data: clientKpis = [] } = useClientKPIs(organizationId, clientId);

  const [showForm, setShowForm] = useState(false);
  const [editIdx,  setEditIdx]  = useState<number | null>(null);
  const [form,     setForm]     = useState<FormState>(emptyForm());

  // Deriva nome e unit conforme source selecionado
  const derivedName = (): string => {
    if (form.source === 'predefined') {
      return PREDEFINED_KPI_OPTIONS.find(k => k.name === form.predefinedName)?.name ?? '';
    }
    if (form.source === 'existing') {
      return clientKpis.find(k => k.id === form.existingKpiId)?.name ?? '';
    }
    return form.customName;
  };

  const derivedUnit = (): ContractGuarantee['kpi_unit'] => {
    if (form.source === 'predefined') {
      return PREDEFINED_KPI_OPTIONS.find(k => k.name === form.predefinedName)?.unit ?? 'number';
    }
    if (form.source === 'existing') {
      return (clientKpis.find(k => k.id === form.existingKpiId)?.unit ?? 'number') as ContractGuarantee['kpi_unit'];
    }
    return form.kpi_unit;
  };

  const openAdd = () => {
    setEditIdx(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (idx: number) => {
    const g = guarantees[idx];
    setEditIdx(idx);
    setForm({
      source:         g.source,
      predefinedName: g.source === 'predefined' ? g.kpi_name : '',
      existingKpiId:  g.source === 'existing'   ? (g.kpi_id ?? '') : '',
      customName:     g.source === 'custom'      ? g.kpi_name : '',
      kpi_unit:       g.kpi_unit,
      growth_percent: String(g.growth_percent),
      base_value:     g.base_value != null ? String(g.base_value) : '',
      deadline:       g.deadline,
      notes:          g.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    const name = derivedName();
    if (!name) { toast.error("Selecione ou informe a KPI."); return; }
    if (!form.growth_percent || isNaN(Number(form.growth_percent)) || Number(form.growth_percent) <= 0) {
      toast.error("Informe o percentual de crescimento."); return;
    }
    if (!form.deadline) { toast.error("Informe o prazo."); return; }

    const draft: GuaranteeDraft = {
      id:             editIdx !== null ? guarantees[editIdx].id : undefined,
      source:         form.source,
      kpi_id:         form.source === 'existing' ? (form.existingKpiId || null) : null,
      kpi_name:       name,
      kpi_unit:       derivedUnit(),
      growth_percent: Number(form.growth_percent),
      base_value:     form.base_value ? Number(form.base_value) : null,
      deadline:       form.deadline,
      notes:          form.notes || null,
    };

    if (editIdx !== null) {
      const updated = [...guarantees];
      updated[editIdx] = draft;
      onChange(updated);
    } else {
      onChange([...guarantees, draft]);
    }

    setShowForm(false);
    setEditIdx(null);
    setForm(emptyForm());
  };

  const handleRemove = (idx: number) => {
    onChange(guarantees.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-500" />
            Garantias de Resultado
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Opcional. Defina as metas de KPI comprometidas no contrato.
            As cláusulas condicionais com <code className="font-mono text-[10px] bg-muted px-1 rounded">has_guarantees</code> serão incluídas automaticamente.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Adicionar garantia
        </Button>
      </div>

      {/* Lista de garantias cadastradas */}
      {guarantees.length > 0 && (
        <div className="space-y-2">
          {guarantees.map((g, idx) => (
            <Card key={idx} className="border-l-4 border-l-violet-400">
              <CardHeader className="py-2.5 px-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-xs font-semibold">{g.kpi_name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {UNIT_LABELS[g.kpi_unit]}
                      </Badge>
                      {g.source === 'custom' && (
                        <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                          Personalizada
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-[11px] flex flex-wrap gap-x-4 gap-y-0.5">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                        Crescimento: <strong>{g.growth_percent}%</strong>
                        {g.base_value != null && ` sobre ${UNIT_LABELS[g.kpi_unit]} ${g.base_value}`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-blue-500" />
                        Prazo: <strong>{fmtDate(g.deadline)}</strong>
                      </span>
                    </CardDescription>
                    {g.notes && (
                      <p className="text-[10px] text-muted-foreground italic">{g.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                      onClick={() => openEdit(idx)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleRemove(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {guarantees.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
          Nenhuma garantia adicionada. Esta etapa é opcional.
        </div>
      )}

      {/* Formulário inline */}
      {showForm && (
        <>
          <Separator />
          <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
            <p className="text-xs font-semibold text-foreground">
              {editIdx !== null ? "Editar garantia" : "Nova garantia"}
            </p>

            {/* Fonte da KPI */}
            <div className="space-y-1.5">
              <Label className="text-xs">Origem da KPI</Label>
              <Select value={form.source}
                onValueChange={v => setForm(p => ({ ...emptyForm(), source: v as FormState['source'] }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="predefined">KPI predefinida (padrão global)</SelectItem>
                  <SelectItem value="existing"
                    disabled={clientKpis.length === 0}>
                    KPI existente do cliente
                    {clientKpis.length === 0 && " (nenhuma cadastrada)"}
                  </SelectItem>
                  <SelectItem value="custom">KPI personalizada (nova)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Seleção por fonte */}
            {form.source === 'predefined' && (
              <div className="space-y-1.5">
                <Label className="text-xs">KPI predefinida <span className="text-red-500">*</span></Label>
                <Select value={form.predefinedName}
                  onValueChange={v => setForm(p => ({ ...p, predefinedName: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wide">Financeiro</SelectLabel>
                      {PREDEFINED_KPI_OPTIONS.filter(k => k.unit === 'currency').map(k => (
                        <SelectItem key={k.name} value={k.name}>{k.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wide">Percentual</SelectLabel>
                      {PREDEFINED_KPI_OPTIONS.filter(k => k.unit === 'percentage').map(k => (
                        <SelectItem key={k.name} value={k.name}>{k.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wide">Número</SelectLabel>
                      {PREDEFINED_KPI_OPTIONS.filter(k => k.unit === 'number').map(k => (
                        <SelectItem key={k.name} value={k.name}>{k.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.source === 'existing' && (
              <div className="space-y-1.5">
                <Label className="text-xs">KPI do cliente <span className="text-red-500">*</span></Label>
                <Select value={form.existingKpiId}
                  onValueChange={v => setForm(p => ({ ...p, existingKpiId: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecione a KPI…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientKpis.map(k => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name}
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({UNIT_LABELS[k.unit as ContractGuarantee['kpi_unit']] ?? k.unit})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.source === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Nome da KPI <span className="text-red-500">*</span></Label>
                  <Input
                    value={form.customName}
                    onChange={e => setForm(p => ({ ...p, customName: e.target.value }))}
                    placeholder="Ex: Conversão de Leads"
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Esta KPI será criada automaticamente no cadastro do cliente.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unidade</Label>
                  <Select value={form.kpi_unit}
                    onValueChange={v => setForm(p => ({ ...p, kpi_unit: v as ContractGuarantee['kpi_unit'] }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="currency">Moeda (R$)</SelectItem>
                      <SelectItem value="percentage">Percentual (%)</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Separator />

            {/* Meta e prazo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Meta de crescimento (%) <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type="number" min={0.1} step={0.1}
                    value={form.growth_percent}
                    onChange={e => setForm(p => ({ ...p, growth_percent: e.target.value }))}
                    placeholder="Ex: 30"
                    className="h-8 text-sm pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Prazo limite <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.deadline}
                  onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">
                  Valor base{" "}
                  <span className="text-[10px] text-muted-foreground">(opcional — referência para o cálculo)</span>
                </Label>
                <Input
                  type="number" min={0}
                  value={form.base_value}
                  onChange={e => setForm(p => ({ ...p, base_value: e.target.value }))}
                  placeholder={`Valor atual da KPI em ${UNIT_LABELS[derivedUnit()]}`}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Notas internas</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Observações que não aparecem no contrato…"
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            {/* Ações do formulário */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost"
                onClick={() => { setShowForm(false); setEditIdx(null); setForm(emptyForm()); }}
                className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSubmit} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {editIdx !== null ? "Atualizar" : "Adicionar"}
              </Button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
