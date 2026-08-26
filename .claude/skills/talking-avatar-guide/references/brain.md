# Brain — grounded answering, retrieval, guardrails

Core principle: **the avatar never free-generates about the app.** Every spoken claim traces to vetted content (help articles, an audited app map) or a live-data tool the server controls. A guide that invents UI ("collapsible sidebar" that doesn't exist) is worse than no guide.

## Answer ladder (cheapest first)

```
1. Quick intents  — local regex: greetings, "yes" to an offered tour, mute,
                    aspiration → funnel (see architecture.md §B2C patterns)
2. BM25 verbatim  — retrieval over the site's own help content; speak the vetted
                    copy as-is (site-machinery questions: "how do I compare?")
3. LLM RAG route  — optional: LLM answers ONLY from retrieved excerpts + site map
4. Catalogue agent — product/entity questions ("does X university have an MBA?",
                     "what does it cost?") to a server-proxied agent grounded in
                     the live catalogue DB (see §Tier 4 guardrails)
```

Every tier falls back DOWN on failure (timeout, offline, bad JSON, no key) — tier 2 is the floor and always works offline. `enabled` flags per tier in config.

Quick-intent traps: YES-detection must whole-message match (`/^(yes|yeah|sure|ok)[.! ]*$/i`) — "show me the dashboard" contains no yes but sloppy patterns matched it as accepting an offered tour.

## Tier 2 — BM25 retrieval (the workhorse)

- Index unit = article SECTION (H2-level), not whole articles. Fields: title + body, keywords boost.
- Light stemmer matters: "import"/"importing" must meet. ~30 lines of suffix stripping is enough; no library needed.
- Score gate: below `MIN_ANSWER_SCORE` (~1.2) → honest "I don't have that" + suggestions, never a wrong answer.
- **Topic gate on top of the score**: a section may only answer when at least one query token also appears in that section's heading / article title / keywords. Without it, rare prose words score junk matches — "tell me about Jain University" once won a corporate-partnership section purely on "tell" and "about".
- Route by QUESTION, not by page: classify the question itself (site-machinery → local BM25; domain-catalogue/entity → live agent; unknown → agent, because a doc index can't say "I don't know" convincingly). Page-based routing gives the same question different answers on different pages — users notice.
- A domain question with the agent tier down falls back to the honest miss, never to the nearest article.
- Input = ONLY the content lists the host page passed. If anything is gated, filter upstream of the index — the brain then physically cannot leak it.
- Spoken answer = section copy trimmed to whole sentences under the spoken-chars cap; action = open that article/anchor.

## Tier 3 — LLM RAG route

Client sends: question + top-K (~4) BM25 excerpts + screen context + rolling history (~6 turns) + persona `tone`. Server route (key server-side, session-gated, JSON mode) returns:

```json
{ "speech": "...", "article_slug": "...|null", "anchor": "...|null",
  "offer_tour_id": "...|null", "covered": true }
```

Guardrails that each fixed a real hallucination/incident:

1. **Server drops unknown ids** — any `article_slug`/`offer_tour_id` not in the request's own lists is nulled. The model cannot invent navigation.
2. **APP_MAP with layout ground truth** in the system prompt — audited facts: navigation model, which screens have side panels (and which do NOT), header contents, key shortcuts, per-screen tab lists. Without explicit layout facts the model invents generic chrome ("collapsible left sidebar") because your prompt vocabulary primed it.
3. **Hard rule text**: never describe layout beyond APP_MAP/excerpts; never carry elements from one screen to another; unsure → omit.
4. **Watch the excerpts themselves**: a doc section describing OTHER screens' sidebars became hallucination fuel for a screen without one — docs must state exceptions explicitly ("Dashboard is the exception: no side navigation").
5. `covered: false` → fall back to tier 2/honest-miss (or hand to tier 4).
6. Client timeout (~12s) → tier 2 answer. Guard stale async: token per ask, resolution checked against current token before delivering.
7. Persona `tone` → route validates against a whitelist and appends the matching PERSONALITY block — one brain, two characters.

## Screen context (the "what am I looking at" briefing)

Collector runs at ask-time, feeds the LLM:

- route (sanitized to a page id), page title, active in-page panel, login state, open-dialog flag, locale time. On product/entity pages, the server can build a DB dossier from the request URL (fees, duration, university for `/programs/{slug}`) — the agent then answers "what does THIS cost?" from ground truth.
- **Selected tabs**: `[role=tab][aria-selected=true]` PLUS app-specific selectors — custom tab divs (`.tab-button.active-tab` etc.) are invisible to the ARIA collector. Send BOTH `selected_tabs` and `visible_tabs` (cap ~8), with the prompt rule: question matches a visible tab name (even misspelled) → it IS a tab on this screen, explain it as such.
- **PII rule: UI vocabulary only** — widget labels and tab names, never record data or dialog contents.
- Whitelist which routes have a meaningful "active panel" — stale panel state from another screen (e.g. lingering "Profile") misleads the model badly.
- Available site sections for this visitor (cap ~12) + rule: section not in the list → say it isn't available, never describe it.
- Pass the collector as a callback read through a ref — the brain instance must NOT rebuild when screen info changes (rebuilding wipes conversation history).

**Typo-proof screen boost**: BM25 misses misspelled questions ("performace"), so the current screen's article section is ALWAYS appended to the excerpt set (route-slug match, replaces the last retrieval slot). Route→article and panel→article maps boost the obvious doc for wherever the user is standing.

## Tier 4 — catalogue agent guardrails (each fixed a real incident)

If the guide proxies a hosted agent/RAG service (Open WebUI etc.) for product/catalogue questions:

1. **The agent fabricates domain facts confidently.** Asked about an institution not in the catalogue at all, it invented named programs with specific fees. Never treat an agent answer as evidence about your data — check the DB. And never repeat an agent claim to a stakeholder as fact (this mistake was made, out loud).
2. **Inject ground truth server-side for entities named in the QUESTION**, not just the current page: entity in catalogue → prepend a facts block from the DB; entity NOT in catalogue → prepend the opposite instruction ("no partner by that name; do not describe it; state no fees").
3. **Match entity names by DISTINCTIVE TOKENS, never substring** — the catalogue says "JAIN (Deemed-to-be University)", the visitor types "Jain university", substring finds nothing, and the guard then falsely denies a real partner with 24 courses. A row matches when every distinctive word of its name (noise words stripped: university/college/of/the/deemed) appears in the question; bracketed ALL-CAPS aliases count as alternative names; ties break to the shortest name. Pure function, unit-tested without a DB.
4. **A lookup miss is not proof of absence.** Inactive rows, name variants, and matcher bugs all return "no match" — phrase the injected denial from a verified query, and never let the entity guard fire on general questions ("which universities do you have") or the guide starts denying real partners.
5. Drop zeroed numeric columns from injected facts — 0 means "not recorded" and goes out as "0% placement".
6. Retrieval on the hosted side is **non-deterministic** — the same question can answer fully twice and be refused once. Any verification probe must ask 3+ times and treat a refusal as a non-answer, or it green-lights a broken setup.
7. Two answer renditions: `speech` (sentence-safe trim ~700 chars + "ask me for more detail" closer) and `text` (longer, for the bubble). The bubble shows text, the voice says speech; scale the bubble's linger time by the unspoken characters.

## Conversation behaviors

- Rolling history (~12 turns kept, ~6 sent) so follow-ups resolve.
- Tour offers: answer sets `offeredTourId` + `listenAfter` → engine auto-opens mic after speaking (voice mode); "yes" launches, anything else clears the offer.
- Clear the previous reply BEFORE the async ask (thinking state shows fresh, old answer doesn't linger).
- Answers that would navigate: only auto-open articles when already on the help/docs route; elsewhere answer in place.
- Write a help article about the guide ITSELF (what it can do, controls, privacy, how to phrase questions) and index it — users ask the guide about the guide. A "how to ask" info card in the panel helps too; keep it end-user language, zero internals.
