/**
 * Content-versioned static assets.
 *
 * The problem this fixes, observed twice while building the guide: `site.css`
 * was served with `max-age=14400` and no version in its URL, so a CSS change
 * did not reach a returning visitor — or a browser that had the file — for up
 * to four hours. During development it presented as "the fix didn't deploy",
 * and the only way through was to hand-bust the stylesheet.
 *
 * The fix is the one already used for the guide bundle: derive a version from
 * the file's mtime and put it in the URL. A changed file gets a new URL, so
 * the response can be pinned forever and a deploy is picked up immediately.
 * Deriving it from the file means nobody has to remember to bump anything.
 */
import fs from 'node:fs';
import path from 'node:path';

export function createAssetVersions(root) {
  const publicDir = path.join(root, 'public');
  const cache = new Map();

  function version(urlPath) {
    // In production the container is immutable, so compute once. In dev, stat
    // every time so an edit shows up on refresh.
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && cache.has(urlPath)) return cache.get(urlPath);
    let v = '0';
    try {
      const file = path.join(publicDir, urlPath.replace(/^\/+/, '').split('?')[0]);
      // Refuse to stat outside public/ — urlPath comes from templates today,
      // but a traversal here would be a file-existence oracle.
      if (file.startsWith(publicDir)) {
        v = Math.floor(fs.statSync(file).mtimeMs).toString(36);
      }
    } catch (e) {
      // A missing file still renders; it just gets no version. Better a stale
      // asset than a 500 on every page.
      v = '0';
    }
    if (isProd) cache.set(urlPath, v);
    return v;
  }

  /** `assetUrl('/css/site.css')` -> `/css/site.css?v=mtfnw7pn` */
  function assetUrl(urlPath) {
    const v = version(urlPath);
    return v === '0' ? urlPath : `${urlPath}?v=${v}`;
  }

  /**
   * Requests carrying the CURRENT version are safe to cache forever; anything
   * else must revalidate, so an un-versioned or stale URL cannot pin an old
   * file. Applied as a hook because @fastify/static's `maxAge` cannot see the
   * query string.
   */
  function register(app) {
    app.addHook('onSend', async (req, reply, payload) => {
      const url = req.raw.url || '';
      if (!/^\/(css|js|fonts)\//.test(url)) return payload;
      const q = url.indexOf('?');
      if (q === -1) return payload;
      const params = new URLSearchParams(url.slice(q + 1));
      const asked = params.get('v');
      if (!asked) return payload;
      if (asked === version(url.slice(0, q))) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
      return payload;
    });
  }

  return { assetUrl, version, register };
}
