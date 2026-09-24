/**
 * usePaymentMethods
 *
 * Retorna as formas de pagamento disponíveis para a organização.
 * Uma forma de pagamento automatizada (PIX, Boleto, Cartão) só aparece
 * se AMBOS os webhooks estiverem configurados:
 *   - Webhook de envio  (CRM → n8n): para gerar a cobrança
 *   - Webhook de retorno (Asaas → n8n → CRM): para confirmar o pagamento
 *
 * "Pagamento Manual" sempre aparece, independente de configuração.
 */
import { useOrganization } from "@/hooks/useOrganization";
import { useIntegration } from "@/hooks/useSettings";
import type { N8nConfig } from "@/types/settings";

export interface PaymentMethodOption {
  value: string;
  label: string;
  automated: boolean;
  /** URL chamada pelo CRM para gerar a cobrança */
  webhookUrl?: string;
  /** URL registrada no Asaas para receber confirmações */
  returnWebhookUrl?: string;
}

/** Sempre disponível — não depende de webhook */
const MANUAL_OPTION: PaymentMethodOption = {
  value: "manual",
  label: "Pagamento Manual",
  automated: false,
};

/** Verifica se ambos os webhooks estão preenchidos */
function bothConfigured(send?: string, receive?: string): boolean {
  return !!(send?.trim() && receive?.trim());
}

export function usePaymentMethods(): {
  methods: PaymentMethodOption[];
  isLoading: boolean;
  pixConfigured: boolean;
  boletoConfigured: boolean;
  cartaoConfigured: boolean;
} {
  const organizationId = useOrganization();
  const { data, isLoading } = useIntegration(organizationId, "n8n");

  const config = (data as unknown as { config?: N8nConfig } | null)?.config ?? {};

  const pixConfigured    = bothConfigured(config.pixWebhookUrl,    config.pixReturnWebhookUrl);
  const boletoConfigured = bothConfigured(config.boletoWebhookUrl, config.boletoReturnWebhookUrl);
  const cartaoConfigured = bothConfigured(config.cartaoWebhookUrl, config.cartaoReturnWebhookUrl);

  const methods: PaymentMethodOption[] = [];

  if (pixConfigured) {
    methods.push({
      value: "pix",
      label: "PIX",
      automated: true,
      webhookUrl:       config.pixWebhookUrl,
      returnWebhookUrl: config.pixReturnWebhookUrl,
    });
  }

  if (boletoConfigured) {
    methods.push({
      value: "boleto",
      label: "Boleto",
      automated: true,
      webhookUrl:       config.boletoWebhookUrl,
      returnWebhookUrl: config.boletoReturnWebhookUrl,
    });
  }

  if (cartaoConfigured) {
    methods.push({
      value: "cartao",
      label: "Cartão de Crédito",
      automated: true,
      webhookUrl:       config.cartaoWebhookUrl,
      returnWebhookUrl: config.cartaoReturnWebhookUrl,
    });
  }

  // Manual sempre disponível
  methods.push(MANUAL_OPTION);

  return { methods, isLoading, pixConfigured, boletoConfigured, cartaoConfigured };
}
