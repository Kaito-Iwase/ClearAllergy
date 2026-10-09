ALTER TABLE "MenuItem" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "foodVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reviewedFoodVersion" INTEGER,
  ADD COLUMN "creationOperationId" TEXT,
  ADD COLUMN "creationRequestHash" TEXT;
CREATE UNIQUE INDEX "MenuItem_shopId_creationOperationId_key" ON "MenuItem"("shopId", "creationOperationId");

CREATE TABLE "MenuFoodReview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "menuItemId" TEXT NOT NULL REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "foodVersion" INTEGER NOT NULL CHECK ("foodVersion" >= 0),
  "reviewSequence" INTEGER NOT NULL DEFAULT 0 CHECK ("reviewSequence" > 0),
  "contentSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("contentSnapshot") = 'object'),
  "evidenceRefs" TEXT NOT NULL CHECK (length(btrim("evidenceRefs")) BETWEEN 1 AND 4000),
  "scope" TEXT NOT NULL CHECK (length(btrim("scope")) BETWEEN 1 AND 2000),
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" TEXT NOT NULL CHECK (length(btrim("actorUserId")) > 0),
  "unresolvedIssues" TEXT,
  CHECK ("checkedAt" <= "recordedAt" + INTERVAL '5 minutes')
);
CREATE INDEX "MenuFoodReview_menuItemId_foodVersion_idx" ON "MenuFoodReview"("menuItemId", "foodVersion");
CREATE UNIQUE INDEX "MenuFoodReview_menuItemId_reviewSequence_key" ON "MenuFoodReview"("menuItemId", "reviewSequence");

-- Parent, child and maintenance writes all invalidate the same confirmation.
CREATE FUNCTION ca_menu_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."version" := OLD."version" + 1;
  IF ROW(NEW."name", NEW."description", NEW."category", NEW."ingredients", NEW."precaution", NEW."imageUrl", NEW."shopId")
       IS DISTINCT FROM ROW(OLD."name", OLD."description", OLD."category", OLD."ingredients", OLD."precaution", OLD."imageUrl", OLD."shopId")
     OR NEW."foodVersion" > OLD."foodVersion" THEN
    NEW."foodVersion" := OLD."foodVersion" + 1;
    NEW."reviewedFoodVersion" := NULL;
    NEW."isPublished" := FALSE;
  ELSE
    NEW."foodVersion" := OLD."foodVersion";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ca_menu_revision BEFORE UPDATE ON "MenuItem" FOR EACH ROW EXECUTE FUNCTION ca_menu_revision();

CREATE FUNCTION ca_allergen_link_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW."menuItemId", NEW."allergenId", NEW."status") IS NOT DISTINCT FROM ROW(OLD."menuItemId", OLD."allergenId", OLD."status") THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."menuItemId";
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP <> 'UPDATE' OR NEW."menuItemId" IS DISTINCT FROM OLD."menuItemId") THEN
    UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = NEW."menuItemId";
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER ca_allergen_link_revision AFTER INSERT OR UPDATE OR DELETE ON "MenuItemAllergen" FOR EACH ROW EXECUTE FUNCTION ca_allergen_link_revision();

CREATE FUNCTION ca_allergen_master_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW."slug", NEW."nameJa", NEW."nameEn") IS NOT DISTINCT FROM ROW(OLD."slug", OLD."nameJa", OLD."nameEn") THEN RETURN NULL; END IF;
  UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NULL;
END $$;
CREATE TRIGGER ca_allergen_master_revision AFTER INSERT OR UPDATE OR DELETE ON "Allergen" FOR EACH ROW EXECUTE FUNCTION ca_allergen_master_revision();

-- Serialize reviews with every parent/child food edit. Neither caller-supplied
-- snapshots nor timestamps can bind an old/future confirmation to new food.
CREATE FUNCTION ca_food_review_bound() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "MenuItem"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT m FROM "MenuItem" WHERE "id" = NEW."menuItemId" FOR UPDATE;
  IF NEW."foodVersion" IS DISTINCT FROM m."foodVersion" THEN
    RAISE EXCEPTION 'Food review must match the current food version';
  END IF;
  SELECT COALESCE(MAX("reviewSequence"), 0) + 1 INTO NEW."reviewSequence"
    FROM "MenuFoodReview" WHERE "menuItemId" = m."id";
  NEW."recordedAt" := clock_timestamp();
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
CREATE TRIGGER ca_food_review_bound BEFORE INSERT ON "MenuFoodReview" FOR EACH ROW EXECUTE FUNCTION ca_food_review_bound();

CREATE FUNCTION ca_food_review_added() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET
    "reviewedFoodVersion" = CASE WHEN COALESCE(btrim(NEW."unresolvedIssues"), '') = '' THEN NEW."foodVersion" ELSE NULL END,
    "isPublished" = CASE WHEN COALESCE(btrim(NEW."unresolvedIssues"), '') = '' THEN "isPublished" ELSE FALSE END
  WHERE "id" = NEW."menuItemId";
  RETURN NULL;
END $$;
CREATE TRIGGER ca_food_review_added AFTER INSERT ON "MenuFoodReview" FOR EACH ROW EXECUTE FUNCTION ca_food_review_added();

CREATE FUNCTION ca_food_review_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Food review records are append-only'; END $$;
CREATE TRIGGER ca_food_review_immutable BEFORE UPDATE ON "MenuFoodReview" FOR EACH ROW EXECUTE FUNCTION ca_food_review_immutable();

CREATE FUNCTION ca_food_review_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = OLD."menuItemId" AND "foodVersion" = OLD."foodVersion";
  RETURN NULL;
END $$;
CREATE TRIGGER ca_food_review_deleted AFTER DELETE ON "MenuFoodReview" FOR EACH ROW EXECUTE FUNCTION ca_food_review_deleted();

-- TRUNCATE does not fire row DELETE triggers; never leave derived confirmation
-- flags behind when maintenance removes all evidence.
CREATE FUNCTION ca_food_reviews_truncated() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" SET "foodVersion" = "foodVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NULL;
END $$;
CREATE TRIGGER ca_food_reviews_truncated AFTER TRUNCATE ON "MenuFoodReview" FOR EACH STATEMENT EXECUTE FUNCTION ca_food_reviews_truncated();

CREATE FUNCTION ca_require_food_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MenuItem" m SET "isPublished" = FALSE
  WHERE m."id" = NEW."id" AND m."isPublished" = TRUE AND (
    m."reviewedFoodVersion" IS DISTINCT FROM m."foodVersion" OR NOT EXISTS (
      SELECT 1 FROM (SELECT * FROM "MenuFoodReview" WHERE "menuItemId" = m."id" ORDER BY "reviewSequence" DESC LIMIT 1) r
      WHERE r."foodVersion" = m."foodVersion" AND COALESCE(btrim(r."unresolvedIssues"), '') = ''
    )
  );
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ca_require_food_review AFTER INSERT OR UPDATE ON "MenuItem"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ca_require_food_review();

-- No inference from updatedAt; all existing menus require an explicit review.
UPDATE "MenuItem" SET "isPublished" = FALSE WHERE "isPublished" = TRUE;
