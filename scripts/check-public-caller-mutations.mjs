import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// This bounded mutation audit changes only a disposable source copy. It does not
// alter the checkout, run migrations, or connect to any database/service.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = realpathSync(tmpdir());
const fixture = mkdtempSync(join(tempRoot, "clearallergy-caller-mutations-"));
const testFile = "tests/public-read-callers.test.ts";
const targets = [
    ["shop list", "PublicShopListPage.tsx", "tx.shop.findMany", "prisma.shop.findMany"],
    ["shop list", "PublicShopListPage.tsx", "tx.allergen.findMany", "prisma.allergen.findMany"],
    ["shop detail", "PublicShopDetailPage.tsx", "tx.shop.findFirst", "prisma.shop.findFirst"],
    ["shop detail", "PublicShopDetailPage.tsx", "tx.allergen.findMany", "prisma.allergen.findMany"],
    ["menu detail", "PublicMenuDetailPage.tsx", "tx.menuItem.findFirst", "prisma.menuItem.findFirst"],
    ["menu detail", "PublicMenuDetailPage.tsx", "tx.allergen.findMany", "prisma.allergen.findMany"],
    ["menu detail", "PublicMenuDetailPage.tsx", "allergenMaster, tx)", "allergenMaster, prisma)"],
    ["menu API", "publicMenuRoute.ts", "tx.menuItem.findFirst", "prisma.menuItem.findFirst"],
    ["menu API", "publicMenuRoute.ts", "tx.allergen.findMany", "prisma.allergen.findMany"],
    ["menu API", "publicMenuRoute.ts", "allergenMaster, tx)", "allergenMaster, prisma)"],
];
const sourceFiles = [testFile, "scripts/check-public-caller-mutations.mjs", "package-lock.json",
    "features/public/shops/server/public-read-snapshot.ts", "features/public/shops/server/storeAllergenSupplement.ts",
    ...new Set(targets.map(([, filename]) => `features/public/shops/server/${filename}`))];
const report = {
    generatedAt: new Date().toISOString(), node: process.version,
    sourceSha256: Object.fromEntries(sourceFiles.map(file => [file,
        createHash("sha256").update(readFileSync(join(root, file))).digest("hex")])),
    baselineExitCode: null, mutations: [], restoredExitCode: null,
};

function run(caller) {
    const args = ["--import", "tsx", "--test", "--test-reporter=tap"];
    if (caller) args.push(`--test-name-pattern=^public caller transaction: ${caller}$`);
    args.push(testFile);
    const result = spawnSync(process.execPath, args, {
        cwd: fixture, encoding: "utf8", timeout: 60_000,
        env: {
            ...process.env, NODE_ENV: "test",
            DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/caller_fixture",
            DIRECT_URL: "postgresql://fixture:fixture@127.0.0.1:1/caller_fixture",
        },
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
}

try {
    for (const directory of ["app", "features", "components", "lib", "types"]) {
        cpSync(join(root, directory), join(fixture, directory), { recursive: true });
    }
    for (const file of ["package.json", "tsconfig.json"]) cpSync(join(root, file), join(fixture, file));
    mkdirSync(join(fixture, "tests"));
    cpSync(join(root, testFile), join(fixture, testFile));
    symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    report.baselineExitCode = run().status;
    assert.equal(report.baselineExitCode, 0, "Unmutated caller tests must pass before testing mutations");

    for (const [caller, filename, before, after] of targets) {
        const path = join(fixture, "features/public/shops/server", filename);
        const source = readFileSync(path, "utf8");
        assert.equal(source.split(before).length - 1, 1, `${filename}: mutation must match exactly once`);
        try {
            writeFileSync(path, `import { prisma } from "@/lib/db";\n${source.replace(before, after)}`, "utf8");
            const result = run(caller);
            const rootReadDetected = result.output.includes("ROOT_CLIENT_READ");
            const expectedTestFailed = result.output.includes(`- public caller transaction: ${caller}\n  ---`)
                && /^# fail 1\r?$/m.test(result.output);
            report.mutations.push({ caller, file: filename, site: before, exitCode: result.status, rootReadDetected, expectedTestFailed });
            assert.equal(result.status, 1, `${filename}: ${before} must fail`);
            assert.equal(rootReadDetected && expectedTestFailed, true, `${filename}: failure must identify the escaped client`);
        } finally {
            writeFileSync(path, source, "utf8");
        }
    }
    report.restoredExitCode = run().status;
    assert.equal(report.restoredExitCode, 0, "Restored caller tests must pass");
} finally {
    // mkdtemp creates our directory; check its resolved parent before removal.
    assert.equal(dirname(realpathSync(fixture)), tempRoot);
    rmSync(fixture, { recursive: true, force: true });
    console.log(JSON.stringify(report, null, 2));
}
