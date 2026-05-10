// main.js — The Reading Room game logic.
// Vanilla JS, no build step. Forked from Games Workshop plain-canvas-dom template,
// but DOM-rendered (no canvas) because the whole game is text reading + free-text
// response.
//
// Architecture:
//   - state object (single source of truth)
//   - dispatch(action) — named-action reducer
//   - render() — re-derives DOM from state
//   - input handlers translate user events into dispatched actions
//   - one fetch per turn to the Cloudflare Worker proxy that wraps Anthropic

(function () {
  'use strict';

  const CONFIG = window.READING_ROOM_CONFIG;
  const SCENARIOS = window.SCENARIOS;
  const ROUND_SEQUENCE = window.ROUND_SEQUENCE;

  // ----- State -----
  const state = {
    screen: 'title', // 'title' | 'intro' | 'reveal' | 'priming' | 'reading' | 'response' | 'thinking' | 'feedback' | 'reflection'
    roundIdx: 0,
    studentResponse: '',
    feedback: null, // { evidenceCheck: 'PASS'|'FAIL'|'UNKNOWN', text, fromFallback }
    log: [], // [{ round, scenario, response, evidenceCheck, irisText, fromFallback }]
    apiHealthy: true,
  };

  // ----- Constants -----
  const FALLBACK_MESSAGES = [
    "I noticed you took your time with that — good. There's something in the way they're hesitating that's worth coming back to. Think about who they're protecting in how they're talking. We'll keep going.",
    "Reading that closely is the whole point. Notice how much of what you said came from specific words they used — that's the work. Onward.",
    "There's a lot in what you wrote. The thing I'd flag for next round is whether your read came from the text itself or from a story you brought in. Both happen — paying attention to which is which is the skill we're building.",
  ];

  // ----- Element refs -----
  const screen = document.getElementById('screen');
  const statusRegion = document.getElementById('status');
  const alertRegion = document.getElementById('alert');
  const helpModal = document.getElementById('help-modal');

  // ----- Live region announcements -----
  function announce(message) { statusRegion.textContent = message; }
  function alertNow(message) { alertRegion.textContent = message; }

  // ----- Dispatch -----
  function dispatch(action) {
    switch (action.type) {
      case 'START':
        state.screen = 'intro';
        break;
      case 'BEGIN_ROUNDS':
        state.screen = 'reveal';
        break;
      case 'CONTINUE_FROM_REVEAL': {
        // Skip priming screen unless the scenario has a priming warning.
        const r = ROUND_SEQUENCE[state.roundIdx];
        const sc = SCENARIOS[r.scenario];
        state.screen = sc.priming_warning ? 'priming' : 'reading';
        break;
      }
      case 'CONTINUE_FROM_PRIMING':
        state.screen = 'reading';
        break;
      case 'CONTINUE_FROM_READING':
        state.screen = 'response';
        break;
      case 'UPDATE_RESPONSE':
        state.studentResponse = action.value.slice(0, CONFIG.MAX_RESPONSE_CHARS);
        break;
      case 'SUBMIT_RESPONSE':
        state.screen = 'thinking';
        break;
      case 'FEEDBACK_RECEIVED':
        state.feedback = action.feedback;
        state.log.push({
          round: ROUND_SEQUENCE[state.roundIdx].round,
          scenario: ROUND_SEQUENCE[state.roundIdx].scenario,
          response: state.studentResponse,
          evidenceCheck: action.feedback.evidenceCheck,
          irisText: action.feedback.text,
          fromFallback: action.feedback.fromFallback,
        });
        state.screen = 'feedback';
        break;
      case 'NEXT_ROUND': {
        state.roundIdx += 1;
        state.studentResponse = '';
        state.feedback = null;
        if (state.roundIdx >= ROUND_SEQUENCE.length) {
          state.screen = 'reflection';
        } else {
          // Show the round-reveal card for every round (gives a beat between scenes).
          state.screen = 'reveal';
        }
        break;
      }
      case 'RESTART':
        state.screen = 'title';
        state.roundIdx = 0;
        state.studentResponse = '';
        state.feedback = null;
        state.log = [];
        state.apiHealthy = true;
        break;
      case 'API_DOWN':
        state.apiHealthy = false;
        break;
      default:
        console.warn('Unknown action', action);
        return;
    }
    render();
  }

  // ----- Render helpers -----
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'data') {
          for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
        } else {
          node.setAttribute(k, v);
        }
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function updateRoundTracker() {
    const currentRound = ROUND_SEQUENCE[state.roundIdx]?.round ?? 0;
    document.querySelectorAll('.round-pip').forEach((pip) => {
      const r = Number(pip.dataset.round);
      pip.classList.toggle('active', r === currentRound);
      pip.classList.toggle('done', r < currentRound);
    });
  }

  // ----- Screen renderers -----
  function renderTitle() {
    return el(
      'section',
      { class: 'card title-card' },
      el('h2', null, 'A short workshop on noticing'),
      el(
        'p',
        { class: 'subtitle' },
        'Year 12 Philosophy · Epistemology unit · "How do we know?"'
      ),
      el(
        'p',
        null,
        "Today's question is whether emotions can be a way of knowing — whether paying close emotional attention to another person tells us things that detached observation can't. We'll work through it by reading four short pieces."
      ),
      el(
        'p',
        null,
        'Take 50 minutes. Write what you actually think. The reflection at the end is yours to keep.'
      ),
      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: () => dispatch({ type: 'START' }) },
          'Begin'
        )
      )
    );
  }

  function renderIntro() {
    return el(
      'section',
      { class: 'card' },
      el('h2', null, 'Before we start: a small experiment'),
      el(
        'p',
        null,
        "In 1978 a psychologist called Dan Batson ran a study. He played a recorded interview with a young woman who'd just lost both parents. Half his students were told to listen analytically — pay attention to the broadcast quality, the technical production. The other half were told to imagine how she felt."
      ),
      el(
        'p',
        null,
        "Afterwards both groups were quietly offered a chance to volunteer time helping her. The 'imagine' group volunteered roughly three times as many hours."
      ),
      el(
        'p',
        null,
        "The two groups heard the same words. They came away with different knowledge of who she was."
      ),
      el(
        'p',
        { class: 'aside' },
        "That's the puzzle Martha Nussbaum is interested in. We'll come back to her at the end. Let's try the experiment ourselves first."
      ),
      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: () => dispatch({ type: 'BEGIN_ROUNDS' }) },
          "Let's go"
        )
      )
    );
  }

  function renderReveal() {
    // Generic "Round N" gateway — gives a beat between rounds.
    const round = ROUND_SEQUENCE[state.roundIdx];
    const scenario = SCENARIOS[round.scenario];
    return el(
      'section',
      { class: 'card reveal-card' },
      el('div', { class: 'round-label' }, `Round ${round.round}`),
      el('h2', null, scenario.title),
      el(
        'p',
        { class: 'aside' },
        round.round === 1
          ? "Read this once. Take your time. Don't rush. When you're ready, Iris will ask you what you noticed."
          : round.round === 4
          ? "There's a heads-up before this one. Read carefully."
          : "Read it once. When you're ready, write what you think is going on."
      ),
      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: () => dispatch({ type: 'CONTINUE_FROM_REVEAL' }) },
          'Continue'
        )
      )
    );
  }

  function renderPriming() {
    const round = ROUND_SEQUENCE[state.roundIdx];
    const scenario = SCENARIOS[round.scenario];
    // Defensive: if somehow we landed on priming without a warning, render a
    // single-button card that advances. Should not happen — dispatch routes
    // around it — but keeps the screen reachable rather than blank.
    if (!scenario.priming_warning) {
      return el(
        'section',
        { class: 'card' },
        el('p', null, 'No heads-up for this round.'),
        el('div', { class: 'button-row' },
          el('button', { type: 'button', class: 'primary', onClick: () => dispatch({ type: 'CONTINUE_FROM_PRIMING' }) }, 'Continue')
        )
      );
    }
    return el(
      'section',
      { class: 'card priming-card' },
      el('div', { class: 'round-label warn' }, 'Heads-up'),
      el('p', { class: 'priming-text' }, scenario.priming_text),
      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: () => dispatch({ type: 'CONTINUE_FROM_PRIMING' }) },
          'Read on'
        )
      )
    );
  }

  function renderReading() {
    const round = ROUND_SEQUENCE[state.roundIdx];
    const scenario = SCENARIOS[round.scenario];
    return el(
      'section',
      { class: 'card reading-card' },
      el('div', { class: 'round-label' }, `Round ${round.round} · ${scenario.title}`),
      el('p', { class: 'setup' }, scenario.setup),
      el('div', { class: 'stimulus', 'aria-label': 'Scenario text' }, scenario.text),
      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: () => dispatch({ type: 'CONTINUE_FROM_READING' }) },
          "I've read it"
        )
      )
    );
  }

  function renderResponse() {
    const round = ROUND_SEQUENCE[state.roundIdx];
    const scenario = SCENARIOS[round.scenario];
    const responseRef = { current: null };
    const charCountRef = { current: null };

    // Update char count via direct DOM write — DO NOT dispatch on every keystroke
    // (would re-render and destroy textarea focus/selection).
    const updateCount = () => {
      const len = responseRef.current?.value?.length || 0;
      if (charCountRef.current) {
        charCountRef.current.textContent = `${len} / ${CONFIG.MAX_RESPONSE_CHARS}`;
        charCountRef.current.classList.toggle('over', len >= CONFIG.MAX_RESPONSE_CHARS);
      }
    };

    const onSubmit = (e) => {
      e.preventDefault();
      // Read straight from the textarea — state.studentResponse may not have
      // been kept in sync (we deliberately don't dispatch on every keystroke).
      const text = (responseRef.current?.value || '').slice(0, CONFIG.MAX_RESPONSE_CHARS);
      if (!text.trim()) {
        alertNow('Write something first — even a sentence.');
        return;
      }
      // Persist directly (no extra render), then transition via dispatch.
      state.studentResponse = text;
      dispatch({ type: 'SUBMIT_RESPONSE' });
      requestIris();
    };

    const card = el(
      'section',
      { class: 'card response-card' },
      el('div', { class: 'round-label' }, `Round ${round.round} · ${scenario.title}`),
      el('details', { class: 'reread' },
        el('summary', null, 'Re-read the text'),
        el('div', { class: 'stimulus' }, scenario.text),
      ),
      el('p', { class: 'response-prompt' }, scenario.response_prompt),
      el(
        'form',
        { class: 'response-form', onSubmit },
        (function () {
          const ta = el('textarea', {
            id: 'student-response',
            rows: 7,
            'aria-label': 'Your response',
            placeholder: "Write what you actually think. Specific words from the text are gold.",
            onInput: updateCount,
            maxlength: String(CONFIG.MAX_RESPONSE_CHARS),
          });
          ta.value = state.studentResponse || '';
          responseRef.current = ta;
          return ta;
        })(),
        (function () {
          const cc = el('div', { class: 'char-count', 'aria-live': 'off' }, `0 / ${CONFIG.MAX_RESPONSE_CHARS}`);
          charCountRef.current = cc;
          return cc;
        })(),
        el(
          'div',
          { class: 'button-row' },
          el('button', { type: 'submit', class: 'primary' }, 'Send to Iris')
        )
      )
    );

    // Defer focus + initial count update until in DOM
    setTimeout(() => {
      if (responseRef.current) {
        responseRef.current.focus();
        updateCount();
      }
    }, 0);

    return card;
  }

  function renderThinking() {
    return el(
      'section',
      { class: 'card thinking-card' },
      el('div', { class: 'iris-avatar', 'aria-hidden': 'true' }, '·'),
      el('p', { class: 'iris-name' }, 'Iris'),
      el('p', { class: 'thinking-text' }, 'is reading what you wrote…'),
      el('div', { class: 'thinking-dots', 'aria-hidden': 'true' }, '· · ·')
    );
  }

  function renderFeedback() {
    const round = ROUND_SEQUENCE[state.roundIdx];
    const fb = state.feedback;
    const isLast = state.roundIdx >= ROUND_SEQUENCE.length - 1;

    let badge = null;
    if (fb.evidenceCheck === 'PASS') {
      badge = el('div', { class: 'badge pass' }, 'You read what was there.');
    } else if (fb.evidenceCheck === 'FAIL') {
      badge = el('div', { class: 'badge fail' }, 'Iris pushed back.');
    } else {
      badge = el('div', { class: 'badge unknown' }, '·');
    }

    return el(
      'section',
      { class: 'card feedback-card' },
      el('div', { class: 'round-label' }, `Round ${round.round}`),
      badge,
      el('div', { class: 'iris-block' },
        el('p', { class: 'iris-name' }, 'Iris'),
        el('p', { class: 'iris-text' }, fb.text),
        fb.fromFallback ? el('p', { class: 'aside small' }, '(Iris is offline. The teacher will debrief this round in person.)') : null,
      ),
      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: () => dispatch({ type: 'NEXT_ROUND' }) },
          isLast ? 'See the reflection' : 'Next round'
        )
      )
    );
  }

  function renderReflection() {
    const passes = state.log.filter((l) => l.evidenceCheck === 'PASS').length;
    const total = state.log.length;

    const reflectionList = el('ul', { class: 'log-list' },
      ...state.log.map((entry) => {
        const scenario = SCENARIOS[entry.scenario];
        return el(
          'li',
          { class: 'log-entry' },
          el('div', { class: 'log-round' }, `Round ${entry.round} — ${scenario.title}`),
          el('div', { class: `log-badge ${entry.evidenceCheck.toLowerCase()}` },
            entry.evidenceCheck === 'PASS' ? 'Read what was there'
              : entry.evidenceCheck === 'FAIL' ? 'Iris pushed back'
              : '—'),
          el('div', { class: 'log-iris' }, entry.irisText),
        );
      })
    );

    return el(
      'section',
      { class: 'card reflection-card' },
      el('h2', null, 'What you just did'),
      el('p', null,
        "You read four short pieces. You paid attention to people who weren't sitting in front of you. ",
        passes === total ? 'You stayed close to the text every round, which is harder than it sounds.' :
        passes >= total - 1 ? "You stayed close to the text in most rounds. The push-back rounds are usually the most useful — Iris was flagging where your read brought in something the text didn't show." :
        "Iris pushed back on more than one round. That's not a fail. It's where the learning happens — the gap between what you noticed and what was there is exactly the gap a 'finely aware' reader is training to close."
      ),

      el('h3', null, 'Martha Nussbaum'),
      el('p', null,
        "Nussbaum is the philosopher who'd tell you what you just did is real. She argues emotions aren't the opposite of knowing — they're a way of knowing. They tell us what to pay attention to, they let us imagine into other people's situations, and they pick up specifics that abstract reasoning slides past."
      ),
      el('p', null,
        "Her shorthand for the person who can do this: ",
        el('em', null, '"finely aware and richly responsible."'),
        " The opposite is what she calls obtuseness — a kind of moral blindness that happens to people who think emotions are just noise."
      ),

      el('h3', null, 'About Round 4'),
      el('p', null,
        "Round 4 had a twist. Before you read about Sam, you were told they had a reputation for exaggerating to get sympathy. That priming line was misleading — the words Sam actually used were unusually self-deprecating, not attention-seeking. ",
      ),
      el('p', null,
        "Susanna Siegel calls this ", el('em', null, "hijacked experience"), " — when a prior belief reaches into how we perceive someone, distorting what we actually see. Nussbaum's claim ('emotions help us know') has a guardrail attached to it: the emotional attention has to read what's there, not what we expect to be there."
      ),
      el('p', null,
        "These two thinkers — Nussbaum and Siegel — frame the rest of Week 2."
      ),

      el('h3', null, 'Your transcript'),
      reflectionList,

      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: () => window.print() },
          'Print this reflection'
        ),
        el(
          'button',
          { type: 'button', onClick: () => dispatch({ type: 'RESTART' }) },
          'Start over'
        )
      ),

      el('p', { class: 'aside small' }, 'Bring this to the next lesson.'),
    );
  }

  // ----- Render orchestrator -----
  function render() {
    clear(screen);
    let node;
    switch (state.screen) {
      case 'title': node = renderTitle(); break;
      case 'intro': node = renderIntro(); break;
      case 'reveal': node = renderReveal(); break;
      case 'priming': node = renderPriming(); break;
      case 'reading': node = renderReading(); break;
      case 'response': node = renderResponse(); break;
      case 'thinking': node = renderThinking(); break;
      case 'feedback': node = renderFeedback(); break;
      case 'reflection': node = renderReflection(); break;
      default:
        node = el('p', null, 'Something went wrong. Restart, please.');
    }
    screen.appendChild(node);
    updateRoundTracker();

    // Move focus to the new screen for keyboard / screen-reader users
    screen.focus({ preventScroll: false });

    // Announce screen change politely
    if (state.screen === 'thinking') announce('Iris is thinking');
    else if (state.screen === 'feedback') announce(`Round ${ROUND_SEQUENCE[state.roundIdx].round} feedback`);
    else if (state.screen === 'reflection') announce('Reflection screen — workshop complete');
  }

  // ----- Iris API call -----
  async function requestIris() {
    const round = ROUND_SEQUENCE[state.roundIdx];
    const payload = {
      round: round.round,
      scenarioId: round.scenario,
      mode: round.mode,
      response: state.studentResponse.slice(0, CONFIG.MAX_RESPONSE_CHARS),
    };

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), CONFIG.API_TIMEOUT_MS);
      const res = await fetch(CONFIG.API_PROXY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Proxy returned ' + res.status);
      const data = await res.json();
      const parsed = parseIrisResponse(data.text || '');
      dispatch({ type: 'FEEDBACK_RECEIVED', feedback: { ...parsed, fromFallback: false } });
    } catch (err) {
      console.warn('Iris call failed, using fallback:', err);
      const fallbackText = FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
      dispatch({
        type: 'FEEDBACK_RECEIVED',
        feedback: { evidenceCheck: 'UNKNOWN', text: fallbackText, fromFallback: true },
      });
      if (CONFIG.SHOW_OFFLINE_BANNER && state.apiHealthy) dispatch({ type: 'API_DOWN' });
    }
  }

  // ----- Anti-sycophancy structural guard parser -----
  // The Worker forwards Anthropic's response text. We require it to start with
  // either [EVIDENCE_CHECK_PASS] or [EVIDENCE_CHECK_FAIL] on its own line.
  // If the marker is missing we mark UNKNOWN and let the fallback message run.
  function parseIrisResponse(text) {
    const match = text.match(/^\s*\[EVIDENCE_CHECK_(PASS|FAIL)\]\s*\n+([\s\S]*)$/);
    if (!match) {
      console.warn('Missing evidence-check marker. Raw text:', text);
      return { evidenceCheck: 'UNKNOWN', text: text.trim() || FALLBACK_MESSAGES[0] };
    }
    return {
      evidenceCheck: match[1],
      text: match[2].trim(),
    };
  }

  // ----- Static button handlers -----
  document.getElementById('btn-restart').addEventListener('click', () => {
    if (confirm('Restart from the beginning? Your transcript will be cleared.')) {
      dispatch({ type: 'RESTART' });
    }
  });
  document.getElementById('btn-help').addEventListener('click', () => {
    if (typeof helpModal.showModal === 'function') helpModal.showModal();
    else helpModal.setAttribute('open', '');
  });

  // Allow keyboard users to advance with Enter from non-input screens
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && helpModal.open) helpModal.close();
  });

  // ----- Initial render -----
  render();
})();
