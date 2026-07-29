// AI narration now goes through a backend proxy (a Cloudflare Worker — see
// `worker/`) that holds the Gemini API key server-side. The client only knows
// the proxy URL, which is public and safe to embed in the bundle/APK — the key
// is NEVER shipped to the client anymore. When no proxy is configured (e.g. a
// public/shared build) every call returns its local fallback narration, so the
// AI flavor text is simply off but gameplay is fully intact.
//
// On Expo, only EXPO_PUBLIC_*-prefixed env vars are inlined into the bundle
// (set them in `.env` at the project root, e.g. EXPO_PUBLIC_AI_PROXY_URL=...).
const PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const APP_TOKEN = process.env.EXPO_PUBLIC_AI_PROXY_TOKEN;

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 12000;
const FALLBACK_TEXT = "O GM adversário está ocupado no momento.";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// The proxy relays Gemini, which 503s / rate-limits intermittently — that's
// normal, not a bug. Only these transient failures are worth retrying; a bad
// request or a daily-quota exhaustion won't fix itself within our window.
const isTransient = (err: unknown): boolean => {
    const e = err as { status?: number; message?: string };
    const status = e?.status;
    const msg = String(e?.message ?? err).toLowerCase();

    // A *daily* free-tier quota exhaustion (RESOURCE_EXHAUSTED / "PerDay") won't
    // recover within our retry window — retrying just wastes time and logs noise
    // before the same failure. Fail fast straight to the local fallback. (The
    // Gemini free tier caps generate_content at ~20 requests/day, so this is
    // expected on a busy day — the fallback narration is what carries it.)
    if (msg.includes('resource_exhausted') || msg.includes('perday') || msg.includes('exceeded your current quota')) {
        return false;
    }

    // A 429 without the daily-quota marker is a per-minute rate limit — retryable.
    if (status && [429, 500, 502, 503, 504].includes(status)) return true;

    // Network / timeout errors (fetch abort, offline) are worth one more try.
    return ['overloaded', 'unavailable', 'timeout', 'rate limit', 'try again', 'abort', 'failed to fetch', 'network', '503', '500', '429']
        .some(needle => msg.includes(needle));
};

// Narrates already-decided outcomes (trades, league commentary) — never blocks
// gameplay: every caller treats a failure as optional flavor text. Retries a
// couple of times with exponential backoff + jitter to ride out the frequent
// transient 503s before giving up.
//
// `fallback` lets a caller supply a locally-generated, context-aware narration
// (see the deterministic builders in the trade/commentary callers) so that when
// the proxy/API is down or rate-limited the user still reads a sensible in-world
// line instead of a generic error string — the AI text becomes a nice-to-have
// on top of a narration that always works offline.
export const generateAnalysis = async (prompt: string, fallback?: string): Promise<string> => {
    const finalFallback = fallback?.trim() || FALLBACK_TEXT;

    // No proxy configured — AI narration is off, use the local fallback.
    if (!PROXY_URL) return finalFallback;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(PROXY_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}),
                },
                body: JSON.stringify({ prompt }),
                signal: controller.signal,
            });

            if (!res.ok) {
                // Carry the HTTP status so isTransient can decide retry vs. fail-fast.
                throw Object.assign(new Error(`proxy responded ${res.status}`), { status: res.status });
            }

            const data = (await res.json()) as { text?: string };
            const text = data?.text?.trim();
            if (text) return text;
            throw new Error('empty response'); // treat an empty body like a soft failure
        } catch (error) {
            if (attempt < MAX_ATTEMPTS && isTransient(error)) {
                // ~0.5s, ~1.1s backoff with jitter so retries don't sync up.
                await sleep(400 * 2 ** (attempt - 1) + Math.random() * 300);
                continue;
            }
            console.error(`AI proxy call failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, error);
            return finalFallback;
        } finally {
            clearTimeout(timer);
        }
    }
    return finalFallback;
};
