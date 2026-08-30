/**
 * /reports — the analytics dashboard for anmolmathur.com and immersive.
 *
 * PostHog's own UI can answer all of this, but it answers it for the whole
 * shared instance: project 1 also carries Bombay Gothic's shop traffic, which
 * outnumbers mine ~50:1 and buries it. This page is scoped to my two hosts and
 * nothing else, and it puts the raw event log first — the question it exists to
 * answer is "what is actually being recorded", not "what is the trend".
 *
 * Everything is read server-side. The personal API key that can read the
 * instance never reaches the browser; the page talks to /api/reports/*.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, createHash } from 'node:crypto';
import { config } from './config.js';
import { rows, clearCache, lit, int, scope, SITE_EXPR, SITES } from './posthog-api.js';

/* ── Auth ───────────────────────────────────────────────────────────────────
   HTTP Basic. Crude, but it needs no session store, no cookie, and no login
   page, and it sits behind Cloudflare TLS so the header is never in the clear.

   Compared in constant time. A plain === leaks the password one character at a
   time through response timing; hashing first also sidesteps the length check
   timingSafeEqual would otherwise throw on. */
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function requireAuth(req, reply) {
  // No password configured = refuse, never default open. A deploy that forgot
  // REPORTS_PASSWORD should be visibly broken rather than quietly public.
  if (!config.reports.locked) {
    reply.code(503).send({ error: 'REPORTS_PASSWORD is not set — /reports is disabled.' });
    return false;
  }

  const header = req.headers.authorization ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return challenge(reply);

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');           // a password may contain ':'
  if (sep < 0) return challenge(reply);

  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  // Both compared, and both always compared, so a wrong username and a wrong
  // password cost the same.
  const ok = safeEqual(user, config.reports.user) & safeEqual(pass, config.reports.password);
  return ok ? true : challenge(reply);
}

function challenge(reply) {
  reply
    .code(401)
    .header('WWW-Authenticate', 'Basic realm="anmolmathur.com reports", charset="UTF-8"')
    .send({ error: 'Authentication required.' });
  return false;
}

/* ── Query parameters ───────────────────────────────────────────────────────
   Every one of these ends up interpolated into HogQL, so each is normalised to
   something known-safe here rather than trusted downstream. */
const WINDOWS = [1, 7, 30, 90];

function params(query = {}) {
  const days = WINDOWS.includes(Number(query.days)) ? Number(query.days) : 7;
  const site = SITES[query.site] ? query.site : 'all';
  return { days, site };
}

/* ── Property cleanup ───────────────────────────────────────────────────────
   PostHog attaches ~40 internal `$`-prefixed properties to every event. On a
   log view they drown the three or four properties that were actually captured
   on purpose, so they are stripped and the interesting ones promoted into
   columns instead. `token` goes too: it is the public write key, so it is not a
   leak, but it is noise on every single row. */
const KEEP_INTERNAL = new Set(['$current_url', '$pathname', '$referring_domain', '$device_type', '$browser', '$os', '$geoip_country_name']);

function splitProps(raw) {
  let parsed = raw;
  // toJSONString() hands back a JSON string containing JSON, so the first parse
  // yields a string rather than an object. Parse until it stops being one.
  for (let i = 0; i < 2 && typeof parsed === 'string'; i += 1) {
    try { parsed = JSON.parse(parsed); } catch { return { custom: {}, meta: {} }; }
  }
  if (!parsed || typeof parsed !== 'object') return { custom: {}, meta: {} };

  const custom = {};
  const meta = {};
  for (const [k, v] of Object.entries(parsed)) {
    // `token` is the public write key and `distinct_id` already has its own
    // column. distinct_id is worth dropping for a second reason: the client's
    // PII scrubber runs over PostHog's own properties too, and the digit runs
    // in a UUID trip the phone-number pattern — so the copy stored in
    // properties reads as `01a[phone]dd-9c0e…`. The real value is the column,
    // which is untouched; showing the mangled duplicate just looks like a bug.
    if (k === 'token' || k === 'distinct_id' || v === null || v === undefined || v === '') continue;
    if (k.startsWith('$')) {
      if (KEEP_INTERNAL.has(k)) meta[k] = v;
      continue;
    }
    custom[k] = v;
  }
  return { custom, meta };
}

/** `$direct` is PostHog's sentinel for "no referrer", not a domain. */
const referrer = (v) => (!v || v === '$direct' ? 'Direct' : v);

export function registerReports(app) {
  const ttlMs = config.reports.cacheTtlMs;

  /* Cache-busting stamp for this page's own CSS and JS.
     public/ is served with a 1h max-age, which is right for the marketing site
     but wrong here: a deploy that changes the template AND the script leaves a
     returning browser running the OLD script against the NEW markup for up to
     an hour, which fails silently — panels simply never populate. Stamping the
     asset URLs with the files' mtimes means a deploy busts the cache exactly
     when something changed, and never otherwise. */
  const assetV = (() => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const stamp = ['public/js/reports.js', 'public/css/reports.css']
      .map((f) => {
        try { return fs.statSync(path.join(root, f)).mtimeMs; } catch { return 0; }
      })
      .reduce((a, b) => a + b, 0);
    return String(Math.round(stamp)).slice(-10);
  })();

  /** Shared guard: auth, then a clear error if PostHog reads aren't wired. */
  const gate = async (req, reply) => {
    if (!requireAuth(req, reply)) return false;
    if (!config.reports.enabled) {
      reply.code(503).send({ error: 'POSTHOG_API_KEY is not set — the dashboard cannot read PostHog.' });
      return false;
    }
    return true;
  };

  /* ── The page shell ──────────────────────────────────────────────────────
     Renders empty and fetches its own data, so a slow ClickHouse query shows a
     loading state instead of holding the response open for 20 seconds. */
  app.get('/reports', async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const { days, site } = params(req.query);
    return reply
      // Analytics about my visitors should not sit in a shared cache anywhere
      // between here and the browser.
      .header('Cache-Control', 'no-store')
      .header('X-Robots-Tag', 'noindex, nofollow')
      .view('reports', {
        page: 'reports',
        days,
        site,
        windows: WINDOWS,
        sites: Object.entries(SITES).map(([k, v]) => ({ key: k, label: v.label })),
        configured: config.reports.enabled,
        assetV,
        year: new Date().getFullYear(),
      });
  });

  /* ── Aggregates ──────────────────────────────────────────────────────────
     One request, several queries, run concurrently. Each is independently
     cached by its SQL text, so switching site and switching back is free. */
  app.get('/api/reports/summary', async (req, reply) => {
    if (!(await gate(req, reply))) return reply;
    const { days, site } = params(req.query);
    const where = scope({ site, days });
    const opts = { ttlMs };

    try {
      const [totals, daily, byEvent, bySite, pages, referrers, devices, countries, concepts] =
        await Promise.all([
          rows(`SELECT count() AS events, uniq($session_id) AS sessions, uniq(person_id) AS visitors,
                       countIf(event = '$pageview') AS pageviews
                  FROM events WHERE ${where}`, opts),

          rows(`SELECT toDate(timestamp) AS day, ${SITE_EXPR} AS site,
                       count() AS events, uniq(person_id) AS visitors
                  FROM events WHERE ${where}
                 GROUP BY day, site ORDER BY day ASC`, opts),

          rows(`SELECT event, ${SITE_EXPR} AS site, count() AS c, max(timestamp) AS last_seen
                  FROM events WHERE ${where}
                 GROUP BY event, site ORDER BY c DESC LIMIT 60`, opts),

          rows(`SELECT ${SITE_EXPR} AS site, count() AS events,
                       uniq(person_id) AS visitors, uniq($session_id) AS sessions
                  FROM events WHERE ${where} GROUP BY site ORDER BY events DESC`, opts),

          rows(`SELECT ${SITE_EXPR} AS site, properties.$pathname AS path,
                       count() AS views, uniq(person_id) AS visitors
                  FROM events WHERE ${where} AND event = '$pageview'
                 GROUP BY site, path ORDER BY views DESC LIMIT 25`, opts),

          rows(`SELECT properties.$referring_domain AS source, count() AS c, uniq(person_id) AS visitors
                  FROM events WHERE ${where} AND event = '$pageview'
                 GROUP BY source ORDER BY c DESC LIMIT 15`, opts),

          rows(`SELECT properties.$device_type AS device, properties.$browser AS browser, count() AS c
                  FROM events WHERE ${where} GROUP BY device, browser ORDER BY c DESC LIMIT 15`, opts),

          rows(`SELECT properties.$geoip_country_name AS country, count() AS c, uniq(person_id) AS visitors
                  FROM events WHERE ${where} GROUP BY country ORDER BY c DESC LIMIT 15`, opts),

          // Immersive only: which of the three doors people actually walk through.
          rows(`SELECT properties.concept AS concept, count() AS c, uniq(person_id) AS visitors
                  FROM events WHERE ${where} AND properties.concept IS NOT NULL
                 GROUP BY concept ORDER BY c DESC LIMIT 10`, opts),
        ]);

      return reply.header('Cache-Control', 'no-store').send({
        ok: true,
        days,
        site,
        cached: totals.cached,
        totals: totals.rows[0] ?? { events: 0, sessions: 0, visitors: 0, pageviews: 0 },
        daily: daily.rows,
        byEvent: byEvent.rows,
        bySite: bySite.rows,
        pages: pages.rows,
        referrers: referrers.rows.map((r) => ({ ...r, source: referrer(r.source) })),
        devices: devices.rows,
        countries: countries.rows,
        concepts: concepts.rows,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      req.log.error({ err: err.message, code: err.code }, 'reports summary failed');
      return reply.code(502).send({ error: err.message, code: err.code ?? 'UNKNOWN' });
    }
  });

  /* ── The raw log ─────────────────────────────────────────────────────────
     The point of the page. Every event, newest first, with the properties that
     were captured deliberately rather than PostHog's internals. */
  app.get('/api/reports/events', async (req, reply) => {
    if (!(await gate(req, reply))) return reply;
    const { days, site } = params(req.query);
    const limit = int(req.query.limit, { min: 1, max: 500, fallback: 150 });

    const filters = [scope({ site, days })];
    // Event name filter. Interpolated, so it is escaped — and capped, so a
    // pathological value can't be used to pad a query.
    if (req.query.event) filters.push(`event = ${lit(String(req.query.event).slice(0, 200))}`);
    // Keyset pagination on timestamp: a plain OFFSET re-scans everything, and
    // new events arriving mid-scroll would shift rows under the reader.
    if (req.query.before) {
      const ts = new Date(req.query.before);
      if (!Number.isNaN(ts.getTime())) filters.push(`timestamp < ${lit(ts.toISOString())}`);
    }

    try {
      const { rows: log, cached } = await rows(
        `SELECT timestamp, event, ${SITE_EXPR} AS site, distinct_id, $session_id AS session_id,
                properties.$pathname AS path, properties.$device_type AS device,
                properties.$geoip_country_name AS country,
                toJSONString(properties) AS props
           FROM events WHERE ${filters.join(' AND ')}
          ORDER BY timestamp DESC LIMIT ${limit}`,
        // The live log is the one panel where staleness is obvious to the
        // reader, so it gets a much shorter TTL than the aggregates.
        { ttlMs: 15_000 },
      );

      const events = log.map((r) => {
        const { custom, meta } = splitProps(r.props);
        return {
          timestamp: r.timestamp,
          event: r.event,
          site: r.site,
          path: r.path || meta.$pathname || '/',
          device: r.device || meta.$device_type || null,
          browser: meta.$browser ?? null,
          country: r.country || meta.$geoip_country_name || null,
          referrer: referrer(meta.$referring_domain),
          // Truncated: these are only ever shown as a short identifier, and the
          // full value is a stable cross-session id I have no reason to render.
          person: String(r.distinct_id ?? '').slice(0, 8),
          session: String(r.session_id ?? '').slice(0, 8),
          props: custom,
        };
      });

      return reply.header('Cache-Control', 'no-store').send({
        ok: true,
        days,
        site,
        limit,
        cached,
        count: events.length,
        // Cursor for the next page; null when this page wasn't full.
        next: events.length === limit ? events[events.length - 1].timestamp : null,
        events,
      });
    } catch (err) {
      req.log.error({ err: err.message, code: err.code }, 'reports events failed');
      return reply.code(502).send({ error: err.message, code: err.code ?? 'UNKNOWN' });
    }
  });

  /* ── Weekly report archive ───────────────────────────────────────────────
     The live panels above answer "what is happening". The weekly job writes
     the other half — a narrative read of the week with recommendations — and
     drops the rendered HTML into archiveDir. This is what actually gets read
     when the dashboard is only opened once a week. */

  app.get('/api/reports/archive', async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const dir = config.reports.archiveDir;

    // Not an error: it just means the weekly job has not landed one yet.
    if (!fs.existsSync(dir)) {
      return reply.header('Cache-Control', 'no-store').send({ ok: true, dir, count: 0, files: [] });
    }
    try {
      const files = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && !e.name.startsWith('.') && /\.(html?|md)$/i.test(e.name))
        .map((e) => {
          const stat = fs.statSync(path.join(dir, e.name));
          return {
            name: e.name,
            ext: path.extname(e.name).slice(1).toLowerCase(),
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));
      return reply.header('Cache-Control', 'no-store').send({ ok: true, dir, count: files.length, files });
    } catch (err) {
      req.log.error({ err: err.message }, 'reports archive listing failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  app.get('/api/reports/archive/file', async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const dir = path.resolve(config.reports.archiveDir);
    const name = String(req.query.name ?? '');
    if (!name) return reply.code(400).send({ error: 'name is required' });

    // basename() first, then confirm the resolved path is still inside dir.
    // Either check alone has been enough to serve /etc/passwd in some server;
    // together they close both the "../" and the symlink-shaped variants.
    const resolved = path.resolve(dir, path.basename(name));
    if (!resolved.startsWith(dir + path.sep) || !fs.existsSync(resolved)) {
      return reply.code(404).send({ error: 'No such report.' });
    }

    const type = resolved.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8';
    return reply
      .header('Cache-Control', 'no-store')
      .header('X-Robots-Tag', 'noindex, nofollow')
      // The report is generated by my own job, but it is still a whole HTML
      // document rendered in an iframe on this origin — sandbox it so a future
      // template change cannot reach back into the dashboard.
      .header('Content-Security-Policy', "default-src 'self' 'unsafe-inline' data:; script-src 'none'")
      .type(type)
      .send(fs.createReadStream(resolved));
  });

  /** Drop the cache so the next load hits ClickHouse. */
  app.post('/api/reports/refresh', async (req, reply) => {
    if (!(await gate(req, reply))) return reply;
    clearCache();
    return reply.send({ ok: true });
  });

  app.log.info({ locked: config.reports.locked, enabled: config.reports.enabled }, 'reports registered');
}
