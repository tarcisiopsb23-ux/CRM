export type CommissionEntryStatus = 'pending' | 'approved' | 'paid';
export type CommissionEntryType   = 'automatic' | 'manual';

export interface CommissionEntry {
  id:                string;
  organization_id:   string;
  profile_id:        string;
  month_reference:   string;       // YYYY-MM-01
  total_sales_value: number;
  contracts_count:   number;
  commission_rate:   number;
  commission_value:  number;
  goal_id:           string | null;
  goal_target:       number | null;
  goal_achieved_pct: number | null;
  bonus_rate:        number;
  bonus_value:       number;
  is_board_member:   boolean;
  entry_type:        CommissionEntryType;
  status:            CommissionEntryStatus;
  notes:             string | null;
  created_at:        string;
  updated_at:        string;
}

export interface CommissionEntrySale {
  id:                  string;
  commission_entry_id: string;
  contract_id:         string;
  client_name:         string;
  product:             string | null;
  sale_date:           string | null;
  first_payment_date:  string | null;
  value:               number;
  created_at:          string;
}
