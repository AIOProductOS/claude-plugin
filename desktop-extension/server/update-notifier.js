/**
 * Update notifier — lets a stdio user (Cursor / Claude / Codex …) know when a
 * newer @aioproductoscom/mcp is on npm. The MCP host shows tool RESULTS to the
 * model, so the notice rides along on the first tool call (see index.ts) and the
 * assistant relays it. Everything here is best-effort and silent: it never
 * throws, never blocks the transport, and never writes to stdout (which would
 * corrupt the JSON-RPC stream). Cached ~daily in the temp dir so we don't hit
 * npm on every launch. Opt out with NO_UPDATE_NOTIFIER / PRODUCTOS_NO_UPDATE_NOTIFIER,
 * and it's disabled under CI.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const PKG = "@aioproductoscom/mcp";
const CACHE = join(tmpdir(), "aioproductos-mcp-update.json");
const TTL_MS = 24 * 60 * 60 * 1000; // check npm at most once a day
const FETCH_TIMEOUT_MS = 2500;
/** true when `latest` is a higher release than `current` (patch/minor/major; pre-release tags ignored). */
export function isNewer(latest, current) {
    const parts = (v) => v.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
    const a = parts(latest);
    const b = parts(current);
    for (let i = 0; i < 3; i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x > y)
            return true;
        if (x < y)
            return false;
    }
    return false;
}
async function fetchLatest() {
    try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(`https://registry.npmjs.org/${PKG}/latest`, {
            signal: ctrl.signal,
            headers: { accept: "application/json" },
        });
        clearTimeout(to);
        if (!res.ok)
            return null;
        const body = (await res.json());
        return typeof body.version === "string" ? body.version : null;
    }
    catch {
        return null; // offline / timeout / registry hiccup — stay quiet
    }
}
/** Latest published version if it's newer than `current`, else null. Never throws. */
export async function checkForUpdate(current) {
    if (process.env.NO_UPDATE_NOTIFIER || process.env.PRODUCTOS_NO_UPDATE_NOTIFIER || process.env.CI) {
        return null;
    }
    let latest = null;
    try {
        const cached = JSON.parse(readFileSync(CACHE, "utf8"));
        if (cached && Date.now() - cached.at < TTL_MS && typeof cached.latest === "string") {
            latest = cached.latest;
        }
    }
    catch {
        /* no cache yet or unreadable — fall through to a live check */
    }
    if (!latest) {
        latest = await fetchLatest();
        if (latest) {
            try {
                writeFileSync(CACHE, JSON.stringify({ at: Date.now(), latest }));
            }
            catch {
                /* temp dir not writable — fine, we just re-check next launch */
            }
        }
    }
    return latest && isNewer(latest, current) ? latest : null;
}
/** The one-line banner appended to a tool result when an update is available. */
export function updateBanner(latest, current) {
    return (`\n\n— ⬆️ A newer AIOProductOS MCP is available: ${latest} (you're on ${current}). ` +
        `Update by pointing your MCP config at \`@aioproductoscom/mcp@latest\` (or \`@${latest}\`) ` +
        `and restarting your MCP client. New tools and fixes ship regularly. —`);
}
