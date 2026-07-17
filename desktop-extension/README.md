# AIOProductOS — Claude Desktop Extension (`.mcpb`)

One-click install of the AIOProductOS MCP server into [Claude Desktop](https://claude.com/download).
The extension connects Claude Desktop to your AIOProductOS workspace over the Model
Context Protocol — run the product board, read your product brain, compute first-party
analytics, capture feedback, and work the support inbox, all over one typed customer
record that joins revenue, feedback, work, and code.

- **28 tools** (product board · product brain · insights · NPS/NRR/funnel/retention/paths · support inbox · comms)
- **Auth:** a single Personal Access Token, generated in AIOProductOS → **Settings → Tokens & Agents**. Scoped to your org; every call respects your row-level permissions.
- **Stores nothing locally** — each tool call is one authenticated HTTPS request to the platform.

> Prefer a fully remote, OAuth 2.1 connection with the complete **57-tool** surface?
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
