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
      ad_inquiries: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          package: string | null
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          package?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          package?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_inquiries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_packages: {
        Row: {
          amount_paise: number
          created_at: string
          currency: string
          description: string | null
          dodo_product_id: string | null
          duration_days: number
          id: string
          is_active: boolean
          name: string
          placement: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          currency?: string
          description?: string | null
          dodo_product_id?: string | null
          duration_days: number
          id: string
          is_active?: boolean
          name: string
          placement: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          currency?: string
          description?: string | null
          dodo_product_id?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          placement?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          activated_at: string | null
          amount_paise: number
          created_at: string
          currency: string
          duration_days: number
          ends_at: string | null
          id: string
          package_id: string
          placement: string
          product_id: string
          starts_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          amount_paise: number
          created_at?: string
          currency?: string
          duration_days: number
          ends_at?: string | null
          id?: string
          package_id: string
          placement: string
          product_id: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          amount_paise?: number
          created_at?: string
          currency?: string
          duration_days?: number
          ends_at?: string | null
          id?: string
          package_id?: string
          placement?: string
          product_id?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "promotion_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          charged_amount: number | null
          charged_currency: string | null
          charged_tax: number | null
          checkout_url: string | null
          created_at: string
          currency: string
          dodo_payment_id: string | null
          dodo_session_id: string
          error_code: string | null
          error_description: string | null
          id: string
          promotion_id: string
          provider: string
          receipt: string
          refunded_amount: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          charged_amount?: number | null
          charged_currency?: string | null
          charged_tax?: number | null
          checkout_url?: string | null
          created_at?: string
          currency?: string
          dodo_payment_id?: string | null
          dodo_session_id: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          promotion_id: string
          provider?: string
          receipt: string
          refunded_amount?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          charged_amount?: number | null
          charged_currency?: string | null
          charged_tax?: number | null
          checkout_url?: string | null
          created_at?: string
          currency?: string
          dodo_payment_id?: string | null
          dodo_session_id?: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          promotion_id?: string
          provider?: string
          receipt?: string
          refunded_amount?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_directory_plans: {
        Row: {
          amount_paise: number
          created_at: string
          currency: string
          description: string | null
          dodo_product_id: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          currency?: string
          description?: string | null
          dodo_product_id?: string | null
          id: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          currency?: string
          description?: string | null
          dodo_product_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      investors: {
        Row: {
          check_size_max_inr: number | null
          check_size_min_inr: number | null
          contact_details: string | null
          country: string | null
          created_at: string
          email: string | null
          firm_name: string | null
          id: string
          investment_stages: string[]
          investor_type: string | null
          is_free_preview: boolean
          is_published: boolean
          is_sample: boolean
          linkedin: string | null
          location: string | null
          logo_url: string | null
          name: string
          phone: string | null
          portfolio: string[]
          sectors: string[]
          source_key: string | null
          sort_order: number
          thesis: string | null
          title: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          check_size_max_inr?: number | null
          check_size_min_inr?: number | null
          contact_details?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          firm_name?: string | null
          id?: string
          investment_stages?: string[]
          investor_type?: string | null
          is_free_preview?: boolean
          is_published?: boolean
          is_sample?: boolean
          linkedin?: string | null
          location?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          portfolio?: string[]
          sectors?: string[]
          source_key?: string | null
          sort_order?: number
          thesis?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          check_size_max_inr?: number | null
          check_size_min_inr?: number | null
          contact_details?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          firm_name?: string | null
          id?: string
          investment_stages?: string[]
          investor_type?: string | null
          is_free_preview?: boolean
          is_published?: boolean
          is_sample?: boolean
          linkedin?: string | null
          location?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          portfolio?: string[]
          sectors?: string[]
          source_key?: string | null
          sort_order?: number
          thesis?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      investor_directory_purchases: {
        Row: {
          amount: number
          charged_amount: number | null
          charged_currency: string | null
          charged_tax: number | null
          checkout_url: string | null
          created_at: string
          currency: string
          dodo_payment_id: string | null
          dodo_session_id: string
          error_code: string | null
          error_description: string | null
          id: string
          paid_at: string | null
          plan_id: string
          receipt: string
          refunded_amount: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          charged_amount?: number | null
          charged_currency?: string | null
          charged_tax?: number | null
          checkout_url?: string | null
          created_at?: string
          currency?: string
          dodo_payment_id?: string | null
          dodo_session_id: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          paid_at?: string | null
          plan_id: string
          receipt: string
          refunded_amount?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          charged_amount?: number | null
          charged_currency?: string | null
          charged_tax?: number | null
          checkout_url?: string | null
          created_at?: string
          currency?: string
          dodo_payment_id?: string | null
          dodo_session_id?: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          paid_at?: string | null
          plan_id?: string
          receipt?: string
          refunded_amount?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_directory_purchases_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_directory_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dodo_webhook_events: {
        Row: {
          event: string
          id: string
          session_id: string | null
          payment_id: string | null
          received_at: string
        }
        Insert: {
          event: string
          id: string
          session_id?: string | null
          payment_id?: string | null
          received_at?: string
        }
        Update: {
          event?: string
          id?: string
          session_id?: string | null
          payment_id?: string | null
          received_at?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string
          unsubscribed_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string
          unsubscribed_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string | null
          id: string
          parent_id: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string | null
          didnt_work: string | null
          id: string
          loved: string | null
          product_id: string
          rating: number
          suggestion: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          didnt_work?: string | null
          id?: string
          loved?: string | null
          product_id: string
          rating: number
          suggestion?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          didnt_work?: string | null
          id?: string
          loved?: string | null
          product_id?: string
          rating?: number
          suggestion?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          product_id: string | null
          read: boolean | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          product_id?: string | null
          read?: boolean | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          product_id?: string | null
          read?: boolean | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          ip_address: string | null
          product_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          product_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          product_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          id: string
          query: string
          query_normalized: string
          result_count: number
          created_at: string
        }
        Insert: {
          id?: string
          query: string
          query_normalized: string
          result_count: number
          created_at?: string
        }
        Update: {
          id?: string
          query?: string
          query_normalized?: string
          result_count?: number
          created_at?: string
        }
        Relationships: []
      }
      product_ratings: {
        Row: {
          created_at: string
          id: string
          product_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_ratings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          avg_rating: number | null
          rating_count: number
          bookmark_count: number | null
          category: string
          comment_count: number | null
          created_at: string | null
          creator_id: string
          description: string | null
          feedback_count: number | null
          github_url: string | null
          hero_image_url: string | null
          id: string
          name: string
          popularity_score: number | null
          pricing_amount: number | null
          pricing_type: string
          published_at: string | null
          report_count: number | null
          screenshot_urls: string[] | null
          share_count: number | null
          slug: string
          status: string
          tagline: string
          tags: string[] | null
          trend_score: number | null
          updated_at: string | null
          upvote_count: number | null
          video_url: string | null
          view_count: number | null
          website_url: string | null
          cta_text: string | null
          cta_url: string | null
          platform_links: Json
          tech_stack: string[]
          coupon_code: string | null
          offer_description: string | null
          offer_expires_at: string | null
          roadmap_url: string | null
          changelog_url: string | null
          available_for_hire: boolean
          hire_pitch: string | null
          launch_state: string | null
          launch_state_source: string | null
          search_name: string | null
          search_text: string | null
        }
        Insert: {
          avg_rating?: number | null
          rating_count?: number
          bookmark_count?: number | null
          category: string
          comment_count?: number | null
          created_at?: string | null
          creator_id: string
          description?: string | null
          feedback_count?: number | null
          github_url?: string | null
          hero_image_url?: string | null
          id?: string
          name: string
          popularity_score?: number | null
          pricing_amount?: number | null
          pricing_type?: string
          published_at?: string | null
          report_count?: number | null
          screenshot_urls?: string[] | null
          share_count?: number | null
          slug: string
          status?: string
          tagline: string
          tags?: string[] | null
          trend_score?: number | null
          updated_at?: string | null
          upvote_count?: number | null
          video_url?: string | null
          view_count?: number | null
          website_url?: string | null
          cta_text?: string | null
          cta_url?: string | null
          platform_links?: Json
          tech_stack?: string[]
          coupon_code?: string | null
          offer_description?: string | null
          offer_expires_at?: string | null
          roadmap_url?: string | null
          changelog_url?: string | null
          available_for_hire?: boolean
          hire_pitch?: string | null
          launch_state?: string | null
          launch_state_source?: string | null
        }
        Update: {
          avg_rating?: number | null
          rating_count?: number
          bookmark_count?: number | null
          category?: string
          comment_count?: number | null
          created_at?: string | null
          creator_id?: string
          description?: string | null
          feedback_count?: number | null
          github_url?: string | null
          hero_image_url?: string | null
          id?: string
          name?: string
          popularity_score?: number | null
          pricing_amount?: number | null
          pricing_type?: string
          published_at?: string | null
          report_count?: number | null
          screenshot_urls?: string[] | null
          share_count?: number | null
          slug?: string
          status?: string
          tagline?: string
          tags?: string[] | null
          trend_score?: number | null
          updated_at?: string | null
          upvote_count?: number | null
          video_url?: string | null
          view_count?: number | null
          website_url?: string | null
          cta_text?: string | null
          cta_url?: string | null
          platform_links?: Json
          tech_stack?: string[]
          coupon_code?: string | null
          offer_description?: string | null
          offer_expires_at?: string | null
          roadmap_url?: string | null
          changelog_url?: string | null
          available_for_hire?: boolean
          hire_pitch?: string | null
          launch_state?: string | null
          launch_state_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string
          id: string
          search_name: string | null
          twitter_handle: string | null
          username: string
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name: string
          id: string
          twitter_handle?: string | null
          username: string
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          twitter_handle?: string | null
          username?: string
          website_url?: string | null
        }
        Relationships: []
      }
      upvotes: {
        Row: {
          created_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upvotes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upvotes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_sources: {
        Row: {
          api_endpoint: string | null
          consecutive_failures: number
          created_at: string
          enabled: boolean
          feed_url: string | null
          homepage_url: string | null
          id: string
          is_healthy: boolean
          last_attempt_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          name: string
          poll_interval_minutes: number
          priority: number
          publisher: string | null
          source_type: string
          updated_at: string
        }
        Insert: {
          api_endpoint?: string | null
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          feed_url?: string | null
          homepage_url?: string | null
          id?: string
          is_healthy?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          name: string
          poll_interval_minutes?: number
          priority?: number
          publisher?: string | null
          source_type: string
          updated_at?: string
        }
        Update: {
          api_endpoint?: string | null
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          feed_url?: string | null
          homepage_url?: string | null
          id?: string
          is_healthy?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          name?: string
          poll_interval_minutes?: number
          priority?: number
          publisher?: string | null
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      funding_startups: {
        Row: {
          city: string | null
          created_at: string
          description: string | null
          first_round_at: string | null
          id: string
          industry: string | null
          last_round_at: string | null
          location: string | null
          logo_url: string | null
          name: string
          normalized_name: string
          published_round_count: number
          slug: string
          sub_industry: string | null
          total_disclosed_inr: number
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          description?: string | null
          first_round_at?: string | null
          id?: string
          industry?: string | null
          last_round_at?: string | null
          location?: string | null
          logo_url?: string | null
          name: string
          normalized_name: string
          published_round_count?: number
          slug: string
          sub_industry?: string | null
          total_disclosed_inr?: number
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          description?: string | null
          first_round_at?: string | null
          id?: string
          industry?: string | null
          last_round_at?: string | null
          location?: string | null
          logo_url?: string | null
          name?: string
          normalized_name?: string
          published_round_count?: number
          slug?: string
          sub_industry?: string | null
          total_disclosed_inr?: number
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      funding_investors: {
        Row: {
          created_at: string
          id: string
          investor_type: string | null
          last_deal_at: string | null
          logo_url: string | null
          name: string
          normalized_name: string
          published_deal_count: number
          published_lead_count: number
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          investor_type?: string | null
          last_deal_at?: string | null
          logo_url?: string | null
          name: string
          normalized_name: string
          published_deal_count?: number
          published_lead_count?: number
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          investor_type?: string | null
          last_deal_at?: string | null
          logo_url?: string | null
          name?: string
          normalized_name?: string
          published_deal_count?: number
          published_lead_count?: number
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      funding_news: {
        Row: {
          author: string | null
          content_hash: string
          created_at: string
          error: string | null
          excerpt: string | null
          fetched_at: string
          id: string
          image_url: string | null
          is_funding_candidate: boolean
          normalized_title: string
          normalized_url: string
          published_at: string | null
          rejected_reason: string | null
          source_id: string | null
          source_name: string
          status: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          author?: string | null
          content_hash: string
          created_at?: string
          error?: string | null
          excerpt?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          is_funding_candidate?: boolean
          normalized_title: string
          normalized_url: string
          published_at?: string | null
          rejected_reason?: string | null
          source_id?: string | null
          source_name: string
          status?: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          author?: string | null
          content_hash?: string
          created_at?: string
          error?: string | null
          excerpt?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          is_funding_candidate?: boolean
          normalized_title?: string
          normalized_url?: string
          published_at?: string | null
          rejected_reason?: string | null
          source_id?: string | null
          source_name?: string
          status?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_news_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_rounds: {
        Row: {
          amount: string | null
          amount_inr: number | null
          amount_numeric: number | null
          announcement_date: string
          city: string | null
          confidence_score: number | null
          created_at: string
          currency: string | null
          event_key: string
          extraction_method: string | null
          funding_stage: string
          fx_rate_to_inr: number | null
          headline: string
          id: string
          industry: string | null
          investors: string[]
          is_featured: boolean
          is_hidden: boolean
          lead_investor: string | null
          location: string | null
          logo_url: string | null
          news_id: string | null
          published_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_text: string | null
          source_name: string
          source_published_at: string | null
          source_url: string
          startup_id: string | null
          startup_name: string
          startup_slug: string
          status: string
          sub_industry: string | null
          summary: string | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          amount?: string | null
          amount_inr?: number | null
          amount_numeric?: number | null
          announcement_date: string
          city?: string | null
          confidence_score?: number | null
          created_at?: string
          currency?: string | null
          event_key: string
          extraction_method?: string | null
          funding_stage?: string
          fx_rate_to_inr?: number | null
          headline: string
          id?: string
          industry?: string | null
          investors?: string[]
          is_featured?: boolean
          is_hidden?: boolean
          lead_investor?: string | null
          location?: string | null
          logo_url?: string | null
          news_id?: string | null
          published_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_name: string
          source_published_at?: string | null
          source_url: string
          startup_id?: string | null
          startup_name: string
          startup_slug: string
          status?: string
          sub_industry?: string | null
          summary?: string | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          amount?: string | null
          amount_inr?: number | null
          amount_numeric?: number | null
          announcement_date?: string
          city?: string | null
          confidence_score?: number | null
          created_at?: string
          currency?: string | null
          event_key?: string
          extraction_method?: string | null
          funding_stage?: string
          fx_rate_to_inr?: number | null
          headline?: string
          id?: string
          industry?: string | null
          investors?: string[]
          is_featured?: boolean
          is_hidden?: boolean
          lead_investor?: string | null
          location?: string | null
          logo_url?: string | null
          news_id?: string | null
          published_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_name?: string
          source_published_at?: string | null
          source_url?: string
          startup_id?: string | null
          startup_name?: string
          startup_slug?: string
          status?: string
          sub_industry?: string | null
          summary?: string | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "funding_rounds_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "funding_news"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_rounds_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "funding_startups"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_round_investors: {
        Row: {
          created_at: string
          investor_id: string
          is_lead: boolean
          round_id: string
        }
        Insert: {
          created_at?: string
          investor_id: string
          is_lead?: boolean
          round_id: string
        }
        Update: {
          created_at?: string
          investor_id?: string
          is_lead?: boolean
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_round_investors_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "funding_investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_round_investors_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "funding_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_round_articles: {
        Row: {
          created_at: string
          news_id: string
          round_id: string
        }
        Insert: {
          created_at?: string
          news_id: string
          round_id: string
        }
        Update: {
          created_at?: string
          news_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_round_articles_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "funding_news"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_round_articles_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "funding_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_ingestion_logs: {
        Row: {
          articles_created: number
          articles_fetched: number
          completed_at: string | null
          created_at: string
          duplicates: number
          duration_ms: number | null
          error_detail: string | null
          errors: number
          id: string
          ok: boolean
          rejected: number
          rounds_created: number
          run_id: string
          source_id: string | null
          source_name: string
          started_at: string
          trigger_source: string
        }
        Insert: {
          articles_created?: number
          articles_fetched?: number
          completed_at?: string | null
          created_at?: string
          duplicates?: number
          duration_ms?: number | null
          error_detail?: string | null
          errors?: number
          id?: string
          ok?: boolean
          rejected?: number
          rounds_created?: number
          run_id: string
          source_id?: string | null
          source_name: string
          started_at?: string
          trigger_source?: string
        }
        Update: {
          articles_created?: number
          articles_fetched?: number
          completed_at?: string | null
          created_at?: string
          duplicates?: number
          duration_ms?: number | null
          error_detail?: string | null
          errors?: number
          id?: string
          ok?: boolean
          rejected?: number
          rounds_created?: number
          run_id?: string
          source_id?: string | null
          source_name?: string
          started_at?: string
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_ingestion_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_alert_subscriptions: {
        Row: {
          channel: string
          city: string | null
          created_at: string
          funding_stage: string | null
          id: string
          industry: string | null
          investor: string | null
          is_active: boolean
          label: string | null
          last_notified_at: string | null
          min_amount_inr: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          city?: string | null
          created_at?: string
          funding_stage?: string | null
          id?: string
          industry?: string | null
          investor?: string | null
          is_active?: boolean
          label?: string | null
          last_notified_at?: string | null
          min_amount_inr?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          city?: string | null
          created_at?: string
          funding_stage?: string | null
          id?: string
          industry?: string | null
          investor?: string | null
          is_active?: boolean
          label?: string | null
          last_notified_at?: string | null
          min_amount_inr?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_alert_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_entities: {
        Row: {
          created_at: string
          entity_type: string
          first_seen_at: string
          id: string
          is_curated: boolean
          last_seen_at: string
          logo_url: string | null
          name: string
          normalized_name: string
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          entity_type: string
          first_seen_at?: string
          id?: string
          is_curated?: boolean
          last_seen_at?: string
          logo_url?: string | null
          name: string
          normalized_name: string
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          entity_type?: string
          first_seen_at?: string
          id?: string
          is_curated?: boolean
          last_seen_at?: string
          logo_url?: string | null
          name?: string
          normalized_name?: string
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      ai_ingestion_runs: {
        Row: {
          articles_duplicate: number
          articles_fetched: number
          articles_rejected: number
          articles_relevant: number
          created_at: string
          duration_ms: number | null
          errors: Json
          finished_at: string | null
          id: string
          scores_recomputed: number
          sources_attempted: number
          sources_failed: number
          sources_succeeded: number
          started_at: string
          status: string
          stories_created: number
          stories_updated: number
          trigger_source: string
        }
        Insert: {
          articles_duplicate?: number
          articles_fetched?: number
          articles_rejected?: number
          articles_relevant?: number
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          finished_at?: string | null
          id?: string
          scores_recomputed?: number
          sources_attempted?: number
          sources_failed?: number
          sources_succeeded?: number
          started_at?: string
          status?: string
          stories_created?: number
          stories_updated?: number
          trigger_source?: string
        }
        Update: {
          articles_duplicate?: number
          articles_fetched?: number
          articles_rejected?: number
          articles_relevant?: number
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          finished_at?: string | null
          id?: string
          scores_recomputed?: number
          sources_attempted?: number
          sources_failed?: number
          sources_succeeded?: number
          started_at?: string
          status?: string
          stories_created?: number
          stories_updated?: number
          trigger_source?: string
        }
        Relationships: []
      }
      ai_news_articles: {
        Row: {
          author: string | null
          category: string | null
          company: string | null
          content_hash: string
          created_at: string
          entities: string[]
          error: string | null
          excerpt: string | null
          external_engagement: number | null
          external_engagement_source: string | null
          fetched_at: string
          id: string
          image_url: string | null
          is_ai_related: boolean
          keywords: string[]
          models: string[]
          normalized_title: string
          normalized_url: string
          people: string[]
          products: string[]
          published_at: string | null
          region: string | null
          rejected_reason: string | null
          relevance_score: number | null
          source_id: string | null
          source_name: string
          source_url: string
          status: string
          story_id: string | null
          sub_category: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          category?: string | null
          company?: string | null
          content_hash: string
          created_at?: string
          entities?: string[]
          error?: string | null
          excerpt?: string | null
          external_engagement?: number | null
          external_engagement_source?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          is_ai_related?: boolean
          keywords?: string[]
          models?: string[]
          normalized_title: string
          normalized_url: string
          people?: string[]
          products?: string[]
          published_at?: string | null
          region?: string | null
          rejected_reason?: string | null
          relevance_score?: number | null
          source_id?: string | null
          source_name: string
          source_url: string
          status?: string
          story_id?: string | null
          sub_category?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          category?: string | null
          company?: string | null
          content_hash?: string
          created_at?: string
          entities?: string[]
          error?: string | null
          excerpt?: string | null
          external_engagement?: number | null
          external_engagement_source?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          is_ai_related?: boolean
          keywords?: string[]
          models?: string[]
          normalized_title?: string
          normalized_url?: string
          people?: string[]
          products?: string[]
          published_at?: string | null
          region?: string | null
          rejected_reason?: string | null
          relevance_score?: number | null
          source_id?: string | null
          source_name?: string
          source_url?: string
          status?: string
          story_id?: string | null
          sub_category?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_news_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ai_news_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_news_articles_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "ai_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_news_sources: {
        Row: {
          api_endpoint: string | null
          auto_publish: boolean
          consecutive_failures: number
          created_at: string
          enabled: boolean
          feed_url: string | null
          homepage_url: string | null
          id: string
          is_healthy: boolean
          last_attempt_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          name: string
          poll_interval_minutes: number
          priority: number
          publisher: string | null
          region: string
          reliability_score: number
          source_category: string
          source_type: string
          total_articles_seen: number
          updated_at: string
        }
        Insert: {
          api_endpoint?: string | null
          auto_publish?: boolean
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          feed_url?: string | null
          homepage_url?: string | null
          id?: string
          is_healthy?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          name: string
          poll_interval_minutes?: number
          priority?: number
          publisher?: string | null
          region?: string
          reliability_score?: number
          source_category?: string
          source_type: string
          total_articles_seen?: number
          updated_at?: string
        }
        Update: {
          api_endpoint?: string | null
          auto_publish?: boolean
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          feed_url?: string | null
          homepage_url?: string | null
          id?: string
          is_healthy?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          name?: string
          poll_interval_minutes?: number
          priority?: number
          publisher?: string | null
          region?: string
          reliability_score?: number
          source_category?: string
          source_type?: string
          total_articles_seen?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_stories: {
        Row: {
          article_count: number
          authority_score: number | null
          category: string
          created_at: string
          engagement_score: number | null
          entity_text: string
          featured: boolean
          first_seen_at: string | null
          id: string
          image_url: string | null
          is_hidden: boolean
          keywords: string[]
          last_seen_at: string | null
          primary_entity: string | null
          published_at: string | null
          recency_score: number | null
          region: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_text: string | null
          slug: string
          source_count: number
          status: string
          story_key: string
          sub_category: string | null
          summary: string | null
          title: string
          top_source_name: string | null
          top_source_url: string | null
          trend_score: number | null
          updated_at: string
          velocity_score: number | null
          view_count: number
        }
        Insert: {
          article_count?: number
          authority_score?: number | null
          category: string
          created_at?: string
          engagement_score?: number | null
          entity_text?: string
          featured?: boolean
          first_seen_at?: string | null
          id?: string
          image_url?: string | null
          is_hidden?: boolean
          keywords?: string[]
          last_seen_at?: string | null
          primary_entity?: string | null
          published_at?: string | null
          recency_score?: number | null
          region?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          source_count?: number
          status?: string
          story_key: string
          sub_category?: string | null
          summary?: string | null
          title: string
          top_source_name?: string | null
          top_source_url?: string | null
          trend_score?: number | null
          updated_at?: string
          velocity_score?: number | null
          view_count?: number
        }
        Update: {
          article_count?: number
          authority_score?: number | null
          category?: string
          created_at?: string
          engagement_score?: number | null
          entity_text?: string
          featured?: boolean
          first_seen_at?: string | null
          id?: string
          image_url?: string | null
          is_hidden?: boolean
          keywords?: string[]
          last_seen_at?: string | null
          primary_entity?: string | null
          published_at?: string | null
          recency_score?: number | null
          region?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          source_count?: number
          status?: string
          story_key?: string
          sub_category?: string | null
          summary?: string | null
          title?: string
          top_source_name?: string | null
          top_source_url?: string | null
          trend_score?: number | null
          updated_at?: string
          velocity_score?: number | null
          view_count?: number
        }
        Relationships: []
      }
      ai_story_entities: {
        Row: {
          created_at: string
          entity_id: string
          is_primary: boolean
          mentions: number
          story_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          is_primary?: boolean
          mentions?: number
          story_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          is_primary?: boolean
          mentions?: number
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_story_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "ai_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_story_entities_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "ai_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_trend_snapshots: {
        Row: {
          authority_score: number | null
          bucket_hour: string
          calculated_at: string
          engagement_score: number | null
          id: string
          recency_score: number | null
          source_count: number
          story_id: string
          trend_score: number | null
          velocity_score: number | null
        }
        Insert: {
          authority_score?: number | null
          bucket_hour: string
          calculated_at?: string
          engagement_score?: number | null
          id?: string
          recency_score?: number | null
          source_count?: number
          story_id: string
          trend_score?: number | null
          velocity_score?: number | null
        }
        Update: {
          authority_score?: number | null
          bucket_hour?: string
          calculated_at?: string
          engagement_score?: number | null
          id?: string
          recency_score?: number | null
          source_count?: number
          story_id?: string
          trend_score?: number | null
          velocity_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_trend_snapshots_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "ai_stories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_feedback_and_update_product: {
        Args: { p_product_id: string; p_rating: number }
        Returns: undefined
      }
      calculate_product_scores: { Args: never; Returns: undefined }
      search_products: {
        Args: {
          search_query: string
          category_filter?: string | null
          pricing_filter?: string[] | null
          sort_mode?: string
          page_limit?: number
          page_offset?: number
        }
        Returns: {
          id: string
          slug: string
          name: string
          tagline: string
          category: string
          pricing_type: string
          avg_rating: number | null
          rating_count: number
          upvote_count: number | null
          comment_count: number | null
          hero_image_url: string | null
          tags: string[] | null
          website_url: string | null
          github_url: string | null
          creator_display_name: string | null
          creator_username: string | null
          relevance: number
          total_count: number
        }[]
      }
      suggest_product_name: {
        Args: { search_query: string }
        Returns: string | null
      }
      search_normalize: {
        Args: { value: string }
        Returns: string
      }
      increment_product_counter: {
        Args: {
          counter_column: string
          delta: number
          target_product_id: string
        }
        Returns: undefined
      }
      increment_view_count: {
        Args: { target_product_id: string }
        Returns: undefined
      }
      purge_old_events: { Args: never; Returns: undefined }
      requesting_user_id: { Args: never; Returns: string }
      funding_search: {
        Args: {
          search_query?: string | null
          stage_filter?: string[] | null
          industry_filter?: string[] | null
          city_filter?: string[] | null
          investor_filter?: string | null
          min_amount?: number | null
          since_date?: string | null
          sort_mode?: string | null
          page_limit?: number | null
          page_offset?: number | null
        }
        Returns: {
          id: string
          startup_name: string
          startup_slug: string
          headline: string
          summary: string | null
          amount: string | null
          amount_numeric: number | null
          currency: string | null
          amount_inr: number | null
          funding_stage: string
          industry: string | null
          sub_industry: string | null
          location: string | null
          city: string | null
          investors: string[]
          lead_investor: string | null
          announcement_date: string
          source_name: string
          source_url: string
          source_published_at: string | null
          logo_url: string | null
          verified: boolean
          extraction_method: string | null
          is_featured: boolean
          total_count: number
        }[]
      }
      funding_snapshot: {
        Args: never
        Returns: {
          announced_today: number
          rounds_this_week: number
          rounds_this_month: number
          total_this_month_inr: number
          disclosed_this_month: number
          top_industry: string | null
          top_industry_count: number | null
          top_stage: string | null
          top_stage_count: number | null
          total_rounds: number
          last_published_at: string | null
        }[]
      }
      funding_trends: {
        Args: { months?: number | null; top_n?: number | null }
        Returns: Json
      }
      funding_investor_directory: {
        Args: {
          search_query?: string | null
          page_limit?: number | null
          page_offset?: number | null
        }
        Returns: {
          id: string
          name: string
          slug: string
          investor_type: string | null
          deal_count: number
          lead_count: number
          last_deal_at: string | null
          stages: string[]
          industries: string[]
          recent_investments: Json
          total_count: number
        }[]
      }
      ai_story_search: {
        Args: {
          search_query?: string | null
          category_filter?: string[] | null
          region_filter?: string | null
          sort_mode?: string | null
          page_limit?: number | null
          page_offset?: number | null
        }
        Returns: {
          id: string
          slug: string
          title: string
          summary: string | null
          category: string
          sub_category: string | null
          region: string
          trend_score: number | null
          source_count: number
          article_count: number
          view_count: number
          first_seen_at: string | null
          last_seen_at: string | null
          top_source_name: string | null
          top_source_url: string | null
          image_url: string | null
          featured: boolean
          total_count: number
        }[]
      }
      ai_trending_topics: {
        Args: {
          window_hours?: number | null
          min_prior?: number | null
          row_limit?: number | null
        }
        Returns: {
          category: string
          current_count: number
          prior_count: number
          change_pct: number | null
        }[]
      }
      ai_trending_entities: {
        Args: {
          type_filter?: string | null
          window_hours?: number | null
          min_prior?: number | null
          row_limit?: number | null
        }
        Returns: {
          id: string
          name: string
          slug: string
          entity_type: string
          website: string | null
          current_count: number
          prior_count: number
          change_pct: number | null
          mentions: number
          latest_story_title: string | null
          latest_story_slug: string | null
          latest_seen_at: string | null
        }[]
      }
      ai_news_freshness: {
        Args: never
        Returns: {
          last_attempt_at: string | null
          last_success_at: string | null
          last_story_at: string | null
          stories_24h: number
          published_total: number
        }[]
      }
      ai_apply_trend_scores: {
        Args: { payload: Json }
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
    Enums: {},
  },
} as const
