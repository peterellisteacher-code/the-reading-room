# Reading Room API proxy

Cloudflare Worker with two routes:

- `POST /iris` → Anthropic Claude Haiku 4.5. Warm scaffolder for the four reading rounds. Anti-sycophancy structural guard via `[EVIDENCE_CHECK_*]` markers. 1-hour ephemeral cache on the ~1500-token system message.
- `POST /plato` → DeepSeek V4 (`deepseek-chat`). Cold gatekeeper for the 5-level persuasion challenge. JSON-schema output, history truncation at 10 turns, automatic prefix caching on system-message equality.

The frontend at `../index.html` calls both. The proxy never returns either key, never logs student text, and enforces guard rails via the system prompts.

## First-time deploy

```bash
cd api/
npm install -g wrangler          # Cloudflare CLI
wrangler login                   # opens browser
wrangler secret put ANTHROPIC_API_KEY
# paste your sk-ant-... key when prompted
wrangler secret put DEEPSEEK_API_KEY
# paste your DeepSeek key when prompted
wrangler deploy
```

`wrangler deploy` prints a URL like `https://reading-room-proxy.<your-subdomain>.workers.dev`. Open `../config.js` and update `API_PROXY_URL` to match. Then commit and push the frontend.

## Optional: rate limiting

```bash
wrangler kv:namespace create RATE_LIMIT_KV
# copy the printed id into wrangler.toml under [[kv_namespaces]]
wrangler deploy
```

The Worker becomes a 30-requests-per-minute-per-IP rate limiter. Without KV bound, it fails open (no rate limit).

## Day-to-day

- Edit `worker.js` (e.g. tune the Iris system prompt) → `wrangler deploy`
- Watch logs: `wrangler tail`
- See cache-hit numbers in `usage.cache_read_input_tokens` on each response

## Costs

**Iris** (Haiku 4.5, text-only, 1h ephemeral cache):
Per student per turn (after the first call warms the cache):
- ~1500 cached input tokens × $0.08/MTok cache-read = $0.00012
- ~50 user-message tokens × $1/MTok input = $0.00005
- ~80 output tokens × $5/MTok = $0.0004

≈ **$0.0006 per turn**. A 4-turn class of 30 students ≈ **$0.07 total** on Iris alone.

**Plato** (DeepSeek V4, automatic prefix caching):
Per student per turn (after the first call warms the cache):
- ~2500 cached input tokens × $0.014/MTok cache-read ≈ $0.000035
- ~60 user-message tokens × $0.14/MTok input ≈ $0.0000084
- ~80 output tokens × $0.28/MTok ≈ $0.0000224

≈ **$0.000066 per turn** — about an order of magnitude cheaper than Iris. A class of 30 averaging 10 Plato turns each ≈ **$0.02 total**.

**Whole game per class of 30:** Iris + Plato ≈ **$0.09**. Workers free tier covers up to 100k requests/day.

## What the Worker does NOT do

- Log student text (no analytics endpoint, no DB write)
- Cache images, audio, or PDFs (text-only by design — caching binary is expensive and the system prompt would balloon)
- Auth — anyone with the URL can hit it. Rely on rate limiting + URL secrecy. If you want auth, gate by a class-shared header token in `worker.js` and add a header check.
