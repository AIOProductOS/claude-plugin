#!/usr/bin/env node
// Bin entry for the stdio MCP. Everything of substance lives elsewhere:
// registry.ts (the shared tool source of truth, also served by the hosted
// connector), server.ts (the transport-agnostic server factory), client.ts
// (the one hardened HTTP executor). This file wires env → client → server →
// stdio, plus the once-only update banner.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PlatformClient } from "./client.js";
import { createPmServer } from "./server.js";
import { checkForUpdate, updateBanner } from "./update-notifier.js";
const VERSION = "0.17.0";
const token = process.env.PRODUCTOS_TOKEN;
const baseUrl = (process.env.PRODUCTOS_URL ?? "https://platform.aioproductos.com").replace(/\/$/, "");
if (!token) {
    console.error("[productos] PRODUCTOS_TOKEN is required — generate one in AIOProductOS → Settings → Tokens & Agents.");
    process.exit(1);
}
const client = new PlatformClient(baseUrl, token);
// Set once the startup npm check finds a newer release; the banner then rides
// on the NEXT tool result (the model reads it and tells the user) — exactly once.
let updateNotice = null;
let updateNoticeShown = false;
const server = createPmServer({
    version: VERSION,
    request: (call) => client.request(call),
    decorate: (content) => {
        if (updateNotice && !updateNoticeShown) {
            updateNoticeShown = true;
            return [...content, { type: "text", text: updateNotice }];
        }
        return content;
    },
});
async function main() {
    // Fire-and-forget: if a newer version is on npm, arm the one-time banner.
    // Never blocks the transport, never throws.
    void checkForUpdate(VERSION)
        .then((latest) => {
        if (latest)
            updateNotice = updateBanner(latest, VERSION);
    })
        .catch(() => { });
    await server.connect(new StdioServerTransport());
}
main().catch((err) => {
    console.error("[productos] fatal:", err);
    process.exit(1);
});
