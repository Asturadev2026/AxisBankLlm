# Axis Bank AI Console — Vercel deploy

Minimal setup. Three files:

- `index.html` — the app (unchanged UI + a small shim that calls `/api/chat`)
- `support.js` — the runtime (loads React from a CDN at runtime)
- `api/chat.js` — one serverless function that calls OpenAI

## Deploy

1. Push this folder to a GitHub repo (or drag-drop into Vercel).
2. Import it in Vercel — no build step, no framework preset needed.
3. In Vercel: **Project → Settings → Environment Variables**, add:
   - Name: `OPENAI_API_KEY`
   - Value: your `sk-...` key
4. Deploy (or redeploy after adding the key).

## Notes

- The model is `gpt-4o-mini` (set in `api/chat.js` — change the `model` line for another).
- The key lives only on the server; it is never sent to the browser.
- **Voice input** uses the browser's built-in Speech Recognition — works in Chrome/Edge over HTTPS (Vercel provides HTTPS automatically). There is no voice *output*.
- If the API ever fails, the app silently falls back to its built-in canned answers for known questions.
