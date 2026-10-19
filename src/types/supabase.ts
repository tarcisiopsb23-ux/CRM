export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          account_external_id: string
          account_name: string
          created_at: string | null
          currency: string | null
          id: string
          organization_id: string
          platform: string
          status: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          account_external_id: string
          account_name: string
          created_at?: string | null
          currency?: string | null
          id?: string
          organization_id: string
          platform: string
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          account_external_id?: string
          account_name?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          organization_id?: string
          platform?: string
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_at: string | null
          changed_by: string | null
          changes: Json | null
          id: string
          organization_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_by?: string | null
          changes?: Json | null
          id?: string
          organization_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_by?: string | null
          changes?: Json | null
          id?: string
          organization_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_metrics: {
        Row: {
          campaign_id: string
          clicks: number | null
          conversions: number | null
          cpa: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          leads: number | null
          organization_id: string
          reach: number | null
          revenue: number | null
          roas: number | null
          spend: number | null
        }
        Insert: {
          campaign_id: string
          clicks?: number | null
          conversions?: number | null
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          leads?: number | null
          organization_id: string
          reach?: number | null
          revenue?: number | null
          roas?: number | null
          spend?: number | null
        }
        Update: {
          campaign_id?: string
          clicks?: number | null
          conversions?: number | null
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          leads?: number | null
          organization_id?: string
          reach?: number | null
          revenue?: number | null
          roas?: number | null
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_spend"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_spend_legacy_20260311_231633"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_spend_v2"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ad_account_id: string
          budget_amount: number | null
          budget_type: string | null
          campaign_external_id: string
          created_at: string | null
          end_date: string | null
          id: string
          name: string
          objective: string | null
          organization_id: string
          platform: string
          start_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          ad_account_id: string
          budget_amount?: number | null
          budget_type?: string | null
          campaign_external_id: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          name: string
          objective?: string | null
          organization_id: string
          platform: string
          start_date?: string | null
          status: string
          updated_at?: string | null
        }
        Update: {
          ad_account_id?: string
          budget_amount?: number | null
          budget_type?: string | null
          campaign_external_id?: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          name?: string
          objective?: string | null
          organization_id?: string
          platform?: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_spend"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_spend_legacy_20260311_231633"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_spend_v2"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_history: {
        Row: {
          created_at: string | null
          id: number
          message: string | null
          message_type: string | null
          metadata: Json | null
          role: string
          session_id: string
          telefone: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          message?: string | null
          message_type?: string | null
          metadata?: Json | null
          role: string
          session_id: string
          telefone: string
        }
        Update: {
          created_at?: string | null
          id?: number
          message?: string | null
          message_type?: string | null
          metadata?: Json | null
          role?: string
          session_id?: string
          telefone?: string
        }
        Relationships: []
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          name: string
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          company: string | null
          created_at: string | null
          decision_maker_name: string | null
          decision_maker_phone: string | null
          document: string | null
          email: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          name: string
          niche: string | null
          organization_id: string
          origin: string | null
          phone: string | null
          priority: string | null
          registration_date: string | null
          registration_type:
            | Database["public"]["Enums"]["registration_type"]
            | null
          responsible_name: string | null
          responsible_phone: string | null
          revenue: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          company?: string | null
          created_at?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          document?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          name: string
          niche?: string | null
          organization_id: string
          origin?: string | null
          phone?: string | null
          priority?: string | null
          registration_date?: string | null
          registration_type?:
            | Database["public"]["Enums"]["registration_type"]
            | null
          responsible_name?: string | null
          responsible_phone?: string | null
          revenue?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          company?: string | null
          created_at?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          document?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          name?: string
          niche?: string | null
          organization_id?: string
          origin?: string | null
          phone?: string | null
          priority?: string | null
          registration_date?: string | null
          registration_type?:
            | Database["public"]["Enums"]["registration_type"]
            | null
          responsible_name?: string | null
          responsible_phone?: string | null
          revenue?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_lifecycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          billing_cycle: string | null
          client_id: string
          contract_date: string | null
          contract_type:
            | Database["public"]["Enums"]["contract_type_enum"]
            | null
          created_at: string | null
          description: string | null
          duration_months: number | null
          end_date: string | null
          ended_at: string | null
          ended_by: string | null
          ended_reason: string | null
          first_payment_due_date: string | null
          first_payment_fees: number | null
          first_payment_installments: number | null
          first_payment_method: string | null
          first_payment_second_due_date: string | null
          first_payment_split: boolean | null
          first_payment_value: number | null
          id: string
          metadata: Json | null
          organization_id: string
          periodicity: Database["public"]["Enums"]["payment_periodicity"] | null
          recurring_due_date: string | null
          responsible_id: string | null
          service_contracted: string | null
          signed_at: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"] | null
          terms: string | null
          title: string
          updated_at: string | null
          value: number
        }
        Insert: {
          billing_cycle?: string | null
          client_id: string
          contract_date?: string | null
          contract_type?:
            | Database["public"]["Enums"]["contract_type_enum"]
            | null
          created_at?: string | null
          description?: string | null
          duration_months?: number | null
          end_date?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_reason?: string | null
          first_payment_due_date?: string | null
          first_payment_fees?: number | null
          first_payment_installments?: number | null
          first_payment_method?: string | null
          first_payment_second_due_date?: string | null
          first_payment_split?: boolean | null
          first_payment_value?: number | null
          id?: string
          metadata?: Json | null
          organization_id: string
          periodicity?:
            | Database["public"]["Enums"]["payment_periodicity"]
            | null
          recurring_due_date?: string | null
          responsible_id?: string | null
          service_contracted?: string | null
          signed_at?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"] | null
          terms?: string | null
          title: string
          updated_at?: string | null
          value: number
        }
        Update: {
          billing_cycle?: string | null
          client_id?: string
          contract_date?: string | null
          contract_type?:
            | Database["public"]["Enums"]["contract_type_enum"]
            | null
          created_at?: string | null
          description?: string | null
          duration_months?: number | null
          end_date?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_reason?: string | null
          first_payment_due_date?: string | null
          first_payment_fees?: number | null
          first_payment_installments?: number | null
          first_payment_method?: string | null
          first_payment_second_due_date?: string | null
          first_payment_split?: boolean | null
          first_payment_value?: number | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          periodicity?:
            | Database["public"]["Enums"]["payment_periodicity"]
            | null
          recurring_due_date?: string | null
          responsible_id?: string | null
          service_contracted?: string | null
          signed_at?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"] | null
          terms?: string | null
          title?: string
          updated_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dados_cliente: {
        Row: {
          created_at: string
          id: number
          nomewpp: string | null
          telefone: string | null
        }
        Insert: {
          created_at: string
          id?: number
          nomewpp?: string | null
          telefone?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          nomewpp?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      db_c8_rag: {
        Row: {
          content: string | null
          embedding: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          content: string | null
          embedding: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      event_attendees: {
        Row: {
          event_id: string
          external_email: string | null
          id: string
          profile_id: string | null
          status: string | null
          team_id: string | null
        }
        Insert: {
          event_id: string
          external_email?: string | null
          id?: string
          profile_id?: string | null
          status?: string | null
          team_id?: string | null
        }
        Update: {
          event_id?: string
          external_email?: string | null
          id?: string
          profile_id?: string | null
          status?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean | null
          assigned_to: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_at: string
          event_type: Database["public"]["Enums"]["event_type"] | null
          id: string
          lead_id: string | null
          location: string | null
          meeting_url: string | null
          metadata: Json | null
          organization_id: string
          profile_id: string | null
          project_id: string | null
          reminders: Json | null
          start_at: string
          team_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_at: string
          event_type?: Database["public"]["Enums"]["event_type"] | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          organization_id: string
          profile_id?: string | null
          project_id?: string | null
          reminders?: Json | null
          start_at: string
          team_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_at?: string
          event_type?: Database["public"]["Enums"]["event_type"] | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          organization_id?: string
          profile_id?: string | null
          project_id?: string | null
          reminders?: Json | null
          start_at?: string
          team_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_lifecycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          category_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          category_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          category_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_progress: {
        Row: {
          goal_id: string
          id: string
          notes: string | null
          recorded_at: string | null
          value: number
        }
        Insert: {
          goal_id: string
          id?: string
          notes?: string | null
          recorded_at?: string | null
          value: number
        }
        Update: {
          goal_id?: string
          id?: string
          notes?: string | null
          recorded_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "goal_progress_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          current_value: number | null
          description: string | null
          id: string
          indicator: Database["public"]["Enums"]["goal_indicator"] | null
          metadata: Json | null
          organization_id: string
          period: Database["public"]["Enums"]["goal_period"]
          period_end: string
          period_start: string
          target_value: number
          team_id: string | null
          title: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          current_value?: number | null
          description?: string | null
          id?: string
          indicator?: Database["public"]["Enums"]["goal_indicator"] | null
          metadata?: Json | null
          organization_id: string
          period: Database["public"]["Enums"]["goal_period"]
          period_end: string
          period_start: string
          target_value: number
          team_id?: string | null
          title: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          current_value?: number | null
          description?: string | null
          id?: string
          indicator?: Database["public"]["Enums"]["goal_indicator"] | null
          metadata?: Json | null
          organization_id?: string
          period?: Database["public"]["Enums"]["goal_period"]
          period_end?: string
          period_start?: string
          target_value?: number
          team_id?: string | null
          title?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_tokens: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          expires_at: string
          id: string
          organization_id: string
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          organization_id: string
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitation_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_title_catalog: {
        Row: {
          created_at: string | null
          id: string
          job_title: string
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_title: string
          organization_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_title?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_title_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_title_permission_scopes: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string | null
          id: string
          job_title: string
          module: Database["public"]["Enums"]["permission_module"]
          organization_id: string
          scope: string
          updated_at: string | null
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          job_title: string
          module: Database["public"]["Enums"]["permission_module"]
          organization_id: string
          scope: string
          updated_at?: string | null
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          job_title?: string
          module?: Database["public"]["Enums"]["permission_module"]
          organization_id?: string
          scope?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_title_permission_scopes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_title_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string | null
          id: string
          job_title: string
          module: Database["public"]["Enums"]["permission_module"]
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          job_title: string
          module: Database["public"]["Enums"]["permission_module"]
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          job_title?: string
          module?: Database["public"]["Enums"]["permission_module"]
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_title_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_title_role_mappings: {
        Row: {
          created_at: string | null
          id: string
          job_title: string
          mapped_role: Database["public"]["Enums"]["user_role"] | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_title: string
          mapped_role?: Database["public"]["Enums"]["user_role"] | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_title?: string
          mapped_role?: Database["public"]["Enums"]["user_role"] | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_title_role_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_pipelines: {
        Row: {
          created_at: string | null
          id: string
          name: string
          organization_id: string
          settings: Json | null
          slug: string
          stages: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
          settings?: Json | null
          slug: string
          stages?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          settings?: Json | null
          slug?: string
          stages?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_pipelines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          from_stage: string
          id: string
          lead_id: string
          moved_at: string
          moved_by: string | null
          to_stage: string
        }
        Insert: {
          from_stage: string
          id?: string
          lead_id: string
          moved_at?: string
          moved_by?: string | null
          to_stage: string
        }
        Update: {
          from_stage?: string
          id?: string
          lead_id?: string
          moved_at?: string
          moved_by?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_lifecycle"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          cadence: number | null
          company: string | null
          contact_origin:
            | Database["public"]["Enums"]["lead_contact_origin"]
            | null
          cpf_cnpj: string | null
          created_at: string | null
          decision_maker: string | null
          decision_maker_name: string | null
          decision_maker_phone: string | null
          email: string | null
          etapa_kanban: string | null
          first_contact_at: string | null
          first_contact_date: string | null
          gbp: string | null
          gbp_url: string | null
          gmn: string | null
          gmn_status: Database["public"]["Enums"]["lead_gmn_status"] | null
          google_ads: boolean | null
          google_ads_level: Database["public"]["Enums"]["lead_ads_level"] | null
          id: string
          instagram: string | null
          instagram_url: string | null
          last_contact_at: string | null
          last_contact_date: string | null
          lifecycle: string | null
          lost_reason: string | null
          meta_ads: boolean | null
          meta_ads_level: Database["public"]["Enums"]["lead_ads_level"] | null
          metadata: Json | null
          name: string
          nicho: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          pipeline_id: string | null
          position: number | null
          prioridade: string | null
          product_service: string | null
          social_media: boolean | null
          social_media_status:
            | Database["public"]["Enums"]["lead_social_media_status"]
            | null
          source: string | null
          stage_id: string
          temperature: number | null
          updated_at: string | null
          value: number | null
          website: string | null
          website_url: string | null
        }
        Insert: {
          assigned_to?: string | null
          cadence?: number | null
          company?: string | null
          contact_origin?:
            | Database["public"]["Enums"]["lead_contact_origin"]
            | null
          cpf_cnpj?: string | null
          created_at?: string | null
          decision_maker?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          email?: string | null
          etapa_kanban?: string | null
          first_contact_at?: string | null
          first_contact_date?: string | null
          gbp?: string | null
          gbp_url?: string | null
          gmn?: string | null
          gmn_status?: Database["public"]["Enums"]["lead_gmn_status"] | null
          google_ads?: boolean | null
          google_ads_level?:
            | Database["public"]["Enums"]["lead_ads_level"]
            | null
          id?: string
          instagram?: string | null
          instagram_url?: string | null
          last_contact_at?: string | null
          last_contact_date?: string | null
          lifecycle?: string | null
          lost_reason?: string | null
          meta_ads?: boolean | null
          meta_ads_level?: Database["public"]["Enums"]["lead_ads_level"] | null
          metadata?: Json | null
          name: string
          nicho?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          pipeline_id?: string | null
          position?: number | null
          prioridade?: string | null
          product_service?: string | null
          social_media?: boolean | null
          social_media_status?:
            | Database["public"]["Enums"]["lead_social_media_status"]
            | null
          source?: string | null
          stage_id: string
          temperature?: number | null
          updated_at?: string | null
          value?: number | null
          website?: string | null
          website_url?: string | null
        }
        Update: {
          assigned_to?: string | null
          cadence?: number | null
          company?: string | null
          contact_origin?:
            | Database["public"]["Enums"]["lead_contact_origin"]
            | null
          cpf_cnpj?: string | null
          created_at?: string | null
          decision_maker?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          email?: string | null
          etapa_kanban?: string | null
          first_contact_at?: string | null
          first_contact_date?: string | null
          gbp?: string | null
          gbp_url?: string | null
          gmn?: string | null
          gmn_status?: Database["public"]["Enums"]["lead_gmn_status"] | null
          google_ads?: boolean | null
          google_ads_level?:
            | Database["public"]["Enums"]["lead_ads_level"]
            | null
          id?: string
          instagram?: string | null
          instagram_url?: string | null
          last_contact_at?: string | null
          last_contact_date?: string | null
          lifecycle?: string | null
          lost_reason?: string | null
          meta_ads?: boolean | null
          meta_ads_level?: Database["public"]["Enums"]["lead_ads_level"] | null
          metadata?: Json | null
          name?: string
          nicho?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          pipeline_id?: string | null
          position?: number | null
          prioridade?: string | null
          product_service?: string | null
          social_media?: boolean | null
          social_media_status?:
            | Database["public"]["Enums"]["lead_social_media_status"]
            | null
          source?: string | null
          stage_id?: string
          temperature?: number | null
          updated_at?: string | null
          value?: number | null
          website?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "lead_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          integration_type: Database["public"]["Enums"]["integration_type"]
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          integration_type: Database["public"]["Enums"]["integration_type"]
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          integration_type?: Database["public"]["Enums"]["integration_type"]
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          category_id: string | null
          client_id: string
          contract_id: string | null
          created_at: string | null
          description: string
          due_date: string
          external_id: string | null
          id: string
          metadata: Json | null
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          updated_at: string | null
          value: number
        }
        Insert: {
          category_id?: string | null
          client_id: string
          contract_id?: string | null
          created_at?: string | null
          description: string
          due_date: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          updated_at?: string | null
          value: number
        }
        Update: {
          category_id?: string | null
          client_id?: string
          contract_id?: string | null
          created_at?: string | null
          description?: string
          due_date?: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          updated_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_expenses: {
        Row: {
          base_salary: number | null
          bonus: number | null
          commission: number | null
          created_at: string | null
          discounts: number | null
          id: string
          organization_id: string
          overtime: number | null
          paid_at: string | null
          reference_date: string
          status: string | null
          total_value: number | null
          updated_at: string | null
        }
        Insert: {
          base_salary?: number | null
          bonus?: number | null
          commission?: number | null
          created_at?: string | null
          discounts?: number | null
          id?: string
          organization_id: string
          overtime?: number | null
          paid_at?: string | null
          reference_date: string
          status?: string | null
          total_value?: number | null
          updated_at?: string | null
        }
        Update: {
          base_salary?: number | null
          bonus?: number | null
          commission?: number | null
          created_at?: string | null
          discounts?: number | null
          id?: string
          organization_id?: string
          overtime?: number | null
          paid_at?: string | null
          reference_date?: string
          status?: string | null
          total_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payrolls: {
        Row: {
          base_salary: number | null
          bonus: number | null
          commission: number | null
          created_at: string | null
          discounts: number | null
          id: string
          organization_id: string
          overtime: number | null
          payment_date: string | null
          profile_id: string
          reference_date: string
          status: string | null
          total_value: number | null
        }
        Insert: {
          base_salary?: number | null
          bonus?: number | null
          commission?: number | null
          created_at?: string | null
          discounts?: number | null
          id?: string
          organization_id: string
          overtime?: number | null
          payment_date?: string | null
          profile_id: string
          reference_date: string
          status?: string | null
          total_value?: number | null
        }
        Update: {
          base_salary?: number | null
          bonus?: number | null
          commission?: number | null
          created_at?: string | null
          discounts?: number | null
          id?: string
          organization_id?: string
          overtime?: number | null
          payment_date?: string | null
          profile_id?: string
          reference_date?: string
          status?: string | null
          total_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payrolls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payrolls_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payrolls_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean | null
          metadata?: Json | null
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          id: string
          profile_id: string
          project_id: string
          role: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          project_id: string
          role?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          project_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          color: string | null
          contract_id: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          metadata: Json | null
          name: string
          organization_id: string
          progress: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          color?: string | null
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          metadata?: Json | null
          name: string
          organization_id: string
          progress?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          color?: string | null
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          organization_id?: string
          progress?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "projects_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          organization_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          organization_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_admin_actions: {
        Row: {
          action_at: string
          action_by: string | null
          action_type: Database["public"]["Enums"]["rep_p_admin_action_type"]
          id: string
          integrity_hash: string
          justification: string
          new_values: Json | null
          old_values: Json | null
          organization_id: string
          prev_hash: string | null
          punch_id: string | null
        }
        Insert: {
          action_at?: string
          action_by?: string | null
          action_type: Database["public"]["Enums"]["rep_p_admin_action_type"]
          id?: string
          integrity_hash: string
          justification: string
          new_values?: Json | null
          old_values?: Json | null
          organization_id: string
          prev_hash?: string | null
          punch_id?: string | null
        }
        Update: {
          action_at?: string
          action_by?: string | null
          action_type?: Database["public"]["Enums"]["rep_p_admin_action_type"]
          id?: string
          integrity_hash?: string
          justification?: string
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string
          prev_hash?: string | null
          punch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_admin_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_admin_actions_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_effective_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_admin_actions_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_admin_actions_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches_with_status"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_inconsistencies: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          organization_id: string
          punch_id: string | null
          type: Database["public"]["Enums"]["rep_p_inconsistency_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          organization_id: string
          punch_id?: string | null
          type: Database["public"]["Enums"]["rep_p_inconsistency_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string
          punch_id?: string | null
          type?: Database["public"]["Enums"]["rep_p_inconsistency_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_inconsistencies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_effective_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_overtime_authorizations: {
        Row: {
          authorized_at: string | null
          authorized_by: string | null
          created_at: string
          id: string
          justification: string
          minutes_requested: number
          organization_id: string
          status: Database["public"]["Enums"]["rep_p_overtime_status"]
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          authorized_at?: string | null
          authorized_by?: string | null
          created_at?: string
          id?: string
          justification: string
          minutes_requested: number
          organization_id: string
          status?: Database["public"]["Enums"]["rep_p_overtime_status"]
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          authorized_at?: string | null
          authorized_by?: string | null
          created_at?: string
          id?: string
          justification?: string
          minutes_requested?: number
          organization_id?: string
          status?: Database["public"]["Enums"]["rep_p_overtime_status"]
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_overtime_authorizations_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_overtime_authorizations_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_overtime_authorizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_overtime_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_overtime_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_punches: {
        Row: {
          created_at: string
          created_by: string | null
          device: string | null
          geo: Json | null
          id: string
          integrity_hash: string
          ip: string | null
          metadata: Json | null
          occurred_at: string
          organization_id: string
          origin: Database["public"]["Enums"]["rep_p_origin"]
          prev_hash: string | null
          punch_type: Database["public"]["Enums"]["rep_p_punch_type"]
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device?: string | null
          geo?: Json | null
          id?: string
          integrity_hash: string
          ip?: string | null
          metadata?: Json | null
          occurred_at?: string
          organization_id: string
          origin?: Database["public"]["Enums"]["rep_p_origin"]
          prev_hash?: string | null
          punch_type: Database["public"]["Enums"]["rep_p_punch_type"]
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device?: string | null
          geo?: Json | null
          id?: string
          integrity_hash?: string
          ip?: string | null
          metadata?: Json | null
          occurred_at?: string
          organization_id?: string
          origin?: Database["public"]["Enums"]["rep_p_origin"]
          prev_hash?: string | null
          punch_type?: Database["public"]["Enums"]["rep_p_punch_type"]
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_reentry_authorizations: {
        Row: {
          authorized_at: string
          authorized_by: string | null
          for_date: string
          id: string
          integrity_hash: string
          justification: string
          organization_id: string
          prev_hash: string | null
          used_at: string | null
          used_by_punch_id: string | null
          user_id: string
        }
        Insert: {
          authorized_at?: string
          authorized_by?: string | null
          for_date: string
          id?: string
          integrity_hash: string
          justification: string
          organization_id: string
          prev_hash?: string | null
          used_at?: string | null
          used_by_punch_id?: string | null
          user_id: string
        }
        Update: {
          authorized_at?: string
          authorized_by?: string | null
          for_date?: string
          id?: string
          integrity_hash?: string
          justification?: string
          organization_id?: string
          prev_hash?: string | null
          used_at?: string | null
          used_by_punch_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_reentry_authorizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_reentry_authorizations_used_by_punch_id_fkey"
            columns: ["used_by_punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_effective_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_reentry_authorizations_used_by_punch_id_fkey"
            columns: ["used_by_punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_reentry_authorizations_used_by_punch_id_fkey"
            columns: ["used_by_punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_reentry_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_reentry_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_settings: {
        Row: {
          created_at: string
          organization_id: string
          overtime_requires_approval: boolean
          standard_start_time: string
          standard_work_hours: number
          updated_at: string
          weekly_work_hours: number
        }
        Insert: {
          created_at?: string
          organization_id: string
          overtime_requires_approval?: boolean
          standard_start_time?: string
          standard_work_hours?: number
          updated_at?: string
          weekly_work_hours?: number
        }
        Update: {
          created_at?: string
          organization_id?: string
          overtime_requires_approval?: boolean
          standard_start_time?: string
          standard_work_hours?: number
          updated_at?: string
          weekly_work_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          created_by: string | null
          data: Json
          generated_at: string | null
          id: string
          name: string
          organization_id: string
          template_id: string | null
        }
        Insert: {
          created_by?: string | null
          data: Json
          generated_at?: string | null
          id?: string
          name: string
          organization_id: string
          template_id?: string | null
        }
        Update: {
          created_by?: string | null
          data?: Json
          generated_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          config: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          report_type: Database["public"]["Enums"]["report_type"]
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id: string
          report_type: Database["public"]["Enums"]["report_type"]
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_expenses: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string
          due_date: string
          id: string
          metadata: Json | null
          organization_id: string
          paid_at: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          supplier_id: string
          updated_at: string | null
          value: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description: string
          due_date: string
          id?: string
          metadata?: Json | null
          organization_id: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          supplier_id: string
          updated_at?: string | null
          value: number
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string
          due_date?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          supplier_id?: string
          updated_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          bank_info: Json | null
          created_at: string | null
          document: string | null
          email: string | null
          id: string
          metadata: Json | null
          name: string
          organization_id: string
          phone: string | null
          pix: string | null
          service_category: string | null
          updated_at: string | null
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          bank_info?: Json | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          id?: string
          metadata?: Json | null
          name: string
          organization_id: string
          phone?: string | null
          pix?: string | null
          service_category?: string | null
          updated_at?: string | null
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          bank_info?: Json | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          organization_id?: string
          phone?: string | null
          pix?: string | null
          service_category?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_hours: number | null
          assigned_to: string | null
          created_at: string | null
          dependencies: Json | null
          description: string | null
          end_date: string | null
          estimated_hours: number | null
          id: string
          metadata: Json | null
          organization_id: string
          parent_id: string | null
          position: number | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          progress: number | null
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          team_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string | null
          created_at?: string | null
          dependencies?: Json | null
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          metadata?: Json | null
          organization_id: string
          parent_id?: string | null
          position?: number | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          progress?: number | null
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          team_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string | null
          created_at?: string | null
          dependencies?: Json | null
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          parent_id?: string | null
          position?: number | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          progress?: number | null
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          team_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["user_role"] | null
          team_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["user_role"] | null
          team_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          lead_id: string | null
          name: string
          organization_id: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          name: string
          organization_id: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          name?: string
          organization_id?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_scopes: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string | null
          id: string
          module: Database["public"]["Enums"]["permission_module"]
          organization_id: string
          scope: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          module: Database["public"]["Enums"]["permission_module"]
          organization_id: string
          scope: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          module?: Database["public"]["Enums"]["permission_module"]
          organization_id?: string
          scope?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_scopes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string | null
          id: string
          module: Database["public"]["Enums"]["permission_module"]
          organization_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          module: Database["public"]["Enums"]["permission_module"]
          organization_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          id?: string
          module?: Database["public"]["Enums"]["permission_module"]
          organization_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          name: string | null
          organization_id: string
          phone: string
          profile_pic_url: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          name?: string | null
          organization_id: string
          phone: string
          profile_pic_url?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          name?: string | null
          organization_id?: string
          phone?: string
          profile_pic_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_lifecycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          assigned_to: string | null
          contact_id: string
          created_at: string | null
          id: string
          last_message_at: string | null
          metadata: Json | null
          organization_id: string
          status: Database["public"]["Enums"]["conversation_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json | null
          organization_id: string
          status?: Database["public"]["Enums"]["conversation_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json | null
          organization_id?: string
          status?: Database["public"]["Enums"]["conversation_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          direction: string
          external_id: string | null
          id: string
          media_type: string | null
          media_url: string | null
          metadata: Json | null
          organization_id: string
          status: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          direction: string
          external_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          organization_id: string
          status?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: string
          external_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          organization_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_audit_logs: {
        Row: {
          action: string | null
          changed_at: string | null
          changed_by: string | null
          changed_by_name: string | null
          changes: Json | null
          id: string | null
          organization_id: string | null
          record_id: string | null
          table_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          organization_id: string | null
          organization_name: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs_view: {
        Row: {
          action: string | null
          changed_at: string | null
          changed_by: string | null
          changed_by_name: string | null
          changes: Json | null
          id: string | null
          organization_id: string | null
          record_id: string | null
          table_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients_with_contracts: {
        Row: {
          address: string | null
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          company: string | null
          computed_status: string | null
          contract_end: string | null
          contract_id: string | null
          contract_start: string | null
          contract_status: Database["public"]["Enums"]["contract_status"] | null
          contract_value: number | null
          created_at: string | null
          document: string | null
          email: string | null
          id: string | null
          lead_id: string | null
          metadata: Json | null
          name: string | null
          niche: string | null
          organization_id: string | null
          origin: string | null
          phone: string | null
          priority: string | null
          registration_date: string | null
          registration_type:
            | Database["public"]["Enums"]["registration_type"]
            | null
          responsible_name: string | null
          responsible_phone: string | null
          revenue: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_lifecycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_with_lifecycle: {
        Row: {
          assigned_to: string | null
          cadence: number | null
          company: string | null
          contact_origin:
            | Database["public"]["Enums"]["lead_contact_origin"]
            | null
          cpf_cnpj: string | null
          created_at: string | null
          decision_maker: string | null
          decision_maker_name: string | null
          decision_maker_phone: string | null
          email: string | null
          etapa_kanban: string | null
          first_contact_at: string | null
          first_contact_date: string | null
          gbp: string | null
          gbp_url: string | null
          gmn: string | null
          gmn_status: Database["public"]["Enums"]["lead_gmn_status"] | null
          google_ads: boolean | null
          google_ads_level: Database["public"]["Enums"]["lead_ads_level"] | null
          id: string | null
          instagram: string | null
          instagram_url: string | null
          last_contact_at: string | null
          last_contact_date: string | null
          lifecycle: string | null
          lifecycle_days: number | null
          lost_reason: string | null
          meta_ads: boolean | null
          meta_ads_level: Database["public"]["Enums"]["lead_ads_level"] | null
          metadata: Json | null
          name: string | null
          nicho: string | null
          notes: string | null
          organization_id: string | null
          phone: string | null
          pipeline_id: string | null
          position: number | null
          prioridade: string | null
          product_service: string | null
          social_media: boolean | null
          social_media_status:
            | Database["public"]["Enums"]["lead_social_media_status"]
            | null
          source: string | null
          stage_id: string | null
          temperature: number | null
          updated_at: string | null
          value: number | null
          website: string | null
          website_url: string | null
        }
        Insert: {
          assigned_to?: string | null
          cadence?: number | null
          company?: string | null
          contact_origin?:
            | Database["public"]["Enums"]["lead_contact_origin"]
            | null
          cpf_cnpj?: string | null
          created_at?: string | null
          decision_maker?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          email?: string | null
          etapa_kanban?: string | null
          first_contact_at?: string | null
          first_contact_date?: string | null
          gbp?: string | null
          gbp_url?: string | null
          gmn?: string | null
          gmn_status?: Database["public"]["Enums"]["lead_gmn_status"] | null
          google_ads?: boolean | null
          google_ads_level?:
            | Database["public"]["Enums"]["lead_ads_level"]
            | null
          id?: string | null
          instagram?: string | null
          instagram_url?: string | null
          last_contact_at?: string | null
          last_contact_date?: string | null
          lifecycle?: string | null
          lifecycle_days?: never
          lost_reason?: string | null
          meta_ads?: boolean | null
          meta_ads_level?: Database["public"]["Enums"]["lead_ads_level"] | null
          metadata?: Json | null
          name?: string | null
          nicho?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          pipeline_id?: string | null
          position?: number | null
          prioridade?: string | null
          product_service?: string | null
          social_media?: boolean | null
          social_media_status?:
            | Database["public"]["Enums"]["lead_social_media_status"]
            | null
          source?: string | null
          stage_id?: string | null
          temperature?: number | null
          updated_at?: string | null
          value?: number | null
          website?: string | null
          website_url?: string | null
        }
        Update: {
          assigned_to?: string | null
          cadence?: number | null
          company?: string | null
          contact_origin?:
            | Database["public"]["Enums"]["lead_contact_origin"]
            | null
          cpf_cnpj?: string | null
          created_at?: string | null
          decision_maker?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          email?: string | null
          etapa_kanban?: string | null
          first_contact_at?: string | null
          first_contact_date?: string | null
          gbp?: string | null
          gbp_url?: string | null
          gmn?: string | null
          gmn_status?: Database["public"]["Enums"]["lead_gmn_status"] | null
          google_ads?: boolean | null
          google_ads_level?:
            | Database["public"]["Enums"]["lead_ads_level"]
            | null
          id?: string | null
          instagram?: string | null
          instagram_url?: string | null
          last_contact_at?: string | null
          last_contact_date?: string | null
          lifecycle?: string | null
          lifecycle_days?: never
          lost_reason?: string | null
          meta_ads?: boolean | null
          meta_ads_level?: Database["public"]["Enums"]["lead_ads_level"] | null
          metadata?: Json | null
          name?: string | null
          nicho?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          pipeline_id?: string | null
          position?: number | null
          prioridade?: string | null
          product_service?: string | null
          social_media?: boolean | null
          social_media_status?:
            | Database["public"]["Enums"]["lead_social_media_status"]
            | null
          source?: string | null
          stage_id?: string | null
          temperature?: number | null
          updated_at?: string | null
          value?: number | null
          website?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "lead_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_admin_changes_report: {
        Row: {
          action_at: string | null
          action_by: string | null
          action_by_name: string | null
          action_type:
            | Database["public"]["Enums"]["rep_p_admin_action_type"]
            | null
          id: string | null
          integrity_hash: string | null
          justification: string | null
          new_values: Json | null
          old_values: Json | null
          organization_id: string | null
          punch_id: string | null
          punch_occurred_at: string | null
          punch_type: Database["public"]["Enums"]["rep_p_punch_type"] | null
          target_user_id: string | null
          target_user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_admin_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_admin_actions_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_effective_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_admin_actions_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_admin_actions_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_clt_compliance_report: {
        Row: {
          day_status: string | null
          delay_minutes: number | null
          is_short_day: boolean | null
          organization_id: string | null
          overtime_minutes: number | null
          overtime_status:
            | Database["public"]["Enums"]["rep_p_overtime_status"]
            | null
          user_id: string | null
          user_name: string | null
          work_date: string | null
          worked_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_daily_report: {
        Row: {
          break_minutes: number | null
          day_status: string | null
          delay_minutes: number | null
          entrada_at: string | null
          inconsistencies_count: number | null
          organization_id: string | null
          overtime_authorized_by: string | null
          overtime_justification: string | null
          overtime_minutes: number | null
          overtime_status:
            | Database["public"]["Enums"]["rep_p_overtime_status"]
            | null
          retorno_intervalo_at: string | null
          saida_final_at: string | null
          saida_intervalo_at: string | null
          user_id: string | null
          work_date: string | null
          worked_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_overtime_authorizations_authorized_by_fkey"
            columns: ["overtime_authorized_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_overtime_authorizations_authorized_by_fkey"
            columns: ["overtime_authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_effective_punches: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          created_at: string | null
          created_by: string | null
          device: string | null
          geo: Json | null
          id: string | null
          integrity_hash: string | null
          ip: string | null
          justificativa: string | null
          metadata: Json | null
          occurred_at: string | null
          organization_id: string | null
          origin: Database["public"]["Enums"]["rep_p_origin"] | null
          prev_hash: string | null
          punch_type: Database["public"]["Enums"]["rep_p_punch_type"] | null
          status: string | null
          tipo_alteracao:
            | Database["public"]["Enums"]["rep_p_admin_action_type"]
            | null
          user_agent: string | null
          user_id: string | null
          valores_anteriores: Json | null
          valores_novos: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_inconsistencies_report: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string | null
          organization_id: string | null
          punch_id: string | null
          type: Database["public"]["Enums"]["rep_p_inconsistency_type"] | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_inconsistencies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_effective_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "rep_p_punches_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_inconsistencies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_monthly_report: {
        Row: {
          days_count: number | null
          inconsistencies_count: number | null
          month_ref: string | null
          organization_id: string | null
          total_approved_overtime_minutes: number | null
          total_delay_minutes: number | null
          total_pending_overtime_minutes: number | null
          total_worked_hours: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_punches_with_status: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          created_at: string | null
          created_by: string | null
          device: string | null
          geo: Json | null
          id: string | null
          integrity_hash: string | null
          ip: string | null
          justificativa: string | null
          metadata: Json | null
          occurred_at: string | null
          organization_id: string | null
          origin: Database["public"]["Enums"]["rep_p_origin"] | null
          prev_hash: string | null
          punch_type: Database["public"]["Enums"]["rep_p_punch_type"] | null
          status: string | null
          tipo_alteracao:
            | Database["public"]["Enums"]["rep_p_admin_action_type"]
            | null
          user_agent: string | null
          user_id: string | null
          valores_anteriores: Json | null
          valores_novos: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_p_weekly_report: {
        Row: {
          expected_weekly_hours: number | null
          has_negative_hours: boolean | null
          organization_id: string | null
          user_id: string | null
          week_start: string | null
          weekly_approved_overtime_minutes: number | null
          weekly_balance_hours: number | null
          weekly_delay_minutes: number | null
          weekly_worked_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_p_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_p_punches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_business_roi: {
        Row: {
          gross_profit_after_ads: number | null
          marketing_spend: number | null
          month: string | null
          organization_id: string | null
          revenue: number | null
          roi_roas: number | null
        }
        Relationships: []
      }
      vw_business_roi_legacy_20260311_225300: {
        Row: {
          investimento_marketing: number | null
          periodo: string | null
          receita_atribuida_campanhas: number | null
          receita_total_empresa: number | null
          roi_atribuido: number | null
          roi_total: number | null
        }
        Relationships: []
      }
      vw_business_roi_legacy_20260311_231633: {
        Row: {
          gross_profit_after_ads: number | null
          marketing_spend: number | null
          month: string | null
          organization_id: string | null
          revenue: number | null
          roi_roas: number | null
        }
        Relationships: []
      }
      vw_business_roi_v2: {
        Row: {
          gross_profit_after_ads: number | null
          marketing_spend: number | null
          month: string | null
          organization_id: string | null
          revenue: number | null
          roi_roas: number | null
        }
        Relationships: []
      }
      vw_financial_cashflow: {
        Row: {
          amount: number | null
          category_id: string | null
          description: string | null
          direction: string | null
          due_date: string | null
          entry_date: string | null
          month: string | null
          organization_id: string | null
          paid_at: string | null
          reference_id: string | null
          source: string | null
          status: string | null
        }
        Relationships: []
      }
      vw_financial_cashflow_legacy_20260311_221657: {
        Row: {
          categoria: string | null
          periodo: string | null
          quantidade: number | null
          status_agregado: string | null
          valor: number | null
        }
        Relationships: []
      }
      vw_financial_cashflow_legacy_20260311_225300: {
        Row: {
          amount: number | null
          category_id: string | null
          description: string | null
          direction: string | null
          due_date: string | null
          entry_date: string | null
          month: string | null
          organization_id: string | null
          paid_at: string | null
          reference_id: string | null
          source: string | null
          status: string | null
        }
        Relationships: []
      }
      vw_financial_cashflow_legacy_20260311_231633: {
        Row: {
          amount: number | null
          category_id: string | null
          description: string | null
          direction: string | null
          due_date: string | null
          entry_date: string | null
          month: string | null
          organization_id: string | null
          paid_at: string | null
          reference_id: string | null
          source: string | null
          status: string | null
        }
        Relationships: []
      }
      vw_financial_cashflow_v2: {
        Row: {
          amount: number | null
          category_id: string | null
          description: string | null
          direction: string | null
          due_date: string | null
          entry_date: string | null
          month: string | null
          organization_id: string | null
          paid_at: string | null
          reference_id: string | null
          source: string | null
          status: string | null
        }
        Relationships: []
      }
      vw_financial_dre: {
        Row: {
          month: string | null
          organization_id: string | null
          payroll_expenses: number | null
          result: number | null
          revenue: number | null
          supplier_expenses: number | null
          total_expenses: number | null
        }
        Relationships: []
      }
      vw_financial_dre_legacy_20260311_225300: {
        Row: {
          despesas_fornecedores: number | null
          folha_pagamento: number | null
          periodo: string | null
          receitas: number | null
          resultado: number | null
        }
        Relationships: []
      }
      vw_financial_dre_legacy_20260311_231633: {
        Row: {
          month: string | null
          organization_id: string | null
          payroll_expenses: number | null
          result: number | null
          revenue: number | null
          supplier_expenses: number | null
          total_expenses: number | null
        }
        Relationships: []
      }
      vw_financial_dre_v2: {
        Row: {
          month: string | null
          organization_id: string | null
          payroll_expenses: number | null
          result: number | null
          revenue: number | null
          supplier_expenses: number | null
          total_expenses: number | null
        }
        Relationships: []
      }
      vw_financial_dre_v3: {
        Row: {
          month: string | null
          organization_id: string | null
          payroll_expenses: number | null
          result: number | null
          revenue: number | null
          supplier_expenses: number | null
          total_expenses: number | null
        }
        Relationships: []
      }
      vw_marketing_finance_comparison: {
        Row: {
          delta_finance_minus_campaigns: number | null
          finance_to_campaign_spend_ratio: number | null
          financial_marketing_expenses: number | null
          marketing_revenue: number | null
          marketing_spend: number | null
          month: string | null
          organization_id: string | null
        }
        Relationships: []
      }
      vw_marketing_finance_comparison_legacy_20260311_225115: {
        Row: {
          diferenca: number | null
          gasto_campanhas: number | null
          lancamentos_financeiro: number | null
          periodo: string | null
        }
        Relationships: []
      }
      vw_marketing_finance_comparison_legacy_20260311_231633: {
        Row: {
          delta_finance_minus_campaigns: number | null
          finance_to_campaign_spend_ratio: number | null
          financial_marketing_expenses: number | null
          marketing_revenue: number | null
          marketing_spend: number | null
          month: string | null
          organization_id: string | null
        }
        Relationships: []
      }
      vw_marketing_finance_comparison_v2: {
        Row: {
          delta_finance_minus_campaigns: number | null
          finance_to_campaign_spend_ratio: number | null
          financial_marketing_expenses: number | null
          marketing_revenue: number | null
          marketing_spend: number | null
          month: string | null
          organization_id: string | null
        }
        Relationships: []
      }
      vw_marketing_finance_comparison_v3: {
        Row: {
          delta_finance_minus_campaigns: number | null
          finance_to_campaign_spend_ratio: number | null
          financial_marketing_expenses: number | null
          marketing_revenue: number | null
          marketing_spend: number | null
          month: string | null
          organization_id: string | null
        }
        Relationships: []
      }
      vw_marketing_spend: {
        Row: {
          account_external_id: string | null
          ad_account_id: string | null
          ad_account_platform: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_platform: string | null
          campaign_status: string | null
          clicks: number | null
          conversions: number | null
          cpc: number | null
          ctr: number | null
          impressions: number | null
          leads: number | null
          metric_date: string | null
          organization_id: string | null
          revenue: number | null
          roas: number | null
          spend: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_marketing_spend_legacy_20260311_225300: {
        Row: {
          campanha: string | null
          cliques_total: number | null
          conversoes_total: number | null
          cpc_medio: number | null
          ctr_medio: number | null
          gasto_total: number | null
          impressoes_total: number | null
          periodo: string | null
          platform: string | null
          receita_total: number | null
          roas_medio: number | null
        }
        Relationships: []
      }
      vw_marketing_spend_legacy_20260311_231633: {
        Row: {
          account_external_id: string | null
          ad_account_id: string | null
          ad_account_platform: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_platform: string | null
          campaign_status: string | null
          clicks: number | null
          conversions: number | null
          cpc: number | null
          ctr: number | null
          impressions: number | null
          leads: number | null
          metric_date: string | null
          organization_id: string | null
          revenue: number | null
          roas: number | null
          spend: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_marketing_spend_v2: {
        Row: {
          account_external_id: string | null
          ad_account_id: string | null
          ad_account_platform: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_platform: string | null
          campaign_status: string | null
          clicks: number | null
          conversions: number | null
          cpc: number | null
          ctr: number | null
          impressions: number | null
          leads: number | null
          metric_date: string | null
          organization_id: string | null
          revenue: number | null
          roas: number | null
          spend: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_delegated: {
        Args: {
          p_assigned_to: string
          p_company_visible: boolean
          p_team_id: string
        }
        Returns: boolean
      }
      can_manage_delegated: {
        Args: {
          p_assigned_to: string
          p_company_manage: boolean
          p_team_id: string
        }
        Returns: boolean
      }
      create_invitation_token: {
        Args: { email_input: string; org_id: string }
        Returns: Json
      }
      finance_get_delinquency: {
        Args: never
        Returns: {
          overdue_expenses_total: number
          overdue_payments_total: number
          overdue_total: number
        }[]
      }
      generate_registration_code: {
        Args: { org_id: string; validity_hours?: number }
        Returns: string
      }
      get_auth_org_id: { Args: never; Returns: string }
      get_auth_role: { Args: never; Returns: string }
      get_my_profile: { Args: never; Returns: Json }
      get_or_create_my_profile: { Args: never; Returns: Json }
      get_user_organization_id: { Args: never; Returns: string }
      get_user_team_ids: { Args: never; Returns: string[] }
      job_title_delete: { Args: { p_job_title: string }; Returns: undefined }
      job_title_rename: {
        Args: { p_new: string; p_old: string }
        Returns: undefined
      }
      match_db_c8_rag: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      process_incoming_whatsapp_message: {
        Args: {
          p_contact_name?: string
          p_direction?: string
          p_message_content?: string
          p_message_external_id?: string
          p_organization_id: string
          p_phone: string
        }
        Returns: Json
      }
      rep_p_admin_authorize_reentry: {
        Args: { p_for_date: string; p_justification: string; p_user_id: string }
        Returns: string
      }
      rep_p_admin_correct_punch: {
        Args: {
          p_device?: string
          p_geo?: Json
          p_justification: string
          p_new_occurred_at: string
          p_new_type: Database["public"]["Enums"]["rep_p_punch_type"]
          p_origin?: Database["public"]["Enums"]["rep_p_origin"]
          p_punch_id: string
        }
        Returns: Json
      }
      rep_p_admin_create_punch: {
        Args: {
          p_device?: string
          p_geo?: Json
          p_justification: string
          p_occurred_at: string
          p_origin?: Database["public"]["Enums"]["rep_p_origin"]
          p_type: Database["public"]["Enums"]["rep_p_punch_type"]
          p_user_id: string
        }
        Returns: Json
      }
      rep_p_admin_void_punch: {
        Args: { p_justification: string; p_punch_id: string }
        Returns: undefined
      }
      rep_p_get_today_state: { Args: never; Returns: Json }
      rep_p_has_unused_reentry_authorization: {
        Args: { p_date: string; p_user_id: string }
        Returns: boolean
      }
      rep_p_hash_record: { Args: { payload: string }; Returns: string }
      rep_p_now_local: { Args: never; Returns: string }
      rep_p_register_punch: {
        Args: {
          p_ack_late_break?: boolean
          p_device?: string
          p_geo?: Json
          p_origin?: Database["public"]["Enums"]["rep_p_origin"]
          p_type: Database["public"]["Enums"]["rep_p_punch_type"]
        }
        Returns: Json
      }
      rep_p_request_header: { Args: { header_name: string }; Returns: string }
      rep_p_request_ip: { Args: never; Returns: string }
      rep_p_request_overtime: {
        Args: {
          p_justification: string
          p_minutes: number
          p_work_date: string
        }
        Returns: Json
      }
      rep_p_today_date: { Args: never; Returns: string }
      rep_p_use_reentry_authorization: {
        Args: { p_date: string; p_punch_id: string; p_user_id: string }
        Returns: undefined
      }
      rep_p_user_is_exempt: { Args: { p_user_id?: string }; Returns: boolean }
      sync_contract_suspensions: {
        Args: { p_org_id: string; p_overdue_days?: number }
        Returns: number
      }
      user_can_access: { Args: { resource_org_id: string }; Returns: boolean }
      user_has_role: {
        Args: { required_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      user_shares_team_with: { Args: { p_user_id: string }; Returns: boolean }
      validate_invitation_token: {
        Args: { token_input: string }
        Returns: Json
      }
      validate_registration_code: {
        Args: { code_input: string }
        Returns: Json
      }
    }
    Enums: {
      contract_status:
        | "rascunho"
        | "ativo"
        | "suspenso"
        | "encerrado"
        | "cancelado"
      contract_type_enum: "servico" | "trimestral" | "semestral" | "anual"
      conversation_status:
        | "aberta"
        | "em_atendimento"
        | "encerrada"
        | "aguardando"
      event_type: "reuniao" | "ligacao" | "entrega" | "lembrete" | "outro" | "captacao" | "reuniao_integracao" | "reuniao_planejamento" | "reuniao_periodica" | "apresentacao_proposta"
      goal_indicator:
        | "inadimplencia"
        | "efetivacoes"
        | "faturamento"
        | "numero_contatos"
        | "outro"
      goal_period: "diario" | "semanal" | "mensal" | "trimestral" | "anual"
      integration_type:
        | "api_keys"
        | "webhooks"
        | "n8n"
        | "whatsapp"
        | "google_calendar"
        | "notaas"
      lead_ads_level: "sem_anuncios" | "poucos_anuncios" | "muitos_anuncios"
      lead_contact_origin:
        | "indicacao"
        | "prospeccao"
        | "campanha_google"
        | "campanha_meta"
        | "organico"
        | "outras"
      lead_gmn_status:
        | "nao_possui"
        | "desatualizado_desativado"
        | "desatualizado"
        | "incompleto"
        | "completo"
      lead_lost_reason:
        | "capacidade_produtiva"
        | "orcamento"
        | "desqualificado"
        | "barrado_pelo_sa"
        | "sem_contato"
        | "limite_da_franquia"
        | "concorrencia"
        | "perda_de_contato"
        | "cadencia_excedida"
        | "outros"
      lead_product_service:
        | "assessoria"
        | "consultoria"
        | "gmn"
        | "site"
        | "agente_ia"
        | "outros"
      lead_social_media_status:
        | "sem_frequencia"
        | "parado_inexistente"
        | "frequente_sem_estrategia"
        | "frequente_estruturado"
      lead_status:
        | "novo"
        | "qualificado"
        | "proposta"
        | "negociacao"
        | "ganho"
        | "perdido"
      payment_periodicity:
        | "pagamento_unico"
        | "50_50"
        | "mensal"
        | "trimestral"
        | "semestral"
        | "anual"
      payment_status:
        | "pendente"
        | "processando"
        | "pago"
        | "atrasado"
        | "cancelado"
        | "reembolsado"
      permission_module:
        | "kanban"
        | "clients"
        | "financial"
        | "projects"
        | "agenda"
        | "goals"
        | "team"
        | "settings"
        | "dashboard"
        | "crm"
        | "sales_analytics"
        | "whatsapp"
        | "meetings"
        | "reports"
        | "campaigns"
        | "audit"
        | "timeclock"
        | "c8control"
      registration_type: "prospeccao" | "cliente"
      rep_p_admin_action_type:
        | "criar"
        | "corrigir"
        | "anular"
        | "autorizar_nova_entrada"
        | "autorizar_hora_extra"
      rep_p_inconsistency_type:
        | "intervalo_tardio"
        | "jornada_continua_acima_6h"
        | "jornada_diaria_acima_8h"
        | "sequencia_invalida"
        | "excedeu_limite_diario"
      rep_p_origin: "web" | "mobile"
      rep_p_overtime_status: "pendente" | "aprovado" | "rejeitado"
      rep_p_punch_type:
        | "entrada"
        | "saida_intervalo"
        | "retorno_intervalo"
        | "saida_final"
      report_type: "vendas" | "financeiro" | "projetos" | "rh" | "custom"
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status:
        | "backlog"
        | "em_andamento"
        | "em_revisao"
        | "concluida"
        | "bloqueada"
        | "parada"
      user_role: "owner" | "admin" | "manager" | "member" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      contract_status: [
        "rascunho",
        "ativo",
        "suspenso",
        "encerrado",
        "cancelado",
      ],
      contract_type_enum: ["servico", "trimestral", "semestral", "anual"],
      conversation_status: [
        "aberta",
        "em_atendimento",
        "encerrada",
        "aguardando",
      ],
      event_type: ["reuniao", "ligacao", "entrega", "lembrete", "outro", "captacao", "reuniao_integracao", "reuniao_planejamento", "reuniao_periodica", "apresentacao_proposta"],
      goal_indicator: [
        "inadimplencia",
        "efetivacoes",
        "faturamento",
        "numero_contatos",
        "outro",
      ],
      goal_period: ["diario", "semanal", "mensal", "trimestral", "anual"],
      integration_type: [
        "api_keys",
        "webhooks",
        "n8n",
        "whatsapp",
        "google_calendar",
        "notaas",
      ],
      lead_ads_level: ["sem_anuncios", "poucos_anuncios", "muitos_anuncios"],
      lead_contact_origin: [
        "indicacao",
        "prospeccao",
        "campanha_google",
        "campanha_meta",
        "organico",
        "outras",
      ],
      lead_gmn_status: [
        "nao_possui",
        "desatualizado_desativado",
        "desatualizado",
        "incompleto",
        "completo",
      ],
      lead_lost_reason: [
        "capacidade_produtiva",
        "orcamento",
        "desqualificado",
        "barrado_pelo_sa",
        "sem_contato",
        "limite_da_franquia",
        "concorrencia",
        "perda_de_contato",
        "cadencia_excedida",
        "outros",
      ],
      lead_product_service: [
        "assessoria",
        "consultoria",
        "gmn",
        "site",
        "agente_ia",
        "outros",
      ],
      lead_social_media_status: [
        "sem_frequencia",
        "parado_inexistente",
        "frequente_sem_estrategia",
        "frequente_estruturado",
      ],
      lead_status: [
        "novo",
        "qualificado",
        "proposta",
        "negociacao",
        "ganho",
        "perdido",
      ],
      payment_periodicity: [
        "pagamento_unico",
        "50_50",
        "mensal",
        "trimestral",
        "semestral",
        "anual",
      ],
      payment_status: [
        "pendente",
        "processando",
        "pago",
        "atrasado",
        "cancelado",
        "reembolsado",
      ],
      permission_module: [
        "kanban",
        "clients",
        "financial",
        "projects",
        "agenda",
        "goals",
        "team",
        "settings",
        "dashboard",
        "crm",
        "sales_analytics",
        "whatsapp",
        "meetings",
        "reports",
        "campaigns",
        "audit",
        "timeclock",
        "c8control",
      ],
      registration_type: ["prospeccao", "cliente"],
      rep_p_admin_action_type: [
        "criar",
        "corrigir",
        "anular",
        "autorizar_nova_entrada",
        "autorizar_hora_extra",
      ],
      rep_p_inconsistency_type: [
        "intervalo_tardio",
        "jornada_continua_acima_6h",
        "jornada_diaria_acima_8h",
        "sequencia_invalida",
        "excedeu_limite_diario",
      ],
      rep_p_origin: ["web", "mobile"],
      rep_p_overtime_status: ["pendente", "aprovado", "rejeitado"],
      rep_p_punch_type: [
        "entrada",
        "saida_intervalo",
        "retorno_intervalo",
        "saida_final",
      ],
      report_type: ["vendas", "financeiro", "projetos", "rh", "custom"],
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: [
        "backlog",
        "em_andamento",
        "em_revisao",
        "concluida",
        "bloqueada",
        "parada",
      ],
      user_role: ["owner", "admin", "manager", "member", "viewer"],
    },
  },
} as const
