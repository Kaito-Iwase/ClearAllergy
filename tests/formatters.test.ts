import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTimeJa } from "../lib/utils/formatters";

test("更新日時はサーバー・端末のタイムゾーンによらず日本時間で表示する", () => {
    const previous = process.env.TZ;
    try {
        for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
            process.env.TZ = zone;
            assert.equal(formatDateTimeJa("2026-06-16T14:38:39.000Z"), "2026/6/16 23:38:39");
            assert.equal(formatDateTimeJa(new Date("2026-06-16T14:38:39.000Z")), "2026/6/16 23:38:39");
        }
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});
