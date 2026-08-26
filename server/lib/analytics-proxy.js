import { config } from './config.js';

/**
 * First-party PostHog proxy.
 *
 * Ad-blockers and Safari's ITP block requests to known analytics hostnames.
 * A portfolio aimed at technologists has an unusually high share of visitors
 * running blockers, so the default third-party snippet would under-report
 * exactly the audience that matters most. Proxying through our own origin
 * fixes that, and removes any cross-origin/CORS handling.
 *
 * Hand-rolled rather than pulling in a proxy dependency: it's one fetch, and
 * fewer dependencies on the request path is worth more than the convenience.
 */
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

export function registerAnalyticsProxy(app) {
  const { proxyPath, posthogHost } = config.analytics;
  if (!config.analytics.enabled) {
    app.log.warn('analytics disabled — /ingest proxy not registered');
    return;
  }

  app.all(`${proxyPath}/*`, async (req, reply) => {
    const suffix = req.url.slice(proxyPath.length);
    const target = `${posthogHost}${suffix}`;

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
    }
    // PostHog routes static assets and ingestion by Host; send it its own.
    headers.host = new URL(posthogHost).host;

    let upstream;
    try {
      upstream = await fetch(target, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.rawBody ?? JSON.stringify(req.body),
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      // Analytics must never take the page down with it.
      req.log.warn({ err: err.message, target }, 'analytics proxy failed');
      return reply.code(202).send();
    }

    for (const [k, v] of upstream.headers) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) reply.header(k, v);
    }
    return reply.code(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  });

  app.log.info({ proxyPath, posthogHost }, 'analytics proxy registered');
}
