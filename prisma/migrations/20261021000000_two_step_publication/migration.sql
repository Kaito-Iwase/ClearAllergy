-- Preserve food evidence as historical evidence; publication is a separate action.
BEGIN;
ALTER TABLE "MenuItem" ADD COLUMN "publicationConfirmedFoodVersion" INTEGER,
  ADD COLUMN "legacyPublicationFoodReviewId" TEXT;
CREATE TABLE "MenuPublicationConfirmation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "menuItemId" TEXT NOT NULL REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "foodVersion" INTEGER NOT NULL CHECK ("foodVersion" >= 0),
  "actorUserId" TEXT NOT NULL CHECK (length(btrim("actorUserId")) > 0),
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MenuPublicationConfirmation_menuItemId_foodVersion_idx"
  ON "MenuPublicationConfirmation"("menuItemId", "foodVersion");

CREATE OR REPLACE FUNCTION ca_menu_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."version" := OLD."version" + 1;
  IF ROW(NEW."name", NEW."description", NEW."category", NEW."ingredients", NEW."precaution", NEW."imageUrl", NEW."shopId")
       IS DISTINCT FROM ROW(OLD."name", OLD."description", OLD."category", OLD."ingredients", OLD."precaution", OLD."imageUrl", OLD."shopId")
     OR NEW."foodVersion" > OLD."foodVersion" THEN
    NEW."foodVersion" := OLD."foodVersion" + 1;
    NEW."reviewedFoodVersion" := NULL;
    NEW."publicationConfirmedFoodVersion" := NULL;
    NEW."legacyPublicationFoodReviewId" := NULL;
    NEW."isPublished" := FALSE;
  ELSE
    NEW."foodVersion" := OLD."foodVersion";
  END IF;
  RETURN NEW;
END $$;

-- A later legacy evidence insertion must not silently become a publication.
CREATE OR REPLACE FUNCTION ca_food_review_added() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET
    "reviewedFoodVersion" = CASE WHEN COALESCE(btrim(NEW."unresolvedIssues"), '') = '' THEN NEW."foodVersion" ELSE NULL END,
    "publicationConfirmedFoodVersion" = NULL, "legacyPublicationFoodReviewId" = NULL, "isPublished" = FALSE
  WHERE "id" = NEW."menuItemId";
  RETURN NULL;
END $$;

CREATE FUNCTION ca_publication_confirmation_bound() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "MenuItem"%ROWTYPE; latest "MenuFoodReview"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT m FROM "MenuItem" WHERE "id" = NEW."menuItemId" FOR UPDATE;
  IF NEW."foodVersion" IS DISTINCT FROM m."foodVersion" THEN
    RAISE EXCEPTION 'Publication must match the saved food version';
  END IF;
  SELECT * INTO latest FROM "MenuFoodReview" WHERE "menuItemId" = m."id" ORDER BY "reviewSequence" DESC LIMIT 1;
  IF COALESCE(btrim(latest."unresolvedIssues"), '') <> '' THEN
    RAISE EXCEPTION 'Unresolved food issues prevent publication';
  END IF;
  -- Actual recording time of a publication action, never a food-check time.
  NEW."confirmedAt" := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER ca_publication_confirmation_bound BEFORE INSERT ON "MenuPublicationConfirmation"
  FOR EACH ROW EXECUTE FUNCTION ca_publication_confirmation_bound();

CREATE FUNCTION ca_publication_confirmation_added() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET "publicationConfirmedFoodVersion" = NEW."foodVersion", "legacyPublicationFoodReviewId" = NULL
  WHERE "id" = NEW."menuItemId";
  RETURN NULL;
END $$;
CREATE TRIGGER ca_publication_confirmation_added AFTER INSERT ON "MenuPublicationConfirmation"
  FOR EACH ROW EXECUTE FUNCTION ca_publication_confirmation_added();

CREATE FUNCTION ca_publication_confirmation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Publication confirmations are append-only'; END $$;
CREATE TRIGGER ca_publication_confirmation_immutable BEFORE UPDATE ON "MenuPublicationConfirmation"
  FOR EACH ROW EXECUTE FUNCTION ca_publication_confirmation_immutable();

CREATE FUNCTION ca_publication_confirmation_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1,
    "publicationConfirmedFoodVersion" = NULL, "legacyPublicationFoodReviewId" = NULL, "isPublished" = FALSE
  WHERE "id" = OLD."menuItemId" AND "foodVersion" = OLD."foodVersion";
  RETURN NULL;
END $$;
CREATE TRIGGER ca_publication_confirmation_deleted AFTER DELETE ON "MenuPublicationConfirmation"
  FOR EACH ROW EXECUTE FUNCTION ca_publication_confirmation_deleted();
CREATE FUNCTION ca_publication_confirmations_truncated() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1,
    "publicationConfirmedFoodVersion" = NULL, "legacyPublicationFoodReviewId" = NULL, "isPublished" = FALSE;
  RETURN NULL;
END $$;
CREATE TRIGGER ca_publication_confirmations_truncated AFTER TRUNCATE ON "MenuPublicationConfirmation"
  FOR EACH STATEMENT EXECUTE FUNCTION ca_publication_confirmations_truncated();

DROP TRIGGER ca_require_food_review ON "MenuItem";
DROP FUNCTION ca_require_food_review();
CREATE FUNCTION ca_require_menu_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" m SET "isPublished" = FALSE
  WHERE m."id" = NEW."id" AND m."isPublished" = TRUE AND (
    m."publicationConfirmedFoodVersion" IS DISTINCT FROM m."foodVersion"
    OR EXISTS (SELECT 1 FROM (SELECT * FROM "MenuFoodReview" WHERE "menuItemId" = m."id" ORDER BY "reviewSequence" DESC LIMIT 1) r
      WHERE COALESCE(btrim(r."unresolvedIssues"), '') <> '')
    OR NOT (
      EXISTS (SELECT 1 FROM "MenuPublicationConfirmation" p WHERE p."menuItemId" = m."id" AND p."foodVersion" = m."foodVersion")
      OR EXISTS (SELECT 1 FROM "MenuFoodReview" r WHERE r."id" = m."legacyPublicationFoodReviewId"
        AND r."menuItemId" = m."id" AND r."foodVersion" = m."foodVersion"
        AND COALESCE(btrim(r."unresolvedIssues"), '') = '')
    )
  );
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ca_require_menu_publication AFTER INSERT OR UPDATE ON "MenuItem"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ca_require_menu_publication();

-- Keep only already-public, actually supported legacy publication. This creates
-- no confirmation event and fabricates no food evidence or checkedAt.
UPDATE "MenuItem" m SET "publicationConfirmedFoodVersion" = m."foodVersion",
  "legacyPublicationFoodReviewId" = r."id"
FROM "MenuFoodReview" r
WHERE m."isPublished" = TRUE AND m."reviewedFoodVersion" = m."foodVersion"
  AND r."menuItemId" = m."id" AND r."foodVersion" = m."foodVersion"
  AND COALESCE(btrim(r."unresolvedIssues"), '') = ''
  AND r."reviewSequence" = (SELECT MAX("reviewSequence") FROM "MenuFoodReview" WHERE "menuItemId" = m."id");
UPDATE "MenuItem" SET "isPublished" = FALSE WHERE "isPublished" = TRUE AND "publicationConfirmedFoodVersion" IS NULL;
SET CONSTRAINTS ALL IMMEDIATE;
-- Only the backfill above may establish this exception. Normal writes can clear
-- it, but cannot attach an arbitrary historical review to a draft/publication.
CREATE FUNCTION ca_legacy_publication_reference_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."legacyPublicationFoodReviewId" IS NOT NULL AND (
    TG_OP = 'INSERT' OR NEW."legacyPublicationFoodReviewId" IS DISTINCT FROM OLD."legacyPublicationFoodReviewId"
  ) THEN
    RAISE EXCEPTION 'Migration-only legacy publication reference';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ca_legacy_publication_reference_immutable BEFORE INSERT OR UPDATE ON "MenuItem"
  FOR EACH ROW EXECUTE FUNCTION ca_legacy_publication_reference_immutable();
-- Derived publication state may be established only by the event's nested
-- trigger update. In particular, a later legacy review must not allow an old
-- same-version event to be revived by directly restoring this marker.
CREATE FUNCTION ca_publication_marker_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."publicationConfirmedFoodVersion" IS NOT NULL AND pg_trigger_depth() = 1 AND (
    TG_OP = 'INSERT' OR NEW."publicationConfirmedFoodVersion" IS DISTINCT FROM OLD."publicationConfirmedFoodVersion"
  ) THEN
    RAISE EXCEPTION 'Publication marker is derived from an explicit event';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ca_publication_marker_guard BEFORE INSERT OR UPDATE ON "MenuItem"
  FOR EACH ROW EXECUTE FUNCTION ca_publication_marker_guard();
COMMIT;
