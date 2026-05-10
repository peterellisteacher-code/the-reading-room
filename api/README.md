# Reading Room API proxy

Cloudflare Worker that holds `ANTHROPIC_API_KEY` and forwards student turns to Claude Haiku 4.5 with a stable, byte-identical system prompt (so prompt caching works).

The frontend at `../index.html` calls this proxy. The proxy never returns the key, never logs the student's text, and enforces the anti-sycophancy structural guard via the system prompt.

## First-time deploy

```bash
cd api/
npm install -g wrangler          # Cloudflare CLI
wrangler login                   # opens browser
wrangler secret put ANTHROPIC_API_KEY
# paste your sk-ant-... key when prompted
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

## Costs (Haiku 4.5, text-only, 1h cache)

Per student per turn (after the first call warms the cache):
- ~1500 cached input tokens × $0.08/MTok cache-read = $0.00012
- ~50 user-message tokens × $1/MTok input = $0.00005
- ~80 output tokens × $5/MTok = $0.0004

≈ **$0.0006 per turn**. A 4-turn class of 30 students ≈ **$0.07 total**.
The first call per cache window pays full input price; subsequent calls hit the cache.

## What the Worker does NOT do

- Log student text (no analytics endpoint, no DB write)
- Cache images, audio, or PDFs (text-only by design — caching binary is expensive and the system prompt would balloon)
- Auth — anyone with the URL can hit it. Rely on rate limiting + URL secrecy. If you want auth, gate by a class-shared header token in `worker.js` and add a header check.
