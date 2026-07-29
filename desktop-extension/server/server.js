// The stdio MCP server, DERIVED from the shared tool registry (registry.ts) —
// the same single source of truth the hosted /api/mcp connector serves. That
// is the whole architecture: one registry entry per tool, and both transports
// (hosted HTTP and this stdio process) read it, so the two surfaces cannot
// drift in tool set, descriptions, schemas, or annotations. Before this file,
// parity was 872 hand-written lines kept in sync by discipline alone.
//
// tools/list mirrors the hosted dispatcher exactly: title, description, input
// schema (with worked-example arguments folded into JSON-Schema `examples`),
// behaviour annotations (readOnlyHint / destructiveHint / …), and the examples
// array. tools/call executes the registry's transport-agnostic RestCall
// through the injected platform client, and attaches the tool's rich ui://
// card when one is defined — text first, always, so hosts without MCP-UI
// rendering lose nothing.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { annotationsFor, APP_MIME_TYPE, MCP_APPS, MCP_APPS_BY_URI, MCP_TOOLS, MCP_TOOLS_BY_NAME, uiMetaFor, UI_EXTENSION_ID, } from "./registry.js";
/**
 * `structuredContent` for an app tool, when the platform's answer is a JSON
 * object. Arrays and scalars are skipped: the field is specified as an object,
 * and every endpoint an app reads returns one. Never throws — a body that isn't
 * JSON just means the app falls back to parsing the text block itself.
 */
function structuredOf(text) {
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return { structuredContent: parsed };
        }
    }
    catch {
        /* not JSON — the text block is still the whole answer */
    }
    return {};
}
const INSTRUCTIONS = "You manage product work on AIOProductOS for the connected member — board, insights, features, and " +
    "analytics all hang off one spine. Call get_pm_playbook first for how to operate: ground in " +
    "get_product_brain, keep work tied to the spine (insight→feature→task→outcome), and prioritize on " +
    "evidence (affected accounts + MRR + reach), never an invented score. Resolve names to ids with " +
    "pm_meta before create_task / update_task; never guess an id. Confirm what you changed in plain " +
    "language, and claim only writes you actually made.";
/** The slash-command routines. Stdio-only on purpose: prompts surface as host
 *  slash commands (e.g. /productos:standup), a concept of the local host; the
 *  hosted connector's clients drive routines through their own UX. */
const PROMPTS = [
    {
        name: "standup",
        description: "Board standup — what moved, what's blocked, what needs you today (read-only).",
        body: "Run the product standup for the connected org. Read-only — don't change anything.\n" +
            "1) pm_meta to resolve lists / statuses / members.\n" +
            "2) list_tasks to read the active board.\n" +
            "Report briefly: what's in progress, what's blocked (and why), what's gone stale with no movement, and the 1–3 " +
            "decisions that need a human today. Pull get_product_brain if revenue/account context sharpens the call. " +
            "End with the single most important thing to do next.",
    },
    {
        name: "triage",
        description: "Triage — turn fresh customer signal into prioritized, spine-linked work.",
        body: "Run intake triage for the connected org. Follow get_pm_playbook.\n" +
            "1) get_product_brain — ground in revenue, top accounts, recent verbatim signal, and open work.\n" +
            "2) Review the board (list_tasks, pm_meta) and any fresh insights.\n" +
            "3) Prioritize on EVIDENCE — affected accounts + MRR + reach — never an invented score.\n" +
            "4) Make the writes you're confident in: create_task / update_task, linking insight→feature→task; " +
            "assign owners; place the clear ones in the current sprint. SURFACE the judgment calls for a human instead of guessing.\n" +
            "Confirm only the writes you actually made.",
    },
    {
        name: "daily",
        description: "Daily PM briefing — your plate, blockers, and the one thing to do next.",
        body: "Give the connected member their daily briefing.\n" +
            "1) get_product_brain for context.\n" +
            "2) list_tasks + pm_meta — what's assigned to them, what's blocked, what's overdue or stale.\n" +
            "3) Scan the support inbox (list_conversations) and upcoming calls (list_bookings) for anything urgent.\n" +
            "Output a tight briefing: top priorities today, blockers needing a decision, and ONE recommended next action. " +
            "Read-only unless they ask you to act.",
    },
];
export function createPmServer(deps) {
    const server = new Server({ name: "AIOProductOS", version: deps.version }, {
        // `resources` is what makes the ui:// apps fetchable; the extension key
        // announces MCP Apps support to hosts that look for it. Both are additive —
        // a host that knows neither still gets every tool.
        capabilities: { tools: {}, prompts: {}, resources: {}, extensions: { [UI_EXTENSION_ID]: {} } },
        instructions: INSTRUCTIONS,
    });
    const decorate = deps.decorate ?? ((c) => c);
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: MCP_TOOLS.map((t) => {
            // Same derivation as the hosted dispatcher: worked-example arguments fold
            // into JSON-Schema `examples`; no-arg examples ({}) are dropped as noise.
            const argExamples = (t.examples ?? []).map((e) => e.arguments).filter((a) => Object.keys(a).length > 0);
            const inputSchema = (argExamples.length ? { ...t.inputSchema, examples: argExamples } : t.inputSchema);
            const uiMeta = uiMetaFor(t);
            return {
                name: t.name,
                ...(t.title ? { title: t.title } : {}),
                description: t.description,
                inputSchema,
                annotations: annotationsFor(t),
                ...(uiMeta ? { _meta: uiMeta } : {}),
            };
        }),
    }));
    // The ui:// apps. Listing them lets a host preload an app before its tool is
    // ever called; reading one returns the whole self-contained document.
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: MCP_APPS.map((a) => ({
            uri: a.uri,
            name: a.name,
            description: a.description,
            mimeType: APP_MIME_TYPE,
            _meta: { ui: { csp: a.csp ?? {}, prefersBorder: a.prefersBorder ?? false } },
        })),
    }));
    server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
        const app = MCP_APPS_BY_URI[req.params.uri];
        if (!app)
            throw new Error(`Unknown resource: ${req.params.uri}`);
        return {
            contents: [
                {
                    uri: app.uri,
                    mimeType: APP_MIME_TYPE,
                    text: app.html,
                    _meta: { ui: { csp: app.csp ?? {}, prefersBorder: app.prefersBorder ?? false } },
                },
            ],
        };
    });
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const name = req.params.name;
        const args = req.params.arguments ?? {};
        const tool = MCP_TOOLS_BY_NAME[name];
        if (!tool) {
            return { content: decorate([{ type: "text", text: `Unknown tool: ${name}` }]), isError: true };
        }
        if (tool.kind === "static") {
            return { content: decorate([{ type: "text", text: tool.run(args) }]) };
        }
        try {
            const res = await deps.request(tool.rest(args));
            const content = [
                { type: "text", text: res.text || (res.ok ? "(no content)" : `HTTP ${res.status}`) },
            ];
            return {
                content: decorate(content),
                // App tools also answer as typed data, which is what the app reads —
                // parsing our own JSON back out of a text block would be silly. Only
                // for app tools: adding it everywhere would change 71 payload shapes
                // for no reader.
                ...(res.ok && tool.appUri ? structuredOf(res.text) : {}),
                ...(res.ok ? {} : { isError: true }),
            };
        }
        catch (e) {
            return { content: decorate([{ type: "text", text: `Tool call failed: ${String(e)}` }]), isError: true };
        }
    });
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
        prompts: PROMPTS.map((p) => ({ name: p.name, description: p.description })),
    }));
    server.setRequestHandler(GetPromptRequestSchema, async (req) => {
        const p = PROMPTS.find((x) => x.name === req.params.name);
        if (!p)
            throw new Error(`Unknown prompt: ${req.params.name}`);
        return {
            description: p.description,
            messages: [{ role: "user", content: { type: "text", text: p.body } }],
        };
    });
    return server;
}
