import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export type AsaasBillingType = 'pix' | 'boleto' | 'credit_card';
export type AsaasStatus = 'pending' | 'confirmed' | 'received' | 'overdue' | 'canceled' | 'refunded';

export interface AsaasCharge {
  id: string;
  payment_id: string;
  asaas_id: string;
  billing_type: AsaasBillingType;
  status: AsaasStatus;
  value: number;
  customer_name: string;
  customer_email: string;
  customer_cpf_cnpj: string;
  customer_phone?: string;
  payment_url?: string;
  pix_qr_code?: string;
  pix_expiration_date?: string;
  boleto_url?: string;
  boleto_barcode?: string;
  boleto_expiration_date?: string;
  card_last_digits?: string;
  card_brand?: string;
  card_holder_name?: string;
  due_date: string;
  payment_date?: string;
  confirmed_date?: string;
  created_at: string;
  updated_at: string;
  payment_description?: string;
  client_name?: string;
  client_company?: string;
  has_payment_data?: boolean;
  status_label?: string;
  is_overdue?: boolean;
  days_overdue?: number;
  retry_count?: number;
}

export interface AsaasChargeStats {
  total_charges: number;
  total_value: number;
  paid_charges: number;
  paid_value: number;
  pending_charges: number;
  pending_value: number;
  overdue_charges: number;
  overdue_value: number;
  canceled_charges: number;
  by_billing_type: {
    pix: { count: number; value: number };
    boleto: { count: number; value: number };
    credit_card: { count: number; value: number };
  };
  conversion_rate: number;
}

export interface CardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  brand?: string;
  lastDigits?: string;
}

export function useAsaasCharges(organizationId: string | undefined, options?: { 
  enabled?: boolean;
  status?: AsaasStatus;
  billingType?: AsaasBillingType;
  limit?: number;
  offset?: number;
}) {
  const qc = useQueryClient();
  const enabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey: ["asaas_charges", organizationId, options?.status, options?.billingType, options?.limit, options?.offset],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase.rpc("get_asaas_charges", {
        p_organization_id: organizationId,
        p_status: options?.status,
        p_billing_type: options?.billingType,
        p_limit: options?.limit || 50,
        p_offset: options?.offset || 0
      });

      if (error) throw error;
      return (data || []) as AsaasCharge[];
    },
    enabled: !!organizationId && enabled,
  });

  const createCharge = useMutation({
    mutationFn: async (input: {
      payment_id: string;
      billing_type: AsaasBillingType;
      card_data?: CardData;
      custom_expiration_days?: number;
    }) => {
      if (!organizationId) throw new Error("Sem organização");

      logger.info("Gerando cobrança Asaas", { 
        payment_id: input.payment_id,
        billing_type: input.billing_type,
        has_card_data: !!input.card_data
      }, 'ASAAS');

      // Chamar RPC para gerar cobrança
      const { data, error } = await supabase.rpc("generate_asaas_charge", {
        p_payment_id: input.payment_id,
        p_billing_type: input.billing_type,
        p_card_data: input.card_data ? {
          holderName: input.card_data.holderName,
          number: input.card_data.number,
          expiryMonth: input.card_data.expiryMonth,
          expiryYear: input.card_data.expiryYear,
          cvv: input.card_data.cvv,
          brand: input.card_data.brand,
          lastDigits: input.card_data.number?.slice(-4)
        } : null,
        p_custom_expiration_days: input.custom_expiration_days
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao gerar cobrança");

      // Chamar Edge Function para processar com N8N
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-integration`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            action: "create_charge",
            data: data
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao processar cobrança");
      }

      const result = await response.json();
      
      logger.info("Cobrança Asaas gerada com sucesso", { 
        charge_id: result.charge_id,
        asaas_id: result.asaas_id,
        billing_type: result.billing_type
      }, 'ASAAS');

      return result;
    },
    onSuccess: (data) => {
      toast.success("Cobrança gerada com sucesso!");
      qc.invalidateQueries({ queryKey: ["asaas_charges", organizationId] });
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    },
    onError: (error) => {
      logger.error("Erro ao gerar cobrança Asaas", { 
        error: error.message 
      }, 'ASAAS');
      toast.error(`Erro ao gerar cobrança: ${error.message}`);
    }
  });

  const cancelCharge = useMutation({
    mutationFn: async (asaas_id: string) => {
      if (!organizationId) throw new Error("Sem organização");

      logger.info("Cancelando cobrança Asaas", { asaas_id }, 'ASAAS');

      const { data, error } = await supabase.rpc("cancel_asaas_charge", {
        p_asaas_id: asaas_id,
        p_reason: "Cancelado pelo usuário"
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao cancelar cobrança");

      logger.info("Cobrança Asaas cancelada com sucesso", { asaas_id }, 'ASAAS');

      return data;
    },
    onSuccess: () => {
      toast.success("Cobrança cancelada com sucesso!");
      qc.invalidateQueries({ queryKey: ["asaas_charges", organizationId] });
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    },
    onError: (error) => {
      logger.error("Erro ao cancelar cobrança Asaas", { 
        error: error.message 
      }, 'ASAAS');
      toast.error(`Erro ao cancelar cobrança: ${error.message}`);
    }
  });

  const retryCharge = useMutation({
    mutationFn: async (asaas_id: string) => {
      if (!organizationId) throw new Error("Sem organização");

      logger.info("Tentando gerar cobrança novamente", { asaas_id }, 'ASAAS');

      // Buscar dados da cobrança
      const { data: charge, error: fetchError } = await supabase
        .from("asaas_charges")
        .select("*")
        .eq("asaas_id", asaas_id)
        .single();

      if (fetchError || !charge) {
        throw new Error("Cobrança não encontrada");
      }

      // Gerar nova cobrança
      return createCharge.mutateAsync({
        payment_id: charge.payment_id,
        billing_type: charge.billing_type,
        custom_expiration_days: 3 // 3 dias para retry
      });
    },
    onSuccess: () => {
      toast.success("Nova tentativa de cobrança gerada!");
    },
    onError: (error) => {
      logger.error("Erro ao tentar cobrança novamente", { 
        error: error.message 
      }, 'ASAAS');
      toast.error(`Erro ao tentar novamente: ${error.message}`);
    }
  });

  return {
    charges: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createCharge,
    cancelCharge,
    retryCharge,
    isCreating: createCharge.isPending,
    isCanceling: cancelCharge.isPending,
    isRetrying: retryCharge.isPending
  };
}

export function useAsaasChargeStats(organizationId: string | undefined, options?: {
  dateStart?: string;
  dateEnd?: string;
}) {
  const query = useQuery({
    queryKey: ["asaas_charges_stats", organizationId, options?.dateStart, options?.dateEnd],
    queryFn: async () => {
      if (!organizationId) return null;

      const { data, error } = await supabase.rpc("get_asaas_charges_stats", {
        p_organization_id: organizationId,
        p_date_start: options?.dateStart,
        p_date_end: options?.dateEnd
      });

      if (error) throw error;
      return data as AsaasChargeStats;
    },
    enabled: !!organizationId
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}

// Funções utilitárias
export function formatAsaasStatus(status: AsaasStatus): string {
  const statusMap = {
    pending: "Pendente",
    confirmed: "Confirmado",
    received: "Recebido",
    overdue: "Vencido",
    canceled: "Cancelado",
    refunded: "Reembolsado"
  };
  return statusMap[status] || status;
}

export function getAsaasStatusColor(status: AsaasStatus): string {
  const colorMap = {
    pending: "text-yellow-600",
    confirmed: "text-blue-600",
    received: "text-green-600",
    overdue: "text-red-600",
    canceled: "text-gray-600",
    refunded: "text-purple-600"
  };
  return colorMap[status] || "text-gray-600";
}

export function getBillingTypeIcon(type: AsaasBillingType): string {
  const iconMap = {
    pix: "📱",
    boleto: "📄",
    credit_card: "💳"
  };
  return iconMap[type] || "💰";
}

export function formatBillingType(type: AsaasBillingType): string {
  const typeMap = {
    pix: "PIX",
    boleto: "Boleto",
    credit_card: "Cartão"
  };
  return typeMap[type] || type;
}

export function isChargeOverdue(charge: AsaasCharge): boolean {
  return charge.is_overdue || false;
}

export function getChargeStatusVariant(status: AsaasStatus): "default" | "secondary" | "destructive" | "outline" {
  const variantMap: Record<AsaasStatus, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "default",
    confirmed: "secondary",
    received: "default",
    overdue: "destructive",
    canceled: "outline",
    refunded: "outline"
  };
  return variantMap[status] || "default";
}
