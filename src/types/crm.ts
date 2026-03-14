export type RegistrationType = "prospeccao" | "cliente";
export type ContractType = "servico" | "trimestral" | "semestral" | "anual";
export type PaymentPeriodicity = "pagamento_unico" | "50_50" | "mensal" | "trimestral" | "semestral" | "anual";

export interface Client {
  id: string;
  organization_id: string;
  lead_id: string | null;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  decision_maker_name?: string | null;
  decision_maker_phone?: string | null;
  registration_date: string | null;
  registration_type: RegistrationType | null;
  niche: string | null;
  origin: string | null;
  revenue: number | null;
  priority: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  organization_id: string;
  client_id: string;
  responsible_id: string | null;
  title: string;
  value: number;
  status: string;
  start_date: string;
  end_date: string | null;
  service_contracted: string | null;
  contract_type: ContractType | null;
  periodicity: PaymentPeriodicity | null;
  contract_date: string | null;
  duration_months?: number | null;
  first_payment_value?: number | null;
  first_payment_due_date?: string | null;
  first_payment_method?: string | null;
  first_payment_installments?: number | null;
  first_payment_fees?: number | null;
  first_payment_split?: boolean | null;
  first_payment_second_due_date?: string | null;
  recurring_due_date?: string | null;
  ended_at?: string | null;
  ended_reason?: string | null;
  ended_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  organization_id: string;
  contract_id: string | null;
  client_id: string;
  description: string;
  value: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  payment_method: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  organization_id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  service_category: string | null;
  pix: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SupplierExpense {
  id: string;
  organization_id: string;
  supplier_id: string;
  description: string;
  value: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
