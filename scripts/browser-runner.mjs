// Isolated tooling only: installing this runner never changes the app lockfile.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmCli } from "./npm-cli.mjs";

const version = "1.61.0";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(process.env.CLEARALLERGY_BROWSER_RUNNER_DIR || join(tmpdir(), `clearallergy-browser-${version}`));
const modulePath = join(runner, "node_modules", "playwright");
const env = { ...process.env, PLAYWRIGHT_MODULE_PATH: modulePath, PLAYWRIGHT_BROWSERS_PATH: join(runner, "browsers") };
const [command, ...options] = process.argv.slice(2);
const usage = "Usage: node scripts/browser-runner.mjs install [--with-deps] | public | ui | composition | qr | demo | admin";
class RunnerError extends Error {}

function runNode(args, childEnv = env) {
    const result = spawnSync(process.execPath, args, { cwd: repository, env: childEnv, stdio: "inherit", windowsHide: true });
    if (result.error || result.status !== 0) throw new RunnerError("Runner command failed. Review the command output.");
}

function assertInstalled() {
    let installed;
    try { installed = JSON.parse(readFileSync(join(modulePath, "package.json"), "utf8")).version; }
    catch { /* report a setup instruction without printing paths or raw errors */ }
    if (installed !== version) throw new RunnerError(`Run node scripts/browser-runner.mjs install to prepare Playwright ${version}.`);
}

try {
    if (["--help", "-h"].includes(command) && options.length === 0) {
        console.log(usage);
        console.log("Start the isolated app separately. Public/ui/demo modes block browser external requests. UI mode requires the fictional loopback fixture. Admin mode uses the dedicated DB, development Clerk and Blob.");
        console.log("Composition/qr modes use temporary local component fixtures and built app CSS; no app, DB or Clerk startup is required.");
    } else if (command === "install" && options.every((option) => option === "--with-deps") && options.length <= 1) {
        // Use the Node installation's npm through Node, avoiding shell quoting
        // and npm.cmd process-launch differences on Windows.
        const npmCli = resolveNpmCli().path;
        if (!existsSync(join(repository, "node_modules/next/package.json"))) throw new RunnerError("App dependencies are missing. Follow the development guide before preparing the browser runner.");
        mkdirSync(runner, { recursive: true });
        runNode([npmCli, "install", "--prefix", runner, "--ignore-scripts", "--no-package-lock", "--no-audit", "--no-fund", "--save-exact", `playwright@${version}`]);
        assertInstalled();
        runNode([join(modulePath, "cli.js"), "install", ...options, "chromium"]);
        console.log(`Playwright ${version} and Chromium are ready. Start the isolated app, then run node scripts/browser-runner.mjs public.`);
    } else if (["public", "ui", "composition", "qr", "demo", "admin"].includes(command) && options.length === 0) {
        assertInstalled();
        if (command === "admin") {
            console.log("Running dedicated admin regression: writes to the test DB, development Clerk and configured Blob store. Test images require the separate cleanup command.");
            runNode(["scripts/check-test-browser.mjs"]);
        } else if (command === "composition") {
            runNode(["scripts/check-image-composition-browser.mjs"]);
        } else if (command === "qr") {
            runNode(["scripts/check-shop-qr-browser.mjs"]);
        } else if (command === "ui") {
            runNode(["scripts/check-public-ui-browser.mjs"], { ...env, CLEARALLERGY_BROWSER_BLOCK_EXTERNAL: "true" });
        } else {
            runNode(["scripts/check-first-use-browser.mjs"], { ...env,
                CLEARALLERGY_BROWSER_PUBLIC_ONLY: command === "public" ? "true" : "false",
                CLEARALLERGY_BROWSER_BLOCK_EXTERNAL: "true",
            });
        }
    } else {
        throw new RunnerError(usage);
    }
} catch (error) {
    // Filesystem/process errors may contain paths or configuration. Only our
    // fixed messages reach stderr; child command diagnostics remain separate.
    console.error(error instanceof RunnerError ? error.message : "Browser runner setup failed. Check filesystem access and local tooling.");
    process.exitCode = 1;
}
