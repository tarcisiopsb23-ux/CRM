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
          end_date: string | null
          id: string
          metadata: Json | null
          organization_id: string
          periodicity: Database["public"]["Enums"]["payment_periodicity"] | null
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
          end_date?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          periodicity?:
            | Database["public"]["Enums"]["payment_periodicity"]
            | null
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
          end_date?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          periodicity?:
            | Database["public"]["Enums"]["payment_periodicity"]
            | null
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
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
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
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
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
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      leads: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string | null
          email: string | null
          etapa_kanban: string | null
          id: string
          metadata: Json | null
          name: string
          nicho: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          pipeline_id: string | null
          position: number | null
          prioridade: string | null
          source: string | null
          stage_id: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          etapa_kanban?: string | null
          id?: string
          metadata?: Json | null
          name: string
          nicho?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          pipeline_id?: string | null
          position?: number | null
          prioridade?: string | null
          source?: string | null
          stage_id: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          etapa_kanban?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          nicho?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          pipeline_id?: string | null
          position?: number | null
          prioridade?: string | null
          source?: string | null
          stage_id?: string
          updated_at?: string | null
          value?: number | null
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
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
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
          base_salary: number
          bonus: number
          commission: number
          created_at: string | null
          discounts: number
          id: string
          organization_id: string
          overtime: number
          paid_at: string | null
          reference_date: string
          status: Database["public"]["Enums"]["payment_status"] | null
          total_value: number
          updated_at: string | null
        }
        Insert: {
          base_salary?: number
          bonus?: number
          commission?: number
          created_at?: string | null
          discounts?: number
          id?: string
          organization_id: string
          overtime?: number
          paid_at?: string | null
          reference_date: string
          status?: Database["public"]["Enums"]["payment_status"] | null
          total_value?: number
          updated_at?: string | null
        }
        Update: {
          base_salary?: number
          bonus?: number
          commission?: number
          created_at?: string | null
          discounts?: number
          id?: string
          organization_id?: string
          overtime?: number
          paid_at?: string | null
          reference_date?: string
          status?: Database["public"]["Enums"]["payment_status"] | null
          total_value?: number
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
          updated_at: string | null
        }
        Insert: {
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
          updated_at?: string | null
        }
        Update: {
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
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
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
            foreignKeyName: "whatsapp_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      lead_stage_history: {
        Row: {
          id: string
          lead_id: string
          from_stage: string
          to_stage: string
          moved_by: string | null
          moved_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          from_stage: string
          to_stage: string
          moved_by?: string | null
          moved_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          from_stage?: string
          to_stage?: string
          moved_by?: string | null
          moved_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          module: Database["public"]["Enums"]["permission_module"]
          can_view: boolean
          can_create: boolean
          can_edit: boolean
          can_delete: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          organization_id: string
          module: Database["public"]["Enums"]["permission_module"]
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          organization_id?: string
          module?: Database["public"]["Enums"]["permission_module"]
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_invitation_token: {
        Args: { email_input: string; org_id: string }
        Returns: Json
      }
      generate_registration_code: {
        Args: { org_id: string; validity_hours?: number }
        Returns: string
      }
      get_user_organization_id: { Args: never; Returns: string }
      get_my_profile: { Args: never; Returns: Json }
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
      user_can_access: { Args: { resource_org_id: string }; Returns: boolean }
      user_has_role: {
        Args: { required_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      validate_invitation_token: {
        Args: { token_input: string }
        Returns: Json
      }
      validate_registration_code: {
        Args: { code_input: string }
        Returns: Json
      }
      process_incoming_whatsapp_message: {
        Args: {
          p_organization_id: string
          p_phone: string
          p_contact_name?: string
          p_message_content?: string
          p_message_external_id?: string
          p_direction?: string
        }
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
      event_type: "reuniao" | "ligacao" | "entrega" | "lembrete" | "outro"
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
      registration_type: "prospeccao" | "cliente"
      report_type: "vendas" | "financeiro" | "projetos" | "rh" | "custom"
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status:
        | "backlog"
        | "em_andamento"
        | "em_revisao"
        | "concluida"
        | "bloqueada"
      user_role: "owner" | "admin" | "manager" | "member" | "viewer"
      permission_module:
        | "dashboard"
        | "kanban"
        | "crm"
        | "sales_analytics"
        | "clients"
        | "financial"
        | "projects"
        | "agenda"
        | "goals"
        | "whatsapp"
        | "meetings"
        | "team"
        | "settings"
        | "reports"
        | "campaigns"
        | "audit"
        | "timeclock"
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
      event_type: ["reuniao", "ligacao", "entrega", "lembrete", "outro"],
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
      registration_type: ["prospeccao", "cliente"],
      report_type: ["vendas", "financeiro", "projetos", "rh", "custom"],
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: [
        "backlog",
        "em_andamento",
        "em_revisao",
        "concluida",
        "bloqueada",
      ],
      user_role: ["owner", "admin", "manager", "member", "viewer"],
      permission_module: [
        "dashboard",
        "kanban",
        "crm",
        "sales_analytics",
        "clients",
        "financial",
        "projects",
        "agenda",
        "goals",
        "whatsapp",
        "meetings",
        "team",
        "settings",
        "reports",
        "campaigns",
        "audit",
        "timeclock",
      ],
    },
  },
} as const
