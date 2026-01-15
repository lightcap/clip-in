export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          peloton_user_id: string | null;
          peloton_username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          current_ftp: number | null;
          estimated_ftp: number | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
          peloton_user_id?: string | null;
          peloton_username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          current_ftp?: number | null;
          estimated_ftp?: number | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          peloton_user_id?: string | null;
          peloton_username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          current_ftp?: number | null;
          estimated_ftp?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      peloton_tokens: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          expires_at: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
          access_token_encrypted?: string;
          refresh_token_encrypted?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peloton_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ftp_records: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          workout_id: string;
          workout_date: string;
          ride_title: string | null;
          avg_output: number;
          calculated_ftp: number;
          baseline_ftp: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          workout_id: string;
          workout_date: string;
          ride_title?: string | null;
          avg_output: number;
          calculated_ftp: number;
          baseline_ftp: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          workout_id?: string;
          workout_date?: string;
          ride_title?: string | null;
          avg_output?: number;
          calculated_ftp?: number;
          baseline_ftp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ftp_records_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      planned_workouts: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          peloton_ride_id: string;
          ride_title: string;
          ride_image_url: string | null;
          instructor_name: string | null;
          duration_seconds: number;
          discipline: string;
          scheduled_date: string;
          scheduled_time: string | null;
          status: "planned" | "completed" | "skipped" | "postponed";
          pushed_to_stack: boolean;
          pushed_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          peloton_ride_id: string;
          ride_title: string;
          ride_image_url?: string | null;
          instructor_name?: string | null;
          duration_seconds: number;
          discipline: string;
          scheduled_date: string;
          scheduled_time?: string | null;
          status?: "planned" | "completed" | "skipped" | "postponed";
          pushed_to_stack?: boolean;
          pushed_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
          peloton_ride_id?: string;
          ride_title?: string;
          ride_image_url?: string | null;
          instructor_name?: string | null;
          duration_seconds?: number;
          discipline?: string;
          scheduled_date?: string;
          scheduled_time?: string | null;
          status?: "planned" | "completed" | "skipped" | "postponed";
          pushed_to_stack?: boolean;
          pushed_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "planned_workouts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stack_sync_logs: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          sync_type: "manual" | "scheduled";
          workouts_pushed: number;
          success: boolean;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          sync_type: "manual" | "scheduled";
          workouts_pushed: number;
          success: boolean;
          error_message?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          sync_type?: "manual" | "scheduled";
          workouts_pushed?: number;
          success?: boolean;
          error_message?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stack_sync_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      workout_status: "planned" | "completed" | "skipped" | "postponed";
      sync_type: "manual" | "scheduled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
