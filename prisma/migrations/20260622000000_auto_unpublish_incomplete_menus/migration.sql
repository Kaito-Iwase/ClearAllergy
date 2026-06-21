-- 現在のアレルゲンマスタに対して、未設定または設定行欠損がある公開メニューを
-- 下書きへ戻し、システム操作として監査ログへ記録します。
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
            "updatedAt" = CURRENT_TIMESTAMP
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
        CURRENT_TIMESTAMP
    FROM "unpublishedMenus" AS unpublished;
END;
$$;

CREATE OR REPLACE FUNCTION "reconcileMenuPublicationTrigger"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    "menuId" TEXT;
    "source" TEXT;
BEGIN
    IF TG_TABLE_NAME = 'Allergen' THEN
        PERFORM "unpublishIncompleteMenus"(NULL, 'allergen_master_insert');
        RETURN NULL;
    END IF;

    IF TG_TABLE_NAME = 'MenuItemAllergen' THEN
        IF TG_OP = 'DELETE' THEN
            "menuId" := OLD."menuItemId";
        ELSE
            "menuId" := NEW."menuItemId";
        END IF;
        "source" := 'menu_allergen_' || LOWER(TG_OP);
    ELSE
        "menuId" := NEW."id";
        "source" := 'menu_' || LOWER(TG_OP);
    END IF;

    PERFORM "unpublishIncompleteMenus"("menuId", "source");
    RETURN NULL;
END;
$$;

-- 設定行を削除して作り直す既存の更新処理を考慮し、判定はトランザクション完了時まで遅延します。
CREATE CONSTRAINT TRIGGER "MenuItem_reconcile_publication"
AFTER INSERT OR UPDATE ON "MenuItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "reconcileMenuPublicationTrigger"();

CREATE CONSTRAINT TRIGGER "MenuItemAllergen_reconcile_publication"
AFTER INSERT OR UPDATE OR DELETE ON "MenuItemAllergen"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "reconcileMenuPublicationTrigger"();

CREATE CONSTRAINT TRIGGER "Allergen_reconcile_menu_publication"
AFTER INSERT ON "Allergen"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "reconcileMenuPublicationTrigger"();

-- マイグレーション適用前から存在する不完全な公開メニューも同じ基準で是正します。
SELECT "unpublishIncompleteMenus"(NULL, 'migration_backfill');
