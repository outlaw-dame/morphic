CREATE TABLE IF NOT EXISTS "subscribed_feeds" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "url" text NOT NULL,
  "canonical_url" text NOT NULL,
  "title" text,
  "description" text,
  "site_url" text,
  "favicon_url" text,
  "image_url" text,
  "format" varchar(256) DEFAULT 'unknown' NOT NULL,
  "is_podcast" boolean DEFAULT false NOT NULL,
  "status" varchar(256) DEFAULT 'active' NOT NULL,
  "refresh_interval_minutes" integer DEFAULT 60 NOT NULL,
  "last_fetched_at" timestamp,
  "next_fetch_at" timestamp,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "etag" text,
  "last_modified" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp,
  CONSTRAINT "subscribed_feeds_format_valid" CHECK (
    "format" IN ('rss2', 'rss1', 'atom', 'json', 'unknown')
  ),
  CONSTRAINT "subscribed_feeds_status_valid" CHECK (
    "status" IN ('active', 'paused', 'error', 'archived')
  ),
  CONSTRAINT "subscribed_feeds_refresh_interval_valid" CHECK (
    "refresh_interval_minutes" >= 5
    AND "refresh_interval_minutes" <= 10080
  ),
  CONSTRAINT "subscribed_feeds_failure_count_valid" CHECK ("failure_count" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscribed_feeds_user_canonical_url_idx" ON "subscribed_feeds" ("user_id", "canonical_url");

CREATE INDEX IF NOT EXISTS "subscribed_feeds_user_status_next_fetch_idx" ON "subscribed_feeds" ("user_id", "status", "next_fetch_at");

CREATE INDEX IF NOT EXISTS "subscribed_feeds_user_updated_at_idx" ON "subscribed_feeds" ("user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "subscribed_feeds_status_next_fetch_idx" ON "subscribed_feeds" ("status", "next_fetch_at");

ALTER TABLE "subscribed_feeds" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscribed_feeds'
      AND policyname = 'users_manage_own_subscribed_feeds'
  ) THEN
    CREATE POLICY "users_manage_own_subscribed_feeds"
      ON "subscribed_feeds"
      AS PERMISSIVE
      FOR ALL
      TO public
      USING (user_id = current_setting('app.current_user_id', true))
      WITH CHECK (user_id = current_setting('app.current_user_id', true));
  END IF;
END $$;
