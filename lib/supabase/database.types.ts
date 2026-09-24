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
      badges: {
        Row: {
          category: string
          code: string
          icon: string
          name_key: string
          sort: number
        }
        Insert: {
          category: string
          code: string
          icon: string
          name_key: string
          sort?: number
        }
        Update: {
          category?: string
          code?: string
          icon?: string
          name_key?: string
          sort?: number
        }
        Relationships: []
      }
      club_players: {
        Row: {
          club_id: string
          player_id: string
          shirt_number: number | null
        }
        Insert: {
          club_id: string
          player_id: string
          shirt_number?: number | null
        }
        Update: {
          club_id?: string
          player_id?: string
          shirt_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "club_players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          created_by: string | null
          crest_path: string | null
          group_id: string
          id: string
          name: string
          primary_color: string
          secondary_color: string
          short_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          crest_path?: string | null
          group_id: string
          id?: string
          name: string
          primary_color?: string
          secondary_color?: string
          short_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          crest_path?: string | null
          group_id?: string
          id?: string
          name?: string
          primary_color?: string
          secondary_color?: string
          short_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
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
          club_id: string | null
          color: string | null
          id: string
          match_id: string
          name: string
          side: number
        }
        Insert: {
          club_id?: string | null
          color?: string | null
          id?: string
          match_id: string
          name: string
          side: number
        }
        Update: {
          club_id?: string | null
          color?: string | null
          id?: string
          match_id?: string
          name?: string
          side?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "matches_tournament_match_id_fkey"
            columns: ["tournament_match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          kind: string
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_group_id_fkey"
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
      player_badges: {
        Row: {
          awarded_at: string
          badge_code: string
          count: number
          match_id: string | null
          player_id: string
          tournament_id: string | null
        }
        Insert: {
          awarded_at?: string
          badge_code: string
          count?: number
          match_id?: string | null
          player_id: string
          tournament_id?: string | null
        }
        Update: {
          awarded_at?: string
          badge_code?: string
          count?: number
          match_id?: string | null
          player_id?: string
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_badges_badge_code_fkey"
            columns: ["badge_code"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "player_badges_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
          notification_prefs: Json
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          notification_prefs?: Json
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          notification_prefs?: Json
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      squad_likes: {
        Row: {
          created_at: string
          player_id: string
          squad_id: string
        }
        Insert: {
          created_at?: string
          player_id: string
          squad_id: string
        }
        Update: {
          created_at?: string
          player_id?: string
          squad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_likes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_likes_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_slots: {
        Row: {
          player_id: string
          position: string
          slot: number
          squad_id: string
        }
        Insert: {
          player_id: string
          position: string
          slot: number
          squad_id: string
        }
        Update: {
          player_id?: string
          position?: string
          slot?: number
          squad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_slots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_slots_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squads: {
        Row: {
          club_id: string | null
          created_at: string
          formation: string
          group_id: string
          id: string
          kind: Database["public"]["Enums"]["squad_kind"]
          match_id: string | null
          name: string
          owner_player_id: string
          published: boolean
          published_at: string | null
          side: number | null
          team_size: number
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          formation: string
          group_id: string
          id?: string
          kind: Database["public"]["Enums"]["squad_kind"]
          match_id?: string | null
          name: string
          owner_player_id: string
          published?: boolean
          published_at?: string | null
          side?: number | null
          team_size: number
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          formation?: string
          group_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["squad_kind"]
          match_id?: string | null
          name?: string
          owner_player_id?: string
          published?: boolean
          published_at?: string | null
          side?: number | null
          team_size?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "squads_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_owner_player_id_fkey"
            columns: ["owner_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_groups: {
        Row: {
          engine_key: string
          id: string
          label: string
          number: number
          stage_id: string
          tournament_id: string
        }
        Insert: {
          engine_key: string
          id?: string
          label: string
          number: number
          stage_id: string
          tournament_id: string
        }
        Update: {
          engine_key?: string
          id?: string
          label?: string
          number?: number
          stage_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_groups_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          engine_key: string
          id: string
          kind: Database["public"]["Enums"]["stage_kind"]
          settings: Json
          stage_order: number
          tournament_id: string
        }
        Insert: {
          engine_key: string
          id?: string
          kind: Database["public"]["Enums"]["stage_kind"]
          settings?: Json
          stage_order: number
          tournament_id: string
        }
        Update: {
          engine_key?: string
          id?: string
          kind?: Database["public"]["Enums"]["stage_kind"]
          settings?: Json
          stage_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
      tournament_entries: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          name: string
          player_ids: string[]
          seed: number | null
          tournament_id: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          name: string
          player_ids?: string[]
          seed?: number | null
          tournament_id: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          name?: string
          player_ids?: string[]
          seed?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          bracket: Database["public"]["Enums"]["tournament_bracket"]
          decided_by:
            | Database["public"]["Enums"]["tournament_decided_by"]
            | null
          engine_key: string
          entry1_from: Json | null
          entry1_id: string | null
          entry2_from: Json | null
          entry2_id: string | null
          id: string
          loser_entry_id: string | null
          match_id: string | null
          next_loser_match_id: string | null
          next_loser_slot: number | null
          next_match_id: string | null
          next_slot: number | null
          number: number
          pens1: number | null
          pens2: number | null
          round: number
          score1: number | null
          score2: number | null
          stage_group_id: string | null
          stage_id: string
          status: Database["public"]["Enums"]["tournament_match_status"]
          tournament_id: string
          winner_entry_id: string | null
        }
        Insert: {
          bracket: Database["public"]["Enums"]["tournament_bracket"]
          decided_by?:
            | Database["public"]["Enums"]["tournament_decided_by"]
            | null
          engine_key: string
          entry1_from?: Json | null
          entry1_id?: string | null
          entry2_from?: Json | null
          entry2_id?: string | null
          id?: string
          loser_entry_id?: string | null
          match_id?: string | null
          next_loser_match_id?: string | null
          next_loser_slot?: number | null
          next_match_id?: string | null
          next_slot?: number | null
          number: number
          pens1?: number | null
          pens2?: number | null
          round: number
          score1?: number | null
          score2?: number | null
          stage_group_id?: string | null
          stage_id: string
          status?: Database["public"]["Enums"]["tournament_match_status"]
          tournament_id: string
          winner_entry_id?: string | null
        }
        Update: {
          bracket?: Database["public"]["Enums"]["tournament_bracket"]
          decided_by?:
            | Database["public"]["Enums"]["tournament_decided_by"]
            | null
          engine_key?: string
          entry1_from?: Json | null
          entry1_id?: string | null
          entry2_from?: Json | null
          entry2_id?: string | null
          id?: string
          loser_entry_id?: string | null
          match_id?: string | null
          next_loser_match_id?: string | null
          next_loser_slot?: number | null
          next_match_id?: string | null
          next_slot?: number | null
          number?: number
          pens1?: number | null
          pens2?: number | null
          round?: number
          score1?: number | null
          score2?: number | null
          stage_group_id?: string | null
          stage_id?: string
          status?: Database["public"]["Enums"]["tournament_match_status"]
          tournament_id?: string
          winner_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_loser_entry_id_fkey"
            columns: ["loser_entry_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_next_loser_match_id_fkey"
            columns: ["next_loser_match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_stage_group_id_fkey"
            columns: ["stage_group_id"]
            isOneToOne: false
            referencedRelation: "stage_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_entry_id_fkey"
            columns: ["winner_entry_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          player_id: string
          registered_at: string
          tournament_id: string
        }
        Insert: {
          player_id: string
          registered_at?: string
          tournament_id: string
        }
        Update: {
          player_id?: string
          registered_at?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          entry_mode: Database["public"]["Enums"]["tournament_entry_mode"]
          format: Database["public"]["Enums"]["tournament_format"]
          group_id: string
          id: string
          name: string
          organizer_id: string
          settings: Json
          status: Database["public"]["Enums"]["tournament_status"]
          team_size: number
        }
        Insert: {
          created_at?: string
          entry_mode?: Database["public"]["Enums"]["tournament_entry_mode"]
          format: Database["public"]["Enums"]["tournament_format"]
          group_id: string
          id?: string
          name: string
          organizer_id: string
          settings?: Json
          status?: Database["public"]["Enums"]["tournament_status"]
          team_size: number
        }
        Update: {
          created_at?: string
          entry_mode?: Database["public"]["Enums"]["tournament_entry_mode"]
          format?: Database["public"]["Enums"]["tournament_format"]
          group_id?: string
          id?: string
          name?: string
          organizer_id?: string
          settings?: Json
          status?: Database["public"]["Enums"]["tournament_status"]
          team_size?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
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
      amend_match_stats: {
        Args: { p_match_id: string; p_stats: Json }
        Returns: undefined
      }
      append_swiss_round: {
        Args: {
          p_matches: Json
          p_stage_engine_key: string
          p_tournament_id: string
        }
        Returns: undefined
      }
      assign_guest_player: {
        Args: { p_player_id: string; p_user_id: string }
        Returns: undefined
      }
      cancel_match: { Args: { p_match_id: string }; Returns: undefined }
      claim_guest_player: { Args: { p_player_id: string }; Returns: undefined }
      close_expired_windows: { Args: never; Returns: number }
      confirm_match_result: {
        Args: {
          p_decided_by?: Database["public"]["Enums"]["tournament_decided_by"]
          p_pens1?: number
          p_pens2?: number
          p_score1: number
          p_score2: number
          p_tournament_match_id: string
          p_winner_entry_id?: string
        }
        Returns: undefined
      }
      create_club: {
        Args: {
          p_group_id: string
          p_name: string
          p_primary_color?: string
          p_secondary_color?: string
          p_short_name: string
        }
        Returns: string
      }
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
      create_tournament: {
        Args: {
          p_entry_mode?: Database["public"]["Enums"]["tournament_entry_mode"]
          p_format: Database["public"]["Enums"]["tournament_format"]
          p_group_id: string
          p_name: string
          p_settings?: Json
          p_team_size: number
        }
        Returns: string
      }
      delete_club: { Args: { p_club_id: string }; Returns: undefined }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      delete_squad: { Args: { p_squad_id: string }; Returns: undefined }
      edit_match_result: {
        Args: {
          p_decided_by?: Database["public"]["Enums"]["tournament_decided_by"]
          p_pens1?: number
          p_pens2?: number
          p_score1: number
          p_score2: number
          p_tournament_match_id: string
          p_winner_entry_id?: string
        }
        Returns: undefined
      }
      get_featured_squad: {
        Args: { p_group_id: string; p_window_days?: number }
        Returns: {
          likes: number
          squad_id: string
        }[]
      }
      get_group_leaderboard: {
        Args: { p_group_id: string; p_limit?: number; p_metric: string }
        Returns: {
          avatar_url: string
          display_name: string
          matches_played: number
          player_id: string
          rank: number
          value: number
        }[]
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
      get_my_dashboard: { Args: { p_group_id: string }; Returns: Json }
      get_my_scouting_ballot: {
        Args: { p_target_player_id: string }
        Returns: {
          attribute: string
          created_at: string
          mode: Database["public"]["Enums"]["vote_mode"]
          value: number
        }[]
      }
      get_player_impacto: { Args: { p_player_id: string }; Returns: number }
      get_scouting_status: {
        Args: { p_target_player_id: string }
        Returns: {
          can_vote: boolean
          next_vote_at: string
          reason: string
        }[]
      }
      get_shared_appearances: {
        Args: { p_group_id: string }
        Returns: {
          matches: number
          player_a: string
          player_b: string
        }[]
      }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      like_squad: {
        Args: { p_like?: boolean; p_squad_id: string }
        Returns: undefined
      }
      link_tournament_match: {
        Args: {
          p_scheduled_at: string
          p_tournament_match_id: string
          p_venue?: string
        }
        Returns: string
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      persist_bracket: {
        Args: { p_payload: Json; p_tournament_id: string }
        Returns: undefined
      }
      register_for_tournament: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
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
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: string
      }
      save_squad: {
        Args: {
          p_club_id?: string
          p_formation: string
          p_group_id: string
          p_kind: string
          p_match_id?: string
          p_name: string
          p_side?: number
          p_slots: Json
          p_squad_id: string
          p_team_size: number
        }
        Returns: string
      }
      save_tournament_entries: {
        Args: { p_entries: Json; p_tournament_id: string }
        Returns: undefined
      }
      seed_knockout_from_groups: {
        Args: { p_qualifiers: Json; p_tournament_id: string }
        Returns: undefined
      }
      set_club_players: {
        Args: { p_club_id: string; p_players: Json }
        Returns: undefined
      }
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
      set_squad_published: {
        Args: { p_published: boolean; p_squad_id: string }
        Returns: undefined
      }
      set_tournament_status: {
        Args: {
          p_status: Database["public"]["Enums"]["tournament_status"]
          p_tournament_id: string
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
      unregister_from_tournament: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      update_club: {
        Args: {
          p_club_id: string
          p_crest_path?: string
          p_name: string
          p_primary_color: string
          p_secondary_color: string
          p_short_name: string
        }
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
      update_notification_prefs: { Args: { p_prefs: Json }; Returns: undefined }
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
      update_tournament: {
        Args: { p_name: string; p_settings: Json; p_tournament_id: string }
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
      squad_kind: "dream" | "lineup"
      stage_kind:
        | "league"
        | "single_elim"
        | "double_elim"
        | "group"
        | "knockout"
        | "swiss"
      star_kind: "weak_foot" | "skill_moves"
      tournament_bracket:
        | "winners"
        | "losers"
        | "final"
        | "third"
        | "group"
        | "swiss"
      tournament_decided_by: "regular" | "pens" | "walkover" | "bye" | "manual"
      tournament_entry_mode: "teams" | "individual"
      tournament_format:
        | "league"
        | "single_elim"
        | "double_elim"
        | "groups_ko"
        | "swiss"
      tournament_match_status:
        | "locked"
        | "waiting"
        | "ready"
        | "in_progress"
        | "completed"
        | "archived"
      tournament_status: "draft" | "registration" | "in_progress" | "finished"
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
      squad_kind: ["dream", "lineup"],
      stage_kind: [
        "league",
        "single_elim",
        "double_elim",
        "group",
        "knockout",
        "swiss",
      ],
      star_kind: ["weak_foot", "skill_moves"],
      tournament_bracket: [
        "winners",
        "losers",
        "final",
        "third",
        "group",
        "swiss",
      ],
      tournament_decided_by: ["regular", "pens", "walkover", "bye", "manual"],
      tournament_entry_mode: ["teams", "individual"],
      tournament_format: [
        "league",
        "single_elim",
        "double_elim",
        "groups_ko",
        "swiss",
      ],
      tournament_match_status: [
        "locked",
        "waiting",
        "ready",
        "in_progress",
        "completed",
        "archived",
      ],
      tournament_status: ["draft", "registration", "in_progress", "finished"],
      vote_mode: ["quick", "detailed"],
    },
  },
} as const

