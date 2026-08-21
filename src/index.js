/**
 * NORTHWEST TRINITY — Worker
 *
 * Serves the static site (html/css/js/audio) via env.ASSETS.fetch(), and
 * handles two small JSON APIs on top of it:
 *
 *   GET  /api/hit    — site-wide visitor counter, cookie-gated so each
 *                       browser only increments the total once
 *   GET  /api/plays  — current per-track play counts, as one JSON blob
 *   POST /api/plays  — increment a single track's play count
 *
 * No IP addresses or other personal data are stored — just a boolean
 * "seen before" cookie and integer counts in KV.
 */

const TRACK_FILENAME_RE = /^[a-z0-9-]+\.mp3$/;
const VISITOR_COOKIE = "tl_visited";
const PLAYS_KEY = "counts";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/hit" && request.method === "GET") {
      return handleHit(request, env);
    }
    if (url.pathname === "/api/plays" && request.method === "GET") {
      return handlePlaysGet(env);
    }
    if (url.pathname === "/api/plays" && request.method === "POST") {
      return handlePlaysPost(request, env);
    }

    // Everything else — the actual site files — falls through to static assets.
    return env.ASSETS.fetch(request);
  }
};

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleHit(request, env) {
  if (!env.VISITOR_COUNT) {
    return jsonResponse({ error: "VISITOR_COUNT KV binding not configured" }, { status: 501 });
  }

  const alreadyVisited = getCookie(request, VISITOR_COOKIE) === "1";
  let count = parseInt((await env.VISITOR_COUNT.get("total")) || "0", 10);
  if (Number.isNaN(count)) count = 0;

  const headers = {};
  if (!alreadyVisited) {
    count += 1;
    await env.VISITOR_COUNT.put("total", String(count));
    // ~1 year, site-wide, sent only over HTTPS (which Cloudflare terminates for us)
    headers["Set-Cookie"] = `${VISITOR_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
  }

  return jsonResponse({ count }, { headers });
}

async function readPlayCounts(env) {
  const raw = await env.TRACK_PLAYS.get(PLAYS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function handlePlaysGet(env) {
  if (!env.TRACK_PLAYS) {
    return jsonResponse({ error: "TRACK_PLAYS KV binding not configured" }, { status: 501 });
  }
  const counts = await readPlayCounts(env);
  return jsonResponse({ counts });
}

async function handlePlaysPost(request, env) {
  if (!env.TRACK_PLAYS) {
    return jsonResponse({ error: "TRACK_PLAYS KV binding not configured" }, { status: 501 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: "invalid JSON body" }, { status: 400 });
  }

  const track = body && body.track;
  if (typeof track !== "string" || !TRACK_FILENAME_RE.test(track)) {
    return jsonResponse({ error: "invalid track filename" }, { status: 400 });
  }

  // Read-modify-write — a theoretical lost increment if two plays land in
  // the exact same instant is an acceptable trade-off here; not worth a
  // Durable Object for a fan site's play counts.
  const counts = await readPlayCounts(env);
  counts[track] = (counts[track] || 0) + 1;
  await env.TRACK_PLAYS.put(PLAYS_KEY, JSON.stringify(counts));

  return jsonResponse({ counts });
}
