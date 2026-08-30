/* Guide — quick intents. Tier 1 of the answer ladder.
 *
 * references/brain.md: the ladder runs quick intents -> BM25 -> LLM RAG, and
 * cheapest first is the point. "hi" should not cost a retrieval pass and a
 * model call, and "thanks" should not be answered with a CV excerpt.
 *
 * Everything here is local, synchronous and offline. A miss returns null and
 * the question falls through to the server, which is the only path that can
 * reach the model.
 */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});

  /* THE TRAP, named in the reference: yes-detection must match the WHOLE
     message. A sloppy /yes/ test matches "show me the dashboard" (no "yes" in
     sight, but sloppier patterns like /ok/ match "look"), and the guide then
     accepts an offer the visitor never made. Anchored, whole-message only. */
  var YES = /^(yes|yeah|yep|yup|sure|ok|okay|go on|please do|sounds good)[.! ]*$/i;
  var NO = /^(no|nope|nah|no thanks|not now)[.! ]*$/i;

  var RULES = [
    {
      id: 'greeting',
      test: /^(hi|hey|hello|yo|good (morning|afternoon|evening)|namaste)\b[\s!.,]*$/i,
      reply: function (copy) { return copy.greeting; },
      gesture: 'wave',
    },
    {
      id: 'thanks',
      test: /^(thanks|thank you|thanks a lot|cheers|ta|much appreciated)[\s!.,]*$/i,
      reply: function () { return 'You’re welcome. Anything else you’d like to know?'; },
      gesture: 'nod',
    },
    {
      id: 'bye',
      test: /^(bye|goodbye|see you|that's all|thats all|done)[\s!.,]*$/i,
      reply: function () { return 'Thanks for stopping by.'; },
      gesture: 'nod',
    },
    {
      id: 'capability',
      test: /^(what can you do|who are you|what are you|help|how does this work|what is this)[\s?.!]*$/i,
      reply: function () {
        return 'I answer questions about Anmol using only what is written on this site — '
          + 'his roles, skills, education, projects, publications and how to reach him. '
          + 'If something is not on the site, I will say so rather than guess.';
      },
      gesture: 'explain',
    },
    {
      id: 'affirm',
      test: YES,
      reply: function () { return 'What would you like to know?'; },
      gesture: 'offer',
    },
    {
      id: 'decline',
      test: NO,
      reply: function () { return 'No problem. I’m here if you change your mind.'; },
      gesture: 'nod',
    },
  ];

  /**
   * @returns {null|{answer,source,gesture,sources}} null = fall through.
   */
  function quickIntent(question, copy) {
    var q = String(question || '').trim();
    // Only short messages are considered. "Hi, can you tell me what he did at
    // HSBC?" opens with a greeting but is plainly a real question, and
    // answering it with "Hello!" would be worse than useless.
    if (!q || q.length > 40) return null;
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].test.test(q)) {
        return {
          ok: true,
          source: 'intent:' + RULES[i].id,
          grounded: true,
          answer: RULES[i].reply(copy || {}),
          gesture: RULES[i].gesture,
          sources: [],
        };
      }
    }
    return null;
  }

  G.quickIntent = quickIntent;
  G.isAffirmative = function (s) { return YES.test(String(s || '').trim()); };
})();
