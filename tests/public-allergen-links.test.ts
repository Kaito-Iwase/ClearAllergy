import assert from "node:assert/strict";
import test from "node:test";
import { createPublicAllergenLinkResolver } from "../features/public/shops/server/public-allergen-links";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { createStatusBySlug, getStoreContainsAllergenSlugs, isMenuPublishable } from "../lib/allergens";

const master = ALLERGEN_MASTER.map((row, index) => ({ ...row, id: `fictional-${index}` }));

test("同snapshotのIDから全状態を保持し、既存の公開判定と店舗内補足へ渡す", () => {
    const resolve = createPublicAllergenLinkResolver(master);
    const links = master.map(row => ({ allergenId: row.id, status: "FREE" }));
    const egg = master.find(row => row.slug === "egg")!;
    for (const status of ["FREE", "CONTAINS", "MAY_CONTAIN", "UNKNOWN", "INVALID"]) {
        const input = links.map(link => link.allergenId === egg.id ? { ...link, status } : link);
        const output = resolve(input);
        assert.deepEqual(output, input.map(link => ({ status: link.status, allergen: { slug: master.find(row => row.id === link.allergenId)!.slug } })));
        const statusBySlug = createStatusBySlug(master, output);
        assert.equal(statusBySlug.egg, status === "INVALID" ? "UNKNOWN" : status);
        assert.equal(isMenuPublishable({ name: "【架空】検証用", allergens: master, statusBySlug }), !["UNKNOWN", "INVALID"].includes(status));
        assert.equal(getStoreContainsAllergenSlugs([{ name: "【架空】検証用", allergenLinks: output }], master).has("egg"), status === "CONTAINS");
    }
});

test("欠けたリンクをFREEで補わず、masterにないIDは取得失敗にする", () => {
    const resolve = createPublicAllergenLinkResolver(master);
    const links = master.filter(row => row.slug !== "egg").map(row => ({ allergenId: row.id, status: "FREE" }));
    const statusBySlug = createStatusBySlug(master, resolve(links));
    assert.equal(statusBySlug.egg, "UNKNOWN");
    assert.equal(isMenuPublishable({ name: "【架空】検証用", allergens: master, statusBySlug }), false);
    assert.throws(() => resolve([{ allergenId: "outside-snapshot", status: "FREE" }]), /snapshot master/);
});

test("別requestのmasterを再利用せず、現在のIDとslugの対応を使う", () => {
    const input = [{ allergenId: "fictional-id", status: "CONTAINS" as const }];
    const previous = createPublicAllergenLinkResolver([{ id: "fictional-id", slug: "egg" }]);
    const current = createPublicAllergenLinkResolver([{ id: "fictional-id", slug: "milk" }]);
    assert.equal(previous(input)[0].allergen.slug, "egg");
    assert.equal(current(input)[0].allergen.slug, "milk");
    assert.deepEqual(input, [{ allergenId: "fictional-id", status: "CONTAINS" }]);
});
