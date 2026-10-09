// src/components/contracts/form/SetupSection.tsx
// Seção de Setup / Taxa de Implantação no formulário de contrato.
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.4

import { AlertTriangle } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PaymentMethodSelect } from "@/components/contracts/form/PaymentMethodSelect";

import { calcSetupParcel } from "@/lib/contracts/calcSetupParcel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupSectionProps {
  /** Whether setup is currently enabled — Requirement 6.1 */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;

  /** Setup field values — Requirements 6.2, 6.3, 6.4 */
  setupValue?: number;
  setupInstallments?: number;
  setupFees?: number;
  setupFirstDueDate?: string;
  setupPaymentMethod?: string;

  /** Used for cross-validation warning — Requirement 7.4 */
  minDurationMonths?: number;

  /** Generic field change handler */
  onFieldChange: (field: string, value: unknown) => void;

  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SetupSection renders a toggle for enabling setup/implantation charges,
 * and when enabled, exposes fields for the setup configuration with a
 * real-time installment preview and a cross-validation warning.
 */
export function SetupSection({
  enabled,
  onEnabledChange,
  setupValue,
  setupInstallments,
  setupFees,
  setupFirstDueDate,
  setupPaymentMethod,
  minDurationMonths,
  onFieldChange,
  disabled,
}: SetupSectionProps) {
  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * When toggle is turned OFF, clear all setup fields — Requirement 6.5.
   * When turned ON, just propagate the change.
   */
  function handleToggle(checked: boolean) {
    onEnabledChange(checked);
    if (!checked) {
      onFieldChange("setup_value", undefined);
      onFieldChange("setup_installments", undefined);
      onFieldChange("setup_fees", undefined);
      onFieldChange("setup_first_due_date", undefined);
      onFieldChange("setup_payment_method", undefined);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  /** Real-time parcel preview — Requirement 6.4 */
  const showParcelPreview =
    enabled &&
    typeof setupValue === "number" &&
    setupValue > 0 &&
    typeof setupInstallments === "number" &&
    setupInstallments > 0;

  const parcelValue = showParcelPreview
    ? calcSetupParcel(setupValue!, setupInstallments!, setupFees ?? 0)
    : null;

  /** Cross-validation warning — Requirement 7.4 */
  const showDurationWarning =
    enabled &&
    (setupInstallments ?? 0) > 1 &&
    (minDurationMonths ?? 0) < (setupInstallments ?? 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Toggle row — Requirement 6.1 ── */}
      <div className="flex items-center gap-3">
        <Switch
          id="setup-enabled"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={disabled}
        />
        <Label
          htmlFor="setup-enabled"
          className="text-sm font-medium cursor-pointer select-none"
        >
          Possui Setup / Taxa de Implantação?
        </Label>
      </div>

      {/* ── Setup fields — only visible when enabled — Requirements 6.2, 6.3 ── */}
      {enabled && (
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", width: "100%", boxSizing: "border-box" }}>

            {/* Valor total do setup */}
            <div className="space-y-1.5" style={{ minWidth: 0 }}>
              <Label htmlFor="setup-value" className="text-sm font-medium">
                Valor total do setup <span className="text-destructive">*</span>
              </Label>
              <Input
                id="setup-value"
                type="number"
                min="0.01"
                step="0.01"
                value={setupValue ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  onFieldChange("setup_value", raw === "" ? undefined : Number(raw));
                }}
                disabled={disabled}
                placeholder="0,00"
              />
            </div>

            {/* Número de parcelas */}
            <div className="space-y-1.5" style={{ minWidth: 0 }}>
              <Label htmlFor="setup-installments" className="text-sm font-medium">
                Número de parcelas <span className="text-destructive">*</span>
              </Label>
              <Input
                id="setup-installments"
                type="number"
                min="1"
                max="12"
                value={setupInstallments ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  onFieldChange("setup_installments", raw === "" ? undefined : Number(raw));
                }}
                disabled={disabled}
                placeholder="1"
              />
            </div>

            {/* Taxa de juros (opcional) */}
            <div className="space-y-1.5" style={{ minWidth: 0 }}>
              <Label htmlFor="setup-fees" className="text-sm font-medium text-muted-foreground">
                Taxa de juros (%) <span className="text-xs font-normal">(opcional)</span>
              </Label>
              <Input
                id="setup-fees"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={setupFees ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  onFieldChange("setup_fees", raw === "" ? undefined : Number(raw));
                }}
                disabled={disabled}
                placeholder="0,00"
              />
            </div>

            {/* Data do 1º vencimento */}
            <div className="space-y-1.5" style={{ minWidth: 0 }}>
              <Label htmlFor="setup-first-due-date" className="text-sm font-medium">
                Data do 1º vencimento <span className="text-destructive">*</span>
              </Label>
              <Input
                id="setup-first-due-date"
                type="date"
                value={setupFirstDueDate ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  onFieldChange("setup_first_due_date", raw === "" ? undefined : raw);
                }}
                disabled={disabled}
              />
            </div>

            {/* Forma de pagamento */}
            <div className="space-y-1.5" style={{ minWidth: 0 }}>
              <Label htmlFor="setup-payment-method" className="text-sm font-medium">
                Forma de pagamento <span className="text-destructive">*</span>
              </Label>
              <PaymentMethodSelect
                value={setupPaymentMethod ?? ""}
                onValueChange={(raw) => onFieldChange("setup_payment_method", raw === "" ? undefined : raw)}
                disabled={disabled}
                placeholder="Selecione..."
              />
            </div>

            {/* Preview de parcela */}
            {showParcelPreview && parcelValue !== null && (
              <div className="space-y-1.5 flex flex-col justify-end" style={{ minWidth: 0 }}>
                <p className="text-sm text-muted-foreground">
                  Valor por parcela:{" "}
                  <strong className="text-foreground">
                    R$ {parcelValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </strong>
                </p>
              </div>
            )}

          </div>

          {/* Aviso de prazo mínimo — ocupa largura total */}
          {showDurationWarning && (
            <div className="mt-4">
              <Alert variant="default" className="border-yellow-500/50 text-yellow-700 bg-yellow-50 dark:bg-yellow-950/20 dark:text-yellow-400 [&>svg]:text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O prazo mínimo de permanência não pode ser menor que o número
                  de parcelas do setup ({setupInstallments} meses).
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
