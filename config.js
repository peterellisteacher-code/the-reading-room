// config.js — runtime config for The Reading Room.
// The API_PROXY_URL must point to the Cloudflare Worker that holds the
// ANTHROPIC_API_KEY. NEVER put the API key in this file or anywhere in the
// frontend — the frontend is public and a key here gets stolen the moment
// the site goes live. The Worker holds the key as a Workers Secret.

window.READING_ROOM_CONFIG = {
  // Base URL of the Cloudflare Worker. The Worker dispatches by path:
  //   /iris   → Anthropic Haiku, the warm scaffolder for rounds 1-4
  //   /plato  → DeepSeek V4, the cold gatekeeper for the final challenge
  // While developing locally before deploying, the game still runs — Iris
  // and Plato both show offline-fallback messages.
  API_BASE_URL: 'https://reading-room-proxy.peterellisteacher-code.workers.dev',

  // If true, the game shows a banner explaining offline mode when no Worker
  // is reachable. If false, it silently uses fallback messages.
  SHOW_OFFLINE_BANNER: true,

  // Maximum characters the student can submit per turn. Worker also enforces.
  MAX_RESPONSE_CHARS: 1000,

  // Minimum words required before submit unlocks. Per stress-test
  // recommendation — without this, students submit 10-word responses
  // and finish the game in 17 min.
  MIN_RESPONSE_WORDS: 40,

  // Per-turn API timeout. After this, fall back to canned message.
  API_TIMEOUT_MS: 15000,
};
