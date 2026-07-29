// One hardened HTTP executor over the platform's token-authed REST endpoints.
// The registry's RestCall describes WHAT to call; this describes HOW — the PAT
// header, a timeout, and honest failure text. The PAT is the only credential;
// nothing is stored.
//
// This file used to be 70 near-identical methods (one per tool). The shared
// registry made them redundant: every tool already declares its own
// method/path/body, so the client collapses to a single request function.
/** A hung platform request must fail the TOOL CALL, not hang the agent's turn
 *  forever — 30s is far beyond any healthy endpoint here. */
const TIMEOUT_MS = 30_000;
export class PlatformClient {
    baseUrl;
    token;
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
    }
    async request(call) {
        try {
            const res = await fetch(`${this.baseUrl}${call.path}`, {
                method: call.method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.token}`,
                },
                body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            return { ok: res.ok, status: res.status, text: await res.text() };
        }
        catch (e) {
            // Transport-level failure (offline, DNS, timeout) — return it as an
            // honest error result rather than throwing, so the tool result tells the
            // model what happened instead of surfacing a stack trace.
            const why = e instanceof Error && e.name === "TimeoutError" ? `platform did not respond within ${TIMEOUT_MS / 1000}s` : String(e);
            return { ok: false, status: 0, text: `Platform unreachable: ${why}` };
        }
    }
}
