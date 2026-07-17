// Thin typed HTTP client over the platform's token-authed PM endpoints.
// Uses global fetch (Node 18+). The PAT is the only credential; nothing is stored.
export class PlatformClient {
    baseUrl;
    token;
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
    }
    async req(path, init) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
                ...(init?.headers ?? {}),
            },
        });
        const body = await res.text();
        const json = body ? JSON.parse(body) : {};
        if (!res.ok) {
            const o = (json ?? {});
            const msg = o.error ? `${o.error}${o.detail ? `: ${o.detail}` : ""}` : `HTTP ${res.status}`;
            const e = new Error(msg);
            e.status = res.status;
            throw e;
        }
        return json;
    }
    whoami() {
        return this.req("/api/me");
    }
    meta() {
        return this.req("/api/pm/meta");
    }
    listTasks(q) {
        const params = new URLSearchParams();
        if (q.status_id)
            params.set("status_id", q.status_id);
        if (q.list_id)
            params.set("list_id", q.list_id);
        const qs = params.toString();
        return this.req(`/api/pm/tasks${qs ? `?${qs}` : ""}`);
    }
    getTask(id) {
        return this.req(`/api/pm/tasks/${encodeURIComponent(id)}`);
    }
    createTask(body) {
        return this.req("/api/pm/tasks", { method: "POST", body: JSON.stringify(body) });
    }
    createFeature(body) {
        return this.req("/api/me/features", { method: "POST", body: JSON.stringify(body) });
    }
    createObjective(body) {
        return this.req("/api/me/objectives", { method: "POST", body: JSON.stringify(body) });
    }
    createSprint(body) {
        return this.req("/api/me/sprints", { method: "POST", body: JSON.stringify(body) });
    }
    createPage(body) {
        return this.req("/api/me/pages", { method: "POST", body: JSON.stringify(body) });
    }
    updateFeature(body) {
        return this.req("/api/me/features", { method: "PATCH", body: JSON.stringify(body) });
    }
    updateObjective(body) {
        return this.req("/api/me/objectives", { method: "PATCH", body: JSON.stringify(body) });
    }
    updateKeyResult(body) {
        return this.req("/api/me/key-results", { method: "PATCH", body: JSON.stringify(body) });
    }
    updateSprint(body) {
        return this.req("/api/me/sprints", { method: "PATCH", body: JSON.stringify(body) });
    }
    updatePage(body) {
        return this.req("/api/me/pages", { method: "PATCH", body: JSON.stringify(body) });
    }
    createRelease(body) {
        return this.req("/api/me/releases", { method: "POST", body: JSON.stringify(body) });
    }
    updateRelease(body) {
        return this.req("/api/me/releases", { method: "PATCH", body: JSON.stringify(body) });
    }
    createExperiment(body) {
        return this.req("/api/me/experiments", { method: "POST", body: JSON.stringify(body) });
    }
    updateExperiment(body) {
        return this.req("/api/me/experiments", { method: "PATCH", body: JSON.stringify(body) });
    }
    listDecisions(status) {
        return this.req(`/api/me/decisions${status ? `?status=${encodeURIComponent(status)}` : ""}`);
    }
    createDecision(body) {
        return this.req("/api/me/decisions", { method: "POST", body: JSON.stringify(body) });
    }
    updateDecision(body) {
        return this.req("/api/me/decisions", { method: "PATCH", body: JSON.stringify(body) });
    }
    updateTask(id, body) {
        return this.req(`/api/pm/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
    }
    deleteTask(id) {
        return this.req(`/api/pm/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
    comment(id, body) {
        return this.req(`/api/pm/tasks/${encodeURIComponent(id)}/comments`, {
            method: "POST",
            body: JSON.stringify({ body }),
        });
    }
    brain(productId) {
        const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
        return this.req(`/api/me/brain${qs}`);
    }
    captureInsight(body) {
        return this.req("/api/me/insight", { method: "POST", body: JSON.stringify(body) });
    }
    customer360(query) {
        return this.req(`/api/me/customer?q=${encodeURIComponent(query)}`);
    }
    nps(opts) {
        const p = new URLSearchParams();
        if (opts.productId)
            p.set("product_id", opts.productId);
        if (opts.windowDays)
            p.set("window_days", String(opts.windowDays));
        const qs = p.toString();
        return this.req(`/api/me/nps${qs ? `?${qs}` : ""}`);
    }
    nrr(windowDays) {
        const qs = windowDays ? `?window_days=${windowDays}` : "";
        return this.req(`/api/me/nrr${qs}`);
    }
    funnel(opts) {
        const p = new URLSearchParams();
        if (opts.productId)
            p.set("product_id", opts.productId);
        if (opts.window)
            p.set("window", String(opts.window));
        for (const s of opts.steps ?? [])
            p.append("step", s);
        const qs = p.toString();
        return this.req(`/api/me/funnel${qs ? `?${qs}` : ""}`);
    }
    retention(opts) {
        const p = new URLSearchParams();
        if (opts.productId)
            p.set("product_id", opts.productId);
        if (opts.window)
            p.set("window", String(opts.window));
        const qs = p.toString();
        return this.req(`/api/me/retention${qs ? `?${qs}` : ""}`);
    }
    paths(opts) {
        const p = new URLSearchParams();
        if (opts.productId)
            p.set("product_id", opts.productId);
        if (opts.window)
            p.set("window", String(opts.window));
        if (opts.start)
            p.set("start", opts.start);
        const qs = p.toString();
        return this.req(`/api/me/paths${qs ? `?${qs}` : ""}`);
    }
    listConversations(opts) {
        const p = new URLSearchParams();
        if (opts.productId)
            p.set("product_id", opts.productId);
        if (opts.status)
            p.set("status", opts.status);
        const qs = p.toString();
        return this.req(`/api/me/inbox${qs ? `?${qs}` : ""}`);
    }
    getConversation(id) {
        return this.req(`/api/me/inbox?conversation_id=${encodeURIComponent(id)}`);
    }
    inboxAction(body) {
        return this.req("/api/me/inbox", { method: "POST", body: JSON.stringify(body) });
    }
    listBookings(opts) {
        const qs = opts.include === "all" ? "?include=all" : "";
        return this.req(`/api/me/scheduling${qs}`);
    }
    schedulingAction(body) {
        return this.req("/api/me/scheduling", { method: "POST", body: JSON.stringify(body) });
    }
    listChannels() {
        return this.req("/api/me/comms");
    }
    readChannel(channelId, limit) {
        const p = new URLSearchParams({ channel_id: channelId });
        if (limit)
            p.set("limit", String(limit));
        return this.req(`/api/me/comms?${p.toString()}`);
    }
    postToChannel(channelId, body) {
        return this.req("/api/me/comms", {
            method: "POST",
            body: JSON.stringify({ action: "post", channel_id: channelId, body }),
        });
    }
    replyInChannel(channelId, parentId, body) {
        return this.req("/api/me/comms", {
            method: "POST",
            body: JSON.stringify({ action: "reply", channel_id: channelId, parent_id: parentId, body }),
        });
    }
    // ---- Strategy ladder: initiatives + ideas (goal → initiative → feature) ----
    listInitiatives(productId) {
        const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
        return this.req(`/api/me/initiatives${qs}`);
    }
    createInitiative(body) {
        return this.req("/api/me/initiatives", { method: "POST", body: JSON.stringify(body) });
    }
    updateInitiative(id, body) {
        return this.req(`/api/me/initiatives/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
    }
    listIdeas(opts) {
        const p = new URLSearchParams();
        if (opts.status)
            p.set("status", opts.status);
        if (opts.productId)
            p.set("product_id", opts.productId);
        const qs = p.toString();
        return this.req(`/api/me/ideas${qs ? `?${qs}` : ""}`);
    }
    createIdea(body) {
        return this.req("/api/me/ideas", { method: "POST", body: JSON.stringify(body) });
    }
    updateIdea(id, body) {
        return this.req(`/api/me/ideas/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
    }
    voteIdea(id, remove) {
        return this.req(`/api/me/ideas/${encodeURIComponent(id)}/vote`, { method: remove ? "DELETE" : "POST" });
    }
    promoteIdea(id, body) {
        return this.req(`/api/me/ideas/${encodeURIComponent(id)}/promote`, { method: "POST", body: JSON.stringify(body) });
    }
    // ---- Read parity with the hosted connector: catalogue + strategy + docs ----
    listFeatures(opts) {
        const p = new URLSearchParams();
        if (opts.q)
            p.set("q", opts.q);
        if (opts.productId)
            p.set("product_id", opts.productId);
        const qs = p.toString();
        return this.req(`/api/me/features${qs ? `?${qs}` : ""}`);
    }
    listObjectives(productId) {
        const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
        return this.req(`/api/me/objectives${qs}`);
    }
    listExperiments(opts) {
        const p = new URLSearchParams();
        if (opts.productId)
            p.set("product_id", opts.productId);
        if (opts.state)
            p.set("state", opts.state);
        const qs = p.toString();
        return this.req(`/api/me/experiments${qs ? `?${qs}` : ""}`);
    }
    listReleases(productId) {
        const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
        return this.req(`/api/me/releases${qs}`);
    }
    listSprints(state) {
        const qs = state ? `?state=${encodeURIComponent(state)}` : "";
        return this.req(`/api/me/sprints${qs}`);
    }
    listPages(productId) {
        const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
        return this.req(`/api/me/pages${qs}`);
    }
    getPage(id) {
        return this.req(`/api/me/pages?id=${encodeURIComponent(id)}`);
    }
    listInsights(opts) {
        const p = new URLSearchParams();
        if (opts.q)
            p.set("q", opts.q);
        if (opts.status)
            p.set("status", opts.status);
        if (opts.kind)
            p.set("kind", opts.kind);
        if (opts.featureId)
            p.set("feature_id", opts.featureId);
        if (opts.accountId)
            p.set("account_id", opts.accountId);
        if (opts.productId)
            p.set("product_id", opts.productId);
        if (opts.limit)
            p.set("limit", String(opts.limit));
        const qs = p.toString();
        return this.req(`/api/me/insights${qs ? `?${qs}` : ""}`);
    }
    roadmapDrift(opts) {
        const p = new URLSearchParams();
        if (opts.window)
            p.set("window", opts.window);
        if (opts.productId)
            p.set("product_id", opts.productId);
        const qs = p.toString();
        return this.req(`/api/me/roadmap-drift${qs ? `?${qs}` : ""}`);
    }
    weeklySignalMemo(opts) {
        const p = new URLSearchParams();
        if (opts.week)
            p.set("week", opts.week);
        if (opts.generate)
            p.set("generate", "1");
        const qs = p.toString();
        return this.req(`/api/me/weekly-signal${qs ? `?${qs}` : ""}`);
    }
    codebaseMap(productId) {
        const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
        return this.req(`/api/me/codebase${qs}`);
    }
    listArtifactVersions(opts) {
        const p = new URLSearchParams();
        if (opts.targetId)
            p.set("target_id", opts.targetId);
        if (opts.targetType)
            p.set("target_type", opts.targetType);
        const qs = p.toString();
        return this.req(`/api/me/artifact-versions${qs ? `?${qs}` : ""}`);
    }
    // ---- Identity graph: candidates, merge history, merge / unmerge ----
    deviceCandidates() {
        return this.req("/api/me/identity");
    }
    listIdentityMerges(limit) {
        const p = new URLSearchParams({ view: "merges" });
        if (limit)
            p.set("limit", String(limit));
        return this.req(`/api/me/identity?${p.toString()}`);
    }
    mergeEndUsers(body) {
        return this.req("/api/me/identity", {
            method: "POST",
            body: JSON.stringify({ action: "merge_end_users", ...body }),
        });
    }
    unmergeEndUsers(eventId) {
        return this.req("/api/me/identity", {
            method: "POST",
            body: JSON.stringify({ action: "unmerge_end_users", event_id: eventId }),
        });
    }
    // ---- AI artifacts: critic review + version revert ----
    reviewArtifact(body) {
        return this.req("/api/me/review-artifact", { method: "POST", body: JSON.stringify(body) });
    }
    revertToVersion(body) {
        return this.req("/api/me/revert-version", { method: "POST", body: JSON.stringify(body) });
    }
}
