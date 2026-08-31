export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      cohorts: {
        Row: {
          id: string;
          name: string;
          start_date: string;
          end_date: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          start_date?: string;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          start_date?: string;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          avatar_path: string | null;
          timezone: string;
          reaction_palette: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          avatar_path?: string | null;
          timezone: string;
          reaction_palette?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          avatar_path?: string | null;
          timezone?: string;
          reaction_palette?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          cohort_id: string;
          user_id: string;
          role: "member" | "admin";
          joined_at: string;
          join_local_date: string;
          removed_at: string | null;
          removed_by: string | null;
          created_at: string;
        };
        Insert: {
          cohort_id: string;
          user_id: string;
          role?: "member" | "admin";
          joined_at?: string;
          join_local_date: string;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
        };
        Update: {
          cohort_id?: string;
          user_id?: string;
          role?: "member" | "admin";
          joined_at?: string;
          join_local_date?: string;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      invite_codes: {
        Row: {
          id: string;
          cohort_id: string;
          code_digest: string;
          code_ciphertext: string;
          code_hint: string;
          is_active: boolean;
          created_by: string;
          created_at: string;
          rotated_at: string | null;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          code_digest: string;
          code_ciphertext: string;
          code_hint: string;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          rotated_at?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          code_digest?: string;
          code_ciphertext?: string;
          code_hint?: string;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          rotated_at?: string | null;
        };
        Relationships: [];
      };
      signup_intents: {
        Row: {
          id: string;
          invite_digest: string;
          auth_user_id: string | null;
          email_digest: string | null;
          nonce_digest: string;
          expires_at: string;
          consumed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invite_digest: string;
          auth_user_id?: string | null;
          email_digest?: string | null;
          nonce_digest: string;
          expires_at: string;
          consumed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          invite_digest?: string;
          auth_user_id?: string | null;
          email_digest?: string | null;
          nonce_digest?: string;
          expires_at?: string;
          consumed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_type: string;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          target_type?: string;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      membership_role: "member" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];
