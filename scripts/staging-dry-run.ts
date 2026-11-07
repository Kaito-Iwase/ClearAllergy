import { readFileSync, statSync } from "node:fs";
import { evaluateStagingPolicy } from "./staging-policy";

// No network, environment loading, subprocess, credentials, or deployment operation.
function readJson(path: string): unknown {
    if (statSync(path).size > 256 * 1024) throw new Error("INPUT_TOO_LARGE");
    return JSON.parse(readFileSync(path, "utf8"));
}

try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--policy" || args[2] !== "--evidence") throw new Error("INVALID_ARGUMENTS");
    const result = evaluateStagingPolicy(readJson(args[1]), readJson(args[3]));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.eligible ? 0 : 1;
} catch {
    // Do not echo raw input, paths, exception messages, or JSON validation details.
    process.stdout.write(`${JSON.stringify({ mode: "dry-run", eligible: false, deploymentAllowed: false, reasons: ["INVALID_INPUT_OR_ARGUMENTS"] })}\n`);
    process.exitCode = 2;
}
