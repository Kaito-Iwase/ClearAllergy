import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfigFromFile } from "@prisma/config";

// Prismaが実際に解決する依存を検証する。直接依存を追加して別の版を検証しない。
const localRequire = createRequire(import.meta.url);
const configRequire = createRequire(localRequire.resolve("@prisma/config"));
const { deepmerge, deepmergeInto } = configRequire("deepmerge-ts") as {
    deepmerge: (...values: object[]) => unknown;
    deepmergeInto: (...values: object[]) => void;
};

test("Prisma's merge dependency handles the advisory's recursive input without stack exhaustion", () => {
    const left: { self?: object } = {};
    const right: { self?: object } = {};
    left.self = left;
    right.self = right;
    assert.doesNotThrow(() => deepmerge(left, right));
    assert.doesNotThrow(() => deepmergeInto(left, right));
});

test("Prisma loads a typed config and preserves nested migration settings and relative paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "clearallergy-prisma-config-"));
    try {
        await writeFile(join(root, "prisma.config.ts"), `
            const schema: string = "./prisma/schema.prisma";
            export default { schema, migrations: { path: "./prisma/migrations", seed: "echo fixture-only" } };
        `);
        const result = await loadConfigFromFile({ configRoot: root });
        assert.equal(result.error, undefined);
        assert.equal(result.resolvedPath, join(root, "prisma.config.ts"));
        assert.equal(result.config?.schema, join(root, "prisma/schema.prisma"));
        assert.equal(result.config?.migrations?.path, join(root, "prisma/migrations"));
        assert.equal(result.config?.migrations?.seed, "echo fixture-only");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Prisma preserves config-free defaults and rejects an invalid config", async () => {
    const root = await mkdtemp(join(tmpdir(), "clearallergy-prisma-default-"));
    try {
        const empty = await loadConfigFromFile({ configRoot: root });
        assert.equal(empty.error, undefined);
        assert.equal(empty.resolvedPath, null);
        await writeFile(join(root, "prisma.config.ts"), "export default { schema: 123 };\n");
        const invalid = await loadConfigFromFile({ configRoot: root });
        assert.equal(invalid.error?._tag, "ConfigFileSyntaxError");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
