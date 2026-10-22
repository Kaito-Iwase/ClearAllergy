-- Explicit resolution of an existing issue is separate from publication.
-- No old review, allergen state or food-check timestamp is rewritten.
BEGIN;
CREATE TABLE "MenuFoodIssueResolution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "menuItemId" TEXT NOT NULL REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "foodReviewId" TEXT NOT NULL REFERENCES "MenuFoodReview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "foodVersion" INTEGER NOT NULL CHECK ("foodVersion" >= 0),
  "issueSnapshot" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL CHECK (length(btrim("actorUserId")) > 0),
  "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MenuFoodIssueResolution_menuItemId_foodReviewId_foodVersion_key"
  ON "MenuFoodIssueResolution"("menuItemId", "foodReviewId", "foodVersion");
CREATE INDEX "MenuFoodIssueResolution_foodReviewId_foodVersion_idx"
  ON "MenuFoodIssueResolution"("foodReviewId", "foodVersion");

CREATE FUNCTION ca_food_issue_is_unresolved(menu_id TEXT, food_version INTEGER) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT COALESCE((SELECT COALESCE(btrim(r."unresolvedIssues"), '') <> '' AND NOT EXISTS (
    SELECT 1 FROM "MenuFoodIssueResolution" s WHERE s."menuItemId" = menu_id
      AND s."foodReviewId" = r."id" AND s."foodVersion" = food_version
  ) FROM "MenuFoodReview" r WHERE r."menuItemId" = menu_id ORDER BY r."reviewSequence" DESC LIMIT 1), FALSE)
$$;

CREATE FUNCTION ca_food_issue_resolution_bound() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "MenuItem"%ROWTYPE; latest "MenuFoodReview"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT m FROM "MenuItem" WHERE "id" = NEW."menuItemId" FOR UPDATE;
  SELECT * INTO latest FROM "MenuFoodReview" WHERE "menuItemId" = m."id" ORDER BY "reviewSequence" DESC LIMIT 1;
  IF NEW."foodVersion" IS DISTINCT FROM m."foodVersion" OR latest."id" IS NULL
    OR NEW."foodReviewId" IS DISTINCT FROM latest."id" OR COALESCE(btrim(latest."unresolvedIssues"), '') = '' THEN
    RAISE EXCEPTION 'Resolution must match the latest issue and saved food version';
  END IF;
  NEW."issueSnapshot" := latest."unresolvedIssues";
  NEW."resolvedAt" := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER ca_food_issue_resolution_bound BEFORE INSERT ON "MenuFoodIssueResolution"
  FOR EACH ROW EXECUTE FUNCTION ca_food_issue_resolution_bound();

CREATE FUNCTION ca_food_issue_resolution_added() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET "publicationConfirmedFoodVersion" = NULL,
    "legacyPublicationFoodReviewId" = NULL, "isPublished" = FALSE WHERE "id" = NEW."menuItemId";
  RETURN NULL;
END $$;
CREATE TRIGGER ca_food_issue_resolution_added AFTER INSERT ON "MenuFoodIssueResolution"
  FOR EACH ROW EXECUTE FUNCTION ca_food_issue_resolution_added();
CREATE TRIGGER ca_food_issue_resolution_immutable BEFORE UPDATE ON "MenuFoodIssueResolution"
  FOR EACH ROW EXECUTE FUNCTION ca_publication_confirmation_immutable();
CREATE TRIGGER ca_food_issue_resolution_deleted AFTER DELETE ON "MenuFoodIssueResolution"
  FOR EACH ROW EXECUTE FUNCTION ca_publication_confirmation_deleted();
CREATE TRIGGER ca_food_issue_resolutions_truncated AFTER TRUNCATE ON "MenuFoodIssueResolution"
  FOR EACH STATEMENT EXECUTE FUNCTION ca_publication_confirmations_truncated();

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
  NEW."confirmedAt" := clock_timestamp();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION ca_require_menu_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" m SET "isPublished" = FALSE
  WHERE m."id" = NEW."id" AND m."isPublished" = TRUE AND (
    m."publicationConfirmedFoodVersion" IS DISTINCT FROM m."foodVersion"
    OR ca_food_issue_is_unresolved(m."id", m."foodVersion")
    OR NOT (
      EXISTS (SELECT 1 FROM "MenuPublicationConfirmation" p WHERE p."menuItemId" = m."id" AND p."foodVersion" = m."foodVersion")
      OR EXISTS (SELECT 1 FROM "MenuFoodReview" r WHERE r."id" = m."legacyPublicationFoodReviewId"
        AND r."menuItemId" = m."id" AND r."foodVersion" = m."foodVersion"
        AND COALESCE(btrim(r."unresolvedIssues"), '') = '')
    )
  );
  RETURN NULL;
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
