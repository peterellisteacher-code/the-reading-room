"""Build teacher-notes.docx + handover.docx for The Reading Room.

Per CLAUDE.md file-format rule: documents intended for Peter to READ must be .docx,
never .md. Working files for the toolchain stay .md (README, scenarios.js comments,
this script). The teacher-notes and handover are reading-deliverables.
"""
from pathlib import Path
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

ROOT = Path(__file__).parent
WARMTH = RGBColor(0xB8, 0x54, 0x3C)
INK = RGBColor(0x2A, 0x25, 0x20)
INK_SOFT = RGBColor(0x5A, 0x4F, 0x44)


def styled_doc():
    doc = Document()
    # Page setup — A4
    section = doc.sections[0]
    section.page_height = Cm(29.7)
    section.page_width = Cm(21.0)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)

    # Default body font
    style = doc.styles['Normal']
    style.font.name = 'Palatino Linotype'
    style.font.size = Pt(11)
    style.font.color.rgb = INK
    return doc


def h1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(text)
    r.font.size = Pt(20)
    r.font.bold = True
    r.font.color.rgb = INK
    r.font.name = 'Palatino Linotype'


def h2(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    r.font.size = Pt(14)
    r.font.bold = True
    r.font.color.rgb = WARMTH
    r.font.name = 'Palatino Linotype'


def h3(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(text)
    r.font.size = Pt(12)
    r.font.bold = True
    r.font.color.rgb = INK
    r.font.name = 'Palatino Linotype'


def body(doc, text, italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(text)
    r.font.size = Pt(11)
    r.font.italic = italic
    r.font.name = 'Palatino Linotype'


def bullet(doc, text):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(2)
    for r in p.runs:
        r.font.size = Pt(11)
        r.font.name = 'Palatino Linotype'
    if not p.runs:
        r = p.add_run(text)
        r.font.size = Pt(11)
        r.font.name = 'Palatino Linotype'
    else:
        p.runs[0].text = text


def code(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.5)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(text)
    r.font.name = 'Consolas'
    r.font.size = Pt(9)
    r.font.color.rgb = INK_SOFT


def aside(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.5)
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run(text)
    r.font.size = Pt(10)
    r.font.italic = True
    r.font.color.rgb = INK_SOFT
    r.font.name = 'Palatino Linotype'


# ============================================================
# TEACHER NOTES
# ============================================================
def build_teacher_notes():
    doc = styled_doc()
    h1(doc, 'The Reading Room')
    aside(doc, 'Teacher notes — Year 12 Philosophy, Epistemology unit, Week 2')

    h2(doc, 'What this is')
    body(doc, "A 50-minute browser game that teaches Martha Nussbaum's basic claim: emotions aren't the opposite of knowing — they're a way of knowing. Students read four short pieces (a radio interview, a few text messages, an email, a chat with a teacher) and tell an AI character called Iris what they think is going on with each person. Iris pushes back gently when their reading imports something the text doesn't show.")
    body(doc, "It is the FUN + BASIC on-ramp to the Nussbaum / Siegel dialectic the four lesson decks (deck-2-l1 through deck-2-l4) develop properly across the week. Don't expect students to articulate the philosophy yet — the goal is for them to FEEL the difference between detached and engaged reading.")

    h2(doc, 'Where it sits in Week 2')
    body(doc, "Run it as a standalone workshop on the first day Nussbaum is named. After this, lessons 1–4 can land — students will have their own felt experience of the basic claim to refer back to.")
    body(doc, "It maps directly to Essay Prompt 2: 'Developing our emotional awareness improves our understanding of human situations and motives more than it reinforces bias and irrational assumptions.' The reflection sheet they print at the end is meant to come with them to the next lesson.")

    h2(doc, 'Setup before class')
    bullet(doc, 'Confirm the Cloudflare Worker is deployed and the API key is set as a Workers Secret (see handover doc).')
    bullet(doc, 'Open the GitHub Pages URL on the projector once and click through round 1 to confirm Iris responds. If she does not, the game still runs in offline-fallback mode but the AI feedback degrades to canned messages — debrief the round verbally.')
    bullet(doc, 'Tell students: "Don\'t Google. Don\'t open ChatGPT. Use what\'s on the page." The whole point is unmediated reading.')
    bullet(doc, 'Print one A4 reflection-sheet template per student? Optional — the game prints the transcript at the end, but having a paper backup is useful.')

    h2(doc, 'Running it (50 minutes)')
    h3(doc, '0–5 min: open and orient')
    body(doc, "Project the title screen. Read it together. The opening claim (today's question is whether emotions can be a way of knowing) is the only context they need.")
    h3(doc, '5–7 min: the Batson framing')
    body(doc, "Click 'Begin'. The intro screen sketches the 1978 Batson 'Katie Banks' experiment — same audio, two listening modes, three-times-more help. Don't elaborate. The puzzle does the work.")
    h3(doc, '7–45 min: four rounds')
    body(doc, "Students work alone, at their own pace. Most will finish in 35–40 min. Walk the room. Don't answer 'what's the right answer' — say 'point at the line in the text that made you think that'.")
    h3(doc, '45–55 min: reflection screen + class debrief')
    body(doc, "When students hit the reflection screen, gather attention briefly. The screen names Nussbaum and Siegel for the first time. Ask:")
    bullet(doc, '"Round 4 had a heads-up before the scenario that turned out to be misleading. What did you do with it?"')
    bullet(doc, '"Was there a round where Iris pushed back and you thought she was wrong?"')
    bullet(doc, '"What\'s one phrase from any of the texts that you\'re still thinking about?"')
    body(doc, "Students should print their transcript and bring it to the next lesson. The transcript becomes raw material for Prompt 2.")

    h2(doc, 'What Iris is doing')
    body(doc, "Iris is Claude Haiku 4.5 with a system prompt that knows all four scenarios verbatim. She returns either '[EVIDENCE_CHECK_PASS]' (your read is grounded in what the text actually says) or '[EVIDENCE_CHECK_FAIL]' (you've imported a story OR missed an obvious emotional truth). The badge the student sees translates this into 'You read what was there' or 'Iris pushed back'.")
    body(doc, "Iris is anti-sycophantic by design. She does not flatter. On a FAIL she finds one thing the student noticed correctly before redirecting — that's the only softening built in.")
    body(doc, "Common student response patterns and what Iris does with them:")
    bullet(doc, "Round 1 — projecting 'denial' onto Katie: FAIL. The text shows fatigue and structural unavailability of help, not denial.")
    bullet(doc, "Round 2 — diagnosing Jay (depression, ADHD, etc.): FAIL. The text doesn't go that far.")
    bullet(doc, "Round 3 — taking Mr Doan's email at face value as a small admin request: FAIL. The carefulness is the data.")
    bullet(doc, "Round 4 — agreeing Sam is exaggerating because the priming line said so: FAIL. Sam's actual words are the opposite.")
    bullet(doc, "All rounds — quoting specific words from the text and reasoning from them: PASS.")

    h2(doc, 'If something breaks')
    h3(doc, 'Iris doesn\'t respond / network error')
    body(doc, "The game still runs. Each round will show a generic offline message and a small note saying 'Iris is offline. The teacher will debrief this round in person.' Just walk the room and have the conversation Iris would have had — quote a line from the text and ask the student why they read it the way they did.")
    h3(doc, 'A student gets stuck')
    body(doc, "Three things that almost always work: (1) 'Read it again, slower.' (2) 'Point at one specific line that made you think that.' (3) 'What word did they use? Why that word?'")
    h3(doc, 'Round 4 — students are angry about the priming line')
    body(doc, "Good. That's the lesson. The whole point is they were given a misleading prior and had to read past it. The Siegel hijack is real — once we expect a story, our perception conforms to it. Lean into the discomfort.")

    h2(doc, 'Differentiation')
    bullet(doc, 'Quick finishers — ask them to write a paragraph linking what they noticed in Round 1 to Round 4. The same skill, different pressures.')
    bullet(doc, 'Strugglers — sit beside them for Round 1 only. Read it aloud together. Ask them to point at one moment where Katie surprised them. Then let them go solo on rounds 2–4.')
    bullet(doc, 'Students who want to argue with Iris — encourage them. Have them write a paragraph for the reflection sheet titled "Where I think Iris was wrong, and why." That paragraph is sometimes the strongest essay material.')

    h2(doc, 'Cost and privacy')
    body(doc, "Per student per full play-through: roughly 0.07 cents (yes, less than one cent), assuming Haiku 4.5 + 1-hour prompt cache. Class of 30 ≈ 7 cents.")
    body(doc, "Student responses are sent to the Cloudflare Worker which forwards them to Anthropic's API. The Worker logs nothing. Anthropic's own retention is governed by their terms — by default no training on API data. If you have any students whose data must not leave the school's systems, run them in offline-fallback mode (just don't have them connect, or take the tablet offline).")

    out = ROOT / 'teacher-notes.docx'
    doc.save(out)
    print('Wrote', out)


# ============================================================
# HANDOVER
# ============================================================
def build_handover():
    doc = styled_doc()
    h1(doc, 'The Reading Room — handover')
    aside(doc, "Built overnight 11 May 2026. This document captures everything you need to deploy the Worker, deploy the frontend, run the adversarial Iris test, and pick up where I left off.")

    h2(doc, 'TL;DR')
    bullet(doc, 'A 50-minute browser game lives at "the-reading-room/" inside Week 2 materials. Vanilla HTML/JS/CSS, no build step.')
    bullet(doc, 'Pedagogy: fun + basic on-ramp to Nussbaum, with one Siegel "hijack" round at the end. Anchored on the Batson Katie Banks paradigm.')
    bullet(doc, 'AI: one Claude Haiku 4.5 call per student turn, behind a Cloudflare Worker that holds the API key. Text-only prompt caching, 1-hour TTL.')
    bullet(doc, 'Anti-sycophancy structural guard: every Iris response must start with [EVIDENCE_CHECK_PASS] or [EVIDENCE_CHECK_FAIL]. Frontend parses; missing marker → UNKNOWN + canned fallback.')
    bullet(doc, 'Local end-to-end flow verified: title → intro → 4 rounds (with priming card on round 4) → reflection. Offline fallback also verified.')
    bullet(doc, 'NOT YET DONE: deploy the Worker (needs your API key), deploy frontend to GitHub Pages, run the live adversarial test against Haiku.')

    h2(doc, 'What you need to do tomorrow morning')

    h3(doc, '1. Deploy the Cloudflare Worker (5 min)')
    code(doc, 'cd "2 - Emotional Knowledge Materials/the-reading-room/api"\nnpm install -g wrangler\nwrangler login\nwrangler secret put ANTHROPIC_API_KEY\n# paste your sk-ant-... key when prompted\nwrangler deploy')
    body(doc, "Wrangler will print a URL like https://reading-room-proxy.peterellisteacher-code.workers.dev. Copy it. If it differs from the URL already in config.js, edit config.js to match, commit, and push.")

    h3(doc, '2. Run the adversarial Iris test (5 min)')
    body(doc, "This is the test the second-opinion reviewer flagged as critical: confirm Haiku actually FAILs prior-projection responses rather than agreeing with them. Run it locally before letting students near it.")
    code(doc, 'cd "2 - Emotional Knowledge Materials/the-reading-room"\npython -m http.server 8765\n# open http://localhost:8765 in a browser')
    body(doc, "Click through to Round 1 (Katie). Type a deliberately projected response: 'Katie is in denial about her grief and needs to ask for help.' This is NOT in the text — Katie shows fatigue and structural unavailability of help, not denial. Hit Send to Iris.")
    body(doc, "Expected: Iris responds with the FAIL badge ('Iris pushed back') and prose along the lines of 'You're reading something into the text that isn\'t there — point at the line that says she\'s in denial.'")
    body(doc, "If Iris instead PASSes the response (agrees with you), the system prompt isn't pushing back hard enough. Open api/worker.js, harden the SYSTEM_PROMPT (strengthen the 'YOU NEVER flatter' / 'never start with no' lines), redeploy. If it still PASSes after one round of hardening, escalate Iris from claude-haiku-4-5 to claude-sonnet-4-5 in the MODEL constant in api/worker.js.")
    body(doc, "Repeat with two more adversarial reads — one on Round 3 (Mr Doan) saying 'It's just a normal admin request, nothing weird about it' (FAIL — misses the carefulness), and one on Round 4 (Sam) saying 'Sam is exaggerating to get sympathy, just like the heads-up said' (FAIL — that's the hijack).")

    h3(doc, '3. Deploy the frontend to GitHub Pages (3 min)')
    body(doc, "The repo is already on GitHub at peterellisteacher-code/the-reading-room. Open repo Settings → Pages → 'Deploy from branch' → main → / (root) → Save. GitHub Pages will publish at https://peterellisteacher-code.github.io/the-reading-room/.")
    body(doc, "Confirm config.js still has the right Worker URL and that the Cloudflare Worker's ALLOWED_ORIGINS includes your Pages URL. (It already includes peterellisteacher-code.github.io. If you renamed the repo, update worker.js and redeploy.)")

    h3(doc, '4. Open it on the classroom projector and play through it once')
    body(doc, "Whatever you find that feels off, edit, push, and reload. Vanilla JS — no build step. Changes to config.js, scenarios.js, main.js, or styles.css go live the moment GitHub Pages picks up the push (1–2 minutes).")

    h2(doc, 'Architecture and key decisions')

    h3(doc, 'Why this stack')
    bullet(doc, 'Vanilla HTML/JS/CSS — chose because it loads instantly, hosts free on GitHub Pages, has zero attack surface, and any teacher (you, future you, future colleague) can read the source and edit it. No npm, no Vite, no React. Forked from Games Workshop plain-canvas-dom (MIT).')
    bullet(doc, 'Cloudflare Worker proxy — required because a static frontend cannot embed an API key (it would be in DevTools instantly). The Worker holds the key as a Workers Secret. Free tier covers 100k req/day; you\'ll never come close.')
    bullet(doc, 'Single Claude API call per turn — not the multi-call critique-refine pipeline (which is overkill for fun + basic). The anti-sycophancy structural guard does the work that critique-refine would have done.')

    h3(doc, 'Text-only caching')
    body(doc, "Per your explicit instruction: NO images in the cache, ever. The system prompt cached on Anthropic's side is pure text — Iris persona + Nussbaum frame + the four scenario texts verbatim + scoring rubric + violation guard. About 1500 tokens. Cache hits on every turn after the first per class period.")
    body(doc, "Per turn cost: ~1500 cached tokens × $0.08/MTok cache-read = $0.00012; plus ~50 user-message tokens × $1/MTok = $0.00005; plus ~80 output tokens × $5/MTok = $0.0004. Total ≈ $0.0006/turn. Class of 30 × 4 turns ≈ $0.07.")

    h3(doc, 'Anti-sycophancy structural guard')
    body(doc, "The system prompt requires every response to begin with exactly one of [EVIDENCE_CHECK_PASS] or [EVIDENCE_CHECK_FAIL] on its own line. Frontend parses this regex; if missing, the response degrades to UNKNOWN and the canned fallback fires (with a console warning logged). This is the structural mechanism that keeps Iris honest — system-prompt-only anti-sycophancy is too soft per the second-opinion review.")

    h3(doc, 'What the second-opinion AI review caught')
    bullet(doc, 'API key exposure (CRITICAL) — fixed via Cloudflare Worker proxy.')
    bullet(doc, 'System-prompt-only anti-sycophancy is fragile — fixed via [EVIDENCE_CHECK_*] structural marker that the frontend verifies.')
    bullet(doc, 'Test Haiku adversarially before shipping — flagged for you to run before class (see step 2 above).')
    bullet(doc, 'Cache pattern, single-call architecture, scenarios-in-system: all fine as designed.')

    h2(doc, 'File map')
    code(doc, "the-reading-room/\n  index.html         # static shell\n  main.js            # state machine + dispatch + render\n  config.js          # API_PROXY_URL, MAX_RESPONSE_CHARS, timeout\n  styles.css         # warm reading-desk aesthetic\n  data/\n    scenarios.js     # the four scenarios as plain text\n  api/\n    worker.js        # Cloudflare Worker — holds ANTHROPIC_API_KEY\n    wrangler.toml    # Workers config\n    README.md        # deploy guide\n  README.md          # project README\n  LICENSE            # MIT\n  teacher-notes.docx # classroom-running notes (this folder, after build_docs.py)\n  build_docs.py      # this script\n  .gitignore         # ignores .wrangler/, secrets, etc.")

    h2(doc, 'Reading conversion (separate task)')
    body(doc, "I kicked off a pdf-extractor agent in the background to convert these to .md alongside the PDFs:")
    bullet(doc, 'Nussbaum — Finely Aware and Richly Responsible (canonical perception essay)')
    bullet(doc, 'Nussbaum — Moral Attention and the Moral Task of Literature (1985)')
    bullet(doc, 'Nussbaum — Perception and Revolution')
    bullet(doc, 'Nussbaum — Inner World')
    bullet(doc, 'Nussbaum — Verbatim Quote Reference')
    bullet(doc, "Siegel — Summary of The Rationality of Perception")
    body(doc, "By the time you read this, the .md files should exist next to each PDF in '2 - Emotional Knowledge Materials/'. Skipped: full books (Love's Knowledge full, Rationality of Perception monograph, In a Different Voice). Already .md (untouched): Nussbaum-source-compendium.md, SEP-Objections-to-Nussbaum.md.")

    h2(doc, 'Things I deliberately did NOT do')
    bullet(doc, "Did not run the live Haiku adversarial test — Worker not deployed yet (needs your API key). Procedure documented above; do this before students touch it.")
    bullet(doc, "Did not deploy to GitHub Pages — Worker URL needs to be confirmed first; flipping the Pages switch is a 30-second action you should do.")
    bullet(doc, "Did not weave Gilligan in — she's the third Week 2 thinker (in wk2_other) but no scaffolded materials exist for her yet. Her readings are in the conversion list at lowest priority.")
    bullet(doc, "Did not build a four-deck PowerPoint — your existing deck-2-l1 through deck-2-l4 cover that arc. This game is a workshop on its own.")
    bullet(doc, "Did not load /aesthetic-identity through its full workflow — the warm paper-and-ink palette is a deliberate fast pick (warm/serif/lamp-lit-study). If you want a different aesthetic, edit styles.css :root tokens and the four-five rules under .stimulus / .iris-block / .badge.")

    h2(doc, 'If you want to change Iris')
    body(doc, "All of Iris's voice and behaviour lives in api/worker.js as the SYSTEM_PROMPT constant. Edit it, run wrangler deploy, done. The 1-hour cache will warm again on the next turn (the first call after the deploy pays full input-token price; then it's cache-read for the rest of the period).")
    body(doc, "The 'KEY EMOTIONAL TRUTHS' blocks under each scenario in the system prompt are the most important thing to keep accurate — Iris uses these to decide PASS vs FAIL. If you find a student response Iris is mishandling, add a sentence to the relevant scenario's emotional-truth block and redeploy.")

    h2(doc, 'Known small things')
    bullet(doc, "The round-tracker pip shows Round 1 as 'active' even on the title and intro screens (state.roundIdx is 0 by default). Cosmetic, not worth a fix.")
    bullet(doc, "The Round 1 reveal-card text says 'Read this once. Take your time' — for rounds 2 and 3 it says 'Read it once. When you're ready, write what you think is going on.' Round 4 has its own line. If you want different copy per round, edit renderReveal in main.js.")
    bullet(doc, "There is no save-and-resume. If a student closes the tab mid-round, they restart from scratch. Adding localStorage save is ~10 lines if needed.")
    bullet(doc, "Print stylesheet exists but only optimised for the reflection screen. Mid-game prints would look fine but aren't styled to be the artefact.")

    h2(doc, 'Total time and tokens (rough)')
    bullet(doc, "Build time: ~2 hours of agent work spread across one session.")
    bullet(doc, "Lines of code: index.html ~70, main.js ~600, styles.css ~340, config.js ~20, scenarios.js ~100, worker.js ~220. About 1,350 LOC total.")
    bullet(doc, "Per-class API spend: ~$0.07 (30 students × 4 turns × Haiku 4.5 with 1h cache).")

    h2(doc, 'Where to put feedback')
    body(doc, "If you run it with a class and you want to refine the scenarios, the violation field text, or the priming line for Round 4, edit those in api/worker.js (the SYSTEM_PROMPT constant) and redeploy. The frontend scenarios.js text only needs to match if students are reading the literal text on screen (they are) — keep them in sync.")
    body(doc, "If you want to add a fifth scenario or change a round's Bloom level, the patterns are: (1) add the scenario text to the SYSTEM_PROMPT in worker.js with its KEY EMOTIONAL TRUTHS block, (2) add it to data/scenarios.js for the frontend, (3) add an entry to ROUND_SEQUENCE.")

    out = ROOT / 'handover.docx'
    doc.save(out)
    print('Wrote', out)


if __name__ == '__main__':
    build_teacher_notes()
    build_handover()
    print('Done.')
