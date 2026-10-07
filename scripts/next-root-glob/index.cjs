// Next loads this synchronous adapter through CommonJS.
const { globSync: tinyGlobSync } = module.require("tinyglobby");
const { isAbsolute } = module.require("node:path");

// Scoped to @next/eslint-plugin-next@16.3.6: its sole fast-glob consumer
// calls globSync(pattern, { onlyDirectories: true }). This is not a full shim.
function globSync(patterns, options) {
    if (options?.onlyDirectories !== true) throw new Error("Next root glob requires directory-only matching.");
    for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
        if (typeof pattern !== "string" || pattern.length > 65_536) throw new Error("Invalid Next root glob pattern.");
        // tinyglobby and fast-glob interpret numeric ranges differently. Never
        // silently drop configured roots: unsupported syntax fails the lint.
        if (/\{[^{}]*\.\.[^{}]*\}/.test(pattern)) throw new Error("Next root glob range braces are unsupported; list roots explicitly.");
        let depth = 0;
        for (let i = 0; i < pattern.length; i++) {
            if (pattern[i] === "\\") { i++; continue; }
            if (pattern[i] === "{" || pattern[i] === "(") {
                if (++depth > 128) throw new Error("Next root glob nesting limit exceeded.");
            } else if (pattern[i] === "}" || pattern[i] === ")") depth = Math.max(0, depth - 1);
        }
    }
    const positivePatterns = (Array.isArray(patterns) ? patterns : [patterns]).filter((pattern) => !pattern.startsWith("!"));
    const absolute = options.absolute ?? (positivePatterns.length > 0 && positivePatterns.every(isAbsolute));
    return tinyGlobSync(patterns, { ...options, absolute, expandDirectories: false }).map((entry) =>
        entry === "/" || /^[A-Za-z]:\/$/.test(entry) ? entry : entry.replace(/\/+$/, ""));
}

module.exports = { globSync };
