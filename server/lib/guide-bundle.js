/**
 * Guide bundle — one request for the whole classic-script feature.
 *
 * The pattern is from references/architecture.md §Server-rendered apps: serve
 * the feature's files as a single bundle from a tiny route, in a
 * config-declared order, with an immutable cache and a key derived from the
 * newest source mtime.
 *
 * The mtime key is the part that matters in practice. With a hand-set version
 * string, someone edits panel.js, ships, and visitors keep running the cached
 * copy until a human remembers to bump a number — a class of bug that looks
 * like "the fix didn't deploy". Deriving the key from the files themselves
 * makes that impossible to get wrong.
 */
import fs from 'node:fs';
import path from 'node:path';

// Order matters: config defines the namespace, engine and panel attach to it,
// launcher runs last because it mounts immediately.
const FILES = ['config.js', 'engine.js', 'panel.js', 'launcher.js'];

export function createGuideBundle(root) {
  const dir = path.join(root, 'public', 'js', 'guide');

  function read() {
    let newest = 0;
    const parts = FILES.map((name) => {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      return `/* ${name} */\n${fs.readFileSync(file, 'utf8')}`;
    });
    return {
      code: parts.join('\n;\n'),
      version: Math.floor(newest).toString(36),
    };
  }

  // Built once at boot in production; the container is immutable, so the files
  // cannot change under a running process. In dev, re-read every request so an
  // edit shows up on refresh — the same asymmetry the template cache has.
  const cached = process.env.NODE_ENV === 'production' ? read() : null;
  const current = () => cached ?? read();

  return {
    get version() { return current().version; },
    register(app) {
      app.get('/js/guide/bundle.js', async (req, reply) => {
        const { code, version } = current();
        // The URL carries ?v=<version>, so the response is safe to pin
        // forever: a changed file changes the URL.
        return reply
          .type('application/javascript; charset=utf-8')
          .header('Cache-Control', req.query?.v === version
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate')
          .send(code);
      });
    },
  };
}
