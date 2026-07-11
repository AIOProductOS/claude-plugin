#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PlatformClient } from "./client.js";
import { PM_PLAYBOOK, PM_SKILL_VERSION } from "./pm-skill.js";
const token = process.env.PRODUCTOS_TOKEN;
const baseUrl = (process.env.PRODUCTOS_URL ?? "https://platform.aioproductos.com").replace(/\/$/, "");
if (!token) {
    console.error("[productos] PRODUCTOS_TOKEN is required — generate one in AIOProductOS → Settings → Tokens & Agents.");
    process.exit(1);
}
const client = new PlatformClient(baseUrl, token);
function text(data) {
    return {
        content: [
            { type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) },
        ],
    };
}
/** A prompt result — one user-role message the host injects when the slash
 *  command runs. Surfaces as a named slash command in the AI host. */
function promptMsg(body) {
    return { messages: [{ role: "user", content: { type: "text", text: body } }] };
}
const server = new McpServer({ name: "AIOProductOS", version: "0.15.2" }, {
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
server.tool("comment_on_task", "Add a comment to a task, authored as the connected member, and return the created comment. Use to record progress, a decision, or a handoff — the comment is visible to the whole org, so keep it work-relevant. Resolve the task id first with list_tasks or get_task; both id and body are required.", {
    id: z.string().describe("Task id, from list_tasks or get_task."),
    body: z.string().describe("Comment body."),
}, async (a) => text(await client.comment(a.id, a.body)));
server.tool("get_product_brain", "Read a grounded, read-only snapshot of the org's product so YOU can reason about it on your own model: revenue + top paying accounts, web + product analytics, features, recent verbatim customer signals, and open work. Optional product_id; omit for the primary product. Returns the brain text plus the list of products you can ask about.", { product_id: z.string().optional().describe("Product id, from whoami (optional; primary by default).") }, async (a) => text(await client.brain(a.product_id)));
server.tool("get_customer_360", "Everything about ONE customer, resolved by id, email, domain, or company name: profile, subscription + MRR, how many users sit under the account, and their verbatim feedback. Read-only; returns the matched account, or an empty result when nothing matches. The money + people + voice join on one record — use it before answering anything about a specific account.", { query: z.string().describe("Account id, email, domain, or company name.") }, async (a) => text(await client.customer360(a.query)));
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
server.tool("read_channel", "Read recent messages in a Comms channel you belong to (oldest→newest), so you can catch up before replying. Read-only; returns the messages, empty when the channel is silent. Resolve the channel_id first with list_channels — never guess it.", {
    channel_id: z.string().describe("Channel id, from list_channels."),
    limit: z.number().optional().describe("Max messages to return (optional)."),
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
    await server.connect(new StdioServerTransport());
}
main().catch((err) => {
    console.error("[productos] fatal:", err);
    process.exit(1);
});
