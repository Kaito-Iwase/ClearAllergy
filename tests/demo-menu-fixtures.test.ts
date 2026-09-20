import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_MENUS, validateDemoMenuFixtures } from "../prisma/demo-menus";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";

test("架空メニューは全品目を明記し、省略・未確認・余分な品目を拒否する", () => {
    assert.doesNotThrow(() => validateDemoMenuFixtures());
    const fixture = DEMO_MENUS[0];
    const missing = { ...fixture.allergenStatusBySlug };
    delete missing[ALLERGEN_MASTER[0].slug];
    assert.throws(() => validateDemoMenuFixtures([{ ...fixture, allergenStatusBySlug: missing }]));
    assert.throws(() => validateDemoMenuFixtures([{ ...fixture, allergenStatusBySlug: {
        ...fixture.allergenStatusBySlug, [ALLERGEN_MASTER[0].slug]: "UNKNOWN",
    } }]));
    assert.throws(() => validateDemoMenuFixtures([{ ...fixture, allergenStatusBySlug: {
        ...fixture.allergenStatusBySlug, invented: "FREE",
    } }]));
});
