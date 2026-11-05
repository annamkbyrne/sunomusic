// Shared helpers for talking to SunoAPI.org (https://docs.sunoapi.org).
// The API key never reaches the browser: it is read from the
// SUNO_API_KEY environment variable configured in Netlify.

export const SUNO_BASE = "https://api.sunoapi.org/api/v1";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function apiKey() {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    throw Object.assign(new Error("Server is missing SUNO_API_KEY. Add it in Netlify environment variables."), { status: 500 });
  }
  return key;
}

// Suno requires a callBackUrl on every task. We poll for results instead,
// so the callback just needs to be a reachable URL on this site.
export function callbackUrl(req) {
  const base = process.env.URL || new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/api/callback`;
}

export async function suno(path, { method = "GET", body, query } = {}) {
  const url = new URL(SUNO_BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error("Could not reach SunoAPI. Please try again."), { status: 502 });
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw Object.assign(new Error(`SunoAPI returned an unexpected response (HTTP ${res.status}).`), { status: 502 });
  }
  // SunoAPI wraps everything as { code, msg, data }; code 200 = success.
  if (!res.ok || (data.code && data.code !== 200)) {
    const code = data.code || res.status;
    throw Object.assign(new Error(friendlyError(code, data.msg)), { status: 400, code });
  }
  return data.data;
}

function friendlyError(code, msg) {
  const map = {
    400: "Invalid parameters",
    401: "Unauthorized — check the SUNO_API_KEY",
    405: "Rate limit exceeded",
    413: "Prompt or style is too long",
    429: "Insufficient credits on the SunoAPI account",
    430: "Too many requests — please wait a moment",
    455: "SunoAPI is under maintenance",
  };
  const base = map[code] || "SunoAPI error";
  return msg && msg !== "success" ? `${base}: ${msg}` : base;
}

export function handle(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return json({ error: err.message || "Unexpected error", code: err.code }, err.status || 500);
    }
  };
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw Object.assign(new Error("Request body must be JSON"), { status: 400 });
  }
}

export const clip = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
export const num01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== "" && v !== null ? Math.round(Math.min(1, Math.max(0, n)) * 100) / 100 : undefined;
};
