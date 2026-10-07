import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { globSync } = require("../scripts/next-root-glob/index.cjs");
const nextRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { getRootDirs } = nextRequire("./utils/get-root-dirs.js");
const plugin = require("@next/eslint-plugin-next");
const { ESLint } = require("eslint");

function fixture() {
    const root = mkdtempSync(join(tmpdir(), "clearallergy-next-roots-"));
    for (const dir of ["apps/web/app/about", "apps/admin/app/contact", "apps/admin/pages", "apps/.hidden/app", "standalone/pages"]) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, "apps/web/app/page.tsx"), "export default function Page() { return null; }");
    writeFileSync(join(root, "apps/web/app/about/page.tsx"), "export default function Page() { return null; }");
    writeFileSync(join(root, "apps/admin/app/contact/page.tsx"), "export default function Page() { return null; }");
    writeFileSync(join(root, "apps/admin/pages/contact.js"), "export default function Page() { return null; }");
    writeFileSync(join(root, "standalone/pages/about.js"), "export default function Page() { return null; }");
    writeFileSync(join(root, "apps/file.txt"), "not a directory");
    return root;
}

test("Next directory adapter preserves literal, wildcard, brace and absolute root matching", () => {
    const root = fixture();
    try {
        const options = { cwd: root, onlyDirectories: true };
        assert.deepEqual(globSync("apps/web", options), ["apps/web"]);
        assert.deepEqual(globSync("apps/*", options).sort(), ["apps/admin", "apps/web"]);
        assert.deepEqual(globSync("apps/{web,admin}", options).sort(), ["apps/admin", "apps/web"]);
        assert.deepEqual(globSync(["apps/*", "!apps/admin"], options), ["apps/web"]);
        assert.deepEqual(globSync("apps/missing", options), []);
        const absolute = join(root, "apps/web").replaceAll("\\", "/");
        assert.deepEqual(globSync(absolute, { onlyDirectories: true }), [absolute]);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("installed Next plugin uses the scoped adapter and keeps string/array/default rootDir", () => {
    const root = fixture();
    try {
        assert.equal(nextRequire("fast-glob/package.json").version, "3.3.3-clearallergy.1");
        assert.deepEqual(getRootDirs({ cwd: root, settings: {} }), [root]);
        const web = join(root, "apps/web");
        assert.deepEqual(getRootDirs({ cwd: root, settings: { next: { rootDir: web } } }), [web.replaceAll("\\", "/")]);
        const roots = getRootDirs({ cwd: root, settings: { next: { rootDir: [join(root, "apps/*"), join(root, "standalone")] } } });
        assert.deepEqual(roots.sort(), ["apps/admin", "apps/web", "standalone"].map(p => join(root, p).replaceAll("\\", "/")).sort());
        assert.throws(() => getRootDirs({ cwd: root, settings: { next: { rootDir: join(root, "apps/app{1..12}") } } }), /range braces are unsupported/);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("internal anchor lint detection remains active for App and Pages roots and permits external links", async () => {
    const root = fixture();
    try {
        for (const [rootDir, href] of [[join(root, "apps/web"), "/"], [[join(root, "apps/*")], "/contact"], [join(root, "standalone"), "/about"]]) {
            const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [{
                files: ["**/*.jsx"], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
                plugins: { "@next/next": plugin }, settings: { next: { rootDir } },
                rules: { "@next/next/no-html-link-for-pages": "error" },
            }] });
            const [internal] = await eslint.lintText(`const x = <a href="${href}">internal</a>;`, { filePath: join(root, "check.jsx") });
            assert.equal(internal.messages.filter((m: { ruleId: string }) => m.ruleId === "@next/next/no-html-link-for-pages").length, 1, JSON.stringify({ rootDir, href, messages: internal.messages }));
            const [external] = await eslint.lintText('const x = <a href="https://example.invalid/about">external</a>;', { filePath: join(root, "check.jsx") });
            assert.equal(external.errorCount, 0);
        }
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("deep untrusted root patterns are rejected before a recursive matcher runs", () => {
    assert.throws(() => globSync("{".repeat(4000) + "a" + "}".repeat(4000), { onlyDirectories: true }), /nesting limit/);
    assert.throws(() => globSync("a".repeat(65_537), { onlyDirectories: true }), /Invalid Next root/);
    assert.throws(() => globSync("apps/app{1..12}", { onlyDirectories: true }), /range braces are unsupported/);
    assert.throws(() => globSync("apps/app{01..12}", { onlyDirectories: true }), /range braces are unsupported/);
    assert.throws(() => globSync("app", { onlyFiles: true }), /directory-only/);
});
