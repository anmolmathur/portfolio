/**
 * Guarded URL fetch, for the job-description matcher.
 *
 * This is the only place on the site where a VISITOR can make the server issue
 * an outbound request, which makes it a server-side request forgery surface.
 * Anyone can paste a URL into the chat; without the checks below they could
 * point it at the Docker host, at other containers on the shared network, or
 * at a cloud metadata endpoint, and read the response back out of the chat
 * bubble. The box runs PostgreSQL, Qdrant, PostHog and OpenWebUI on that same
 * network, so this is not hypothetical.
 *
 * The guards, and why each one is there:
 *
 *   scheme      only http/https — file:, gopher: and friends read local disk
 *   DNS         resolved and checked BEFORE connecting, because a hostname
 *               under the visitor's control can point at 127.0.0.1
 *   every hop   redirects are followed manually and re-checked, since a public
 *               URL is free to redirect to a private one (a DNS-rebind and
 *               redirect bypass is the classic way past a naive check)
 *   size        capped while streaming, so a huge response cannot exhaust memory
 *   time        capped, so a slow endpoint cannot hold a worker open
 *   type        only html/text — no point pulling a binary into a prompt
 */
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;

/** RFC1918, loopback, link-local, CGNAT, unique-local, and friends. */
export function isPrivateAddress(ip) {
  const v = net.isIP(ip);
  if (!v) return true;                       // unresolvable -> treat as unsafe
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;   // link-local + AWS metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;  // CGNAT
    if (p[0] >= 224) return true;            // multicast / reserved
    return false;
  }
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true;
  if (s.startsWith('fe80')) return true;     // link-local
  if (s.startsWith('fc') || s.startsWith('fd')) return true;   // unique-local
  // ::ffff:10.0.0.1 — an IPv4 address wearing an IPv6 coat
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
}

async function assertPublic(urlObj) {
  if (!/^https?:$/.test(urlObj.protocol)) {
    throw new Error('only http and https links are supported');
  }
  // A bare IP in the URL never reaches DNS, so check it directly too.
  const host = urlObj.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateAddress(host)) {
    throw new Error('that address is not reachable from here');
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    throw new Error('that hostname could not be resolved');
  }
  // ALL resolved addresses must be public: one private answer is enough for a
  // rebinding attack to land on the private one.
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error('that address is not reachable from here');
  }
}

/**
 * @returns {Promise<{url: string, text: string, title: string}>}
 */
export async function fetchReadable(rawUrl) {
  let current;
  try {
    current = new URL(String(rawUrl).trim());
  } catch (e) {
    throw new Error('that does not look like a valid link');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let res;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertPublic(current);
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Identify honestly. Some sites will refuse this, which is their
          // right; pretending to be a browser to get around that is not our
          // call to make on someone else's server.
          'User-Agent': 'anmolmathur.com-jd-reader/1.0 (+https://anmolmathur.com)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current);
        continue;
      }
      break;
    }

    if (!res.ok) {
      throw new Error(`the page returned ${res.status}`);
    }
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type && !/text\/html|text\/plain|application\/xhtml/.test(type)) {
      throw new Error('that link is not a web page');
    }

    // Stream with a hard cap rather than res.text(), so an enormous or
    // never-ending body cannot be pulled into memory.
    const reader = res.body?.getReader();
    if (!reader) throw new Error('the page returned nothing');
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { reader.cancel(); break; }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    return { url: current.toString(), ...extractText(html) };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('that page took too long to respond');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Crude but sufficient: strip chrome, keep readable text. */
export function extractText(html) {
  const titleMatch = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1]).trim().slice(0, 200) : '';

  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|header|footer|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return { title, text: decode(text).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim() };
}

function decode(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
}
