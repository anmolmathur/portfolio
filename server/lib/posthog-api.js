/**
 * PostHog read API — server-side only.
 *
 * The /reports dashboard needs to READ analytics, which is a different key from
 * the one the browser uses to write them:
 *
 *   POSTHOG_PROJECT_KEY (phc_…)  public, shipped to every visitor, write-only
 *   POSTHOG_API_KEY     (phx_…)  personal, read/write, MUST stay server-side
 *
 * A personal key can read every project on the instance and create/delete
 * objects, so it never reaches the browser and never appears in a log line.
 * The dashboard talks to this module through /api/reports/*, so the key stays
 * on this side of the wire.
 *
 * Everything is expressed as HogQL rather than PostHog's insight API: one
 * query shape, no dependency on saved insights existing, and the results come
 * back as plain rows the templates can render directly.
 */
import { config } from './config.js';

/**
 * In-process response cache.
 *
 * Every panel on the dashboard is a separate ClickHouse query, and a refresh
 * would otherwise fire all of them at a PostHog instance that shares 8 GB with
 * the rest of the stack. A short TTL keeps a reload cheap while still feeling
 * live. Bounded so a wide date range can't grow it without limit.
 */
const cache = new Map();
const MAX_ENTRIES = 200;

function cacheGet(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) { cache.delete(key); return null; }
  // Refresh insertion order so the eviction below is roughly LRU.
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/** Wipe the cache — used by the dashboard's "refresh" control. */
export function clearCache() {
  cache.clear();
}

/**
 * Run one HogQL query and return `{ columns, results }`.
 *
 * PostHog answers 200 with an `error` field for a bad query rather than a 4xx,
 * so that case is checked explicitly — otherwise a typo'd column surfaces as an
 * empty panel instead of an error.
 */
export async function hogql(query, { ttlMs = 60_000, timeoutMs = 20_000 } = {}) {
  if (!config.reports.enabled) {
    throw Object.assign(new Error('POSTHOG_API_KEY is not set'), { code: 'NOT_CONFIGURED' });
  }

  const key = `hogql:${query}`;
  const cached = cacheGet(key, ttlMs);
  if (cached) return { ...cached, cached: true };

  const url = `${config.analytics.posthogHost}/api/projects/${config.reports.projectId}/query/`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.reports.apiKey}`,
        'Content-Type': 'application/json',
        // Cloudflare sits in front of posthog.anmolmathur.com and answers 403
        // (error 1010) to undici's default user-agent. Naming the client is
        // what gets the request through — without this every panel is empty.
        'User-Agent': 'anmolmathur-portfolio-reports/1.0',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      signal: ctrl.signal,
    });
  } catch (err) {
    // An aborted fetch reads as a generic TypeError; name the real cause.
    if (err.name === 'AbortError') {
      throw Object.assign(new Error(`PostHog query timed out after ${timeoutMs}ms`), { code: 'TIMEOUT' });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // The body can echo the query but never the Authorization header; still,
    // truncate so a large error page doesn't land in the logs wholesale.
    throw Object.assign(new Error(`PostHog ${res.status}: ${body.slice(0, 300)}`), {
      code: 'HTTP_ERROR',
      status: res.status,
    });
  }

  const json = await res.json();
  if (json.error) {
    throw Object.assign(new Error(`PostHog query error: ${json.error}`), { code: 'QUERY_ERROR' });
  }

  const value = { columns: json.columns ?? [], results: json.results ?? [] };
  cacheSet(key, value);
  return { ...value, cached: false };
}

/** Rows as objects rather than positional arrays — easier to template against. */
export async function rows(query, opts) {
  const { columns, results, cached } = await hogql(query, opts);
  return {
    cached,
    rows: results.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))),
  };
}

/* ── Query building ─────────────────────────────────────────────────────────
   Values are interpolated into HogQL strings, so every one of them has to be
   escaped at the point of use. The two helpers below are the only sanctioned
   way to do it; nothing else in this file drops a caller-supplied value into a
   query. `site` in particular comes straight off a query string. */

/** Single-quoted HogQL string literal with quotes and backslashes escaped. */
export function lit(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Bounded integer — for LIMIT and interval lengths, which cannot be quoted. */
export function int(value, { min, max, fallback }) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * The sites this dashboard covers.
 *
 * Project 1 is shared with Bombay Gothic, so every query is scoped by host —
 * without this the dashboard would show Kruti's shop traffic, which is both
 * wrong and not mine to surface here.
 *
 * Matching on `$host` rather than the `site` super-property is deliberate:
 * `$host` is set by posthog-js on every event including autocapture, and it is
 * already correct for events captured before the tagging in analytics.js
 * landed. `site` only exists on events sent after consent registered it.
 */
export const SITES = {
  'anmolmathur.com': { label: 'anmolmathur.com', hosts: ['anmolmathur.com', 'www.anmolmathur.com'] },
  'immersive.anmolmathur.com': { label: 'immersive', hosts: ['immersive.anmolmathur.com'] },
};

export const ALL_HOSTS = Object.values(SITES).flatMap((s) => s.hosts);

/**
 * The `WHERE` fragment every panel shares: my two sites, within the window.
 * `site` is validated against SITES by the caller; an unknown value falls back
 * to both sites rather than erroring, so a stale bookmark still renders.
 */
export function scope({ site, days }) {
  const hosts = SITES[site] ? SITES[site].hosts : ALL_HOSTS;
  const hostList = hosts.map(lit).join(', ');
  return `properties.$host IN (${hostList}) AND timestamp > now() - INTERVAL ${days} DAY`;
}

/** Which site a row belongs to, as a HogQL expression usable in SELECT/GROUP BY. */
export const SITE_EXPR = `if(properties.$host = ${lit('immersive.anmolmathur.com')}, ${lit('immersive')}, ${lit('anmolmathur.com')})`;
