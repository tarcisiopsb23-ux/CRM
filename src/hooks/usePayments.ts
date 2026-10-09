import { useQuery } from "@tanstack/react-query";
import { supabaseCrm } from "@/lib/supabase";
import { supabaseAuth } from "@/lib/supabase-auth";

export interface PaymentCache {
  id: string;
  tenant_id: string;
  maestria_id: string | null;
  gateway: string;
  gateway_id: string | null;
  gateway_url: string | null;
  description: string;
  amount: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  status: "pendente" | "pago" | "vencido" | "cancelado" | "estornado" | "processando";
  payment_method: string | null;
  installments: number;
  is_recurring: boolean;
  notes: string | null;
  synced_at: string;
  created_at: string;
}

export interface PaymentCard {
  id: string;
  gateway: string;
  last4: string;
  brand: string;
  holder_name: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  created_at: string;
}

const PAYMENT_CARD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-card`;

export function usePayments(tenantId?: string) {
  return useQuery<PaymentCache[]>({
    queryKey: ["payments_cache", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabaseCrm
        .from("payments_cache")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("due_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

export function usePaymentCards(tenantId?: string) {
  return useQuery<PaymentCard[]>({
    queryKey: ["payment_cards", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) return [];
      const res = await fetch(PAYMENT_CARD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: "list" }),
      });
      const data = await res.json();
      return data.cards ?? [];
    },
    enabled: !!tenantId,
  });
}
