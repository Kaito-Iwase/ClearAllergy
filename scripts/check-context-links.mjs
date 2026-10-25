import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const CORE_CONTEXT = ["AGENTS.md", "README.md", "docs/agentic-development.md", "docs/guide/change-map.md", "docs/guide/rules.md", "docs/guide/development.md", "docs/guide/maintenance.md"];
const slug = value => value.toLowerCase().replace(/<[^>]*>/g, "").replace(/[`*_~]/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");
function markdownIds(text) {
    text = text.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1[^\n]*$/gm, "");
    const ids = new Set([...text.matchAll(/<a\s+(?:[^>]*?\s)?id=["']([^"']+)["'][^>]*>/g)].map(match => match[1]));
    const seen = new Map();
    for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
        const base = slug(match[1]), count = seen.get(base) ?? 0;
        ids.add(base + (count ? "-" + count : "")); seen.set(base, count + 1);
    }
    return ids;
}
export function checkContextLinks(root, files = CORE_CONTEXT) {
    const canonicalRoot = realpathSync(root), failures = [];
    let checked = 0;
    const inside = path => { const rel = relative(canonicalRoot, path); return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep); };
    for (const file of files) {
        const source = resolve(canonicalRoot, file);
        if (!inside(source) || extname(source) !== ".md" || !existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink() || !inside(realpathSync(source))) { failures.push({ file, reason: "invalid source" }); continue; }
        const text = readFileSync(source, "utf8").replace(/^\s*(```|~~~)[\s\S]*?^\s*\1[^\n]*$/gm, "");
        for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\s]+)(?:\s+["'][^)]*)?\)/g)) {
            const href = match[1].replace(/^<|>$/g, "");
            if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
            checked++;
            let pathPart, anchor;
            try { const hash = href.indexOf("#"); pathPart = decodeURIComponent(hash < 0 ? href : href.slice(0, hash)); anchor = hash < 0 ? "" : decodeURIComponent(href.slice(hash + 1)); } catch { failures.push({ file, reason: "invalid link encoding" }); continue; }
            const target = pathPart ? resolve(dirname(source), pathPart) : source;
            if (!inside(target) || !existsSync(target) || lstatSync(target).isSymbolicLink() || !inside(realpathSync(target)) || !lstatSync(target).isFile()) { failures.push({ file, href, reason: "target missing or outside repository" }); continue; }
            if (anchor && extname(target) === ".md" && !markdownIds(readFileSync(target, "utf8")).has(anchor)) failures.push({ file, href, reason: "anchor missing" });
            if (anchor && /\.(?:ts|tsx|mjs|cjs|js|prisma|sql)$/.test(target) && /^L\d+(?:-L?\d+)?$/.test(anchor)) {
                const [, first, last] = anchor.match(/^L(\d+)(?:-L?(\d+))?$/);
                const start = Number(first), end = Number(last ?? first), lines = readFileSync(target, "utf8").split(/\r?\n/).length;
                if (start < 1 || end < start || end > lines) failures.push({ file, href, reason: "code line reference out of range" });
            }
        }
    }
    return { status: failures.length ? "FAIL" : "PASS", files, checked, failures, scope: "core inline relative links/Markdown anchors, code-file existence and supported line bounds only; no remote, AST or research truth validation" };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const report = checkContextLinks(process.cwd()); console.log(JSON.stringify(report, null, 2));
    if (report.status !== "PASS") process.exitCode = 1;
}
