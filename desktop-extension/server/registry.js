// The remote MCP tool registry. Each tool is a thin, declarative wrapper over an
// existing token-authed REST endpoint (/api/me/* or /api/pm/*), so there is ZERO
// business-logic duplication — the MCP route forwards the caller's bearer token to
// the same endpoint the stdio MCP already uses. Adding a tool = one entry here.
//
// SAFETY: this surface is read-heavy by design. It exposes the FULL product
// read surface — board, insights backlog, features, OKRs, experiments, releases,
// sprints, Pages, the codebase map, support inbox, team channels, bookings, plus
// the revenue-weighted analytics — and a SAFE write set (tasks + capture_insight).
// Customer-facing / multiplayer writes (replying to a support visitor, cancelling
// or rescheduling a guest's booking, posting to a Comms channel) are deliberately
// omitted: they can be triggered by anyone tagging the agent, so they need tighter
// guardrails before they ship here. Their token-authed endpoints exist
// (/api/me/comms POST, /api/me/scheduling POST) — wiring them is an opt-in.
import { APP_HTML } from "./generated/apps.js";
/** MUST be this exact type or hosts won't treat the resource as an app (SEP-1865). */
export const APP_MIME_TYPE = "text/html;profile=mcp-app";
/** Extension id for MCP Apps capability negotiation. */
export const UI_EXTENSION_ID = "io.modelcontextprotocol/ui";
const appUri = (key) => `ui://aioproductos/${key}`;
export const MCP_APPS = [
    {
        uri: appUri("board"),
        name: "Board",
        description: "The org's task board, live: columns by status, tasks ranked by priority. Changing a task's status writes straight back through update_task.",
        html: APP_HTML.board,
        csp: {},
        prefersBorder: false,
    },
    {
        uri: appUri("memo"),
        name: "Weekly Signal Memo",
        description: "This week's customer signal clustered into themes with the evidence count behind each. Any theme can be turned into a linked, high-priority task in one click.",
        html: APP_HTML.memo,
        csp: {},
        prefersBorder: false,
    },
    {
        uri: appUri("funnel"),
        name: "Revenue-Weighted Funnel",
        description: "Conversion by step with the live MRR standing behind each one — the join between product events and subscriptions that only exists on one spine.",
        html: APP_HTML.funnel,
        csp: {},
        prefersBorder: false,
    },
];
export const MCP_APPS_BY_URI = Object.fromEntries(MCP_APPS.map((a) => [a.uri, a]));
/**
 * The `_meta` a tool carries in tools/list when it has an app. Both keys are
 * emitted deliberately: `ui.resourceUri` is the current spec, `ui/resourceUri`
 * is the deprecated flat key older hosts still read. Cheap insurance against a
 * host that hasn't updated yet.
 */
export function uiMetaFor(tool) {
    if (!tool.appUri)
        return undefined;
    return { ui: { resourceUri: tool.appUri }, "ui/resourceUri": tool.appUri };
}
// Reads are the default; the four writes carry these explicitly. Nothing is
// destructive. openWorldHint=false everywhere — every tool is scoped to the
// caller's own org, never an external/open domain.
const READ_ONLY = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
/** A write that creates a NEW record each call (create_task, comment, capture_insight). */
const WRITE_CREATE = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};
/** A write that sets fields to a target state (update_task) — same args, same result. */
const WRITE_UPDATE = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
/** A permanent, irreversible delete (delete_task). Cascades to the record's children. */
const WRITE_DELETE = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
};
/** Every tool surfaces hints in tools/list; reads inherit the READ_ONLY default. */
export function annotationsFor(t) {
    return t.annotations ?? READ_ONLY;
}
const str = (v) => typeof v === "string" && v.length > 0 ? v : undefined;
const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
function qs(params) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
        if (v !== undefined)
            p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
}
const obj = (properties, required = []) => ({
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
});
const s = (description) => ({ type: "string", description });
const n = (description) => ({ type: "number", description });
const PLAYBOOK = `You manage product work on AIOProductOS for the connected member — board, insights, features, support, and analytics all hang off ONE customer-record spine.

How to operate:
- Ground first. Call get_product_brain before reasoning about the product; it returns revenue + top accounts, web + product analytics, features, recent verbatim signals, and open work. Go deeper with the dedicated reads: list_insights (full voice-of-customer backlog), list_ideas (votable idea backlog), list_features, list_initiatives + list_objectives (the strategy ladder + live progress), list_experiments, list_releases, list_sprints, list_pages/get_page (docs + PRDs), get_codebase_map.
- Prioritise on evidence — affected accounts + MRR + reach — never an invented score. The revenue is on the same record as the behaviour and the feedback; use it (analyze_nps and analyze_nrr are revenue-weighted; get_customer_360 joins money + people + voice for one account).
- Keep work tied to the spine end to end: idea → feature (promote_idea), and line-of-sight objective → initiative → feature → task → outcome. Insights are the evidence behind it. Resolve names to ids with pm_meta / list_initiatives before create/update; never guess an id.
- Confirm what you changed in plain language, and claim only writes you actually made.`;
export const MCP_TOOLS = [
    {
        name: "get_pm_playbook",
        title: "PM Playbook",
        examples: [{ description: "How should I operate before planning the roadmap?", arguments: {} }],
        kind: "static",
        description: "How to operate as a product manager on AIOProductOS. No arguments and no side effects — returns the same operating guide as plain text every call (deterministic): how to ground in the product brain, keep work welded to the spine (insight→feature→task→outcome), prioritise on evidence (affected accounts + MRR + reach), and what 'done' means. Call it FIRST, before planning or prioritising, to load the house rules the other tools assume.",
        inputSchema: obj({}),
        run: () => PLAYBOOK,
    },
    {
        name: "whoami",
        title: "Connected Identity",
        examples: [{ description: "Which AIOProductOS org, member, and products am I connected to?", arguments: {} }],
        kind: "rest",
        description: "Show the connected AIOProductOS identity (org, member) AND the org's products (id, name, is_primary). Read-only; returns the identity plus the product list. For a multi-product org, call this first to get the product ids, then pass one as `product_id` to any product-scoped tool; omit product_id to use the primary.",
        inputSchema: obj({}),
        rest: () => ({ method: "GET", path: "/api/me" }),
    },
    {
        name: "pm_meta",
        title: "PM Metadata",
        examples: [{ description: "List the lists, statuses, members, and features so I can resolve names to ids.", arguments: {} }],
        kind: "rest",
        description: "List the org's PM lists, statuses, members, and features as id+name pairs. Read-only; returns arrays for resolution only (list_features carries the richer catalogue). Call it to turn a name into an id before create_task / update_task — never guess an id.",
        inputSchema: obj({}),
        rest: () => ({ method: "GET", path: "/api/pm/meta" }),
    },
    {
        name: "get_product_brain",
        title: "Product Brain Snapshot",
        examples: [{ description: "Give me a grounded snapshot of the product before I reason about it.", arguments: {} }],
        kind: "rest",
        description: "A grounded snapshot of the org's product so YOU can reason about it. Returns one JSON object with: revenue + top paying accounts (ranked by MRR), web + product analytics headline metrics, the feature list, recent verbatim customer signals (newest first), and open-work counts — each block empty when that source isn't flowing yet. The time-windowed sections (revenue, cost, web + product analytics, feature usage) honour `window` (7 | 30 | 90 days, default 30). Single call, no pagination. Start here to ground, then go deeper with the dedicated list_* reads and the analytics tools. Optional product_id (the org's primary product when omitted).",
        inputSchema: obj({
            product_id: s("Product id, from whoami (optional; the org's primary product when omitted)."),
            window: { type: "number", enum: [7, 30, 90], default: 30, description: "Time window in days for the revenue, cost, and analytics sections (optional; 7, 30, or 90; default 30)." },
        }),
        rest: (a) => ({ method: "GET", path: `/api/me/brain${qs({ product_id: str(a.product_id), window: num(a.window) ?? str(a.window) })}` }),
    },
    {
        name: "get_weekly_signal_memo",
        title: "Weekly Signal Memo",
        examples: [{ description: "What changed in customer signal this week?", arguments: {} }],
        kind: "rest",
        description: "The Weekly Product Signal Memo — the last 7 days of customer signal clustered into themes (insights grouped by feature, ranked by the revenue behind them) with verbatim quotes, week-over-week deltas (new / repeated / stronger / weaker), concluded experiments, and shipped releases. Deterministic — every count is off real rows, no fabricated quotes. Optional `week` (ISO 'YYYY-Www') for a past week; `generate=1` rebuilds + persists the current week now. Read-only apart from that rebuild; returns the persisted memo, empty when the requested week has none. Open a weekly review with it, then drill into a theme with list_insights.",
        inputSchema: obj({
            week: s("ISO week to fetch, format 'YYYY-Www' e.g. '2026-W27' (optional; the latest persisted week when omitted)."),
            generate: s("Pass '1' to rebuild and persist the current week's memo now instead of reading the stored one (optional)."),
        }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/weekly-signal${qs({ week: str(a.week), generate: str(a.generate) })}`,
        }),
        appUri: appUri("memo"),
    },
    {
        name: "get_roadmap_drift",
        title: "Roadmap Drift",
        examples: [{ description: "How badly are we drifting from the roadmap this quarter?", arguments: { window: "quarter" } }],
        kind: "rest",
        description: "Planned vs shipped features over a window: a drift score (0-100, 100 = perfect alignment), counts (planned / shipped / on-time / slipped / unplanned / orphaned), median slip days, and the top slipped + unplanned ships. Deterministic, no LLM cost. window = week | month | quarter (default quarter); optional product_id. Read-only; returns the drift report, zeroed when nothing was planned or shipped in the window. Use it in planning reviews to check delivery against the roadmap, then open the slipped features with list_features.",
        inputSchema: obj({
            window: { type: "string", enum: ["week", "month", "quarter"], default: "quarter", description: "Lookback window to compare planned vs shipped over (optional; default quarter)." },
            product_id: s("Product id, from whoami (optional; spans all the org's products when omitted)."),
        }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/roadmap-drift${qs({ window: str(a.window), product_id: str(a.product_id) })}`,
        }),
    },
    {
        name: "get_customer_360",
        title: "Customer 360",
        examples: [{ description: "Show me everything about the Acme account.", arguments: { query: "acme.com" } }],
        kind: "rest",
        description: "Everything about ONE customer, resolved by id, email, domain, or company name: profile, subscription + MRR, how many users sit under the account, and their verbatim feedback. Read-only; returns the matched account, or an empty result when nothing matches the query. The money + people + voice join on one record — call it before answering anything about a specific account.",
        inputSchema: obj({ query: s("The account to resolve: an account id, a user's email, a company domain (e.g. 'acme.com'), or a company name.") }, ["query"]),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/customer${qs({ q: str(a.query) })}`,
        }),
    },
    {
        name: "analyze_nps",
        title: "NPS (revenue-weighted)",
        examples: [{ description: "What's our NPS over the last quarter, weighted by revenue?", arguments: { window_days: 90 } }],
        kind: "rest",
        description: "NPS for the product: the standard −100…100 score AND revenue-weighted NPS (each respondent weighted by their account MRR), plus detractor accounts ranked by MRR-at-risk (highest first). Surfaces when your biggest customers are the unhappy ones even if the headline looks fine. Computed deterministically off survey responses inside `window_days` (default 90, valid 1–365); returns an empty result when none fall in the window. product_id optional (primary product when omitted). Quantify sentiment after get_product_brain, then dig into a detractor with get_customer_360.",
        inputSchema: obj({ product_id: s("Product id, from whoami (optional; the org's primary product when omitted)."), window_days: { ...n("Lookback window in days (optional; default 90, i.e. the last quarter)."), default: 90, minimum: 1 } }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/nps${qs({ product_id: str(a.product_id), window_days: num(a.window_days) })}`,
        }),
    },
    {
        name: "analyze_nrr",
        title: "Net Revenue Retention",
        examples: [{ description: "How does revenue retention compare to logo retention this quarter?", arguments: { window_days: 90 } }],
        kind: "rest",
        description: "Net Revenue Retention (revenue-weighted) next to logo retention (count-weighted), the expansion/contraction/churn split, and the accounts that lost the most MRR (ranked, highest loss first). The divergence is the point: '92% of logos but 78% of revenue' means a big account churned. Computed deterministically off subscription movements inside `window_days` (default 90, valid 1–365); empty when none fall in the window. Quantify revenue health, then follow the top-losing accounts into get_customer_360.",
        inputSchema: obj({ window_days: { ...n("Lookback window in days (optional; default 90, i.e. the last quarter)."), default: 90, minimum: 1 } }),
        rest: (a) => ({ method: "GET", path: `/api/me/nrr${qs({ window_days: num(a.window_days) })}` }),
    },
    {
        name: "analyze_funnel",
        title: "Conversion Funnel",
        examples: [{ description: "Build the signup → activation → paid funnel.", arguments: { steps: ["signup", "activated", "subscribed"] } }],
        kind: "rest",
        description: "Build a conversion funnel from the product's own events: distinct users per step, step-to-step conversion %, and drop-off, evaluated in the exact order you pass. Needs product-analytics events flowing; returns empty counts when none match. Pass `steps` as an ordered list of 2+ event names — call it with NO steps first to get the menu of available event names rather than guessing them. Optional product_id and window_days (default 30, valid 1–365). Pairs with analyze_paths to see where the drop-offs go.",
        inputSchema: obj({
            steps: { type: "array", items: { type: "string" }, description: "Ordered list of 2+ event names forming the funnel; omit to get the menu of available event names first." },
            product_id: s("Product id, from whoami (optional; the org's primary product when omitted)."),
            window_days: { ...n("Lookback window in days (optional; default 30)."), default: 30, minimum: 1 },
        }),
        rest: (a) => {
            const steps = Array.isArray(a.steps) ? a.steps.filter((x) => typeof x === "string") : [];
            const parts = [];
            for (const st of steps)
                parts.push(`step=${encodeURIComponent(st)}`);
            if (str(a.product_id))
                parts.push(`product_id=${encodeURIComponent(str(a.product_id))}`);
            if (num(a.window_days) !== undefined)
                parts.push(`window=${num(a.window_days)}`);
            return { method: "GET", path: `/api/me/funnel${parts.length ? `?${parts.join("&")}` : ""}` };
        },
        appUri: appUri("funnel"),
    },
    {
        name: "get_retention",
        title: "Cohort Retention",
        examples: [{ description: "Show weekly retention cohorts for the last 8 weeks.", arguments: { window_days: 56 } }],
        kind: "rest",
        description: "Weekly cohort retention for the product: users grouped by first-seen week (one row per cohort, newest last), with the share still active each subsequent week — a lower-triangular grid. Needs product-analytics events flowing; returns empty cohorts when the product has none. window_days default 56 = 8 weekly cohorts (min 7; roughly one extra cohort per added 7 days). product_id optional (primary product when omitted).",
        inputSchema: obj({ product_id: s("Product id, from whoami (optional; the org's primary product when omitted)."), window_days: { ...n("Lookback window in days (optional; default 56 = 8 weekly cohorts)."), default: 56, minimum: 7 } }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/retention${qs({ product_id: str(a.product_id), window: num(a.window_days) })}`,
        }),
    },
    {
        name: "analyze_paths",
        title: "User Path Flow",
        examples: [{ description: "What do users do right after they sign up?", arguments: { start: "signup" } }],
        kind: "rest",
        description: "Trace what users do AFTER a start event — the journey flow (Sankey) from the product's own events. Returns the next-step transitions ranked by user count (most common first), empty when no events match. Pass `start` to anchor on an event, or omit for the most common start (call analyze_funnel with no steps to list the event names). Optional product_id and window_days (default 30, valid 1–365).",
        inputSchema: obj({ start: s("Event name to anchor the flow on (optional; the most common start event when omitted — analyze_funnel with no steps lists the event names)."), product_id: s("Product id, from whoami (optional; the org's primary product when omitted)."), window_days: n("Lookback window in days (optional; default 30).") }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/paths${qs({ start: str(a.start), product_id: str(a.product_id), window: num(a.window_days) })}`,
        }),
    },
    {
        name: "list_tasks",
        title: "List Tasks",
        examples: [{ description: "Show the tasks on the board.", arguments: {} }],
        kind: "rest",
        description: "List the org's board tasks and return the matches with their status, priority, assignees, and any linked feature/insight/sprint. Optionally narrow by status_id or list_id — resolve either via pm_meta. Read-only; returns an empty list when nothing matches. Use it to find a task id before get_task, update_task, or comment_on_task.",
        inputSchema: obj({ status_id: s("Only tasks in this status; resolve the id via pm_meta (optional)."), list_id: s("Only tasks on this list; resolve the id via pm_meta (optional).") }),
        rest: (a) => ({
            method: "GET",
            path: `/api/pm/tasks${qs({ status_id: str(a.status_id), list_id: str(a.list_id) })}`,
        }),
        appUri: appUri("board"),
    },
    {
        name: "get_task",
        title: "Get Task",
        examples: [{ description: "Open this task with its comments and assignees.", arguments: { id: "task_8f3a" } }],
        kind: "rest",
        description: "Get one task by id and return it with its full comments and assignees. Read-only. Resolve the id first with list_tasks — never guess it; pair with update_task or comment_on_task to act on what you read.",
        inputSchema: obj({ id: s("Task id, from list_tasks.") }, ["id"]),
        rest: (a) => ({ method: "GET", path: `/api/pm/tasks/${encodeURIComponent(str(a.id) ?? "")}` }),
    },
    {
        name: "create_task",
        title: "Create Task",
        examples: [{ description: "Create a high-priority task and link it to a feature.", arguments: { title: "Fix SSO redirect loop", priority: "high", feature_id: "feat_sso" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create a task and return the created task. list_id defaults to the org's first list when omitted; feature_id / insight_id link it to the spine and sprint_id schedules it into a sprint. Resolve list/status/feature/insight/member ids via pm_meta and sprint_id via list_sprints — never guess them. Only title is required.",
        inputSchema: obj({
            title: s("Task title (the only required field)."),
            description: s("Task body / details (optional)."),
            priority: { type: "string", enum: ["urgent", "high", "normal", "low"], description: "Priority level, urgent highest (optional)." },
            list_id: s("List to create the task on; resolve the id via pm_meta (optional; the org's first list when omitted)."),
            status_id: s("Initial status; resolve the id via pm_meta (optional)."),
            feature_id: s("Feature id to link on the spine, from pm_meta or list_features (optional)."),
            insight_id: s("Insight id to link on the spine, from list_insights (optional)."),
            sprint_id: s("Schedule into a sprint (optional; resolve the id via list_sprints)."),
            assignee_member_ids: { type: "array", items: { type: "string" }, description: "Member ids to assign, from pm_meta (optional)." },
        }, ["title"]),
        rest: (a) => ({ method: "POST", path: "/api/pm/tasks", body: a }),
    },
    {
        name: "create_feature",
        title: "Create Feature",
        examples: [{ description: "Add a feature to the roadmap.", arguments: { name: "SAML SSO" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create a feature on the product spine and return it (id, key, name, status). The key is generated from the name; status starts 'active'. product_id defaults to the org's primary product when omitted (pass one from whoami for a multi-product org). Only name is required — create a feature here before linking tasks to it with create_task.",
        inputSchema: obj({
            name: s("Feature name (the only required field), e.g. 'SAML SSO'."),
            description: s("What the feature is / why it matters (optional)."),
            product_id: s("Product to create it under, from whoami (optional; the org's primary product when omitted)."),
            initiative_id: s("Initiative to align this feature under for line-of-sight, from list_initiatives (optional)."),
            objective_id: s("Objective (goal) to align this feature under directly when there's no intermediate initiative, from list_objectives (optional)."),
        }, ["name"]),
        rest: (a) => ({ method: "POST", path: "/api/me/features", body: a }),
    },
    {
        name: "create_objective",
        title: "Create Objective (OKR)",
        examples: [{ description: "Set a Q3 objective with a key result.", arguments: { name: "Reach $50k MRR", period: "Q3 2026", key_results: [{ name: "MRR", target_value: 50000, unit: "USD" }] } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create an objective, optionally with key results, and return it. period is free text (e.g. 'Q3 2026'); product_id and parent_id (a parent objective) are optional and verified in-org. Each key result takes name + optional unit / start_value / target_value. Only name is required.",
        inputSchema: obj({
            name: s("Objective name (the only required field), e.g. 'Reach $50k MRR'."),
            description: s("Context for the objective (optional)."),
            period: s("Free-text period, e.g. 'Q3 2026' (optional)."),
            product_id: s("Product to scope it to, from whoami (optional)."),
            parent_id: s("Parent objective id to nest under, from list_objectives (optional)."),
            key_results: {
                type: "array",
                description: "Key results to attach (optional; up to 10).",
                items: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Key result name, e.g. 'MRR'." },
                        unit: { type: "string", description: "Unit, e.g. 'USD' or '%' (optional)." },
                        start_value: { type: "number", description: "Starting value (optional; default 0)." },
                        target_value: { type: "number", description: "Target value (optional)." },
                    },
                    required: ["name"],
                },
            },
        }, ["name"]),
        rest: (a) => ({ method: "POST", path: "/api/me/objectives", body: a }),
    },
    {
        name: "create_sprint",
        title: "Create Sprint",
        examples: [{ description: "Start a two-week sprint.", arguments: { name: "Sprint 12", goal: "Ship SSO", state: "active" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create a sprint and return it (id, name, goal, state, dates). state is 'future' (default) or 'active'; start_date / end_date are optional ISO 8601. Only name is required. Schedule tasks into it by passing the returned sprint id as sprint_id on create_task / update_task.",
        inputSchema: obj({
            name: s("Sprint name (the only required field), e.g. 'Sprint 12'."),
            goal: s("The sprint goal (optional)."),
            state: { type: "string", enum: ["future", "active"], description: "Lifecycle state (optional; default 'future')." },
            start_date: s("Start, ISO 8601 e.g. '2026-07-15T00:00:00Z' (optional)."),
            end_date: s("End, ISO 8601 (optional)."),
        }, ["name"]),
        rest: (a) => ({ method: "POST", path: "/api/me/sprints", body: a }),
    },
    {
        name: "create_page",
        title: "Create Page",
        examples: [{ description: "Draft a PRD as a Page.", arguments: { title: "PRD: SSO", body: "Problem\n\nUsers can't self-serve SAML today." } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create a Page (in-product doc / PRD on the spine) and return it (id, title). `body` is plain text — blank-line-separated blocks become paragraphs; omit it for a blank page. title defaults to 'Untitled'. product_id / parent_id (a parent page) are optional and verified in-org.",
        inputSchema: obj({
            title: s("Page title (optional; 'Untitled' when omitted)."),
            body: s("Page content as plain text; blank lines separate paragraphs (optional)."),
            icon: s("An emoji icon for the page (optional)."),
            product_id: s("Product to scope it to, from whoami (optional)."),
            parent_id: s("Parent page id to nest under, from list_pages (optional)."),
        }, []),
        rest: (a) => ({ method: "POST", path: "/api/me/pages", body: a }),
    },
    {
        name: "update_feature",
        title: "Update Feature",
        examples: [{ description: "Mark a feature shipped.", arguments: { id: "feat_123", mark_shipped: true } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update a feature and return it; omitted fields are unchanged. status is 'active' | 'discovered' | 'archived' (there is NO 'shipped' status — set mark_shipped:true to stamp its ship date instead). target_date is 'YYYY-MM-DD' (or null to clear). Resolve the id via list_features; only id is required.",
        inputSchema: obj({
            id: s("Feature id to update, from list_features (required)."),
            name: s("New name (optional)."),
            description: s("New description; null clears it (optional)."),
            status: { type: "string", enum: ["active", "discovered", "archived"], description: "Lifecycle status (optional)." },
            target_date: s("Target ship date 'YYYY-MM-DD', or null to clear (optional)."),
            mark_shipped: { type: "boolean", description: "true stamps the ship date now; false clears it (optional)." },
            initiative_id: s("Align under this initiative (line-of-sight), from list_initiatives; null unlinks (optional)."),
            objective_id: s("Align directly under this objective, from list_objectives; null unlinks (optional)."),
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: "/api/me/features", body: a }),
    },
    {
        name: "update_objective",
        title: "Update Objective",
        examples: [{ description: "Rename an objective.", arguments: { id: "obj_123", name: "Reach $75k MRR" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update an objective's name / description / period and return it; omitted fields are unchanged (null clears description or period). Resolve the id via list_objectives; only id is required. To move a key result's value use update_key_result.",
        inputSchema: obj({
            id: s("Objective id, from list_objectives (required)."),
            name: s("New name (optional)."),
            description: s("New description; null clears it (optional)."),
            period: s("New period, e.g. 'Q4 2026'; null clears it (optional)."),
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: "/api/me/objectives", body: a }),
    },
    {
        name: "update_key_result",
        title: "Update Key Result",
        examples: [{ description: "Log KR progress.", arguments: { id: "kr_123", current_value: 42000 } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update a key result — most often to move current_value as progress lands — and return it; omitted fields are unchanged. Resolve the id via list_objectives (each objective carries its key_results with ids). Only id is required.",
        inputSchema: obj({
            id: s("Key result id, from list_objectives (required)."),
            current_value: n("New current value (optional)."),
            target_value: n("New target value; null clears it (optional)."),
            start_value: n("New starting baseline (optional)."),
            name: s("New name (optional)."),
            unit: s("New unit, e.g. 'USD'; null clears it (optional)."),
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: "/api/me/key-results", body: a }),
    },
    {
        name: "update_sprint",
        title: "Update Sprint",
        examples: [{ description: "Close a sprint.", arguments: { id: "spr_123", state: "closed" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update a sprint and return it. state is 'future' | 'active' | 'closed' — moving to 'closed' stamps the completion time, reopening clears it. start_date / end_date are ISO 8601 (or null to clear). Resolve the id via list_sprints; only id is required.",
        inputSchema: obj({
            id: s("Sprint id, from list_sprints (required)."),
            name: s("New name (optional)."),
            goal: s("New goal; null clears it (optional)."),
            state: { type: "string", enum: ["future", "active", "closed"], description: "Lifecycle state; 'closed' completes it (optional)." },
            start_date: s("Start, ISO 8601, or null (optional)."),
            end_date: s("End, ISO 8601, or null (optional)."),
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: "/api/me/sprints", body: a }),
    },
    {
        name: "update_page",
        title: "Update Page",
        examples: [{ description: "Archive a page.", arguments: { id: "page_123", archived: true } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update a Page — rename, set icon, replace the body, or archive/unarchive (archived:true hides it, false restores it). `body` is plain text (blank lines → paragraphs) and REPLACES the page content. Omitted fields are unchanged. Resolve the id via list_pages; only id is required.",
        inputSchema: obj({
            id: s("Page id, from list_pages (required)."),
            title: s("New title (optional)."),
            icon: s("New emoji icon; null clears it (optional)."),
            body: s("New content as plain text; blank lines separate paragraphs. REPLACES existing content (optional)."),
            archived: { type: "boolean", description: "true archives (hides) the page; false restores it (optional)." },
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: "/api/me/pages", body: a }),
    },
    {
        name: "list_initiatives",
        title: "List Initiatives",
        examples: [{ description: "Show the strategic initiatives and what rolls up to each.", arguments: {} }],
        kind: "rest",
        description: "List the org's initiatives — the strategic layer between goals and features (goal → initiative → feature → epic → release). Each returns its name, status, timeframe, the objective it rolls up to (if any), and its linked-feature count. Read-only; empty when none. Resolve an initiative id here before create_feature / update_feature (initiative_id) or update_initiative.",
        inputSchema: obj({ product_id: s("Only initiatives for this product, from whoami (optional; all products when omitted).") }),
        rest: (a) => ({ method: "GET", path: `/api/me/initiatives${qs({ product_id: str(a.product_id) })}` }),
    },
    {
        name: "create_initiative",
        title: "Create Initiative",
        examples: [{ description: "Add an initiative under a goal.", arguments: { name: "Win enterprise", objective_id: "obj_123", timeframe: "H2 2026" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create an initiative — a strategic effort that groups features and rolls up to a goal — and return it. Link it to a goal with objective_id (from list_objectives) to build line-of-sight. status ∈ planned|active|paused|done|abandoned (default planned); timeframe is free text ('H2 2026'). product_id defaults to the primary product. Only name is required. Then align features to it via create_feature / update_feature (initiative_id).",
        inputSchema: obj({
            name: s("Initiative name (the only required field), e.g. 'Win enterprise'."),
            description: s("What the initiative is / why it matters (optional)."),
            objective_id: s("Goal this rolls up to, from list_objectives (optional; builds line-of-sight)."),
            status: { type: "string", enum: ["planned", "active", "paused", "done", "abandoned"], description: "Lifecycle status (optional; default 'planned')." },
            timeframe: s("Free-text timeframe, e.g. 'Q3 2026' or 'H2 2026' (optional)."),
            product_id: s("Product to scope it to, from whoami (optional; the primary product when omitted)."),
        }, ["name"]),
        rest: (a) => ({ method: "POST", path: "/api/me/initiatives", body: a }),
    },
    {
        name: "update_initiative",
        title: "Update Initiative",
        examples: [{ description: "Move an initiative to active.", arguments: { id: "init_123", status: "active" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update an initiative and return it; omitted fields are unchanged. Re-point it to a different goal with objective_id (null unlinks). status ∈ planned|active|paused|done|abandoned. Resolve the id via list_initiatives; only id is required.",
        inputSchema: obj({
            id: s("Initiative id, from list_initiatives (required)."),
            name: s("New name (optional)."),
            description: s("New description; null clears it (optional)."),
            objective_id: s("New parent goal, from list_objectives; null unlinks (optional)."),
            status: { type: "string", enum: ["planned", "active", "paused", "done", "abandoned"], description: "Lifecycle status (optional)." },
            timeframe: s("New timeframe; null clears it (optional)."),
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: `/api/me/initiatives/${encodeURIComponent(str(a.id) ?? "")}`, body: a }),
    },
    {
        name: "list_ideas",
        title: "List Ideas",
        examples: [{ description: "What are the top-voted ideas?", arguments: {} }],
        kind: "rest",
        description: "List the org's ideas — the native, votable idea backlog — ranked by vote count (highest first). Each returns its title, status, vote count, author, and the feature it was promoted to (if any). status ∈ new|under_review|planned|promoted|declined (optional filter). Read-only; empty when none. Ideas are distinct from insights: an idea is a proposal a team votes on; an insight is a piece of customer evidence. Resolve an idea id here before update_idea / vote_idea / promote_idea.",
        inputSchema: obj({
            status: { type: "string", enum: ["new", "under_review", "planned", "promoted", "declined"], description: "Filter by status (optional)." },
            product_id: s("Only ideas for this product, from whoami (optional)."),
        }),
        rest: (a) => ({ method: "GET", path: `/api/me/ideas${qs({ status: str(a.status), product_id: str(a.product_id) })}` }),
    },
    {
        name: "create_idea",
        title: "Create Idea",
        examples: [{ description: "Capture an idea born from customer feedback.", arguments: { title: "Bulk-edit tasks", body: "Several accounts asked to change status on many tasks at once." } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create an idea in the backlog and return it (starts with 0 votes, status 'new'). Link the evidence it came from with insight_id (from list_insights). product_id defaults to the primary product. Only title is required. Grow it with vote_idea, then promote_idea turns the winner into a roadmap feature.",
        inputSchema: obj({
            title: s("Idea title (the only required field), e.g. 'Bulk-edit tasks'."),
            body: s("The idea in more detail (optional)."),
            insight_id: s("Customer insight this idea came from, from list_insights (optional; welds evidence to the idea)."),
            product_id: s("Product to scope it to, from whoami (optional; the primary product when omitted)."),
        }, ["title"]),
        rest: (a) => ({ method: "POST", path: "/api/me/ideas", body: a }),
    },
    {
        name: "update_idea",
        title: "Update Idea",
        examples: [{ description: "Move an idea under review.", arguments: { id: "idea_123", status: "under_review" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update an idea's title / body / status and return it; omitted fields unchanged. status ∈ new|under_review|planned|promoted|declined (set 'promoted' via promote_idea instead, so a feature is actually created). Resolve the id via list_ideas; only id is required.",
        inputSchema: obj({
            id: s("Idea id, from list_ideas (required)."),
            title: s("New title (optional)."),
            body: s("New body; null clears it (optional)."),
            status: { type: "string", enum: ["new", "under_review", "planned", "promoted", "declined"], description: "New status (optional; prefer promote_idea over setting 'promoted' by hand)." },
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: `/api/me/ideas/${encodeURIComponent(str(a.id) ?? "")}`, body: a }),
    },
    {
        name: "vote_idea",
        title: "Vote on Idea",
        examples: [{ description: "Upvote an idea.", arguments: { id: "idea_123" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Cast (or remove) the connected member's vote on an idea and return the new vote state. Adds your vote by default; pass remove:true to take it back. One vote per member — voting twice is a no-op. Resolve the id via list_ideas; only id is required.",
        inputSchema: obj({
            id: s("Idea id, from list_ideas (required)."),
            remove: { type: "boolean", description: "true removes your vote instead of adding it (optional; default false)." },
        }, ["id"]),
        rest: (a) => ({
            method: a.remove === true ? "DELETE" : "POST",
            path: `/api/me/ideas/${encodeURIComponent(str(a.id) ?? "")}/vote`,
        }),
    },
    {
        name: "promote_idea",
        title: "Promote Idea to Feature",
        examples: [{ description: "Turn the top idea into a roadmap feature.", arguments: { id: "idea_123" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Promote an idea into a roadmap feature: creates a feature from the idea (name + description), stamps the idea 'promoted' and links it to the new feature, and returns the feature id. Idempotent — an already-promoted idea returns its existing feature. Resolve the id via list_ideas; only id is required. Align the new feature to an initiative/goal afterwards with update_feature.",
        inputSchema: obj({
            id: s("Idea id to promote, from list_ideas (required)."),
            product_id: s("Product to create the feature under, from whoami (optional; the idea's product or the primary when omitted)."),
        }, ["id"]),
        rest: (a) => ({
            method: "POST",
            path: `/api/me/ideas/${encodeURIComponent(str(a.id) ?? "")}/promote`,
            body: a,
        }),
    },
    {
        name: "create_release",
        title: "Create Release",
        examples: [{ description: "Log a shipped release.", arguments: { version: "v2.4.0", changelog: "SSO + faster board", released_at: "2026-07-15T00:00:00Z" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create a release and return it (id, version, changelog, released_at). Omit released_at for an unreleased/draft entry. product_id defaults to the org's primary product. Only version is required.",
        inputSchema: obj({
            version: s("Version string (required), e.g. 'v2.4.0'."),
            changelog: s("What shipped (optional)."),
            released_at: s("Ship time, ISO 8601 (optional; omit for a draft)."),
            product_id: s("Product, from whoami (optional; the primary product when omitted)."),
        }, ["version"]),
        rest: (a) => ({ method: "POST", path: "/api/me/releases", body: a }),
    },
    {
        name: "update_release",
        title: "Update Release",
        examples: [{ description: "Mark a release shipped.", arguments: { id: "rel_123", released_at: "2026-07-15T12:00:00Z" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update a release and return it; omitted fields unchanged. Set released_at to ship it (or null to move it back to draft). Resolve the id via list_releases; only id is required.",
        inputSchema: obj({
            id: s("Release id, from list_releases (required)."),
            version: s("New version (optional)."),
            changelog: s("New changelog; null clears it (optional)."),
            released_at: s("Ship time ISO 8601, or null for draft (optional)."),
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: "/api/me/releases", body: a }),
    },
    {
        name: "create_experiment",
        title: "Create Experiment",
        examples: [{ description: "Start a hypothesis.", arguments: { title: "Shorter onboarding lifts activation", metric: "activation rate", target: "+5pp" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Create a PM experiment (a Build-Measure-Learn hypothesis) and return it. state is 'hypothesis' (default) | 'build' | 'measure' | 'learn'. Only title is required. This is the PM tracker list_experiments reads, not the analytics A/B engine.",
        inputSchema: obj({
            title: s("Experiment title / the hypothesis in a line (required)."),
            hypothesis: s("The full hypothesis (optional)."),
            metric: s("The metric it moves, e.g. 'activation rate' (optional)."),
            target: s("Target change, e.g. '+5pp' (optional)."),
            state: { type: "string", enum: ["hypothesis", "build", "measure", "learn"], description: "Build-Measure-Learn stage (optional; default 'hypothesis')." },
            product_id: s("Product, from whoami (optional)."),
        }, ["title"]),
        rest: (a) => ({ method: "POST", path: "/api/me/experiments", body: a }),
    },
    {
        name: "update_experiment",
        title: "Update Experiment",
        examples: [{ description: "Record the result.", arguments: { id: "exp_123", state: "learn", verdict: "validated", decision: "persevere" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update a PM experiment — advance its state and record the outcome — and return it. state ∈ hypothesis|build|measure|learn; verdict ∈ validated|invalidated; decision ∈ pivot|persevere. Resolve the id via list_experiments; only id is required.",
        inputSchema: obj({
            id: s("Experiment id, from list_experiments (required)."),
            title: s("New title (optional)."),
            hypothesis: s("New hypothesis; null clears it (optional)."),
            metric: s("New metric; null clears it (optional)."),
            target: s("New target; null clears it (optional)."),
            state: { type: "string", enum: ["hypothesis", "build", "measure", "learn"], description: "Build-Measure-Learn stage (optional)." },
            verdict: { type: "string", enum: ["validated", "invalidated"], description: "Outcome (optional)." },
            decision: { type: "string", enum: ["pivot", "persevere"], description: "What you'll do next (optional)." },
            result: s("Free-text result / what you learned; null clears it (optional)."),
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: "/api/me/experiments", body: a }),
    },
    {
        name: "list_decisions",
        title: "List Decisions",
        examples: [{ description: "What have we decided recently?", arguments: {} }],
        kind: "rest",
        description: "List the org's logged decisions — title, rationale, status, and any linked feature/release/objective — newest first. Returns an empty list when none. Optional status filter (decided | proposed | revisit). Resolve a decision id here before update_decision.",
        inputSchema: obj({
            status: { type: "string", enum: ["decided", "proposed", "revisit"], description: "Filter by status (optional)." },
        }),
        rest: (a) => ({ method: "GET", path: `/api/me/decisions${qs({ status: str(a.status) })}` }),
    },
    {
        name: "create_decision",
        title: "Log Decision",
        examples: [{ description: "Record a decision linked to a feature.", arguments: { title: "Ship SSO before mobile", rationale: "Enterprise deals need it", link_type: "feature", link_id: "feat_123" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Log a decision and return it. status is 'decided' (default) | 'proposed' | 'revisit'; a 'decided' one stamps the decision time. Optionally weld it to a feature / release / objective via link_type + link_id (verified in-org). Only title is required.",
        inputSchema: obj({
            title: s("The decision in a line (required)."),
            rationale: s("Why — the reasoning (optional)."),
            status: { type: "string", enum: ["decided", "proposed", "revisit"], description: "Decision status (optional; default 'decided')." },
            link_type: { type: "string", enum: ["feature", "release", "objective"], description: "What it's linked to (optional; pair with link_id)." },
            link_id: s("Id of the linked feature/release/objective, from list_features / list_releases / list_objectives (optional)."),
        }, ["title"]),
        rest: (a) => ({ method: "POST", path: "/api/me/decisions", body: a }),
    },
    {
        name: "update_decision",
        title: "Update Decision",
        examples: [{ description: "Revisit a decision.", arguments: { id: "dec_123", status: "revisit" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update a decision and return it; omitted fields unchanged. Moving status to 'decided' re-stamps the decision time. Re-link via link_type + link_id (verified in-org), or clear with nulls. Resolve the id via list_decisions; only id is required.",
        inputSchema: obj({
            id: s("Decision id, from list_decisions (required)."),
            title: s("New title (optional)."),
            rationale: s("New rationale; null clears it (optional)."),
            status: { type: "string", enum: ["decided", "proposed", "revisit"], description: "New status (optional)." },
            link_type: { type: "string", enum: ["feature", "release", "objective"], description: "New link target (optional)." },
            link_id: s("New linked id, or null to unlink (optional)."),
        }, ["id"]),
        rest: (a) => ({ method: "PATCH", path: "/api/me/decisions", body: a }),
    },
    {
        name: "delete_task",
        title: "Delete Task",
        examples: [{ description: "Permanently delete a task.", arguments: { id: "task_123" } }],
        kind: "rest",
        annotations: WRITE_DELETE,
        description: "PERMANENTLY delete a task and return the deleted id. Irreversible — there is no undo. Cascades: the task's comments, assignees, tags, attachments, time entries, outcomes, events, relations, and its SUBTASKS are deleted with it; experiment/insight/meeting links to it are cleared. Resolve the id via list_tasks and confirm intent first — prefer update_task (e.g. move it to a done/archived status) when you only want it off the active board.",
        inputSchema: obj({ id: s("Task id to permanently delete, from list_tasks (required).") }, ["id"]),
        rest: (a) => ({ method: "DELETE", path: `/api/pm/tasks/${encodeURIComponent(String(a.id))}` }),
    },
    {
        name: "post_to_channel",
        title: "Post to Channel",
        examples: [{ description: "Post an update to a team channel.", arguments: { channel_id: "chan_123", body: "Shipped SSO — closing the epic." } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Post a message to a team Comms channel you belong to, as the connected member, and return the posted message. It appears live for teammates and is org-visible — keep it work-relevant. Resolve channel_id via list_channels; you can only post to channels you're a member of. Both channel_id and body are required.",
        inputSchema: obj({
            channel_id: s("Channel id to post into, from list_channels (required)."),
            body: s("Message text, visible to all channel members (required)."),
        }, ["channel_id", "body"]),
        rest: (a) => ({ method: "POST", path: "/api/me/comms", body: { action: "post", channel_id: a.channel_id, body: a.body } }),
    },
    {
        name: "reply_in_channel",
        title: "Reply in Channel Thread",
        examples: [{ description: "Reply in a thread under a teammate's message.", arguments: { channel_id: "chan_123", parent_id: "msg_9", body: "On it — PR up in an hour." } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Reply in a thread under a specific message in a Comms channel you belong to, as the connected member, and return the posted reply — org-visible to the channel. Resolve channel_id via list_channels and the parent message's id via read_channel. channel_id, parent_id, and body are all required.",
        inputSchema: obj({
            channel_id: s("Channel id, from list_channels (required)."),
            parent_id: s("Parent message id to thread under, from read_channel (required)."),
            body: s("Reply text, visible to all channel members (required)."),
        }, ["channel_id", "parent_id", "body"]),
        rest: (a) => ({ method: "POST", path: "/api/me/comms", body: { action: "reply", channel_id: a.channel_id, parent_id: a.parent_id, body: a.body } }),
    },
    {
        name: "reply_to_conversation",
        title: "Reply to Support Conversation",
        examples: [{ description: "Send a public reply to a support conversation.", arguments: { conversation_id: "conv_42", body: "Thanks for flagging — the export bug is fixed and live." } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Send a public reply to a support-inbox conversation, as the connected member, and return the result — it goes to the end-user on the conversation's channel. A write. Resolve conversation_id via list_conversations; read the thread with get_conversation before replying. conversation_id and body are required. For an internal-only note use add_note; to close it use resolve_conversation.",
        inputSchema: obj({
            conversation_id: s("Conversation id to reply to, from list_conversations (required)."),
            body: s("Public reply text sent to the end-user (required)."),
        }, ["conversation_id", "body"]),
        rest: (a) => ({ method: "POST", path: "/api/me/inbox", body: { action: "reply", conversation_id: a.conversation_id, body: a.body } }),
    },
    {
        name: "add_note",
        title: "Add Internal Note",
        examples: [{ description: "Leave an internal note on a conversation for teammates.", arguments: { conversation_id: "conv_42", body: "Repro'd — linking to feat_sso." } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Add an INTERNAL note to a support conversation — visible only to your team, never sent to the end-user — and return the result. A write. Use it to record context or hand off; resolve conversation_id via list_conversations. conversation_id and body are required. For a public reply use reply_to_conversation instead.",
        inputSchema: obj({
            conversation_id: s("Conversation id to note on, from list_conversations (required)."),
            body: s("Internal note text, teammates-only (required)."),
        }, ["conversation_id", "body"]),
        rest: (a) => ({ method: "POST", path: "/api/me/inbox", body: { action: "note", conversation_id: a.conversation_id, body: a.body } }),
    },
    {
        name: "resolve_conversation",
        title: "Resolve Conversation",
        examples: [{ description: "Mark a support conversation resolved.", arguments: { conversation_id: "conv_42" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Mark a support-inbox conversation resolved (closed) and return the result. A write; idempotent — resolving an already-resolved conversation is a no-op. Resolve conversation_id via list_conversations first. Do it after you've replied and the ask is handled.",
        inputSchema: obj({ conversation_id: s("Conversation id to resolve, from list_conversations (required).") }, ["conversation_id"]),
        rest: (a) => ({ method: "POST", path: "/api/me/inbox", body: { action: "resolve", conversation_id: a.conversation_id } }),
    },
    {
        name: "cancel_booking",
        title: "Cancel Booking",
        examples: [{ description: "Cancel a scheduled call.", arguments: { booking_id: "book_7" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Cancel a scheduled booking (call/meeting) and return the result — the invitee is notified per the scheduling settings. A write. Resolve booking_id via list_bookings first; never guess it. To move it instead of cancelling, use reschedule_booking.",
        inputSchema: obj({ booking_id: s("Booking id to cancel, from list_bookings (required).") }, ["booking_id"]),
        rest: (a) => ({ method: "POST", path: "/api/me/scheduling", body: { action: "cancel", booking_id: a.booking_id } }),
    },
    {
        name: "reschedule_booking",
        title: "Reschedule Booking",
        examples: [{ description: "Move a call to a new start time.", arguments: { booking_id: "book_7", start: "2026-07-20T15:00:00Z" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Reschedule a booking to a new start time (ISO 8601) and return the result — the invitee is notified. A write. Resolve booking_id via list_bookings first. booking_id and start are required.",
        inputSchema: obj({
            booking_id: s("Booking id to move, from list_bookings (required)."),
            start: s("New start time, ISO 8601 (e.g. 2026-07-20T15:00:00Z) (required)."),
        }, ["booking_id", "start"]),
        rest: (a) => ({ method: "POST", path: "/api/me/scheduling", body: { action: "reschedule", booking_id: a.booking_id, start: a.start } }),
    },
    {
        name: "review_artifact",
        title: "PRD Review",
        examples: [
            { description: "Review this feature spec before I send it for sign-off.", arguments: { target_type: "feature", target_id: "feat_8f3a" } },
        ],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Agent-as-critic over a DRAFT artifact (a feature spec, experiment plan, or page): checks it against a baseline PM bar — clear problem/hypothesis, a measurable success metric, evidence cited, risks named, a rollout/experiment plan — and returns structured findings (section, severity, a CONCRETE suggested fix, and a verbatim evidence quote) plus a 0-100 score. A write: each call re-runs the review and persists it as a new version (see list_artifact_versions). Resolve target_id first — via pm_meta or list_features for a feature, list_experiments for an experiment, list_pages for a page. One small LLM call; use it before sending a draft for sign-off.",
        inputSchema: obj({
            target_id: s("Id of the feature/experiment/page to review — from pm_meta, list_features, list_experiments, or list_pages."),
            target_type: { type: "string", enum: ["feature", "experiment", "page"], description: "What kind of artifact target_id is: a feature (spec), an experiment (plan), or a page (doc/PRD)." },
            rubric_id: s("Score against a specific rubric; omit to use the org's default rubric (or the built-in baseline)."),
        }, ["target_id", "target_type"]),
        rest: (a) => ({ method: "POST", path: "/api/me/review-artifact", body: a }),
    },
    {
        name: "list_artifact_versions",
        title: "Artifact Versions",
        examples: [
            { description: "Show the review history for this feature.", arguments: { target_id: "feat_8f3a", target_type: "feature" } },
        ],
        kind: "rest",
        description: "Version history of an artifact's AI reviews (F5): every review run is a version with its score, model, cost, who/what generated it, and whether it's the current one. Read-only; returns the version list, empty when the artifact has never been reviewed. Use it to see how a feature/experiment/page's review changed over time and to pick the version_id to pass to revert_to_version. Takes the same target_id/target_type you'd pass to review_artifact.",
        inputSchema: obj({
            target_id: s("Id of the reviewed feature/experiment/page — the same id passed to review_artifact."),
            target_type: { type: "string", enum: ["feature", "experiment", "page"], description: "What kind of artifact target_id is: a feature (spec), an experiment (plan), or a page (doc/PRD)." },
        }, ["target_id", "target_type"]),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/artifact-versions${qs({ target_id: str(a.target_id), target_type: str(a.target_type) })}`,
        }),
    },
    {
        name: "revert_to_version",
        title: "Revert Artifact Version",
        examples: [
            { description: "The latest review is worse — revert to the previous one.", arguments: { version_id: "ver_8f3a", reason: "new review missed the metric finding" } },
        ],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Restore an earlier artifact version (F5) to current and return the now-current version: the existing current version is flipped to 'reverted' (kept for the learning signal) and the chosen version becomes current again. A write — not idempotent, since re-running reverts again. version_id is the version you want to RESTORE; get it from list_artifact_versions and never guess it. Optional reason is recorded.",
        inputSchema: obj({
            version_id: s("Id of the version to restore (make current), from list_artifact_versions."),
            reason: s("Why you're reverting (optional, recorded)."),
        }, ["version_id"]),
        rest: (a) => ({ method: "POST", path: "/api/me/revert-version", body: a }),
    },
    {
        name: "update_task",
        title: "Update Task",
        examples: [{ description: "Move this task to the In Progress status.", arguments: { id: "task_8f3a", status_id: "status_in_progress" } }, { description: "Schedule this task into the next sprint.", arguments: { id: "task_8f3a", sprint_id: "sprint_2026_w27" } }],
        kind: "rest",
        annotations: WRITE_UPDATE,
        description: "Update one or more of a task's fields and return the updated task; fields you omit are left unchanged (idempotent — re-sending the same values is a no-op). Pass sprint_id: null to remove the task from its sprint. Resolve ids first — the task via get_task/list_tasks, and status/feature/insight/sprint/member ids via pm_meta and the list_* reads — never guess them. Only id is required.",
        inputSchema: obj({
            id: s("Task id, from list_tasks or get_task."),
            title: s("New title (optional; omitted fields stay unchanged)."),
            description: s("New body / details (optional)."),
            priority: { type: "string", enum: ["urgent", "high", "normal", "low"], description: "New priority level, urgent highest (optional)." },
            status_id: s("New status; resolve the id via pm_meta (optional)."),
            feature_id: s("Feature id to link on the spine, from pm_meta or list_features (optional)."),
            insight_id: s("Insight id to link on the spine, from list_insights (optional)."),
            sprint_id: s("Move into a sprint, or null to remove (optional; resolve via list_sprints)."),
            assignee_member_ids: { type: "array", items: { type: "string" }, description: "Member ids to assign, from pm_meta (optional)." },
        }, ["id"]),
        rest: (a) => {
            const { id, ...body } = a;
            return { method: "PATCH", path: `/api/pm/tasks/${encodeURIComponent(str(id) ?? "")}`, body };
        },
    },
    {
        name: "comment_on_task",
        title: "Comment on Task",
        examples: [{ description: "Leave a progress note on this task.", arguments: { id: "task_8f3a", body: "Shipped behind a flag — verifying in production." } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Add a comment to a task, authored as the connected member, and return the created comment. Use to record progress, a decision, or a handoff — the comment is visible to the whole org, so keep it work-relevant. Resolve the task id first with get_task or list_tasks; both id and body are required.",
        inputSchema: obj({ id: s("Task id, from list_tasks or get_task."), body: s("Comment text; posted as the connected member and visible to the whole org.") }, ["id", "body"]),
        rest: (a) => ({
            method: "POST",
            path: `/api/pm/tasks/${encodeURIComponent(str(a.id) ?? "")}/comments`,
            body: { body: str(a.body) },
        }),
    },
    {
        name: "capture_insight",
        title: "Capture Insight",
        examples: [{ description: "Log a customer request against the account and feature it's about.", arguments: { body: "Two enterprise accounts asked for SAML this week.", kind: "opportunity", account_id: "acct_acme", feature_id: "feat_sso" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Write a piece of customer feedback to the spine (the agent's own hand, not just reading) and return the created insight. Fires the same insight.created webhook a manual capture does — a real side-effect, so only capture genuine signal. Resolve account_id via get_customer_360 and feature_id via list_features and tie them when known; kind='opportunity' marks a prioritisable ask. Only body is required.",
        inputSchema: obj({
            body: s("The verbatim feedback / insight text (the only required field)."),
            title: s("Short display title (optional)."),
            kind: { type: "string", enum: ["insight", "opportunity"], description: "'insight' = raw signal; 'opportunity' = a prioritisable ask (optional)." },
            product_id: s("Product id, from whoami (optional; the org's primary product when omitted)."),
            feature_id: s("Feature id to link on the spine, from list_features or pm_meta (optional)."),
            account_id: s("Account id it's about, from get_customer_360 (optional)."),
        }, ["body"]),
        rest: (a) => ({ method: "POST", path: "/api/me/insight", body: a }),
    },
    {
        name: "list_conversations",
        title: "List Support Conversations",
        examples: [{ description: "Show the open support inbox.", arguments: {} }],
        kind: "rest",
        description: "List support-chat conversations in the inbox (open + snoozed by default; pass status='all' to include closed). Read-only; returns the matching conversations, empty when the inbox is clear. Optional product_id to scope to one product; open a full thread with get_conversation.",
        inputSchema: obj({ product_id: s("Product id to scope to, from whoami (optional; spans all products when omitted)."), status: { type: "string", enum: ["all"], description: "Pass 'all' to include closed (optional)." } }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/inbox${qs({ product_id: str(a.product_id), status: str(a.status) })}`,
        }),
    },
    {
        name: "get_conversation",
        title: "Read Support Conversation",
        examples: [{ description: "Read the full thread for this conversation.", arguments: { conversation_id: "conv_42" } }],
        kind: "rest",
        description: "Read one support conversation: the visitor plus the full message thread, oldest first. Read-only. Resolve the conversation_id first with list_conversations — never guess it.",
        inputSchema: obj({ conversation_id: s("Conversation id, from list_conversations.") }, ["conversation_id"]),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/inbox${qs({ conversation_id: str(a.conversation_id) })}`,
        }),
    },
    {
        name: "list_insights",
        title: "Search Insights",
        examples: [{ description: "Find opportunities that mention SSO.", arguments: { q: "SSO", kind: "opportunity" } }],
        kind: "rest",
        description: "Search the captured insight backlog (voice of customer) — the read twin of capture_insight. Read-only; returns the matching insights newest first, empty when nothing matches. Filters: status, kind (insight|opportunity), feature_id, account_id, product_id, and free-text q over title+body; limit default 50, max 200. Use it to survey the evidence behind a feature or account before prioritising — resolve feature_id via list_features and account_id via get_customer_360.",
        inputSchema: obj({
            q: s("Free-text search over title + body (optional)."),
            status: s("Only insights in this workflow status (optional)."),
            kind: { type: "string", enum: ["insight", "opportunity"], description: "'insight' = raw signal; 'opportunity' = a prioritisable ask (optional)." },
            feature_id: s("Only insights linked to this feature; resolve the id via list_features or pm_meta (optional)."),
            account_id: s("Only insights about this account; resolve the id via get_customer_360 (optional)."),
            product_id: s("Product id to scope to, from whoami (optional; spans all products when omitted)."),
            limit: { ...n("Max rows to return (optional; default 50, max 200)."), default: 50, minimum: 1, maximum: 200 },
        }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/insights${qs({
                q: str(a.q),
                status: str(a.status),
                kind: str(a.kind),
                feature_id: str(a.feature_id),
                account_id: str(a.account_id),
                product_id: str(a.product_id),
                limit: num(a.limit),
            })}`,
        }),
    },
    {
        name: "list_features",
        title: "List Features",
        examples: [{ description: "Show the product's feature catalogue.", arguments: {} }],
        kind: "rest",
        description: "The product's feature catalogue with description, status, and when each was last touched — richer than pm_meta (which is just id+name for resolution). Read-only; returns the matching features, empty when none. Optional product_id and free-text q over name+key; use a feature id from here to link a task or insight on the spine.",
        inputSchema: obj({ q: s("Free-text search over feature name + key (optional)."), product_id: s("Product id to scope to, from whoami (optional; spans all products when omitted).") }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/features${qs({ q: str(a.q), product_id: str(a.product_id) })}`,
        }),
    },
    {
        name: "list_objectives",
        title: "List OKRs",
        examples: [{ description: "Show the objectives and key results with live progress.", arguments: {} }],
        kind: "rest",
        description: "List the org's OKRs. Returns an array of objectives, each with its key results and live progress (0..1 between start and target), so you can prioritise toward what the team is actually trying to move. Read-only; empty when none are set. Read it before prioritising — tie proposed tasks to the objective they move, and cite the live progress when arguing priority. Optional product_id, from whoami.",
        inputSchema: obj({ product_id: s("Product id to scope to, from whoami (optional; spans all products when omitted).") }),
        rest: (a) => ({ method: "GET", path: `/api/me/objectives${qs({ product_id: str(a.product_id) })}` }),
    },
    {
        name: "list_experiments",
        title: "List Experiments",
        examples: [{ description: "What experiments are running and what did they conclude?", arguments: { state: "running" } }],
        kind: "rest",
        description: "List product experiments. Returns an array where each experiment carries its hypothesis, the metric it moves, the target, its current state, and — once concluded — the verdict and the decision that came out. Read-only; empty when none match. Use it to see what's being tested before proposing new work, and cite a concluded verdict as evidence when you create_task or review_artifact. Optional product_id (from whoami) and state filter.",
        inputSchema: obj({ product_id: s("Product id to scope to, from whoami (optional; spans all products when omitted)."), state: s("Only experiments in this state, e.g. 'running' (optional).") }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/experiments${qs({ product_id: str(a.product_id), state: str(a.state) })}`,
        }),
    },
    {
        name: "list_releases",
        title: "List Releases",
        examples: [{ description: "What did we ship recently?", arguments: {} }],
        kind: "rest",
        description: "List shipped releases. Returns an array, newest first, where each release carries its version, changelog, and ship date. Read-only; empty when nothing has shipped. Use it to answer 'what did we ship recently?', to ground a changelog or launch summary in real ship dates, and to see what went out before reading get_roadmap_drift. Optional product_id, from whoami.",
        inputSchema: obj({ product_id: s("Product id to scope to, from whoami (optional; spans all products when omitted).") }),
        rest: (a) => ({ method: "GET", path: `/api/me/releases${qs({ product_id: str(a.product_id) })}` }),
    },
    {
        name: "list_pages",
        title: "List Pages",
        examples: [{ description: "List the docs and PRDs on the spine.", arguments: {} }],
        kind: "rest",
        description: "List the in-product docs / PRDs (Pages) on the spine. Returns an array of pages with title + id only — no content, so it stays cheap to scan. Read-only; empty when none exist. Use it to find the page id, then read the full content with get_page; pair with review_artifact (target_type 'page') to critique a draft PRD. Optional product_id, from whoami.",
        inputSchema: obj({ product_id: s("Product id to scope to, from whoami (optional; spans all products when omitted).") }),
        rest: (a) => ({ method: "GET", path: `/api/me/pages${qs({ product_id: str(a.product_id) })}` }),
    },
    {
        name: "get_page",
        title: "Read Page",
        examples: [{ description: "Read this PRD's full content.", arguments: { id: "page_12" } }],
        kind: "rest",
        description: "Read one Page (doc / PRD) by id and return its full content. Read-only. Resolve the id first with list_pages — never guess it.",
        inputSchema: obj({ id: s("Page id, from list_pages.") }, ["id"]),
        rest: (a) => ({ method: "GET", path: `/api/me/pages${qs({ id: str(a.id) })}` }),
    },
    {
        name: "get_codebase_map",
        title: "Codebase Map",
        examples: [{ description: "Where in the code does the billing logic live?", arguments: {} }],
        kind: "rest",
        description: "The auto-generated codebase brain map for one product: a plain-language summary, the module/node/edge counts, when the map was last generated, and the labels of the modules it found. Read-only; returns the latest generated map, empty when none has been generated for the product yet. Use it to ground 'where in the code does X live?' questions and to see how the codebase splits into modules before discussing architecture or scoping engineering work. Optional product_id, from whoami; omit for the org's primary product.",
        inputSchema: obj({ product_id: s("Product id, from whoami (optional; the org's primary product when omitted).") }),
        rest: (a) => ({ method: "GET", path: `/api/me/codebase${qs({ product_id: str(a.product_id) })}` }),
    },
    {
        name: "list_sprints",
        title: "List Sprints",
        examples: [{ description: "Show the active sprint and recent ones.", arguments: { state: "active" } }],
        kind: "rest",
        description: "Sprints — name, goal, state, and window, newest first. Read-only; returns the matching sprints, empty when none exist. See the delivery cadence (active + recent), and resolve a sprint_id here before scheduling a task via create_task / update_task. Optional state filter (e.g. 'active').",
        inputSchema: obj({ state: s("Filter by state, e.g. 'active' (optional).") }),
        rest: (a) => ({ method: "GET", path: `/api/me/sprints${qs({ state: str(a.state) })}` }),
    },
    {
        name: "list_channels",
        title: "List Comms Channels",
        examples: [{ description: "Which team channels do I belong to?", arguments: {} }],
        kind: "rest",
        description: "List the team Comms channels the connected member belongs to (membership-scoped). Read-only; returns the member's channels, empty when they belong to none. Call read_channel with a channel_id to read one.",
        inputSchema: obj({}),
        rest: () => ({ method: "GET", path: "/api/me/comms" }),
    },
    {
        name: "read_channel",
        title: "Read Comms Channel",
        examples: [{ description: "Show the recent messages in this channel.", arguments: { channel_id: "chan_eng", limit: 50 } }],
        kind: "rest",
        description: "Read a Comms channel's recent messages, newest included (the connected member must be a channel member). Read-only; returns the messages, empty when the channel is silent. Resolve channel_id first with list_channels — never guess it. Optional limit.",
        inputSchema: obj({ channel_id: s("Channel id, from list_channels."), limit: n("Max messages to return (optional).") }, ["channel_id"]),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/comms${qs({ channel_id: str(a.channel_id), limit: num(a.limit) })}`,
        }),
    },
    {
        name: "list_bookings",
        title: "List Bookings",
        examples: [{ description: "Show upcoming confirmed bookings.", arguments: {} }],
        kind: "rest",
        description: "Upcoming confirmed bookings on the org's scheduling. Read-only; returns the bookings, empty when none are scheduled. Pass include='all' for full history.",
        inputSchema: obj({ include: { type: "string", enum: ["all"], description: "Pass 'all' for history (optional)." } }),
        rest: (a) => ({ method: "GET", path: `/api/me/scheduling${qs({ include: str(a.include) })}` }),
    },
    // ---------------------------------------------------------------------------
    // Identity Resolution v2 — device-graph + end-user merge
    // ---------------------------------------------------------------------------
    {
        name: "get_device_candidates",
        title: "Device-Graph Identity Candidates",
        examples: [{ description: "Show end-users that share a device fingerprint.", arguments: {} }],
        kind: "rest",
        description: "Clusters of ≥2 end_users seen on the same device: 'anon_bridge' (high confidence — an anonymous visitor later identified) or 'device_shared' (low confidence — review only). Read-only; returns the candidate clusters, empty when none are found. Use it to find merge targets, then act with merge_end_users.",
        inputSchema: obj({}),
        rest: () => ({ method: "GET", path: "/api/me/identity" }),
    },
    {
        name: "list_identity_merges",
        title: "Identity Merge History",
        examples: [{ description: "Show recent end-user merges so I can undo the wrong one.", arguments: {} }],
        kind: "rest",
        description: "List the org's end-user merge history. Returns an array of merge events, newest first, where each carries its event id, kind (merge or unmerge), the target and source end-user ids, the reason, who ran it, when, and — for merges — whether it has already been reverted. Read-only; empty when no merges have ever run. Use it to audit identity changes and to find the event id to pass to unmerge_end_users (only un-reverted merges can be undone).",
        inputSchema: obj({ limit: { ...n("Max events to return (optional; default 50, max 200)."), default: 50, minimum: 1, maximum: 200 } }),
        rest: (a) => ({
            method: "GET",
            path: `/api/me/identity${qs({ view: "merges", limit: num(a.limit)?.toString() })}`,
        }),
    },
    {
        name: "merge_end_users",
        title: "Merge End-Users",
        examples: [{ description: "Merge two end-users that share a device into one.", arguments: { target_end_user_id: "eu_keep", source_end_user_ids: ["eu_discard"], reason: "device:anon_bridge" } }],
        kind: "rest",
        annotations: WRITE_CREATE,
        description: "Merge source end-users into a target and return the merge result, including the merge event id (also recoverable later via list_identity_merges): all FK rows (events, insights, tasks, …) are re-pointed onto the target and the sources are tombstoned. A write; reversible for 30 days via unmerge_end_users. Get the candidate ids from get_device_candidates first — never guess which users to fold together. target_end_user_id and source_end_user_ids are required.",
        inputSchema: obj({
            target_end_user_id: s("UUID of the end-user to keep, from get_device_candidates."),
            source_end_user_ids: { type: "array", items: { type: "string" }, description: "UUIDs of end-users to fold into the target, from get_device_candidates." },
            reason: s("Why the merge (optional, recorded)."),
        }, ["target_end_user_id", "source_end_user_ids"]),
        rest: (a) => ({
            method: "POST",
            path: "/api/me/identity",
            body: { action: "merge_end_users", target_end_user_id: str(a.target_end_user_id), source_end_user_ids: a.source_end_user_ids, reason: str(a.reason) },
        }),
    },
    {
        name: "unmerge_end_users",
        title: "Undo End-User Merge",
        examples: [{ description: "Undo a recent end-user merge.", arguments: { event_id: "uuid" } }],
        kind: "rest",
        // WRITE_UPDATE, not WRITE_CREATE: it restores a target state and re-running
        // is a no-op — the idempotentHint must agree with the description.
        annotations: WRITE_UPDATE,
        description: "Undo a previous end-user merge: reads the merge ledger and re-points every FK row (events, insights, tasks, …) back to its original end-user, un-tombstoning the folded-in sources. Safe to retry — a second undo of the same merge changes nothing (it fails with already_reverted). Use to correct a wrong identity merge (merges stay reversible for 30 days). Find the event_id with list_identity_merges (pick an un-reverted merge); event_id is required.",
        inputSchema: obj({ event_id: s("Id of the merge event to undo, from list_identity_merges.") }, ["event_id"]),
        rest: (a) => ({
            method: "POST",
            path: "/api/me/identity",
            body: { action: "unmerge_end_users", event_id: str(a.event_id) },
        }),
    },
];
export const MCP_TOOLS_BY_NAME = Object.fromEntries(MCP_TOOLS.map((t) => [t.name, t]));
