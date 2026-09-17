"use strict";

const { exec } = require("child_process");
const fs = require("fs-extra");
const path = require("path");

const PNPM_AVAILABLE = () => fs.existsSync(path.join(process.cwd(), "pnpm-lock.yaml"));
const tool = () => PNPM_AVAILABLE() ? "pnpm" : "npm";

const ACTIONS = {
    install:    { aliases: ["i", "add"],           needsPkg: true,  desc: "Install a package"         },
    uninstall:  { aliases: ["remove", "rm", "un"], needsPkg: true,  desc: "Remove a package"          },
    update:     { aliases: ["up", "upgrade"],      needsPkg: false, desc: "Update package(s)"         },
    list:       { aliases: ["ls"],                 needsPkg: false, desc: "List installed packages"   },
    outdated:   { aliases: ["old"],                needsPkg: false, desc: "Show outdated packages"    },
    audit:      { aliases: [],                     needsPkg: false, desc: "Security audit"            },
    info:       { aliases: ["view", "show"],       needsPkg: true,  desc: "Show package info"         },
    search:     { aliases: ["find", "s"],          needsPkg: true,  desc: "Search npm registry"       },
    run:        { aliases: [],                     needsPkg: true,  desc: "Run a script from pkg.json"},
    check:      { aliases: ["test", "verify"],     needsPkg: true,  desc: "Check if pkg is installed" },
    reinstall:  { aliases: ["fix"],                needsPkg: false, desc: "Reinstall all packages"    },
    devinstall: { aliases: ["idev", "adddev"],     needsPkg: true,  desc: "Install as devDependency"  },
};

function resolveAction(sub) {
    if (!sub) return null;
    const s = sub.toLowerCase();
    if (ACTIONS[s]) return s;
    for (const [action, meta] of Object.entries(ACTIONS)) {
        if (meta.aliases.includes(s)) return action;
    }
    return null;
}

function buildCommand(action, pkg, flags) {
    const t = tool();
    const hasDev = flags.includes("--dev") || flags.includes("-D");
    const devFlag = hasDev ? " --save-dev" : "";

    switch (action) {
        case "install":    return `${t} add ${pkg}${devFlag}`;
        case "devinstall": return `${t} add ${pkg} --save-dev`;
        case "uninstall":  return `${t} remove ${pkg}`;
        case "update":     return pkg ? `${t} update ${pkg}` : `${t} update`;
        case "list":       return pkg ? `${t} list ${pkg} --depth=0` : `${t} list --depth=0`;
        case "outdated":   return `${t} outdated`;
        case "audit":      return `npm audit --audit-level=moderate`;
        case "info":       return `npm view ${pkg} name version description homepage license repository.url keywords`;
        case "search":     return `npm search ${pkg} --json --searchlimit=8`;
        case "run":        return `${t} run ${pkg}`;
        case "check":      return null;
        case "reinstall":  return `${t} install`;
        default:           return `${t} ${action}`;
    }
}

async function checkPackage(pkg, message) {
    const localPkg = path.join(process.cwd(), "node_modules", pkg, "package.json");
    if (fs.existsSync(localPkg)) {
        const info = fs.readJsonSync(localPkg, { throws: false }) || {};
        return message.reply(
            `✅ ${pkg} @ ${info.version || "unknown"}\n` +
            `${(info.description || "N/A").slice(0, 80)}\n` +
            `License: ${info.license || "N/A"} | Main: ${info.main || "index.js"}`
        );
    }
    return message.reply(`❌ "${pkg}" is not installed.\nUse: install ${pkg}`);
}

function parseSearchOutput(raw) {
    try {
        const results = JSON.parse(raw);
        if (!Array.isArray(results) || results.length === 0) return null;
        return results.slice(0, 5);
    } catch {
        return null;
    }
}

function formatOutput(raw, action) {
    if (!raw) return "(no output)";
    const lines = raw.split("\n").filter(Boolean);

    if (action === "list") {
        return lines
            .filter(l => !l.startsWith("npm warn") && !l.includes("npm@"))
            .slice(0, 25)
            .join("\n");
    }
    if (action === "outdated") return lines.slice(0, 20).join("\n");
    if (action === "audit") {
        const relevant = lines.filter(l =>
            l.includes("vulnerabilit") || l.includes("Critical") ||
            l.includes("High") || l.includes("Moderate") || l.includes("found")
        );
        return (relevant.length ? relevant : lines.slice(0, 10)).join("\n");
    }

    return lines.slice(0, 30).join("\n").slice(0, 1800);
}

module.exports = {
    config: {
        name: "npm",
        aliases: ["pkg", "pnpm", "pkgmgr"],
        version: "1.0.0",
        author: "SIFAT",
        countDown: 5,
        role: 4,
        description: { en: "Full-featured npm/pnpm wrapper with search, check, info, audit and more. Dev only." },
        category: "developer",
        guide: { en: "{pn} <action> [package] [--dev]" },
    },

    onStart: async function ({ args, message, prefix, event, api }) {
        const rawSub = args[0] || "";
        const action = resolveAction(rawSub);
        const flags = args.filter(a => a.startsWith("-"));
        const pkgArgs = args.slice(1).filter(a => !a.startsWith("-"));
        const pkg = pkgArgs.join(" ").trim();

        if (!action) {
            const lines = Object.entries(ACTIONS).map(([name, m]) => {
                const alts = m.aliases.length ? ` (${m.aliases.join("/")})` : "";
                return `▸ ${name}${alts} — ${m.desc}`;
            });
            return message.reply(
                `📦 Package Manager\n━━━━━━━━━━━━━━━━━━\n` +
                lines.join("\n") +
                `\n━━━━━━━━━━━━━━━━━━\n` +
                `💡 ${prefix}npm install axios\n` +
                `💡 ${prefix}npm remove lodash\n` +
                `💡 ${prefix}npm info express\n` +
                `💡 ${prefix}npm search image\n` +
                `💡 ${prefix}npm check fs-extra\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🔧 ${tool()} | ${PNPM_AVAILABLE() ? "pnpm-lock.yaml" : "package-lock.json"}`
            );
        }

        const meta = ACTIONS[action];
        if (meta.needsPkg && !pkg && action !== "update" && action !== "reinstall") {
            return message.reply(`❌ Package name required.\n💡 ${prefix}npm ${rawSub} <package>`);
        }

        if (action === "check") return checkPackage(pkg, message);

        if (action === "search") {
            api.setMessageReaction("⏳", event.messageID, () => {}, true);
            const start = Date.now();
            return new Promise(resolve => {
                exec(`npm search ${pkg} --json --searchlimit=8`, {
                    cwd: process.cwd(), timeout: 30000, maxBuffer: 1024 * 1024 * 3
                }, async (err, stdout) => {
                    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                    const results = parseSearchOutput(stdout);
                    if (!results) {
                        api.setMessageReaction("❌", event.messageID, () => {}, true);
                        await message.reply(`❌ No results for "${pkg}"`);
                        return resolve();
                    }
                    const lines = results.map((r, i) =>
                        `${i + 1}. ${r.name} @ ${r.version || "?"}\n   ${(r.description || "").slice(0, 70)}`
                    );
                    api.setMessageReaction("✅", event.messageID, () => {}, true);
                    await message.reply(
                        lines.join("\n━━━━━━━━━━━━━━━━━━\n") +
                        `\n⏱️ ${results.length} results in ${elapsed}s`
                    );
                    resolve();
                });
            });
        }

        const command = buildCommand(action, pkg, flags);
        const actionLabel = pkg ? `${action} ${pkg}` : action;

        api.setMessageReaction("⏳", event.messageID, () => {}, true);
        const start = Date.now();

        return new Promise(resolve => {
            exec(command, {
                cwd: process.cwd(),
                timeout: 180000,
                maxBuffer: 1024 * 1024 * 10,
                env: { ...process.env, FORCE_COLOR: "0" }
            }, async (err, stdout, stderr) => {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                const rawOut = (stdout || "").trim();
                const rawErr = (stderr || "").trim();
                const combined = rawOut || rawErr;
                const success = !err;

                api.setMessageReaction(success ? "✅" : "❌", event.messageID, () => {}, true);

                if (action === "info" && success) {
                    const lines = rawOut.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 20).join("\n");
                    await message.reply(`${lines}\n⏱️ ${elapsed}s`);
                    return resolve();
                }

                const outText = formatOutput(combined, action);
                await message.reply(
                    `${actionLabel} — ${success ? "done" : "failed"} (${elapsed}s)\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    (outText || "(no output)") +
                    (err && rawErr && rawErr !== rawOut ? `\n━━━━━━━━━━━━━━━━━━\n${rawErr.split("\n").slice(0, 5).join("\n")}` : "")
                );
                resolve();
            });
        });
    },
};
