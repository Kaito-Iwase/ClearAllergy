-- Store instants as UTC in the existing TIMESTAMP(3) columns, independent of
-- the connection TimeZone. No historical row, column type, publication rule,
-- lock or append-only constraint is changed. No server/session setting changes.
BEGIN;
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "Shop" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "AdminInvite" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "MenuItem" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "Allergen" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "MenuItemAllergen" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "MenuFoodReview" ALTER COLUMN "recordedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "MenuPublicationConfirmation" ALTER COLUMN "confirmedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "MenuFoodIssueResolution" ALTER COLUMN "resolvedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- Preserve transaction-time defaults/updates and wall-clock event recording.
CREATE OR REPLACE FUNCTION "unpublishIncompleteMenus"(
    "targetMenuId" TEXT DEFAULT NULL,
    "triggerSource" TEXT DEFAULT 'database_trigger'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    WITH "invalidPublishedMenus" AS (
        SELECT
            menu."id",
            menu."shopId"
        FROM "MenuItem" AS menu
        WHERE menu."isPublished" = TRUE
          AND ("targetMenuId" IS NULL OR menu."id" = "targetMenuId")
          AND (
              BTRIM(menu."name") = ''
              OR EXISTS (
                  SELECT 1
                  FROM "Allergen" AS allergen
                  WHERE NOT EXISTS (
                      SELECT 1
                      FROM "MenuItemAllergen" AS link
                      WHERE link."menuItemId" = menu."id"
                        AND link."allergenId" = allergen."id"
                        AND link."status" <> 'UNKNOWN'::"AllergenStatus"
                  )
              )
          )
    ),
    "unpublishedMenus" AS (
        UPDATE "MenuItem" AS menu
        SET
            "isPublished" = FALSE,
            "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        FROM "invalidPublishedMenus" AS invalid
        WHERE menu."id" = invalid."id"
        RETURNING menu."id", menu."shopId"
    )
    INSERT INTO "AuditLog" (
        "id",
        "actorUserId",
        "actorShopId",
        "action",
        "targetType",
        "targetId",
        "success",
        "ipAddress",
        "metadata",
        "createdAt"
    )
    SELECT
        'audit_' || MD5(
            RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || unpublished."id"
        ),
        NULL,
        unpublished."shopId",
        'menu_unpublish',
        'menu',
        unpublished."id",
        TRUE,
        NULL,
        JSONB_BUILD_OBJECT(
            'reason', 'allergen_settings_incomplete',
            'source', "triggerSource"
        ),
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    FROM "unpublishedMenus" AS unpublished;
END;
$$;

CREATE OR REPLACE FUNCTION ca_allergen_link_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW."menuItemId", NEW."allergenId", NEW."status") IS NOT DISTINCT FROM ROW(OLD."menuItemId", OLD."allergenId", OLD."status") THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "id" = OLD."menuItemId";
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP <> 'UPDATE' OR NEW."menuItemId" IS DISTINCT FROM OLD."menuItemId") THEN
    UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "id" = NEW."menuItemId";
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION ca_allergen_master_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW."slug", NEW."nameJa", NEW."nameEn") IS NOT DISTINCT FROM ROW(OLD."slug", OLD."nameJa", OLD."nameEn") THEN RETURN NULL; END IF;
  UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION ca_food_review_bound() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "MenuItem"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT m FROM "MenuItem" WHERE "id" = NEW."menuItemId" FOR UPDATE;
  IF NEW."foodVersion" IS DISTINCT FROM m."foodVersion" THEN
    RAISE EXCEPTION 'Food review must match the current food version';
  END IF;
  SELECT COALESCE(MAX("reviewSequence"), 0) + 1 INTO NEW."reviewSequence"
    FROM "MenuFoodReview" WHERE "menuItemId" = m."id";
  NEW."recordedAt" := clock_timestamp() AT TIME ZONE 'UTC';
  NEW."contentSnapshot" := jsonb_build_object(
    'name', m."name", 'description', m."description", 'category', m."category",
    'ingredients', m."ingredients", 'precaution', m."precaution", 'imageUrl', m."imageUrl",
    'allergens', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'slug', a."slug", 'nameJa', a."nameJa", 'status', COALESCE(l."status"::text, 'UNKNOWN')
    ) ORDER BY a."slug" COLLATE "C"), '[]'::jsonb)
    FROM "Allergen" a LEFT JOIN "MenuItemAllergen" l ON l."allergenId" = a."id" AND l."menuItemId" = m."id")
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION ca_food_review_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  WHERE "id" = OLD."menuItemId" AND "foodVersion" = OLD."foodVersion";
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION ca_food_reviews_truncated() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION ca_food_issue_resolution_bound() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "MenuItem"%ROWTYPE; latest "MenuFoodReview"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT m FROM "MenuItem" WHERE "id" = NEW."menuItemId" FOR UPDATE;
  SELECT * INTO latest FROM "MenuFoodReview" WHERE "menuItemId" = m."id" ORDER BY "reviewSequence" DESC LIMIT 1;
  IF NEW."foodVersion" IS DISTINCT FROM m."foodVersion" OR latest."id" IS NULL
    OR NEW."foodReviewId" IS DISTINCT FROM latest."id" OR COALESCE(btrim(latest."unresolvedIssues"), '') = '' THEN
    RAISE EXCEPTION 'Resolution must match the latest issue and saved food version';
  END IF;
  NEW."issueSnapshot" := latest."unresolvedIssues";
  NEW."resolvedAt" := clock_timestamp() AT TIME ZONE 'UTC';
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION ca_publication_confirmation_bound() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "MenuItem"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT m FROM "MenuItem" WHERE "id" = NEW."menuItemId" FOR UPDATE;
  IF NEW."foodVersion" IS DISTINCT FROM m."foodVersion" THEN
    RAISE EXCEPTION 'Publication must match the saved food version';
  END IF;
  IF ca_food_issue_is_unresolved(m."id", m."foodVersion") THEN
    RAISE EXCEPTION 'Unresolved food issues prevent publication';
  END IF;
  NEW."confirmedAt" := clock_timestamp() AT TIME ZONE 'UTC';
  RETURN NEW;
END $$;

COMMIT;
