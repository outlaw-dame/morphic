CREATE TABLE IF NOT EXISTS "coordinator_repair_states" (
  "owner_scope_id" varchar(256) NOT NULL,
  "execution_scope_id" varchar(256) NOT NULL,
  "revision" bigint NOT NULL,
  "envelope" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "coordinator_repair_states_pk" PRIMARY KEY ("owner_scope_id", "execution_scope_id"),
  CONSTRAINT "coordinator_repair_states_owner_scope_length" CHECK (char_length("owner_scope_id") BETWEEN 16 AND 256),
  CONSTRAINT "coordinator_repair_states_execution_scope_length" CHECK (
    char_length("execution_scope_id") BETWEEN 16 AND 256
  ),
  CONSTRAINT "coordinator_repair_states_revision_range" CHECK ("revision" BETWEEN 0 AND 9007199254740991),
  CONSTRAINT "coordinator_repair_states_envelope_object" CHECK (jsonb_typeof("envelope") = 'object'),
  CONSTRAINT "coordinator_repair_states_envelope_version" CHECK ("envelope" ->> 'version' = '1'),
  CONSTRAINT "coordinator_repair_states_envelope_owner_scope" CHECK ("envelope" ->> 'ownerScopeId' = "owner_scope_id"),
  CONSTRAINT "coordinator_repair_states_envelope_execution_scope" CHECK (
    "envelope" ->> 'executionScopeId' = "execution_scope_id"
  ),
  CONSTRAINT "coordinator_repair_states_envelope_snapshot" CHECK (jsonb_typeof("envelope" -> 'snapshot') = 'object'),
  CONSTRAINT "coordinator_repair_states_envelope_revision" CHECK (
    jsonb_typeof("envelope" -> 'snapshot' -> 'revision') = 'number'
    AND ("envelope" -> 'snapshot' ->> 'revision')::numeric = "revision"
  )
);

CREATE INDEX IF NOT EXISTS "coordinator_repair_states_updated_at_idx" ON "coordinator_repair_states" ("updated_at");

ALTER TABLE "coordinator_repair_states" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "coordinator_repair_states" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coordinator_repair_states'
      AND policyname = 'coordinator_repair_states_scoped_access'
  ) THEN
    CREATE POLICY "coordinator_repair_states_scoped_access"
      ON "coordinator_repair_states"
      AS PERMISSIVE
      FOR ALL
      TO public
      USING (
        "owner_scope_id" = current_setting('app.current_owner_scope_id', true)
        AND "execution_scope_id" = current_setting('app.current_execution_scope_id', true)
      )
      WITH CHECK (
        "owner_scope_id" = current_setting('app.current_owner_scope_id', true)
        AND "execution_scope_id" = current_setting('app.current_execution_scope_id', true)
      );
  END IF;
END $$;
