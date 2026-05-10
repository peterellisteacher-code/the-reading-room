// config.js — runtime config for The Reading Room.
// The API_PROXY_URL must point to the Cloudflare Worker that holds the
// ANTHROPIC_API_KEY. NEVER put the API key in this file or anywhere in the
// frontend — the frontend is public and a key here gets stolen the moment
// the site goes live. The Worker holds the key as a Workers Secret.

window.READING_ROOM_CONFIG = {
  // Set this to your deployed Cloudflare Worker URL. While developing locally
  // before deploying, the game still runs — it just shows the offline-fallback
  // message for Iris's responses.
  API_PROXY_URL: 'https://reading-room-proxy.peterellisteacher-code.workers.dev/iris',

  // If true, the game shows a banner explaining offline mode when no Worker
  // is reachable. If false, it silently uses fallback messages.
  SHOW_OFFLINE_BANNER: true,

  // Maximum characters the student can submit per turn. Worker also enforces.
  MAX_RESPONSE_CHARS: 1000,

  // Per-turn API timeout. After this, fall back to canned message.
  API_TIMEOUT_MS: 15000,
};
