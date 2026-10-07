import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

// npm is supplied by the Node installation, not bundled with the application.
// Call its JS entry point through Node; never interpolate a shell command.
/** @param {{ execPath?: string, env?: Record<string, string | undefined>, platform?: string }} [options] */
export function resolveNpmCli({ execPath = process.execPath, env = process.env, platform = process.platform } = {}) {
    const nodeDirectory = dirname(execPath);
    const candidates = [
        env.npm_execpath,
        join(nodeDirectory, "node_modules/npm/bin/npm-cli.js"),
        join(dirname(nodeDirectory), "lib/node_modules/npm/bin/npm-cli.js"),
        ...(platform === "win32" && env.APPDATA ? [join(env.APPDATA, "npm/node_modules/npm/bin/npm-cli.js")] : []),
    ];
    for (const candidate of candidates) {
        if (!candidate || !isAbsolute(candidate) || !existsSync(candidate)) continue;
        try {
            const path = realpathSync(candidate);
            const root = dirname(dirname(path));
            const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
            if (path !== realpathSync(join(root, "bin/npm-cli.js")) || pkg.name !== "npm" || typeof pkg.version !== "string") continue;
            return { path, version: pkg.version };
        } catch { /* Try standard locations without exposing paths/configuration. */ }
    }
    throw new Error("Node installation npm CLI was not found. Run through npm or inspect the Node installation.");
}
