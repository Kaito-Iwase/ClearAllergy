import assert from "node:assert/strict";
import test from "node:test";
import {
    clearUserAllergenPreferences, getUserAllergenPreferenceSnapshot,
    loadUserAllergenPreferences, normalizeUserAllergenPreferences,
    saveUserAllergenPreferences, subscribeUserAllergenPreferences,
} from "../lib/public-allergen-preferences";

test("端末設定の旧形式・不正slug・重複を正規化する", () => {
    assert.deepEqual(normalizeUserAllergenPreferences({ selectedSlugs: ["egg", "egg", "not-an-allergen", 1] }).highlightSlugs, ["egg"]);
    assert.deepEqual(normalizeUserAllergenPreferences({ highlightSlugs: [], excludedSlugs: [], selectedSlugs: ["egg"] }).selectedSlugs, []);
    assert.deepEqual(normalizeUserAllergenPreferences({ highlightSlugs: ["egg"], excludedSlugs: ["egg"] }).highlightSlugs, []);
    assert.deepEqual(normalizeUserAllergenPreferences(null).selectedSlugs, []);
});

test("保存・別タブ変更・削除を購読し、保存失敗は適用しない", (t) => {
    let raw: string | null = null;
    let failing = false;
    const fakeWindow = Object.assign(new EventTarget(), { localStorage: {
        getItem: () => raw,
        setItem: (_key: string, value: string) => { if (failing) throw Error("disabled"); raw = value; },
        removeItem: () => { if (failing) throw Error("disabled"); raw = null; },
    }});
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    t.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
    let notifications = 0;
    const unsubscribe = subscribeUserAllergenPreferences(() => { notifications++; });
    assert.deepEqual(loadUserAllergenPreferences().selectedSlugs, []);
    assert.equal(saveUserAllergenPreferences({ highlightSlugs: ["egg"], excludedSlugs: [], includeMayContain: false, selectedSlugs: [] }).ok, true);
    assert.deepEqual(loadUserAllergenPreferences().selectedSlugs, ["egg"]);
    assert.equal(notifications, 1);
    assert.equal(getUserAllergenPreferenceSnapshot(), getUserAllergenPreferenceSnapshot());
    failing = true;
    assert.equal(saveUserAllergenPreferences({ highlightSlugs: ["milk"], excludedSlugs: [], includeMayContain: false, selectedSlugs: [] }).ok, false);
    assert.equal(clearUserAllergenPreferences().ok, false);
    assert.deepEqual(loadUserAllergenPreferences().selectedSlugs, ["egg"]);
    assert.equal(notifications, 1);
    raw = JSON.stringify({ excludedSlugs: ["shrimp"] });
    fakeWindow.dispatchEvent(new Event("storage"));
    assert.deepEqual(loadUserAllergenPreferences().excludedSlugs, ["shrimp"]);
    failing = false;
    assert.equal(clearUserAllergenPreferences().ok, true);
    assert.deepEqual(loadUserAllergenPreferences().selectedSlugs, []);
    raw = "invalid-json";
    const invalid = getUserAllergenPreferenceSnapshot();
    assert.ok(invalid.storageError);
    assert.equal(invalid, getUserAllergenPreferenceSnapshot());
    unsubscribe();
    const lastCount = notifications;
    fakeWindow.dispatchEvent(new Event("focus"));
    assert.equal(notifications, lastCount);
});
