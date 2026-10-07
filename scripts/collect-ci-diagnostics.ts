import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { assertCiDatabaseTarget } from "./ci-environment";
import { summarizeCiLog } from "./ci-log-summary";

try {
    assertCiDatabaseTarget(); // Pure environment check; this script never opens a DB connection.
    if (process.env.CI !== "true") throw new Error("CI only");
    const [source, destination, ...extra] = process.argv.slice(2);
    if (!source || !destination || extra.length) throw new Error("Two paths required");
    const exists = existsSync(source);
    const raw = exists ? readFileSync(source, "utf8") : "";
    const limit = 1_000_000;
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify({ ...summarizeCiLog(raw.slice(-limit)), sourcePresent: exists, truncated: raw.length > limit }, null, 2) + "\n", "utf8");
    console.log("Saved CI app-log category counts; raw logs and messages were excluded.");
} catch {
    console.error("Could not create the CI diagnostic summary; raw logs were not published.");
    process.exitCode = 1;
}
