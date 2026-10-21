import assert from "node:assert/strict";
import test from "node:test";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { foodSnapshot, foodContentChanged, emptyFoodReviewDraft, isFoodReviewTimeValid } from "../features/admin/menus/food-review";
import { getMenuSavePlan } from "../features/admin/menus/menu-save-plan";
import type { AllergenStatus } from "../lib/allergens";

const now = Date.parse("2026-10-19T00:00:00Z");
const statuses = Object.fromEntries(ALLERGEN_MASTER.map(a => [a.slug, "FREE" as AllergenStatus]));
const content = { name: "架空料理", description: null, category: null, ingredients: "架空材料", precaution: null, imageUrl: null, priceYen: 1000 };
const initial = foodSnapshot(content, ALLERGEN_MASTER, statuses);
const defaults = { name: content.name, allergens: ALLERGEN_MASTER, statusBySlug: statuses, requestedIsPublished: true,
    foodChanged: false, reviewCurrent: true, recordingReview: false, foodReview: emptyFoodReviewDraft() };
const review = { evidenceRefs: "架空資料の版1", scope: "架空の提供内容と全品目", checkedAt: new Date(now).toISOString(), unresolvedIssues: "" };

test("price-only changes preserve the current food review and publication intent", () => {
    const changed = foodContentChanged(initial, foodSnapshot({ ...content, priceYen: 1200 }, ALLERGEN_MASTER, statuses));
    const plan = getMenuSavePlan({ ...defaults, foodChanged: changed }, now);
    assert.equal(changed, false);
    assert.equal(plan.willPublish, true);
    assert.equal(plan.foodReviewState, "current");
});
test("food edits and explicit supply/process changes require a new review", () => {
    const changed = foodContentChanged(initial, foodSnapshot({ ...content, ingredients: "変更した架空材料" }, ALLERGEN_MASTER, statuses));
    assert.equal(changed, true);
    const plan = getMenuSavePlan({ ...defaults, foodChanged: changed }, now);
    assert.equal(plan.willPublish, false);
    assert.equal(plan.foodReviewState, "changed");
});
test("a complete new review can accompany food changes and publication", () => {
    const plan = getMenuSavePlan({ ...defaults, foodChanged: true, recordingReview: true, foodReview: review }, now);
    assert.equal(plan.willPublish, true);
    assert.equal(plan.foodReviewState, "recording");
    assert.equal(plan.reviewInputInvalid, false);
});
test("unresolved issues save a record without making it publishable", () => {
    const plan = getMenuSavePlan({ ...defaults, recordingReview: true, foodReview: { ...review, unresolvedIssues: "資料が一部不足" } }, now);
    assert.equal(plan.willPublish, false);
    assert.equal(plan.foodReviewState, "unresolved");
    assert.equal(plan.reviewInputInvalid, false);
});
test("unknown items, an invalid master and a missing name cannot be advertised as publishable", () => {
    for (const overrides of [
        { statusBySlug: { ...statuses, egg: "UNKNOWN" as const } },
        { allergens: ALLERGEN_MASTER.slice(1) }, { name: " " },
    ]) {
        const plan = getMenuSavePlan({ ...defaults, ...overrides }, now);
        assert.equal(plan.willPublish, false);
        assert.ok(plan.publishErrors.length > 0);
    }
});
test("publication choice and food-review validity remain independent", () => {
    const draft = getMenuSavePlan({ ...defaults, requestedIsPublished: false }, now);
    assert.equal(draft.willPublish, false);
    assert.equal(draft.canPublish, true);
    assert.equal(draft.foodReviewState, "current");
    const missing = getMenuSavePlan({ ...defaults, reviewCurrent: false }, now);
    assert.equal(missing.willPublish, false);
    assert.equal(missing.foodReviewState, "required");
});
test("incomplete and future review times use the same five-minute server boundary", () => {
    assert.equal(isFoodReviewTimeValid(new Date(now + 300_000).toISOString(), now), true);
    assert.equal(isFoodReviewTimeValid(new Date(now + 300_001).toISOString(), now), false);
    for (const foodReview of [emptyFoodReviewDraft(), { ...review, checkedAt: new Date(now + 300_001).toISOString() }]) {
        const plan = getMenuSavePlan({ ...defaults, recordingReview: true, foodReview }, now);
        assert.equal(plan.willPublish, false);
        assert.equal(plan.reviewInputInvalid, true);
    }
});
