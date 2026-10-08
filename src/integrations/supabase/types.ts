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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bot_admin_roles: {
        Row: {
          role: string
          telegram_id: number
        }
        Insert: {
          role?: string
          telegram_id: number
        }
        Update: {
          role?: string
          telegram_id?: number
        }
        Relationships: []
      }
      bot_api_keys: {
        Row: {
          api_key: string
          created_at: string
          telegram_id: number
        }
        Insert: {
          api_key: string
          created_at?: string
          telegram_id: number
        }
        Update: {
          api_key?: string
          created_at?: string
          telegram_id?: number
        }
        Relationships: []
      }
      bot_bkash_sms: {
        Row: {
          amount_bdt: number
          body: string
          claimed_at: string | null
          claimed_by: number | null
          id: string
          received_at: string
          sender: string | null
          trx_id: string
        }
        Insert: {
          amount_bdt: number
          body: string
          claimed_at?: string | null
          claimed_by?: number | null
          id?: string
          received_at?: string
          sender?: string | null
          trx_id: string
        }
        Update: {
          amount_bdt?: number
          body?: string
          claimed_at?: string | null
          claimed_by?: number | null
          id?: string
          received_at?: string
          sender?: string | null
          trx_id?: string
        }
        Relationships: []
      }
      bot_coupon_uses: {
        Row: {
          coupon_id: string
          created_at: string
          telegram_id: number
        }
        Insert: {
          coupon_id: string
          created_at?: string
          telegram_id: number
        }
        Update: {
          coupon_id?: string
          created_at?: string
          telegram_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_coupon_uses_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "bot_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_coupons: {
        Row: {
          active: boolean
          amount_usd: number | null
          bot: string
          code: string
          created_at: string
          expires_at: string | null
          id: string
          max_uses: number
          percent: number | null
          product: string | null
          used_count: number
        }
        Insert: {
          active?: boolean
          amount_usd?: number | null
          bot?: string
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number
          percent?: number | null
          product?: string | null
          used_count?: number
        }
        Update: {
          active?: boolean
          amount_usd?: number | null
          bot?: string
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number
          percent?: number | null
          product?: string | null
          used_count?: number
        }
        Relationships: []
      }
      bot_deposits: {
        Row: {
          amount_credited: number | null
          amount_requested: number | null
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          note: string | null
          status: string
          telegram_id: number
          tx_hash: string | null
        }
        Insert: {
          amount_credited?: number | null
          amount_requested?: number | null
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          note?: string | null
          status?: string
          telegram_id: number
          tx_hash?: string | null
        }
        Update: {
          amount_credited?: number | null
          amount_requested?: number | null
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          note?: string | null
          status?: string
          telegram_id?: number
          tx_hash?: string | null
        }
        Relationships: []
      }
      bot_ext_licenses: {
        Row: {
          charge: number
          created_at: string
          expires_at: string | null
          id: string
          license_key: string
          package_id: number | null
          package_name: string
          telegram_id: number
        }
        Insert: {
          charge: number
          created_at?: string
          expires_at?: string | null
          id?: string
          license_key: string
          package_id?: number | null
          package_name: string
          telegram_id: number
        }
        Update: {
          charge?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          license_key?: string
          package_id?: number | null
          package_name?: string
          telegram_id?: number
        }
        Relationships: []
      }
      bot_ext_packages: {
        Row: {
          active: boolean
          created_at: string
          duration_unit: string
          duration_value: number
          id: number
          name: string
          price_bdt: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_unit: string
          duration_value: number
          id?: number
          name: string
          price_bdt: number
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_unit?: string
          duration_value?: number
          id?: number
          name?: string
          price_bdt?: number
        }
        Relationships: []
      }
      bot_orders: {
        Row: {
          category: string | null
          charge: number
          comments: string | null
          created_at: string
          error: string | null
          id: string
          link: string
          provider_order_id: string | null
          quantity: number
          refunded: number
          remains: string | null
          service_id: number
          service_name: string
          source: string
          start_count: string | null
          status: string
          telegram_id: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          charge: number
          comments?: string | null
          created_at?: string
          error?: string | null
          id?: string
          link: string
          provider_order_id?: string | null
          quantity: number
          refunded?: number
          remains?: string | null
          service_id: number
          service_name: string
          source?: string
          start_count?: string | null
          status?: string
          telegram_id: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          charge?: number
          comments?: string | null
          created_at?: string
          error?: string | null
          id?: string
          link?: string
          provider_order_id?: string | null
          quantity?: number
          refunded?: number
          remains?: string | null
          service_id?: number
          service_name?: string
          source?: string
          start_count?: string | null
          status?: string
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot_popular: {
        Row: {
          created_at: string
          service_id: number
        }
        Insert: {
          created_at?: string
          service_id: number
        }
        Update: {
          created_at?: string
          service_id?: number
        }
        Relationships: []
      }
      bot_secrets: {
        Row: {
          name: string
          value: string
        }
        Insert: {
          name: string
          value: string
        }
        Update: {
          name?: string
          value?: string
        }
        Relationships: []
      }
      bot_service_cache: {
        Row: {
          id: number
          services: Json
          updated_at: string
        }
        Insert: {
          id?: number
          services?: Json
          updated_at?: string
        }
        Update: {
          id?: number
          services?: Json
          updated_at?: string
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      bot_states: {
        Row: {
          data: Json
          step: string | null
          telegram_id: number
          updated_at: string
        }
        Insert: {
          data?: Json
          step?: string | null
          telegram_id: number
          updated_at?: string
        }
        Update: {
          data?: Json
          step?: string | null
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot_tg_accounts: {
        Row: {
          charge: number
          cost: number | null
          country: string | null
          created_at: string
          id: string
          item_id: number
          order_ref: string | null
          phone: string | null
          telegram_id: number
        }
        Insert: {
          charge: number
          cost?: number | null
          country?: string | null
          created_at?: string
          id?: string
          item_id: number
          order_ref?: string | null
          phone?: string | null
          telegram_id: number
        }
        Update: {
          charge?: number
          cost?: number | null
          country?: string | null
          created_at?: string
          id?: string
          item_id?: number
          order_ref?: string | null
          phone?: string | null
          telegram_id?: number
        }
        Relationships: []
      }
      bot_tickets: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string
          telegram_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          telegram_id: number
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string
          telegram_id?: number
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          balance: number
          created_at: string
          currency: string | null
          first_name: string | null
          is_admin: boolean
          is_banned: boolean
          language_code: string | null
          last_name: string | null
          last_seen_at: string
          ref_earned: number
          ref_rewarded: boolean
          referred_by: number | null
          telegram_id: number
          total_deposited: number
          total_spent: number
          username: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string | null
          first_name?: string | null
          is_admin?: boolean
          is_banned?: boolean
          language_code?: string | null
          last_name?: string | null
          last_seen_at?: string
          ref_earned?: number
          ref_rewarded?: boolean
          referred_by?: number | null
          telegram_id: number
          total_deposited?: number
          total_spent?: number
          username?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string | null
          first_name?: string | null
          is_admin?: boolean
          is_banned?: boolean
          language_code?: string | null
          last_name?: string | null
          last_seen_at?: string
          ref_earned?: number
          ref_rewarded?: boolean
          referred_by?: number | null
          telegram_id?: number
          total_deposited?: number
          total_spent?: number
          username?: string | null
        }
        Relationships: []
      }
      bot2_api_keys: {
        Row: {
          api_key: string
          created_at: string
          telegram_id: number
        }
        Insert: {
          api_key: string
          created_at?: string
          telegram_id: number
        }
        Update: {
          api_key?: string
          created_at?: string
          telegram_id?: number
        }
        Relationships: []
      }
      bot2_ext_licenses: {
        Row: {
          charge: number
          created_at: string
          expires_at: string | null
          id: string
          license_key: string
          package_id: number | null
          package_name: string
          telegram_id: number
        }
        Insert: {
          charge: number
          created_at?: string
          expires_at?: string | null
          id?: string
          license_key: string
          package_id?: number | null
          package_name: string
          telegram_id: number
        }
        Update: {
          charge?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          license_key?: string
          package_id?: number | null
          package_name?: string
          telegram_id?: number
        }
        Relationships: []
      }
      bot2_orders: {
        Row: {
          category: string | null
          charge: number
          comments: string | null
          created_at: string
          error: string | null
          id: string
          link: string
          provider_order_id: string | null
          quantity: number
          refunded: number
          remains: string | null
          service_id: number
          service_name: string
          source: string
          start_count: string | null
          status: string
          telegram_id: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          charge: number
          comments?: string | null
          created_at?: string
          error?: string | null
          id?: string
          link: string
          provider_order_id?: string | null
          quantity: number
          refunded?: number
          remains?: string | null
          service_id: number
          service_name: string
          source?: string
          start_count?: string | null
          status?: string
          telegram_id: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          charge?: number
          comments?: string | null
          created_at?: string
          error?: string | null
          id?: string
          link?: string
          provider_order_id?: string | null
          quantity?: number
          refunded?: number
          remains?: string | null
          service_id?: number
          service_name?: string
          source?: string
          start_count?: string | null
          status?: string
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot2_popular: {
        Row: {
          created_at: string
          service_id: number
        }
        Insert: {
          created_at?: string
          service_id: number
        }
        Update: {
          created_at?: string
          service_id?: number
        }
        Relationships: []
      }
      bot2_states: {
        Row: {
          data: Json
          step: string | null
          telegram_id: number
          updated_at: string
        }
        Insert: {
          data?: Json
          step?: string | null
          telegram_id: number
          updated_at?: string
        }
        Update: {
          data?: Json
          step?: string | null
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot2_tg_accounts: {
        Row: {
          charge: number
          cost: number | null
          country: string | null
          created_at: string
          id: string
          item_id: number
          order_ref: string | null
          phone: string | null
          telegram_id: number
        }
        Insert: {
          charge: number
          cost?: number | null
          country?: string | null
          created_at?: string
          id?: string
          item_id: number
          order_ref?: string | null
          phone?: string | null
          telegram_id: number
        }
        Update: {
          charge?: number
          cost?: number | null
          country?: string | null
          created_at?: string
          id?: string
          item_id?: number
          order_ref?: string | null
          phone?: string | null
          telegram_id?: number
        }
        Relationships: []
      }
      bot2_tickets: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string
          telegram_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          telegram_id: number
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string
          telegram_id?: number
        }
        Relationships: []
      }
      bot2_users: {
        Row: {
          balance: number
          created_at: string
          currency: string | null
          first_name: string | null
          is_admin: boolean
          is_banned: boolean
          language_code: string | null
          last_name: string | null
          last_seen_at: string
          ref_earned: number
          ref_rewarded: boolean
          referred_by: number | null
          telegram_id: number
          total_deposited: number
          total_spent: number
          username: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string | null
          first_name?: string | null
          is_admin?: boolean
          is_banned?: boolean
          language_code?: string | null
          last_name?: string | null
          last_seen_at?: string
          ref_earned?: number
          ref_rewarded?: boolean
          referred_by?: number | null
          telegram_id: number
          total_deposited?: number
          total_spent?: number
          username?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string | null
          first_name?: string | null
          is_admin?: boolean
          is_banned?: boolean
          language_code?: string | null
          last_name?: string | null
          last_seen_at?: string
          ref_earned?: number
          ref_rewarded?: boolean
          referred_by?: number | null
          telegram_id?: number
          total_deposited?: number
          total_spent?: number
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bot_adjust_balance: {
        Args: { _delta: number; _telegram_id: number }
        Returns: number
      }
      bot_redeem_coupon: {
        Args: { _bot: string; _code: string; _telegram_id: number }
        Returns: boolean
      }
      bot_release_coupon: {
        Args: { _bot: string; _code: string; _telegram_id: number }
        Returns: undefined
      }
      bot2_adjust_balance: {
        Args: { _delta: number; _telegram_id: number }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
