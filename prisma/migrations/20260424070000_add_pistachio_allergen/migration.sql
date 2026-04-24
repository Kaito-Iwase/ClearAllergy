INSERT INTO "Allergen" ("id", "slug", "nameJa", "nameEn", "sortOrder", "createdAt", "updatedAt")
VALUES (
    'allergen_pistachio',
    'pistachio',
    'ピスタチオ',
    'Pistachio',
    29,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE
SET
    "nameJa" = EXCLUDED."nameJa",
    "nameEn" = EXCLUDED."nameEn",
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;

WITH pistachio AS (
    SELECT "id"
    FROM "Allergen"
    WHERE "slug" = 'pistachio'
)
INSERT INTO "MenuItemAllergen" ("menuItemId", "allergenId", "status", "createdAt", "updatedAt")
SELECT
    "MenuItem"."id",
    pistachio."id",
    'UNKNOWN'::"AllergenStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "MenuItem"
CROSS JOIN pistachio
ON CONFLICT ("menuItemId", "allergenId") DO NOTHING;
