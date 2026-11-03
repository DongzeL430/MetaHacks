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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accessories: {
        Row: {
          approved: boolean
          created_at: string
          created_by: string | null
          id: number
          image_path: string
          name: string
          slot: Database["public"]["Enums"]["accessory_slot"]
          source: Database["public"]["Enums"]["content_source"]
        }
        Insert: {
          approved?: boolean
          created_at?: string
          created_by?: string | null
          id?: never
          image_path: string
          name: string
          slot: Database["public"]["Enums"]["accessory_slot"]
          source?: Database["public"]["Enums"]["content_source"]
        }
        Update: {
          approved?: boolean
          created_at?: string
          created_by?: string | null
          id?: never
          image_path?: string
          name?: string
          slot?: Database["public"]["Enums"]["accessory_slot"]
          source?: Database["public"]["Enums"]["content_source"]
        }
        Relationships: [
          {
            foreignKeyName: "accessories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      action_log: {
        Row: {
          created_at: string
          id: number
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          created_at: string
          id: number
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          ends_at: string
          id: number
          starts_at: string
          user_id: string
          weekday: number
        }
        Insert: {
          ends_at: string
          id?: never
          starts_at: string
          user_id?: string
          weekday: number
        }
        Update: {
          ends_at?: string
          id?: never
          starts_at?: string
          user_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id?: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          addressee_id: string
          connected_at: string | null
          created_at: string
          id: number
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          connected_at?: string | null
          created_at?: string
          id?: never
          requester_id: string
          status?: string
        }
        Update: {
          addressee_id?: string
          connected_at?: string | null
          created_at?: string
          id?: never
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_shares: {
        Row: {
          decided_at: string
          discord: boolean
          instagram: boolean
          pairing_id: number
          phone: boolean
          user_id: string
        }
        Insert: {
          decided_at?: string
          discord?: boolean
          instagram?: boolean
          pairing_id: number
          phone?: boolean
          user_id?: string
        }
        Update: {
          decided_at?: string
          discord?: boolean
          instagram?: boolean
          pairing_id?: number
          phone?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_shares_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "pairings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_search_cache: {
        Row: {
          courses: Json
          grad_year: number
          kind: Database["public"]["Enums"]["program_kind"]
          program_key: string
          searched_at: string
          sources: Json
          track_key: string
          university_domain: string
        }
        Insert: {
          courses: Json
          grad_year: number
          kind: Database["public"]["Enums"]["program_kind"]
          program_key: string
          searched_at?: string
          sources?: Json
          track_key?: string
          university_domain: string
        }
        Update: {
          courses?: Json
          grad_year?: number
          kind?: Database["public"]["Enums"]["program_kind"]
          program_key?: string
          searched_at?: string
          sources?: Json
          track_key?: string
          university_domain?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_search_cache_university_domain_fkey"
            columns: ["university_domain"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["domain"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: number
          title: string | null
          university_domain: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: never
          title?: string | null
          university_domain?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: never
          title?: string | null
          university_domain?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_university_domain_fkey"
            columns: ["university_domain"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["domain"]
          },
        ]
      }
      interests: {
        Row: {
          category: string | null
          label: string
          slug: string
        }
        Insert: {
          category?: string | null
          label: string
          slug: string
        }
        Update: {
          category?: string | null
          label?: string
          slug?: string
        }
        Relationships: []
      }
      lobbies: {
        Row: {
          created_at: string
          ends_at: string
          host_id: string
          id: string
          location: string
          locked: boolean
          max_size: number
          starts_at: string
          subject: string
          university_domain: string
          weekday: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          host_id: string
          id?: string
          location: string
          locked?: boolean
          max_size: number
          starts_at: string
          subject: string
          university_domain: string
          weekday: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          host_id?: string
          id?: string
          location?: string
          locked?: boolean
          max_size?: number
          starts_at?: string
          subject?: string
          university_domain?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "lobbies_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobbies_university_domain_fkey"
            columns: ["university_domain"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["domain"]
          },
        ]
      }
      lobby_members: {
        Row: {
          id: number
          joined_at: string
          lobby_id: string
          role: Database["public"]["Enums"]["lobby_role"]
          user_id: string
        }
        Insert: {
          id?: never
          joined_at?: string
          lobby_id: string
          role: Database["public"]["Enums"]["lobby_role"]
          user_id: string
        }
        Update: {
          id?: never
          joined_at?: string
          lobby_id?: string
          role?: Database["public"]["Enums"]["lobby_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobby_members_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_messages: {
        Row: {
          body: string
          created_at: string
          id: number
          lobby_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          lobby_id: string
          sender_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          lobby_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobby_messages_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pairings: {
        Row: {
          agreements: number | null
          created_at: string
          id: number
          mutual_at: string | null
          reactions: number | null
          user_high: string
          user_low: string
          vibe_check_ended_at: string | null
        }
        Insert: {
          agreements?: number | null
          created_at?: string
          id?: never
          mutual_at?: string | null
          reactions?: number | null
          user_high: string
          user_low: string
          vibe_check_ended_at?: string | null
        }
        Update: {
          agreements?: number | null
          created_at?: string
          id?: never
          mutual_at?: string | null
          reactions?: number | null
          user_high?: string
          user_low?: string
          vibe_check_ended_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairings_user_high_fkey"
            columns: ["user_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairings_user_low_fkey"
            columns: ["user_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          adult_confirmed_at: string
          created_at: string
          discord: string | null
          id: string
          instagram: string | null
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          phone: string | null
          university_domain: string
        }
        Insert: {
          adult_confirmed_at: string
          created_at?: string
          discord?: string | null
          id: string
          instagram?: string | null
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          phone?: string | null
          university_domain: string
        }
        Update: {
          adult_confirmed_at?: string
          created_at?: string
          discord?: string | null
          id?: string
          instagram?: string | null
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          phone?: string | null
          university_domain?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_university_domain_fkey"
            columns: ["university_domain"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["domain"]
          },
        ]
      }
      public_profiles: {
        Row: {
          animal: string
          avatar_path: string | null
          created_at: string
          equipped_accessories: Json
          id: string
          nickname: string
          points: number
        }
        Insert: {
          animal?: string
          avatar_path?: string | null
          created_at?: string
          equipped_accessories?: Json
          id: string
          nickname: string
          points?: number
        }
        Update: {
          animal?: string
          avatar_path?: string | null
          created_at?: string
          equipped_accessories?: Json
          id?: string
          nickname?: string
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: number
          pairing_id: number | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_id: string
          reporter_id: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: never
          pairing_id?: number | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_id: string
          reporter_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: never
          pairing_id?: number | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reported_id?: string
          reporter_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "pairings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_themes: {
        Row: {
          created_at: string
          id: string
          theme: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          theme: Json
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          theme?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_session_members: {
        Row: {
          account_deleted: boolean | null
          id: number
          nickname: string
          session_id: number
          user_id: string | null
        }
        Insert: {
          account_deleted?: boolean | null
          id?: never
          nickname: string
          session_id: number
          user_id?: string | null
        }
        Update: {
          account_deleted?: boolean | null
          id?: never
          nickname?: string
          session_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_session_members_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_session_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          course_id: number | null
          created_at: string
          ends_at: string
          id: number
          location: string
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          ends_at: string
          id?: never
          location: string
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          course_id?: number | null
          created_at?: string
          ends_at?: string
          id?: never
          location?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_answers: {
        Row: {
          answered_at: string
          choice: number
          question_id: number
          user_id: string
        }
        Insert: {
          answered_at?: string
          choice: number
          question_id: number
          user_id?: string
        }
        Update: {
          answered_at?: string
          choice?: number
          question_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          approved: boolean
          category: string
          created_at: string
          flexible_options: number[]
          id: number
          key: string
          kind: string
          options: string[]
          position: number
          prompt: string
          scale: string
          source: Database["public"]["Enums"]["content_source"]
        }
        Insert: {
          approved?: boolean
          category: string
          created_at?: string
          flexible_options?: number[]
          id?: never
          key: string
          kind: string
          options: string[]
          position: number
          prompt: string
          scale?: string
          source?: Database["public"]["Enums"]["content_source"]
        }
        Update: {
          approved?: boolean
          category?: string
          created_at?: string
          flexible_options?: number[]
          id?: never
          key?: string
          kind?: string
          options?: string[]
          position?: number
          prompt?: string
          scale?: string
          source?: Database["public"]["Enums"]["content_source"]
        }
        Relationships: []
      }
      universities: {
        Row: {
          created_at: string
          domain: string
          name: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          name?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          name?: string | null
        }
        Relationships: []
      }
      user_accessories: {
        Row: {
          accessory_id: number
          unlocked_at: string
          user_id: string
        }
        Insert: {
          accessory_id: number
          unlocked_at?: string
          user_id: string
        }
        Update: {
          accessory_id?: number
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_accessories_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_accessories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_courses: {
        Row: {
          confidence: number
          course_id: number | null
          created_at: string
          custom_name: string | null
          grade: Database["public"]["Enums"]["letter_grade"] | null
          id: number
          status: Database["public"]["Enums"]["course_status"]
          user_id: string
        }
        Insert: {
          confidence: number
          course_id?: number | null
          created_at?: string
          custom_name?: string | null
          grade?: Database["public"]["Enums"]["letter_grade"] | null
          id?: never
          status?: Database["public"]["Enums"]["course_status"]
          user_id?: string
        }
        Update: {
          confidence?: number
          course_id?: number | null
          created_at?: string
          custom_name?: string | null
          grade?: Database["public"]["Enums"]["letter_grade"] | null
          id?: never
          status?: Database["public"]["Enums"]["course_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_interests: {
        Row: {
          interest_slug: string
          user_id: string
        }
        Insert: {
          interest_slug: string
          user_id?: string
        }
        Update: {
          interest_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interests_interest_slug_fkey"
            columns: ["interest_slug"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "user_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_programs: {
        Row: {
          kind: Database["public"]["Enums"]["program_kind"]
          name: string
          position: number
          track: string | null
          user_id: string
        }
        Insert: {
          kind: Database["public"]["Enums"]["program_kind"]
          name: string
          position: number
          track?: string | null
          user_id?: string
        }
        Update: {
          kind?: Database["public"]["Enums"]["program_kind"]
          name?: string
          position?: number
          track?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_programs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_themes: {
        Row: {
          saved_theme_id: string | null
          theme: Json
          updated_at: string
          use_custom: boolean
          user_id: string
        }
        Insert: {
          saved_theme_id?: string | null
          theme: Json
          updated_at?: string
          use_custom?: boolean
          user_id?: string
        }
        Update: {
          saved_theme_id?: string | null
          theme?: Json
          updated_at?: string
          use_custom?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_themes_saved_theme_id_fkey"
            columns: ["saved_theme_id"]
            isOneToOne: false
            referencedRelation: "saved_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_decisions: {
        Row: {
          choice: Database["public"]["Enums"]["vibe_choice"]
          decided_at: string
          pairing_id: number
          user_id: string
        }
        Insert: {
          choice: Database["public"]["Enums"]["vibe_choice"]
          decided_at?: string
          pairing_id: number
          user_id?: string
        }
        Update: {
          choice?: Database["public"]["Enums"]["vibe_choice"]
          decided_at?: string
          pairing_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_decisions_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "pairings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_found_courses: {
        Args: { found: Json; school: string }
        Returns: undefined
      }
      answer_connection: {
        Args: { accept: boolean; person: string }
        Returns: undefined
      }
      answer_join: {
        Args: { accept: boolean; lobby_id: string; student: string }
        Returns: undefined
      }
      cancel_connection_request: {
        Args: { person: string }
        Returns: undefined
      }
      cancel_join: { Args: { lobby_id: string }; Returns: undefined }
      claim_muse_use: { Args: { student: string; what: string }; Returns: Json }
      close_lobby: { Args: { lobby_id: string }; Returns: undefined }
      connect_with: { Args: { person: string }; Returns: undefined }
      delete_my_account: { Args: never; Returns: undefined }
      finish_onboarding: { Args: never; Returns: undefined }
      hook_before_user_created: { Args: { event: Json }; Returns: Json }
      host_lobby: {
        Args: {
          ends_at: string
          lobby_id: string
          location: string
          max_size: number
          starts_at: string
          subject: string
          weekday: number
        }
        Returns: string
      }
      identity_changes_left: { Args: never; Returns: number }
      is_lobby_host: { Args: { p_lobby_id: string }; Returns: boolean }
      is_lobby_member: { Args: { p_lobby_id: string }; Returns: boolean }
      known_courses_for: {
        Args: { majors: string[]; school: string }
        Returns: {
          classmates: number
          code: string
          title: string
        }[]
      }
      leave_lobby: { Args: { lobby_id: string }; Returns: undefined }
      lobby_people: {
        Args: never
        Returns: {
          avatar_path: string
          courses_taken: string[]
          id: string
          nickname: string
          seeking_help_with: string[]
          shared_free: Json
        }[]
      }
      muse_uses_left: { Args: { what: string }; Returns: number }
      pair_on_cooldown: {
        Args: { student_a: string; student_b: string }
        Returns: boolean
      }
      request_join: { Args: { lobby_id: string }; Returns: undefined }
      save_my_answers: { Args: { answers: Json }; Returns: undefined }
      save_my_courses: { Args: { courses: Json }; Returns: undefined }
      set_lobby_locked: {
        Args: { lobby_id: string; locked: boolean }
        Returns: undefined
      }
    }
    Enums: {
      accessory_slot: "head" | "face" | "neck" | "held"
      content_source: "team" | "ai"
      course_status: "taking" | "completed"
      letter_grade:
        | "A+"
        | "A"
        | "A-"
        | "B+"
        | "B"
        | "B-"
        | "C+"
        | "C"
        | "C-"
        | "D+"
        | "D"
        | "D-"
        | "F"
        | "E"
        | "P"
        | "NP"
        | "S"
        | "U"
        | "CR"
        | "NC"
        | "H"
        | "HP"
        | "LP"
        | "W"
        | "I"
        | "AU"
      lobby_role: "member" | "requested"
      onboarding_status: "new" | "onboarded"
      program_kind: "major" | "minor"
      report_reason:
        | "harassment"
        | "inappropriate"
        | "spam"
        | "safety"
        | "other"
      report_status: "open" | "reviewed"
      session_status: "planned" | "completed" | "cancelled"
      vibe_choice: "vibe" | "pass"
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
    Enums: {
      accessory_slot: ["head", "face", "neck", "held"],
      content_source: ["team", "ai"],
      course_status: ["taking", "completed"],
      letter_grade: [
        "A+",
        "A",
        "A-",
        "B+",
        "B",
        "B-",
        "C+",
        "C",
        "C-",
        "D+",
        "D",
        "D-",
        "F",
        "E",
        "P",
        "NP",
        "S",
        "U",
        "CR",
        "NC",
        "H",
        "HP",
        "LP",
        "W",
        "I",
        "AU",
      ],
      lobby_role: ["member", "requested"],
      onboarding_status: ["new", "onboarded"],
      program_kind: ["major", "minor"],
      report_reason: ["harassment", "inappropriate", "spam", "safety", "other"],
      report_status: ["open", "reviewed"],
      session_status: ["planned", "completed", "cancelled"],
      vibe_choice: ["vibe", "pass"],
    },
  },
} as const
