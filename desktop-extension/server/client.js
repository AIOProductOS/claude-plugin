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
    updateTask(id, body) {
        return this.req(`/api/pm/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
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
}
