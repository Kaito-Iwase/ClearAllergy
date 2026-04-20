ALTER TABLE "Shop" ADD COLUMN "regularHoliday" TEXT;
ALTER TABLE "Shop" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "Shop" ADD COLUMN "note" TEXT;

UPDATE "Shop"
SET
    "regularHoliday" = COALESCE(
        "regularHoliday",
        NULLIF(
            btrim(substring("hours" from '(?:定休日|休業日)[[:space:]]*[:：][[:space:]]*([^\r\n]+)')),
            ''
        )
    ),
    "phoneNumber" = COALESCE(
        "phoneNumber",
        NULLIF(
            btrim(substring("hours" from '(?:電話番号|電話|TEL)[[:space:]]*[:：][[:space:]]*([^\r\n]+)')),
            ''
        )
    ),
    "note" = COALESCE(
        "note",
        NULLIF(
            btrim(substring("hours" from '(?:備考|メモ)[[:space:]]*[:：][[:space:]]*([^\r\n]+)')),
            ''
        )
    ),
    "hours" = CASE
        WHEN "hours" ~ '(営業時間|定休日|休業日|電話番号|電話|TEL|備考|メモ)'
            THEN NULLIF(
                btrim(
                    regexp_replace(
                        split_part("hours", E'\n', 1),
                        '^(営業時間)[[:space:]]*[:：][[:space:]]*',
                        ''
                    )
                ),
                ''
            )
        ELSE "hours"
    END
WHERE "hours" IS NOT NULL;
