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
      attribute_history: {
        Row: {
          attrs: Json
          id: string
          match_id: string | null
          ovr: number
          player_id: string
          reason: string
          snapshot_at: string
        }
        Insert: {
          attrs?: Json
          id?: string
          match_id?: string | null
          ovr: number
          player_id: string
          reason: string
          snapshot_at?: string
        }
        Update: {
          attrs?: Json
          id?: string
          match_id?: string | null
          ovr?: number
          player_id?: string
          reason?: string
          snapshot_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_ratings: {
        Row: {
          attribute: string
          n_raters: number
          n_votes: number
          player_id: string
          updated_at: string
          value: number
        }
        Insert: {
          attribute: string
          n_raters?: number
          n_votes?: number
          player_id: string
          updated_at?: string
          value: number
        }
        Update: {
          attribute?: string
          n_raters?: number
          n_votes?: number
          player_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "attribute_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      collusion_flags: {
        Row: {
          flagged_at: string
          rater_player_id: string
          target_player_id: string
        }
        Insert: {
          flagged_at?: string
          rater_player_id: string
          target_player_id: string
        }
        Update: {
          flagged_at?: string
          rater_player_id?: string
          target_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collusion_flags_rater_player_id_fkey"
            columns: ["rater_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collusion_flags_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["group_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          settings: Json
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          settings?: Json
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          settings?: Json
          slug?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          group_id: string
          id: string
          max_uses: number | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["group_role"]
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          group_id: string
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          group_id?: string
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      match_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          match_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          match_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          match_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "match_audit_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          match_id: string
          player_id: string
          position: string | null
          role: Database["public"]["Enums"]["participant_role"]
          team_id: string | null
        }
        Insert: {
          match_id: string
          player_id: string
          position?: string | null
          role?: Database["public"]["Enums"]["participant_role"]
          team_id?: string | null
        }
        Update: {
          match_id?: string
          player_id?: string
          position?: string | null
          role?: Database["public"]["Enums"]["participant_role"]
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "match_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_ratings: {
        Row: {
          created_at: string
          match_id: string
          rater_player_id: string
          rater_role: Database["public"]["Enums"]["participant_role"]
          rating: number
          standout_attributes: string[]
          target_player_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          match_id: string
          rater_player_id: string
          rater_role: Database["public"]["Enums"]["participant_role"]
          rating: number
          standout_attributes?: string[]
          target_player_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          match_id?: string
          rater_player_id?: string
          rater_role?: Database["public"]["Enums"]["participant_role"]
          rating?: number
          standout_attributes?: string[]
          target_player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_ratings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ratings_rater_player_id_fkey"
            columns: ["rater_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ratings_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          decided_by: string
          finalized_at: string
          match_id: string
          pens1: number | null
          pens2: number | null
          team1_goals: number
          team2_goals: number
          winner_side: number | null
        }
        Insert: {
          decided_by?: string
          finalized_at?: string
          match_id: string
          pens1?: number | null
          pens2?: number | null
          team1_goals: number
          team2_goals: number
          winner_side?: number | null
        }
        Update: {
          decided_by?: string
          finalized_at?: string
          match_id?: string
          pens1?: number | null
          pens2?: number | null
          team1_goals?: number
          team2_goals?: number
          winner_side?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_stats: {
        Row: {
          assists: number
          clean_sheet: boolean
          goals: number
          is_mvp: boolean
          match_id: string
          median_rating: number | null
          n_ratings: number
          own_goals: number
          player_id: string
          saves: number
        }
        Insert: {
          assists?: number
          clean_sheet?: boolean
          goals?: number
          is_mvp?: boolean
          match_id: string
          median_rating?: number | null
          n_ratings?: number
          own_goals?: number
          player_id: string
          saves?: number
        }
        Update: {
          assists?: number
          clean_sheet?: boolean
          goals?: number
          is_mvp?: boolean
          match_id?: string
          median_rating?: number | null
          n_ratings?: number
          own_goals?: number
          player_id?: string
          saves?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      match_teams: {
        Row: {
          color: string | null
          id: string
          match_id: string
          name: string
          side: number
        }
        Insert: {
          color?: string | null
          id?: string
          match_id: string
          name: string
          side: number
        }
        Update: {
          color?: string | null
          id?: string
          match_id?: string
          name?: string
          side?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_teams_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          created_by: string
          finalized_at: string | null
          group_id: string
          id: string
          kind: string
          played_at: string | null
          rating_deadline: string | null
          report_deadline: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["match_status"]
          team_size: number
          tournament_match_id: string | null
          venue: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          finalized_at?: string | null
          group_id: string
          id?: string
          kind?: string
          played_at?: string | null
          rating_deadline?: string | null
          report_deadline?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["match_status"]
          team_size: number
          tournament_match_id?: string | null
          venue?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          finalized_at?: string | null
          group_id?: string
          id?: string
          kind?: string
          played_at?: string | null
          rating_deadline?: string | null
          report_deadline?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["match_status"]
          team_size?: number
          tournament_match_id?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      openskill_ratings: {
        Row: {
          matches_played: number
          mu: number
          ordinal: number | null
          player_id: string
          sigma: number
          updated_at: string
        }
        Insert: {
          matches_played?: number
          mu?: number
          ordinal?: number | null
          player_id: string
          sigma?: number
          updated_at?: string
        }
        Update: {
          matches_played?: number
          mu?: number
          ordinal?: number | null
          player_id?: string
          sigma?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "openskill_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_cards: {
        Row: {
          face: Json
          is_provisional: boolean
          n_raters: number
          ovr: number
          ovr_by_position: Json
          player_id: string
          playstyles: Json
          position: string | null
          skill_moves: number | null
          tier: Database["public"]["Enums"]["card_tier"]
          updated_at: string
          weak_foot: number | null
        }
        Insert: {
          face?: Json
          is_provisional?: boolean
          n_raters?: number
          ovr: number
          ovr_by_position?: Json
          player_id: string
          playstyles?: Json
          position?: string | null
          skill_moves?: number | null
          tier?: Database["public"]["Enums"]["card_tier"]
          updated_at?: string
          weak_foot?: number | null
        }
        Update: {
          face?: Json
          is_provisional?: boolean
          n_raters?: number
          ovr?: number
          ovr_by_position?: Json
          player_id?: string
          playstyles?: Json
          position?: string | null
          skill_moves?: number | null
          tier?: Database["public"]["Enums"]["card_tier"]
          updated_at?: string
          weak_foot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          alt_positions: string[]
          avatar_url: string | null
          claimed_at: string | null
          created_at: string
          created_by: string
          display_name: string
          group_id: string
          height_cm: number | null
          id: string
          is_guest: boolean
          left_at: string | null
          preferred_foot: Database["public"]["Enums"]["preferred_foot"] | null
          primary_position: string | null
          user_id: string | null
        }
        Insert: {
          alt_positions?: string[]
          avatar_url?: string | null
          claimed_at?: string | null
          created_at?: string
          created_by: string
          display_name: string
          group_id: string
          height_cm?: number | null
          id?: string
          is_guest?: boolean
          left_at?: string | null
          preferred_foot?: Database["public"]["Enums"]["preferred_foot"] | null
          primary_position?: string | null
          user_id?: string | null
        }
        Update: {
          alt_positions?: string[]
          avatar_url?: string | null
          claimed_at?: string | null
          created_at?: string
          created_by?: string
          display_name?: string
          group_id?: string
          height_cm?: number | null
          id?: string
          is_guest?: boolean
          left_at?: string | null
          preferred_foot?: Database["public"]["Enums"]["preferred_foot"] | null
          primary_position?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      playstyle_votes: {
        Row: {
          created_at: string
          playstyle: string
          rater_player_id: string
          target_player_id: string
        }
        Insert: {
          created_at?: string
          playstyle: string
          rater_player_id: string
          target_player_id: string
        }
        Update: {
          created_at?: string
          playstyle?: string
          rater_player_id?: string
          target_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playstyle_votes_rater_player_id_fkey"
            columns: ["rater_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playstyle_votes_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      rater_stats: {
        Row: {
          bias: number
          n_votes: number
          player_id: string
          reliability: number
          rmse: number
          updated_at: string
        }
        Insert: {
          bias?: number
          n_votes?: number
          player_id: string
          reliability?: number
          rmse?: number
          updated_at?: string
        }
        Update: {
          bias?: number
          n_votes?: number
          player_id?: string
          reliability?: number
          rmse?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rater_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      recompute_queue: {
        Row: {
          enqueued_at: string
          player_id: string
          reason: string
        }
        Insert: {
          enqueued_at?: string
          player_id: string
          reason: string
        }
        Update: {
          enqueued_at?: string
          player_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "recompute_queue_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      score_reports: {
        Row: {
          created_at: string
          match_id: string
          reporter_player_id: string
          team1_goals: number
          team2_goals: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          match_id: string
          reporter_player_id: string
          team1_goals: number
          team2_goals: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          match_id?: string
          reporter_player_id?: string
          team1_goals?: number
          team2_goals?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_reports_reporter_player_id_fkey"
            columns: ["reporter_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      scouting_votes: {
        Row: {
          attribute: string
          created_at: string
          group_id: string
          id: string
          mode: Database["public"]["Enums"]["vote_mode"]
          rater_player_id: string
          superseded_at: string | null
          target_player_id: string
          value: number
        }
        Insert: {
          attribute: string
          created_at?: string
          group_id: string
          id?: string
          mode: Database["public"]["Enums"]["vote_mode"]
          rater_player_id: string
          superseded_at?: string | null
          target_player_id: string
          value: number
        }
        Update: {
          attribute?: string
          created_at?: string
          group_id?: string
          id?: string
          mode?: Database["public"]["Enums"]["vote_mode"]
          rater_player_id?: string
          superseded_at?: string | null
          target_player_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scouting_votes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_votes_rater_player_id_fkey"
            columns: ["rater_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_votes_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      star_votes: {
        Row: {
          created_at: string
          kind: Database["public"]["Enums"]["star_kind"]
          rater_player_id: string
          target_player_id: string
          value: number
        }
        Insert: {
          created_at?: string
          kind: Database["public"]["Enums"]["star_kind"]
          rater_player_id: string
          target_player_id: string
          value: number
        }
        Update: {
          created_at?: string
          kind?: Database["public"]["Enums"]["star_kind"]
          rater_player_id?: string
          target_player_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "star_votes_rater_player_id_fkey"
            columns: ["rater_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "star_votes_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      stat_reports: {
        Row: {
          assists: number
          created_at: string
          goals: number
          match_id: string
          own_goals: number
          reporter_player_id: string
          saves: number
          subject_player_id: string
          updated_at: string
        }
        Insert: {
          assists?: number
          created_at?: string
          goals?: number
          match_id: string
          own_goals?: number
          reporter_player_id: string
          saves?: number
          subject_player_id: string
          updated_at?: string
        }
        Update: {
          assists?: number
          created_at?: string
          goals?: number
          match_id?: string
          own_goals?: number
          reporter_player_id?: string
          saves?: number
          subject_player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stat_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_reports_reporter_player_id_fkey"
            columns: ["reporter_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_reports_subject_player_id_fkey"
            columns: ["subject_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: string }
      add_guest_player: {
        Args: {
          p_display_name: string
          p_group_id: string
          p_primary_position?: string
        }
        Returns: string
      }
      assign_guest_player: {
        Args: { p_player_id: string; p_user_id: string }
        Returns: undefined
      }
      cancel_match: { Args: { p_match_id: string }; Returns: undefined }
      claim_guest_player: { Args: { p_player_id: string }; Returns: undefined }
      close_expired_windows: { Args: never; Returns: number }
      create_group: { Args: { p_name: string }; Returns: string }
      create_invite: {
        Args: {
          p_expires_at?: string
          p_group_id: string
          p_max_uses?: number
          p_role?: Database["public"]["Enums"]["group_role"]
        }
        Returns: {
          code: string
          id: string
        }[]
      }
      create_match: {
        Args: {
          p_group_id: string
          p_scheduled_at: string
          p_team_size: number
          p_venue?: string
        }
        Returns: string
      }
      get_invite_preview: {
        Args: { p_code: string }
        Returns: {
          group_id: string
          group_name: string
          member_count: number
          role: Database["public"]["Enums"]["group_role"]
          valid: boolean
        }[]
      }
      get_match_report_summary: {
        Args: { p_match_id: string }
        Returns: {
          all_agree: boolean
          reporters: number
          side: number
        }[]
      }
      get_my_scouting_ballot: {
        Args: { p_target_player_id: string }
        Returns: {
          attribute: string
          created_at: string
          mode: Database["public"]["Enums"]["vote_mode"]
          value: number
        }[]
      }
      get_scouting_status: {
        Args: { p_target_player_id: string }
        Returns: {
          can_vote: boolean
          next_vote_at: string
          reason: string
        }[]
      }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      remove_member: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: undefined
      }
      request_finalize: { Args: { p_match_id: string }; Returns: undefined }
      resolve_dispute: {
        Args: {
          p_match_id: string
          p_stats?: Json
          p_team1_goals: number
          p_team2_goals: number
        }
        Returns: undefined
      }
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined }
      set_match_lineup: {
        Args: {
          p_match_id: string
          p_spectators?: string[]
          p_team1: Json
          p_team2: Json
        }
        Returns: undefined
      }
      set_member_role: {
        Args: {
          p_group_id: string
          p_role: Database["public"]["Enums"]["group_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      start_reporting: {
        Args: { p_match_id: string; p_played_at?: string }
        Returns: undefined
      }
      submit_match_ratings: {
        Args: { p_match_id: string; p_ratings: Json }
        Returns: undefined
      }
      submit_playstyle_votes: {
        Args: { p_playstyles: string[]; p_target_player_id: string }
        Returns: undefined
      }
      submit_score_report: {
        Args: {
          p_match_id: string
          p_team1_goals: number
          p_team2_goals: number
        }
        Returns: undefined
      }
      submit_scouting_votes: {
        Args: { p_mode: string; p_target_player_id: string; p_votes: Json }
        Returns: undefined
      }
      submit_star_votes: {
        Args: {
          p_skill_moves: number
          p_target_player_id: string
          p_weak_foot: number
        }
        Returns: undefined
      }
      submit_stat_reports: {
        Args: { p_match_id: string; p_reports: Json }
        Returns: undefined
      }
      transfer_ownership: {
        Args: { p_group_id: string; p_new_owner: string }
        Returns: undefined
      }
      update_group: {
        Args: { p_group_id: string; p_name: string; p_settings: Json }
        Returns: undefined
      }
      update_my_player: {
        Args: {
          p_alt_positions?: string[]
          p_display_name: string
          p_group_id: string
          p_height_cm?: number
          p_preferred_foot?: Database["public"]["Enums"]["preferred_foot"]
          p_primary_position?: string
        }
        Returns: undefined
      }
      update_player: {
        Args: {
          p_alt_positions?: string[]
          p_display_name: string
          p_height_cm?: number
          p_player_id: string
          p_preferred_foot?: Database["public"]["Enums"]["preferred_foot"]
          p_primary_position?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      card_tier: "bronze" | "silver" | "gold" | "special"
      group_role: "owner" | "admin" | "member" | "spectator"
      match_status:
        | "scheduled"
        | "reporting"
        | "disputed"
        | "pending_finalize"
        | "finalized"
        | "cancelled"
      participant_role: "player" | "spectator"
      preferred_foot: "left" | "right" | "both"
      star_kind: "weak_foot" | "skill_moves"
      vote_mode: "quick" | "detailed"
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
      card_tier: ["bronze", "silver", "gold", "special"],
      group_role: ["owner", "admin", "member", "spectator"],
      match_status: [
        "scheduled",
        "reporting",
        "disputed",
        "pending_finalize",
        "finalized",
        "cancelled",
      ],
      participant_role: ["player", "spectator"],
      preferred_foot: ["left", "right", "both"],
      star_kind: ["weak_foot", "skill_moves"],
      vote_mode: ["quick", "detailed"],
    },
  },
} as const

