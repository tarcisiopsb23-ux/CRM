/**
 * InvoiceEmitModal.tsx
 * Modal de emissão manual de NFS-e.
 * Requisitos: 2.1, 2.2, 2.3, 2.8, 2.9, 10.1, 10.2, 10.4, 10.5
 */

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInvoices } from "@/hooks/useInvoices";
import { useClients } from "@/hooks/useClients";
import { useContractsByClient } from "@/hooks/useContracts";
import { useIntegration } from "@/hooks/useSettings";
import {
  validateValorServico,
  validateCompetencia,
  resolveCodigoServico,
  resolveServicoMapping,
} from "@/lib/fiscalValidators";
import type { NotaasConfig } from "@/types/fiscal";
import type { Client } from "@/types/crm";
import type { ContractRow } from "@/hooks/useContracts";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns current month as YYYY-MM */
function currentCompetencia(): string {
  return format(new Date(), "yyyy-MM");
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  client_id: string;
  contract_id: string;
  payment_id: string;
  valor_servico: string;
  codigo_servico: string;
  descricao_servico: string;
  competencia: string;
  aliquota_iss: string;
}

interface FormErrors {
  client_id?: string;
  valor_servico?: string;
  codigo_servico?: string;
  descricao_servico?: string;
  competencia?: string;
  aliquota_iss?: string;
}

export interface InvoiceEmitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  defaultClientId?: string;
  defaultContractId?: string;
  defaultPaymentId?: string;
  defaultValorServico?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoiceEmitModal({
  open,
  onOpenChange,
  organizationId,
  defaultClientId,
  defaultContractId,
  defaultPaymentId,
  defaultValorServico,
}: InvoiceEmitModalProps) {
  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: clients = [] } = useClients(organizationId);
  const integrationQuery = useIntegration(organizationId, "notaas");
  const notaasConfig = (integrationQuery.data?.config ?? {}) as NotaasConfig;
  const { emit } = useInvoices(organizationId);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState>({
    client_id: defaultClientId ?? "",
    contract_id: defaultContractId ?? "",
    payment_id: defaultPaymentId ?? "",
    valor_servico: defaultValorServico != null ? String(defaultValorServico) : "",
    codigo_servico: notaasConfig.codigo_servico_padrao ?? "",
    descricao_servico: notaasConfig.descricao_servico_padrao ?? "",
    competencia: currentCompetencia(),
    aliquota_iss: notaasConfig.aliquota_iss_padrao != null ? String(notaasConfig.aliquota_iss_padrao) : "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Contracts for selected client ──────────────────────────────────────────
  const contractsQuery = useContractsByClient(
    organizationId,
    form.client_id || undefined
  );
  const contracts: ContractRow[] = contractsQuery.data ?? [];

  // ── Pre-fill from settings when modal opens ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      client_id: defaultClientId ?? "",
      contract_id: defaultContractId ?? "",
      payment_id: defaultPaymentId ?? "",
      valor_servico: defaultValorServico != null ? String(defaultValorServico) : "",
      // Req 2.2: pre-fill from settings
      codigo_servico: notaasConfig.codigo_servico_padrao ?? "",
      descricao_servico: notaasConfig.descricao_servico_padrao ?? "",
      competencia: currentCompetencia(),
      aliquota_iss: notaasConfig.aliquota_iss_padrao != null ? String(notaasConfig.aliquota_iss_padrao) : "",
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selected client object ─────────────────────────────────────────────────
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === form.client_id) ?? null,
    [clients, form.client_id]
  );

  // ── Selected contract object ───────────────────────────────────────────────
  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === form.contract_id) ?? null,
    [contracts, form.contract_id]
  );

  // ── Req 10.5: Pre-fill tomador when client changes ─────────────────────────
  // (tomador data is used at submit time from selectedClient — no extra state needed)

  // ── Req 2.3: Pre-fill codigo_servico, descricao e aliquota when contract changes ──
  useEffect(() => {
    if (!selectedContract) return;
    const contractType = selectedContract.billing_cycle ?? (selectedContract as any).contract_type ?? null;
    // Tenta o mapeamento rico primeiro
    const mapping = resolveServicoMapping(contractType, notaasConfig);
    if (mapping) {
      setForm((prev) => ({
        ...prev,
        codigo_servico:    mapping.codigo || prev.codigo_servico,
        descricao_servico: mapping.descricao || prev.descricao_servico,
        aliquota_iss:      mapping.aliquota != null
          ? String(mapping.aliquota)
          : prev.aliquota_iss,
      }));
    } else {
      // Fallback: apenas código padrão
      const resolved = resolveCodigoServico(contractType, notaasConfig);
      if (resolved) setForm((prev) => ({ ...prev, codigo_servico: resolved }));
    }
  }, [selectedContract?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error on change
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleClientChange = (clientId: string) => {
    setForm((prev) => ({
      ...prev,
      client_id: clientId,
      // Reset contract when client changes
      contract_id: "",
    }));
    if (errors.client_id) setErrors((prev) => ({ ...prev, client_id: undefined }));
  };

  const handleContractChange = (contractId: string) => {
    if (contractId === "__none__") {
      setForm((prev) => ({ ...prev, contract_id: "" }));
      return;
    }
    const contract = contracts.find((c) => c.id === contractId) ?? null;
    const contractType = contract
      ? (contract.billing_cycle ?? (contract as any).contract_type ?? null)
      : null;
    // Tenta mapeamento rico (código + descrição + alíquota)
    const mapping = contract ? resolveServicoMapping(contractType, notaasConfig) : null;
    if (mapping) {
      setForm((prev) => ({
        ...prev,
        contract_id:       contractId,
        codigo_servico:    mapping.codigo    || prev.codigo_servico,
        descricao_servico: mapping.descricao || prev.descricao_servico,
        aliquota_iss:      mapping.aliquota != null
          ? String(mapping.aliquota)
          : prev.aliquota_iss,
      }));
    } else {
      const resolved = contract ? resolveCodigoServico(contractType, notaasConfig) : null;
      setForm((prev) => ({
        ...prev,
        contract_id: contractId,
        ...(resolved ? { codigo_servico: resolved } : {}),
      }));
    }
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.client_id) {
      newErrors.client_id = "Selecione um cliente.";
    }

    const valorNum = parseFloat(form.valor_servico);
    if (!form.valor_servico || isNaN(valorNum) || !validateValorServico(valorNum)) {
      newErrors.valor_servico = "Valor do serviço deve ser maior que R$ 0,00.";
    }

    if (!form.codigo_servico.trim()) {
      newErrors.codigo_servico = "Código de serviço é obrigatório.";
    }

    if (!form.descricao_servico.trim()) {
      newErrors.descricao_servico = "Descrição do serviço é obrigatória.";
    }

    if (!validateCompetencia(form.competencia)) {
      newErrors.competencia = "Competência deve estar no formato AAAA-MM (ex: 2024-01).";
    }

    const aliquotaNum = parseFloat(form.aliquota_iss);
    if (form.aliquota_iss === "" || isNaN(aliquotaNum) || aliquotaNum < 0 || aliquotaNum > 100) {
      newErrors.aliquota_iss = "Alíquota ISS deve ser um valor entre 0 e 100.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!selectedClient) return;

    setIsSubmitting(true);
    try {
      const result = await emit.mutateAsync({
        formData: {
          client_id: form.client_id,
          contract_id: form.contract_id || undefined,
          payment_id: form.payment_id || undefined,
          valor_servico: parseFloat(form.valor_servico),
          codigo_servico: form.codigo_servico.trim(),
          descricao_servico: form.descricao_servico.trim(),
          competencia: form.competencia,
          aliquota_iss: parseFloat(form.aliquota_iss),
        },
        client: selectedClient as Client,
        notaasConfig,
      });

      // Req 10.1: success toast — diferencia emissão direta (número disponível) de via n8n (processando)
      const numero = result?.numero;
      const viaN8n = result?.status === "processando" && !numero;
      toast.success(
        viaN8n
          ? "Solicitação enviada ao n8n. A nota será emitida em instantes."
          : numero
          ? `NFS-e nº ${numero} emitida com sucesso!`
          : "NFS-e emitida com sucesso!"
      );
      onOpenChange(false);
    } catch (err) {
      // Req 10.2: error toast with API message
      const msg = err instanceof Error ? err.message : "Erro ao emitir NFS-e.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}>
      <DialogContent className="w-[65vw] max-w-[65vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emitir NFS-e</DialogTitle>
          <DialogDescription>
            Preencha os dados para emissão da Nota Fiscal de Serviços Eletrônica.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── Cliente ── */}
          <div className="space-y-1.5">
            <Label htmlFor="emit-client">
              Cliente <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.client_id}
              onValueChange={handleClientChange}
              disabled={isSubmitting}
            >
              <SelectTrigger id="emit-client" className={errors.client_id ? "border-red-500" : ""}>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company ? `${c.company} — ${c.name}` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.client_id && (
              <p className="text-xs text-red-500">{errors.client_id}</p>
            )}
          </div>

          {/* ── Tomador preview (Req 10.5) ── */}
          {selectedClient && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-0.5">
              <p className="font-medium text-foreground">
                {selectedClient.company || selectedClient.name}
              </p>
              {selectedClient.document && (
                <p className="text-muted-foreground">
                  CPF/CNPJ: {selectedClient.document}
                </p>
              )}
              {selectedClient.email && (
                <p className="text-muted-foreground">{selectedClient.email}</p>
              )}
              {selectedClient.address_city && (
                <p className="text-muted-foreground">
                  {[
                    selectedClient.address_street,
                    selectedClient.address_number,
                    selectedClient.address_city,
                    selectedClient.address_state,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </div>
          )}

          {/* ── Contrato (opcional) ── */}
          <div className="space-y-1.5">
            <Label htmlFor="emit-contract">Contrato (opcional)</Label>
            <Select
              value={form.contract_id || "__none__"}
              onValueChange={handleContractChange}
              disabled={isSubmitting || !form.client_id}
            >
              <SelectTrigger id="emit-contract">
                <SelectValue placeholder={form.client_id ? "Selecione um contrato" : "Selecione um cliente primeiro"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {contracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Pagamento (opcional) ── */}
          <div className="space-y-1.5">
            <Label htmlFor="emit-payment">ID do Pagamento (opcional)</Label>
            <Input
              id="emit-payment"
              placeholder="UUID do pagamento vinculado"
              value={form.payment_id}
              onChange={(e) => setField("payment_id", e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* ── Valor do serviço ── */}
          <div className="space-y-1.5">
            <Label htmlFor="emit-valor">
              Valor do Serviço (R$) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="emit-valor"
              type="number"
              min={0.01}
              step={0.01}
              placeholder="0,00"
              value={form.valor_servico}
              onChange={(e) => setField("valor_servico", e.target.value)}
              disabled={isSubmitting}
              className={errors.valor_servico ? "border-red-500" : ""}
            />
            {errors.valor_servico && (
              <p className="text-xs text-red-500">{errors.valor_servico}</p>
            )}
          </div>

          {/* ── Código de serviço ── */}
          <div className="space-y-1.5">
            <Label htmlFor="emit-codigo">
              Código de Serviço (LC 116) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="emit-codigo"
              placeholder="Ex: 17.06"
              value={form.codigo_servico}
              onChange={(e) => setField("codigo_servico", e.target.value)}
              disabled={isSubmitting}
              className={errors.codigo_servico ? "border-red-500" : ""}
            />
            {errors.codigo_servico && (
              <p className="text-xs text-red-500">{errors.codigo_servico}</p>
            )}
          </div>

          {/* ── Descrição do serviço ── */}
          <div className="space-y-1.5">
            <Label htmlFor="emit-descricao">
              Descrição do Serviço <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="emit-descricao"
              placeholder="Descreva o serviço prestado"
              value={form.descricao_servico}
              onChange={(e) => setField("descricao_servico", e.target.value)}
              disabled={isSubmitting}
              rows={3}
              className={errors.descricao_servico ? "border-red-500" : ""}
            />
            {errors.descricao_servico && (
              <p className="text-xs text-red-500">{errors.descricao_servico}</p>
            )}
          </div>

          {/* ── Competência ── */}
          <div className="space-y-1.5">
            <Label htmlFor="emit-competencia">
              Competência <span className="text-red-500">*</span>
            </Label>
            <Input
              id="emit-competencia"
              placeholder="AAAA-MM (ex: 2024-01)"
              value={form.competencia}
              onChange={(e) => setField("competencia", e.target.value)}
              disabled={isSubmitting}
              className={errors.competencia ? "border-red-500" : ""}
            />
            {errors.competencia && (
              <p className="text-xs text-red-500">{errors.competencia}</p>
            )}
          </div>

          {/* ── Alíquota ISS ── */}
          <div className="space-y-1.5">
            <Label htmlFor="emit-aliquota">
              Alíquota ISS (%) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="emit-aliquota"
              type="number"
              min={0}
              max={100}
              step={0.01}
              placeholder="Ex: 5"
              value={form.aliquota_iss}
              onChange={(e) => setField("aliquota_iss", e.target.value)}
              disabled={isSubmitting}
              className={errors.aliquota_iss ? "border-red-500" : ""}
            />
            {errors.aliquota_iss && (
              <p className="text-xs text-red-500">{errors.aliquota_iss}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          {/* Req 10.4: spinner + disabled during submission */}
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Emitindo…
              </>
            ) : (
              "Emitir NFS-e"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
