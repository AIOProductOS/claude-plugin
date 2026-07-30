# AIOProductOS — Claude Desktop Extension (`.mcpb`)

One-click install of the AIOProductOS MCP server into [Claude Desktop](https://claude.com/download).
The extension connects Claude Desktop to your AIOProductOS workspace over the Model
Context Protocol — run the product board, read your product brain, compute first-party
analytics, capture feedback, and work the support inbox, all over one typed customer
record that joins revenue, feedback, work, and code.

- **71 tools** — 34 read, 37 write, 1 destructive (product board · product brain · insights · NPS/NRR/funnel/retention/paths · support inbox · comms · bookings)
- **Writes a third party can see:** `reply_to_conversation` / `add_note` / `resolve_conversation` (your support visitor sees the reply), `post_to_channel` / `reply_in_channel` (teammates), and `cancel_booking` / `reschedule_booking` (the guest is notified).
- **`delete_task` is the one destructive tool** — permanent, cascades to subtasks, no undo. It requires `confirm: "DELETE"` alongside the id, so a bare task id can never trigger it.
- **3 interactive apps** ([MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)) — `list_tasks` renders your board (change a status and it writes back through `update_task`), `get_weekly_signal_memo` renders this week's themes (one click turns a theme into a linked task), and `analyze_funnel` renders conversion per step with the live MRR behind each. The text answer is always there too, so nothing is lost if a host doesn't render them.
- **Auth:** a single Personal Access Token, generated in AIOProductOS → **Settings → Tokens & Agents**. Scoped to your org; every call respects your row-level permissions.
- **Stores nothing locally** — each tool call is one authenticated HTTPS request to the platform.

> Prefer a fully remote, OAuth 2.1 connection with the 71-tool hosted surface?
> Add the hosted connector instead: `https://platform.aioproductos.com/api/mcp`
> (docs: <https://aioproductos.com/product/mcp>).

## Install

Download the latest `aioproductos.mcpb` from
[Releases](https://github.com/AIOProductOS/claude-plugin/releases), then open it with
Claude Desktop (Settings → Extensions → Install from file) and paste your token.

## Build from source

```bash
cd desktop-extension/server
npm install --omit=dev          # restores the two pinned deps (@modelcontextprotocol/sdk, zod)
cd ..
npx @anthropic-ai/mcpb pack . aioproductos.mcpb
```

The server code under `server/` is the published npm package
[`@aioproductoscom/mcp`](https://www.npmjs.com/package/@aioproductoscom/mcp) — the same
stdio server you can also run with `npx -y @aioproductoscom/mcp`.
