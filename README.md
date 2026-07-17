# AIOProductOS plugin for Claude Code

[![claude-plugin MCP server](https://glama.ai/mcp/servers/AIOProductOS/claude-plugin/badges/card.svg)](https://glama.ai/mcp/servers/AIOProductOS/claude-plugin)

[![Hosted connector on Glama](https://img.shields.io/badge/Glama-verified_connector-2ea87c)](https://glama.ai/mcp/connectors/com.aioproductos/mcp) [![MCP Registry](https://img.shields.io/badge/MCP_Registry-com.aioproductos%2Fmcp-4b5563)](https://registry.modelcontextprotocol.io/v0/servers?search=com.aioproductos)

Connect your [AIOProductOS](https://aioproductos.com) workspace to Claude Code and work your whole product from chat — feedback, revenue, tasks, releases, analytics, and code activity joined on one customer record.

One install gives you:

- **The workspace connection** — the AIOProductOS remote MCP server: **65 tools over the product spine**, and it doesn't just read. It's a fully autonomous PM surface — read the spine _and_ write to it across the whole strategy-to-delivery ladder: capture and vote on ideas, promote them into features, set initiatives and objectives & key results, plan sprints and releases, run experiments, log decisions, write pages, and create/update/delete tasks — plus post to team channels, capture insights, and merge/unmerge people. OAuth sign-in, no API keys.
- **`/aioproductos:triage`** — Monday-morning product triage: surfaces the top 3 customer-evidenced insights, scores them transparently from real revenue and usage, and (after you confirm) creates the tasks, assigns a named AI teammate, and schedules them into the next sprint.
- **The `aioproductos-triage` skill** — the full triage doctrine, available whenever you ask "what should we work on next?"

## What you can do

**Read the spine** — customer 360, product brain, weekly signal memo, roadmap drift; analytics: NPS, NRR, funnels, retention, path analysis; list ideas, initiatives, tasks, features, objectives, sprints, releases, pages, experiments, insights, conversations, channels, bookings, identity merges, codebase map.

**Write to the spine** — no jumping back to the web UI:

- **Discovery** — capture ideas, vote on them, promote an idea into a feature
- **Strategy** — create/update initiatives, objectives and key results, decisions, experiments
- **Roadmap** — create/update features, releases, pages
- **Delivery** — create/update tasks, comment, delete tasks, create/update sprints
- **Customers & comms** — capture insights, post to channels, merge/unmerge end users
- **AI artifacts** — review artifacts, revert to a prior version

Everything is scoped to your organization and your role's permissions, and writes go through the same guardrails as the app.

## Install

```
/plugin marketplace add AIOProductOS/claude-plugin
/plugin install aioproductos@aioproductos
```

On first use, the AIOProductOS connector will prompt you to sign in with your workspace account and approve access. All data is scoped to your organization and your role's permissions.

## Requirements

An AIOProductOS workspace ([aioproductos.com](https://aioproductos.com)). New organizations get a 14-day onboarding runway on their own data, and every plan carries a 30-day money-back guarantee. Your AI usage is never metered — flat plans, no credit meters.

## What the triage looks like

```
This week's triage — top 3 (evidence-backed). Confirm before I create them.

# | Insight (source)              | Proposed task            | Score
--+-------------------------------+--------------------------+------
1 | "Need SAML" — 3 accts, $4.2k  | SSO/SAML for enterprise  | 2.4
2 | Onboarding drop 38% (funnel)  | Shorten signup form      | 240
3 | Churned acct cited exports    | CSV export on reports    | 4.0

Want me to create, assign (Ada · Backend AI), and schedule all 3 into Sprint W27?
```

Every number traces to a record on the spine — accounts, MRR, funnel steps — not a planning-poker vibe. Effort stays a human call, and nothing is written until you confirm.

## Other ways to connect

- **Any MCP host:** custom connector URL `https://platform.aioproductos.com/api/mcp`
- **CLI/stdio:** `npx @aioproductoscom/mcp`
- Docs: [aioproductos.com/mcp](https://aioproductos.com/mcp)

## Support

Questions, feedback, feature requests: [office@aioproductos.com](mailto:office@aioproductos.com) — a human founder answers every email.

## License

MIT — see [LICENSE](./LICENSE). The plugin is free; it drives a paid AIOProductOS workspace.
