# The Reading Room

A 50-minute browser game for Year 12 SACE Stage 2 Philosophy — Epistemology unit, Week 2 (Emotional Knowledge).

Built for Peter Ellis's 12PHIL 2026 cohort.

## What it teaches

Martha Nussbaum's basic claim: emotions aren't the opposite of knowing — they're a way of knowing. When we engage emotionally with another person's situation, we can perceive truths about them that pure detached observation misses. The game also flags Susanna Siegel's guardrail: emotional attention can be **hijacked** by misleading priors. And after all that, the student has to defend the claim to **Plato**, who is unconvinced.

The game is a fun + basic on-ramp to the Nussbaum/Siegel dialectic that the four lesson decks (`deck-2-l1` through `deck-2-l4`) develop in more depth across the week.

## How it works

**Four reading rounds.** In each one the student reads a brief stimulus — a radio interview, text messages, an email, a chat with a teacher — and types what they think is going on with the person. An AI character "Iris" reads what they wrote (Claude Haiku 4.5) and responds: either *"you read what was there"* or *"I pushed back — you imported a story that isn't in the text"*. The fourth round has a deliberate hijack: a misleading prior is shown before the scenario, testing whether the student lets it dominate or sticks with the words.

**Plato challenge** (Gandalf-style 5-level persuasion gauntlet). After the four rounds, AI Plato (DeepSeek V4) appears as the cold counterpart to Iris's warmth. He doesn't believe emotion can be a route to knowledge. The student must convince him across five levels of escalating defence: name a reading → cite specific words → articulate a condition for reliability → distinguish trained from hijacked → state and defend a position. Plato concedes only when each rubric is met (JSON-schema gatekeeper-judge pattern from Sun et al. 2023, *1001 Nights* — 200+ players, zero successful jailbreaks at Gamescom).

**Reflection screen** at the end names Nussbaum, Siegel, and the dialogue with Plato, and prints a transcript the student brings to the next lesson.

## Pedagogical anchors

- **Batson "Katie Banks" paradigm** (Coke, Batson & McDavis 1978) — Round 1's stimulus is paraphrased from this canonical empathy experiment, which Nussbaum uses in *Political Emotions* (2013) Ch 6 as her most empirical anchor.
- **Five-rung Nussbaum architecture** from the unit's source compendium (see `../Nussbaum-source-compendium.md`). Game targets rungs 2, 3, and the basic claim of rung 1 — emotions guide attention, imagination yields perception, this is real knowledge.
- **Round 4 = Siegel's "hijacked experience"** (Siegel 2017, *The Rationality of Perception*).
- Maps directly to **Essay Prompt 2** — *"Developing our emotional awareness improves our understanding of human situations and motives more than it reinforces bias and irrational assumptions."*

## Running it locally

```bash
cd "the-reading-room/"
python -m http.server 8000
# open http://localhost:8000 in a browser
```

The game runs without the API key — when the proxy isn't reachable, Iris falls back to canned messages and the game keeps moving. Deploy the Worker to get live AI feedback.

## Architecture

```
the-reading-room/
├── index.html         # static shell
├── main.js            # state machine + dispatch + render
├── config.js          # API proxy URL, max chars, timeout
├── styles.css         # warm reading-desk aesthetic
├── data/
│   └── scenarios.js   # the four scenarios as plain text
├── api/
│   ├── worker.js      # Cloudflare Worker; holds ANTHROPIC_API_KEY
│   ├── wrangler.toml  # Workers config
│   └── README.md      # deploy guide
├── teacher-notes.md   # how to run the workshop in class
└── README.md          # this file
```

**Key design choices** (see `handover.docx` for the full reasoning):

1. **Vanilla JS, no build step.** Forked from `Games Workshop/templates/plain-canvas-dom`. Loads instantly, hosts on GitHub Pages, no Node/npm in the student's path.
2. **Cloudflare Worker proxy with two routes.** `/iris` → Anthropic Haiku 4.5, `/plato` → DeepSeek V4. Two API keys held as Workers Secrets. Worker dispatches by URL path.
3. **Text-only caching.** No images, audio, or PDFs in the system prompts — would balloon costs and break caching tier minimums.
4. **Anti-sycophancy by structural guard.**
   - **Iris**: every response must start with `[EVIDENCE_CHECK_PASS]` or `[EVIDENCE_CHECK_FAIL]`. Frontend parses; missing marker → UNKNOWN + canned fallback.
   - **Plato**: JSON-schema output (`level_passed`, `next_level`, `plato_says`, `hint`). Frontend parses; bad JSON → fallback. Plato system prompt forbids conceding unless level 5 rubric is genuinely met. Pattern adapted from Sun et al. 2023 (200+ players, zero jailbreaks).
5. **Single API call per turn.** No critique-refine pipeline. The structural markers enforce grounding without a second call.
6. **40-word minimum gate** on Iris responses (added after stress-test showed students finishing in 17 min). Plato has no minimum — terse philosophical moves are fine.
7. **Scenario-specific offline fallbacks.** When the proxy is unreachable, Iris's fallback message is keyed to which scenario the student was on; Plato's is keyed to which level he's at.

## Accessibility

WCAG 2.2 AA targets:
- Real `<button>` everywhere; full keyboard navigation
- 44px touch targets
- Two live regions (`status` polite, `alert` assertive) for screen readers
- `prefers-reduced-motion` respected (kills pulse animation)
- Dialog with native `<dialog>` + `showModal`
- Focus visible (3px warmth-coloured outline)
- Print stylesheet for the reflection sheet

## Licence

MIT. Stimuli are original prose written for this activity. The Batson paradigm and Nussbaum's philosophy are openly cited.

## Credits

- **Pedagogy** — Peter Ellis (Year 12 Philosophy teacher, SACE)
- **Template** — Games Workshop `plain-canvas-dom` (MIT)
- **Source compendium** — `../Nussbaum-source-compendium.md`
- **Iris (rounds 1-4)** — Claude Haiku 4.5 (Anthropic) via Cloudflare Worker proxy
- **Plato (challenge)** — DeepSeek V4 (`deepseek-chat`) via Cloudflare Worker proxy. JSON-schema gatekeeper pattern from Sun et al. 2023, *1001 Nights* (AIIDE).
- **Pattern source** — Peter's classroom AI library: `prompt-injection-lab` _pitch + `1001-nights-v2-system-prompt.md` verbatim prompt
