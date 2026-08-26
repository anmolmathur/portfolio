/**
 * Runtime configuration.
 *
 * Hostnames and ids live here (and in content/site.json) because they are not
 * secret. Anything that IS secret — API keys, tokens — is read from the
 * environment only, and must never be committed or sent to a chat transcript.
 */
const env = process.env;

const bool = (v, fallback = false) =>
  v === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(v));

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  isProd: env.NODE_ENV === 'production',

  /** Open WebUI — the avatar's agent tier. */
  agent: {
    baseUrl: (env.OPENWEBUI_URL ?? 'https://ai.anmolmathur.com').replace(/\/+$/, ''),
    model: env.OPENWEBUI_MODEL ?? 'portfolio-website-helper',
    apiKey: env.OPENWEBUI_API_KEY ?? '',
    knowledgeId: env.OPENWEBUI_KNOWLEDGE_ID ?? '',
    timeoutMs: Number(env.AGENT_TIMEOUT_MS ?? 12000),
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  /** PostHog — proxied first-party so ad-blockers and ITP don't eat it. */
  analytics: {
    posthogHost: (env.POSTHOG_HOST ?? 'https://posthog.anmolmathur.com').replace(/\/+$/, ''),
    posthogKey: env.POSTHOG_PROJECT_KEY ?? '',
    proxyPath: env.POSTHOG_PROXY_PATH ?? '/ingest',
    gaId: env.GA_MEASUREMENT_ID ?? 'G-12VK07Q8CB',
    enabled: bool(env.ANALYTICS_ENABLED, true),
    get posthogEnabled() {
      return this.enabled && Boolean(this.posthogKey);
    },
  },

  /**
   * Text to speech.
   *
   * Gemini TTS, per the site owner's choice. Two constraints drive the design:
   *   - No cloning. Gemini offers prebuilt voices only, as does OpenAI.
   *   - The free tier is ~15 requests/DAY, 3/minute. That is nowhere near
   *     enough to synthesize live during a conversation.
   *
   * So Gemini is used OFFLINE to pre-render every fixed line into the
   * content-addressed clip cache, which then serves them instantly at zero
   * runtime cost. Live/novel answers fall through to the browser's own
   * speechSynthesis, which is free, instant and needs no key. See VOICE.md.
   */
  tts: {
    provider: env.TTS_PROVIDER ?? 'gemini',
    geminiKey: env.GEMINI_API_KEY ?? '',
    model: env.TTS_MODEL ?? 'gemini-2.5-flash-preview-tts',
    voice: env.TTS_VOICE ?? 'Charon',
    speed: Number(env.TTS_SPEED ?? 1),
    cacheDir: env.TTS_CACHE_DIR ?? 'public/guide/clips',
    /** Offline pre-render only — never called on the request path. */
    prerenderOnly: bool(env.TTS_PRERENDER_ONLY, true),
    /** Free-tier ceilings, used to pace the pre-render script. */
    freeTier: { requestsPerMinute: 3, requestsPerDay: 15 },
    get enabled() {
      return Boolean(this.geminiKey);
    },
  },
};

/** Non-secret values safe to expose to the browser. */
export function publicConfig() {
  return {
    analytics: {
      posthogKey: config.analytics.posthogKey,
      proxyPath: config.analytics.proxyPath,
      gaId: config.analytics.gaId,
      enabled: config.analytics.posthogEnabled,
    },
  };
}

/** Startup summary — logs what is wired without ever printing a secret. */
export function describeConfig() {
  return {
    agent: {
      url: config.agent.baseUrl,
      model: config.agent.model,
      key: config.agent.apiKey ? 'set' : 'MISSING',
      enabled: config.agent.enabled,
    },
    analytics: {
      posthog: config.analytics.posthogHost,
      projectKey: config.analytics.posthogKey ? 'set' : 'MISSING',
      proxy: config.analytics.proxyPath,
      ga: config.analytics.gaId,
      enabled: config.analytics.posthogEnabled,
    },
    tts: {
      provider: config.tts.provider,
      model: config.tts.model,
      key: config.tts.geminiKey ? 'set' : 'MISSING',
      mode: config.tts.prerenderOnly ? 'pre-render only (free tier: 15 req/day)' : 'live',
    },
  };
}
