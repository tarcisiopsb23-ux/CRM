import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  QrCode, 
  FileText, 
  CreditCard, 
  Copy, 
  ExternalLink, 
  RefreshCw, 
  X, 
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle
} from "lucide-react";
import { 
  AsaasCharge, 
  formatAsaasStatus, 
  getAsaasStatusColor, 
  getBillingTypeIcon, 
  formatBillingType,
  isChargeOverdue
} from "@/hooks/useAsaasCharges";
import { formatBRL } from "@/lib/formatters";
import { toast } from "sonner";

interface AsaasChargeCardProps {
  charge: AsaasCharge;
  onCancel?: (asaasId: string) => void;
  onRetry?: (asaasId: string) => void;
  isCanceling?: boolean;
  isRetrying?: boolean;
}

export function AsaasChargeCard({ 
  charge, 
  onCancel, 
  onRetry, 
  isCanceling = false, 
  isRetrying = false 
}: AsaasChargeCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const handleCopyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado!`);
    } catch (error) {
      toast.error("Erro ao copiar");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "confirmed":
        return <AlertTriangle className="h-4 w-4" />;
      case "received":
        return <CheckCircle className="h-4 w-4" />;
      case "overdue":
        return <AlertTriangle className="h-4 w-4" />;
      case "canceled":
        return <XCircle className="h-4 w-4" />;
      case "refunded":
        return <RefreshCw className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const canCancel = charge.status === "pending" || charge.status === "confirmed";
  const canRetry = charge.status === "canceled" && charge.retry_count < 3;

  return (
    <Card className={`w-full ${isChargeOverdue(charge) ? 'border-red-200' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getBillingTypeIcon(charge.billing_type)}
            <CardTitle className="text-base">{formatBillingType(charge.billing_type)}</CardTitle>
            <Badge variant={charge.status === "received" ? "default" : "secondary"}>
              {formatAsaasStatus(charge.status)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(charge.status)}
            <span className={`text-sm font-medium ${getAsaasStatusColor(charge.status)}`}>
              {formatAsaasStatus(charge.status)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Informações principais */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Valor:</span>
            <p className="font-semibold text-lg">{formatBRL(charge.value)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Vencimento:</span>
            <p className="font-medium">
              {new Date(charge.due_date).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Cliente */}
        <div className="text-sm">
          <span className="text-muted-foreground">Cliente:</span>
          <p className="font-medium">{charge.customer_name}</p>
          <p className="text-xs text-muted-foreground">{charge.customer_email}</p>
        </div>

        {/* Descrição */}
        {charge.payment_description && (
          <div className="text-sm">
            <span className="text-muted-foreground">Descrição:</span>
            <p className="font-medium">{charge.payment_description}</p>
          </div>
        )}

        {/* Status de vencimento */}
        {isChargeOverdue(charge) && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Vencido há {Math.abs(charge.days_overdue || 0)} dias
            </span>
          </div>
        )}

        {/* Links de pagamento */}
        {(charge.pix_qr_code || charge.boleto_url || charge.payment_url) && (
          <div className="space-y-3">
            <Separator />
            <div className="text-sm font-medium">Links de Pagamento:</div>
            
            {/* PIX */}
            {charge.pix_qr_code && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <QrCode className="h-4 w-4" />
                  <span>PIX</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDetails(!showDetails)}
                  >
                    {showDetails ? "Ocultar" : "Mostrar"} QR Code
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyToClipboard(charge.payment_url || "", "Código PIX")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {showDetails && (
                  <div className="text-center p-4 bg-gray-50 rounded">
                    <img
                      src={`data:image/png;base64,${charge.pix_qr_code}`}
                      alt="QR Code PIX"
                      className="mx-auto max-w-32"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Boleto */}
            {charge.boleto_url && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  <span>Boleto</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(charge.boleto_url, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir Boleto
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyToClipboard(charge.boleto_url, "Link do Boleto")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Cartão */}
            {charge.billing_type === "credit_card" && charge.card_last_digits && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4" />
                  <span>Cartão</span>
                </div>
                <p className="font-mono text-sm">
                  **** **** **** {charge.card_last_digits}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Datas importantes */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Criado em: {new Date(charge.created_at).toLocaleString('pt-BR')}</p>
          {charge.payment_date && (
            <p>Pago em: {new Date(charge.payment_date).toLocaleString('pt-BR')}</p>
          )}
          {charge.confirmed_date && (
            <p>Confirmado em: {new Date(charge.confirmed_date).toLocaleString('pt-BR')}</p>
          )}
        </div>

        {/* Ações */}
        {(canCancel || canRetry) && (
          <div className="flex gap-2 pt-2">
            {canCancel && onCancel && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onCancel(charge.asaas_id)}
                disabled={isCanceling}
              >
                {isCanceling ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Cancelando...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </>
                )}
              </Button>
            )}
            {canRetry && onRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRetry(charge.asaas_id)}
                disabled={isRetrying}
              >
                {isRetrying ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Tentando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Tentar Novamente
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* ID da cobrança */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          ID Asaas: {charge.asaas_id}
        </div>
      </CardContent>
    </Card>
  );
}
