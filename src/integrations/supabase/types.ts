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
          start_count?: string | null
          status?: string
          telegram_id?: number
          updated_at?: string
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
