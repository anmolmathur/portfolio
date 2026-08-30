/**
 * Versioned ES module graph for the avatar stage.
 *
 * The problem: ES modules import each other by relative specifier, so a `?v=`
 * on the entry URL never reaches its dependencies. `stage.js?v=abc` still
 * imports a bare `./animator.js`, and the browser happily serves a cached one.
 * This cost real time during phase 3 — the rest pose was written, deployed and
 * verified in the served file, while the browser kept running the previous
 * animator and the arms stayed in a T-pose.
 *
 * Serving `Cache-Control: max-age=0` instead does not work here either:
 * Cloudflare's Browser Cache TTL rewrites short origin max-ages upward (a `0`
 * came back as `14400`), so the edge, not the origin, decides.
 *
 * The fix that does not depend on anyone's dashboard: rewrite relative import
 * specifiers on the way out, stamping the same version onto every edge of the
 * graph. Every URL then carries a version, a changed file changes every URL
 * that reaches it, and the responses can be immutable.
 */
import fs from 'node:fs';
import path from 'node:path';

const PREFIX = '/js/guide/stage/';

export function createStageModules(root) {
  const dir = path.join(root, 'public', 'js', 'guide', 'stage');

  function computeVersion() {
    let newest = 0;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.js')) continue;
      const { mtimeMs } = fs.statSync(path.join(dir, name));
      if (mtimeMs > newest) newest = mtimeMs;
    }
    return Math.floor(newest).toString(36);
  }

  // Immutable in production, re-read in dev so an edit lands on refresh.
  let cached = process.env.NODE_ENV === 'production' ? computeVersion() : null;
  const version = () => cached ?? computeVersion();

  /* Rewrites `from './x.js'` / `from "../y/z.js"` to carry ?v=. Bare
     specifiers ("three", "three/addons/...") are left alone — they resolve
     through the import map and are versioned by their own vendored path. */
  function stamp(code, v) {
    return code.replace(
      /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.[^'"]+?\.js)\2/g,
      (_m, lead, quote, spec) => `${lead}${quote}${spec}?v=${v}${quote}`,
    );
  }

  return {
    get version() { return version(); },
    entryUrl() { return `${PREFIX}stage.js?v=${version()}`; },
    register(app) {
      app.addHook('onSend', async (req, reply, payload) => {
        const url = req.raw.url || '';
        if (!url.startsWith(PREFIX) || !url.includes('.js')) return payload;

        const v = version();
        const asked = new URLSearchParams(url.split('?')[1] || '').get('v');

        // Only a request carrying the current version may be pinned; anything
        // else must revalidate so a stale URL cannot become permanent.
        reply.header('Cache-Control', asked === v
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate');

        // @fastify/static streams files; read it back so we can rewrite.
        const file = path.join(dir, path.basename(url.split('?')[0]));
        if (!file.startsWith(dir) || !fs.existsSync(file)) return payload;
        if (payload && typeof payload.destroy === 'function') payload.destroy();

        const code = stamp(fs.readFileSync(file, 'utf8'), v);
        reply.header('Content-Length', Buffer.byteLength(code));
        return code;
      });
    },
  };
}
