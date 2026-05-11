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
  const PLATO_LEVELS = window.PLATO_LEVELS;
  const PLATO_CONCEDE_TEXT = window.PLATO_CONCEDE_TEXT;
  const PLATO_MAX_TURNS_PER_LEVEL = window.PLATO_MAX_TURNS_PER_LEVEL;

  const IRIS_URL = `${CONFIG.API_BASE_URL}/iris`;
  const PLATO_URL = `${CONFIG.API_BASE_URL}/plato`;

  // ----- State -----
  const state = {
    // 'title' | 'intro' | 'reveal' | 'priming' | 'reading' | 'response' |
    // 'thinking' | 'dialogue' | 'plato_intro' | 'plato_dialogue' |
    // 'plato_thinking' | 'plato_concede' | 'reflection'
    screen: 'title',
    roundIdx: 0,
    studentResponse: '',
    feedback: null, // { evidenceCheck: 'PASS'|'FAIL'|'UNKNOWN', text, fromFallback }
    irisTranscript: [], // [{ role:'student', content } | { role:'iris', rawText, feedback }]
    log: [], // [{ round, scenario, response, evidenceCheck, irisText, fromFallback }]
    apiHealthy: true,

    // Plato state (active when screen is plato_*)
    plato: {
      currentLevel: 1, // 1-5
      turnAtLevel: 0, // increments every student submission at this level
      transcript: [], // [{ role: 'plato'|'student', content: string, levelPassed?, hint? }]
      pendingResponse: '', // student's current text
      conceded: false,
      lastResponse: null, // most recent Plato JSON for rendering feedback
    },
  };

  // ----- Constants -----
  // Per-scenario fallback messages — used when the Iris proxy is unreachable.
  // Stress-tester noted that the random 3-message rotation made two rounds
  // look identical when fallbacks fired. Per-scenario fallbacks give the
  // student something specific to think about even offline.
  const FALLBACK_MESSAGES = {
    s1_katie: "I'm offline right now, but here's what I'd be pointing at: Katie self-corrects 'my graduation' to 'my older brother's graduation', and she says there isn't a version of this where she sits down and says it's too much. Those two moments are the whole interview. We'll keep going.",
    s2_jay: "I'm offline right now — but the move I'd want you to chase is the unsent third message: 'i was just'. Whatever Jay tried to say there is what this whole exchange is about. The Saturday plan is the asking-without-asking. Onward.",
    s3_email: "I'm offline right now — but the thing to notice in Mr Doan's email is how much apologising he's doing for a small request, and how much groundwork he's already done before asking. He's making it as easy as possible to say yes. That's the data. Onward.",
    s4_hijack: "I'm offline — but this one matters. The heads-up before you read about Sam was misleading. Their words are not exaggerated; they're the opposite — pre-emptive self-dismissal. 'You'll think it's nothing.' 'Probably a waste of your time.' Test your read against what they actually said.",
    _generic: "I'm offline right now. Hold what you wrote. The teacher will pick this up with you in the debrief — your specific words about specific moments in the text are what matters.",
  };

  // Plato fallback when DeepSeek is offline. Keeps the game playable for the
  // 50-min window even if the proxy is down — but flags clearly to the student.
  const PLATO_FALLBACKS = {
    1: { plato: "I cannot hear you clearly. Tell me which of the four readings showed you something feeling alone could see.", hint: "Name a person — Katie, Jay, Mr Doan, or Sam." },
    2: { plato: "I cannot hear you clearly. Quote me actual words from one of the readings.", hint: "Find a phrase from the text. Use their words, not yours." },
    3: { plato: "I cannot hear you clearly. Under what condition does feeling reach the truth?", hint: "What was different about round 4 from rounds 1-3?" },
    4: { plato: "I cannot hear you clearly. Compare a feeling that knew with a feeling that hijacked.", hint: "Round 4 vs one of the earlier rounds." },
    5: { plato: "I cannot hear you clearly. State your position. When does feeling beat reasoning?", hint: "Use the word 'because'. Take a stance." },
  };

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
        state.irisTranscript.push({ role: 'student', content: state.studentResponse });
        state.screen = 'thinking';
        break;
      case 'SUBMIT_IRIS_REPLY':
        state.irisTranscript.push({ role: 'student', content: action.text });
        state.screen = 'thinking';
        break;
      case 'FEEDBACK_RECEIVED': {
        const isFirstIrisTurn = !state.irisTranscript.some(t => t.role === 'iris');
        state.irisTranscript.push({ role: 'iris', rawText: action.rawText, feedback: action.feedback });
        state.feedback = action.feedback;
        if (isFirstIrisTurn) {
          state.log.push({
            round: ROUND_SEQUENCE[state.roundIdx].round,
            scenario: ROUND_SEQUENCE[state.roundIdx].scenario,
            response: state.studentResponse,
            evidenceCheck: action.feedback.evidenceCheck,
            irisText: action.feedback.text,
            fromFallback: action.feedback.fromFallback,
          });
        }
        state.screen = 'dialogue';
        break;
      }
      case 'NEXT_ROUND': {
        state.roundIdx += 1;
        state.studentResponse = '';
        state.feedback = null;
        state.irisTranscript = [];
        if (state.roundIdx >= ROUND_SEQUENCE.length) {
          // After the four reading rounds → Plato challenge, not reflection yet.
          state.screen = 'plato_intro';
        } else {
          // Show the round-reveal card for every round (gives a beat between scenes).
          state.screen = 'reveal';
        }
        break;
      }
      case 'BEGIN_PLATO':
        state.screen = 'plato_dialogue';
        // Seed transcript with Plato's opening objection at level 1
        if (state.plato.transcript.length === 0) {
          state.plato.transcript.push({
            role: 'plato',
            content: PLATO_LEVELS[0].plato_opens,
          });
        }
        break;
      case 'UPDATE_PLATO_RESPONSE':
        state.plato.pendingResponse = action.value.slice(0, CONFIG.MAX_RESPONSE_CHARS);
        break;
      case 'SUBMIT_PLATO_TURN':
        state.screen = 'plato_thinking';
        // Push the student turn into the transcript immediately so they see it
        state.plato.transcript.push({
          role: 'student',
          content: state.plato.pendingResponse,
        });
        state.plato.turnAtLevel += 1;
        state.plato.pendingResponse = '';
        break;
      case 'PLATO_RESPONSE_RECEIVED': {
        const r = action.response; // { level_passed, next_level, plato_says, hint, fromFallback }
        state.plato.lastResponse = r;
        state.plato.transcript.push({
          role: 'plato',
          content: r.plato_says,
          levelPassed: r.level_passed,
          hint: r.hint,
          fromFallback: r.fromFallback,
        });
        // After PLATO_MAX_TURNS_PER_LEVEL attempts at a level, force advancement
        // so students can never be permanently stuck (handles offline fallback too).
        const hitTurnCap = state.plato.turnAtLevel >= PLATO_MAX_TURNS_PER_LEVEL;
        if (r.next_level === 'concede') {
          state.plato.conceded = true;
          state.screen = 'plato_concede';
        } else if (hitTurnCap) {
          if (state.plato.currentLevel >= 5) {
            state.screen = 'reflection';
          } else {
            state.plato.currentLevel += 1;
            state.plato.turnAtLevel = 0;
            state.screen = 'plato_dialogue';
          }
        } else if (typeof r.next_level === 'number' && r.next_level !== state.plato.currentLevel) {
          state.plato.currentLevel = r.next_level;
          state.plato.turnAtLevel = 0;
          state.screen = 'plato_dialogue';
        } else {
          state.screen = 'plato_dialogue';
        }
        break;
      }
      case 'GO_TO_REFLECTION':
        state.screen = 'reflection';
        break;
      case 'RESTART':
        try { localStorage.removeItem('reading-room-v1'); } catch (_) {}
        state.screen = 'title';
        state.roundIdx = 0;
        state.studentResponse = '';
        state.feedback = null;
        state.irisTranscript = [];
        state.log = [];
        state.apiHealthy = true;
        state.plato = {
          currentLevel: 1,
          turnAtLevel: 0,
          transcript: [],
          pendingResponse: '',
          conceded: false,
          lastResponse: null,
        };
        break;
      case 'API_DOWN':
        state.apiHealthy = false;
        break;
      default:
        console.warn('Unknown action', action);
        return;
    }
    render();
    saveState();
  }

  // ----- State persistence -----
  const STATE_KEY = 'reading-room-v1';

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.screen === 'string') state.screen = s.screen;
      if (typeof s.roundIdx === 'number') state.roundIdx = s.roundIdx;
      if (typeof s.studentResponse === 'string') state.studentResponse = s.studentResponse;
      if (s.feedback && typeof s.feedback === 'object') state.feedback = s.feedback;
      if (Array.isArray(s.irisTranscript)) state.irisTranscript = s.irisTranscript;
      if (Array.isArray(s.log)) state.log = s.log;
      if (typeof s.apiHealthy === 'boolean') state.apiHealthy = s.apiHealthy;
      if (s.plato && typeof s.plato === 'object') {
        Object.assign(state.plato, {
          currentLevel: typeof s.plato.currentLevel === 'number' ? s.plato.currentLevel : 1,
          turnAtLevel: typeof s.plato.turnAtLevel === 'number' ? s.plato.turnAtLevel : 0,
          transcript: Array.isArray(s.plato.transcript) ? s.plato.transcript : [],
          pendingResponse: typeof s.plato.pendingResponse === 'string' ? s.plato.pendingResponse : '',
          conceded: typeof s.plato.conceded === 'boolean' ? s.plato.conceded : false,
          lastResponse: s.plato.lastResponse ?? null,
        });
      }
      // Back up from transient screens that can't be restored meaningfully
      if (state.screen === 'thinking') {
        state.screen = state.irisTranscript.some(t => t.role === 'iris') ? 'dialogue' : 'response';
      } else if (state.screen === 'plato_thinking') {
        state.screen = 'plato_dialogue';
      }
    } catch (_) {}
  }

  // ----- PDF download -----
  function downloadPDF() {
    if (!window.jspdf) { alertNow('PDF library not loaded — refresh and try again.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 20;
    const maxW = 170;
    let y = margin;
    const NL = 6;

    const write = (text, size = 11, style = 'normal', color = [42, 37, 32]) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(String(text), maxW);
      if (y + lines.length * NL > 280) { doc.addPage(); y = margin; }
      doc.text(lines, margin, y);
      y += lines.length * NL;
    };
    const gap = (mm = 4) => { y += mm; };

    write('The Reading Room', 18, 'bold');
    write('Your reflection — bring this to your next lesson', 11, 'normal', [90, 79, 68]);
    gap(8);

    state.log.forEach((entry) => {
      const scenario = SCENARIOS[entry.scenario];
      write(`Round ${entry.round} — ${scenario.title}`, 12, 'bold');
      const label = entry.evidenceCheck === 'PASS' ? 'Read what was there'
                  : entry.evidenceCheck === 'FAIL' ? 'Iris pushed back' : '—';
      write(label, 9, 'bold', entry.evidenceCheck === 'PASS' ? [46, 77, 38] : [138, 62, 44]);
      gap(2);
      write('Your response:', 9, 'bold');
      write(entry.response, 10);
      gap(2);
      write('Iris said:', 9, 'bold');
      write(entry.irisText, 10);
      gap(7);
    });

    if (state.plato.transcript.length > 0) {
      const header = state.plato.conceded
        ? 'Your dialogue with Plato — Plato conceded'
        : `Your dialogue with Plato — reached level ${state.plato.currentLevel} of 5`;
      write(header, 12, 'bold');
      gap(3);
      state.plato.transcript.forEach((turn) => {
        write(turn.role === 'plato' ? 'PLATO' : 'YOU', 9, 'bold');
        write(turn.content, 10);
        if (turn.hint) write(`Hint: ${turn.hint}`, 9, 'normal', [90, 79, 68]);
        gap(4);
      });
    }

    gap(6);
    write('Send this PDF to your teacher as your evidence of completion.', 10, 'bold', [90, 79, 68]);
    doc.save('reading-room-reflection.pdf');
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
    // Pips 1-4 = reading rounds; pip 5 = Plato challenge.
    let currentRound;
    let allReadingRoundsDone;
    if (state.screen.startsWith('plato_') || state.screen === 'reflection') {
      currentRound = 5;
      allReadingRoundsDone = true;
    } else {
      currentRound = ROUND_SEQUENCE[state.roundIdx]?.round ?? 0;
      allReadingRoundsDone = false;
    }
    const platoDone = state.screen === 'reflection' && state.plato.conceded;
    document.querySelectorAll('.round-pip').forEach((pip) => {
      const r = Number(pip.dataset.round);
      const isPlato = r === 5;
      let active = false;
      let done = false;
      if (isPlato) {
        active = state.screen.startsWith('plato_');
        done = platoDone;
      } else {
        active = r === currentRound && !allReadingRoundsDone;
        done = r < currentRound || allReadingRoundsDone;
      }
      pip.classList.toggle('active', active);
      pip.classList.toggle('done', done);
      if (active) pip.setAttribute('aria-current', 'step');
      else pip.removeAttribute('aria-current');
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
    // Forced 4-second read delay on the priming card — per stress-test:
    // the Siegel hijack pedagogy depends on the priming actually landing.
    // Button is disabled for the first 4s; countdown shows in a small
    // marginalia under it. Reduced-motion does not relax the delay (this
    // is a reading time, not an animation).
    const PRIMING_DELAY_MS = 4000;
    const continueBtn = el(
      'button',
      {
        type: 'button',
        class: 'primary',
        disabled: 'disabled',
        onClick: () => dispatch({ type: 'CONTINUE_FROM_PRIMING' }),
      },
      'Read on'
    );
    const countdown = el('div', { class: 'priming-countdown', 'aria-live': 'polite' }, 'Reading time: 4s');
    let remaining = Math.floor(PRIMING_DELAY_MS / 1000);
    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(tick);
        continueBtn.removeAttribute('disabled');
        countdown.textContent = 'You can continue when ready.';
      } else {
        countdown.textContent = `Reading time: ${remaining}s`;
      }
    }, 1000);

    return el(
      'section',
      { class: 'card priming-card' },
      el('div', { class: 'round-label warn' }, 'Heads-up'),
      el('p', { class: 'priming-text' }, scenario.priming_text),
      el('div', { class: 'button-row' }, continueBtn),
      countdown,
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
    const errorRef = { current: null };

    // Update char count via direct DOM write — DO NOT dispatch on every keystroke
    // (would re-render and destroy textarea focus/selection).
    const updateCount = () => {
      const len = responseRef.current?.value?.length || 0;
      if (charCountRef.current) {
        charCountRef.current.textContent = `${len} / ${CONFIG.MAX_RESPONSE_CHARS}`;
        charCountRef.current.classList.toggle('over', len >= CONFIG.MAX_RESPONSE_CHARS);
      }
      if (errorRef.current) errorRef.current.textContent = '';
    };

    const showError = (msg) => {
      if (errorRef.current) errorRef.current.textContent = msg;
      alertNow(msg);
    };

    const onSubmit = (e) => {
      e.preventDefault();
      // Read straight from the textarea — state.studentResponse may not have
      // been kept in sync (we deliberately don't dispatch on every keystroke).
      const text = (responseRef.current?.value || '').slice(0, CONFIG.MAX_RESPONSE_CHARS);
      if (!text.trim()) {
        showError('Write something first — even a sentence.');
        return;
      }
      // 40-word minimum gate — added after stress-test showed students
      // submitting 10-word responses and finishing in 17 min.
      // Word count uses \b\w+\b to count actual alphanumeric word tokens —
      // a sequence of spaced emoji or punctuation will NOT pass the gate.
      const wordCount = (text.match(/\b\w+\b/g) || []).length;
      if (wordCount < CONFIG.MIN_RESPONSE_WORDS) {
        showError(`Iris needs more to work with — try to write ${CONFIG.MIN_RESPONSE_WORDS} words or more. You're at ${wordCount} right now.`);
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
      el('label', { for: 'student-response', class: 'sr-label' }, scenario.response_prompt),
      el('p', { class: 'response-prompt', 'aria-hidden': 'true' }, scenario.response_prompt),
      el(
        'form',
        { class: 'response-form', onSubmit },
        (function () {
          const ta = el('textarea', {
            id: 'student-response',
            rows: 7,
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
        (function () {
          const err = el('div', { class: 'form-error' });
          errorRef.current = err;
          return err;
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

  function renderDialogue() {
    const round = ROUND_SEQUENCE[state.roundIdx];
    const scenario = SCENARIOS[round.scenario];
    const isLast = state.roundIdx >= ROUND_SEQUENCE.length - 1;
    const replyRef = { current: null };
    const errorRef = { current: null };

    const showError = (msg) => {
      if (errorRef.current) errorRef.current.textContent = msg;
      alertNow(msg);
    };

    const onReply = (e) => {
      e.preventDefault();
      const text = (replyRef.current?.value || '').slice(0, CONFIG.MAX_RESPONSE_CHARS).trim();
      if (!text) { showError('Write something first.'); return; }
      if (errorRef.current) errorRef.current.textContent = '';
      dispatch({ type: 'SUBMIT_IRIS_REPLY', text });
      requestIris();
    };

    const transcriptItems = state.irisTranscript.map((turn) => {
      if (turn.role === 'student') {
        return el('div', { class: 'iris-turn iris-turn--you' },
          el('p', { class: 'iris-turn-label' }, 'You'),
          el('p', { class: 'iris-turn-body' }, turn.content)
        );
      }
      const fb = turn.feedback || {};
      return el('div', { class: 'iris-turn iris-turn--iris' },
        el('p', { class: 'iris-name' }, 'Iris'),
        el('p', { class: 'iris-text' }, fb.text || ''),
        fb.fromFallback ? el('p', { class: 'aside small' }, '(Iris is offline. The teacher will debrief this round in person.)') : null
      );
    });

    return el(
      'section', { class: 'card dialogue-card' },
      el('div', { class: 'round-label' }, `Round ${round.round} · ${scenario.title}`),
      el('div', { class: 'iris-dialogue-transcript' }, ...transcriptItems),
      el('form', { class: 'response-form', onSubmit: onReply },
        (function () {
          const ta = el('textarea', {
            id: 'iris-reply', rows: 4,
            placeholder: 'Reply to Iris…',
            maxlength: String(CONFIG.MAX_RESPONSE_CHARS),
          });
          replyRef.current = ta;
          return ta;
        })(),
        (function () {
          const err = el('div', { class: 'form-error' });
          errorRef.current = err;
          return err;
        })(),
        el('div', { class: 'button-row' },
          el('button', { type: 'submit', class: 'primary' }, 'Reply to Iris'),
          el('button', { type: 'button', onClick: () => dispatch({ type: 'NEXT_ROUND' }) },
            isLast ? 'See the reflection' : 'Next round'
          )
        )
      )
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

  // ----- Plato screens -----

  function renderPlatoIntro() {
    return el(
      'section',
      { class: 'card plato-intro-card' },
      el('div', { class: 'round-label plato-label' }, 'The fifth presence'),
      el('h2', null, 'Plato has been listening.'),
      el('p', null,
        "Iris was warm. Plato is not. He's been watching the four rounds and he is unconvinced that what you did was knowing — feeling, yes, but knowing, no."
      ),
      el('p', null,
        "He's offered to talk with you about it. He says he'll concede the point — formally — if you can defend it across ", el('em', null, 'five levels of objection'), ". You don't see the levels in advance; you'll feel them as he raises them."
      ),
      el('p', { class: 'aside' },
        "Read closely. Use specific words from the four readings. Don't hedge. He won't concede to 'sometimes' or 'it depends'."
      ),
      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary plato-primary', onClick: () => dispatch({ type: 'BEGIN_PLATO' }) },
          'Enter the dialogue'
        )
      )
    );
  }

  function renderPlatoDialogue() {
    const currentLevel = state.plato.currentLevel;
    const turnAtLevel = state.plato.turnAtLevel;
    const responseRef = { current: null };
    const charCountRef = { current: null };
    const wordCountRef = { current: null };

    const updateCounts = () => {
      const v = responseRef.current?.value || '';
      const len = v.length;
      // Same emoji-resistant word count as Iris's gate.
      const words = (v.match(/\b\w+\b/g) || []).length;
      if (charCountRef.current) {
        charCountRef.current.textContent = `${len} / ${CONFIG.MAX_RESPONSE_CHARS}`;
        charCountRef.current.classList.toggle('over', len >= CONFIG.MAX_RESPONSE_CHARS);
      }
      if (wordCountRef.current) {
        wordCountRef.current.textContent = `${words} words`;
        wordCountRef.current.classList.toggle('ok', words >= CONFIG.PLATO_SOFT_MIN_WORDS);
      }
    };

    const onSubmit = (e) => {
      e.preventDefault();
      const text = (responseRef.current?.value || '').slice(0, CONFIG.MAX_RESPONSE_CHARS);
      if (!text.trim()) {
        alertNow('Plato needs an actual response.');
        return;
      }
      // Plato accepts shorter responses than Iris (terse philosophical
      // moves are fine) but enforces a soft floor — one-clause answers
      // will fail every rubric. Hard floor: 8 words.
      const words = (text.match(/\b\w+\b/g) || []).length;
      if (words < CONFIG.PLATO_HARD_MIN_WORDS) {
        alertNow(`Plato needs more than a phrase. You're at ${words} words — give him a sentence to work with.`);
        return;
      }
      state.plato.pendingResponse = text;
      dispatch({ type: 'SUBMIT_PLATO_TURN' });
      requestPlato();
    };

    // Build the level indicator (1-5 pips, with current level highlighted)
    const levelPips = el(
      'div',
      { class: 'plato-level-tracker', 'aria-label': 'Plato level progress' },
      ...PLATO_LEVELS.map((lvl) =>
        el('span',
          {
            class: 'plato-pip' + (lvl.level < currentLevel ? ' done' : lvl.level === currentLevel ? ' active' : ''),
            'aria-label': `Level ${lvl.level}`,
          },
          String(lvl.level)
        )
      )
    );

    // Render transcript — Plato and student turns alternating.
    const transcriptEl = el('div', { class: 'plato-transcript', 'aria-label': 'Dialogue so far' },
      ...state.plato.transcript.map((turn, idx) => {
        if (turn.role === 'plato') {
          const isLast = idx === state.plato.transcript.length - 1;
          const passClass = isLast && turn.levelPassed === true ? 'plato-passed' :
                            isLast && turn.levelPassed === false ? 'plato-failed' : '';
          return el('div', { class: `plato-turn plato-says ${passClass}` },
            el('div', { class: 'plato-speaker' }, 'PLATO'),
            el('p', { class: 'plato-text' }, turn.content),
            turn.hint ? el('p', { class: 'plato-hint' },
              el('span', { class: 'plato-hint-label' }, 'Hint: '),
              turn.hint
            ) : null,
            turn.fromFallback ? el('p', { class: 'aside small' }, '(Plato is offline — the proxy is unreachable. The teacher will pick this up in the debrief.)') : null,
          );
        } else {
          return el('div', { class: 'plato-turn plato-student' },
            el('div', { class: 'plato-speaker' }, 'YOU'),
            el('p', { class: 'plato-text' }, turn.content),
          );
        }
      })
    );

    const wordCountBox = (function () {
      const w = el('span', { class: 'plato-word-count' }, '0 words');
      wordCountRef.current = w;
      return w;
    })();

    const charCountBox = (function () {
      const c = el('span', { class: 'char-count' }, `0 / ${CONFIG.MAX_RESPONSE_CHARS}`);
      charCountRef.current = c;
      return c;
    })();

    const formBlock = el('form', { class: 'plato-response-form', onSubmit },
      el('label', { for: 'plato-response', class: 'plato-input-label' },
        `Level ${currentLevel} of 5${turnAtLevel >= PLATO_MAX_TURNS_PER_LEVEL ? ' (final attempt at this level)' : ''}`
      ),
      (function () {
        const ta = el('textarea', {
          id: 'plato-response',
          rows: 5,
          'aria-label': 'Your reply to Plato',
          placeholder: "Answer him. Use specific words from the readings. Don't hedge.",
          onInput: updateCounts,
          maxlength: String(CONFIG.MAX_RESPONSE_CHARS),
        });
        ta.value = state.plato.pendingResponse || '';
        responseRef.current = ta;
        return ta;
      })(),
      el('div', { class: 'plato-counts-row' }, wordCountBox, charCountBox),
      el('div', { class: 'button-row' },
        el('button', { type: 'submit', class: 'primary plato-primary' }, 'Reply to Plato')
      ),
    );

    setTimeout(() => {
      if (responseRef.current) {
        responseRef.current.focus();
        updateCounts();
      }
      // Scroll transcript to bottom so latest turn is in view
      if (transcriptEl.scrollHeight > 0) {
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
      }
    }, 0);

    return el(
      'section',
      { class: 'card plato-dialogue-card' },
      el('div', { class: 'round-label plato-label' }, 'Plato'),
      levelPips,
      transcriptEl,
      formBlock,
    );
  }

  function renderPlatoThinking() {
    return el(
      'section',
      { class: 'card thinking-card plato-thinking-card' },
      el('div', { class: 'plato-avatar', 'aria-hidden': 'true' }, 'Π'),
      el('p', { class: 'plato-speaker' }, 'PLATO'),
      el('p', { class: 'thinking-text' }, 'considers your reply…'),
      el('div', { class: 'thinking-dots', 'aria-hidden': 'true' }, '· · ·')
    );
  }

  function renderPlatoConcede() {
    return el(
      'section',
      { class: 'card plato-concede-card' },
      el('div', { class: 'round-label plato-label' }, 'Plato concedes'),
      el('h2', null, 'You earned it.'),
      el('div', { class: 'iris-block plato-concede-text' },
        el('p', { class: 'plato-speaker' }, 'PLATO'),
        el('p', { class: 'iris-text' }, PLATO_CONCEDE_TEXT),
      ),
      el('p', null, "Step through to your reflection."),
      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: () => dispatch({ type: 'GO_TO_REFLECTION' }) },
          'Reflection'
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

      el('h3', null, 'Your transcript with Iris'),
      reflectionList,

      // ----- Plato section -----
      state.plato.transcript.length > 0
        ? el('div', null,
            el('h3', null, state.plato.conceded ? 'Your dialogue with Plato' : 'Where you reached with Plato'),
            el('p', null,
              state.plato.conceded
                ? "Plato conceded after five levels. That doesn't mean you won an argument — it means you held a position long enough to defend it. The dialogue itself is the artefact. Re-read your own moves below."
                : `You reached level ${state.plato.currentLevel} of 5. Plato didn't concede tonight — that's normal. The class debrief is the right place to pick this up.`
            ),
            el('ul', { class: 'plato-transcript-print log-list' },
              ...state.plato.transcript.map((turn) => el('li',
                { class: `log-entry plato-${turn.role}` },
                el('div', { class: 'log-round plato-speaker' }, turn.role === 'plato' ? 'PLATO' : 'YOU'),
                el('div', { class: 'log-iris' }, turn.content),
                turn.hint ? el('div', { class: 'log-iris plato-hint' }, `Hint: ${turn.hint}`) : null,
              ))
            )
          )
        : null,

      el(
        'div',
        { class: 'button-row' },
        el(
          'button',
          { type: 'button', class: 'primary', onClick: downloadPDF },
          'Save as PDF'
        ),
        el(
          'button',
          { type: 'button', onClick: () => dispatch({ type: 'RESTART' }) },
          'Start over'
        )
      ),

      el('p', { class: 'aside small' }, 'Save the PDF and send it to your teacher as evidence of completion.'),
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
      case 'feedback': // fall-through: treat old saved 'feedback' state as dialogue
      case 'dialogue': node = renderDialogue(); break;
      case 'plato_intro': node = renderPlatoIntro(); break;
      case 'plato_dialogue': node = renderPlatoDialogue(); break;
      case 'plato_thinking': node = renderPlatoThinking(); break;
      case 'plato_concede': node = renderPlatoConcede(); break;
      case 'reflection': node = renderReflection(); break;
      default:
        node = el('p', null, 'Something went wrong. Restart, please.');
    }
    screen.appendChild(node);
    updateRoundTracker();

    // Retrigger the screen-fade animation on every render. Plato's arrival
    // (plato_intro) and his concession get a longer, heavier fade — those
    // are the game's narrative beats. Reduced-motion is respected via the
    // CSS media query.
    screen.classList.remove('screen-fade-in', 'plato-arrival', 'plato-arrival-concede');
    // Force a reflow so the animation retriggers on re-add.
    void screen.offsetWidth;
    if (state.screen === 'plato_intro') screen.classList.add('plato-arrival');
    else if (state.screen === 'plato_concede') screen.classList.add('plato-arrival-concede');
    else screen.classList.add('screen-fade-in');

    // Move focus to the new screen for keyboard / screen-reader users
    screen.focus({ preventScroll: false });

    // Announce screen change politely. Per stress-test: ALL transition
    // screens get an announce so screen-reader users tracking landmarks
    // know what just happened.
    const r = ROUND_SEQUENCE[state.roundIdx];
    const sc = r ? SCENARIOS[r.scenario] : null;
    if (state.screen === 'title') announce('Title screen — The Reading Room');
    else if (state.screen === 'intro') announce('Introduction — the Batson experiment');
    else if (state.screen === 'reveal' && r) announce(`Round ${r.round} of 4 — ${sc.title}`);
    else if (state.screen === 'priming') announce('Heads-up before round 4 — read carefully');
    else if (state.screen === 'reading' && r) announce(`Round ${r.round} reading — ${sc.title}`);
    else if (state.screen === 'response' && r) announce(`Round ${r.round} — write your response`);
    else if (state.screen === 'thinking') announce('Iris is thinking');
    else if (state.screen === 'dialogue' && r) announce(`Iris replied — round ${r.round}`);
    else if (state.screen === 'plato_intro') announce('Plato has appeared — five levels of challenge ahead');
    else if (state.screen === 'plato_thinking') announce('Plato considers your reply');
    else if (state.screen === 'plato_dialogue') announce(`Plato — level ${state.plato.currentLevel} of 5`);
    else if (state.screen === 'plato_concede') announce('Plato concedes the point');
    else if (state.screen === 'reflection') announce('Reflection screen — workshop complete');
  }

  // ----- Iris API call -----
  async function requestIris() {
    const round = ROUND_SEQUENCE[state.roundIdx];
    const transcript = state.irisTranscript;
    const currentTurn = transcript[transcript.length - 1];
    // History = all turns before the current student turn, with iris turns sent as raw API text
    const history = transcript.slice(0, -1).map(t => ({
      role: t.role,
      content: t.role === 'iris' ? (t.rawText || t.feedback?.text || '') : t.content,
    }));
    const payload = {
      round: round.round,
      scenarioId: round.scenario,
      mode: round.mode,
      response: currentTurn.content.slice(0, CONFIG.MAX_RESPONSE_CHARS),
      history,
    };

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), CONFIG.API_TIMEOUT_MS);
      const res = await fetch(IRIS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Proxy returned ' + res.status);
      const data = await res.json();
      const rawText = data.text || '';
      const parsed = parseIrisResponse(rawText);
      dispatch({ type: 'FEEDBACK_RECEIVED', feedback: { ...parsed, fromFallback: false }, rawText });
    } catch (err) {
      console.warn('Iris call failed, using fallback:', err);
      const fallbackText = FALLBACK_MESSAGES[round.scenario] || FALLBACK_MESSAGES._generic;
      dispatch({
        type: 'FEEDBACK_RECEIVED',
        feedback: { evidenceCheck: 'UNKNOWN', text: fallbackText, fromFallback: true },
        rawText: fallbackText,
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
      return { evidenceCheck: 'UNKNOWN', text: text.trim() || FALLBACK_MESSAGES._generic };
    }
    return {
      evidenceCheck: match[1],
      text: match[2].trim(),
    };
  }

  // ----- Plato API call -----
  async function requestPlato() {
    const currentLevel = state.plato.currentLevel;
    const payload = {
      current_level: currentLevel,
      turn_number_at_this_level: state.plato.turnAtLevel,
      student_response: state.plato.transcript[state.plato.transcript.length - 1].content,
      history_so_far: state.plato.transcript.slice(0, -1).map((t) => ({
        role: t.role,
        content: t.content,
      })),
    };

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), CONFIG.API_TIMEOUT_MS);
      const res = await fetch(PLATO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Proxy returned ' + res.status);
      const data = await res.json();
      dispatch({
        type: 'PLATO_RESPONSE_RECEIVED',
        response: {
          level_passed: !!data.level_passed,
          next_level: data.next_level,
          plato_says: data.plato_says || '',
          hint: data.hint || '',
          fromFallback: false,
        },
      });
    } catch (err) {
      console.warn('Plato call failed, using fallback:', err);
      const fb = PLATO_FALLBACKS[currentLevel] || PLATO_FALLBACKS[1];
      dispatch({
        type: 'PLATO_RESPONSE_RECEIVED',
        response: {
          level_passed: false,
          next_level: currentLevel,
          plato_says: fb.plato,
          hint: fb.hint,
          fromFallback: true,
        },
      });
    }
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
  loadState();
  render();
})();
