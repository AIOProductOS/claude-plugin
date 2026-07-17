#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PlatformClient } from "./client.js";
import { PM_PLAYBOOK, PM_SKILL_VERSION } from "./pm-skill.js";
import { checkForUpdate, updateBanner } from "./update-notifier.js";
const VERSION = "0.15.9";
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
function text(data) {
    const content = [
        { type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) },
    ];
    if (updateNotice && !updateNoticeShown) {
        updateNoticeShown = true;
        content.push({ type: "text", text: updateNotice });
    }
    return { content };
}
/** A prompt result — one user-role message the host injects when the slash
 *  command runs. Surfaces as a named slash command in the AI host. */
function promptMsg(body) {
    return { messages: [{ role: "user", content: { type: "text", text: body } }] };
}
const server = new McpServer({ name: "AIOProductOS", version: VERSION }, {
    instructions: "You manage product work on AIOProductOS for the connected member — board, insights, features, and " +
        "analytics all hang off one spine. Call get_pm_playbook first for how to operate: ground in " +
        "get_product_brain, keep work tied to the spine (insight→feature→task→outcome), and prioritize on " +
        "evidence (affected accounts + MRR + reach), never an invented score. Resolve names to ids with " +
        "pm_meta before create_task / update_task; never guess an id. Confirm what you changed in plain " +
        "language, and claim only writes you actually made.",
});
server.tool("whoami", "Show the connected AIOProductOS identity (org, member) and the org's products. Read-only; returns the identity plus the product list. For a multi-product org call this first to get product ids, then pass one as product_id to any product-scoped tool; omit product_id to use the primary.", {}, async () => text(await client.whoami()));
server.tool("get_pm_playbook", "How to operate as a product manager on AIOProductOS — ground in the brain, keep work tied to the spine (insight→feature→task→outcome), and prioritize on evidence (affected accounts + MRR + reach), never an invented score. Read this before planning or prioritizing.", {}, async () => text(`${PM_PLAYBOOK}\n\n— pm playbook v${PM_SKILL_VERSION}`));
server.tool("pm_meta", "List the org's PM lists, statuses, members, and features as id+name pairs. Read-only; returns arrays for name→id resolution. Call it before create_task / update_task to turn names into ids — never guess an id.", {}, async () => text(await client.meta()));
server.tool("list_tasks", "List the org's board tasks and return the matches with their status, priority, assignees, and any linked feature/insight. Read-only; returns an empty list when nothing matches. Optionally narrow by status_id or list_id (resolve either via pm_meta). Use it to find a task id before get_task, update_task, or comment_on_task.", {
    status_id: z.string().optional().describe("Filter by status id, from pm_meta."),
    list_id: z.string().optional().describe("Filter by list id, from pm_meta."),
}, async (a) => text(await client.listTasks(a)));
server.tool("get_task", "Get one task by id and return it with its full comments and assignees. Read-only. Resolve the id first with list_tasks — never guess it; pair with update_task or comment_on_task to act on what you read.", { id: z.string().describe("Task id, from list_tasks.") }, async (a) => text(await client.getTask(a.id)));
server.tool("create_task", "Create a task and return the created task. A write — each call creates a new task, so don't retry blindly. Omitting list_id uses the org's first list; feature_id / insight_id link it to the AIOProductOS spine. Resolve list/status/feature/insight/member ids via pm_meta first — never guess them. Only title is required.", {
    title: z.string().describe("Task title."),
    description: z.string().optional().describe("Task description (optional)."),
    priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Priority (optional)."),
    list_id: z.string().optional().describe("List id, from pm_meta (optional; defaults to the org's first list)."),
    status_id: z.string().optional().describe("Status id, from pm_meta (optional)."),
    feature_id: z.string().optional().describe("Link to a feature, id from pm_meta (optional)."),
    insight_id: z.string().optional().describe("Link to an insight (optional)."),
    assignee_member_ids: z.array(z.string()).optional().describe("Member ids to assign, from pm_meta (optional)."),
}, async (a) => text(await client.createTask(a)));
server.tool("create_feature", "Create a feature on the product spine and return it (id, key, name, status). The key is generated from the name; status starts 'active'. product_id defaults to the org's primary product when omitted — pass one from whoami for a multi-product org. Only name is required; create the feature before linking tasks to it with create_task.", {
    name: z.string().describe("Feature name (the only required field), e.g. 'SAML SSO'."),
    description: z.string().optional().describe("What the feature is / why it matters (optional)."),
    product_id: z.string().optional().describe("Product to create it under, from whoami (optional; the org's primary product when omitted)."),
    initiative_id: z.string().optional().describe("Initiative to align this feature under for line-of-sight, from list_initiatives (optional)."),
    objective_id: z.string().optional().describe("Objective (goal) to align this feature under directly when there's no intermediate initiative, from list_objectives (optional)."),
}, async (a) => text(await client.createFeature(a)));
server.tool("create_objective", "Create an objective (OKR), optionally with key results, and return it. period is free text (e.g. 'Q3 2026'); product_id and parent_id (a parent objective) are optional and verified in-org. Each key result takes name + optional unit / start_value / target_value. Only name is required.", {
    name: z.string().describe("Objective name (the only required field), e.g. 'Reach $50k MRR'."),
    description: z.string().optional().describe("Context for the objective (optional)."),
    period: z.string().optional().describe("Free-text period, e.g. 'Q3 2026' (optional)."),
    product_id: z.string().optional().describe("Product to scope it to, from whoami (optional)."),
    parent_id: z.string().optional().describe("Parent objective id to nest under (optional)."),
    key_results: z
        .array(z.object({
        name: z.string().describe("Key result name, e.g. 'MRR'."),
        unit: z.string().optional().describe("Unit, e.g. 'USD' or '%' (optional)."),
        start_value: z.number().optional().describe("Starting value (optional; default 0)."),
        target_value: z.number().optional().describe("Target value (optional)."),
    }))
        .optional()
        .describe("Key results to attach (optional; up to 10)."),
}, async (a) => text(await client.createObjective(a)));
server.tool("create_sprint", "Create a sprint and return it (id, name, goal, state, dates). state is 'future' (default) or 'active'; start_date / end_date are optional ISO 8601. Only name is required. Schedule tasks into it by passing the returned sprint id as sprint_id on create_task / update_task.", {
    name: z.string().describe("Sprint name (the only required field), e.g. 'Sprint 12'."),
    goal: z.string().optional().describe("The sprint goal (optional)."),
    state: z.enum(["future", "active"]).optional().describe("Lifecycle state (optional; default 'future')."),
    start_date: z.string().optional().describe("Start, ISO 8601 e.g. '2026-07-15T00:00:00Z' (optional)."),
    end_date: z.string().optional().describe("End, ISO 8601 (optional)."),
}, async (a) => text(await client.createSprint(a)));
server.tool("create_page", "Create a Page (in-product doc / PRD on the spine) and return it (id, title). `body` is plain text — blank-line-separated blocks become paragraphs; omit it for a blank page. title defaults to 'Untitled'. product_id / parent_id (a parent page) are optional and verified in-org.", {
    title: z.string().optional().describe("Page title (optional; 'Untitled' when omitted)."),
    body: z.string().optional().describe("Page content as plain text; blank lines separate paragraphs (optional)."),
    icon: z.string().optional().describe("An emoji icon for the page (optional)."),
    product_id: z.string().optional().describe("Product to scope it to, from whoami (optional)."),
    parent_id: z.string().optional().describe("Parent page id to nest under (optional)."),
}, async (a) => text(await client.createPage(a)));
server.tool("update_feature", "Update a feature and return it; omitted fields are unchanged. status is 'active' | 'discovered' | 'archived' (there is NO 'shipped' status — set mark_shipped:true to stamp its ship date instead). target_date is 'YYYY-MM-DD' (or null to clear). Resolve the id via list_features; only id is required.", {
    id: z.string().describe("Feature id to update, from list_features (required)."),
    name: z.string().optional().describe("New name (optional)."),
    description: z.string().nullable().optional().describe("New description; null clears it (optional)."),
    status: z.enum(["active", "discovered", "archived"]).optional().describe("Lifecycle status (optional)."),
    target_date: z.string().nullable().optional().describe("Target ship date 'YYYY-MM-DD', or null to clear (optional)."),
    mark_shipped: z.boolean().optional().describe("true stamps the ship date now; false clears it (optional)."),
    initiative_id: z.string().nullable().optional().describe("Align under this initiative (line-of-sight), from list_initiatives; null unlinks (optional)."),
    objective_id: z.string().nullable().optional().describe("Align directly under this objective, from list_objectives; null unlinks (optional)."),
}, async (a) => text(await client.updateFeature(a)));
server.tool("update_objective", "Update an objective's name / description / period and return it; omitted fields are unchanged (null clears description or period). Resolve the id via list_objectives; only id is required. To move a key result's value use update_key_result.", {
    id: z.string().describe("Objective id, from list_objectives (required)."),
    name: z.string().optional().describe("New name (optional)."),
    description: z.string().nullable().optional().describe("New description; null clears it (optional)."),
    period: z.string().nullable().optional().describe("New period, e.g. 'Q4 2026'; null clears it (optional)."),
}, async (a) => text(await client.updateObjective(a)));
server.tool("update_key_result", "Update a key result — most often to move current_value as progress lands — and return it; omitted fields are unchanged. Resolve the id via list_objectives (each objective carries its key_results with ids). Only id is required.", {
    id: z.string().describe("Key result id, from list_objectives (required)."),
    current_value: z.number().optional().describe("New current value (optional)."),
    target_value: z.number().nullable().optional().describe("New target value; null clears it (optional)."),
    start_value: z.number().optional().describe("New starting baseline (optional)."),
    name: z.string().optional().describe("New name (optional)."),
    unit: z.string().nullable().optional().describe("New unit, e.g. 'USD'; null clears it (optional)."),
}, async (a) => text(await client.updateKeyResult(a)));
server.tool("list_initiatives", "List the org's initiatives — the strategic layer between goals and features (goal → initiative → feature → epic → release). Each returns its name, status, timeframe, the objective it rolls up to (if any), and its linked-feature count. Read-only. Resolve an initiative id here before create_feature / update_feature (initiative_id) or update_initiative.", {
    product_id: z.string().optional().describe("Only initiatives for this product, from whoami (optional)."),
}, async (a) => text(await client.listInitiatives(a.product_id)));
server.tool("create_initiative", "Create an initiative — a strategic effort that groups features and rolls up to a goal — and return it. Link it to a goal with objective_id (from list_objectives) to build line-of-sight. status is planned|active|paused|done|abandoned (default planned); timeframe is free text ('H2 2026'). product_id defaults to the primary product. Only name is required. Then align features to it via create_feature / update_feature (initiative_id).", {
    name: z.string().describe("Initiative name (the only required field), e.g. 'Win enterprise'."),
    description: z.string().optional().describe("What the initiative is / why it matters (optional)."),
    objective_id: z.string().optional().describe("Goal this rolls up to, from list_objectives (optional; builds line-of-sight)."),
    status: z.enum(["planned", "active", "paused", "done", "abandoned"]).optional().describe("Lifecycle status (optional; default 'planned')."),
    timeframe: z.string().optional().describe("Free-text timeframe, e.g. 'Q3 2026' or 'H2 2026' (optional)."),
    product_id: z.string().optional().describe("Product to scope it to, from whoami (optional)."),
}, async (a) => text(await client.createInitiative(a)));
server.tool("update_initiative", "Update an initiative and return it; omitted fields are unchanged. Re-point it to a different goal with objective_id (null unlinks). status is planned|active|paused|done|abandoned. Resolve the id via list_initiatives; only id is required.", {
    id: z.string().describe("Initiative id, from list_initiatives (required)."),
    name: z.string().optional().describe("New name (optional)."),
    description: z.string().nullable().optional().describe("New description; null clears it (optional)."),
    objective_id: z.string().nullable().optional().describe("New parent goal, from list_objectives; null unlinks (optional)."),
    status: z.enum(["planned", "active", "paused", "done", "abandoned"]).optional().describe("Lifecycle status (optional)."),
    timeframe: z.string().nullable().optional().describe("New timeframe; null clears it (optional)."),
}, async (a) => text(await client.updateInitiative(a.id, a)));
server.tool("list_ideas", "List the org's ideas — the native, votable idea backlog — ranked by vote count (highest first). Each returns title, status, vote count, author, and the feature it was promoted to (if any). status is new|under_review|planned|promoted|declined (optional filter). Read-only. Ideas are distinct from insights: an idea is a proposal a team votes on; an insight is customer evidence. Resolve an idea id here before update_idea / vote_idea / promote_idea.", {
    status: z.enum(["new", "under_review", "planned", "promoted", "declined"]).optional().describe("Filter by status (optional)."),
    product_id: z.string().optional().describe("Only ideas for this product, from whoami (optional)."),
}, async (a) => text(await client.listIdeas({ status: a.status, productId: a.product_id })));
server.tool("create_idea", "Create an idea in the backlog and return it (starts with 0 votes, status 'new'). Link the evidence it came from with insight_id (from list_insights). product_id defaults to the primary product. Only title is required. Grow it with vote_idea, then promote_idea turns the winner into a roadmap feature.", {
    title: z.string().describe("Idea title (the only required field), e.g. 'Bulk-edit tasks'."),
    body: z.string().optional().describe("The idea in more detail (optional)."),
    insight_id: z.string().optional().describe("Customer insight this idea came from, from list_insights (optional; welds evidence to the idea)."),
    product_id: z.string().optional().describe("Product to scope it to, from whoami (optional)."),
}, async (a) => text(await client.createIdea(a)));
server.tool("update_idea", "Update an idea's title / body / status and return it; omitted fields unchanged. status is new|under_review|planned|promoted|declined (set 'promoted' via promote_idea instead, so a feature is actually created). Resolve the id via list_ideas; only id is required.", {
    id: z.string().describe("Idea id, from list_ideas (required)."),
    title: z.string().optional().describe("New title (optional)."),
    body: z.string().nullable().optional().describe("New body; null clears it (optional)."),
    status: z.enum(["new", "under_review", "planned", "promoted", "declined"]).optional().describe("New status (optional; prefer promote_idea over setting 'promoted' by hand)."),
}, async (a) => text(await client.updateIdea(a.id, a)));
server.tool("vote_idea", "Cast (or remove) the connected member's vote on an idea and return the new vote state. Adds your vote by default; pass remove:true to take it back. One vote per member — voting twice is a no-op. Resolve the id via list_ideas; only id is required.", {
    id: z.string().describe("Idea id, from list_ideas (required)."),
    remove: z.boolean().optional().describe("true removes your vote instead of adding it (optional; default false)."),
}, async (a) => text(await client.voteIdea(a.id, a.remove)));
server.tool("promote_idea", "Promote an idea into a roadmap feature: creates a feature from the idea (name + description), stamps the idea 'promoted' and links it to the new feature, and returns the feature id. Idempotent — an already-promoted idea returns its existing feature. Resolve the id via list_ideas; only id is required. Align the new feature to an initiative/goal afterwards with update_feature.", {
    id: z.string().describe("Idea id to promote, from list_ideas (required)."),
    product_id: z.string().optional().describe("Product to create the feature under, from whoami (optional)."),
}, async (a) => text(await client.promoteIdea(a.id, a)));
server.tool("update_sprint", "Update a sprint and return it. state is 'future' | 'active' | 'closed' — moving to 'closed' stamps the completion time, reopening clears it. start_date / end_date are ISO 8601 (or null to clear). Resolve the id via list_sprints; only id is required.", {
    id: z.string().describe("Sprint id, from list_sprints (required)."),
    name: z.string().optional().describe("New name (optional)."),
    goal: z.string().nullable().optional().describe("New goal; null clears it (optional)."),
    state: z.enum(["future", "active", "closed"]).optional().describe("Lifecycle state; 'closed' completes it (optional)."),
    start_date: z.string().nullable().optional().describe("Start, ISO 8601, or null (optional)."),
    end_date: z.string().nullable().optional().describe("End, ISO 8601, or null (optional)."),
}, async (a) => text(await client.updateSprint(a)));
server.tool("update_page", "Update a Page — rename, set icon, replace the body, or archive/unarchive (archived:true hides it, false restores it). `body` is plain text (blank lines → paragraphs) and REPLACES the page content. Omitted fields are unchanged. Resolve the id via list_pages; only id is required.", {
    id: z.string().describe("Page id, from list_pages (required)."),
    title: z.string().optional().describe("New title (optional)."),
    icon: z.string().nullable().optional().describe("New emoji icon; null clears it (optional)."),
    body: z.string().optional().describe("New content as plain text; blank lines separate paragraphs. REPLACES existing content (optional)."),
    archived: z.boolean().optional().describe("true archives (hides) the page; false restores it (optional)."),
}, async (a) => text(await client.updatePage(a)));
server.tool("create_release", "Create a release and return it (id, version, changelog, released_at). Omit released_at for an unreleased/draft entry. product_id defaults to the org's primary product. Only version is required.", {
    version: z.string().describe("Version string (required), e.g. 'v2.4.0'."),
    changelog: z.string().optional().describe("What shipped (optional)."),
    released_at: z.string().optional().describe("Ship time, ISO 8601 (optional; omit for a draft)."),
    product_id: z.string().optional().describe("Product, from whoami (optional; the primary product when omitted)."),
}, async (a) => text(await client.createRelease(a)));
server.tool("update_release", "Update a release and return it; omitted fields unchanged. Set released_at to ship it (or null to move it back to draft). Resolve the id via list_releases; only id is required.", {
    id: z.string().describe("Release id, from list_releases (required)."),
    version: z.string().optional().describe("New version (optional)."),
    changelog: z.string().nullable().optional().describe("New changelog; null clears it (optional)."),
    released_at: z.string().nullable().optional().describe("Ship time ISO 8601, or null for draft (optional)."),
}, async (a) => text(await client.updateRelease(a)));
server.tool("create_experiment", "Create a PM experiment (a Build-Measure-Learn hypothesis) and return it. state is 'hypothesis' (default) | 'build' | 'measure' | 'learn'. Only title is required. This is the PM hypothesis tracker list_experiments reads, not the analytics A/B engine.", {
    title: z.string().describe("Experiment title / the hypothesis in a line (required)."),
    hypothesis: z.string().optional().describe("The full hypothesis (optional)."),
    metric: z.string().optional().describe("The metric it moves, e.g. 'activation rate' (optional)."),
    target: z.string().optional().describe("Target change, e.g. '+5pp' (optional)."),
    state: z.enum(["hypothesis", "build", "measure", "learn"]).optional().describe("Build-Measure-Learn stage (optional; default 'hypothesis')."),
    product_id: z.string().optional().describe("Product, from whoami (optional)."),
}, async (a) => text(await client.createExperiment(a)));
server.tool("update_experiment", "Update a PM experiment — advance its state and record the outcome — and return it. state ∈ hypothesis|build|measure|learn; verdict ∈ validated|invalidated; decision ∈ pivot|persevere. Resolve the id via list_experiments; only id is required.", {
    id: z.string().describe("Experiment id, from list_experiments (required)."),
    title: z.string().optional().describe("New title (optional)."),
    hypothesis: z.string().nullable().optional().describe("New hypothesis; null clears it (optional)."),
    metric: z.string().nullable().optional().describe("New metric; null clears it (optional)."),
    target: z.string().nullable().optional().describe("New target; null clears it (optional)."),
    state: z.enum(["hypothesis", "build", "measure", "learn"]).optional().describe("Build-Measure-Learn stage (optional)."),
    verdict: z.enum(["validated", "invalidated"]).nullable().optional().describe("Outcome (optional)."),
    decision: z.enum(["pivot", "persevere"]).nullable().optional().describe("What you'll do next (optional)."),
    result: z.string().nullable().optional().describe("Free-text result / what you learned; null clears it (optional)."),
}, async (a) => text(await client.updateExperiment(a)));
server.tool("list_decisions", "List the org's logged decisions — title, rationale, status, and any linked feature/release/objective — newest first. Read-only; returns an empty list when none. Optional status filter (decided | proposed | revisit). Resolve a decision id here before update_decision.", {
    status: z.enum(["decided", "proposed", "revisit"]).optional().describe("Filter by status (optional)."),
}, async (a) => text(await client.listDecisions(a.status)));
server.tool("create_decision", "Log a decision and return it. status is 'decided' (default) | 'proposed' | 'revisit'; a 'decided' one stamps the decision time. Optionally weld it to a feature / release / objective via link_type + link_id (verified in-org). Only title is required.", {
    title: z.string().describe("The decision in a line (required)."),
    rationale: z.string().optional().describe("Why — the reasoning (optional)."),
    status: z.enum(["decided", "proposed", "revisit"]).optional().describe("Decision status (optional; default 'decided')."),
    link_type: z.enum(["feature", "release", "objective"]).optional().describe("What it's linked to (optional; pair with link_id)."),
    link_id: z.string().optional().describe("Id of the linked feature/release/objective, from list_features / list_releases / list_objectives (optional)."),
}, async (a) => text(await client.createDecision(a)));
server.tool("update_decision", "Update a decision and return it; omitted fields unchanged. Moving status to 'decided' re-stamps the decision time. Re-link via link_type + link_id (verified in-org), or clear with nulls. Resolve the id via list_decisions; only id is required.", {
    id: z.string().describe("Decision id, from list_decisions (required)."),
    title: z.string().optional().describe("New title (optional)."),
    rationale: z.string().nullable().optional().describe("New rationale; null clears it (optional)."),
    status: z.enum(["decided", "proposed", "revisit"]).optional().describe("New status (optional)."),
    link_type: z.enum(["feature", "release", "objective"]).nullable().optional().describe("New link target (optional)."),
    link_id: z.string().nullable().optional().describe("New linked id, or null to unlink (optional)."),
}, async (a) => text(await client.updateDecision(a)));
server.tool("update_task", "Update one or more of a task's fields and return the updated task; fields you omit are left unchanged (idempotent — re-sending the same values is a no-op), and passing null clears a nullable field. Resolve ids first — the task via list_tasks/get_task, and status/feature/insight/member ids via pm_meta — never guess them. Only id is required.", {
    id: z.string().describe("Task id, from list_tasks or get_task."),
    title: z.string().optional().describe("New title (optional)."),
    description: z.string().nullable().optional().describe("New description; null clears it (optional)."),
    priority: z.enum(["urgent", "high", "normal", "low"]).nullable().optional().describe("New priority; null clears it (optional)."),
    status_id: z.string().nullable().optional().describe("New status id, from pm_meta; null clears it (optional)."),
    feature_id: z.string().nullable().optional().describe("New feature id, from pm_meta; null unlinks (optional)."),
    insight_id: z.string().nullable().optional().describe("New insight id; null unlinks (optional)."),
    assignee_member_ids: z.array(z.string()).optional().describe("Member ids to assign, from pm_meta (optional)."),
}, async ({ id, ...body }) => text(await client.updateTask(id, body)));
server.tool("delete_task", "PERMANENTLY delete a task and return the deleted id. Irreversible — there is no undo. Cascades: the task's comments, assignees, tags, attachments, time entries, outcomes, events, relations, and its SUBTASKS are deleted with it; experiment/insight/meeting links to it are cleared. Resolve the id via list_tasks and confirm intent first — prefer update_task (move it to a done/archived status) when you only want it off the active board.", { id: z.string().describe("Task id to permanently delete, from list_tasks (required).") }, async (a) => text(await client.deleteTask(a.id)));
server.tool("comment_on_task", "Add a comment to a task, authored as the connected member, and return the created comment. Use to record progress, a decision, or a handoff — the comment is visible to the whole org, so keep it work-relevant. Resolve the task id first with list_tasks or get_task; both id and body are required.", {
    id: z.string().describe("Task id, from list_tasks or get_task."),
    body: z.string().describe("Comment body."),
}, async (a) => text(await client.comment(a.id, a.body)));
server.tool("get_product_brain", "Read a grounded, read-only snapshot of the org's product so YOU can reason about it on your own model: revenue + top paying accounts, web + product analytics, features, recent verbatim customer signals, and open work. Optional product_id; omit for the primary product. Returns the brain text plus the list of products you can ask about.", { product_id: z.string().optional().describe("Product id, from whoami (optional; primary by default).") }, async (a) => text(await client.brain(a.product_id)));
server.tool("get_customer_360", "Everything about ONE customer, resolved by id, email, domain, or company name: profile, subscription + MRR, how many users sit under the account, and their verbatim feedback (newest first). Read-only; returns the single best-matching account, or an empty result when nothing matches. The money + people + voice join on one record — use it before answering anything about a specific account.", { query: z.string().describe("The account to resolve — an account id (exact), a user's email (exact), a company domain like 'acme.com', or a company name (partial match). Pass one value; the strongest match wins.") }, async (a) => text(await client.customer360(a.query)));
server.tool("analyze_nps", "NPS for the product — standard score AND revenue-weighted NPS (each respondent weighted by their account MRR), plus the detractor accounts ranked by what they're worth, with verbatims. The revenue weighting is the spine join no standalone survey tool can compute: it surfaces when your biggest customers are the unhappy ones even if the headline score looks fine. Optional product_id (primary by default) and window_days (default 90).", {
    product_id: z.string().optional().describe("Product id, from whoami (optional; primary by default)."),
    window_days: z.number().optional().describe("Window in days (default 90)."),
}, async (a) => text(await client.nps({ productId: a.product_id, windowDays: a.window_days })));
server.tool("analyze_nrr", "Net Revenue Retention — NRR (revenue-weighted) next to logo retention (count-weighted), the expansion/contraction/churn split, and the accounts that lost the most MRR. The divergence is the point: \"you keep 92% of logos but 78% of revenue\" means a big account churned while the headline looks fine. NRR is the number investors ask for and no standalone analytics tool can compute — it needs revenue on the same record. Optional window_days (default 90). Returns status 'building' until enough daily MRR snapshots exist to compare.", { window_days: z.number().optional().describe("Window in days (default 90).") }, async (a) => text(await client.nrr(a.window_days)));
server.tool("capture_insight", "Write a piece of customer feedback to the spine (the agent's own hand, not just reading) and return the created insight. It fires the same insight.created webhook a manual capture does — a real side-effect, so only capture genuine signal. Tie it to the account it's about (account_id, via get_customer_360) and the feature it concerns (feature_id, via pm_meta) when you know them; kind='opportunity' for a prioritizable ask. Defaults to the primary product; only body is required.", {
    body: z.string().describe("The feedback / insight text."),
    title: z.string().optional().describe("Short title (optional)."),
    kind: z.enum(["insight", "opportunity"]).optional().describe("insight | opportunity (optional)."),
    product_id: z.string().optional().describe("Product id, from whoami (optional; primary by default)."),
    feature_id: z.string().optional().describe("Link to a feature, id from pm_meta (optional)."),
    account_id: z.string().optional().describe("Link to the account it's about, from get_customer_360 (optional)."),
}, async (a) => text(await client.captureInsight(a)));
server.tool("analyze_funnel", "Build a conversion funnel from the product's own events and reason over it on your model. Pass `steps` as an ordered list of event names (2+) to compute the funnel: distinct users per step, conversion, and drop-off. Omit `steps` to get the menu of available event names first. Optional product_id (defaults to the primary product) and window_days (default 30).", {
    steps: z.array(z.string()).optional().describe("Ordered event names (2+); omit to get the menu of event names first."),
    product_id: z.string().optional().describe("Product id, from whoami (optional; primary by default)."),
    window_days: z.number().optional().describe("Window in days (default 30)."),
}, async (a) => text(await client.funnel({ steps: a.steps, productId: a.product_id, window: a.window_days })));
server.tool("get_retention", "Weekly cohort retention for the product: users grouped by their first-seen week, with the share returning each week after. Read-only; needs product analytics events flowing, and returns empty cohorts when the product has none. Optional product_id (defaults to the primary product) and window_days (default 56 = 8 weekly cohorts).", {
    product_id: z.string().optional().describe("Product id, from whoami (optional; primary by default)."),
    window_days: z.number().optional().describe("Window in days (default 56 = 8 weekly cohorts)."),
}, async (a) => text(await client.retention({ productId: a.product_id, window: a.window_days })));
server.tool("analyze_paths", "Trace what users do AFTER a start event — the journey flow (Sankey) from the product's own events, so YOU can reason about real behaviour on your model. Returns nodes (the event at each depth, with distinct users + share of journeys) and links (source→target with how many users took that step), including where people drop off ('(exit)') and the collapsed long tail ('(other)'). Pass `start` to anchor on a specific event, or omit it to anchor on the most common journey start. Optional product_id (defaults to the primary product) and window_days (default 30).", {
    start: z.string().optional().describe("Anchor event name (optional; omit for the most common journey start)."),
    product_id: z.string().optional().describe("Product id, from whoami (optional; primary by default)."),
    window_days: z.number().optional().describe("Window in days (default 30)."),
}, async (a) => text(await client.paths({ start: a.start, productId: a.product_id, window: a.window_days })));
server.tool("list_conversations", "List support-chat conversations in the inbox (open + snoozed by default; pass status='all' to include closed). Read-only; returns each with id, visitor, topic, status, and last activity — empty when the inbox is clear. Optional product_id to scope to one product; open a full thread with get_conversation.", {
    product_id: z.string().optional().describe("Scope to one product, id from whoami (optional)."),
    status: z.enum(["all"]).optional().describe("Pass 'all' to include closed conversations (optional)."),
}, async (a) => text(await client.listConversations({ productId: a.product_id, status: a.status })));
server.tool("get_conversation", "Read one support conversation: the visitor + the full message thread (visitor, agent, and internal notes), oldest first. Read-only. Resolve the conversation_id first with list_conversations — never guess it; reply with reply_to_conversation or add_note.", { conversation_id: z.string().describe("Conversation id, from list_conversations.") }, async (a) => text(await client.getConversation(a.conversation_id)));
server.tool("reply_to_conversation", "Send a reply into a support conversation and return the sent message. This message IS VISIBLE TO THE VISITOR in the chat widget — it goes out as you (the member who owns this token), so use add_note instead for internal triage. Resolve the conversation_id first with list_conversations.", {
    conversation_id: z.string().describe("Conversation id, from list_conversations."),
    body: z.string().describe("Reply text the visitor will see."),
}, async (a) => text(await client.inboxAction({ action: "reply", conversation_id: a.conversation_id, body: a.body })));
server.tool("add_note", "Add an INTERNAL note to a support conversation and return the created note — visible only in the inbox, never to the visitor. Use to record triage, context, or a handoff for a human. Resolve the conversation_id first with list_conversations.", {
    conversation_id: z.string().describe("Conversation id, from list_conversations."),
    body: z.string().describe("Internal note text (never shown to the visitor)."),
}, async (a) => text(await client.inboxAction({ action: "note", conversation_id: a.conversation_id, body: a.body })));
server.tool("resolve_conversation", "Mark a support conversation resolved (status='closed') and return the updated status. Idempotent — resolving an already-closed conversation is a no-op, and a later visitor message reopens it. Resolve the conversation_id first with list_conversations.", { conversation_id: z.string().describe("Conversation id, from list_conversations.") }, async (a) => text(await client.inboxAction({ action: "resolve", conversation_id: a.conversation_id })));
server.tool("list_bookings", "List scheduled bookings (calls/meetings) — upcoming confirmed ones by default; pass include='all' for past + cancelled. Read-only; returns each with id, event type, guest, host, start/end, and status — empty when nothing is scheduled. Use a booking_id from here with cancel_booking or reschedule_booking.", { include: z.enum(["all"]).optional().describe("Pass 'all' for past + cancelled too (optional).") }, async (a) => text(await client.listBookings({ include: a.include })));
server.tool("cancel_booking", "Cancel a booking and return the updated booking — frees the slot and cancels the linked meeting, which affects the GUEST, so confirm intent before calling. Cannot cancel a meeting that has already started. Resolve the booking_id first with list_bookings.", { booking_id: z.string().describe("Booking id, from list_bookings.") }, async (a) => text(await client.schedulingAction({ action: "cancel", booking_id: a.booking_id })));
server.tool("reschedule_booking", "Move a booking to a new start time and return the updated booking — this changes the GUEST's meeting time, so confirm intent before calling. The new time must be a currently-open slot for that event type; cannot reschedule a meeting that has already started. Resolve the booking_id first with list_bookings.", {
    booking_id: z.string().describe("Booking id, from list_bookings."),
    start: z.string().describe("New start time, ISO 8601 (e.g. 2026-06-20T15:00:00Z); must be an open slot."),
}, async (a) => text(await client.schedulingAction({ action: "reschedule", booking_id: a.booking_id, start: a.start })));
server.tool("list_channels", "List the team Comms channels you (this token's member) belong to — id, name, kind, topic. Read-only; returns your channels, empty when you belong to none (an admin adds you in AIOProductOS → Comms). These are the channels you can read_channel and post_to_channel into.", {}, async () => text(await client.listChannels()));
server.tool("read_channel", "Read recent messages in a Comms channel you belong to, oldest→newest, so you can catch up before replying. Read-only; returns each message with its author, body, and timestamp — empty when the channel is silent. Resolve the channel_id first with list_channels — never guess it. Pass limit to cap how many of the most-recent messages come back; the server applies a default when it's omitted.", {
    channel_id: z.string().describe("Channel id, from list_channels."),
    limit: z.number().int().positive().optional().describe("Maximum number of most-recent messages to return (optional; the server applies a sensible default when omitted)."),
}, async (a) => text(await client.readChannel(a.channel_id, a.limit)));
server.tool("post_to_channel", "Post a message into a team Comms channel you belong to and return the posted message. It goes out as you (this token's member) and appears live for your teammates — use it to tell the team what you did, share a link, or ask a question. Resolve the channel_id first with list_channels; only works for channels you're a member of.", {
    channel_id: z.string().describe("Channel id, from list_channels."),
    body: z.string().describe("Message text, visible to all channel members."),
}, async (a) => text(await client.postToChannel(a.channel_id, a.body)));
server.tool("reply_in_channel", "Reply in a thread under a specific message in a Comms channel you belong to, and return the posted reply — it goes out as you, visible to the channel. Resolve channel_id via list_channels and the parent message's id via read_channel.", {
    channel_id: z.string().describe("Channel id, from list_channels."),
    parent_id: z.string().describe("Parent message id, from read_channel."),
    body: z.string().describe("Reply text, visible to all channel members."),
}, async (a) => text(await client.replyInChannel(a.channel_id, a.parent_id, a.body)));
// ── Read parity with the hosted connector ───────────────────────────────────
// The full catalogue + strategy ladder + docs + identity + artifact reads, so
// the stdio agent grounds on exactly what the hosted connector sees.
server.tool("list_features", "The product's feature catalogue with description, status, and when each was last touched — richer than pm_meta (id+name only). Read-only; empty when none. Optional product_id (from whoami) and free-text q over name+key. Use a feature id from here to link a task or insight on the spine.", {
    q: z.string().optional().describe("Free-text search over feature name + key (optional)."),
    product_id: z.string().optional().describe("Product id to scope to, from whoami (optional; spans all products when omitted)."),
}, async (a) => text(await client.listFeatures({ q: a.q, productId: a.product_id })));
server.tool("list_objectives", "List the org's OKRs — each objective with its key results and live progress (0..1 between start and target). Read-only; empty when none set. Read it before prioritising; tie proposed tasks to the objective they move and cite live progress when arguing priority. Optional product_id, from whoami.", { product_id: z.string().optional().describe("Product id to scope to, from whoami (optional; spans all products when omitted).") }, async (a) => text(await client.listObjectives(a.product_id)));
server.tool("list_experiments", "List the org's experiments with their state and linked feature. Read-only; empty when none. Optional product_id (from whoami) and state filter. Use an experiment id from here with review_artifact or list_artifact_versions.", {
    product_id: z.string().optional().describe("Product id to scope to, from whoami (optional; spans all products when omitted)."),
    state: z.string().optional().describe("Only experiments in this state (optional)."),
}, async (a) => text(await client.listExperiments({ productId: a.product_id, state: a.state })));
server.tool("list_releases", "List the org's releases (version, date, linked features). Read-only; empty when none. Optional product_id, from whoami. Use it to see what shipped and when, then open slipped work with list_features or get_roadmap_drift.", { product_id: z.string().optional().describe("Product id to scope to, from whoami (optional; spans all products when omitted).") }, async (a) => text(await client.listReleases(a.product_id)));
server.tool("list_sprints", "List the org's sprints with their state and dates. Read-only; empty when none. Optional state filter (e.g. active | planned | closed). Resolve a sprint id here before scheduling tasks into it via update_task / update_sprint.", { state: z.string().optional().describe("Only sprints in this state, e.g. active | planned | closed (optional).") }, async (a) => text(await client.listSprints(a.state)));
server.tool("list_pages", "List the org's Pages (docs / PRDs) with title and last-updated — id+title for resolution. Read-only; empty when none. Optional product_id, from whoami. Get one page's full content with get_page.", { product_id: z.string().optional().describe("Product id to scope to, from whoami (optional; spans all products when omitted).") }, async (a) => text(await client.listPages(a.product_id)));
server.tool("get_page", "Read one Page (doc / PRD) by id and return its full content. Read-only. Resolve the id first with list_pages — never guess it.", { id: z.string().describe("Page id, from list_pages.") }, async (a) => text(await client.getPage(a.id)));
server.tool("list_insights", "Search the captured insight backlog (voice of customer) — the read twin of capture_insight. Read-only; matching insights newest first, empty when nothing matches. Filters: status, kind (insight|opportunity), feature_id, account_id, product_id, free-text q over title+body; limit default 50, max 200. Survey the evidence behind a feature or account before prioritising.", {
    q: z.string().optional().describe("Free-text search over title + body (optional)."),
    status: z.string().optional().describe("Only insights in this workflow status (optional)."),
    kind: z.enum(["insight", "opportunity"]).optional().describe("'insight' = raw signal; 'opportunity' = a prioritisable ask (optional)."),
    feature_id: z.string().optional().describe("Only insights linked to this feature; id via list_features or pm_meta (optional)."),
    account_id: z.string().optional().describe("Only insights about this account; id via get_customer_360 (optional)."),
    product_id: z.string().optional().describe("Product id to scope to, from whoami (optional; spans all products when omitted)."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (optional; default 50, max 200)."),
}, async (a) => text(await client.listInsights({
    q: a.q,
    status: a.status,
    kind: a.kind,
    featureId: a.feature_id,
    accountId: a.account_id,
    productId: a.product_id,
    limit: a.limit,
})));
server.tool("get_roadmap_drift", "Planned vs shipped features over a window: a drift score (0-100, 100 = perfect alignment), counts (planned / shipped / on-time / slipped / unplanned / orphaned), median slip days, and the top slipped + unplanned ships. Deterministic, no LLM cost. window = week | month | quarter (default quarter); optional product_id. Read-only; zeroed when nothing was planned or shipped. Use it in planning reviews, then open slipped features with list_features.", {
    window: z.enum(["week", "month", "quarter"]).optional().describe("Lookback window to compare planned vs shipped (optional; default quarter)."),
    product_id: z.string().optional().describe("Product id, from whoami (optional; spans all the org's products when omitted)."),
}, async (a) => text(await client.roadmapDrift({ window: a.window, productId: a.product_id })));
server.tool("get_weekly_signal_memo", "The deterministic weekly signal memo — what moved on the spine this week (revenue, top accounts, fresh verbatim signal, shipped + slipped work). Read-only. Optional week (ISO week, e.g. 2026-W29; defaults to the current week); set generate=true to (re)compute it if this week's memo isn't cached yet.", {
    week: z.string().optional().describe("ISO week, e.g. '2026-W29' (optional; defaults to the current week)."),
    generate: z.boolean().optional().describe("Recompute the memo if it isn't cached yet (optional)."),
}, async (a) => text(await client.weeklySignalMemo({ week: a.week, generate: a.generate })));
server.tool("get_codebase_map", "The product's codebase map — modules and how they connect, with live spine pulses (recent deploys / activity). Read-only. Optional product_id, from whoami. Use it to ground engineering-adjacent questions in the actual code structure.", { product_id: z.string().optional().describe("Product id to scope to, from whoami (optional; spans all products when omitted).") }, async (a) => text(await client.codebaseMap(a.product_id)));
server.tool("list_artifact_versions", "List the immutable version history of one AI artifact (a feature spec, experiment plan, or page) — each version with its score and when it was written. Read-only. Resolve target_id via list_features / list_experiments / list_pages first. Pair with revert_to_version to roll one back, or review_artifact to add a new reviewed version.", {
    target_id: z.string().optional().describe("Id of the feature / experiment / page whose versions to list, from list_features / list_experiments / list_pages."),
    target_type: z.enum(["feature", "experiment", "page"]).optional().describe("What kind of artifact target_id is (optional)."),
}, async (a) => text(await client.listArtifactVersions({ targetId: a.target_id, targetType: a.target_type })));
server.tool("get_device_candidates", "Clusters of ≥2 end-users seen on the same device: 'anon_bridge' (high confidence — an anonymous visitor later identified) or 'device_shared' (low confidence — review only). Read-only; empty when none found. Use it to find merge targets, then act with merge_end_users.", {}, async () => text(await client.deviceCandidates()));
server.tool("list_identity_merges", "List the org's end-user merge history, newest first — each event with its id, kind (merge | unmerge), target + source ids, reason, who ran it, when, and whether a merge was already reverted. Read-only; empty when none have run. Use it to audit identity changes and find the event id for unmerge_end_users (only un-reverted merges can be undone).", { limit: z.number().int().min(1).max(200).optional().describe("Max events to return (optional; default 50, max 200).") }, async (a) => text(await client.listIdentityMerges(a.limit)));
server.tool("merge_end_users", "Merge source end-users into a target and return the result, including the merge event id (also in list_identity_merges): all FK rows (events, insights, tasks, …) re-point onto the target and the sources are tombstoned. A write; reversible for 30 days via unmerge_end_users. Get the candidate ids from get_device_candidates first — never guess which users to fold together.", {
    target_end_user_id: z.string().describe("UUID of the end-user to keep, from get_device_candidates."),
    source_end_user_ids: z.array(z.string()).describe("UUIDs of end-users to fold into the target, from get_device_candidates."),
    reason: z.string().optional().describe("Why the merge (optional, recorded)."),
}, async (a) => text(await client.mergeEndUsers({ target_end_user_id: a.target_end_user_id, source_end_user_ids: a.source_end_user_ids, reason: a.reason })));
server.tool("unmerge_end_users", "Undo a previous end-user merge by its event id and return the result — the tombstoned sources are restored and rows re-split. A write; only an un-reverted merge event can be undone. Find the event id with list_identity_merges — never guess it.", { event_id: z.string().describe("Merge event id to undo, from list_identity_merges.") }, async (a) => text(await client.unmergeEndUsers(a.event_id)));
server.tool("review_artifact", "Agent-as-critic over a DRAFT artifact (a feature spec, experiment plan, or page): checks it against a baseline PM bar — clear problem/hypothesis, a measurable success metric, evidence cited, risks named, a rollout/experiment plan — and returns structured findings (section, severity, concrete fix, verbatim evidence quote) plus a 0-100 score. A write: each call re-runs the review and persists a new version (see list_artifact_versions). Resolve target_id first via list_features / list_experiments / list_pages. One small LLM call; use it before sending a draft for sign-off.", {
    target_id: z.string().describe("Id of the feature / experiment / page to review, from list_features / list_experiments / list_pages."),
    target_type: z.enum(["feature", "experiment", "page"]).describe("What kind of artifact target_id is: a feature (spec), experiment (plan), or page (doc/PRD)."),
    rubric_id: z.string().optional().describe("Score against a specific rubric; omit to use the org's default (or the built-in baseline)."),
}, async (a) => text(await client.reviewArtifact({ target_id: a.target_id, target_type: a.target_type, rubric_id: a.rubric_id })));
server.tool("revert_to_version", "Roll an AI artifact back to a prior version by version_id and return the result — the artifact's live content is replaced with that version's, recorded as a new version so nothing is lost. A write. Find the version_id with list_artifact_versions — never guess it.", {
    version_id: z.string().describe("Version id to revert to, from list_artifact_versions."),
    reason: z.string().optional().describe("Why the revert (optional, recorded)."),
}, async (a) => text(await client.revertToVersion({ version_id: a.version_id, reason: a.reason })));
// ── Routines (slash-command prompts) ────────────────────────────────────────
// Surface in the AI host as named slash commands (e.g. Claude Code:
// /productos:standup), so the human — or a scheduled headless run — can run a
// product routine on demand. Each orchestrates the tools above; they stay
// read-first and only write what the playbook sanctions.
server.prompt("standup", "Board standup — what moved, what's blocked, what needs you today (read-only).", async () => promptMsg(`Run the product standup for the connected org. Read-only — don't change anything.\n` +
    `1) pm_meta to resolve lists / statuses / members.\n` +
    `2) list_tasks to read the active board.\n` +
    `Report briefly: what's in progress, what's blocked (and why), what's gone stale with no movement, and the 1–3 ` +
    `decisions that need a human today. Pull get_product_brain if revenue/account context sharpens the call. ` +
    `End with the single most important thing to do next.`));
server.prompt("triage", "Triage — turn fresh customer signal into prioritized, spine-linked work.", async () => promptMsg(`Run intake triage for the connected org. Follow get_pm_playbook.\n` +
    `1) get_product_brain — ground in revenue, top accounts, recent verbatim signal, and open work.\n` +
    `2) Review the board (list_tasks, pm_meta) and any fresh insights.\n` +
    `3) Prioritize on EVIDENCE — affected accounts + MRR + reach — never an invented score.\n` +
    `4) Make the writes you're confident in: create_task / update_task, linking insight→feature→task; ` +
    `assign owners; place the clear ones in the current sprint. SURFACE the judgment calls for a human instead of guessing.\n` +
    `Confirm only the writes you actually made.`));
server.prompt("daily", "Daily PM briefing — your plate, blockers, and the one thing to do next.", async () => promptMsg(`Give the connected member their daily briefing.\n` +
    `1) get_product_brain for context.\n` +
    `2) list_tasks + pm_meta — what's assigned to them, what's blocked, what's overdue or stale.\n` +
    `3) Scan the support inbox (list_conversations) and upcoming calls (list_bookings) for anything urgent.\n` +
    `Output a tight briefing: top priorities today, blockers needing a decision, and ONE recommended next action. ` +
    `Read-only unless they ask you to act.`));
async function main() {
    // Fire-and-forget: if a newer version is on npm, arm the one-time banner that
    // rides on the next tool result. Never blocks the transport, never throws.
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
