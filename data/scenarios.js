// scenarios.js — text-only stimuli for The Reading Room.
// All scenarios are original prose written for this activity. No copyrighted material.
// Inspired by the Batson "Katie Banks" empathy paradigm (Coke, Batson & McDavis 1978)
// which Nussbaum uses in Political Emotions (2013) Ch 6 to anchor her claim that
// trained emotional engagement reveals truths detached observation misses.

window.SCENARIOS = {
  s1_katie: {
    id: 's1_katie',
    title: 'A radio interview with Katie',
    stimulus_kind: 'radio_interview',
    setup: "You're listening to a short interview that played on community radio last week. The presenter, Marlee, is talking with Katie, a second-year university student. Read it once. Take your time.",
    text: `MARLEE: Katie, thanks for coming in. You wrote to us a few weeks ago after we ran that piece on student welfare. Can you tell people a bit about what's been going on?

KATIE: Yeah. Um. Six months ago my parents were in a crash on the way back from my graduation — my older brother's graduation, sorry. They both — they didn't make it. And I've got two younger sisters, Ellie's eleven and Soph is nine, and there's nobody else, really. Mum's sister lives in Perth but she's got her own kids. So I'm kind of doing the mum thing now while I finish my degree.

MARLEE: That's an enormous amount to carry.

KATIE: People keep saying that. I don't know. You just do it. The girls need to eat, they need to get to school, somebody has to sign the permission slips. You just — there isn't a version of this where I sit down and say it's too much.

MARLEE: How are you managing financially?

KATIE: Um. (pause) Sorry. The pension thing has been — there's a payment but it's not — anyway, I'm working three nights at the petrol station, and I've dropped one subject so I'm part-time now. Which means another year on the degree but. (pause) Sorry, what was the question?

MARLEE: Just whether you're managing.

KATIE: Yeah. Yeah, I think so.`,
    response_prompt: "Iris will ask you what you noticed. Take a moment first — what stood out to you about Katie?",
    pedagogical_note: "This is the canonical Batson stimulus, paraphrased and modernised for an Australian context. Round 1 demonstrates Nussbaum's basic claim: imaginative engagement catches what detached listening misses. The pauses and the way Katie cuts herself off are doing the epistemic work."
  },

  s2_jay: {
    id: 's2_jay',
    title: "Jay's text messages",
    stimulus_kind: 'text_messages',
    setup: "Your friend Jay has been quiet for about a week. You sent them a check-in message yesterday. Here's what came back this morning.",
    text: `[Jay, 7:42am]
hey sorry yeah all good

[Jay, 7:43am]
just been a bit busy with stuff

[Jay, 7:43am]
how are you anyway

[Jay, 7:51am]
sorry didn't mean to ignore you the other week

[Jay, 7:51am]
i was just

[Jay, 7:52am]
yeah anyway. you free saturday?`,
    response_prompt: "Iris wants to know what you'd say back. What's actually going on with Jay — and what would you write?",
    pedagogical_note: "Subtext-heavy modern stimulus. The unsent-third-message ('i was just') is the Nussbaum moment — it's where Jay's interior gets visible to a reader who's paying emotional attention. A detached read flattens this to 'Jay is fine but busy.'"
  },

  s3_email: {
    id: 's3_email',
    title: "Mr Doan's email",
    stimulus_kind: 'workplace_email',
    setup: "You're imagining yourself as the deputy principal at a small school. You get this email from one of your senior teachers, Mr Doan, on a Tuesday afternoon.",
    text: `From: Anh Doan
To: Deputy Principal
Subject: Year 11 English — small thing

Hi,

Hope you're well. Just a quick one — could we possibly move my Year 11 class out of Room 14 for the rest of term? I know we did the room rotation in week 2, I'm not trying to redo all of that. Any other room in that block would be fine. Even the library if it's available — I've checked the bookings and there's a window Tuesdays and Fridays.

It's not urgent. Whenever suits.

Thanks for reading.

Anh`,
    response_prompt: "Iris wants to know — what do you think is actually going on here? What would you do?",
    pedagogical_note: "Workplace stimulus where the surface request ('move my classroom') is wrapped in language that reveals something else: 'small thing', 'I know', 'not trying to redo', 'whenever suits', 'thanks for reading'. A detached read takes the request literally. A reader paying emotional attention notices the over-apologising, the double-checking he's done, the carefulness. Something in Room 14 is bothering him and he doesn't feel he can name it."
  },

  s4_hijack: {
    id: 's4_hijack',
    title: "Sam, after the meeting",
    stimulus_kind: 'student_account',
    priming_warning: true,
    priming_text: "Heads-up before you read: Sam has a reputation in this school for exaggerating things to get sympathy. Three teachers this term have raised it. Keep that in mind as you read.",
    setup: "You're a Year 11 form teacher. Sam, one of your students, asked to talk to you after the wellbeing meeting today. Here's what they said.",
    text: `SAM: I just — I don't even know if I want to say anything. You'll think it's nothing.

(pause)

It's just that when Mrs Patel was talking about the survey results, the bit about kids feeling like nobody really sees them at school, I — I sort of felt like she was reading something I'd written. Which is stupid because I didn't write anything, I just ticked the boxes. But it was like — I don't know.

I'm fine. I am. I've got friends and the assignments are fine and I'm not — it's not a thing. I just wanted to say something because I thought maybe it would feel better if I said something. And now I've said it and it sort of doesn't, so. Yeah.

Sorry. This was probably a waste of your time.`,
    response_prompt: "Iris wants to know — what's actually going on with Sam, and what would you say to them?",
    pedagogical_note: "The HIJACK round (Siegel's 'hijacked experience'). The priming line is deliberately misleading — Sam isn't exaggerating; their account is unusually careful and self-deprecating, which is the OPPOSITE of attention-seeking. A reader who lets the prior outrun the text will see 'attention-seeking' where the text shows 'apologising-for-existing'. Nussbaum's claim ALSO has a guardrail: trained emotional perception reads what's actually there, not what we expect to be there. This round teaches that the same emotional attentiveness Nussbaum praises in earlier rounds can be hijacked when we go in primed."
  }
};

// Round → scenario mapping. Round 1 uses Katie; rounds 2 & 3 are practice; round 4 is the hijack.
window.ROUND_SEQUENCE = [
  { round: 1, scenario: 's1_katie', mode: 'first_engagement', minimal_label: 'Round 1' },
  { round: 2, scenario: 's2_jay', mode: 'engaged', minimal_label: 'Round 2' },
  { round: 3, scenario: 's3_email', mode: 'engaged', minimal_label: 'Round 3' },
  { round: 4, scenario: 's4_hijack', mode: 'hijacked', minimal_label: 'Round 4' }
];

// =========================================================================
// PLATO CHALLENGE — five levels of escalating defence (1001-Nights pattern,
// Sun et al. 2023). Pedagogy: convince Plato that emotion can be a route to
// knowledge; he concedes only when each rubric is met.
//
// The student does NOT see these rubric descriptions in the UI. They see only
// Plato's opening objection per level + his hints if they fail. The rubrics
// live in the Worker's PLATO_SYSTEM_PROMPT — these are reproduced here for
// the frontend to display the round label, opening line, and progress UI.
// =========================================================================
window.PLATO_LEVELS = [
  {
    level: 1,
    label: 'Level 1 — name the work',
    plato_opens: 'You spent an hour with four readings tonight. I find this claim — that feeling can know — too vague to attack. Sharpen it. Tell me which of those four readings showed you something feeling alone could see.',
  },
  {
    level: 2,
    label: 'Level 2 — cite the words',
    plato_opens: 'Naming a person is cheap. Anyone can name a name. Show me the actual words — the exact phrase — that taught you something. What did Katie say? What did Jay type? What did Mr Doan write?',
  },
  {
    level: 3,
    label: 'Level 3 — when does feeling reach truth?',
    plato_opens: 'Granted — feeling found a true thing in those words. But your fourth round showed feeling can betray you. So feeling sometimes finds and sometimes betrays. Tell me: under what condition does feeling reach the truth?',
  },
  {
    level: 4,
    label: 'Level 4 — trained vs hijacked',
    plato_opens: 'You speak of training the feeling, like a horseman trains a horse. But the horse still bolts. Show me, using your readings, the difference between a feeling that knew and a feeling that hijacked. Compare them.',
  },
  {
    level: 5,
    label: 'Level 5 — defended position',
    plato_opens: 'Then state your position clearly. When does feeling beat reasoning, and what makes you sure it does in that case? Defend yourself, philosopher. I will concede only to a position you actually hold.',
  },
];

window.PLATO_CONCEDE_TEXT = 'Hmph. You have learned to read what is there. Aristotle was your teacher more than I was today. Go to your reflection — but do not forget: even a trained eye can be deceived if it stops looking. Now leave me to my dialogues.';

// Maximum turns per level before Plato softens. Mirrors the Worker's behaviour.
window.PLATO_MAX_TURNS_PER_LEVEL = 8;
