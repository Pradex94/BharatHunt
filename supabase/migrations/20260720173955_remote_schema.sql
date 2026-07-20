


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_feedback_and_update_product"("p_product_id" "uuid", "p_rating" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  current_count integer;
  current_avg numeric;
  new_count integer;
  new_avg numeric;
BEGIN
  SELECT feedback_count, avg_rating INTO current_count, current_avg
  FROM products WHERE id = p_product_id FOR UPDATE;

  new_count := COALESCE(current_count, 0) + 1;
  new_avg := ROUND(((COALESCE(current_avg, 0) * COALESCE(current_count, 0) + p_rating) / new_count)::numeric, 1);

  UPDATE products SET feedback_count = new_count, avg_rating = new_avg WHERE id = p_product_id;
END;
$$;


ALTER FUNCTION "public"."add_feedback_and_update_product"("p_product_id" "uuid", "p_rating" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_product_scores"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE products p
  SET
    popularity_score = COALESCE((
      SELECT
        (COUNT(*) FILTER (WHERE pe.event_type = 'view')) * 1
        + (COUNT(*) FILTER (WHERE pe.event_type = 'upvote') - COUNT(*) FILTER (WHERE pe.event_type = 'unvote')) * 3
        + (COUNT(*) FILTER (WHERE pe.event_type = 'comment')) * 5
        + (COUNT(*) FILTER (WHERE pe.event_type = 'share')) * 6
        + (COUNT(*) FILTER (WHERE pe.event_type = 'bookmark') - COUNT(*) FILTER (WHERE pe.event_type = 'unbookmark')) * 4
        + (COUNT(*) FILTER (WHERE pe.event_type = 'feedback')) * 10
        - (COUNT(*) FILTER (WHERE pe.event_type = 'report')) * 15
      FROM product_events pe
      WHERE pe.product_id = p.id
    ), 0),
    trend_score = COALESCE((
      SELECT
        (COUNT(*) FILTER (WHERE pe.event_type = 'view')) * 1
        + (COUNT(*) FILTER (WHERE pe.event_type = 'upvote') - COUNT(*) FILTER (WHERE pe.event_type = 'unvote')) * 3
        + (COUNT(*) FILTER (WHERE pe.event_type = 'comment')) * 5
        + (COUNT(*) FILTER (WHERE pe.event_type = 'share')) * 6
        + (COUNT(*) FILTER (WHERE pe.event_type = 'bookmark') - COUNT(*) FILTER (WHERE pe.event_type = 'unbookmark')) * 4
        + (COUNT(*) FILTER (WHERE pe.event_type = 'feedback')) * 10
        - (COUNT(*) FILTER (WHERE pe.event_type = 'report')) * 15
      FROM product_events pe
      WHERE pe.product_id = p.id
        AND pe.created_at >= NOW() - INTERVAL '24 hours'
    ), 0)
  WHERE p.status = 'published';
END;
$$;


ALTER FUNCTION "public"."calculate_product_scores"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_product_counter"("target_product_id" "uuid", "counter_column" "text", "delta" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF counter_column = 'upvote_count' THEN
    UPDATE products SET upvote_count = GREATEST(0, upvote_count + delta) WHERE id = target_product_id;
  ELSIF counter_column = 'bookmark_count' THEN
    UPDATE products SET bookmark_count = GREATEST(0, bookmark_count + delta) WHERE id = target_product_id;
  ELSIF counter_column = 'comment_count' THEN
    UPDATE products SET comment_count = GREATEST(0, comment_count + delta) WHERE id = target_product_id;
  ELSIF counter_column = 'feedback_count' THEN
    UPDATE products SET feedback_count = GREATEST(0, feedback_count + delta) WHERE id = target_product_id;
  ELSIF counter_column = 'share_count' THEN
    UPDATE products SET share_count = GREATEST(0, share_count + delta) WHERE id = target_product_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."increment_product_counter"("target_product_id" "uuid", "counter_column" "text", "delta" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_view_count"("target_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE products
  SET view_count = view_count + 1
  WHERE id = target_product_id;
END;
$$;


ALTER FUNCTION "public"."increment_view_count"("target_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_old_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM product_events
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;


ALTER FUNCTION "public"."purge_old_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bookmarks" (
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "comments_body_check" CHECK (("char_length"("body") <= 500))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "loved" "text",
    "didnt_work" "text",
    "suggestion" "text",
    "rating" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "feedback_didnt_work_check" CHECK (("char_length"("didnt_work") <= 300)),
    CONSTRAINT "feedback_loved_check" CHECK (("char_length"("loved") <= 300)),
    CONSTRAINT "feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "feedback_suggestion_check" CHECK (("char_length"("suggestion") <= 300))
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "product_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "ip_address" "text",
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['view'::"text", 'upvote'::"text", 'unvote'::"text", 'bookmark'::"text", 'unbookmark'::"text", 'comment'::"text", 'feedback'::"text", 'share'::"text", 'report'::"text", 'product_create'::"text", 'image_upload'::"text"])))
);


ALTER TABLE "public"."product_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "tagline" "text" NOT NULL,
    "description" "text",
    "hero_image_url" "text",
    "screenshot_urls" "text"[] DEFAULT '{}'::"text"[],
    "video_url" "text",
    "website_url" "text",
    "github_url" "text",
    "pricing_type" "text" DEFAULT 'free'::"text" NOT NULL,
    "pricing_amount" numeric,
    "category" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "popularity_score" numeric DEFAULT 0,
    "trend_score" numeric DEFAULT 0,
    "view_count" integer DEFAULT 0,
    "upvote_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    "feedback_count" integer DEFAULT 0,
    "share_count" integer DEFAULT 0,
    "bookmark_count" integer DEFAULT 0,
    "report_count" integer DEFAULT 0,
    "avg_rating" numeric,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "products_name_check" CHECK (("char_length"("name") <= 60)),
    CONSTRAINT "products_pricing_type_check" CHECK (("pricing_type" = ANY (ARRAY['free'::"text", 'freemium'::"text", 'paid'::"text"]))),
    CONSTRAINT "products_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"]))),
    CONSTRAINT "products_tagline_check" CHECK (("char_length"("tagline") <= 120))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "bio" "text",
    "avatar_url" "text",
    "website_url" "text",
    "twitter_handle" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."upvotes" (
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."upvotes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("product_id", "user_id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_product_id_user_id_key" UNIQUE ("product_id", "user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_events"
    ADD CONSTRAINT "product_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."upvotes"
    ADD CONSTRAINT "upvotes_pkey" PRIMARY KEY ("product_id", "user_id");



CREATE INDEX "idx_bookmarks_user" ON "public"."bookmarks" USING "btree" ("user_id");



CREATE INDEX "idx_comments_product" ON "public"."comments" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "idx_events_product_time" ON "public"."product_events" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "idx_events_time" ON "public"."product_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_events_type_ip" ON "public"."product_events" USING "btree" ("event_type", "ip_address", "created_at" DESC);



CREATE INDEX "idx_events_type_user" ON "public"."product_events" USING "btree" ("event_type", "user_id", "created_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_feedback_product" ON "public"."feedback" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "idx_notifs_user_unread" ON "public"."notifications" USING "btree" ("user_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category") WHERE ("status" = 'published'::"text");



CREATE INDEX "idx_products_creator" ON "public"."products" USING "btree" ("creator_id");



CREATE INDEX "idx_products_status_score" ON "public"."products" USING "btree" ("status", "popularity_score" DESC);



CREATE INDEX "idx_products_status_trend" ON "public"."products" USING "btree" ("status", "trend_score" DESC);



CREATE OR REPLACE TRIGGER "feedback_updated_at" BEFORE UPDATE ON "public"."feedback" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_events"
    ADD CONSTRAINT "product_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_events"
    ADD CONSTRAINT "product_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."upvotes"
    ADD CONSTRAINT "upvotes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."upvotes"
    ADD CONSTRAINT "upvotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Comments are viewable by everyone" ON "public"."comments" FOR SELECT USING (true);



CREATE POLICY "Creators can delete their own products" ON "public"."products" FOR DELETE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Creators can update their own products" ON "public"."products" FOR UPDATE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Feedback is viewable by everyone" ON "public"."feedback" FOR SELECT USING (true);



CREATE POLICY "Product events are insertable by anyone" ON "public"."product_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "Product events are readable by everyone" ON "public"."product_events" FOR SELECT USING (true);



CREATE POLICY "Public profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Published products are viewable by everyone" ON "public"."products" FOR SELECT USING ((("status" = 'published'::"text") OR ("auth"."uid"() = "creator_id")));



CREATE POLICY "Upvotes are viewable by everyone" ON "public"."upvotes" FOR SELECT USING (true);



CREATE POLICY "Users can bookmark" ON "public"."bookmarks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create comments" ON "public"."comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create feedback" ON "public"."feedback" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create products" ON "public"."products" FOR INSERT WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Users can delete their own comments" ON "public"."comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own feedback" ON "public"."feedback" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can remove their own bookmark" ON "public"."bookmarks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can remove their own upvote" ON "public"."upvotes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own feedback" ON "public"."feedback" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can upvote" ON "public"."upvotes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own bookmarks" ON "public"."bookmarks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."bookmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."upvotes" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."add_feedback_and_update_product"("p_product_id" "uuid", "p_rating" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."add_feedback_and_update_product"("p_product_id" "uuid", "p_rating" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_feedback_and_update_product"("p_product_id" "uuid", "p_rating" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_product_scores"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_product_scores"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_product_scores"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_product_counter"("target_product_id" "uuid", "counter_column" "text", "delta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_product_counter"("target_product_id" "uuid", "counter_column" "text", "delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_product_counter"("target_product_id" "uuid", "counter_column" "text", "delta" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_view_count"("target_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_view_count"("target_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_view_count"("target_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."purge_old_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_old_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_old_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";
























GRANT ALL ON TABLE "public"."bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."product_events" TO "anon";
GRANT ALL ON TABLE "public"."product_events" TO "authenticated";
GRANT ALL ON TABLE "public"."product_events" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."upvotes" TO "anon";
GRANT ALL ON TABLE "public"."upvotes" TO "authenticated";
GRANT ALL ON TABLE "public"."upvotes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































