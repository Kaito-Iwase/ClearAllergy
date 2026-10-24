import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { z } from "zod";

const require = createRequire(import.meta.url);
const blobRequire = createRequire(require.resolve("@vercel/blob"));
const oidcRequire = createRequire(blobRequire.resolve("@vercel/oidc"));
// Import only the installed consumer's pure schemas; no config reader/writer,
// home directory, provider request or real credential is used.
const schemaPath = join(dirname(oidcRequire.resolve("@vercel/cli-config")), "schema.js");
const configSchemas = require(schemaPath);
const consumerZod = createRequire(schemaPath)("zod").z;

test("a bounded six-element fixture is rejected before element transforms in both Zod consumers", () => {
    for (const library of [z, consumerZod]) {
        let visited = 0;
        const schema = library.array(library.string().transform((value: string) => {
            visited += 1;
            return value.toUpperCase();
        })).max(5);
        const input = ["a", "b", "c", "d", "e", "f"];
        const result = schema.safeParse(input);
        assert.equal(result.success, false);
        assert.equal(visited, 0);
        assert.deepEqual(input, ["a", "b", "c", "d", "e", "f"]);
        assert.deepEqual(schema.parse(["a", "b", "c", "d", "e"]), ["A", "B", "C", "D", "E"]);
        assert.equal(visited, 5);
    }
});

test("the installed CLI consumer preserves supported settings and future fields without reading files", () => {
    const input = {
        credStorage: "file", currentTeam: "fixture-team", futureSetting: "retained",
        telemetry: { enabled: false, futureSetting: true },
        guidance: { enabled: true }, updates: { auto: false },
    };
    const parsed = configSchemas.globalConfigSchema.parse(input);
    assert.deepEqual(parsed, input);
    assert.deepEqual(consumerZod.encode(configSchemas.globalConfigSchema, parsed), input);
    assert.equal(configSchemas.globalConfigSchema.safeParse({ credStorage: "invalid-fixture" }).success, false);
    assert.equal(configSchemas.globalConfigSchema.safeParse({ telemetry: { enabled: "invalid-fixture" } }).success, false);
});

test("the installed CLI schema keeps optional identity metadata and rejects wrong types using inert fixtures", () => {
    const input = { skipWrite: true, userId: "fixture-only", expiresAt: 0, tokenSource: "env", futureSetting: "retained" };
    const parsed = configSchemas.authConfigSchema.parse(input);
    assert.deepEqual(parsed, input);
    assert.deepEqual(consumerZod.encode(configSchemas.authConfigSchema, parsed), input);
    assert.equal(configSchemas.authConfigSchema.safeParse({ expiresAt: "invalid-fixture" }).success, false);
});
