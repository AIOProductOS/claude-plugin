# AIOProductOS plugin for Claude Code

Connect your [AIOProductOS](https://aioproductos.com) workspace to Claude Code and work your whole product from chat — feedback, revenue, tasks, releases, analytics, and code activity joined on one customer record.

One install gives you:

- **The workspace connection** — the AIOProductOS remote MCP server (40 tools over the product spine: insights, tasks, sprints, releases, customer 360, funnels, retention, NRR, experiments, weekly signal memo, and more). OAuth sign-in, no API keys.
- **`/aioproductos:triage`** — Monday-morning product triage: surfaces the top 3 customer-evidenced insights, scores them transparently from real revenue and usage, and (after you confirm) creates the tasks, assigns a named AI teammate, and schedules them into the next sprint.
- **The `aioproductos-triage` skill** — the full triage doctrine, available whenever you ask "what should we work on next?"

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
