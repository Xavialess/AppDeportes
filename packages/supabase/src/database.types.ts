export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      cities: {
        Row: {
          country_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      city_sports: {
        Row: {
          city_id: string
          created_at: string
          id: string
          is_active: boolean
          sport_id: string
        }
        Insert: {
          city_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          sport_id: string
        }
        Update: {
          city_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_sports_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          currency_code: string
          currency_symbol: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_code: string
          currency_symbol: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          assigned_to: string | null
          business_name: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          notes_count: number
          owner_name: string
          phone: string | null
          source: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          notes_count?: number
          owner_name: string
          phone?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          notes_count?: number
          owner_name?: string
          phone?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          lead_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string
          id?: string
          lead_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          attended: boolean | null
          created_at: string
          id: string
          match_id: string
          payment_id: string | null
          payment_method: 'in_person' | 'in_app'
          status: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
        }
        Insert: {
          attended?: boolean | null
          created_at?: string
          id?: string
          match_id: string
          payment_id?: string | null
          payment_method?: 'in_person' | 'in_app'
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
        }
        Update: {
          attended?: boolean | null
          created_at?: string
          id?: string
          match_id?: string
          payment_id?: string | null
          payment_method?: 'in_person' | 'in_app'
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          address: string
          city_id: string
          created_at: string
          description: string | null
          id: string
          images: string[]
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          owner_id: string
        }
        Insert: {
          address?: string
          city_id: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          owner_id: string
        }
        Update: {
          address?: string
          city_id?: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fields: {
        Row: {
          city_id: string
          club_id: string | null
          created_at: string
          id: string
          images: string[]
          name: string
        }
        Insert: {
          city_id: string
          club_id?: string | null
          created_at?: string
          id?: string
          images?: string[]
          name: string
        }
        Update: {
          city_id?: string
          club_id?: string | null
          created_at?: string
          id?: string
          images?: string[]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fields_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fields_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          cancelled_by: string | null
          cancellation_reason: string | null
          confirmation_deadline: string | null
          created_at: string
          date: string
          end_time: string
          enrolled_count_at_cancellation: number | null
          field_id: string
          format: string
          id: string
          is_visible: boolean
          max_players: number | null
          min_players: number | null
          price_per_player: number | null
          reminder_sent_at: string | null
          sport_id: string
          start_time: string
          status: Database["public"]["Enums"]["match_status"]
          total_price: number | null
          type: Database["public"]["Enums"]["match_type"]
        }
        Insert: {
          cancelled_by?: string | null
          cancellation_reason?: string | null
          confirmation_deadline?: string | null
          created_at?: string
          date: string
          end_time: string
          enrolled_count_at_cancellation?: number | null
          field_id: string
          format: string
          id?: string
          is_visible?: boolean
          max_players?: number | null
          min_players?: number | null
          price_per_player?: number | null
          reminder_sent_at?: string | null
          sport_id: string
          start_time: string
          status?: Database["public"]["Enums"]["match_status"]
          total_price?: number | null
          type: Database["public"]["Enums"]["match_type"]
        }
        Update: {
          cancelled_by?: string | null
          cancellation_reason?: string | null
          confirmation_deadline?: string | null
          created_at?: string
          date?: string
          end_time?: string
          enrolled_count_at_cancellation?: number | null
          field_id?: string
          format?: string
          id?: string
          is_visible?: boolean
          max_players?: number | null
          min_players?: number | null
          price_per_player?: number | null
          reminder_sent_at?: string | null
          sport_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["match_status"]
          total_price?: number | null
          type?: Database["public"]["Enums"]["match_type"]
        }
        Relationships: [
          {
            foreignKeyName: "matches_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_profiles: {
        Row: {
          cancellation_count: number
          created_at: string
          deuna_merchant_id: string | null
          deuna_phone_linked: string | null
          id: string
          plan_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          user_id: string
        }
        Insert: {
          cancellation_count?: number
          created_at?: string
          deuna_merchant_id?: string | null
          deuna_phone_linked?: string | null
          id?: string
          plan_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          user_id: string
        }
        Update: {
          cancellation_count?: number
          created_at?: string
          deuna_merchant_id?: string | null
          deuna_phone_linked?: string | null
          id?: string
          plan_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          enrollment_id: string | null
          id: string
          match_id: string
          method: Database["public"]["Enums"]["payment_method"]
          provider: string | null
          provider_transaction_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          enrollment_id?: string | null
          id?: string
          match_id: string
          method: Database["public"]["Enums"]["payment_method"]
          provider?: string | null
          provider_transaction_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          enrollment_id?: string | null
          id?: string
          match_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          provider?: string | null
          provider_transaction_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          max_matches_per_month: number
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_matches_per_month: number
          name: string
          price: number
        }
        Update: {
          created_at?: string
          id?: string
          max_matches_per_month?: number
          name?: string
          price?: number
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          created_at: string
          formats: string[]
          icon: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          formats?: string[]
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          formats?: string[]
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar: string | null
          created_at: string
          email: string
          id: string
          is_pro: boolean
          is_suspended: boolean
          matches_played: number
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          email: string
          id: string
          is_pro?: boolean
          is_suspended?: boolean
          matches_played?: number
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          avatar?: string | null
          created_at?: string
          email?: string
          id?: string
          is_pro?: boolean
          is_suspended?: boolean
          matches_played?: number
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_user_matches_played: {
        Args: { user_ids: string[] }
        Returns: undefined
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_owner_or_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      enrollment_status: "pending" | "payment_pending" | "confirmed" | "cancelled" | "refunded"
      match_status: "open" | "confirmed" | "en_curso" | "jugado" | "completed" | "cancelled"
      match_type: "open" | "reservation"
      payment_method: "in_app" | "in_person"
      payment_status: "pending" | "completed" | "refunded" | "failed"
      subscription_status: "active" | "inactive" | "trial" | "cancelled"
      user_role: "player" | "owner" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never
