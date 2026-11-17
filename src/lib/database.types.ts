/**
 * Database types matching supabase/schema.sql.
 * Shape follows `supabase gen types typescript`, so you can replace this file
 * with generated output later without touching the rest of the code.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          slug: string;
          title: string;
          summary: string;
          content: string;
          category: string;
          tech_stack: string[];
          thumbnail_url: string | null;
          gallery_urls: string[];
          live_url: string | null;
          repo_url: string | null;
          featured: boolean;
          published: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          summary: string;
          content?: string;
          category?: string;
          tech_stack?: string[];
          thumbnail_url?: string | null;
          gallery_urls?: string[];
          live_url?: string | null;
          repo_url?: string | null;
          featured?: boolean;
          published?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          summary?: string;
          content?: string;
          category?: string;
          tech_stack?: string[];
          thumbnail_url?: string | null;
          gallery_urls?: string[];
          live_url?: string | null;
          repo_url?: string | null;
          featured?: boolean;
          published?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      social_links: {
        Row: {
          id: string;
          platform: string;
          handle: string;
          url: string;
          description: string;
          sort_order: number;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          platform: string;
          handle?: string;
          url: string;
          description?: string;
          sort_order?: number;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          platform?: string;
          handle?: string;
          url?: string;
          description?: string;
          sort_order?: number;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: never; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ProjectRow = Database['public']['Tables']['projects']['Row'];
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type SocialLinkRow = Database['public']['Tables']['social_links']['Row'];
export type SocialLinkInsert = Database['public']['Tables']['social_links']['Insert'];
