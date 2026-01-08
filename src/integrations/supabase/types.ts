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
      containers: {
        Row: {
          created_at: string
          id: string
          image: string
          last_state_exit_code: number | null
          last_state_message: string | null
          last_state_reason: string | null
          name: string
          pod_id: string
          ready: boolean | null
          restart_count: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["container_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image: string
          last_state_exit_code?: number | null
          last_state_message?: string | null
          last_state_reason?: string | null
          name: string
          pod_id: string
          ready?: boolean | null
          restart_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["container_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image?: string
          last_state_exit_code?: number | null
          last_state_message?: string | null
          last_state_reason?: string | null
          name?: string
          pod_id?: string
          ready?: boolean | null
          restart_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["container_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "containers_pod_id_fkey"
            columns: ["pod_id"]
            isOneToOne: false
            referencedRelation: "pods"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          container_id: string
          created_at: string
          id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          timestamp: string
        }
        Insert: {
          container_id: string
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message: string
          timestamp?: string
        }
        Update: {
          container_id?: string
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
        ]
      }
      pods: {
        Row: {
          created_at: string
          id: string
          labels: Json | null
          name: string
          namespace: string
          node_name: string | null
          pod_ip: string | null
          restarts: number | null
          status: Database["public"]["Enums"]["pod_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          labels?: Json | null
          name: string
          namespace?: string
          node_name?: string | null
          pod_ip?: string | null
          restarts?: number | null
          status?: Database["public"]["Enums"]["pod_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          labels?: Json | null
          name?: string
          namespace?: string
          node_name?: string | null
          pod_ip?: string | null
          restarts?: number | null
          status?: Database["public"]["Enums"]["pod_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      container_status: "Running" | "Waiting" | "Terminated"
      log_level: "info" | "warn" | "error"
      pod_status:
        | "Running"
        | "Pending"
        | "Error"
        | "OOMKilled"
        | "CrashLoopBackOff"
        | "Terminated"
        | "Unknown"
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
      container_status: ["Running", "Waiting", "Terminated"],
      log_level: ["info", "warn", "error"],
      pod_status: [
        "Running",
        "Pending",
        "Error",
        "OOMKilled",
        "CrashLoopBackOff",
        "Terminated",
        "Unknown",
      ],
    },
  },
} as const
